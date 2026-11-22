// Readiness remains the default. The separate experiment path requires a fresh bound approval.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Threading;
using Rage;
using Rage.Attributes;
using Rage.Native;
using RichAudio.MarkerResearch;
using RichAudio.BatiResearch;
[assembly:Plugin("RichAudio Bati Research",Author="RichAudio",Description="Default read-only readiness; separately approved one-shot airport experiment",EntryPoint="RichAudio.BatiRph.Entry.Main",ExitPoint="RichAudio.BatiRph.Entry.Unload",PrefersSingleInstance=true)]
namespace RichAudio.BatiRph
{
    internal static class LiveGate
    {
        private static bool active;private static int bikes,riders;
        public static void Authorize(ExperimentApproval approval,string nonce,string binary,string candidate){Check.That(!active,"one permit only");approval.Validate(nonce,binary,candidate,DateTime.UtcNow);active=true;}
        public static void Require(){if(!active)throw new NotSupportedException("BLOCKED: separate bound experiment approval is absent");if(NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))throw new InvalidOperationException("Story Mode only");}
        public static void Creation(bool bike){Require();if(bike)Check.That(++bikes==1,"one bike only");else Check.That(++riders==1,"one rider only");}
        public static void Close(){active=false;}
    }
    internal sealed class WorldOperations:IBenchmarkWorld
    {
        private readonly Dictionary<uint,Entity> owned=new Dictionary<uint,Entity>();
        private readonly Dictionary<uint,Identity> keys=new Dictionary<uint,Identity>();
        private readonly HashSet<uint> nativeSeen=new HashSet<uint>();private readonly MarkerPoint? spawn;private readonly float heading;private readonly int drivingStyle;
        private readonly StopBoundaryProbe stopBoundary;
        public WorldOperations(MarkerPoint? spawnPoint=null,float initialHeading=0,int style=63,StopBoundaryProbe diagnostics=null){spawn=spawnPoint;heading=initialHeading;Check.That(style==63||style==(63|16777216),"reviewed driving mode");drivingStyle=style;stopBoundary=diagnostics;}
        private void Diagnostic(Action read){try{read();}catch(Exception e){stopBoundary.Fault(e);}}
        private bool uncertain;
        public bool UnresolvedCreation {get{return uncertain;}}
        public bool OwnsExact(Entity e){Identity key;return e!=null&&e.IsValid()&&keys.TryGetValue(e.Handle.Value,out key)&&Inspect(key)==Presence.Present;}
        private Identity Claim(Entity entity,string session,string creation){Check.That(entity!=null&&entity.IsValid()&&!owned.ContainsKey(entity.Handle.Value),"creation identity");var id=new Identity{Handle=entity.Handle.Value,Generation=entity.Handle.Counter,Model=entity.Model.Hash,Session=session,Creation=creation};owned.Add(id.Handle,entity);keys.Add(id.Handle,id);Check.That(NativeFunction.CallByName<bool>("DOES_ENTITY_EXIST",id.Handle),"native creation readback");nativeSeen.Add(id.Handle);return id;}
        public Presence Inspect(Identity id){Entity e;Identity key;if(!id.Valid||!owned.TryGetValue(id.Handle,out e)||!keys.TryGetValue(id.Handle,out key)||!key.Same(id))return Presence.Unknown;bool? exists=null;try{exists=NativeFunction.CallByName<bool>("DOES_ENTITY_EXIST",id.Handle);}catch{return Presence.Unknown;}bool valid=e.IsValid();bool same=valid&&e.Handle.Value==id.Handle&&e.Handle.Counter==id.Generation&&e.Model.Hash==id.Model;return PresenceProof.Assess(true,nativeSeen.Contains(id.Handle),exists,valid,same);}
        private Entity RequireOwned(Identity id){Check.That(Inspect(id)==Presence.Present,"ownership uncertain");return owned[id.Handle];}
        private Vehicle Bike(Identity id){var e=RequireOwned(id) as Vehicle;Check.That(e!=null&&id.Model==Controller.BatiModel,"Bati only");return e;}
        public Identity CreateBike(MarkerPoint start,string session,string creation){LiveGate.Require();LiveGate.Creation(true);uncertain=true;var point=spawn??start;var v=new Vehicle("bati",new Vector3((float)point.X,(float)point.Y,(float)point.Z),heading);var id=Claim(v,session,creation);v.IsPersistent=true;v.IsEngineOn=true;uncertain=false;return id;}
        public Identity CreateRider(Identity bike,string session,string creation){LiveGate.Require();LiveGate.Creation(false);var v=Bike(bike);uncertain=true;var ped=new Ped("a_m_y_roadcyc_01",v.Position,heading);var id=Claim(ped,session,creation);ped.IsPersistent=true;ped.WarpIntoVehicle(v,-1);uncertain=false;return id;}
        public bool Persistent(Identity id){return RequireOwned(id).IsPersistent;}
        public void InstallKit(Identity id,int selection){LiveGate.Require();Check.That(selection==0,"default kit request only");NativeFunction.CallByName<int>("SET_VEHICLE_MOD_KIT",Bike(id),selection);/* RPH placeholder ignored; native is void. */}
        public int? ReadKit(Identity id){return NativeFunction.CallByName<int>("GET_VEHICLE_MOD_KIT",Bike(id));}
        public int? AvailableKits(Identity id){return NativeFunction.CallByName<int>("GET_NUM_MOD_KITS",Bike(id));}
        public int ModCount(Identity id,int c){Check.That(c==11||c==12||c==13||c==15,"performance categories only");return NativeFunction.CallByName<int>("GET_NUM_VEHICLE_MODS",Bike(id),c);}
        public void SetMod(Identity id,int c,int index){LiveGate.Require();Check.That(index>=0&&index<ModCount(id,c),"invalid mod index");NativeFunction.CallByName<uint>("SET_VEHICLE_MOD",Bike(id),c,index,false);}
        public int ReadMod(Identity id,int c){ModCount(id,c);return NativeFunction.CallByName<int>("GET_VEHICLE_MOD",Bike(id),c);}
        // Public toggle/readback is not a documented availability getter. Never infer support from count=0.
        public Capability TurboSupport(Identity id){Bike(id);return Capability.Unknown;}
        public void EnableTurbo(Identity id){LiveGate.Require();NativeFunction.CallByName<uint>("TOGGLE_VEHICLE_MOD",Bike(id),18,true);/* one reviewed toggle/readback; availability and physical effect remain unproven */}
        public bool ReadTurbo(Identity id){return NativeFunction.CallByName<bool>("IS_TOGGLE_MOD_ON",Bike(id),18);}
        public bool Mounted(Identity rider,Identity bike){var p=RequireOwned(rider) as Ped;var v=Bike(bike);return p!=null&&p.CurrentVehicle!=null&&p.CurrentVehicle.IsValid()&&p.CurrentVehicle.Handle.Value==v.Handle.Value&&p.CurrentVehicle.Handle.Counter==v.Handle.Counter;}
        public void Drive(Identity rider,Identity bike,MarkerPoint destination,double speed){LiveGate.Require();Check.That(Mounted(rider,bike)&&Check.Finite(speed)&&speed>0&&speed<=100,"driving prerequisites");var p=(Ped)RequireOwned(rider);var v=Bike(bike);if(stopBoundary!=null)Diagnostic(()=>stopBoundary.BeginDrive(rider,bike,destination,speed,drivingStyle));try{NativeFunction.CallByName<uint>("TASK_VEHICLE_DRIVE_TO_COORD_LONGRANGE",p,v,(float)destination.X,(float)destination.Y,(float)destination.Z,(float)speed,drivingStyle,2f);}catch(Exception e){if(stopBoundary!=null)Diagnostic(()=>stopBoundary.EndDrive(false,e.GetType().Name));throw;}if(stopBoundary!=null)Diagnostic(()=>stopBoundary.EndDrive(true,null));}
        public void Brake(Identity rider,Identity bike,int durationMs){LiveGate.Require();Check.That(Mounted(rider,bike)&&durationMs>0&&durationMs<=20000,"owned bounded braking");((Ped)RequireOwned(rider)).Tasks.PerformDrivingManeuver(Bike(bike),VehicleManeuver.GoForwardStraightBraking,durationMs);}
        public void StopOwnedTask(Identity id){LiveGate.Require();((Ped)RequireOwned(id)).Tasks.Clear();}
        public void DeleteOwned(Identity id){LiveGate.Require();RequireOwned(id).Delete();/* Inspect independently queries the saved GUID; wrapper invalidity alone stays insufficient. */}
        public Reading CopyObservation(Identity bike,Identity rider,MarkerSet markers,double now)
        {
            double wrapperStart=now;if(stopBoundary!=null)Diagnostic(()=>wrapperStart=stopBoundary.Now().Value);
            var v=Bike(bike);var p=Game.LocalPlayer.Character;Check.That(p!=null&&p.IsValid(),"player unavailable");Vector3 vel=v.Velocity;var r=new Reading{At=now,Domain="runtime-observation",Bike=bike,Rider=rider,Position=Point(v.Position),Velocity=Point(vel),Speed=Math.Sqrt(vel.X*vel.X+vel.Y*vel.Y+vel.Z*vel.Z),PlayerPosition=Point(p.Position),PlayerVelocity=Point(p.Velocity),Rotation=new MarkerPoint(v.Rotation.Pitch,v.Rotation.Roll,v.Rotation.Yaw),Mounted=Mounted(rider,bike),EngineOn=v.IsEngineOn,Collision=NativeFunction.CallByName<bool>("HAS_ENTITY_COLLIDED_WITH_ANYTHING",v),Simulation="UNDETERMINED",Interference="UNKNOWN"};
            try{r.ConsoleOpen=Game.Console.IsOpen;}catch{}try{r.GamePaused=Game.IsPaused;}catch{}try{r.GameTimeMs=Game.GameTime;}catch{}try{r.TaskState=((Ped)RequireOwned(rider)).Tasks.CurrentTaskStatus.ToString();}catch{r.TaskState="UNKNOWN";}
            try{r.Gear=v.CurrentGear;}catch{}try{double raw=v.EngineRevolutionsRatio;if(Check.Finite(raw))r.RawRpm=raw;}catch{}
            Check.That(Inspect(bike)==Presence.Present&&Inspect(rider)==Presence.Present,"changed identity during read");
            if(stopBoundary!=null)Diagnostic(()=>{double wrapperEnd=stopBoundary.Now().Value;r.StopBoundary=stopBoundary.Observe(r,wrapperStart,wrapperEnd,()=>NativeFunction.CallByName<int>("GET_SCRIPT_TASK_STATUS",rider.Handle,0x21D33957u),()=>NativeFunction.CallByName<float>("GET_ENTITY_SPEED",bike.Handle),()=>Inspect(bike)==Presence.Present&&Inspect(rider)==Presence.Present);});return r;
        }
        private static MarkerPoint Point(Vector3 p){return new MarkerPoint(p.X,p.Y,p.Z);}
    }
    [DataContract]public sealed class ReadinessConfig
    {
        [DataMember]public int Version,Revision;
        [DataMember]public string MarkerFile,Fingerprint,MarkerSession,OutputDirectory,SurveyDirectory,CandidateFile,CandidateFingerprint,ApprovalFile,ScopeNonce,BinaryFingerprint;
        [DataMember]public string[] SurveyFingerprints;
        [DataMember]public bool StopBoundaryDiagnostics; // Opt-in only; absent/false retains original calls.
    }
    public static class Entry
    {
        private static volatile bool stop,visible=true,drawFailed;private static int request;private static bool loaded;
        private static volatile string[] hud={"RICHAUDIO BATI | NOT LOADED / live start BLOCKED"};
        private static MarkerSet markers;private static ReadinessConfig config;
        private static void Guard(){Check.That(!NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")&&!NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"),"Story Mode only");}
        public static void Main()
        {
            bool attached=false;try{
                var exe=Process.GetCurrentProcess().MainModule.FileName;Check.That(Path.GetFileName(exe)=="GTA5_Enhanced.exe"&&FileVersionInfo.GetVersionInfo(exe).FileVersion=="1.0.1158.16"&&FileVersionInfo.GetVersionInfo(typeof(Game).Assembly.Location).FileVersion=="1.132.1428.17748","exact host guard");Guard();
                var file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Plugins","RichAudio.Bati.Rph.json");Check.That(new FileInfo(file).Length<=8192,"config cap");using(var f=File.OpenRead(file))config=(ReadinessConfig)new DataContractJsonSerializer(typeof(ReadinessConfig)).ReadObject(f);Check.That(config.Version==1||config.Version==2,"config version");
                if(config.Version==2){AirportExperiment.Run(config);return;}
                PrivateFiles.RequireLocal(config.OutputDirectory);string game=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;Check.That(!Path.GetFullPath(config.OutputDirectory).StartsWith(game,StringComparison.OrdinalIgnoreCase)&&!Path.GetFullPath(config.MarkerFile).StartsWith(game,StringComparison.OrdinalIgnoreCase),"private data must be outside game");Check.That(Directory.Exists(config.OutputDirectory)&&Directory.GetFileSystemEntries(config.OutputDirectory).Length==0,"fresh output required");
                var timer=Stopwatch.StartNew();Game.FrameRender+=Draw;attached=true;Game.Console.Print("RichAudio Bati READINESS ONLY. Load/Status/Show/Hide/Review/Abort. Arm/Start/Cleanup are hard BLOCKED; no live enable setting.");
                while(!stop&&timer.Elapsed.TotalSeconds<600){Guard();Check.That(!drawFailed,"cached display failed");int action=Interlocked.Exchange(ref request,0);if(action==1&&!loaded){markers=MarkerSet.Load(config.MarkerFile,config.Fingerprint,config.Revision,config.MarkerSession,"runtime-observation");hud=new[]{"RICHAUDIO BATI | HISTORICAL MARKERS LOADED","Bike/rider: NOT CREATED | stock tuning: NOT TESTED","Speed / acceleration / continuity: unavailable","Traffic Isolation: OFF | Route Interference: UNKNOWN","Route: UNKNOWN | airport spawn surface NOT VERIFIED","Arm / Start / Cleanup: BLOCKED; no runtime producer","No traffic / geometry scans / audio / entity mutations"};PrivateFiles.WriteNew(Path.Combine(config.OutputDirectory,"marker-readiness.json"),new RunRecord{Domain="runtime-observation",MarkerRevision=markers.Revision,MarkerFingerprint=markers.Fingerprint,Listener=markers.Listener,Outcome="BLOCKED",Reason="no runtime route producer",LiveStartSupported=false});loaded=true;}GameFiber.Yield();}
            }catch(Exception e){Game.Console.Print("RichAudio Bati readiness stopped: "+e.GetType().Name);}finally{stop=true;if(attached)Game.FrameRender-=Draw;}
        }
        private static void Draw(object sender,GraphicsEventArgs e){if(!visible)return;try{var lines=hud;for(int i=0;i<lines.Length;i++)e.Graphics.DrawText(lines[i],"Arial",16,new PointF(24,32+24*i),Color.White);}catch{drawFailed=true;}}
        [ConsoleCommand(Name="RichAudioBatiLoad",Description="Read pinned historical markers; no route authorization")]public static void Load(){if(config!=null&&config.Version==2){AirportExperiment.Request(1);return;}Interlocked.CompareExchange(ref request,1,0);}
        [ConsoleCommand(Name="RichAudioBatiStatus",Description="Report cached status")]public static void Status(){if(config!=null&&config.Version==2){AirportExperiment.Status();return;}foreach(var line in hud)Game.Console.Print(line);}
        [ConsoleCommand(Name="RichAudioBatiShow",Description="Show cached status")]public static void Show(){if(config!=null&&config.Version==2){AirportExperiment.Visible=true;return;}visible=true;}
        [ConsoleCommand(Name="RichAudioBatiHide",Description="Hide cached status")]public static void Hide(){if(config!=null&&config.Version==2){AirportExperiment.Visible=false;return;}visible=false;}
        [ConsoleCommand(Name="RichAudioBatiArm",Description="Confirm supervised scope; still requires fresh bound approval")]public static void Arm(){if(config!=null&&config.Version==2){AirportExperiment.Request(2);return;}Game.Console.Print("BLOCKED: no live authorization or route-readiness producer");}
        [ConsoleCommand(Name="RichAudioBatiStart",Description="One separately approved controller experiment only")]public static void Start(){if(config!=null&&config.Version==2){AirportExperiment.Request(3);return;}Arm();}
        [ConsoleCommand(Name="RichAudioBatiReview",Description="Review cached readiness; no run exists")]public static void Review(){Status();}
        [ConsoleCommand(Name="RichAudioBatiCleanup",Description="Review cleanup; never creates entities")]public static void Cleanup(){if(config!=null&&config.Version==2){AirportExperiment.Request(4);return;}Arm();}
        [ConsoleCommand(Name="RichAudioBatiAbort",Description="Emergency abort")]public static void Abort(){if(config!=null&&config.Version==2){AirportExperiment.Abort();return;}stop=true;}
        public static void Unload(){stop=true;AirportExperiment.Abort();Game.FrameRender-=Draw;}
    }
}
