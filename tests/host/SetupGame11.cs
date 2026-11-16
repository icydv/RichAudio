using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using GTA.Math;
using GTA.Native;
using RichAudio.NativeSuppression01;

// Authored game responses only. Real runner, adapter and retained SDK
// InputArgument conversions execute; no ScriptHook/GTA native is invoked.
internal sealed class SetupGame11:IIdleNativeCalls {
    internal sealed class Entity {
        internal int Handle,Token,Driver,Passenger;internal uint Model=0xF9300CC5;
        internal bool Exists=true,Owned,Engine,Dead,Driveable=true,Collision=true,Air,Wheels=true;
        internal float Speed,Heading;internal Vector3 Position;
    }
    sealed class Event {internal long At;internal Action Action;}
    readonly List<Event> events=new List<Event>();
    internal readonly Dictionary<int,Entity> Entities=new Dictionary<int,Entity>();
    internal readonly Dictionary<string,int> Counts=new Dictionary<string,int>();
    internal readonly List<string> Profiles=new List<string>();
    internal long Now=1000000,GroundAt,CollisionAt,ModelAt,CameraAt,HornUntil;
    internal double ModelDelay=.5,PhysicsDelay=.8,SeatDelay=.7,SeatPhysicsDelay,SeatDriverLag,ExitDriverLag,EngineDelay=.6,ExitDelay=.8,DeleteDelay=.5,CameraDelay=.7,MoveDelay=.4;
    internal bool AutoEngine,BNeverStarts,SeatNever,ExitNever,DeleteNever,ThrowEngine,ThrowSeat,ThrowDelete,ThrowCreateB,Story=true,PausedValue,Entering,BlockSite,GroundNever;
    internal int Current,Created,CurrentReads,GroundWrites,DeleteWrites,PedMode,VehicleMode;
    internal Vector3 Player=new Vector3(0,0,1);internal float PlayerHeading,PlayerSpeed;
    internal SetupGame11(){CollisionAt=Now;GroundAt=Now;}
    public int GameTime{get{return (int)Now;}}public int FrameCount{get{return (int)(Now/50);}}public bool Paused{get{return PausedValue;}}
    public void RegisterDecorator(string name,IIdleDecoratorLock guard,Action<string> log){Count("register");log("AUTHORED decorator registration; real initialization/lock remains live-only");}
    internal void Count(string key){if(!Counts.ContainsKey(key))Counts[key]=0;Counts[key]++;}
    internal int N(string key){return Counts.ContainsKey(key)?Counts[key]:0;}
    internal void Later(double seconds,Action action){events.Add(new Event{At=Now+(long)(seconds*1000),Action=action});}
    internal void Advance(double seconds=.05){Now+=(long)(seconds*1000);for(int i=0;i<events.Count;){if(events[i].At<=Now){var a=events[i].Action;events.RemoveAt(i);a();i=0;}else i++;}}
    static readonly FieldInfo Data=typeof(InputArgument).GetField("_data",BindingFlags.Instance|BindingFlags.NonPublic);
    static ulong U(InputArgument a){return (ulong)Data.GetValue(a);}
    static int I(InputArgument a){return unchecked((int)U(a));}
    static float F(InputArgument a){return BitConverter.ToSingle(BitConverter.GetBytes(unchecked((uint)U(a))),0);}
    static string S(InputArgument a){return Marshal.PtrToStringAnsi(new IntPtr(unchecked((long)U(a))));} // Approved names are ASCII.
    static void Require(bool b,string message){if(!b)throw new Exception("actual SDK argument contract: "+message);}
    Entity E(InputArgument a){Entity e;Require(Entities.TryGetValue(I(a),out e),"known entity "+I(a));return e;}
    Vector3 Position(int h){return h==2?Player:Entities[h].Position;}
    public T Call<T>(Hash h,params InputArgument[] a){object v=Invoke(h,a);if(typeof(T)==typeof(int)&&v is uint)v=unchecked((int)(uint)v);if(typeof(T)==typeof(uint)&&v is int)v=unchecked((uint)(int)v);return (T)v;}
    public void Call(Hash h,params InputArgument[] a){Invoke(h,a);}
    object Invoke(Hash h,InputArgument[] a){
        if((ulong)h==0x4F0C413926060B38UL){Require(a.Length==2&&I(a[0])==100,"A-only profile handle");Profiles.Add(S(a[1]));return null;}
        switch(h){
            case Hash.PLAYER_ID:return 0;case Hash.PLAYER_PED_ID:return 2;
            case Hash.GET_IS_LOADING_SCREEN_ACTIVE:return !Story;
            case Hash.NETWORK_IS_SESSION_ACTIVE:case Hash.NETWORK_IS_GAME_IN_PROGRESS:case Hash.IS_PLAYER_SWITCH_IN_PROGRESS:return false;
            case Hash.IS_PLAYER_PLAYING:return true;
            case Hash.DOES_ENTITY_EXIST:return I(a[0])==2||Entities.ContainsKey(I(a[0]))&&E(a[0]).Exists;
            case Hash.GET_ENTITY_MODEL:return I(a[0])==2?1000u:E(a[0]).Model;
            case Hash.IS_ENTITY_DEAD:return I(a[0])!=2&&E(a[0]).Dead;
            case Hash.IS_PED_IN_ANY_VEHICLE:Require(I(a[0])==2&&a.Length==2,"current occupancy boolean");return Current!=0||(I(a[1])!=0&&Entering);
            case Hash.GET_VEHICLE_PED_IS_IN:Require(Current!=0&&I(a[1])==0,"never read last vehicle when on foot");CurrentReads++;return Current;
            case Hash.GET_ENTITY_COORDS:return Position(I(a[0]));
            case Hash.GET_ENTITY_HEADING:return I(a[0])==2?PlayerHeading:E(a[0]).Heading;
            case Hash.GET_ENTITY_SPEED:return I(a[0])==2?PlayerSpeed:E(a[0]).Speed;
            case Hash.HAS_COLLISION_LOADED_AROUND_ENTITY:return I(a[0])==2?Now>=CollisionAt:E(a[0]).Collision;
            case Hash.IS_ENTITY_IN_AIR:return I(a[0])!=2&&E(a[0]).Air;
            case Hash.GET_INTERIOR_FROM_ENTITY:return 0;
            case Hash.IS_POSITION_OCCUPIED:return BlockSite;
            case Hash.GET_GROUND_Z_FOR_3D_COORD:
                Require(a.Length==6&&U(a[3])>65535,"ground caller-owned float pointer");
                if(GroundNever||Now<GroundAt)return false;
                Marshal.Copy(BitConverter.GetBytes(0f),0,new IntPtr(unchecked((long)U(a[3]))),4);GroundWrites++;return true;
            case Hash.REQUEST_MODEL:Require(unchecked((uint)U(a[0]))==0xF9300CC5,"Bati model");ModelAt=Now+(long)(ModelDelay*1000);Count("model");return null;
            case Hash.HAS_MODEL_LOADED:return Now>=ModelAt;
            case Hash.SET_MODEL_AS_NO_LONGER_NEEDED:Count("release-model");return null;
            case Hash.CREATE_VEHICLE:
                Require(a.Length==8&&I(a[5])==0&&I(a[6])==0&&I(a[7])==0,"local create arguments");
                int handle=100+(Created++);var e=new Entity{Handle=handle,Position=new Vector3(F(a[1]),F(a[2]),F(a[3])),Heading=F(a[4]),Speed=1,Collision=false,Air=true,Wheels=false};Entities.Add(handle,e);Count("create");
                Later(PhysicsDelay,delegate{e.Speed=0;e.Collision=true;e.Air=false;e.Wheels=true;});if(ThrowCreateB&&handle==101)throw new Exception("AUTHORED lost B create return");return handle;
            case Hash.SET_ENTITY_AS_MISSION_ENTITY:E(a[0]).Owned=true;return null;
            case Hash.DOES_ENTITY_BELONG_TO_THIS_SCRIPT:return E(a[0]).Owned;
            case Hash.DECOR_SET_INT:E(a[0]).Token=I(a[2]);return true;
            case Hash.DECOR_EXIST_ON:return E(a[0]).Token!=0;
            case Hash.DECOR_GET_INT:return E(a[0]).Token;
            case Hash.SET_VEHICLE_ON_GROUND_PROPERLY:Count("ground-"+I(a[0]));return true;
            case Hash.GET_PED_IN_VEHICLE_SEAT:return I(a[1])==-1?E(a[0]).Driver:E(a[0]).Passenger;
            case Hash.IS_VEHICLE_DRIVEABLE:return E(a[0]).Driveable;
            case Hash.IS_VEHICLE_ON_ALL_WHEELS:return E(a[0]).Wheels;
            case Hash.GET_IS_VEHICLE_ENGINE_RUNNING:return E(a[0]).Engine;
            case Hash.SET_PED_INTO_VEHICLE:
                Require(a.Length==3&&I(a[0])==2&&I(a[1])==100&&I(a[2])==-1,"exact driver seating");Count("seat");Entering=true;
                if(!SeatNever)Later(SeatDelay,delegate{Current=100;Entering=false;if(SeatDriverLag>0)Later(SeatDriverLag,delegate{Entities[100].Driver=2;});else Entities[100].Driver=2;Player=Entities[100].Position;if(AutoEngine)Entities[100].Engine=true;if(SeatPhysicsDelay>0){Entities[100].Speed=.3f;Entities[100].Wheels=false;Later(SeatPhysicsDelay,delegate{Entities[100].Speed=0;Entities[100].Wheels=true;});}});
                if(ThrowSeat)throw new Exception("AUTHORED lost seat return");return null;
            case Hash.SET_VEHICLE_ENGINE_ON:
                Require(a.Length==4&&I(a[2])==1&&I(a[3])==0,"engine instant and auto-start flags");var engine=E(a[0]);bool on=I(a[1])!=0;Count((on?"start-":"stop-")+engine.Handle);
                if(!(engine.Handle==101&&BNeverStarts))Later(EngineDelay,delegate{engine.Engine=on;});
                if(ThrowEngine&&on&&engine.Handle==100)throw new Exception("AUTHORED lost engine return");return null;
            case Hash.TASK_LEAVE_VEHICLE:
                Require(a.Length==3&&I(a[0])==2&&I(a[2])==0,"normal player exit");int leaving=I(a[1]);Count("exit");
                if(!ExitNever)Later(ExitDelay,delegate{Current=0;Entering=false;if(ExitDriverLag>0)Later(ExitDriverLag,delegate{Entities[leaving].Driver=0;});else Entities[leaving].Driver=0;Player=Entities[leaving].Position+new Vector3(1,0,0);});return null;
            case Hash.DELETE_ENTITY:
                Require(a.Length==1&&U(a[0])>65535,"delete caller-owned handle pointer");var ptr=new IntPtr(unchecked((long)U(a[0])));int deleting=Marshal.ReadInt32(ptr);Require(Entities.ContainsKey(deleting)&&deleting>=100&&deleting<=101,"delete only owned pair");Count("delete-"+deleting);Marshal.WriteInt32(ptr,0);DeleteWrites++;
                if(!DeleteNever)Later(DeleteDelay,delegate{Entities[deleting].Exists=false;});if(ThrowDelete)throw new Exception("AUTHORED lost delete return");return null;
            case Hash.GET_OFFSET_FROM_ENTITY_IN_WORLD_COORDS:
                var entity=E(a[0]);double r=entity.Heading*Math.PI/180;return entity.Position+new Vector3((float)(F(a[1])*Math.Cos(r)-F(a[2])*Math.Sin(r)),(float)(F(a[1])*Math.Sin(r)+F(a[2])*Math.Cos(r)),F(a[3]));
            case Hash.SET_ENTITY_COORDS_NO_OFFSET:
                Require(I(a[0])==2,"only player local positioning");var move=new Vector3(F(a[1]),F(a[2]),F(a[3]));Count("move");Later(MoveDelay,delegate{Player=move;});return null;
            case Hash.SET_ENTITY_HEADING:Require(I(a[0])==2,"only player heading");PlayerHeading=F(a[1]);return null;
            case Hash.GET_FOLLOW_PED_CAM_VIEW_MODE:return PedMode;
            case Hash.GET_FOLLOW_VEHICLE_CAM_VIEW_MODE:return VehicleMode;
            case Hash.GET_GAMEPLAY_CAM_RELATIVE_HEADING:case Hash.GET_GAMEPLAY_CAM_RELATIVE_PITCH:return 0f;
            case Hash.IS_GAMEPLAY_CAM_RENDERING:return true;
            case Hash.IS_ENTITY_FOCUS:return true;
            case Hash.SET_FOLLOW_PED_CAM_VIEW_MODE:PedMode=I(a[0]);CameraAt=Now+(long)(CameraDelay*1000);return null;
            case Hash.SET_FOLLOW_VEHICLE_CAM_VIEW_MODE:VehicleMode=I(a[0]);CameraAt=Now+(long)(CameraDelay*1000);return null;
            case Hash.SET_GAMEPLAY_CAM_RELATIVE_HEADING:case Hash.SET_GAMEPLAY_CAM_RELATIVE_PITCH:return null;
            case Hash.GET_GAMEPLAY_CAM_COORD:case Hash.GET_FINAL_RENDERED_CAM_COORD:return Player+new Vector3(Now<CameraAt?(float)((CameraAt-Now)/1000.0):0,-4,2);
            case Hash.GET_GAMEPLAY_CAM_ROT:case Hash.GET_FINAL_RENDERED_CAM_ROT:return new Vector3(-8,0,PlayerHeading);
            case Hash.DISABLE_CONTROL_ACTION:case Hash.SET_THIRD_PERSON_CAM_RELATIVE_HEADING_LIMITS_THIS_UPDATE:case Hash.SET_THIRD_PERSON_CAM_RELATIVE_PITCH_LIMITS_THIS_UPDATE:return null;
            case Hash.GET_VEHICLE_DEFAULT_HORN:return 0u;
            case Hash.START_VEHICLE_HORN:Require(a.Length==4&&I(a[0])==100&&I(a[1])==600&&I(a[3])==0,"physical A horn actual SDK arguments");Count("horn");HornUntil=Now+600;return null;
            case Hash.IS_HORN_ACTIVE:return Now<HornUntil;
            default:throw new Exception("UNAUTHORED native "+h);
        }
    }
}
