// SDK-compiled research bridge. This revision deliberately cannot execute live mutations.
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
[assembly:Plugin("RichAudio Bati Readiness",Author="RichAudio",Description="Fail-closed benchmark readiness; no live attempt supported",EntryPoint="RichAudio.BatiRph.Entry.Main",ExitPoint="RichAudio.BatiRph.Entry.Unload",PrefersSingleInstance=true)]
namespace RichAudio.BatiRph
{
    internal static class LiveGate
    {
        public static void Require(){throw new NotSupportedException("BLOCKED: runtime route evidence, clearance, spawn and cleanup review are unresolved; this build has no live enable option");}
    }
    internal sealed class WorldOperations:IBenchmarkWorld
    {
        private readonly Dictionary<uint,Entity> owned=new Dictionary<uint,Entity>();
        private readonly Dictionary<uint,Identity> keys=new Dictionary<uint,Identity>();
        private bool uncertain;
        public bool UnresolvedCreation {get{return uncertain;}}
        private Identity Claim(Entity entity,string session,string creation){Check.That(entity!=null&&entity.IsValid()&&!owned.ContainsKey(entity.Handle.Value),"creation identity");var id=new Identity{Handle=entity.Handle.Value,Generation=entity.Handle.Counter,Model=entity.Model.Hash,Session=session,Creation=creation};owned.Add(id.Handle,entity);keys.Add(id.Handle,id);return id;}
        public Presence Inspect(Identity id){Entity e;Identity key;if(!id.Valid||!owned.TryGetValue(id.Handle,out e)||!keys.TryGetValue(id.Handle,out key)||!key.Same(id))return Presence.Unknown;if(!e.IsValid())return Presence.Unknown;return e.Handle.Value==id.Handle&&e.Handle.Counter==id.Generation&&e.Model.Hash==id.Model?Presence.Present:Presence.Reused;}
        private Entity RequireOwned(Identity id){Check.That(Inspect(id)==Presence.Present,"ownership uncertain");return owned[id.Handle];}
        private Vehicle Bike(Identity id){var e=RequireOwned(id) as Vehicle;Check.That(e!=null&&id.Model==Controller.BatiModel,"Bati only");return e;}
        public Identity CreateBike(MarkerPoint start,string session,string creation){LiveGate.Require();uncertain=true;var v=new Vehicle("bati",new Vector3((float)start.X,(float)start.Y,(float)start.Z),0f);var id=Claim(v,session,creation);v.IsPersistent=true;uncertain=false;return id;}
        public Identity CreateRider(Identity bike,string session,string creation){LiveGate.Require();var v=Bike(bike);uncertain=true;var ped=new Ped("a_m_y_roadcyc_01",v.Position,0f);var id=Claim(ped,session,creation);ped.IsPersistent=true;ped.WarpIntoVehicle(v,-1);uncertain=false;return id;}
        public bool Persistent(Identity id){return RequireOwned(id).IsPersistent;}
        public void InstallKit(Identity id){LiveGate.Require();Bike(id).Mods.InstallModKit();}
        public bool KitVerified(Identity id){return NativeFunction.CallByName<int>("GET_VEHICLE_MOD_KIT",Bike(id))==0;}
        public int ModCount(Identity id,int c){Check.That(c==11||c==12||c==13||c==15,"performance categories only");return NativeFunction.CallByName<int>("GET_NUM_VEHICLE_MODS",Bike(id),c);}
        public void SetMod(Identity id,int c,int index){LiveGate.Require();Check.That(index>=0&&index<ModCount(id,c),"invalid mod index");NativeFunction.CallByName<uint>("SET_VEHICLE_MOD",Bike(id),c,index,false);}
        public int ReadMod(Identity id,int c){ModCount(id,c);return NativeFunction.CallByName<int>("GET_VEHICLE_MOD",Bike(id),c);}
        // Public toggle/readback is not a documented availability getter. Never infer support from count=0.
        public Capability TurboSupport(Identity id){Bike(id);return Capability.Unknown;}
        public void EnableTurbo(Identity id){LiveGate.Require();Check.That(TurboSupport(id)==Capability.Supported,"turbo support unverified");NativeFunction.CallByName<uint>("TOGGLE_VEHICLE_MOD",Bike(id),18,true);}
        public bool ReadTurbo(Identity id){return NativeFunction.CallByName<bool>("IS_TOGGLE_MOD_ON",Bike(id),18);}
        public bool Mounted(Identity rider,Identity bike){var p=RequireOwned(rider) as Ped;var v=Bike(bike);return p!=null&&p.CurrentVehicle!=null&&p.CurrentVehicle.IsValid()&&p.CurrentVehicle.Handle.Value==v.Handle.Value&&p.CurrentVehicle.Handle.Counter==v.Handle.Counter;}
        public void Drive(Identity rider,Identity bike,MarkerPoint destination,double speed){LiveGate.Require();Check.That(Mounted(rider,bike)&&Check.Finite(speed)&&speed>0&&speed<=100,"driving prerequisites");var p=(Ped)RequireOwned(rider);NativeFunction.CallByName<uint>("TASK_VEHICLE_DRIVE_TO_COORD_LONGRANGE",p,Bike(bike),(float)destination.X,(float)destination.Y,(float)destination.Z,(float)speed,1|2|4|8|16|32,2f);}
        public void StopOwnedTask(Identity id){LiveGate.Require();((Ped)RequireOwned(id)).Tasks.Clear();}
        public void DeleteOwned(Identity id){LiveGate.Require();RequireOwned(id).Delete();/* absence cannot be proven by an invalid wrapper alone */}
        public Reading CopyObservation(Identity bike,Identity rider,MarkerSet markers,double now)
        {
            var v=Bike(bike);var p=Game.LocalPlayer.Character;Check.That(p!=null&&p.IsValid(),"player unavailable");Vector3 vel=v.Velocity;var r=new Reading{At=now,Domain="runtime-observation",Bike=bike,Rider=rider,Position=Point(v.Position),Velocity=Point(vel),Speed=Math.Sqrt(vel.X*vel.X+vel.Y*vel.Y+vel.Z*vel.Z),PlayerPosition=Point(p.Position),PlayerVelocity=Point(p.Velocity),Rotation=new MarkerPoint(v.Rotation.Pitch,v.Rotation.Roll,v.Rotation.Yaw),Mounted=Mounted(rider,bike),EngineOn=v.IsEngineOn,Collision=NativeFunction.CallByName<bool>("HAS_ENTITY_COLLIDED_WITH_ANYTHING",v),Simulation="UNDETERMINED",Interference="UNKNOWN"};
            try{r.Gear=v.CurrentGear;}catch{}try{double raw=v.EngineRevolutionsRatio;if(Check.Finite(raw))r.RawRpm=raw;}catch{}
            Check.That(Inspect(bike)==Presence.Present&&Inspect(rider)==Presence.Present,"changed identity during read");return r;
        }
        private static MarkerPoint Point(Vector3 p){return new MarkerPoint(p.X,p.Y,p.Z);}
    }
    [DataContract]public sealed class ReadinessConfig
    {
        [DataMember]public int Version,Revision;
        [DataMember]public string MarkerFile,Fingerprint,MarkerSession,OutputDirectory;
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
                var file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Plugins","RichAudio.Bati.Rph.json");Check.That(new FileInfo(file).Length<=4096,"config cap");using(var f=File.OpenRead(file))config=(ReadinessConfig)new DataContractJsonSerializer(typeof(ReadinessConfig)).ReadObject(f);Check.That(config.Version==1,"config version");
                PrivateFiles.RequireLocal(config.OutputDirectory);string game=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;Check.That(!Path.GetFullPath(config.OutputDirectory).StartsWith(game,StringComparison.OrdinalIgnoreCase)&&!Path.GetFullPath(config.MarkerFile).StartsWith(game,StringComparison.OrdinalIgnoreCase),"private data must be outside game");Check.That(Directory.Exists(config.OutputDirectory)&&Directory.GetFileSystemEntries(config.OutputDirectory).Length==0,"fresh output required");
                var timer=Stopwatch.StartNew();Game.FrameRender+=Draw;attached=true;Game.Console.Print("RichAudio Bati READINESS ONLY. Load/Status/Show/Hide/Review/Abort. Arm/Start/Cleanup are hard BLOCKED; no live enable setting.");
                while(!stop&&timer.Elapsed.TotalSeconds<600){Guard();Check.That(!drawFailed,"cached display failed");int action=Interlocked.Exchange(ref request,0);if(action==1&&!loaded){markers=MarkerSet.Load(config.MarkerFile,config.Fingerprint,config.Revision,config.MarkerSession,"runtime-observation");hud=new[]{"RICHAUDIO BATI | HISTORICAL MARKERS LOADED","Bike/rider: NOT CREATED | stock tuning: NOT TESTED","Speed / acceleration / continuity: unavailable","Traffic Isolation: OFF | Route Interference: UNKNOWN","Route: UNKNOWN | airport spawn surface NOT VERIFIED","Arm / Start / Cleanup: BLOCKED; no runtime producer","No traffic / geometry scans / audio / entity mutations"};PrivateFiles.WriteNew(Path.Combine(config.OutputDirectory,"marker-readiness.json"),new RunRecord{Domain="runtime-observation",MarkerRevision=markers.Revision,MarkerFingerprint=markers.Fingerprint,Listener=markers.Listener,Outcome="BLOCKED",Reason="no runtime route producer",LiveStartSupported=false});loaded=true;}GameFiber.Yield();}
            }catch(Exception e){Game.Console.Print("RichAudio Bati readiness stopped: "+e.GetType().Name);}finally{stop=true;if(attached)Game.FrameRender-=Draw;}
        }
        private static void Draw(object sender,GraphicsEventArgs e){if(!visible)return;try{var lines=hud;for(int i=0;i<lines.Length;i++)e.Graphics.DrawText(lines[i],"Arial",16,new PointF(24,32+24*i),Color.White);}catch{drawFailed=true;}}
        [ConsoleCommand(Name="RichAudioBatiLoad",Description="Read pinned historical markers; no route authorization")]public static void Load(){Interlocked.CompareExchange(ref request,1,0);}
        [ConsoleCommand(Name="RichAudioBatiStatus",Description="Report cached readiness only")]public static void Status(){foreach(var line in hud)Game.Console.Print(line);}
        [ConsoleCommand(Name="RichAudioBatiShow",Description="Show cached status; no acquisition")]public static void Show(){visible=true;}
        [ConsoleCommand(Name="RichAudioBatiHide",Description="Hide cached status")]public static void Hide(){visible=false;}
        [ConsoleCommand(Name="RichAudioBatiArm",Description="BLOCKED in this offline-readiness build")]public static void Arm(){Game.Console.Print("BLOCKED: no live authorization or route-readiness producer");}
        [ConsoleCommand(Name="RichAudioBatiStart",Description="BLOCKED; cannot spawn or drive")]public static void Start(){Arm();}
        [ConsoleCommand(Name="RichAudioBatiReview",Description="Review cached readiness; no run exists")]public static void Review(){Status();}
        [ConsoleCommand(Name="RichAudioBatiCleanup",Description="BLOCKED; this build owns no runtime entities")]public static void Cleanup(){Arm();}
        [ConsoleCommand(Name="RichAudioBatiAbort",Description="End readiness inspection")]public static void Abort(){stop=true;}
        public static void Unload(){stop=true;Game.FrameRender-=Draw;}
    }
}
