using System;using System.Collections.Generic;using System.Diagnostics;using System.Threading;
namespace RichAudio.Beacon.Windows {
 // One preallocated circular lane per writer. Publication is single-writer,
 // with no lock, allocation, pipe or disk access on the discard callback.
 // Receipts are assembled off the callback after shutdown joins.
 internal sealed class GameplayDeliveryTrace01 {
  internal struct Event {
   public string Phase;
   public long Qpc,Sequence,StartQpc,EndQpc;
   public int Before,After,Amount,Aux;
   public double NodeMs,NodeStartMs,NodeRenderMs;
  }
  internal sealed class Lane {
   readonly GameplayDeliveryTrace01 owner;
   readonly Event[] rows=new Event[256];
   int written;
   internal Lane(GameplayDeliveryTrace01 owner){this.owner=owner;}
   internal void Add(Event e){if(Interlocked.Read(ref owner.faultQpc)!=0)return;int n=written;rows[n%rows.Length]=e;Volatile.Write(ref written,n+1);}
   internal Event[] Snapshot(long cutoff){
    int end=Volatile.Read(ref written);var result=new List<Event>(rows.Length);
    for(int i=Math.Max(0,end-rows.Length);i<end;i++){Event e=rows[i%rows.Length];if(e.Qpc!=0&&(cutoff==0||e.Qpc<=cutoff))result.Add(e);}
    return result.ToArray();
   }
  }
  internal readonly Lane Control,Pcm,Producer,Sink,Supervisor,Worker;
  long faultQpc,faultCallbackStartQpc,firstUnderflowFrame=-1,lastAdmission,lastPayload,lastDelivery,admissionGap,payloadGap,callbackLate,sinkDeliveryGap;
  double lastNodeOutput,nodeOutputGap,nodeWriteMax,nodeRenderMax;int nodeDrops,nodeMalformed,faultPendingCredits;
  object firstHardRenderMiss;
  internal GameplayDeliveryTrace01(){Control=new Lane(this);Pcm=new Lane(this);Producer=new Lane(this);Sink=new Lane(this);Supervisor=new Lane(this);Worker=new Lane(this);}
  internal static Event Row(string phase,long sequence,long qpc,long start=0,long end=0,int before=0,int after=0,int amount=0,int aux=0){
   return new Event{Phase=phase,Sequence=sequence,Qpc=qpc,StartQpc=start,EndQpc=end,Before=before,After=after,Amount=amount,Aux=aux};
  }
  static void Gap(ref long last,ref long maximum,long now){if(last!=0)maximum=Math.Max(maximum,now-last);last=now;}
  internal void Payload(long seq,long before,long after,int depth){
   if(Interlocked.Read(ref faultQpc)!=0)return;
   Gap(ref lastPayload,ref payloadGap,after);Pcm.Add(Row("pcm-payload-read",seq,after,before,after,depth));
  }
  internal void Admit(long seq,long before,long after,int depth,int frames){
   if(Interlocked.Read(ref faultQpc)!=0)return;
   Gap(ref lastAdmission,ref admissionGap,after);Pcm.Add(Row("pcm-admitted",seq,after,before,after,0,depth,frames));
  }
  internal void Callback(long number,long due,long start,long end,int requested,int supplied,int missing,int before,int after,long first,long deliveredFrame,int pendingCredits){
   if(Interlocked.Read(ref faultQpc)!=0)return;
   callbackLate=Math.Max(callbackLate,start-due);
   // Consecutive blocks can first appear in the same callback. Measure
   // distinct callback start times that deliver a new producer block.
   if(supplied>0&&(deliveredFrame+511)/512<=(deliveredFrame+supplied-1)/512)Gap(ref lastDelivery,ref sinkDeliveryGap,start);
   // StartQpc is due time for this event, Qpc is actual start.
   Sink.Add(Row("sink-callback",number,start,due,end,before,after,requested,supplied));
   // Frames and producer sequence are separate from callback numbering.
   Sink.Add(Row("sink-delivery",deliveredFrame/512,start,0,0,0,0,missing,(int)(deliveredFrame%512)));
   if(missing>0){firstUnderflowFrame=first;faultCallbackStartQpc=start;faultPendingCredits=pendingCredits;Interlocked.Exchange(ref faultQpc,end);}
  }
  internal void Node(Event e,int dropped){
   if(Interlocked.Read(ref faultQpc)!=0)return;
   nodeDrops=Math.Max(nodeDrops,dropped);
   if(e.Phase=="stdout-attempt")nodeRenderMax=Math.Max(nodeRenderMax,e.NodeRenderMs);
   if(e.Phase=="stdout-complete"){
    if(lastNodeOutput!=0)nodeOutputGap=Math.Max(nodeOutputGap,e.NodeMs-lastNodeOutput);
    lastNodeOutput=e.NodeMs;nodeWriteMax=Math.Max(nodeWriteMax,e.NodeMs-e.NodeStartMs);
   }
   Producer.Add(e);
  }
  internal void InvalidNodeRow(){if(Interlocked.Read(ref faultQpc)==0)nodeMalformed++;}
  internal void HardRenderMiss(long receivedQpc,Dictionary<string,object> row){
   if(firstHardRenderMiss==null&&Interlocked.Read(ref faultQpc)==0)
    firstHardRenderMiss=new{receivedQpc,producer=row};
  }
  static double Ms(long qpc){return qpc*1000d/Stopwatch.Frequency;}
  internal bool Underflow{get{return Interlocked.Read(ref faultQpc)!=0;}}
  internal object Snapshot(string session,int hostPid,int producerPid,int startup,int steady,long admitted,long consumed,long issued,int retired,bool prepared){
   long stop=Interlocked.Read(ref faultQpc);
   return new{schema=2,session,hostPid,producerPid,frequency=Stopwatch.Frequency,firstUnderflowQpc=stop==0?(long?)null:faultCallbackStartQpc,freezeQpc=stop==0?(long?)null:stop,firstUnderflowFrame,
    clockScope="Host event QPC and Node performance milliseconds are independent. Join blocks by sequence and credit batches by credit ID.",
    fieldScope="Credit rows carry batch ID in Sequence; sink-callback Amount/Aux are requested/supplied, sink-delivery Amount/Aux are missing/offset. Before/After are ring frames unless the credit phase supplies credit counts.",
    startupWindow=startup,steadyWindow=steady,admittedBlocks=admitted,consumedFrames=consumed,issuedCredits=issued,retiredCredits=retired,sourcePrepared=prepared,
    pendingReturnedCreditsAtFault=stop==0?(int?)null:faultPendingCredits,firstHardRenderMiss,
    maxima=new{completeRenderMs=nodeRenderMax,stdoutCompletionDurationMs=nodeWriteMax,stdoutCompletionIntervalMs=nodeOutputGap,hostPayloadIntervalMs=Ms(payloadGap),ringAdmissionIntervalMs=Ms(admissionGap),sinkCallbackLatenessMs=Ms(callbackLate),endToEndBlockDeliveryIntervalMs=Ms(sinkDeliveryGap),producerDiagnosticRowsDropped=nodeDrops,producerDiagnosticRowsMalformed=nodeMalformed},
    control=Control.Snapshot(stop),pcm=Pcm.Snapshot(stop),producer=Producer.Snapshot(stop),sink=Sink.Snapshot(stop),supervisor=Supervisor.Snapshot(stop),worker=Worker.Snapshot(stop)};
  }
 }
 // A scheduled fake callback consumes one chunk. A delayed test thread is not
 // a hardware device that consumed an arbitrary backlog while it was asleep.
 // Defer missed periods explicitly; never issue an unbounded catch-up burst.
 internal sealed class GameplayFixtureCadence01 {
  long origin,deferred,maximumLate;readonly long period;int delayed;
  internal GameplayFixtureCadence01(long start,long frequency){origin=start;period=frequency/50;}
  internal long Due(long callback){return origin+callback*period;}
  internal long Begin(long callback,long now){long due=Due(callback),late=Math.Max(0,now-due);if(late>maximumLate)Interlocked.Exchange(ref maximumLate,late);if(late>=period){origin+=late;Interlocked.Add(ref deferred,late);Interlocked.Increment(ref delayed);}return due;}
  internal object Snapshot(){return new{callbackFrames=960,nominalPeriodMilliseconds=20,deferredCallbacks=Thread.VolatileRead(ref delayed),deferredQpcTicks=Interlocked.Read(ref deferred),maximumLatenessQpcTicks=Interlocked.Read(ref maximumLate),scope="Device-free scheduled callbacks only; deferred wall time is not rendered audio or hardware underrun qualification"};}
 }
 // Device-free sink measurements only. Never instantiated on the WASAPI route.
 // Bounded metadata, no PCM copy/WAV/endpoint, no lock on a real audio callback.
 internal sealed class GameplayFixtureLatency {
  struct Progress01 {internal string phase;internal long sequence,first,last,aux;internal int buffered,amount;internal double nodeMs;}
  readonly Progress01[] recent01=new Progress01[128];int cursor01,count01;bool frozen01;long firstUnderflowQpc01,firstUnderflowFrame01,sourceLease01,sourceObservation01;bool stopIntent01;
  internal void Progress(string phase,long sequence,long first,long last,int buffered,int amount,long aux=0,double nodeMs=0){lock(gate){if(frozen01)return;recent01[cursor01]=new Progress01{phase=phase,sequence=sequence,first=first,last=last,buffered=buffered,amount=amount,aux=aux,nodeMs=nodeMs};cursor01=(cursor01+1)%recent01.Length;count01=Math.Min(count01+1,recent01.Length);}}
  internal void Callback01(long sequence,long due,long before,long after,int requested,int supplied,int bufferedBefore,int bufferedAfter,bool underflow,long frame,bool stopping,long lease,long observation){lock(gate){Progress("callback",sequence,due,before,bufferedBefore,supplied,after);if(underflow&&!frozen01){firstUnderflowQpc01=before;firstUnderflowFrame01=frame;stopIntent01=stopping;sourceLease01=lease;sourceObservation01=observation;frozen01=true;}}}
  internal object FirstUnderflow01(){lock(gate){if(!frozen01)return null;var rows=new List<object>();for(int i=0;i<count01;i++){var e=recent01[(cursor01-count01+i+recent01.Length)%recent01.Length];rows.Add(new{phase=e.phase,sequence=e.sequence,firstQpc=e.first,lastQpc=e.last,bufferedFrames=e.buffered,amount=e.amount,aux=e.aux,nodeMilliseconds=e.nodeMs});}return new{schema=1,clock="host-Stopwatch-QPC",frequency=Stopwatch.Frequency,firstUnderflowQpc=firstUnderflowQpc01,firstUnderflowFrame=firstUnderflowFrame01,shutdownRequested=stopIntent01,sourceLeaseQpc=sourceLease01,lastSnapshotQpc=sourceObservation01,eventLimit=recent01.Length,events=rows,nodeClockScope="Node milliseconds are not subtracted from host QPC; associate by producer block sequence"};}}
  const int Capacity=12000;readonly long[] admission=new long[Capacity],submission=new long[Capacity],older=new long[Capacity],newer=new long[Capacity];readonly object gate=new object();int omitted,mappingCount;double mappingMinimum=Double.PositiveInfinity,mappingMaximum=Double.NegativeInfinity;long steadyAt,firstAdmission,firstSubmission,firstSubmissionFrame;object firstPoseMapping;
  internal void EnterSteady(long ticks){lock(gate){if(steadyAt==0)steadyAt=ticks;}}
  int Index(long frame){return frame>=0&&frame/512<Capacity?(int)(frame/512):-1;}
  internal void Admission(long frame,long ticks){lock(gate){int i=Index(frame);if(i>=0){admission[i]=ticks;if(firstAdmission==0)firstAdmission=ticks;}else omitted++;}}
  internal void Producer(Dictionary<string,object> p,long receivedAt){lock(gate){int i=Index(Convert.ToInt64(p["producerFrameStart"]));if(i<0){omitted++;return;}object raw;if(!p.TryGetValue("sourceBrackets",out raw))return;foreach(object item in (object[])raw){var b=item as Dictionary<string,object>;if(b==null||Convert.ToInt64(b["clockFrequency"])!=Stopwatch.Frequency)continue;if(b["interpolation"]!=null&&b["rightObservationTicks"]!=null&&p["sourceTargetTimeSeconds"]!=null){double left=Convert.ToDouble(b["leftObservationTicks"]),right=Convert.ToDouble(b["rightObservationTicks"]),u=Convert.ToDouble(b["interpolation"]),frequency=Convert.ToDouble(b["clockFrequency"]),target=Convert.ToDouble(p["sourceTargetTimeSeconds"]);double mapping=target-(left+(right-left)*u)/frequency;mappingCount++;mappingMinimum=Math.Min(mappingMinimum,mapping);mappingMaximum=Math.Max(mappingMaximum,mapping);if(firstPoseMapping==null)firstPoseMapping=new{producerFrameStart=Convert.ToInt64(p["producerFrameStart"]),receivedHostQpc=receivedAt,sourceTargetTimeSeconds=target,leftObservationTicks=left,rightObservationTicks=right,interpolation=u,clockFrequency=frequency,sourceToAudioOffsetSeconds=target-(left+(right-left)*u)/frequency,scope="First valid interpolated vehicle POSE bracket; common producer-audio/host-QPC mapping, not native acquisition or speaker clock"};}older[i]=Convert.ToInt64(b["leftObservationTicks"]);if(b["rightObservationTicks"]!=null)newer[i]=Convert.ToInt64(b["rightObservationTicks"]);break;}}}
  internal void Submission(long frame,int frames,long ticks){lock(gate){if(firstSubmission==0){firstSubmission=ticks;firstSubmissionFrame=frame;}for(long at=frame/512*512;at<frame+frames;at+=512){int i=Index(at);if(i>=0&&submission[i]==0)submission[i]=ticks;}}}
  static object Stats(List<double>a){if(a.Count==0)return null;a.Sort();Func<double,double> q=p=>{double x=(a.Count-1)*p;int i=(int)x,j=(int)Math.Ceiling(x);return a[i]+(a[j]-a[i])*(x-i);};double sum=0;foreach(double x in a)sum+=x;return new{count=a.Count,minimumMs=a[0],medianMs=q(.5),p95Ms=q(.95),p99Ms=q(.99),maximumMs=a[a.Count-1],meanMs=sum/a.Count};}
  internal object Snapshot(){lock(gate){var residence=new List<double>();var steadyResidence=new List<double>();var oldAge=new List<double>();var newAge=new List<double>();for(int i=0;i<Capacity;i++)if(submission[i]>0){if(admission[i]>0&&submission[i]>=admission[i]){residence.Add((submission[i]-admission[i])*1000d/Stopwatch.Frequency);if(steadyAt>0&&admission[i]>=steadyAt)steadyResidence.Add((submission[i]-admission[i])*1000d/Stopwatch.Frequency);}if(older[i]>0)oldAge.Add((submission[i]-older[i])*1000d/Stopwatch.Frequency);if(newer[i]>0)newAge.Add((submission[i]-newer[i])*1000d/Stopwatch.Frequency);}return new{scope="Actual Node/RA07/production ring with authored observations and device-free sink only",clockDomain="fixture-host-Stopwatch-QPC",firstRingAdmissionQpc=firstAdmission,firstFakeSubmissionQpc=firstSubmission,firstFakeSubmissionProducerFrame=firstSubmissionFrame,firstValidPoseClockMapping=firstPoseMapping,poseMappingSamples=mappingCount,poseMappingMinimumOffsetSeconds=mappingCount==0?(double?)null:mappingMinimum,poseMappingMaximumOffsetSeconds=mappingCount==0?(double?)null:mappingMaximum,poseMappingOffsetSpreadMs=mappingCount==0?(double?)null:(mappingMaximum-mappingMinimum)*1000,ringAdmissionToFirstFixtureSubmission=Stats(residence),steadyRingAdmissionToFirstFixtureSubmission=Stats(steadyResidence),steadyWindowAtQpc=steadyAt,submissionPoint="Host QPC immediately after fake Fill returns; first overlapping callback, not endpoint/speaker",olderPoseObservationAgeAtFixtureSubmission=Stats(oldAge),newerPoseObservationAgeAtFixtureSubmission=Stats(newAge),metadataCapacityBlocks=Capacity,metadataBytes=Capacity*4*8,omittedBlocks=omitted,physicalLatencyMeasured=false,ringAlreadyIncludedInObservationAges=true};}}
 }
}
