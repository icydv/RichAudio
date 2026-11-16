using System;
using System.Collections.Generic;
using System.Globalization;
using GTA;
using GTA.Math;
using GTA.Native;

namespace RichAudio.NativeSuppression01
{
    internal enum TransitionOutcome { READY, PENDING, UNSAFE, TIMED_OUT }
    internal enum SetupStep { Site, Models, PairSettled, SeatInitial, AInitial, BInitial, ExitBPre, AOffBPre, BViewPre, CameraInitial, CameraBPre, SeatBaseline, ABaseline, CameraBaseline, ExitBPost, AOffBPost, BViewPost, CameraBPost, ExitRetire, Retire, Restore }
    internal sealed class SetupResult {
        internal TransitionOutcome Outcome; internal string Reason, Evidence, Command;
        internal bool CanIssue;
        internal static SetupResult Make(TransitionOutcome outcome,string reason,string evidence,bool issue=false,string command="never-issued") {
            return new SetupResult{Outcome=outcome,Reason=reason,Evidence=evidence,CanIssue=issue,Command=command};
        }
    }
    // A narrow native-call boundary. Tests substitute game responses AFTER the
    // retained SDK has built the actual InputArgument objects. No startup,
    // controller, adapter guard or native-argument helper is skipped.
    internal interface IIdleNativeCalls {
        T Call<T>(Hash hash,params InputArgument[] arguments);
        void Call(Hash hash,params InputArgument[] arguments);
        int GameTime {get;} int FrameCount {get;} bool Paused {get;}
        void RegisterDecorator(string name,IIdleDecoratorLock guard,Action<string> log);
    }
    internal sealed class IdleNativeCalls:IIdleNativeCalls {
        public T Call<T>(Hash hash,params InputArgument[] arguments){return Function.Call<T>(hash,arguments);}
        public void Call(Hash hash,params InputArgument[] arguments){Function.Call(hash,arguments);}
        public int GameTime {get{return Game.GameTime;}} public int FrameCount {get{return Game.FrameCount;}} public bool Paused {get{return Game.IsPaused;}}
        public void RegisterDecorator(string name,IIdleDecoratorLock guard,Action<string> log){IdleDecoratorRegistration.Ensure(name,guard,log);}
    }
    internal sealed class VehicleObservation {
        internal Lifetime Life;internal bool Exists,Identity,Data,Engine,Dead,Driveable,Collision,Air,Wheels;
        internal uint Model;internal int Token,Driver,Passenger;internal bool Owned,Decor;
        internal float Speed;
        internal Vector3 Position;internal float Heading;
        internal bool Still {get{return Data&&!Single.IsNaN(Speed)&&!Single.IsInfinity(Speed)&&Speed>=0&&Speed<.15f;}}
        internal bool Contact {get{return Data&&Collision&&!Air;}}
        public override string ToString(){
            if(Life==null)return "not-created";
            string id="role="+Life.Role+",handle="+Life.Handle+",expectedToken="+Life.Token+",lost="+Life.Lost+",deleted="+Life.Deleted+",deleteIssued="+Life.DeleteIssued+",deleteUnknown="+Life.DeleteUnknown+",exists="+Exists+",model="+Model.ToString("X8")+",owned="+Owned+",decor="+Decor+",token="+Token;
            return id+(Data?",driver="+Driver+",passenger="+Passenger+",engine="+Engine+",speed="+Speed.ToString("R",CultureInfo.InvariantCulture)+",dead="+Dead+",driveable="+Driveable+",collision="+Collision+",air="+Air+",allWheels="+Wheels+",position="+Position+",heading="+Heading.ToString("R",CultureInfo.InvariantCulture):",operatingFields=not-observed");
        }
    }
    internal sealed class SetupObservation {
        internal bool Story,Paused,PlayerValid,InVehicle,Entering,PlayerCollision,PlayerAir;
        internal int Ped,ExpectedPed,CurrentVehicle,FrameBefore,FrameAfter;
        internal uint PlayerModel; internal float PlayerSpeed;
        internal Vector3 Position;internal VehicleObservation A,B;
        internal bool Coherent {get{return FrameBefore==FrameAfter;}}
        public override string ToString(){return "frame="+FrameBefore+"/"+FrameAfter+",story="+Story+",paused="+Paused+",ped="+Ped+",expectedPed="+ExpectedPed+",pedModel="+PlayerModel.ToString("X8")+",playerValid="+PlayerValid+",inVehicle="+InVehicle+",entering="+Entering+",currentVehicle="+CurrentVehicle+",playerSpeed="+PlayerSpeed.ToString("R",CultureInfo.InvariantCulture)+",playerCollision="+PlayerCollision+",playerAir="+PlayerAir+",playerPosition="+Position+"; A{"+A+"}; B{"+B+"}";}
    }
}
