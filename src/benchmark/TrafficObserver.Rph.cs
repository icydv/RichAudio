// Opt-in calibration adapter. Exactly three frame-scoped population requests; no entity mutators.
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
using RichAudio.TrafficResearch;
[assembly:Plugin("RichAudio Traffic Calibration",Author="RichAudio",Description="One bounded baseline/suppression/restoration observation; no spawning or audio",EntryPoint="RichAudio.TrafficRph.Observer.Main",ExitPoint="RichAudio.TrafficRph.Observer.OnUnload",PrefersSingleInstance=true)]
namespace RichAudio.TrafficRph
{
    [DataContract] public sealed class Config {[DataMember]public int SchemaVersion;[DataMember]public bool StoryModeOnly;[DataMember]public string OutputDirectory;[DataMember(EmitDefaultValue=false)]public string ObservationScope;}
    [DataContract] public sealed class Metrics
    {
        [DataMember] public long ControllerTicks,Observations,HudFrames,WorldDrawFrames,ManagedMemoryBytes;
        [DataMember] public double GuardTotalMs,GuardMaxMs,ControllerTotalMs,ControllerMaxMs,ObservationTotalMs,ObservationMaxMs,HudTotalMs,HudMaxMs,WorldDrawTotalMs,WorldDrawMaxMs;
        [DataMember] public bool Closed,RequestsDetached;[DataMember]public string EndReason;
    }
    internal sealed class Requests:IFrameTrafficControl
    {
        private static readonly ulong[] hashes={0x245A6883D966D537UL,0xB3B3359379FE77D3UL,0xEAE6DCC7EEE3DB1DUL};
        public void Request(int control,float value){Rules.Value(value);if(control<0||control>=hashes.Length)throw new ArgumentException("control index");NativeFunction.CallByHash<uint>(hashes[control],value);}
    }
    public static class Observer
    {
        private static readonly Stopwatch clock=Stopwatch.StartNew();private static readonly Requests requests=new Requests();
        private static readonly Metrics metrics=new Metrics();private static readonly object sync=new object();
        private static volatile bool ready,stopping,areaRequested,confirmed,beginRequested,visible=true,hudFailure;
        private static volatile string[] hud={"RICHAUDIO TRAFFIC | READY / no population requests"};
        private static Config config;private static Area area;private static Calibration calibration;private static V3 camera;
        private static uint player;private static int interior;private static string session,endReason="not started";
        private static bool StreamedPool {get{return config!=null&&config.SchemaVersion==2&&config.ObservationScope=="streamed-pool";}}
        private static bool areaClaimed,beginClaimed;private static int writes;
        private static readonly HashSet<string> firstObserved=new HashSet<string>();
        private static HashSet<string> previousAreaIDs=new HashSet<string>();private static string observedPhase;private static int phaseEntries;private static bool unexpectedID;private static double startedAt;
        private static V3 P(Vector3 v){return new V3(v.X,v.Y,v.Z);}
        private static void Parents(string path){for(var d=new DirectoryInfo(path);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("linked evidence path");}
        private sealed class BoundedBuffer:MemoryStream
        {
            public override void Write(byte[] b,int o,int n){if(Length+n>16777216)throw new IOException("evidence size cap");base.Write(b,o,n);}
            public override void WriteByte(byte b){if(Length>=16777216)throw new IOException("evidence size cap");base.WriteByte(b);}
        }
        private static void Save<T>(string name,T value){Parents(config.OutputDirectory);using(var b=new BoundedBuffer()){new DataContractJsonSerializer(typeof(T)).WriteObject(b,value);using(var f=new FileStream(Path.Combine(config.OutputDirectory,name),FileMode.CreateNew,FileAccess.Write,FileShare.None)){b.Position=0;b.CopyTo(f);f.Flush(true);}}}
        private static void Claim(string name){Parents(config.OutputDirectory);using(var f=new FileStream(Path.Combine(config.OutputDirectory,name),FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var w=new StreamWriter(f))w.Write(session);}
        public static void Main()
        {
            bool subscribed=false;
            try{
                string exe=Process.GetCurrentProcess().MainModule.FileName;
                if(!Path.GetFileName(exe).Equals("GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||FileVersionInfo.GetVersionInfo(exe).FileVersion!="1.0.1158.16"||FileVersionInfo.GetVersionInfo(typeof(Game).Assembly.Location).FileVersion!="1.132.1428.17748")throw new NotSupportedException("exact host guard");
                string file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Plugins","RichAudio.Traffic.Rph.json");if(new FileInfo(file).Length>4096)throw new IOException("config bound");
                using(var f=File.OpenRead(file))config=(Config)new DataContractJsonSerializer(typeof(Config)).ReadObject(f);
                if(!(config.SchemaVersion==1&&config.ObservationScope==null||StreamedPool)||!config.StoryModeOnly||string.IsNullOrEmpty(config.OutputDirectory)||!Path.IsPathRooted(config.OutputDirectory))throw new IOException("explicit private config");
                string dir=Path.GetFullPath(config.OutputDirectory),game=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
                if(!dir.Equals(config.OutputDirectory,StringComparison.OrdinalIgnoreCase)||dir.StartsWith(game,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(dir)!="traffic-evidence"||dir.IndexOf(Path.DirectorySeparatorChar+".local"+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)<0||!Directory.Exists(dir)||Directory.GetFileSystemEntries(dir).Length!=0)throw new IOException("fresh private output required");
                Parents(dir);session=Guid.NewGuid().ToString("N");Claim("session.attempt");ready=true;Game.FrameRender+=Draw;subscribed=true;
                Game.Console.Print(StreamedPool?"RichAudio TRAFFIC READY. Prepare / Begin / Status / Hide / Show / Stop. Blanket density requests, bounded streamed-pool observations; no road box. 45s + 45s + 45s; coverage PARTIAL.":"RichAudio TRAFFIC READY. Area / Confirm / Begin / Status / Hide / Show / Stop. One 45s + 45s + 45s sequence; no vehicles spawned. Coverage PARTIAL, never ROAD CLEAR.");
                while(!stopping){
                    double now=clock.Elapsed.TotalMilliseconds;if(calibration==null&&now>=600000){endReason="readiness expired";break;}
                    if(hudFailure)throw new InvalidOperationException("diagnostic display failed");
                    if(areaRequested){areaRequested=false;PrepareArea();}
                    if(beginRequested){beginRequested=false;Begin();}
                    if(calibration!=null){
                        if(!calibration.Running){endReason=calibration.Reason;break;}
                        var guard=Stopwatch.StartNew();Guard(true);metrics.GuardTotalMs+=guard.Elapsed.TotalMilliseconds;metrics.GuardMaxMs=Math.Max(metrics.GuardMaxMs,guard.Elapsed.TotalMilliseconds);now=clock.Elapsed.TotalMilliseconds;var w=Stopwatch.StartNew();calibration.Tick(now,NativeFunction.CallByName<int>("GET_FRAME_COUNT"),requests);metrics.ControllerTicks++;metrics.ControllerTotalMs+=w.Elapsed.TotalMilliseconds;metrics.ControllerMaxMs=Math.Max(metrics.ControllerMaxMs,w.Elapsed.TotalMilliseconds);
                        if(calibration.Due(now))Observe(now);if(!calibration.Running){endReason=calibration.Reason;break;}
                    }
                    if(!StreamedPool&&visible&&area!=null&&!Game.IsPaused){var w=Stopwatch.StartNew();V3[] points={area.Point(12,0),area.Point(42,0),area.Point(42,12),area.Point(12,12)};for(int i=0;i<4;i++){V3 a=points[i],b=points[(i+1)%4];NativeFunction.CallByName<uint>("DRAW_LINE",(float)a.X,(float)a.Y,(float)(a.Z+.2),(float)b.X,(float)b.Y,(float)(b.Z+.2),255,220,0,220);}metrics.WorldDrawFrames++;metrics.WorldDrawTotalMs+=w.Elapsed.TotalMilliseconds;metrics.WorldDrawMaxMs=Math.Max(metrics.WorldDrawMaxMs,w.Elapsed.TotalMilliseconds);}
                    GameFiber.Yield();
                }
            }catch(ThreadAbortException){endReason="host cancellation";throw;}
            catch(Exception e){endReason=e.GetType().Name+": "+e.Message;Game.Console.Print("RichAudio traffic stopped: "+e.GetType().Name);}
            finally{
                ready=false;stopping=true;if(subscribed)Game.FrameRender-=Draw;
                if(calibration!=null&&calibration.Running)calibration.Stop(clock.Elapsed.TotalMilliseconds,endReason,true);
                metrics.Closed=true;metrics.RequestsDetached=true;metrics.EndReason=endReason;metrics.ManagedMemoryBytes=GC.GetTotalMemory(false);
                if(config!=null&&session!=null&&Interlocked.Exchange(ref writes,1)==0)try{if(calibration!=null)Save("traffic-evidence.json",calibration.Snapshot());lock(sync){Save("closed-metrics.json",metrics);}Game.Console.Print("RichAudio TRAFFIC CLOSED: request loop detached; evidence flushed. Traffic return requires independent observation.");}catch(Exception e){Game.Console.Print("RichAudio traffic evidence incomplete: "+e.GetType().Name);}
            }
        }
        private static Ped Guard(bool fixedContext)
        {
            if(stopping||Game.IsPaused||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))throw new InvalidOperationException("Story Mode/pause guard");
            Ped p=Game.LocalPlayer.Character;if(p==null||!p.IsValid()||p.CurrentVehicle!=null&&p.CurrentVehicle.IsValid()||!P(p.Position).Finite||!P(p.Velocity).Finite||P(p.Velocity).Length>.25)throw new InvalidOperationException("stationary on foot required");
            int value=NativeFunction.CallByName<int>("GET_INTERIOR_FROM_ENTITY",p);if(value!=0)throw new InvalidOperationException("exterior only");
            if(fixedContext&&(p.Handle.Value!=player||value!=interior||V3.Sub(P(p.Position),area.Anchor).Length>.25))throw new InvalidOperationException("listener/session changed");
            if(fixedContext){V3 current=P(NativeFunction.CallByName<Vector3>("GET_GAMEPLAY_CAM_ROT",2));if(!current.Finite||Angle(current.X,camera.X)>2||Angle(current.Y,camera.Y)>2||Angle(current.Z,camera.Z)>2)throw new InvalidOperationException("camera changed");}
            return p;
        }
        private static double Angle(double a,double b){double x=Math.Abs(a-b)%360;return Math.Min(x,360-x);}
        private static void PrepareArea()
        {
            if(areaClaimed||calibration!=null)throw new InvalidOperationException("one area only");areaClaimed=true;Claim("area.attempt");Ped p=Guard(false);V3 f=P(p.ForwardVector);double n=Math.Sqrt(f.X*f.X+f.Y*f.Y);if(!f.Finite||n<.5)throw new InvalidOperationException("area heading");
            area=new Area{Anchor=P(p.Position),Forward=new V3(f.X/n,f.Y/n,0),Right=new V3(f.Y/n,-f.X/n,0),Provenance=StreamedPool?"measured-player-pose-streamed-pool-v2":"measured-player-pose-local-corridor-v1"};area.Validate();player=p.Handle.Value;interior=0;Save("area.json",area);
            if(StreamedPool){confirmed=true;hud=new[]{"RICHAUDIO TRAFFIC | PREPARED / requests OFF","Streamed-pool observations, nearest 32 valid readings; omitted vehicles counted","No road box / no road clearance claim / no vehicles removed","Begin starts one 45s baseline + 45s blanket requests + 45s restoration"};Game.Console.Print("RichAudio pool anchor prepared. Remain stationary on the pavement. Begin starts the single sequence; no area alignment or Confirm required.");return;}
            hud=new[]{"RICHAUDIO TRAFFIC | AREA PROPOSED / requests OFF","Yellow outline: 30 x 12 native units, 12 units ahead, road on my RIGHT","Confirm only if the whole outline is one visible straight level road; no junction/overpass/occlusion","Coverage remains PARTIAL: entity enumeration is not complete world visibility"};
            Game.Console.Print("RichAudio traffic area captured. Inspect the outline; Confirm acknowledges local visual setup only. No traffic requests.");
        }
        private static void Begin()
        {
            if(beginClaimed||area==null||!confirmed)throw new InvalidOperationException("confirmed area required; one attempt");beginClaimed=true;Guard(false);if(Game.LocalPlayer.Character.Handle.Value!=player||V3.Sub(P(Game.LocalPlayer.Character.Position),area.Anchor).Length>.25)throw new InvalidOperationException("listener changed");
            camera=P(NativeFunction.CallByName<Vector3>("GET_GAMEPLAY_CAM_ROT",2));if(!camera.Finite)throw new InvalidOperationException("camera");Claim("calibration.attempt");calibration=new Calibration(area,"runtime-observation",session);startedAt=clock.Elapsed.TotalMilliseconds;calibration.Begin(startedAt);
            Game.Console.Print("RichAudio calibration STARTED. Remain stationary with fixed camera: 45s baseline, 45s requests, 45s restoration. Stop anytime. No Bati.");
        }
        private static void Observe(double now)
        {
            var w=Stopwatch.StartNew();Vehicle[] all=World.GetAllVehicles();if(all==null||all.Length>4096)throw new InvalidOperationException("enumeration bound");var found=new List<VehicleReading>();int errors=0;
            foreach(Vehicle v in all){try{
                if(v==null||!v.IsValid()){errors++;continue;}uint handle=v.Handle.Value,model=v.Model.Hash;V3 pos=P(v.Position);if(!pos.Finite){errors++;continue;}if(!area.Contains(pos)){if(StreamedPool)errors++;continue;}
                int generation=v.Handle.Counter;var r=new VehicleReading{Handle=handle,Model=model,PoolCounter=generation,Identity=StreamedPool?PoolSelection.Identity(handle,model,generation):handle.ToString("X8")+"-"+model.ToString("X8"),Position=pos,Velocity=P(v.Velocity),VehicleClass=NativeFunction.CallByHash<int>(0x29439776AAA00A62UL,v),PopulationType=NativeFunction.CallByHash<int>(0xF6F5161F4534EDFFUL,v)};
                if(!v.IsValid()||v.Handle.Value!=handle||v.Model.Hash!=model||StreamedPool&&v.Handle.Counter!=generation){errors++;continue;}r.Validate();found.Add(r);if(!StreamedPool&&found.Count>64)throw new InvalidOperationException("area population bound");
            }catch(ThreadAbortException){throw;}catch{errors++;}}
            if(!StreamedPool&&found.Count>64)throw new InvalidOperationException("area population bound");var sample=StreamedPool?PoolSelection.Select(area,found,all.Length,errors):new Sample{Coverage="PARTIAL",Enumerated=all.Length,ReadErrors=errors,Vehicles=found.ToArray()};sample.AtMs=now;sample.Listener=P(Game.LocalPlayer.Character.Position);sample.CameraRotation=P(NativeFunction.CallByName<Vector3>("GET_GAMEPLAY_CAM_ROT",2));sample.ObservationCostMs=w.Elapsed.TotalMilliseconds;if(StreamedPool)found=new List<VehicleReading>(sample.Vehicles);
            calibration.Observe(now,sample);bool samePhase=observedPhase==calibration.State;if(!samePhase)phaseEntries=0;var ids=new HashSet<string>();foreach(var v in found){ids.Add(v.Identity);if(samePhase&&!previousAreaIDs.Contains(v.Identity))phaseEntries++;if(calibration.State=="SUPPRESSION_ACTIVE"&&!firstObserved.Contains(v.Identity))unexpectedID=true;firstObserved.Add(v.Identity);}previousAreaIDs=ids;observedPhase=calibration.State;if(firstObserved.Count>512)throw new InvalidOperationException("identity record bound");metrics.Observations++;metrics.ObservationTotalMs+=w.Elapsed.TotalMilliseconds;metrics.ObservationMaxMs=Math.Max(metrics.ObservationMaxMs,w.Elapsed.TotalMilliseconds);
            hud=new[]{"RICHAUDIO TRAFFIC | "+calibration.State+" | elapsed "+((now-startedAt)/1000).ToString("F1")+" / 135s","Isolation REQUEST: "+(calibration.State=="SUPPRESSION_ACTIVE"?"ACTIVE (effect unverified)":"OFF"),"Observed road coverage: PARTIAL | other roads UNKNOWN","Vehicles detected: "+found.Count+" | phase entries after first snapshot: "+phaseEntries,"Unexpected traffic: "+(calibration.State=="SUPPRESSION_ACTIVE"&&unexpectedID?"DETECTED (new ID, creation unknown)":"UNKNOWN (partial coverage)"),"Read errors: "+errors+" | no ROAD CLEAR / no TRAFFIC RESTORED claim","Stop ends the single attempt | no spawning / no geometry / no audio"};
            if(StreamedPool)hud=new[]{"RICHAUDIO TRAFFIC | "+calibration.State+" | elapsed "+((now-startedAt)/1000).ToString("F1")+" / 135s","Traffic Isolation: "+(calibration.State=="SUPPRESSION_ACTIVE"?"UNVERIFIED | blanket requests ACTIVE":"OFF | blanket requests OFF"),"Streamed enumeration: "+all.Length+" | valid readings: "+sample.PoolEligible,"Detailed cohort: "+found.Count+" | omitted: "+sample.PoolOmitted+" | errors: "+errors,"Coverage PARTIAL | nearest-cohort changes are NOT road entries or spawns","Route Interference: UNKNOWN | no route/Bati under test","Stop ends the single attempt | no deletion / geometry / audio"};
        }
        private static void Draw(object sender,GraphicsEventArgs e)
        {
            if(!ready||!visible)return;var w=Stopwatch.StartNew();try{var lines=hud;for(int i=0;i<lines.Length;i++)e.Graphics.DrawText(lines[i],"Arial",16,new PointF(24,32+24*i),i==2?Color.Yellow:Color.White);lock(sync){metrics.HudFrames++;metrics.HudTotalMs+=w.Elapsed.TotalMilliseconds;metrics.HudMaxMs=Math.Max(metrics.HudMaxMs,w.Elapsed.TotalMilliseconds);}}catch{hudFailure=true;}
        }
        [ConsoleCommand(Name="RichAudioTrafficArea",Description="Historical corridor mode only; claim one road area")]public static void SetArea(){if(ready&&!StreamedPool)areaRequested=true;}
        [ConsoleCommand(Name="RichAudioTrafficPrepare",Description="Streamed-pool mode only: capture one stationary listener anchor, no road box or requests")]public static void Prepare(){if(ready&&StreamedPool)areaRequested=true;}
        [ConsoleCommand(Name="RichAudioTrafficConfirm",Description="Acknowledge unobstructed visual setup; does not certify complete enumeration")]public static void Confirm(){if(ready&&area!=null&&calibration==null)confirmed=true;}
        [ConsoleCommand(Name="RichAudioTrafficBegin",Description="One 45s baseline, 45s requests, 45s restoration; no retry")]public static void Start(){if(ready)beginRequested=true;}
        [ConsoleCommand(Name="RichAudioTrafficStop",Description="Stop all future density requests and finish; no reset")]public static void Stop(){if(!stopping)endReason="manual stop";stopping=true;ready=false;}
        [ConsoleCommand(Name="RichAudioTrafficStatus",Description="Cached state only; no observations or requests")]public static void Status(){Game.Console.Print(calibration==null?"RichAudio traffic READY / requests OFF":calibration.State+" / effectiveness requires offline validation");}
        [ConsoleCommand(Name="RichAudioTrafficShow",Description="Display cached status only")]public static void Show(){visible=true;}
        [ConsoleCommand(Name="RichAudioTrafficHide",Description="Hide display only; does not change the phase controller")]public static void Hide(){visible=false;}
        public static void OnUnload(){if(!stopping)endReason="plugin unload";stopping=true;ready=false;Game.FrameRender-=Draw;}
    }
}
