// Camera-only mailbox and owned local viewer lifecycle. No audio or collision API.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace RichAudio.Beacon.Windows
{
    public sealed class PassiveCameraSample
    {
        public long Sequence,Generation,ObservationTicks,ObservedAtUnixMs;
        public double[] Position,Forward,Up,Velocity;
        public bool Valid;
        public string Reason;
    }
    public sealed class PassiveSoundMapBridge:IDisposable
    {
        private readonly string pointer,session=Guid.NewGuid().ToString("N"),stream=Guid.NewGuid().ToString("N"),owner=Guid.NewGuid().ToString("N");
        private readonly AutoResetEvent wake=new AutoResetEvent(false);
        private Thread thread;private PassiveCameraSample latest;private int stopped,started,storyReady;
        private InGameSettingsLink link;private Process service,window;private string url,token;private bool attempted;
        private volatile string diagnostic="loading";private int sampleHz=20,enabled;private long accepted,expired;
        public string Diagnostic{get{return diagnostic;}}public int SampleHz{get{return Volatile.Read(ref sampleHz);}}public bool Enabled{get{return Volatile.Read(ref enabled)!=0;}}
        public PassiveSoundMapBridge(string sidecar){pointer=sidecar;}
        public void Start(){if(Interlocked.Exchange(ref started,1)!=0)throw new InvalidOperationException("Passive feed cannot restart");thread=new Thread(Run){IsBackground=true,Name="RichAudio passive camera transport"};thread.Start();}
        public void SetStoryReady(bool value){Volatile.Write(ref storyReady,value?1:0);Signal();}
        public void Publish(PassiveCameraSample sample){if(sample!=null&&Volatile.Read(ref stopped)==0){Interlocked.Exchange(ref latest,sample);Signal();}}
        public void RequestStop(){Interlocked.Exchange(ref stopped,1);Signal();}
        private void Signal(){try{wake.Set();}catch(ObjectDisposedException){}}
        private object Request(string route,object payload)
        {
            var request=(HttpWebRequest)WebRequest.Create(url+route);request.Proxy=null;request.AllowAutoRedirect=false;request.ServicePoint.Expect100Continue=false;request.Timeout=300;request.ReadWriteTimeout=300;request.KeepAlive=false;
            request.Headers["X-RichAudio-Token"]=token;request.Method=payload==null?"GET":"POST";
            if(payload!=null){byte[] bytes=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(payload));request.ContentType="application/json";request.ContentLength=bytes.Length;using(var output=request.GetRequestStream())output.Write(bytes,0,bytes.Length);}
            using(var response=request.GetResponse())using(var input=response.GetResponseStream())using(var reader=new StreamReader(input)){
                char[] buffer=new char[32769];int count=0,read;while(count<buffer.Length&&(read=reader.Read(buffer,count,buffer.Length-count))>0)count+=read;
                if(count==buffer.Length)throw new InvalidDataException("Bounded service response");return new JavaScriptSerializer().DeserializeObject(new string(buffer,0,count));}
        }
        private bool Connect(bool requireOwner)
        {
            url=null;token=null;
            try{
                string descriptor=AcousticSettingsStore.PrivatePath(link.WorkspaceRoot,".local/soundmap/service.json");
                InGameSettingsLink.LocalFile(descriptor);
                var d=new JavaScriptSerializer().DeserializeObject(AcousticSettingsStore.ReadBounded(descriptor,4096)) as Dictionary<string,object>;
                string expected="http://127.0.0.1:"+link.SoundMap.Port;
                if(d==null||!d.ContainsKey("url")||!d.ContainsKey("token")||!String.Equals(d["url"] as string,expected,StringComparison.Ordinal)||!(d["token"] is string)||!System.Text.RegularExpressions.Regex.IsMatch((string)d["token"],"\\A[a-f0-9]{64}\\z"))return false;
                if(requireOwner&&(!d.ContainsKey("ownerId")||!String.Equals(d["ownerId"] as string,owner,StringComparison.Ordinal)))return false;
                url=expected;token=(string)d["token"];Request("/api/status",null);return true;
            }catch{url=null;token=null;return false;}
        }
        private static string Quote(string value){if(value.IndexOf('"')>=0||value.EndsWith("\\",StringComparison.Ordinal))throw new InvalidDataException("Process argument");return "\""+value+"\"";}
        private void EnsureService()
        {
            if(attempted)return;attempted=true;
            if(!Connect(false)){
                if(!link.SoundMap.AutoStartService){diagnostic="service-unavailable";return;}
                string script=Path.Combine(link.WorkspaceRoot,"tools","soundmap","server.mjs");
                // PrivatePath verifies reparse containment; service code remains in the reviewed workspace.
                AcousticSettingsStore.PrivatePath(link.WorkspaceRoot,".local/soundmap/service.json");
                InGameSettingsLink.LocalFile(script);if(!File.Exists(script))throw new InvalidDataException("Service script unavailable");
                var start=new ProcessStartInfo(link.SoundMap.NodeExecutable,Quote(script)+" --root "+Quote(link.WorkspaceRoot)+" --port "+link.SoundMap.Port+" --owner "+owner){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=link.WorkspaceRoot};
                service=Process.Start(start);long at=Stopwatch.GetTimestamp();
                while(Volatile.Read(ref stopped)==0&&!service.HasExited&&(Stopwatch.GetTimestamp()-at)/(double)Stopwatch.Frequency<3){if(Connect(true))break;wake.WaitOne(50);}
                if(!Connect(true)){diagnostic="owned-service-start-failed";return;}
            }
            if(Volatile.Read(ref stopped)!=0)return;
            diagnostic="connected";
            if(link.SoundMap.OpenWindow){
                string browser=null;
                foreach(string candidate in new[]{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),"Microsoft","Edge","Application","msedge.exe"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Google","Chrome","Application","chrome.exe")})if(File.Exists(candidate)){browser=candidate;break;}
                if(browser==null){diagnostic="connected-window-unavailable";return;}
                // A fresh per-owner profile prevents Chromium singleton handoff
                // to an earlier window whose lifetime we do not own.
                string profile=AcousticSettingsStore.PrivatePath(link.WorkspaceRoot,".local/soundmap/browser/"+owner+"/profile-marker");InGameSettingsLink.LocalFile(profile);Directory.CreateDirectory(Path.GetDirectoryName(profile));
                window=Process.Start(new ProcessStartInfo(browser,"--app="+url+" --user-data-dir="+Quote(Path.GetDirectoryName(profile))+" --no-first-run --no-default-browser-check --window-size=1280,820"){UseShellExecute=false,CreateNoWindow=true});
            }
        }
        private void Run()
        {
            try{
                link=InGameSettingsLink.Load(pointer);Volatile.Write(ref sampleHz,link.SoundMap.SampleHz);
                if(!link.SoundMap.Enabled){diagnostic="disabled";return;}
                Volatile.Write(ref enabled,1);
                diagnostic="waiting-story-mode";
                long reconnectAt=0;
                while(Volatile.Read(ref stopped)==0){
                    if(Volatile.Read(ref storyReady)!=0)EnsureService();
                    if(attempted&&url==null&&Stopwatch.GetTimestamp()>=reconnectAt){Connect(false);reconnectAt=Stopwatch.GetTimestamp()+Stopwatch.Frequency;}
                    var sample=Interlocked.Exchange(ref latest,null);
                    if(sample!=null&&url!=null&&token!=null&&attempted){
                        double age=(Stopwatch.GetTimestamp()-sample.ObservationTicks)*1000.0/Stopwatch.Frequency;
                        if(age>=0&&age<=500){try{
                            var result=Request("/api/passive",new{schemaVersion=1,kind="passive-listener",streamId=stream,sessionId=session,sequence=sample.Sequence,observedAtUnixMs=sample.ObservedAtUnixMs,sampleAgeMs=age,coordinateSpace="gta-native-unscaled",units="native-unverified",listener=new{position=sample.Position,forward=sample.Forward,up=sample.Up,velocity=sample.Velocity,valid=sample.Valid,reason=sample.Reason,generation=sample.Generation}}) as Dictionary<string,object>;
                            bool ok=result!=null&&result.ContainsKey("accepted")&&Object.Equals(result["accepted"],true);if(ok)accepted++;
                            diagnostic=ok?"tracking-passive-native":"passive-rejected";
                        }catch{diagnostic="passive-service-disconnected";url=null;token=null;}}
                        else expired++;
                    }
                    wake.WaitOne(Math.Max(1,1000/SampleHz));
                }
            }catch(Exception e){diagnostic="passive-failed-"+e.GetType().Name;}
            finally{
                // Only the dedicated process/window and capability-owned service are stopped.
                if(window!=null){try{if(!window.HasExited){window.CloseMainWindow();if(!window.WaitForExit(1000))window.Kill();}}catch{diagnostic="window-shutdown-failed";}finally{window.Dispose();}}
                if(service!=null){try{if(!service.HasExited){if(Connect(true))Request("/api/service/stop",new{ownerId=owner});if(!service.WaitForExit(2000)){diagnostic="service-shutdown-timeout";service.Kill();service.WaitForExit(500);}}}catch{diagnostic="service-shutdown-failed";}finally{service.Dispose();}}
                if(link!=null&&link.SoundMap.Enabled)try{string result=AcousticSettingsStore.PrivatePath(link.WorkspaceRoot,".local/soundmap/passive-result.json");InGameSettingsLink.LocalFile(result);Directory.CreateDirectory(Path.GetDirectoryName(result));File.WriteAllText(result,new JavaScriptSerializer().Serialize(new{schemaVersion=1,kind="passive-listener",diagnostic=diagnostic,accepted=accepted,expired=expired,serviceOwned=service!=null,windowOwned=window!=null,audioOpened=false,sensingStarted=false,stopped=true}));}catch{diagnostic="passive-result-write-failed";}
            }
        }
        public void Dispose(){RequestStop();var worker=thread;if(worker!=null&&worker!=Thread.CurrentThread&&!worker.Join(6500))throw new TimeoutException("Passive worker still owns resources");wake.Dispose();}
    }
}
