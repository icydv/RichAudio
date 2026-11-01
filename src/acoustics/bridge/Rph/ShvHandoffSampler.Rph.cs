#if SHV_HANDOFF_09
// Actual RPH game-fiber observations. The opaque addresses below are compared
// as API-returned identity values only; no entity memory is read or modified.
using System;
using System.Diagnostics;
using Rage;
using RichAudio.Beacon.Rph;
using H=RichAudio.Beacon.Handoff.ShvOperatingStateHandoff;

namespace RichAudio.Beacon.Handoff
{
    internal sealed class RphHandoffSampler
    {
        internal readonly Ped RetainedPed;
        internal readonly Vehicle RetainedVehicle;
        internal readonly uint PedIndex,PedValue,VehicleIndex,VehicleValue;
        internal readonly byte PedCounter,VehicleCounter;
        internal readonly ulong PedAddress,VehicleAddress;
        internal readonly string PlayerKey,PedKey,VehicleKey;
        bool retired;
        internal bool Retired{get{return retired;}}

        private RphHandoffSampler(Ped ped,Vehicle vehicle)
        {
            RetainedPed=ped;RetainedVehicle=vehicle;
            var ph=ped.Handle;var vh=vehicle.Handle;
            PedIndex=ph.Index;PedCounter=ph.Counter;PedValue=ph.Value;
            VehicleIndex=vh.Index;VehicleCounter=vh.Counter;VehicleValue=vh.Value;
            PedAddress=Address(ped);VehicleAddress=Address(vehicle);
            PlayerKey="rph-local-player";PedKey="ped-"+Guid.NewGuid().ToString("N");
            VehicleKey="vehicle-"+Guid.NewGuid().ToString("N");
        }
        internal static ulong Address(Entity entity)
        {
            long value=entity.MemoryAddress.ToInt64();
            return value>0?(ulong)value:0;
        }
        internal static bool TryAcquire(out RphHandoffSampler sampler,out string reason)
        {
            sampler=null;reason="waiting-current-player-bati";
            try
            {
                if(!CameraSampler.StoryReady()||Game.IsPaused)return false;
                var player=Game.LocalPlayer.Character;
                if(player==null||!player.IsValid()||player.IsDead)return false;
                var vehicle=player.CurrentVehicle;
                if(vehicle==null||!vehicle.IsValid()||vehicle.IsDead||vehicle.Model.Hash!=H.BatiModel)return false;
                var driver=vehicle.Driver;
                if(driver==null||!driver.IsValid()||driver.Handle.Value!=player.Handle.Value||Address(driver)!=Address(player))return false;
                if(!vehicle.IsEngineOn)return false;
                var value=new RphHandoffSampler(player,vehicle);
                if(value.PedAddress==0||value.VehicleAddress==0)return false;
                string checkedReason;
                if(value.Capture(out checkedReason)==null){reason=checkedReason;return false;}
                sampler=value;reason="independent-rph-instance-acquired";return true;
            }
            catch(System.Threading.ThreadAbortException){throw;}
            catch{reason="rph-acquisition-failed";return false;}
        }
        internal void Retire(){retired=true;}
        internal HandoffPeerObservation Capture(out string reason)
        {
            reason="rph-instance-retired";if(retired)return null;
            try
            {
                long before=Stopwatch.GetTimestamp();
                if(!CameraSampler.StoryReady()||Game.IsPaused)return Reject("rph-story-scope-lost",out reason);
                var player=Game.LocalPlayer.Character;
                if(!RetainedPed.IsValid()||!RetainedVehicle.IsValid()||player==null||!player.IsValid()
                    ||player.IsDead||RetainedPed.IsDead||RetainedVehicle.IsDead)return Reject("rph-retained-instance-invalid",out reason);
                var ph=RetainedPed.Handle;var vh=RetainedVehicle.Handle;
                if(ph.Value!=PedValue||ph.Index!=PedIndex||ph.Counter!=PedCounter
                    ||vh.Value!=VehicleValue||vh.Index!=VehicleIndex||vh.Counter!=VehicleCounter
                    ||Address(RetainedPed)!=PedAddress||Address(RetainedVehicle)!=VehicleAddress
                    ||player.Handle.Value!=PedValue||Address(player)!=PedAddress)
                    return Reject("rph-local-lifetime-changed",out reason);
                var current=player.CurrentVehicle;var driver=RetainedVehicle.Driver;
                if(current==null||!current.IsValid()||current.Handle.Value!=VehicleValue||Address(current)!=VehicleAddress
                    ||driver==null||!driver.IsValid()||driver.Handle.Value!=PedValue||Address(driver)!=PedAddress)
                    return Reject("rph-current-driver-changed",out reason);
                uint model=RetainedVehicle.Model.Hash;
                if(model!=H.BatiModel||!RetainedVehicle.IsEngineOn)return Reject("rph-model-or-running-scope-lost",out reason);
                double[] position=Vector(RetainedVehicle.Position),velocity=Vector(RetainedVehicle.Velocity);
                double[] forward=Vector(RetainedVehicle.ForwardVector),up=Vector(RetainedVehicle.UpVector);
                if(!Pose(position,velocity,forward,up))return Reject("rph-pose-invalid",out reason);
                // Re-read own-domain lifetime/relationship after the pose getters.
                if(!RetainedPed.IsValid()||!RetainedVehicle.IsValid()||RetainedPed.IsDead||RetainedVehicle.IsDead||RetainedPed.Handle.Value!=PedValue
                    ||RetainedPed.Handle.Counter!=PedCounter||RetainedVehicle.Handle.Value!=VehicleValue
                    ||RetainedVehicle.Handle.Counter!=VehicleCounter||Address(RetainedPed)!=PedAddress
                    ||Address(RetainedVehicle)!=VehicleAddress)return Reject("rph-post-pose-lifetime-changed",out reason);
                var postPlayer=Game.LocalPlayer.Character;
                if(postPlayer==null||!postPlayer.IsValid()||postPlayer.IsDead)return Reject("rph-post-player-invalid",out reason);
                var postCurrent=postPlayer.CurrentVehicle;var postDriver=RetainedVehicle.Driver;
                if(postPlayer.Handle.Value!=PedValue||Address(postPlayer)!=PedAddress
                    ||postCurrent==null||!postCurrent.IsValid()||postCurrent.Handle.Value!=VehicleValue||Address(postCurrent)!=VehicleAddress
                    ||postDriver==null||!postDriver.IsValid()||postDriver.Handle.Value!=PedValue||Address(postDriver)!=PedAddress
                    ||RetainedVehicle.Model.Hash!=model||!RetainedVehicle.IsEngineOn||!CameraSampler.StoryReady()||Game.IsPaused)
                    return Reject("rph-post-pose-relationship-changed",out reason);
                long after=Stopwatch.GetTimestamp();
                if(after<before||(decimal)(after-before)*1000/Stopwatch.Frequency>10)
                    return Reject("rph-peer-acquisition-over-budget",out reason);
                var context=new H.HostContext(PlayerKey,PedKey,VehicleKey,VehicleKey,PedKey,1,model,true,true,before,after);
                reason="independent-rph-observation";
                return HandoffPeerObservation.FromRph(this,context,position,velocity,forward,up);
            }
            catch(System.Threading.ThreadAbortException){throw;}
            catch{return Reject("rph-observation-failed",out reason);}
        }
        HandoffPeerObservation Reject(string value,out string reason){retired=true;reason=value;return null;}
        static double[] Vector(Vector3 v){return new[]{(double)v.X,(double)v.Y,(double)v.Z};}
        static bool Pose(double[] position,double[] velocity,double[] forward,double[] up)
        {
            foreach(var vector in new[]{position,velocity,forward,up})foreach(double x in vector)
                if(Double.IsNaN(x)||Double.IsInfinity(x)||Math.Abs(x)>100000)return false;
            double speed=0,fn=0,un=0,dot=0;
            for(int i=0;i<3;i++){speed+=velocity[i]*velocity[i];fn+=forward[i]*forward[i];un+=up[i]*up[i];dot+=forward[i]*up[i];}
            return speed<=10000&&Math.Abs(Math.Sqrt(fn)-1)<.0001&&Math.Abs(Math.Sqrt(un)-1)<.0001&&Math.Abs(dot)<.0001;
        }
    }

    internal sealed partial class HandoffPeerObservation
    {
        internal static HandoffPeerObservation FromRph(RphHandoffSampler owner,H.HostContext context,
            double[] position,double[] velocity,double[] forward,double[] up)
        {
            if(owner==null||owner.Retired)throw new InvalidOperationException("retired RPH witness issuer");
            return new HandoffPeerObservation(owner,context,owner.VehicleAddress,owner.PedAddress,
                owner.VehicleIndex,owner.VehicleCounter,owner.VehicleValue,owner.PedIndex,owner.PedCounter,owner.PedValue,
                position,velocity,forward,up);
        }
    }
}
#endif
