// Opt-in marker setup only. Explicit pose captures and cached presentation; no benchmark run.
using System;using System.Diagnostics;using System.Drawing;using System.IO;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;using System.Threading;
using Rage;using Rage.Attributes;using Rage.Native;using RichAudio.MarkerResearch;
[assembly:Plugin("RichAudio Benchmark Markers",Author="RichAudio",Description="Set start, finish and listener positions; no spawning, traffic controls or audio",EntryPoint="RichAudio.MarkersRph.Observer.Main",ExitPoint="RichAudio.MarkersRph.Observer.OnUnload",PrefersSingleInstance=true)]
namespace RichAudio.MarkersRph
{
    [DataContract]public sealed class Config {[DataMember]public int SchemaVersion;[DataMember]public bool StoryModeOnly;[DataMember]public string OutputDirectory;}
    [DataContract]public sealed class Footer {[DataMember]public string Reason;[DataMember]public int Revisions;[DataMember]public bool DrawingDetached;}
    public static class Observer
    {
        private static readonly Stopwatch clock=Stopwatch.StartNew();private static volatile bool ready,stopping,visible=true,drawFailed;
        private static volatile string[] hud={"RICHAUDIO MARKERS | setup only"};private static int pending;private static Config config;private static MarkerPlan plan;private static volatile MarkerSnapshot picture;private static string reason="setup timeout";private static bool claimed;
        private static void Parents(string path){for(var d=new DirectoryInfo(path);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("linked marker storage");}
        private static void Save<T>(string name,T value){Parents(config.OutputDirectory);using(var memory=new MemoryStream()){new DataContractJsonSerializer(typeof(T)).WriteObject(memory,value);if(memory.Length>65536)throw new IOException("marker record bound");using(var f=new FileStream(Path.Combine(config.OutputDirectory,name),FileMode.CreateNew,FileAccess.Write,FileShare.None)){memory.Position=0;memory.CopyTo(f);f.Flush(true);}}}
        private static void StoryMode(){if(NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))throw new InvalidOperationException("Story Mode only");}
        private static MarkerPoint Point(Vector3 p){return new MarkerPoint(p.X,p.Y,p.Z);}
        private static void Capture(MarkerKind kind)
        {
            StoryMode();if(Game.IsPaused)throw new InvalidOperationException("close pause menu before marking");Ped p=Game.LocalPlayer.Character;if(p==null||!p.IsValid()||NativeFunction.CallByName<int>("GET_INTERIOR_FROM_ENTITY",p)!=0)throw new InvalidOperationException("valid exterior player required");
            uint handle=p.Handle.Value;int generation=p.Handle.Counter;MarkerPoint pos=Point(p.Position);Vector3 velocity=p.Velocity;double speed=Math.Sqrt(velocity.X*velocity.X+velocity.Y*velocity.Y+velocity.Z*velocity.Z);Vehicle vehicle=p.CurrentVehicle;bool foot=vehicle==null||!vehicle.IsValid();
            if(!p.IsValid()||p.Handle.Value!=handle||p.Handle.Counter!=generation)throw new InvalidOperationException("player changed during capture");
            MarkerSnapshot s;try{s=plan.Set(kind,new MarkerPose{Position=pos,AtMs=clock.Elapsed.TotalMilliseconds,Speed=speed,OnFoot=foot});}catch(ArgumentException){Game.Console.Print("Marker rejected: remain stationary; listener must be on foot; endpoints must be 5..5000 native units apart. Previous markers retained.");return;}
            Save("mark-"+s.Revision.ToString("D2")+"-"+kind.ToString().ToLowerInvariant()+".json",s);
            picture=s;
            hud=new[]{"RICHAUDIO MARKERS | "+(s.MarkersComplete?"THREE MARKERS SET / review only":"SETUP INCOMPLETE"),"Start: "+(s.Start==null?"UNSET":"SET")+" | Finish: "+(s.Finish==null?"UNSET":"SET")+" | Listener: "+(s.Listener==null?"UNSET":"SET"),"Green = start | red = finish | cyan = listener","Endpoint chord: "+s.HorizontalSeparation.ToString("F1")+" native units; route UNKNOWN","No Bati / traffic changes / collision scans / audio. Stop ends setup."};
            Game.Console.Print("RichAudio benchmark "+kind.ToString().ToLowerInvariant()+" saved at the measured player position. Markers are not route-clearance proof.");
        }
        public static void Main()
        {
            bool subscribed=false;
            try{
                string exe=Process.GetCurrentProcess().MainModule.FileName;if(!Path.GetFileName(exe).Equals("GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||FileVersionInfo.GetVersionInfo(exe).FileVersion!="1.0.1158.16"||FileVersionInfo.GetVersionInfo(typeof(Game).Assembly.Location).FileVersion!="1.132.1428.17748")throw new NotSupportedException("exact host guard");
                string file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Plugins","RichAudio.Markers.Rph.json");if(new FileInfo(file).Length>4096)throw new IOException("config bound");using(var f=File.OpenRead(file))config=(Config)new DataContractJsonSerializer(typeof(Config)).ReadObject(f);
                string dir=Path.GetFullPath(config.OutputDirectory),game=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
                if(config.SchemaVersion!=1||!config.StoryModeOnly||!Path.IsPathRooted(config.OutputDirectory)||dir!=config.OutputDirectory||dir.StartsWith(game,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(dir)!="marker-evidence"||dir.IndexOf(Path.DirectorySeparatorChar+".local"+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)<0||!Directory.Exists(dir)||Directory.GetFileSystemEntries(dir).Length!=0)throw new IOException("fresh private marker storage required");
                Parents(dir);StoryMode();plan=new MarkerPlan("runtime-observation",Guid.NewGuid().ToString("N"));picture=plan.Snapshot();Save("session.json",picture);claimed=true;Game.FrameRender+=Draw;subscribed=true;ready=true;
                Game.Console.Print("RichAudio MARKERS READY. BenchStart / BenchFinish / BenchListener commands use the RichAudio prefix. Stop at each location before marking. Setup only; no Bati or traffic controls.");
                while(!stopping&&clock.Elapsed.TotalMilliseconds<900000){
                    StoryMode();if(drawFailed)throw new InvalidOperationException("marker display failed");int action=Interlocked.Exchange(ref pending,0);if(action>0)Capture((MarkerKind)(action-1));
                    if(visible&&!Game.IsPaused){MarkerSnapshot s=picture;if(s.Lines.Length>5)throw new InvalidOperationException("drawing bound");foreach(var line in s.Lines){if(!line.A.Valid||!line.B.Valid)throw new InvalidOperationException("marker draw bounds");int r=line.Kind=="Finish"?255:0,g=line.Kind=="Finish"?40:255,b=line.Kind=="Listener"?255:0;NativeFunction.CallByName<uint>("DRAW_LINE",(float)line.A.X,(float)line.A.Y,(float)line.A.Z,(float)line.B.X,(float)line.B.Y,(float)line.B.Z,r,g,b,220);}}
                    GameFiber.Yield();
                }
            }catch(ThreadAbortException){reason="host cancellation";throw;}catch(Exception e){reason=e.GetType().Name;Game.Console.Print("RichAudio marker setup stopped: "+reason);}
            finally{ready=false;stopping=true;if(subscribed)Game.FrameRender-=Draw;if(plan!=null)plan.Stop();if(claimed)try{Save("closed.json",new Footer{Reason=reason,Revisions=plan.Snapshot().Revision,DrawingDetached=true});}catch{Game.Console.Print("Marker footer unavailable; prior saved revisions are preserved.");}}
        }
        private static void Queue(MarkerKind kind){if(ready&&Interlocked.CompareExchange(ref pending,(int)kind+1,0)!=0)Game.Console.Print("Marker request already pending; wait for its result.");}
        private static void Draw(object sender,GraphicsEventArgs e){if(!ready||!visible)return;try{var lines=hud;for(int i=0;i<lines.Length;i++)e.Graphics.DrawText(lines[i],"Arial",16,new PointF(24,32+24*i),Color.White);}catch{drawFailed=true;}}
        [ConsoleCommand(Name="RichAudioBenchStart",Description="Set start at my current stationary position")]public static void Start(){Queue(MarkerKind.Start);}
        [ConsoleCommand(Name="RichAudioBenchFinish",Description="Set finish at my current stationary position")]public static void Finish(){Queue(MarkerKind.Finish);}
        [ConsoleCommand(Name="RichAudioBenchListener",Description="Set listener here; stationary and on foot")]public static void Listener(){Queue(MarkerKind.Listener);}
        [ConsoleCommand(Name="RichAudioBenchShow",Description="Show recorded markers only; no acquisition")]public static void Show(){visible=true;}
        [ConsoleCommand(Name="RichAudioBenchHide",Description="Hide recorded markers only; no acquisition")]public static void Hide(){visible=false;}
        [ConsoleCommand(Name="RichAudioBenchStop",Description="End marker setup and drawing")]public static void Stop(){reason="manual stop";stopping=true;ready=false;}
        public static void OnUnload(){reason="plugin unload";stopping=true;ready=false;Game.FrameRender-=Draw;}
    }
}
