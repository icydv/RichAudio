// Explicit opt-in addition to the listener plugin; the original one-shot research
// plugins are unchanged. Only the listener's game fiber calls Observe.
using System;
using System.Diagnostics;
using System.Threading;
using Rage;
using Rage.Attributes;
using Rage.Native;
using RichAudio.GeometryResearch;
using RichAudio.GeometryLive;
using RichAudio.Beacon.Transport;
namespace RichAudio.Beacon.Rph
{
    public static class GeometryBridge
    {
        private static volatile bool requested;private static int sessions;
        private static SensingSession sensing;private static GeometryPublisher writer;
        private static string reason="idle";private static int lastCalls;
        [ConsoleCommand(Name="RichAudioGeometryStart",Description="Opt in to <=12 seconds / 72 world-only rays while stationary on foot; requires active beacon")]
        public static void Start(){if(sessions<2&&sensing==null)requested=true;}
        [ConsoleCommand(Name="RichAudioGeometryStop",Description="Stop bounded sensing, invalidate geometry; listener and native game audio unchanged")]
        public static void Stop(){requested=false;}
        [ConsoleCommand(Name="RichAudioGeometryStatus",Description="Bounded geometry counters only; no coordinates")]
        public static void Status(){Game.Console.Print("RichAudio geometry requested="+requested+" sessions="+sessions+"/2 currentOrLastCalls="+(sensing==null?lastCalls:sensing.Calls)+" reason="+reason+"; no stock audio ownership.");}
        public static void Observe(ListenerState listener)
        {
            try{ObserveCore(listener);}catch(ThreadAbortException){throw;}catch(Exception e){reason=e.GetType().Name;End();}
        }
        private static void ObserveCore(ListenerState listener)
        {
            if(requested&&sensing==null&&sessions<2){
                sessions++;var p=new GeometryPublisher(GeometryWire.PipeName);writer=p;
                string exe=Process.GetCurrentProcess().MainModule.FileName;
                string build=FileVersionInfo.GetVersionInfo(exe).FileVersion,framework=FileVersionInfo.GetVersionInfo(typeof(Game).Assembly.Location).FileVersion;
                if(!System.IO.Path.GetFileName(exe).Equals("GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||build!="1.0.1158.16"||framework!="1.132.1428.17748")
                    throw new NotSupportedException("Exact geometry build guard");
                sensing=new SensingSession(new RphWorld(),new GeometryClock(),listener,Guid.NewGuid().ToString("N"),
                    Process.GetCurrentProcess().Id,build,framework,p.Publish);p.Start();reason="sensing";
            }
            var s=sensing;if(s==null)return;
            if(!requested||writer.Finished)s.Stop(!requested?"manual-stop":"transport-ended");else if(writer.Connected)s.Step(listener);
            if(s.Stopped){reason=s.EndReason;lastCalls=s.Calls;writer.Complete();requested=false;sensing=null;writer=null;}
        }
        public static void End(){requested=false;var s=sensing;if(s!=null){s.Stop("listener-ended");lastCalls=s.Calls;}sensing=null;var p=writer;writer=null;if(p!=null)p.Complete();}
        private sealed class RphWorld:IGeometryWorld
        {
            private static Point3 P(Vector3 v){return new Point3(v.X,v.Y,v.Z);}
            public WorldPose ReadPose(){Ped ped=Game.LocalPlayer.Character;if(ped==null||!ped.IsValid())throw new InvalidOperationException("player unavailable");
                Vehicle vehicle=ped.CurrentVehicle;return new WorldPose{Position=P(ped.Position),Forward=P(ped.ForwardVector),Speed=P(ped.Velocity).Length,
                    Player=ped.Handle.Value,Interior=NativeFunction.CallByName<int>("GET_INTERIOR_FROM_ENTITY",ped),Paused=Game.IsPaused,
                    Story=!NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")&&!NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"),
                    OnFoot=vehicle==null||!vehicle.IsValid()};}
            public Collision Query(PlannedRay r,uint player){Ped ped=Game.LocalPlayer.Character;if(ped==null||!ped.IsValid()||ped.Handle.Value!=player)throw new InvalidOperationException("player changed");
                HitResult h=World.TraceLine(new Vector3((float)r.Origin.X,(float)r.Origin.Y,(float)r.Origin.Z),
                    new Vector3((float)r.End.X,(float)r.End.Y,(float)r.End.Z),TraceFlags.IntersectWorld,new Entity[]{ped});
                var hit=new Collision{Hit=h.Hit};if(h.Hit){hit.Position=P(h.HitPosition);hit.Normal=P(h.HitNormal);
                    Entity e=h.HitEntity;if(e!=null){if(e.IsValid()){hit.Entity=e.Handle.Value;hit.EntityStatus="returned_identity_unclassified";}else hit.EntityStatus="returned_invalid_identity";}}
                return hit;
            }
        }
    }
}
