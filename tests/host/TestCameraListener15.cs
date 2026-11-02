using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Reflection;
using RichAudio.Beacon.Rph;
using RichAudio.Beacon.Handoff;
using RichAudio.Beacon.Transport;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;

namespace RichAudio.Beacon.Handoff
{
    internal sealed class ShvHandoffJournal
    {
        internal bool Fail;internal string Json,Kind;
        internal bool WriteEvent(string kind,object payload)
        {Kind=kind;Json=new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(payload);return !Fail;}
    }
}

// Explicit fake native/SDK responses. The production CameraSampler and retained
// driver sampler below are compiled unchanged against these offline-only types.
namespace Rage
{
    public struct Vector3{public float X,Y,Z;public Vector3(float x,float y,float z){X=x;Y=y;Z=z;}}
    public struct PoolHandle{public uint Index,Value;public byte Counter;}
    public class Entity
    {public PoolHandle Handle;public IntPtr MemoryAddress;public bool IsDead;public bool Exists=true;public bool IsValid(){return Exists;}}
    public sealed class Model{public uint Hash;}
    public sealed class Ped:Entity{public Vehicle CurrentVehicle;}
    public sealed class Vehicle:Entity
    {public Ped Driver;public Model Model=new Model{Hash=0xf9300cc5u};public bool IsEngineOn=true;
     public Vector3 Position=new Vector3(1,2,3),Velocity=new Vector3(0,0,0),ForwardVector=new Vector3(0,1,0),UpVector=new Vector3(0,0,1);}
    public sealed class Player{public Ped Character;}
    public static class Game{public static bool IsLoading,IsPaused;public static Player LocalPlayer=new Player();}
}
namespace Rage.Native
{
    public static class NativeFunction
    {
        public static int CameraCalls;public static Rage.Vector3 Position=new Rage.Vector3(0,0,1);
        public static T CallByName<T>(string name,params object[] args)
        {
            object value;
            if(name=="GET_FINAL_RENDERED_CAM_COORD"){CameraCalls++;value=Position;}
            else if(name=="GET_FINAL_RENDERED_CAM_ROT")value=new Rage.Vector3(0,0,0);
            else if(name=="GET_GAME_TIMER")value=(uint)1000;
            else if(name=="PLAYER_ID"||name=="PLAYER_PED_ID")value=1;
            else if(name=="IS_PLAYER_PLAYING"||name=="DOES_ENTITY_EXIST")value=true;
            else if(name=="NETWORK_IS_SESSION_STARTED"||name=="NETWORK_IS_GAME_IN_PROGRESS"||name=="IS_PLAYER_SWITCH_IN_PROGRESS")value=false;
            else throw new InvalidOperationException("unexpected fake API "+name);
            return (T)value;
        }
    }
}
internal static class TestCameraListener15
{
    const string Session="0123456789abcdef0123456789abcdef";
    static int assertions;static readonly List<string> cases=new List<string>();
    static void Check(bool value,string why){assertions++;if(!value)throw new Exception(why);}
    static void Test(string name,Action body){body();cases.Add(name);}
    static CameraObservation Camera(long time,double x=0,double y=0,double z=1,uint game=1000)
    {return new CameraObservation{Before=time,After=time,Observed=time,UnixMs=1000,GameTime=game,Position=new[]{x,y,z},Forward=new[]{0d,1d,0d},Up=new[]{0d,0d,1d}};}
    static void Cached(CameraObservation value){typeof(CameraSampler).GetField("cached",BindingFlags.Static|BindingFlags.NonPublic).SetValue(null,value);}
    static int Main()
    {
        try{
            long now=Stopwatch.GetTimestamp(),step=Stopwatch.Frequency*60/1000;
            Test("frozen actual Listener reproduces speed rejection on controlled camera jump",delegate{
                var previous=Camera(now-step,0);var current=Camera(now,20);Cached(current);LegacyCameraListener.Reset(previous);
                bool rejected=false;try{LegacyCameraListener.Call(Session);}catch(System.IO.InvalidDataException e){rejected=e.Message=="listener-discontinuous";}
                Check(rejected,"unchanged actual Listener must reproduce listener-discontinuous");
            });
            Test("actual CameraSampler reuses cached acquisition without retimestamping",delegate{
                Cached(null);int calls=Rage.Native.NativeFunction.CameraCalls;var a=CameraSampler.Read();var b=CameraSampler.Read();
                Check(Object.ReferenceEquals(a,b)&&a.Before<=a.Observed&&a.Observed<=a.After,"original cached camera acquisition");
                Check(Rage.Native.NativeFunction.CameraCalls==calls+1,"one actual fake-native acquisition");
            });
            Test("normal continuous movement publishes measured native velocity",delegate{
                var t=new CameraListenerTracker();var first=t.Observe(Session,Camera(now));var second=t.Observe(Session,Camera(now+step,3));
                Check(first.Publish&&first.Listener.VelocityKind=="unavailable","honest initial velocity provenance");
                Check(second.Publish&&!second.Terminal&&second.Generation==1&&Math.Abs(second.Listener.Velocity[0]-50)<1e-9,"50 native units per second");
                Check(second.Listener.ObservationTicks==now+step&&second.Listener.Position[0]==3,"unchanged acquisition position/time");
            });
            Test("rapid ordinary rotation does not invent translation",delegate{
                var t=new CameraListenerTracker();t.Observe(Session,Camera(now));var a=Camera(now+step);a.Forward=new[]{1d,0d,0d};var d=t.Observe(Session,a);
                Check(d.Publish&&d.Generation==1&&d.Listener.Velocity[0]==0&&d.SpeedSquared==0,"90 degree camera rotation is valid");
            });
            Test("measured position cut is dropped and next fresh sample alone recovers",delegate{
                var t=new CameraListenerTracker();var a=Camera(now);t.Observe(Session,a);var b=Camera(now+step,20);var cut=t.Observe(Session,b);
                Check(!cut.Publish&&!cut.Terminal&&cut.Classification=="listener-position-discontinuity"&&cut.Generation==2,"measured cut starts generation");
                Check(Object.ReferenceEquals(cut.Previous,a)&&Object.ReferenceEquals(cut.Current,b)&&cut.Delta[0]==20&&cut.Velocity[0]==20/(step/(double)Stopwatch.Frequency),"actual operands retained without recomputation");
                Check(cut.SpeedSquared==cut.Velocity[0]*cut.Velocity[0]&&cut.Listener.VelocityKind=="unavailable"&&cut.Listener.Velocity[0]==0,"no velocity across cut published");
                var cache=t.Observe(Session,b);Check(!cache.Publish&&!cache.Terminal&&cache.Generation==2,"cached baseline cannot recover");
                var fresh=t.Observe(Session,Camera(now+2*step,21));Check(fresh.Publish&&fresh.Generation==2&&Math.Abs(fresh.Listener.Velocity[0]-1/(step/(double)Stopwatch.Frequency))<1e-9,"fresh velocity relative cut baseline only");
                Check(fresh.Listener.Sequence>cut.Listener.Sequence&&fresh.Listener.ObservationTicks>cut.Listener.ObservationTicks,"fresh original timing and sequence");
            });
            Test("orientation inversion and game-clock reset declare discontinuity",delegate{
                var t=new CameraListenerTracker();t.Observe(Session,Camera(now));var a=Camera(now+step);a.Forward=new[]{0d,-1d,0d};var d=t.Observe(Session,a);
                Check(!d.Publish&&!d.Terminal&&d.Classification=="listener-orientation-discontinuity"&&d.Generation==2,"orientation boundary");
                t=new CameraListenerTracker();t.Observe(Session,Camera(now));d=t.Observe(Session,Camera(now+step,0,0,1,999));
                Check(!d.Publish&&!d.Terminal&&d.Classification=="listener-game-clock-transition"&&d.Generation==2,"game clock boundary");
            });
            Test("pause loss is terminal independent of position cut",delegate{
                var t=new CameraListenerTracker();t.Observe(Session,Camera(now));var a=Camera(now+step,20);a.Paused=true;var d=t.Observe(Session,a);
                Check(!d.Publish&&d.Terminal&&d.Classification=="listener-paused"&&d.Listener==null,"paused camera cannot recover source");
            });
            Test("small reversed stale and inconsistent acquisitions reject safely",delegate{
                foreach(var a in new[]{Camera(now+Stopwatch.Frequency/10000),Camera(now-step),Camera(now+Stopwatch.Frequency/2),Camera(now,2)}){
                    var t=new CameraListenerTracker();t.Observe(Session,Camera(now));var d=t.Observe(Session,a);Check(d.Terminal&&!d.Publish&&d.Listener==null,"untrustworthy time cannot publish");
                }
                var tracker=new CameraListenerTracker();var bad=Camera(now);bad.Before=now+1;Check(tracker.Observe(Session,bad).Terminal,"reversed acquisition bracket");
            });
            Test("invalid numerical position and orientation remain terminal with exact operands",delegate{
                foreach(double value in new[]{Double.NaN,Double.PositiveInfinity,1000001}){
                    var t=new CameraListenerTracker();t.Observe(Session,Camera(now));var a=Camera(now+step,value);var d=t.Observe(Session,a);
                    Check(d.Terminal&&d.Classification=="listener-pose-invalid"&&Object.ReferenceEquals(d.Current,a),"retained invalid numerical operand");
                }
                var tracker=new CameraListenerTracker();var bad=Camera(now);bad.Forward=new[]{1d,1d,0d};Check(tracker.Observe(Session,bad).Terminal,"nonorthonormal basis");
            });
            Test("actual retained RPH sampler permanently retires on deliberate dismount",delegate{
                Rage.Game.LocalPlayer.Character=new Rage.Ped{Handle=new Rage.PoolHandle{Value=0x304,Index=3,Counter=4},MemoryAddress=new IntPtr(200)};
                var player=Rage.Game.LocalPlayer.Character;var vehicle=new Rage.Vehicle{Handle=new Rage.PoolHandle{Value=0x102,Index=1,Counter=2},MemoryAddress=new IntPtr(100),Driver=player};player.CurrentVehicle=vehicle;
                RphHandoffSampler sampler;string why;Check(RphHandoffSampler.TryAcquire(out sampler,out why),"actual retained fake-SDK sampler acquired");
                Check(sampler.Capture(out why)!=null,"verified mounted driver before cut");int calls=Rage.Native.NativeFunction.CameraCalls;player.CurrentVehicle=null;
                Check(sampler.Capture(out why)==null&&sampler.Retired&&why=="rph-current-driver-changed"&&sampler.RetirementReason==why,"dismount concrete terminal cause");
                player.CurrentVehicle=vehicle;Check(sampler.Capture(out why)==null&&sampler.Retired,"remount cannot resurrect retired source owner");
                Check(Rage.Native.NativeFunction.CameraCalls==calls,"driver retirement invokes no camera acquisition");
            });
            Test("actual15 diagnostic hook retains measured operands and makes admission failure terminal",delegate{
                var player=new Rage.Ped{Handle=new Rage.PoolHandle{Value=0x304,Index=3,Counter=4},MemoryAddress=new IntPtr(200)};
                var vehicle=new Rage.Vehicle{Handle=new Rage.PoolHandle{Value=0x102,Index=1,Counter=2},MemoryAddress=new IntPtr(100),Driver=player};
                player.CurrentVehicle=vehicle;Rage.Game.LocalPlayer.Character=player;
                RphHandoffSampler sampler;string why;Check(RphHandoffSampler.TryAcquire(out sampler,out why),"mounted hook owner");var peer=sampler.Capture(out why);
                long captured=Stopwatch.GetTimestamp();var baseline=Camera(captured-step);var cut=Camera(captured,20);Cached(cut);CameraListenerHook.Reset(Session,baseline);
                var o=new H.Observation(Session,1,7,H.QualifiedDiagnosticScope(),null,null,peer.Context,peer.Context,captured-1,captured,0x3e4ccccd,H.Decode(0x3e4ccccd),true,"good");
                var source=new H.Candidate(o,captured-1,captured,captured+Stopwatch.Frequency/4,Stopwatch.Frequency);var journal=new ShvHandoffJournal();bool publish;
                var listener=CameraListenerHook.Call(Session,sampler,source,peer,journal,out publish);
                var fields=new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<Dictionary<string,object>>(journal.Json);
                var previous=(Dictionary<string,object>)fields["previous"];var current=(Dictionary<string,object>)fields["current"];
                Check(!publish&&listener.Generation==2&&journal.Kind=="listener-rejection"&&(string)fields["classification"]=="listener-position-discontinuity","hook discards measured cut");
                Check(Convert.ToInt64(previous["observed"])==baseline.Observed&&Convert.ToInt64(current["observed"])==cut.Observed&&Convert.ToDouble(fields["dt"])==step/(double)Stopwatch.Frequency,"original previous/current times and exact measured dt");
                Check(Convert.ToInt64(fields["sourceSequence"])==7&&fields.ContainsKey("sourcePeer")&&fields.ContainsKey("beforeCamera")&&fields.ContainsKey("afterCamera"),"source and original peer ordering context retained");
                CameraListenerHook.Reset(Session,baseline);journal.Fail=true;bool failed=false;
                try{CameraListenerHook.Call(Session,sampler,source,peer,journal,out publish);}catch(System.IO.InvalidDataException error){failed=error.Message=="listener-diagnostic-write-failed";}
                Check(failed,"diagnostic admission failure is visible terminal rejection");
                var invalid=Camera(captured,Double.NaN);Cached(invalid);CameraListenerHook.Reset(Session,baseline);journal.Fail=false;failed=false;
                try{CameraListenerHook.Call(Session,sampler,source,peer,journal,out publish);}catch(System.IO.InvalidDataException error){failed=error.Message=="listener-pose-invalid";}
                fields=new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<Dictionary<string,object>>(journal.Json);
                current=(Dictionary<string,object>)fields["current"];var position=(System.Collections.IList)current["position"];
                Check(failed&&(string)position[0]=="NaN","invalid exact numerical operand remains parseable private diagnostic");
                player.CurrentVehicle=null;int calls=Rage.Native.NativeFunction.CameraCalls;failed=false;
                try{CameraListenerHook.Call(Session,sampler,source,peer,journal,out publish);}catch(System.IO.InvalidDataException error){failed=error.Message=="rph-current-driver-changed";}
                Check(failed&&Rage.Native.NativeFunction.CameraCalls==calls,"actual15 hook recognises deliberate driver loss before camera policy");
            });
            Console.WriteLine("{\"passed\":true,\"cases\":"+cases.Count+",\"assertions\":"+assertions+",\"gameLaunched\":false,\"endpointOpened\":false,\"casesPassed\":[\""+String.Join("\",\"",cases.ToArray())+"\"]}");return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
