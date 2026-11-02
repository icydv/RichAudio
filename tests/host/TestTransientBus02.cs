using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Reflection;using System.Threading;using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;
internal static class TestTransientBus02 {
 static int checks,cancellationRounds,cancellationReceipts,inFlightObservations;static void Need(bool b,string s){checks++;if(!b)throw new Exception(s);}
 static readonly long F=10000000,E=100000000;
 static PreparedTransientBus Bus(){var b=new PreparedTransientBus(1,2,.95);for(int s=0;s<8;s++){var p=new float[2048];p[480*2]=.001f;p[480*2+1]=-.001f;p[960*2]=.00025f;p[960*2+1]=.00025f;b.Register(s,new PreparedTransientKernel(p,1024,480,960,s+1,1,1,1,1,480));}b.Seal(new SyntheticPresentationClock(E,F,0));return b;}
 static PreparedTransientEvent Event(int id,int source,long observed,long occurrence,int priority=0){return new PreparedTransientEvent{EventId=id,SourceSequence=id,SourceId=source,SourceGeneration=1,KernelSlot=source-1,KernelGeneration=1,SceneGeneration=1,ListenerGeneration=1,Priority=priority,OccurrenceLowerQpc=occurrence,OccurrenceUpperQpc=occurrence,AcquisitionBeforeQpc=observed,ObservationAfterQpc=observed,Frequency=F,MaximumLatenessFrames=2400,SessionLow=1,SessionHigh=2};}
 static void Throws(Action f,string s){bool yes=false;try{f();}catch(ArgumentException){yes=true;}catch(InvalidOperationException){yes=true;}catch(InvalidDataException){yes=true;}Need(yes,s);}
 static void ValidateNoAllocationOpcodes(){var methods=new List<MethodInfo>();foreach(string name in new[]{"Mix","MixCore","CommitSubmission","AdmitOnConsumer","FreeVoice","Cancel"})methods.Add(typeof(PreparedTransientBus).GetMethod(name,BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance));
  methods.Add(typeof(PreparedTransientBus).GetNestedType("Lane",BindingFlags.NonPublic).GetMethod("Pop",BindingFlags.Instance|BindingFlags.NonPublic));
  methods.Add(typeof(OwnedPcmSubmission).GetMethod("Fill",BindingFlags.Public|BindingFlags.Static));
  foreach(var m in methods){Need(m!=null,"expected callback helper exists");string name=m.DeclaringType.FullName+"."+m.Name;byte[] il=m.GetMethodBody().GetILAsByteArray();
   // Decode operand widths rather than searching raw token bytes for opcodes.
   var one=new Dictionary<byte,System.Reflection.Emit.OpCode>();var two=new Dictionary<byte,System.Reflection.Emit.OpCode>();foreach(var f in typeof(System.Reflection.Emit.OpCodes).GetFields(BindingFlags.Public|BindingFlags.Static)){var op=(System.Reflection.Emit.OpCode)f.GetValue(null);if(op.Size==1)one[(byte)op.Value]=op;else two[(byte)op.Value]=op;}
   for(int at=0;at<il.Length;){var op=il[at++]==0xfe?two[il[at++]]:one[il[at-1]];Need(op!=System.Reflection.Emit.OpCodes.Newobj&&op!=System.Reflection.Emit.OpCodes.Newarr&&op!=System.Reflection.Emit.OpCodes.Box,"selected callback helper has no allocation opcode: "+name);
    switch(op.OperandType){case System.Reflection.Emit.OperandType.InlineNone:break;case System.Reflection.Emit.OperandType.ShortInlineBrTarget:case System.Reflection.Emit.OperandType.ShortInlineI:case System.Reflection.Emit.OperandType.ShortInlineVar:at++;break;case System.Reflection.Emit.OperandType.InlineVar:at+=2;break;case System.Reflection.Emit.OperandType.InlineI8:case System.Reflection.Emit.OperandType.InlineR:at+=8;break;case System.Reflection.Emit.OperandType.InlineSwitch:int n=BitConverter.ToInt32(il,at);at+=4+4*n;break;default:at+=4;break;}
   }
  }}
 static void ValidateCancellationCompletionGuards(){
  var inFlight=typeof(PreparedTransientBus).GetField("inFlight",BindingFlags.Instance|BindingFlags.NonPublic);
  var callback=typeof(PreparedTransientBus).GetField("callbackGate",BindingFlags.Instance|BindingFlags.NonPublic);
  Need(inFlight!=null&&callback!=null,"completion handshake state is inspectable by the device-free test");
  // Controlled state tests are explicit: they exercise refusal/completion,
  // not an invented claim that a real callback was stalled at this point.
  var pending=Bus();Need(pending.TryAdmit(Event(1,1,E,E),E),"pending admission case queued");inFlight.SetValue(pending,1);
  Need(!pending.FinishCancellation(0),"unfinished admission cannot certify cancellation completion");
  Need(pending.Stopped&&pending.Queued==1&&pending.Receipt(1).Status==1,"failed completion leaves the pending queue for its owner");
  inFlight.SetValue(pending,0);Need(pending.FinishCancellation(100)&&pending.Queued==0&&pending.Receipt(1).Status==-5,"joined admission can be finalized off callback");
  var occupied=Bus();Need(occupied.TryAdmit(Event(1,1,E,E),E),"occupied callback case queued");callback.SetValue(occupied,1);
  Need(!occupied.FinishCancellation(0),"occupied callback gate cannot certify cancellation completion");
  Need(occupied.Queued==1&&occupied.Receipt(1).Status==1,"failed callback completion does not consume concurrently owned state");
  callback.SetValue(occupied,0);Need(occupied.FinishCancellation(100)&&occupied.Queued==0&&occupied.Receipt(1).Status==-5,"released callback gate permits final drain");
 }
 static unsafe void ValidateConcurrentCancellation(){
  var inFlight=typeof(PreparedTransientBus).GetField("inFlight",BindingFlags.Instance|BindingFlags.NonPublic);
  for(int round=0;round<16;round++){
   var bus=Bus();var accepted=new bool[PreparedTransientBus.MaximumEvents+1];int stop=0,callbackCount=0;Exception producerError=null,consumerError=null;
   using(var primed=new ManualResetEvent(false))using(var race=new ManualResetEvent(false))using(var firstCallback=new ManualResetEvent(false)){
    var producer=new Thread(delegate(){try{
     for(int id=1;id<=32;id++)accepted[id]=bus.TryAdmit(Event(id,1+(id%2),E,E,id%2),E);
     primed.Set();if(!race.WaitOne(3000))throw new TimeoutException("cancellation race release");
     // Unique bounded events first; continued duplicate attempts keep the
     // ingress handshake active until cancellation without an extra producer.
     for(int attempt=33;attempt<=1000000&&Thread.VolatileRead(ref stop)==0;attempt++){
      int id=Math.Min(attempt,PreparedTransientBus.MaximumEvents);bool ok=bus.TryAdmit(Event(id,1+(id%2),E,E,id%2),E);if(ok)accepted[id]=true;
     }
    }catch(Exception e){producerError=e;primed.Set();}}){IsBackground=true};
    var consumer=new Thread(delegate(){try{
     if(!race.WaitOne(3000))throw new TimeoutException("callback race release");var buffer=new float[4096];long frame=0;
     for(int n=0;n<256&&Thread.VolatileRead(ref stop)==0;n++){
      Array.Clear(buffer,0,buffer.Length);bool mixed;fixed(float* p=buffer)mixed=bus.Mix(p,2048,frame,1);
      if(!mixed)throw new Exception("unexpected callback gate/argument fault during single-consumer race");
      bus.CommitSubmission(E+n*100,E+n*100+1);frame+=2048;Interlocked.Increment(ref callbackCount);firstCallback.Set();Thread.Yield();
     }
    }catch(Exception e){consumerError=e;firstCallback.Set();}}){IsBackground=true};
    producer.Start();consumer.Start();try{
     Need(primed.WaitOne(3000),"single ingress producer publishes before cancellation race");race.Set();
     Need(firstCallback.WaitOne(3000),"single submission consumer participates in cancellation race");
     // Sampling is diagnostic only; scheduling cannot guarantee every machine
     // observes this short window. The controlled guard tests above cover it.
     for(int n=0;n<64;n++)if((int)inFlight.GetValue(bus)!=0){inFlightObservations++;break;}
     bus.Cancel();
    }finally{Thread.VolatileWrite(ref stop,1);race.Set();Need(producer.Join(3000),"ingress joined before final cancellation drain");Need(consumer.Join(3000),"consumer joined before final cancellation drain");}
    Need(producerError==null&&consumerError==null,"concurrent cancellation workers complete without exception");Need(callbackCount>0,"race exercised an actual callback");
    Need(bus.FinishCancellation(1000)&&bus.Queued==0,"joined cancellation leaves no queued descriptors");
    for(int id=1;id<accepted.Length;id++)if(accepted[id]){var r=bus.Receipt(id);Need(r.Status==3||r.Status<=-2,"every accepted event has a final submitted/rejected/cancelled outcome");cancellationReceipts++;}
    var snapshot=bus.Receipt(1);int status=snapshot.Status;snapshot.Status=12345;snapshot.FirstOutputFrame=999999;
    Need(bus.Receipt(1).Status==status&&bus.Receipt(1).FirstOutputFrame!=999999,"receipt copy cannot mutate final callback state");
    Need(!bus.TryAdmit(Event(PreparedTransientBus.MaximumEvents,8,E,E),E)&&bus.Queued==0,"final cancellation remains closed to admission");
    cancellationRounds++;
   }
  }
 }
 static unsafe void Run(){
  var a=new PcmRing();var b=new PcmRing();var marker=new float[1024];for(int i=0;i<marker.Length;i++)marker[i]=(float)Math.Sin(i*.023)*.1f;
  for(int i=0;i<8;i++){Need(a.TryWrite(marker,512),"old ring prefill");Need(b.TryWrite(marker,512),"new stage prefill");}
  var x=new float[2112];var y=new float[2112];long frame=0;foreach(int n in new[]{1056,480,512,1,767}){fixed(float* p=x)fixed(float* q=y){a.FillCalibrated(p,n,1);OwnedPcmSubmission.Fill(b,q,n,1,true,frame,null);}for(int i=0;i<n*2;i++)Need(x[i]==y[i],"null event path preserves every continuous float");Need(a.TakeCredits()==b.TakeCredits(),"default credits unchanged");Need(a.BufferedFrames==b.BufferedFrames,"default ring depth unchanged");frame+=n;}
  var bus=Bus();var output=new float[4096];Need(bus.TryAdmit(Event(1,1,E,E),E),"original impulse admitted");fixed(float* p=output)Need(bus.Mix(p,960,0,1),"first output buffer");Need(output[960]==.001f&&output[961]==-.001f,"physical onset remains at480frames");Need(output[0]==0&&bus.Receipt(1).FirstOutputFrame==480,"no early or duplicate direct onset");Need(bus.Receipt(1).Status==2,"mix is not submission completion");bus.CommitSubmission(E,E+100);Need(bus.Receipt(1).Status==3&&bus.Receipt(1).SubmissionAfterQpc==E+100,"only explicit commit certifies submission");Need(!bus.TryAdmit(Event(1,1,E+1000,E),E+1000),"duplicate event rejected");
  Array.Clear(output,0,output.Length);fixed(float* p=output)Need(bus.Mix(p,960,960,1),"tail callback");Need(output[0]==.00025f,"original second pulse relative timing preserved");
  var late=Bus();Array.Clear(output,0,output.Length);fixed(float* p=output)late.Mix(p,960,0,1);var ev=Event(2,1,E+F/1000,E);Need(late.TryAdmit(ev,E+F/1000),"late but bounded event received");fixed(float* p=output)late.Mix(p,960,960,1);Need(late.Receipt(2).FirstOutputFrame==960&&late.Receipt(2).LatenessFrames==480,"whole kernel shifted to first uncommitted frame; timing remains explicit");Need(late.Receipt(2).ObservationAfterQpc==E+F/1000,"observed timestamp never rewritten");
  var expired=Bus();fixed(float* p=output)expired.Mix(p,960,0,1);var noLate=Event(3,1,E,E);noLate.MaximumLatenessFrames=0;Need(expired.TryAdmit(noLate,E),"deadline event queued");fixed(float* p=output)expired.Mix(p,960,960,1);Need(expired.Receipt(3).Status==-3,"deadline miss rejected rather than clipped onset");
  var priority=Bus();for(int i=1;i<=24;i++)Need(priority.TryAdmit(Event(i,1,E,E,1),E),"bounded impact admitted");for(int i=25;i<=32;i++)Need(priority.TryAdmit(Event(i,2,E,E,0),E),"reserved priority shot admitted");Array.Clear(output,0,output.Length);fixed(float* p=output)priority.Mix(p,960,0,1);Need(priority.PeakActive==32&&priority.VoiceCapacityRejected==0,"simultaneous original impacts and shots bounded");Need(priority.MaximumMixedPeak<=.0320001,"32coherent impulses fit declared event headroom");
  var flood=Bus();for(int i=1;i<=64;i++)Need(flood.TryAdmit(Event(i,1,E,E,1),E),"normal lane bounded admission");Need(!flood.TryAdmit(Event(65,1,E,E,1),E)&&flood.QueueFull==1,"full low-priority lane backpressures");Need(flood.TryAdmit(Event(66,2,E,E,0),E),"low-priority flood cannot block independent high lane");Array.Clear(output,0,output.Length);fixed(float* p=output)flood.Mix(p,960,0,1);Need(flood.Receipt(66).FirstOutputFrame==480,"priority shot retains onset while low lane overloaded");
  var stale=Bus();Need(!stale.TryAdmit(Event(1,1,E,E),E+F/4+1),"original250msreceipt gate strict");var wrong=Event(2,1,E,E);wrong.SourceGeneration=2;Need(!stale.TryAdmit(wrong,E),"source generations exact");wrong=Event(3,1,E,E);wrong.SessionLow=3;Need(!stale.TryAdmit(wrong,E),"session exact");wrong=Event(4,1,E,E+1);Need(!stale.TryAdmit(wrong,E),"no future occurrence");
  var zero=Bus();var firstZero=Event(1,1,E,E);firstZero.SourceSequence=0;Need(zero.TryAdmit(firstZero,E),"first source sequence zero valid cross-language contract");var external=zero.Receipt(1);external.Status=99;Need(zero.Receipt(1).Status==1,"receipt snapshots cannot mutate admission state");Need(zero.FinishCancellation(100)&&zero.Receipt(1).Status==-5&&zero.Queued==0,"off-callback completion closes ingress and drains terminal receipts");Need(!zero.TryAdmit(Event(2,1,E,E),E),"completed cancellation never reopens");
  var mute=Bus();Need(mute.TryAdmit(Event(1,1,E,E),E),"muted event queued");Array.Clear(output,0,output.Length);fixed(float* p=output)mute.Mix(p,960,0,0);Need(mute.Receipt(1).Status==-7,"mute retires event instead of deferring it");fixed(float* p=output)mute.Mix(p,960,960,1);Need(mute.Receipt(1).FirstOutputFrame==-1,"unmute cannot replay muted event");
  var cancelled=Bus();Need(cancelled.TryAdmit(Event(1,1,E,E),E),"cancel case queued");cancelled.Cancel();fixed(float* p=output)cancelled.Mix(p,960,0,1);Need(cancelled.Receipt(1).Status==-5&&!cancelled.TryAdmit(Event(2,1,E,E),E),"source/session cancellation is terminal");
  var breach=Bus();output[0]=.96f;fixed(float* p=output)Need(!breach.Mix(p,960,0,1),"event bus fails closed on undeclared continuous headroom");Need(output[0]==.96f,"headroom fault never mutes unrelated continuous PCM");
  var bytes=new byte[144];Throws(()=>TransientEventProtocol.Decode(bytes,0),"malformed framing rejected on worker");
  Need(SharedPeriodPlan.IsLegal(128,63,513,64,512),"queried min/max need not be fundamental multiples");Need(SharedPeriodPlan.IsLegal(64000,64,128001,64,64000),"no arbitrary one-second SDK legality cap");
  var uncertain=Bus();var timed=Event(1,1,E,E);timed.UncertaintyFrames=48;Need(uncertain.TryAdmit(timed,E),"explicit clock uncertainty admitted");Array.Clear(output,0,output.Length);fixed(float* p=output)uncertain.Mix(p,960,0,1);Need(uncertain.Receipt(1).FirstOutputFrame==528,"clock uncertainty shifts complete direct/reflected kernel conservatively once");
  var invalidTime=Bus();timed=Event(1,1,E+F/100,E);timed.OccurrenceLowerQpc=E-1;timed.OccurrenceUpperQpc=E+F*2/1000;Need(!invalidTime.TryAdmit(timed,E+F/100),"event occurrence interval wider than2ms rejected");
  Need(SharedPeriodPlan.IsLegal(128,64,512,64,512),"pure legal queried period plan");Need(!SharedPeriodPlan.IsLegal(100,64,512,64,512),"no silent rounding or lower endpoint assumption");Need(!SharedPeriodPlan.IsLegal(32,64,512,64,512),"period below returned minimum rejected");ValidateCancellationCompletionGuards();ValidateConcurrentCancellation();ValidateNoAllocationOpcodes();
 }
 public static int Main(){try{Run();Console.WriteLine(new JavaScriptSerializer().Serialize(new{passed=true,checks,cancellationStressRounds=cancellationRounds,cancellationTerminalReceipts=cancellationReceipts,sampledInFlightAdmissionWindows=inFlightObservations,allocationCoverage="Mix/MixCore/CommitSubmission/AdmitOnConsumer/FreeVoice/Cancel/Lane.Pop/OwnedPcmSubmission.Fill IL; selected helpers, not BCL/JIT allocation certification",scope="Device-free synthetic late-mix/native ring safety; no endpoint/GTA/recording",physicalLatencyMeasured=false}));return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
