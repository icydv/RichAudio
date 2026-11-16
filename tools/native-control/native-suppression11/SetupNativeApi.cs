using System;
using System.Globalization;
using System.Collections.Generic;
using System.Threading;
using GTA.Math;
using GTA.Native;
namespace RichAudio.NativeSuppression01
{
    internal sealed partial class IdleNativeApi
    {
        Vector3 requestedStanding;
        readonly HashSet<SetupStep> completed=new HashSet<SetupStep>();
        static bool IsSeat(SetupStep s){return s==SetupStep.SeatInitial||s==SetupStep.SeatBaseline;}
        static bool IsExit(SetupStep s){return s==SetupStep.ExitBPre||s==SetupStep.ExitBPost||s==SetupStep.ExitRetire;}
        bool InFlight(Func<SetupStep,bool> select){foreach(var key in issued.Keys)if(select(key)&&!completed.Contains(key))return true;return false;}
        VehicleObservation Vehicle(Lifetime life) {
            var v=new VehicleObservation{Life=life};if(life==null)return v;
            v.Exists=native.Call<bool>(Hash.DOES_ENTITY_EXIST,life.Handle);
            if(!v.Exists){if(!life.DeleteIssued&&!life.Deleted)life.Lost=true;return v;}
            v.Model=native.Call<uint>(Hash.GET_ENTITY_MODEL,life.Handle);v.Owned=native.Call<bool>(Hash.DOES_ENTITY_BELONG_TO_THIS_SCRIPT,life.Handle,true);
            v.Decor=native.Call<bool>(Hash.DECOR_EXIST_ON,life.Handle,Decorator);if(v.Decor)v.Token=native.Call<int>(Hash.DECOR_GET_INT,life.Handle,Decorator);
            v.Identity=!life.Lost&&!life.Deleted&&v.Model==Bati&&v.Owned&&v.Decor&&v.Token==life.Token;
            if(!v.Identity){life.Lost=true;return v;}
            v.Data=true;v.Driver=native.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT,life.Handle,-1,false);v.Passenger=native.Call<int>(Hash.GET_PED_IN_VEHICLE_SEAT,life.Handle,0,false);
            v.Engine=native.Call<bool>(Hash.GET_IS_VEHICLE_ENGINE_RUNNING,life.Handle);v.Speed=native.Call<float>(Hash.GET_ENTITY_SPEED,life.Handle);
            v.Dead=native.Call<bool>(Hash.IS_ENTITY_DEAD,life.Handle);v.Driveable=native.Call<bool>(Hash.IS_VEHICLE_DRIVEABLE,life.Handle,false);
            v.Collision=native.Call<bool>(Hash.HAS_COLLISION_LOADED_AROUND_ENTITY,life.Handle);v.Air=native.Call<bool>(Hash.IS_ENTITY_IN_AIR,life.Handle);v.Wheels=native.Call<bool>(Hash.IS_VEHICLE_ON_ALL_WHEELS,life.Handle);
            v.Position=native.Call<Vector3>(Hash.GET_ENTITY_COORDS,life.Handle,true);v.Heading=native.Call<float>(Hash.GET_ENTITY_HEADING,life.Handle);
            return v;
        }
        SetupObservation Observe(Lifetime aLife,Lifetime bLife) {
            Context();var s=new SetupObservation{FrameBefore=native.FrameCount,ExpectedPed=savedPed,Paused=native.Paused};s.Story=StoryReady;s.Ped=native.Call<int>(Hash.PLAYER_PED_ID);
            bool exists=s.Ped!=0&&native.Call<bool>(Hash.DOES_ENTITY_EXIST,s.Ped);
            if(exists){s.PlayerModel=native.Call<uint>(Hash.GET_ENTITY_MODEL,s.Ped);s.PlayerValid=!pedLost&&s.Ped==savedPed&&s.PlayerModel==unchecked((uint)savedModel)&&!native.Call<bool>(Hash.IS_ENTITY_DEAD,s.Ped);}
            if(!s.PlayerValid)pedLost=true;
            if(s.PlayerValid){
                s.InVehicle=native.Call<bool>(Hash.IS_PED_IN_ANY_VEHICLE,s.Ped,false);s.Entering=!s.InVehicle&&native.Call<bool>(Hash.IS_PED_IN_ANY_VEHICLE,s.Ped,true);
                // Never use a last-vehicle handle to infer current occupancy.
                s.CurrentVehicle=s.InVehicle?native.Call<int>(Hash.GET_VEHICLE_PED_IS_IN,s.Ped,false):0;
                s.Position=native.Call<Vector3>(Hash.GET_ENTITY_COORDS,s.Ped,true);s.PlayerSpeed=native.Call<float>(Hash.GET_ENTITY_SPEED,s.Ped);
                s.PlayerCollision=native.Call<bool>(Hash.HAS_COLLISION_LOADED_AROUND_ENTITY,s.Ped);s.PlayerAir=native.Call<bool>(Hash.IS_ENTITY_IN_AIR,s.Ped);
            }
            s.A=Vehicle(aLife);s.B=Vehicle(bLife);s.FrameAfter=native.FrameCount;return s;
        }
        void Evidence(string operation,SetupObservation s,string reason) {
            string key=operation+":"+reason;long prior;
            if(!evidenceAt.TryGetValue(key,out prior)||clock()-prior>=frequency/2){evidenceAt[key]=clock();log("native-state operation="+operation+" reason="+reason+" "+s);}
        }
        string VehicleUnsafe(VehicleObservation v,bool empty,bool operational) {
            if(v.Life==null)return "vehicle-not-created";
            if(v.Life.Lost||!v.Identity)return "exact-vehicle-identity-contradicted";
            if(v.Driver!=0&&(empty||v.Driver!=savedPed)||v.Passenger!=0)return "conflicting-occupant";
            if(Single.IsNaN(v.Speed)||Single.IsInfinity(v.Speed)||v.Speed<0)return "invalid-speed";
            if(operational&&(v.Dead||!v.Driveable||v.Life.SetupUnknown))return "vehicle-dead-undriveable-or-placement-unknown";
            return null;
        }
        string VehicleProblem(VehicleObservation v,bool empty,bool operational) {
            string unsafeReason=VehicleUnsafe(v,empty,operational);if(unsafeReason!=null)return unsafeReason;
            if(!v.Still)return "vehicle-moving-speed-at-least-0.15";
            if(!v.Contact||operational&&!v.Wheels)return "collision-or-ground-contact-pending";
            return null;
        }
        SetupResult Result(SetupStep step,SetupObservation s,TransitionOutcome outcome,string reason,bool issue=false) {
            string command; if(!issued.TryGetValue(step,out command))command="never-issued";
            return SetupResult.Make(outcome,reason,s.ToString(),issue&&command=="never-issued",command);
        }
        SetupResult Site(SetupObservation s) {
            if(s.InVehicle){
                if(s.CurrentVehicle==0)return Result(SetupStep.Site,s,TransitionOutcome.UNSAFE,"current-vehicle-observation-invalid");
                if(initialExitRequested&&s.CurrentVehicle!=initialVehicle)return Result(SetupStep.Site,s,TransitionOutcome.UNSAFE,"initial-vehicle-relationship-changed");
                float speed=native.Call<float>(Hash.GET_ENTITY_SPEED,s.CurrentVehicle);
                if(Single.IsNaN(speed)||Single.IsInfinity(speed)||speed<0)return Result(SetupStep.Site,s,TransitionOutcome.UNSAFE,"invalid-initial-vehicle-speed");
                if(!initialExitRequested)initialVehicle=s.CurrentVehicle;
                return Result(SetupStep.Site,s,TransitionOutcome.PENDING,"initial-exit-pending currentSpeed="+speed.ToString("R",CultureInfo.InvariantCulture),!initialExitRequested&&speed<.15f);
            }
            if(s.Entering||!s.PlayerCollision||s.PlayerAir||!FiniteStopped(s.PlayerSpeed))return Result(SetupStep.Site,s,TransitionOutcome.PENDING,"loaded-on-foot-player-settling");
            if(native.Call<int>(Hash.GET_INTERIOR_FROM_ENTITY,s.Ped)!=0)return Result(SetupStep.Site,s,TransitionOutcome.UNSAFE,"current-location-is-interior");
            if(siteSelected&&(s.Position-siteAnchor).Length()>.10f){if(sitePlaced)return Result(SetupStep.Site,s,TransitionOutcome.UNSAFE,"committed-local-anchor-moved");siteSelected=false;}
            if(!siteSelected){
                bool unavailable=false;float original=native.Call<float>(Hash.GET_ENTITY_HEADING,s.Ped);
                for(int i=0;i<4;i++){
                    float angle=original+i*90f;double r=angle*Math.PI/180;Vector3 left=Offset(s.Position,-5,8,r),right=Offset(s.Position,5,8,r);
                    try{left=FlatGround(left);right=FlatGround(right);}catch(GroundPendingException){unavailable=true;continue;}catch(SlopeException){continue;}
                    try{Space(left);Space(right);}catch(InvalidOperationException){continue;}
                    a=left;b=right;heading=angle;layout=i;siteAnchor=s.Position;siteSelected=true;
                    log("loaded-local-layout-selected index="+layout+" anchor="+siteAnchor+" A="+a+" B="+b+" heading="+heading+"; no distant teleport or streaming-focus change");break;
                }
                if(!siteSelected)return Result(SetupStep.Site,s,unavailable?TransitionOutcome.PENDING:TransitionOutcome.UNSAFE,unavailable?"local-ground-data-not-ready":"all-four-local-layouts-blocked");
            }
            return Result(SetupStep.Site,s,TransitionOutcome.READY,"loaded-local-location-qualified layout="+layout);
        }
        static bool FiniteStopped(float value){return !Single.IsNaN(value)&&!Single.IsInfinity(value)&&value>=0&&value<.15f;}
        static Vector3 Offset(Vector3 p,float x,float y,double r){return new Vector3(p.X+(float)(x*Math.Cos(r)-y*Math.Sin(r)),p.Y+(float)(x*Math.Sin(r)+y*Math.Cos(r)),p.Z);}
        public SetupResult ObserveSetup(SetupStep step,Lifetime target,Lifetime control) {
            SetupObservation s=Observe(target,control);bool cleanup=step==SetupStep.ExitRetire||step==SetupStep.Retire||step==SetupStep.Restore;
            if(!s.PlayerValid)return Result(step,s,TransitionOutcome.UNSAFE,"original-player-identity-contradicted");
            if(Single.IsNaN(s.PlayerSpeed)||Single.IsInfinity(s.PlayerSpeed)||s.PlayerSpeed<0)return Result(step,s,TransitionOutcome.UNSAFE,"invalid-player-motion-observation");
            if(!s.Story||s.Paused)return Result(step,s,cleanup?TransitionOutcome.PENDING:TransitionOutcome.UNSAFE,"unpaused-Story-state-unavailable");
            if(!s.Coherent)return Result(step,s,TransitionOutcome.PENDING,"observation-crossed-simulation-frame");
            if(step==SetupStep.Restore){
                if(viewRestoreUnknown)return Result(step,s,TransitionOutcome.UNSAFE,"view-restore-command-outcome-unknown-never-resend");
                if(!viewRestoreIssued)return Result(step,s,TransitionOutcome.PENDING,"saved-view-restore-not-issued",true);
                int pedMode=native.Call<int>(Hash.GET_FOLLOW_PED_CAM_VIEW_MODE),vehicleMode=native.Call<int>(Hash.GET_FOLLOW_VEHICLE_CAM_VIEW_MODE);
                float relativeHeading=native.Call<float>(Hash.GET_GAMEPLAY_CAM_RELATIVE_HEADING),pitch=native.Call<float>(Hash.GET_GAMEPLAY_CAM_RELATIVE_PITCH);
                string readback=" pedMode="+pedMode+"/"+oldPedView+" vehicleMode="+vehicleMode+"/"+oldVehicleView+" heading="+relativeHeading+"/"+oldHeading+" pitch="+pitch+"/"+oldPitch+" positionRequested="+positionReturnRequested+" original="+originalPosition;
                if(pedMode!=oldPedView||vehicleMode!=oldVehicleView||!FiniteAngle(relativeHeading,oldHeading)||!FiniteAngle(pitch,oldPitch)||positionReturnRequested&&(s.Position-originalPosition).Length()>.10f)return Result(step,s,TransitionOutcome.PENDING,"saved-view-or-position-readback-pending"+readback);
                viewSaved=false;return Result(step,s,TransitionOutcome.READY,"saved-view-readback-verified"+readback);
            }
            if(s.InVehicle&&target!=null&&s.CurrentVehicle==target.Handle&&s.A.Driver==savedPed){foreach(var key in issued.Keys)if(IsSeat(key))completed.Add(key);}
            bool outOfA=!s.InVehicle&&!s.Entering&&(s.A.Life==null||s.A.Life.Deleted&&!s.A.Exists||s.A.Data&&s.A.Driver!=savedPed&&s.A.Passenger!=savedPed);
            if(outOfA){foreach(var key in issued.Keys)if(IsExit(key))completed.Add(key);}
            if((s.Position-requestedStanding).Length()<=.10f){foreach(var key in issued.Keys)if(key==SetupStep.BViewPre||key==SetupStep.BViewPost)completed.Add(key);}
            string command;if(!cleanup&&issued.TryGetValue(step,out command)&&command=="uncertain")return Result(step,s,TransitionOutcome.UNSAFE,"command-outcome-unknown-never-resend");
            if(step==SetupStep.Site)return Site(s);
            if(step==SetupStep.Models){bool ready=ModelReady;return Result(step,s,ready?TransitionOutcome.READY:TransitionOutcome.PENDING,"Bati-model-loaded="+ready);}
            bool exit=step==SetupStep.ExitBPre||step==SetupStep.ExitBPost||step==SetupStep.ExitRetire;
            if(exit){
                if(cleanup&&InFlight(IsSeat)&&!s.InVehicle)return Result(step,s,TransitionOutcome.PENDING,"previous-seat-command-still-in-flight");
                if(cleanup&&InFlight(x=>x==SetupStep.BViewPre||x==SetupStep.BViewPost))return Result(step,s,TransitionOutcome.PENDING,"previous-standing-command-still-in-flight");
                if(outOfA)return Result(step,s,TransitionOutcome.READY,"player-already-out");
                if(target==null)return Result(step,s,TransitionOutcome.UNSAFE,"no-owned-A-for-current-occupancy");
                string bad=VehicleUnsafe(s.A,false,false);if(bad!=null)return Result(step,s,TransitionOutcome.UNSAFE,"A."+bad);
                if(s.InVehicle&&s.CurrentVehicle==target.Handle&&s.A.Driver==0&&InFlight(IsSeat))return Result(step,s,TransitionOutcome.PENDING,"previous-seat-driver-readback-pending");
                if(s.InVehicle&&(s.CurrentVehicle!=target.Handle||s.A.Driver!=savedPed))return Result(step,s,TransitionOutcome.UNSAFE,"player-in-other-vehicle-or-seat");
                if(!s.InVehicle)return Result(step,s,TransitionOutcome.PENDING,"exit-occupancy-readback-pending");
                if(!s.A.Still||!s.A.Contact)return Result(step,s,TransitionOutcome.PENDING,"A-settling-before-exit");
                return Result(step,s,TransitionOutcome.PENDING,"exit-completion-pending",!s.Entering&&!InFlight(IsExit));
            }
            if(step==SetupStep.Retire){
                if(creationUnknown)return Result(step,s,TransitionOutcome.UNSAFE,"creation-outcome-unknown-no-complete-owned-pair-inventory");
                if(s.InVehicle||s.Entering)return Result(step,s,TransitionOutcome.PENDING,"retirement-player-still-occupied");
                foreach(var v in new[]{s.A,s.B}){
                    if(v.Life==null||v.Life.Deleted||v.Life.DeleteIssued&&!v.Exists)continue;
                    string bad=VehicleUnsafe(v,true,false);if(bad!=null)return Result(step,s,TransitionOutcome.UNSAFE,v.Life.Role+"."+bad);
                    if(!v.Still||!v.Contact)return Result(step,s,TransitionOutcome.PENDING,v.Life.Role+".retirement-settling");
                }
                return Result(step,s,TransitionOutcome.READY,"exact-empty-owned-retirement-state");
            }
            if(target==null||control==null||target.Role!="A"||control.Role!="B"||target.Handle==control.Handle||target.Token==control.Token)return Result(step,s,TransitionOutcome.UNSAFE,"distinct-A-B-generation-required");
            bool foot=step==SetupStep.PairSettled||step==SetupStep.SeatInitial||step==SetupStep.SeatBaseline||step==SetupStep.AOffBPre||step==SetupStep.AOffBPost||step==SetupStep.BViewPre||step==SetupStep.BViewPost||step==SetupStep.CameraBPre||step==SetupStep.CameraBPost;
            bool seat=step==SetupStep.SeatInitial||step==SetupStep.SeatBaseline;
            foreach(var v in new[]{s.A,s.B}){string bad=VehicleUnsafe(v,v==s.B||foot&&!seat&&!s.InVehicle,true);if(bad!=null)return Result(step,s,TransitionOutcome.UNSAFE,v.Life.Role+"."+bad);}
            if(seat&&s.InVehicle&&s.CurrentVehicle==target.Handle&&s.A.Driver==0&&InFlight(IsSeat))return Result(step,s,TransitionOutcome.PENDING,"driver-seat-readback-pending");
            if(s.InVehicle&&(s.CurrentVehicle!=target.Handle||s.A.Driver!=savedPed))return Result(step,s,TransitionOutcome.UNSAFE,"player-current-vehicle-or-driver-conflict");
            if(!s.A.Still||!s.B.Still||!s.A.Contact||!s.B.Contact||!s.A.Wheels||!s.B.Wheels)return Result(step,s,TransitionOutcome.PENDING,"waiting-for-exact-pair-motion-and-contact");
            if(step==SetupStep.PairSettled){if(s.InVehicle||s.Entering)return Result(step,s,TransitionOutcome.UNSAFE,"empty-pair-required-before-seating");return Result(step,s,TransitionOutcome.READY,"pair-physically-ready");}
            if(step==SetupStep.SeatInitial||step==SetupStep.SeatBaseline){
                if(s.InVehicle&&s.A.Driver==savedPed)return Result(step,s,TransitionOutcome.READY,"exact-player-now-driver-A");
                return Result(step,s,TransitionOutcome.PENDING,"seating-completion-pending",!s.Entering);
            }
            if(step==SetupStep.AInitial||step==SetupStep.ABaseline||step==SetupStep.BInitial){
                if(!s.InVehicle||s.A.Driver!=savedPed)return Result(step,s,TransitionOutcome.UNSAFE,"exact-player-driver-A-required");
                if(step==SetupStep.BInitial&&!s.A.Engine)return Result(step,s,TransitionOutcome.UNSAFE,"A-engine-lost-before-B-start");
                bool running=step==SetupStep.BInitial?s.B.Engine:s.A.Engine;
                return Result(step,s,running?TransitionOutcome.READY:TransitionOutcome.PENDING,running?"engine-already-running-or-start-observed":"engine-start-pending",!running);
            }
            if(step==SetupStep.AOffBPre||step==SetupStep.AOffBPost){
                if(s.InVehicle||s.Entering)return Result(step,s,TransitionOutcome.UNSAFE,"empty-A-and-player-on-foot-required");
                if(!s.B.Engine)return Result(step,s,TransitionOutcome.UNSAFE,"B-engine-lost-before-comparison");
                return Result(step,s,!s.A.Engine?TransitionOutcome.READY:TransitionOutcome.PENDING,!s.A.Engine?"A-already-off":"comparison-A-stop-pending",s.A.Engine);
            }
            if(step==SetupStep.BViewPre||step==SetupStep.BViewPost){
                if(s.InVehicle||s.A.Engine||!s.B.Engine)return Result(step,s,TransitionOutcome.UNSAFE,"B-comparison-engine-or-occupancy-contradiction");
                if(!issued.ContainsKey(step)){
                    requestedStanding=native.Call<Vector3>(Hash.GET_OFFSET_FROM_ENTITY_IN_WORLD_COORDS,control.Handle,0f,-3f,0f);
                    try{requestedStanding.Z=Ground(requestedStanding)+1f;}catch(GroundPendingException){return Result(step,s,TransitionOutcome.PENDING,"B-standing-ground-data-pending");}
                    if((requestedStanding-s.Position).Length()>20||native.Call<bool>(Hash.IS_POSITION_OCCUPIED,requestedStanding.X,requestedStanding.Y,requestedStanding.Z,.45f,false,true,true,false,false,savedPed,false))return Result(step,s,TransitionOutcome.UNSAFE,"B-standing-point-blocked-or-beyond-20m requested="+requestedStanding);
                    return Result(step,s,TransitionOutcome.PENDING,"B-standing-placement-not-issued requested="+requestedStanding,true);
                }
                if((s.Position-requestedStanding).Length()>.10f)return Result(step,s,TransitionOutcome.PENDING,"B-standing-placement-readback-pending");
                return Result(step,s,TransitionOutcome.READY,"B-standing-placement-observed");
            }
            bool seated=step==SetupStep.CameraInitial||step==SetupStep.CameraBaseline;
            if(seated?(!s.InVehicle||!s.A.Engine||!s.B.Engine):(s.InVehicle||s.A.Engine||!s.B.Engine))return Result(step,s,TransitionOutcome.UNSAFE,"camera-phase-engine-or-occupancy-contradiction");
            return Result(step,s,issued.ContainsKey(step)?TransitionOutcome.READY:TransitionOutcome.PENDING,issued.ContainsKey(step)?"view-command-issued-observe-pose":"view-command-not-issued",true);
        }
        public void RequestSetup(SetupStep step,Lifetime target,Lifetime control,Func<bool> stillAdmitted) {
            SetupResult r=ObserveSetup(step,target,control);
            if(r.Outcome==TransitionOutcome.READY)return;
            if(r.Outcome!=TransitionOutcome.PENDING||!r.CanIssue)throw new InvalidOperationException("setup-command-not-admitted step="+step+" reason="+r.Reason+" command="+r.Command+" "+r.Evidence);
            if(stillAdmitted==null||!stillAdmitted())throw new InvalidOperationException("setup-command-admission-expired step="+step+"; never issued "+r.Evidence);
            issued.Add(step,"issued-once");log("setup-command-reserved step="+step+" "+r.Evidence);
            try{
                switch(step){
                    case SetupStep.Restore:RestoreView();break;
                    case SetupStep.Site:initialExitRequested=true;native.Call(Hash.TASK_LEAVE_VEHICLE,savedPed,initialVehicle,0);break;
                    case SetupStep.SeatInitial:case SetupStep.SeatBaseline:if(++seatsA>2)throw new InvalidOperationException("seat-dispatch-limit");native.Call(Hash.SET_PED_INTO_VEHICLE,savedPed,target.Handle,-1);break;
                    case SetupStep.AInitial:case SetupStep.ABaseline:if(++startsA>2)throw new InvalidOperationException("A-engine-dispatch-limit");native.Call(Hash.SET_VEHICLE_ENGINE_ON,target.Handle,true,true,false);break;
                    case SetupStep.BInitial:native.Call(Hash.SET_VEHICLE_ENGINE_ON,control.Handle,true,true,false);break;
                    case SetupStep.ExitBPre:case SetupStep.ExitBPost:case SetupStep.ExitRetire:if(++leavesA>3)throw new InvalidOperationException("exit-dispatch-limit");native.Call(Hash.TASK_LEAVE_VEHICLE,savedPed,target.Handle,0);break;
                    case SetupStep.AOffBPre:case SetupStep.AOffBPost:if(++stopsA>2)throw new InvalidOperationException("comparison-stop-dispatch-limit");native.Call(Hash.SET_VEHICLE_ENGINE_ON,target.Handle,false,true,false);break;
                    case SetupStep.BViewPre:case SetupStep.BViewPost:
                        native.Call(Hash.SET_ENTITY_COORDS_NO_OFFSET,savedPed,requestedStanding.X,requestedStanding.Y,requestedStanding.Z,false,false,true);native.Call(Hash.SET_ENTITY_HEADING,savedPed,native.Call<float>(Hash.GET_ENTITY_HEADING,control.Handle));break;
                    case SetupStep.CameraInitial:case SetupStep.CameraBaseline:SetView(true);break;
                    case SetupStep.CameraBPre:case SetupStep.CameraBPost:SetView(false);break;
                    default:throw new InvalidOperationException("step-has-no-command "+step);
                }
                log("setup-command-returned step="+step+"; observe completion on later callbacks");
            }catch(ThreadAbortException){throw;}
            catch(Exception e){issued[step]="uncertain";log("setup-command-outcome-unknown step="+step+" "+e.GetType().Name+":"+e.Message+"; no resend");throw;}
        }
        static bool FiniteAngle(float actual,float expected){if(Single.IsNaN(actual)||Single.IsInfinity(actual))return false;double d=Math.Abs(actual-expected)%360;return Math.Min(d,360-d)<=.5;}
    }
}
