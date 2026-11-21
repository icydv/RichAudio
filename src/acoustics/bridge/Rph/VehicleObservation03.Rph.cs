#if VEHICLE_OBSERVATION_03_RPH
using System;
using Rage;
using Rage.Native;
using RichAudio.Acoustics.Observation;

namespace RichAudio.Acoustics.Rph
{
    // No plugin entry point, registration, automatic fiber or native mutation.
    // This file is excluded from existing builds. Compiling against declarations
    // is not proof that these getters behave correctly on the Enhanced runtime.
    public sealed class RphVehicleObservationApi03:IVehicleObservationApi03
    {
        public const ulong IsHornActiveHash=0x9D6BFC12B05C6121;
        readonly Vehicle retained;
        readonly Func<bool> permittedStoryScope;
        public RphVehicleObservationApi03(Vehicle retained,Func<bool> permittedStoryScope)
        {
            if(retained==null||permittedStoryScope==null)throw new ArgumentNullException();
            this.retained=retained;this.permittedStoryScope=permittedStoryScope;
        }
        public VehicleIdentity03 ReadIdentity()
        {
            if(!permittedStoryScope())throw new InvalidOperationException("Story scope unqualified");
            if(!retained.IsValid()||retained.IsDead)
                return new VehicleIdentity03{exists=false,inPlayerDriverScope=false};
            var h=retained.Handle;
            var player=Game.LocalPlayer.Character;
            var current=player==null?null:player.CurrentVehicle;
            var driver=retained.Driver;
            bool scope=player!=null&&player.IsValid()&&!player.IsDead&&current!=null&&current.IsValid()&&
                current.Handle.Value==h.Value&&current.Handle.Counter==h.Counter&&driver!=null&&driver.IsValid()&&
                driver.Handle.Value==player.Handle.Value&&driver.Handle.Counter==player.Handle.Counter;
            return new VehicleIdentity03{poolValue=h.Value,poolIndex=h.Index,poolCounter=h.Counter,
                model=retained.Model.Hash,exists=true,inPlayerDriverScope=scope};
        }
        public bool ReadHornPlaying(){return NativeFunction.CallByHash<bool>(IsHornActiveHash,retained);}
        public bool ReadEngineOn(){return retained.IsEngineOn;}
        public bool ReadEngineStarting(){return retained.IsEngineStarting;}
        public double ReadRawRevolutionsRatio(){return retained.EngineRevolutionsRatio;}
        public int ReadCurrentGear(){return retained.CurrentGear;}
        public double ReadRawSpeed(){return retained.Speed;}
    }
    public sealed class RphVehicleContactApi03:IVehicleContactApi03
    {
        readonly Vehicle retained;readonly RphVehicleObservationApi03 identity;
        public RphVehicleContactApi03(Vehicle retained,Func<bool> permittedStoryScope)
        {
            identity=new RphVehicleObservationApi03(retained,permittedStoryScope);this.retained=retained;
        }
        public VehicleIdentity03 ReadIdentity(){return identity.ReadIdentity();}
        public bool ReadLastCollision(out double[] position,out double[] normal,out string materialName)
        {
            Vector3 at,direction;
            bool found=retained.GetLastCollision(out at,out direction,out materialName);
            position=found?new[]{(double)at.X,at.Y,at.Z}:null;
            normal=found?new[]{(double)direction.X,direction.Y,direction.Z}:null;
            return found;
        }
    }
}
#endif
