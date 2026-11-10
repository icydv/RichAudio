// The actual normal-product Capture and CameraListenerTracker compile here.
// SDK values are explicitly authored; no RPH/game, host, device or asset runs.
using System;
using System.Collections.Generic;
using System.Collections;
using System.Diagnostics;
using System.IO.Pipes;
using System.Reflection;
using System.Threading;
using RichAudio.Beacon.Rph;
using RichAudio.Beacon.Transport;
using RichAudio.Beacon.Windows;
namespace Rage {
 public struct Vector3 {public float X,Y,Z;public Vector3(float x,float y,float z){X=x;Y=y;Z=z;}}
 public struct PoolHandle {public uint Value,Index;public byte Counter;}
 public class Entity {public PoolHandle Handle;public IntPtr MemoryAddress;public bool Exists=true,IsDead;public bool IsValid(){return Exists;}}
 public sealed class Model {public uint Hash=0xf9300cc5u;}
 public sealed class Ped:Entity {public Vehicle CurrentVehicle;}
 public sealed class Vehicle:Entity {public Ped Driver;public Model Model=new Model();public bool IsEngineOn=true;double ratio=.5;public int RatioReadDelayMs;
  public double EngineRevolutionsRatio{get{if(RatioReadDelayMs>0)Thread.Sleep(RatioReadDelayMs);return ratio;}set{ratio=value;}}
  public Vector3 Position=new Vector3(0,10,0),Velocity=new Vector3(0,0,0),ForwardVector=new Vector3(0,1,0),UpVector=new Vector3(0,0,1);}
 public sealed class Player {public Ped Character;}
 public static class Game {public static bool IsLoading,IsPaused;public static Player LocalPlayer=new Player();public static class Console {public static void Print(string value){}}}
 [Flags]public enum GetEntitiesFlags {ConsiderCars=1,ConsiderBikes=2}
 public static class World {public static Entity[] Entities=new Entity[0];public static Entity[] GetEntities(Vector3 at,float radius,GetEntitiesFlags flags){return Entities;}}
 public static class GameFiber {public static Action OnSleep;public static void Sleep(int milliseconds){if(OnSleep!=null)OnSleep();}}
}
namespace Rage.Attributes {public sealed class ConsoleCommandAttribute:Attribute {public string Name,Description;}}
namespace Rage.Native {public static class NativeFunction {
 public static dynamic Natives {get{return new InteriorCalls();}}
 public static bool InteriorReady;
 public static int InteriorQueries,InteriorMetadataReads;
 public static int InteriorProxy=71;
 public static uint InteriorArchetype=0x12345678u;
 public static Rage.Vector3 InteriorOrigin=new Rage.Vector3(25,10,4);
 public sealed class InteriorCalls {
  public void x252BDC06B73FA6EA(int proxy,out Rage.Vector3 origin,out uint name){
   InteriorMetadataReads++;
   if(proxy!=InteriorProxy)throw new InvalidOperationException("Unexpected proxy");
   origin=InteriorOrigin;name=InteriorArchetype;
  }
 }
 public static bool GameplayCamera=true,VehicleCamera=true;
 public static double CameraX;public static uint CameraGameTime;
 public static T CallByName<T>(string name,params object[] args){
  if(name=="GET_INTERIOR_FROM_COLLISION"){InteriorQueries++;return (T)(object)(InteriorReady?InteriorProxy:0);}
  if(name=="IS_INTERIOR_READY")return (T)(object)InteriorReady;
  if(name=="IS_GAMEPLAY_CAM_RENDERING")return (T)(object)GameplayCamera;
  if(name=="IS_FOLLOW_VEHICLE_CAM_ACTIVE")return (T)(object)VehicleCamera;
  if(name=="GET_FINAL_RENDERED_CAM_COORD")return (T)(object)new Rage.Vector3((float)CameraX,0,1);
  if(name=="GET_FINAL_RENDERED_CAM_ROT"){if(args.Length!=1||Convert.ToInt32(args[0])!=2)throw new InvalidOperationException("Expected actual sampler ZXY rotation order");return (T)(object)new Rage.Vector3(0,0,0);}
  if(name=="GET_GAME_TIMER")return (T)(object)CameraGameTime;
  throw new InvalidOperationException("Unexpected fixture native: "+name);
 }
}}
namespace RichAudio.Beacon.Windows {public sealed class GameplayRuntime {
 public string Session="0123456789abcdef0123456789abcdef",State="fixture";public int HostPid,Attempts;public double MaximumObservationMs;
 public object Settings=new object();public PlayableConfiguration Configuration=new PlayableConfiguration{Eligible=new[]{new PlayableModel{Model=0xf9300cc5u,Context="player"},new PlayableModel{Model=0xf9300cc5u,Context="npc"}}};
 public readonly List<GameplayFrame> Frames=new List<GameplayFrame>();
 public void Publish(GameplayFrame frame){GameplayWire.Validate(frame,Session);Frames.Add(frame);}
 public void Start(string pointer,string game,string runtime){}public void SetStoryReady(bool value){}public void RequestStop(string reason="owner-stop"){}public bool Join(int milliseconds){return true;}
}}
namespace RichAudio.Beacon.Rph {
 internal static class InGameMenu {internal static void Start(){}internal static void Stop(){}}
 internal static class PassiveListener {internal static void Start(){}internal static void Stop(){}}
 internal static class InstalledWorldWarmup {internal static int Starts,Stops,Offers;internal static string StartedUtc="2026-11-05T13:54:25.2639009Z";internal static bool OfferInitial01(string session,ListenerState listener){Offers++;return true;}internal static void Start(){Starts++;}internal static void Stop(){Stops++;}}
}
internal static class TestStreetContinuity01 {
 static int assertions;static readonly List<string> cases=new List<string>();
 static void Check(bool yes,string why){assertions++;if(!yes)throw new Exception(why);}
 static void Test(string name,Action action){action();cases.Add(name);}
 static void Capture(GameplayRuntime runtime,double cameraX=0){
  Thread.Sleep(60);long now=Stopwatch.GetTimestamp();
  Rage.Native.NativeFunction.CameraX=cameraX;Rage.Native.NativeFunction.CameraGameTime=(uint)(now/Stopwatch.Frequency);
  typeof(CameraSampler).GetField("cached",BindingFlags.NonPublic|BindingFlags.Static).SetValue(null,new CameraObservation{Before=now,After=now,Observed=now,GameTime=(uint)(now/Stopwatch.Frequency),Position=new[]{cameraX,0d,1d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d}});
  typeof(PlayableEntry).GetMethod("Capture",BindingFlags.NonPublic|BindingFlags.Static).Invoke(null,new object[]{runtime});
 }
 static GameplayVehicle Only(GameplayRuntime r){var f=r.Frames[r.Frames.Count-1];Check(f.Listener.Valid&&f.Vehicles.Length==1,"one fresh genuine adapter observation");return f.Vehicles[0];}
 static GameplayFrame CameraWire(GameplayRuntime runtime){
  string endpoint="RichAudio.CameraFixture."+Guid.NewGuid().ToString("N");
  using(var server=GameplayWire.Server(endpoint))
  using(var client=new NamedPipeClientStream(".",endpoint,PipeDirection.InOut,PipeOptions.Asynchronous)){
   var accept=server.BeginWaitForConnection(null,null);
   client.Connect(1000);server.EndWaitForConnection(accept);
   GameplayWire.Write(client,GameplayWire.Encode(runtime.Frames[runtime.Frames.Count-1],runtime.Session));
   return GameplayWire.Decode(GameplayWire.Read(server),runtime.Session);
  }
 }
 static int Main(){try{
  var player=new Rage.Ped{Handle=new Rage.PoolHandle{Value=0x102,Index=1,Counter=2},MemoryAddress=new IntPtr(100)};
  var vehicle=new Rage.Vehicle{Handle=new Rage.PoolHandle{Value=0x304,Index=3,Counter=4},MemoryAddress=new IntPtr(200),Driver=player};player.CurrentVehicle=vehicle;Rage.Game.LocalPlayer.Character=player;Rage.World.Entities=new Rage.Entity[]{vehicle};var runtime=new GameplayRuntime();
  // The first real adapter invocation may spend its 10 ms budget on JIT.
  // Keep that rejected frame and require fresh evidence on a later tick.
  for(int attempt=0;attempt<3;attempt++){
   Capture(runtime);
   if(runtime.Frames.Count>0&&runtime.Frames[runtime.Frames.Count-1].Listener.Valid&&runtime.Frames[runtime.Frames.Count-1].Vehicles.Length==1)break;
  }
  var initial=Only(runtime);
  Test("dismount preserves real running source identity and original bank context",delegate{
   Check(initial.RiderAttached==true&&initial.RiderViewAttached==true,"mounted driver in normal vehicle view");
   player.CurrentVehicle=null;vehicle.Driver=null;Capture(runtime);var dismounted=Only(runtime);
   Check(dismounted.Id==initial.Id&&dismounted.Generation==initial.Generation&&dismounted.Context==initial.Context,"source/grain owner and bank context survive dismount");
   Check(dismounted.Running&&dismounted.RiderAttached==false&&dismounted.RiderViewAttached==false,"observed running vehicle remains independent of driver scope");
  });
  Test("roadside camera cannot invent physical source velocity or local riding view",delegate{
   vehicle.Velocity=new Rage.Vector3(0,20,0);Rage.Native.NativeFunction.VehicleCamera=false;Capture(runtime,1);var moving=Only(runtime);
   Check(moving.Velocity[1]==20&&moving.Velocity[0]==0&&moving.RiderViewAttached==false,"source velocity comes only from vehicle getter");
   player.CurrentVehicle=vehicle;vehicle.Driver=player;Capture(runtime,2);var detached=Only(runtime);
   Check(detached.RiderAttached==true&&detached.RiderViewAttached==false,"rider relation alone cannot authorise local airflow");
  });
  Test("rejected operating ratio withholds evidence without replacing the same pool owner or refreshing its lease",delegate{
   var records=(IList)typeof(PlayableEntry).GetField("tracked",BindingFlags.NonPublic|BindingFlags.Static).GetValue(null);
   var retained=records[0];var type=retained.GetType();long observed=(long)type.GetField("Ticks").GetValue(retained);var position=type.GetField("Position").GetValue(retained);
   vehicle.EngineRevolutionsRatio=50;Capture(runtime,2);
   Check(runtime.Frames[runtime.Frames.Count-1].Vehicles.Length==0,"invalid ratio creates no observation or invented engine-off state");
   Check(records.Count==1&&Object.ReferenceEquals(records[0],retained),"independently valid exact pool owner remains retained");
   Check((long)type.GetField("Ticks").GetValue(retained)==observed&&Object.ReferenceEquals(type.GetField("Position").GetValue(retained),position),"invalid ratio cannot refresh original source time or pose");
   vehicle.EngineRevolutionsRatio=.6;Capture(runtime,2);var recovered=Only(runtime);
   Check(recovered.Id==initial.Id&&recovered.Context==initial.Context&&recovered.Generation==initial.Generation&&recovered.Running,"short rejection preserves original identity, bank latch and genuine running getter");
  });
  Test("camera cut consumes discarded pose and recovers independently without source restart",delegate{
   int count=runtime.Frames.Count;Capture(runtime,100);Check(runtime.Frames.Count==count,"cut frame is never published");
   Capture(runtime,101);var after=Only(runtime);var listener=runtime.Frames[runtime.Frames.Count-1].Listener;
   Check(after.Id==initial.Id&&after.Generation==initial.Generation,"camera boundary preserves source operating/grain lifetime");
   Check(listener.Generation==2&&listener.Velocity[0]>0&&listener.Velocity[0]<100,"new spatial generation uses fresh post-cut measured difference");
   Check(listener.Units=="native-unverified","native coordinate uncertainty is preserved");
  });
  Test("a real rejected-evidence gap over 250 ms retains pool ownership but keeps the original generation boundary",delegate{
   vehicle.EngineRevolutionsRatio=Double.NaN;Capture(runtime,101);
   int count=runtime.Frames.Count;
   Thread.Sleep(260);Capture(runtime,101);
   Check(runtime.Frames.Count==count,"camera gap publishes no frame before an independent observation");
   vehicle.EngineRevolutionsRatio=.6;Capture(runtime,101);var recovered=Only(runtime);
   Check(recovered.Id==initial.Id&&recovered.Context==initial.Context,"long operating-state gap does not manufacture a new pool acquisition");
   Check(recovered.Generation==initial.Generation+1,"original gap boundary remains required after unrefreshed invalid evidence");
   initial=recovered;
  });
  Test("observed engine stop preserves identity and differs from source loss",delegate{
   vehicle.IsEngineOn=false;Capture(runtime,102);var stopped=Only(runtime);
   Check(!stopped.Running&&stopped.Id==initial.Id&&stopped.Generation==initial.Generation,"explicit getter reports engine stopped");
   vehicle.Exists=false;Capture(runtime,103);Check(runtime.Frames[runtime.Frames.Count-1].Vehicles.Length==0,"invalid entity emits no invented shutdown observation");
  });
  Test("recycled full pool identity cannot inherit source lifetime",delegate{
   vehicle.Exists=true;vehicle.IsEngineOn=true;var h=vehicle.Handle;h.Counter++;vehicle.Handle=h;Capture(runtime,104);var recycled=Only(runtime);
   Check(recycled.Id!=initial.Id,"changed pool counter produces distinct source identity even at same address");
  });
  Test("wire carries optional attachment proof and preserves absent legacy evidence",delegate{
   var f=runtime.Frames[runtime.Frames.Count-1];var decoded=GameplayWire.Decode(GameplayWire.Encode(f,runtime.Session),runtime.Session);
   Check(decoded.Vehicles[0].RiderAttached==true&&decoded.Vehicles[0].RiderViewAttached==false,"explicit false survives nullable JSON");
   f.Vehicles[0].RiderAttached=null;f.Vehicles[0].RiderViewAttached=null;decoded=GameplayWire.Decode(GameplayWire.Encode(f,runtime.Session),runtime.Session);
   Check(!decoded.Vehicles[0].RiderAttached.HasValue&&!decoded.Vehicles[0].RiderViewAttached.HasValue,"legacy omission remains unknown");
  });
  Test("normal startup epoch survives the actual wire without becoming observation time",delegate{
   var f=runtime.Frames[runtime.Frames.Count-1];long sampled=f.Listener.ObservationTicks;
   Check(f.WorldPreparationStartedUtc==InstalledWorldWarmup.StartedUtc,"actual Capture carries supervisor epoch");
   var decoded=GameplayWire.Decode(GameplayWire.Encode(f,runtime.Session),runtime.Session);
   Check(decoded.WorldPreparationStartedUtc==f.WorldPreparationStartedUtc&&decoded.Listener.ObservationTicks==sampled,"exact epoch and original sample clock survive codec");
   f.WorldPreparationStartedUtc="invented";bool rejected=false;try{GameplayWire.Encode(f,runtime.Session);}catch(Exception){rejected=true;}Check(rejected,"invalid epoch cannot qualify normal cache");
   f.WorldPreparationStartedUtc=null;decoded=GameplayWire.Decode(GameplayWire.Encode(f,runtime.Session),runtime.Session);Check(decoded.WorldPreparationStartedUtc==null,"old packets omit epoch and retain limited world status");
  });
  Test("camera interior proxy and exact placement anchor reach the wire from Capture",delegate{
   Rage.Native.NativeFunction.InteriorReady=true;
   var sampler=typeof(CameraSampler).GetMethod("ObserveInterior",BindingFlags.NonPublic|BindingFlags.Static,null,new[]{typeof(ListenerState)},null);
   sampler.Invoke(null,new object[]{new ListenerState{Position=new[]{104d,0d,1d},ObservationTicks=Stopwatch.GetTimestamp()}});
   // The codec and native binder are exercised by separate fixture episodes.
   // Their setup time is not a continuous camera interval.
   var tracker=(CameraListenerTracker)typeof(PlayableEntry).GetField("listenerTracker",BindingFlags.NonPublic|BindingFlags.Static).GetValue(null);
   tracker.Invalidate();
   int queries=Rage.Native.NativeFunction.InteriorQueries,reads=Rage.Native.NativeFunction.InteriorMetadataReads,beforeCaptureCount=runtime.Frames.Count;
   Capture(runtime,104);
   var frame=runtime.Frames[runtime.Frames.Count-1];
   var decoded=CameraWire(runtime);
   Check(runtime.Frames.Count==beforeCaptureCount+1&&decoded.CameraInterior01!=null&&decoded.CameraInterior01.Proxy==71&&decoded.CameraInterior01.Archetype==0x12345678u&&
    decoded.CameraInterior01.Origin[0]==25,"camera proxy, archetype and origin survive the actual wire"+
    " | frames added="+(runtime.Frames.Count-beforeCaptureCount)+" proxy queries="+(Rage.Native.NativeFunction.InteriorQueries-queries)+
    " metadata reads="+(Rage.Native.NativeFunction.InteriorMetadataReads-reads)+" raw proxy="+(frame.CameraInterior01==null?"absent":frame.CameraInterior01.Proxy.ToString())+
    " decoded proxy="+(decoded.CameraInterior01==null?"absent":decoded.CameraInterior01.Proxy.ToString())+" listener sequence="+frame.Listener.Sequence+
    " listener paused="+frame.Listener.Paused+" preparation epoch present="+(frame.WorldPreparationStartedUtc!=null));
   Check(decoded.CameraInterior01.ObservationTicks==frame.CameraInterior01.ObservationTicks,"proxy sample clock is retained");
   vehicle.RatioReadDelayMs=18;
   try{Capture(runtime,104);}finally{vehicle.RatioReadDelayMs=0;}
   var renewed=CameraWire(runtime);
   Check(renewed.Listener.Valid&&renewed.Vehicles.Length==0&&renewed.CameraInterior01!=null,
    "slow vehicle sampling cannot erase a qualified camera observation");
   Check(renewed.Listener.Generation==decoded.Listener.Generation&&renewed.Listener.Sequence>decoded.Listener.Sequence&&
    renewed.CameraInterior01.ObservationTicks>decoded.CameraInterior01.ObservationTicks&&renewed.CameraInterior01.Proxy==71&&
    renewed.CameraInterior01.Archetype==0x12345678u&&renewed.CameraInterior01.Origin[0]==25&&
    renewed.CameraInterior01.Origin[1]==10&&renewed.CameraInterior01.Origin[2]==4,"fresh interior renewal preserves original identity and clock");
   decoded.CameraInterior01.ObservationTicks-=Stopwatch.Frequency;
   bool stale=false;try{GameplayWire.Encode(decoded,runtime.Session);}catch{stale=true;}
   Check(stale,"stale proxy cannot qualify an otherwise valid frame");
   Rage.Native.NativeFunction.InteriorProxy=72;
   Rage.Native.NativeFunction.InteriorArchetype=0xfedcba98u;
   Rage.Native.NativeFunction.InteriorOrigin=new Rage.Vector3(-25.5f,10.25f,4.125f);
   Capture(runtime,104);
   var changed=CameraWire(runtime);
   Check(changed.CameraInterior01!=null&&changed.CameraInterior01.Proxy==72&&changed.CameraInterior01.Archetype==0xfedcba98u&&
    changed.CameraInterior01.Origin[0]==-25.5&&changed.CameraInterior01.Origin[1]==10.25&&changed.CameraInterior01.Origin[2]==4.125&&
    changed.Listener.Generation==renewed.Listener.Generation&&changed.Listener.Sequence>renewed.Listener.Sequence,"changed native fields survive the actual wire");
   Rage.Native.NativeFunction.InteriorReady=false;Capture(runtime,104);
   var exterior=CameraWire(runtime);
   Check(exterior.CameraInterior01==null,"lost proxy yields unknown");
   int count=runtime.Frames.Count;Capture(runtime,999);
   Check(runtime.Frames.Count==count,"camera cut publishes no borrowed interior identity");
   Capture(runtime,999);
   var afterCut=CameraWire(runtime);
   Check(afterCut.Listener.Generation>exterior.Listener.Generation&&afterCut.Listener.Sequence>exterior.Listener.Sequence&&
    afterCut.CameraInterior01==null,"new camera generation carries only its own exterior evidence");
  });
  Test("listener invalidation preserves monotonic identity without interpolating old poses",delegate{
   var tracker=new CameraListenerTracker();long now=Stopwatch.GetTimestamp();var first=tracker.Observe(runtime.Session,new CameraObservation{Before=now,After=now,Observed=now,Position=new[]{0d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d}});
   tracker.Invalidate();now++;var next=tracker.Observe(runtime.Session,new CameraObservation{Before=now,After=now,Observed=now,Position=new[]{999d,0d,0d},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d}});
   Check(next.Publish&&next.Listener.Generation>first.Listener.Generation&&next.Listener.Sequence>first.Listener.Sequence&&next.Listener.VelocityKind=="unavailable","scope reset does not fabricate camera travel or reuse identity");
  });
  Test("actual normal-product main queues world preparation and requests stop on unload",delegate{
   Rage.Game.IsLoading=true;Rage.GameFiber.OnSleep=PlayableEntry.OnUnload;
   PlayableEntry.Main();
   Check(InstalledWorldWarmup.Starts==1,"one world-preparation startup hook from actual main entry");
   Check(InstalledWorldWarmup.Stops>=1,"normal unload and finally request background-worker cancellation");
   Rage.GameFiber.OnSleep=null;
  });
  System.Console.WriteLine("{\"passed\":true,\"cases\":"+cases.Count+",\"assertions\":"+assertions+",\"sdkValues\":\"authored\",\"gameLaunched\":false,\"endpointOpened\":false,\"nativeMuting\":false,\"casesPassed\":[\""+String.Join("\",\"",cases.ToArray())+"\"]}");return 0;
 }catch(Exception e){System.Console.Error.WriteLine(e);return 1;}}
}
