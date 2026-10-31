using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using Rage;
using Rage.Attributes;
using Rage.Native;

[assembly:Plugin("RichAudio Operating State Probe",Author="RichAudio",Description="Separately authorised read-only Bati measurement. No audio or gameplay changes.",EntryPoint="RichAudio.Telemetry.Probe.OperatingStateProbe.Main",ExitPoint="RichAudio.Telemetry.Probe.OperatingStateProbe.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
namespace RichAudio.Telemetry.Probe
{
 public static class OperatingStateProbe
 {
  const uint BatiModel=0xf9300cc5;
  const int MaximumRecords=2400,CaptureSeconds=120,TotalSeconds=150,WriterSeconds=10;
  // Published NativeDB, immutable revision 424fb51b089049a9fbcebcc641500b1d44d255b4.
  // These build-3095 entries have empty comments: their Enhanced semantics remain
  // unvalidated. Record the raw returns; do not infer units, scaling or RPM.
  const ulong ThrottleHash=0x92D96892FC06AF22UL;
  const ulong GearHash=0x56185A25D45A0DCDUL;
  const ulong RevRatioHash=0xF9DDA40BC293A61EUL;
  static readonly string[] Phases={"requested-engine-off","requested-stationary-idle","requested-stationary-throttle-where-supported","requested-acceleration","requested-gear-changes","requested-deceleration"};
  static readonly Sample[] Samples=new Sample[MaximumRecords];
  static readonly object PublicationGate=new object();
  static readonly ManualResetEvent CaptureDone=new ManualResetEvent(false),WriterDone=new ManualResetEvent(false);
  static readonly CultureInfo Invariant=CultureInfo.InvariantCulture;
  static readonly string Session=Guid.NewGuid().ToString("N");
  static int stop,unloading,published;
  static long started,captureStarted,missedSlots,lateSamples,slowBatches,maximumBatchTicks,unpublishedBatches;
  static string terminalReason,writerError;
  static Thread writer,watchdog;

  // These diagnostics are written only to the private local capture. Never
  // publish raw messages/stacks: framework exceptions can contain local paths.
  sealed class Failure
  {
   internal string Type,Message,StackTrace;internal int HResult;internal Failure Inner;
   static string Bound(string value,int maximum){return value==null?null:(value.Length<=maximum?value:value.Substring(0,maximum));}
   internal static Failure From(Exception error,int depth)
   {
    if(error==null||depth>=3)return null;
    return new Failure{Type=Bound(error.GetType().FullName,256),Message=Bound(error.Message,512),HResult=error.HResult,StackTrace=Bound(error.StackTrace,1024),Inner=From(error.InnerException,depth+1)};
   }
  }

  sealed class Reading
  {
   internal double? Value;internal string Classification;internal Failure Error;
   internal static Reading NotRead(){return new Reading{Value=null,Classification="not-read-after-earlier-native-failure"};}
   internal bool Failed(){return Classification.StartsWith("getter-exception:",StringComparison.Ordinal);}
   internal static Reading Get(Func<double> getter,bool documentedRatio)
   {
    try{
     double value=getter();string classification;
     if(Double.IsNaN(value))classification="nan";
     else if(Double.IsPositiveInfinity(value))classification="positive-infinity";
     else if(Double.IsNegativeInfinity(value))classification="negative-infinity";
     else return new Reading{Value=value,Classification=documentedRatio?(value>=0&&value<=1?"finite-within-documented-rph-ratio-range":"finite-outside-documented-rph-ratio-range"):"finite-contract-unvalidated"};
     return new Reading{Value=null,Classification=classification};
    }catch(ThreadAbortException){throw;}
    catch(Exception error){return new Reading{Value=null,Classification="getter-exception:"+error.GetType().Name,Error=Failure.From(error,0)};}
   }
  }
  sealed class BooleanReading
  {
   internal bool? Value;internal string Classification;internal Failure Error;
   internal static BooleanReading Get(Func<bool> getter){try{return new BooleanReading{Value=getter(),Classification="observed-rph-boolean"};}catch(ThreadAbortException){throw;}catch(Exception error){return new BooleanReading{Value=null,Classification="getter-exception:"+error.GetType().Name,Error=Failure.From(error,0)};}}
  }
  sealed class Sample
  {
   internal int Slot,Phase;internal uint Handle;internal long Before,After;internal bool Paused;
   internal Reading RphRatio,NativeRevRatio,NativeThrottle,RphGear,NativeGear,Speed;
   internal BooleanReading Running,Starting;
  }
  static bool Stopped(){return Thread.VolatileRead(ref stop)!=0;}
  static void Stop(string reason)
  {
   // This gate only protects a few field assignments. No getter, wait, native
   // invocation, serialization or filesystem operation runs while it is held.
   lock(PublicationGate){if(stop==0){terminalReason=reason;Interlocked.Exchange(ref stop,1);}}
   CaptureDone.Set();
  }
  static bool StoryReady()
  {
   if(Game.IsLoading||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))return false;
   int player=NativeFunction.CallByName<int>("PLAYER_ID"),ped=NativeFunction.CallByName<int>("PLAYER_PED_ID");
   return ped!=0&&NativeFunction.CallByName<bool>("IS_PLAYER_PLAYING",player)&&NativeFunction.CallByName<bool>("DOES_ENTITY_EXIST",ped)&&!NativeFunction.CallByName<bool>("IS_PLAYER_SWITCH_IN_PROGRESS");
  }
  static Vehicle PlayerBati(uint? expected)
  {
   var player=Game.LocalPlayer.Character;if(player==null||!player.IsValid())return null;
   var vehicle=player.CurrentVehicle;if(vehicle==null||!vehicle.IsValid()||vehicle.IsDead||vehicle.Model.Hash!=BatiModel)return null;
   var driver=vehicle.Driver;if(driver==null||!driver.IsValid()||driver.Handle.Value!=player.Handle.Value)return null;
   if(expected.HasValue&&vehicle.Handle.Value!=expected.Value)return null;
   return vehicle;
  }
  public static void Main()
  {
   started=Stopwatch.GetTimestamp();watchdog=new Thread(Watchdog);watchdog.Name="RichAudio read-only probe watchdog";watchdog.IsBackground=true;watchdog.Start();
   writer=new Thread(WriteCapture);writer.Name="RichAudio read-only probe writer";writer.IsBackground=true;writer.Start();
   Game.Console.Print("RichAudio READ-ONLY operating-state probe session "+Session+". 120 seconds; no audio or vehicle control. Phase labels request actions and do not establish achieved states.");
   try{
    if(!StoryReady()){Stop("refused-not-offline-story-ready");return;}
    var vehicle=PlayerBati(null);if(vehicle==null){Stop("refused-current-player-driver-bati-required");return;}
    uint identity=vehicle.Handle.Value;Interlocked.Exchange(ref captureStarted,Stopwatch.GetTimestamp());long period=Stopwatch.Frequency/20;int slot=0,lastPhase=-1;
    while(!Stopped()&&slot<MaximumRecords){
     long now=Stopwatch.GetTimestamp();if(now-started>=Stopwatch.Frequency*TotalSeconds){Stop("total-watchdog-deadline");break;}
     if(now-captureStarted>=Stopwatch.Frequency*CaptureSeconds){Stop("capture-duration-complete");break;}
     long due=captureStarted+period*slot;
     if(now<due){GameFiber.Sleep((int)Math.Max(1,Math.Min(50,(due-now)*1000/Stopwatch.Frequency)));continue;}
     int actualSlot=(int)((now-captureStarted)/period);if(actualSlot>=MaximumRecords){Stop("capture-duration-complete");break;}
     if(actualSlot>slot){Interlocked.Add(ref missedSlots,actualSlot-slot);slot=actualSlot;due=captureStarted+period*slot;}
     if(now-due>Stopwatch.Frequency/40)Interlocked.Increment(ref lateSamples);
     long before=Stopwatch.GetTimestamp();
     if(!StoryReady()){Stop("story-context-left-or-loading");break;}
     vehicle=PlayerBati(identity);if(vehicle==null){Stop("player-driver-vehicle-identity-or-model-changed");break;}
     int phase=Math.Min(5,(int)((before-captureStarted)/(Stopwatch.Frequency*20)));
     if(phase!=lastPhase){lastPhase=phase;Game.Console.Print("RichAudio probe "+Session+" "+Phases[phase]+" (target only; achieve safely where supported).");}
     var sample=new Sample{Slot=slot,Phase=phase,Handle=identity,Before=before,Paused=Game.IsPaused};
     sample.Running=BooleanReading.Get(()=>vehicle.IsEngineOn);
     sample.Starting=BooleanReading.Get(()=>vehicle.IsEngineStarting);
     sample.RphRatio=Reading.Get(()=>vehicle.EngineRevolutionsRatio,true);
     sample.RphGear=Reading.Get(()=>vehicle.CurrentGear,false);
     sample.Speed=Reading.Get(()=>vehicle.Speed,false);
     sample.NativeRevRatio=Reading.Get(()=>NativeFunction.CallByHash<float>(RevRatioHash,vehicle),false);
     sample.NativeThrottle=Reading.NotRead();sample.NativeGear=Reading.NotRead();string nativeFailure=null;
     if(sample.NativeRevRatio.Failed())nativeFailure="current-rev-ratio";
     else{
      sample.NativeThrottle=Reading.Get(()=>NativeFunction.CallByHash<float>(ThrottleHash,vehicle),false);
      if(sample.NativeThrottle.Failed())nativeFailure="throttle";
      else{sample.NativeGear=Reading.Get(()=>NativeFunction.CallByHash<int>(GearHash,vehicle),false);if(sample.NativeGear.Failed())nativeFailure="current-drive-gear";}
     }
     sample.After=Stopwatch.GetTimestamp();long batchTicks=sample.After-before;
     if(batchTicks>Stopwatch.Frequency/100)Interlocked.Increment(ref slowBatches);
     if(batchTicks>Interlocked.Read(ref maximumBatchTicks))Interlocked.Exchange(ref maximumBatchTicks,batchTicks);
     // Stop and snapshot publication share this short gate; a native returning
     // after watchdog cancellation cannot mutate the writer's frozen capture.
     if(Stopped()){Interlocked.Increment(ref unpublishedBatches);break;}
     if(sample.After-captureStarted>=Stopwatch.Frequency*CaptureSeconds){Interlocked.Increment(ref unpublishedBatches);Stop("capture-duration-complete");break;}
     bool accepted=false;
     lock(PublicationGate){if(stop==0&&published<MaximumRecords){Samples[published]=sample;Interlocked.Exchange(ref published,published+1);accepted=true;}}
     if(!accepted){Interlocked.Increment(ref unpublishedBatches);break;}
     slot++;
     if(nativeFailure!=null){Stop("native-invocation-failed:"+nativeFailure);break;}
    }
    if(!Stopped()){
     // The final 20 Hz slot precedes 120 s by 50 ms; retain the fixed window
     // without adding another sample or a catch-up burst.
     while(!Stopped()&&Stopwatch.GetTimestamp()-captureStarted<Stopwatch.Frequency*CaptureSeconds)GameFiber.Sleep(10);
     if(!Stopped())Stop("capture-duration-complete");
    }
   }catch(ThreadAbortException){Stop("plugin-thread-aborted");throw;}
   catch(Exception error){Stop("capture-exception:"+error.GetType().Name);}
   finally{
    if(!Stopped())Stop("capture-ended");
    // Cooperative yield only. Filesystem work and the 150-second watchdog run
    // on the independent background thread, never on this game fiber.
    while(!WriterDone.WaitOne(0)&&Stopwatch.GetTimestamp()-started<Stopwatch.Frequency*TotalSeconds&&Thread.VolatileRead(ref unloading)==0)GameFiber.Sleep(20);
    Game.Console.Print("RichAudio probe "+Session+" stopped: "+(terminalReason??"unknown")+"; records="+Thread.VolatileRead(ref published)+"; writer="+(writerError??(WriterDone.WaitOne(0)?"finished":"pending"))+". Private measurement only; no provider or audible result established.");
   }
  }
  public static void OnUnload()
  {
   Interlocked.Exchange(ref unloading,1);Stop("plugin-unloaded");
   // No game-thread join, thread abort, game API or file I/O here.
  }
  static string Quote(string value)
  {
   if(value==null)return "null";var text=new StringBuilder(value.Length+2);text.Append('"');
   foreach(char character in value){
    switch(character){case '"':text.Append("\\\"");break;case '\\':text.Append("\\\\");break;case '\n':text.Append("\\n");break;case '\r':text.Append("\\r");break;case '\t':text.Append("\\t");break;case '\b':text.Append("\\b");break;case '\f':text.Append("\\f");break;default:if(character<0x20)text.Append("\\u"+((int)character).ToString("x4",Invariant));else text.Append(character);break;}
   }
   return text.Append('"').ToString();
  }
  static string Number(double? value){return value.HasValue?value.Value.ToString("R",Invariant):"null";}
  static string FailureJson(Failure value){return value==null?"null":"{\"type\":"+Quote(value.Type)+",\"message\":"+Quote(value.Message)+",\"hresult\":"+value.HResult+",\"stackTrace\":"+Quote(value.StackTrace)+",\"inner\":"+FailureJson(value.Inner)+"}";}
  static string ReadJson(Reading value){return "{\"raw\":"+Number(value.Value)+",\"classification\":"+Quote(value.Classification)+",\"privateFailure\":"+FailureJson(value.Error)+"}";}
  static string BoolJson(BooleanReading value){return "{\"raw\":"+(value.Value.HasValue?(value.Value.Value?"true":"false"):"null")+",\"classification\":"+Quote(value.Classification)+",\"privateFailure\":"+FailureJson(value.Error)+"}";}
  static string SampleJson(Sample sample)
  {
   return "{\"schema\":1,\"session\":"+Quote(Session)+",\"slot\":"+sample.Slot+",\"requestedPhase\":"+Quote(Phases[sample.Phase])+",\"phaseIsAchievedState\":false,\"identity\":"+Quote(sample.Handle.ToString("X8"))+",\"generation\":1,\"model\":\"0xf9300cc5\",\"beforeTicks\":"+sample.Before+",\"afterTicks\":"+sample.After+",\"observedTicks\":"+(sample.Before+(sample.After-sample.Before)/2)+",\"clockFrequency\":"+Stopwatch.Frequency+",\"paused\":"+(sample.Paused?"true":"false")+",\"rphEngineOn\":"+BoolJson(sample.Running)+",\"rphEngineStarting\":"+BoolJson(sample.Starting)+",\"rawRphRatio\":"+ReadJson(sample.RphRatio)+",\"rawNativeRevRatio\":"+ReadJson(sample.NativeRevRatio)+",\"rawNativeThrottle\":"+ReadJson(sample.NativeThrottle)+",\"rawRphGear\":"+ReadJson(sample.RphGear)+",\"rawNativeGear\":"+ReadJson(sample.NativeGear)+",\"rawRphSpeed\":"+ReadJson(sample.Speed)+"}";
  }
  static void AtomicSummary(string directory,string state,int frozenCount,int written)
  {
   string text="{\"schema\":1,\"session\":"+Quote(Session)+",\"state\":"+Quote(state)+",\"reason\":"+Quote(terminalReason??"awaiting-capture")+",\"captured\":"+frozenCount+",\"written\":"+written+",\"writerOmitted\":"+Math.Max(0,frozenCount-written)+",\"unpublishedCompletedBatches\":"+Interlocked.Read(ref unpublishedBatches)+",\"droppedRecords\":"+(Interlocked.Read(ref unpublishedBatches)+Math.Max(0,frozenCount-written))+",\"missedSamplingSlots\":"+Interlocked.Read(ref missedSlots)+",\"lateSamples\":"+Interlocked.Read(ref lateSamples)+",\"slowBatchesAbove10ms\":"+Interlocked.Read(ref slowBatches)+",\"maximumBatchMs\":"+(Interlocked.Read(ref maximumBatchTicks)*1000d/Stopwatch.Frequency).ToString("R",Invariant)+",\"maximumRecords\":2400,\"captureSeconds\":120,\"independentWatchdogSeconds\":150,\"writerBudgetSeconds\":10,\"clockFrequency\":"+Stopwatch.Frequency+",\"captureStartedTicks\":"+Interlocked.Read(ref captureStarted)+",\"unloading\":"+(Thread.VolatileRead(ref unloading)!=0?"true":"false")+",\"phaseLabelsEstablishAchievedStates\":false,\"nativeContractsValidatedOnInstalledBuild\":false,\"measuredRpmEstablished\":false,\"gameplayWrites\":false,\"audioOutput\":false,\"limitation\":\"The watchdog requests cancellation independently. It cannot preempt a stalled RPH/native call or filesystem operation.\"}";
   string pending=Path.Combine(directory,"summary.pending"),target=Path.Combine(directory,"summary.json");
   using(var stream=new FileStream(pending,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var output=new StreamWriter(stream,new UTF8Encoding(false)))output.Write(text);
   if(File.Exists(target))File.Replace(pending,target,null);else File.Move(pending,target);
  }
  static void Watchdog()
  {
   // No filesystem or RPH work: cancellation remains independent of a stalled
   // game native or a blocked writer. Cancellation cannot preempt either call.
   while(!Stopped()){
    long left=Stopwatch.Frequency*TotalSeconds-(Stopwatch.GetTimestamp()-started);
    if(left<=0){Stop("total-watchdog-deadline");return;}
    if(CaptureDone.WaitOne((int)Math.Max(1,Math.Min(1000,left*1000/Stopwatch.Frequency))))return;
   }
  }
  static void WriteCapture()
  {
   string directory=null;int count=0,written=0;
   try{
    directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"RichAudio","telemetry-probe",Session);
    if(Directory.Exists(directory))throw new IOException("Session directory already exists");
    Directory.CreateDirectory(directory);AtomicSummary(directory,"armed",0,0);
    int remaining=(int)Math.Max(0,TotalSeconds*1000-(Stopwatch.GetTimestamp()-started)*1000/Stopwatch.Frequency);
    if(!CaptureDone.WaitOne(remaining))Stop("total-watchdog-deadline");
    lock(PublicationGate){count=published;}
    long writeStarted=Stopwatch.GetTimestamp();
    using(var stream=new FileStream(Path.Combine(directory,"observations.jsonl"),FileMode.CreateNew,FileAccess.Write,FileShare.Read))using(var output=new StreamWriter(stream,new UTF8Encoding(false))){
     while(written<count){
      long now=Stopwatch.GetTimestamp();
      if(Thread.VolatileRead(ref unloading)!=0||now-writeStarted>=Stopwatch.Frequency*WriterSeconds||now-started>=Stopwatch.Frequency*TotalSeconds)break;
      output.WriteLine(SampleJson(Samples[written]));written++;
     }
    }
    AtomicSummary(directory,written==count?"capture-finished":"capture-finished-record-write-incomplete",count,written);
   }catch(ThreadAbortException){writerError="ThreadAbortException";Stop("writer-thread-aborted");throw;}
   catch(Exception error){writerError=error.GetType().Name;Stop("writer-exception:"+writerError);}
   finally{WriterDone.Set();}
  }
 }
}
