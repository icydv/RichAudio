// Single attached vehicle. All getters run on the existing listener game fiber;
// the latest-value publisher owns encoding and IO off that fiber.
using System;
using System.Diagnostics;
using System.Globalization;
using System.Threading;
using Rage;
using Rage.Attributes;
using RichAudio.Beacon.Transport;
namespace RichAudio.Beacon.Rph
{
    public static class VehicleDemo
    {
        private static Vehicle attached;private static string identity,profile,reason="idle";private static VehiclePublisher writer;
        private static volatile bool requested;private static bool used;private static long sequence,observations,ratioSamples,ratioChanges,gearChanges,missingRatio,missingGear;
        private static double ratioMin=Double.PositiveInfinity,ratioMax=Double.NegativeInfinity;private static double? previousRatio;private static int? previousGear;
        private static VehiclePacket last;
        [ConsoleCommand(Name="RichAudioVehicleDemoStart",Description="Attach current player-driven car: v12 or v8. Original estimated synthesis; additive GTA stock audio remains. One Start per plugin.")]
        public static void Start(string selectedProfile="v12")
        {
            if(selectedProfile!="v12"&&selectedProfile!="v8"){Game.Console.Print("RichAudio vehicle profile must be v12 or v8.");return;}
            if(used||requested){Game.Console.Print("RichAudio vehicle one Start per plugin instance; reload only under a fresh reviewed attempt.");return;}
            try{
                var ped=Game.LocalPlayer.Character;var vehicle=ped==null||!ped.IsValid()?null:ped.CurrentVehicle;
                if(vehicle==null||!vehicle.IsValid()||!vehicle.IsCar||vehicle.Driver==null||!vehicle.Driver.IsValid()||vehicle.Driver.Handle.Value!=ped.Handle.Value){
                    Game.Console.Print("RichAudio vehicle requires the local player driving one valid car. No attachment made.");return;}
                if(!ListenerBridge.TryStartVehicle()){Game.Console.Print("RichAudio listener unavailable or its one-session permit already used.");return;}
                attached=vehicle;identity="player-"+vehicle.Handle.Value.ToString("X8");profile=selectedProfile=="v12"?"original-hypercar-v12":"original-supercharged-v8";
                requested=true;used=true;reason="waiting-listener";
                Game.Console.Print("RichAudio vehicle attached "+profile+". ADDITIVE EXPERIMENTAL PLAYBACK: GTA stock engine remains audible. RPM/load are bounded synthesis estimates; normalized getter validation pending. Host remains manually muted until its reviewed Start.");
            }catch(ThreadAbortException){throw;}catch(Exception e){reason="attachment-failed";Game.Console.Print("RichAudio vehicle attachment failed: "+e.GetType().Name);ListenerBridge.Stop();}
        }
        [ConsoleCommand(Name="RichAudioVehicleDemoStop",Description="Detach all original vehicle components and stop this listener session")]
        public static void Stop(){requested=false;reason="manual-stop";ListenerBridge.Stop();}
        [ConsoleCommand(Name="RichAudioVehicleDemoStatus",Description="Report attachment, getter variation and provenance; no coordinates")]
        public static void Status()
        {
            var p=writer;string range=ratioSamples==0?"unavailable":ratioMin.ToString("F5",CultureInfo.InvariantCulture)+".."+ratioMax.ToString("F5",CultureInfo.InvariantCulture);
            Game.Console.Print("RichAudio vehicle requested="+requested+" profile="+(profile??"none")+" reason="+reason+" samples="+observations+" ratioRange="+range+" ratioChanges="+ratioChanges+" ratioMissing="+missingRatio+" gearChanges="+gearChanges+" gearMissing="+missingGear+" sent="+(p==null?0:p.Sent)+"; getter variation is evidence only, never crankshaft RPM. Synthetic RPM/load estimated. Additive stock audio remains.");
        }
        private static double[] V(Vector3 p){return new[]{(double)p.X,(double)p.Y,(double)p.Z};}
        public static void Observe(ListenerState listener,bool listenerAccepted)
        {
            if(!requested||!listenerAccepted)return;
            try{
                if(attached==null||!attached.IsValid()){reason="vehicle-despawned";StopAttached();return;}
                var ped=Game.LocalPlayer.Character;if(ped==null||!ped.IsValid()){reason="player-unavailable";StopAttached();return;}
                var current=ped.CurrentVehicle;if(current!=null&&current.IsValid()&&current.Handle.Value!=attached.Handle.Value){reason="player-vehicle-changed";StopAttached();return;}
                if(!listener.Valid||listener.Paused){reason="listener-unavailable";StopAttached();return;}
                long before=Stopwatch.GetTimestamp();double[] position=V(attached.Position),velocity=V(attached.Velocity),forward=V(attached.ForwardVector),up=V(attached.UpVector);
                bool engine=attached.IsEngineOn;uint model=attached.Model.Hash;double speed=attached.Speed;double? ratio=null;int? gear=null;
                try{double value=attached.EngineRevolutionsRatio;if(Protocol.Finite(value)&&value>=0&&value<=1)ratio=value;}catch{}
                try{int value=attached.CurrentGear;if(value>=0&&value<=12)gear=value;}catch{}
                long after=Stopwatch.GetTimestamp();
                if((after-before)*1000.0/Stopwatch.Frequency>50){reason="slow-vehicle-observation";StopAttached();return;}
                if(ratio.HasValue){ratioSamples++;ratioMin=Math.Min(ratioMin,ratio.Value);ratioMax=Math.Max(ratioMax,ratio.Value);if(previousRatio.HasValue&&Math.Abs(previousRatio.Value-ratio.Value)>1e-4)ratioChanges++;previousRatio=ratio;}else missingRatio++;
                if(gear.HasValue){if(previousGear.HasValue&&previousGear.Value!=gear.Value)gearChanges++;previousGear=gear;}else missingGear++;
                var packet=new VehiclePacket{Version=1,Session=listener.Session,ListenerGeneration=listener.Generation,Generation=1,Sequence=sequence++,ObservationTicks=before+(after-before)/2,
                    ClockFrequency=Stopwatch.Frequency,GameTimeMs=listener.GameTimeMs,SourcePid=(uint)Process.GetCurrentProcess().Id,VehicleId=identity,Model=model,Profile=profile,Action="update",
                    Position=position,Velocity=velocity,Forward=forward,Up=up,Speed=speed,EngineRunning=engine,RpmRatio=ratio,Gear=gear,Valid=true,Reason="valid",Rights="original-generated",Coordinates="gta-native-unscaled",Units="native-unverified"};
                VehicleProtocol.Validate(packet);
                if(writer==null){writer=new VehiclePublisher(VehicleWire.PipeName);writer.Start();}
                if(writer.Finished){reason="vehicle-transport-ended";StopAttached();return;}
                writer.Publish(packet);last=packet;observations++;reason="observing";
            }catch(ThreadAbortException){throw;}catch(Exception){reason="vehicle-getter-failed";StopAttached();}
        }
        private static void StopAttached(){requested=false;ListenerBridge.Stop();}
        // Called before the listener's deliberate Stop; removal is attempted once.
        // Failure still invokes the host's authoritative listener/output stop.
        public static void End()
        {
            requested=false;attached=null;var p=writer;writer=null;if(p==null)return;
            try{if(last!=null){var removal=VehicleProtocol.Copy(last);removal.Sequence=sequence++;removal.ObservationTicks=Stopwatch.GetTimestamp();removal.Action="remove";removal.Valid=false;removal.EngineRunning=false;removal.Reason=reason=="observing"?"listener-ended":reason;p.Publish(removal);}p.Complete();
                long begin=Stopwatch.GetTimestamp();while(!p.Finished&&(Stopwatch.GetTimestamp()-begin)*1000.0/Stopwatch.Frequency<500)GameFiber.Sleep(5);
            }finally{ThreadPool.QueueUserWorkItem(delegate{p.Dispose();});}
        }
        public static void Unload(){requested=false;attached=null;var p=writer;if(p!=null)p.RequestStop();}
    }
}
