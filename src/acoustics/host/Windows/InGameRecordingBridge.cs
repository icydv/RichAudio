// Optional local recorder control. One bounded background worker owns all file
// and HTTP work; game and raw-render fibers read immutable snapshots only.
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
    public sealed class InGameRecordingSnapshot
    {
        public readonly bool Available,Active,Pending;
        public readonly string RecordingId,Detail;
        public readonly MenuDiagnostic Diagnostic;
        internal readonly string Binding;
        internal readonly long At;
        internal InGameRecordingSnapshot(bool available,bool active,bool pending,string id,string detail,string binding,MenuDiagnostic diagnostic=null)
        {Available=available;Active=active;Pending=pending;RecordingId=id;Detail=detail;Binding=binding;At=Stopwatch.GetTimestamp();Diagnostic=diagnostic??new MenuDiagnostic("recorder",available?"connected":"disconnected");}
    }

    public sealed class InGameRecordingBridge:IDisposable
    {
        private sealed class Command {public bool Start;public string Id,Binding;}
        private static readonly InGameRecordingSnapshot unavailable=new InGameRecordingSnapshot(false,false,false,null,"SoundMap recorder unavailable",null);
        private readonly string pointerPath;
        private readonly AutoResetEvent wake=new AutoResetEvent(false);
        private InGameRecordingSnapshot snapshot=unavailable;
        private Command pending;
        private Thread thread;
        private int started,stopped,inFlight;
        private string workspace;
        public InGameRecordingBridge(string pointerPath){this.pointerPath=Path.GetFullPath(pointerPath);}
        public InGameRecordingSnapshot Snapshot
        {
            get {var current=Volatile.Read(ref snapshot);
                if(!current.Available)return current;
                if((Stopwatch.GetTimestamp()-current.At)/(double)Stopwatch.Frequency>2)return unavailable;
                if(Volatile.Read(ref inFlight)!=0)return new InGameRecordingSnapshot(true,current.Active,true,current.RecordingId,"Recording request pending",current.Binding);
                return current;}
        }
        public void Start()
        {
            if(Interlocked.CompareExchange(ref started,1,0)!=0||Volatile.Read(ref stopped)!=0)throw new InvalidOperationException("Recorder control cannot restart");
            thread=new Thread(Run){IsBackground=true,Name="RichAudio recorder controls"};thread.Start();
        }
        public bool TrySetRecording(bool start)
        {
            var current=Snapshot;
            if(!current.Available||current.Pending||current.Active==start||Volatile.Read(ref stopped)!=0||Interlocked.CompareExchange(ref inFlight,1,0)!=0)return false;
            Interlocked.Exchange(ref pending,new Command{Start=start,Id=current.RecordingId,Binding=current.Binding});Signal();return true;
        }
        private void Signal(){try{wake.Set();}catch(ObjectDisposedException){}}
        public void RequestStop(){Interlocked.Exchange(ref stopped,1);Signal();}
        private static Dictionary<string,object> Object(string text)
        {var value=new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=16}.DeserializeObject(text) as Dictionary<string,object>;
            if(value==null)throw new InvalidDataException("Recorder object required");return value;}
        private static string RequiredString(Dictionary<string,object> value,string name,int maximum)
        {object raw;if(!value.TryGetValue(name,out raw)||!(raw is string)||((string)raw).Length==0||((string)raw).Length>maximum)throw new InvalidDataException("Recorder field invalid");return (string)raw;}
        private static Dictionary<string,object> Request(string url,string token,string route,object body=null)
        {
            var request=(HttpWebRequest)WebRequest.Create(url.TrimEnd('/')+route);
            request.Proxy=null;request.AllowAutoRedirect=false;request.Timeout=300;request.ReadWriteTimeout=300;request.KeepAlive=false;
            request.ServicePoint.Expect100Continue=false;
            request.Headers["X-RichAudio-Token"]=token;
            if(body!=null){request.Method="POST";request.ContentType="application/json";
                byte[] bytes=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(body));request.ContentLength=bytes.Length;
                using(var output=request.GetRequestStream())output.Write(bytes,0,bytes.Length);}
            using(var response=(HttpWebResponse)request.GetResponse())using(var input=response.GetResponseStream()){
                if(response.StatusCode!=HttpStatusCode.OK)throw new IOException("Recorder request rejected");
                byte[] bytes=new byte[65537];int count=0;
                while(count<bytes.Length){int read=input.Read(bytes,count,bytes.Length-count);if(read==0)break;count+=read;}
                if(count>65536)throw new InvalidDataException("Recorder response exceeds bound");
                return Object(new UTF8Encoding(false,true).GetString(bytes,0,count));}
        }
        private void Run()
        {
            try{while(Volatile.Read(ref stopped)==0){
                Command command=null;
                string stage="recorder-connection";MenuDiagnostic diagnostic=null;
                try{
                    var link=InGameSettingsLink.Load(pointerPath,out diagnostic);
                    stage="recorder-binding";
                    if(workspace!=null&&!String.Equals(workspace,link.WorkspaceRoot,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Recorder workspace changed");
                    workspace=link.WorkspaceRoot;
                    string descriptor=AcousticSettingsStore.PrivatePath(workspace,Path.Combine(".local","soundmap","service.json"));
                    stage="recorder-descriptor";var service=Object(AcousticSettingsStore.ReadBounded(descriptor,4096));object version;
                    if(!service.TryGetValue("schemaVersion",out version)||!(version is int)||(int)version!=1)throw new InvalidDataException("Recorder descriptor version");
                    string url=RequiredString(service,"url",128),token=RequiredString(service,"token",128);
                    Uri uri;if(!Uri.TryCreate(url,UriKind.Absolute,out uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.Port<1024||uri.Port>65535||uri.UserInfo!=""||uri.AbsolutePath!="/"||uri.Query!=""||uri.Fragment!="")throw new InvalidDataException("Loopback recorder required");
                    if(!System.Text.RegularExpressions.Regex.IsMatch(token,"\\A[a-f0-9]{64}\\z"))throw new InvalidDataException("Recorder capability invalid");
                    string binding=url+"\n"+token;
                    command=Interlocked.Exchange(ref pending,null);
                    if(command!=null){
                        if(command.Binding!=binding)throw new InvalidDataException("Recorder changed during command");
                        if(Volatile.Read(ref stopped)!=0)break;
                        Request(url,token,command.Start?"/api/record/start":"/api/record/stop",command.Start?
                            new Dictionary<string,object>{{"maxDurationSeconds",120},{"maxBytes",67108864}}:
                            new Dictionary<string,object>{{"id",command.Id}});
                    }
                    stage="recorder-service";var status=Request(url,token,"/api/status");object raw;
                    if(!status.TryGetValue("recording",out raw))throw new InvalidDataException("Recorder status missing");
                    bool active=false,isPending=false;string id=null;
                    if(raw!=null){var record=raw as Dictionary<string,object>;if(record==null)throw new InvalidDataException("Recorder status invalid");
                        id=RequiredString(record,"id",128);string state=RequiredString(record,"state",32);
                        if(state!="recording"&&state!="stopping")throw new InvalidDataException("Recorder state invalid");active=true;isPending=state=="stopping";}
                    Interlocked.Exchange(ref snapshot,new InGameRecordingSnapshot(true,active,isPending,id,
                        isPending?"Recording is stopping":active?"Recording privately; owned PCM only":"Ready; recording stays on this computer",binding));
                }catch(Exception e){diagnostic=diagnostic??MenuDiagnostic.Failure(stage,e);Interlocked.Exchange(ref snapshot,new InGameRecordingSnapshot(false,false,false,null,"Recorder unavailable: "+diagnostic.Summary,null,diagnostic));if(command==null)command=Interlocked.Exchange(ref pending,null);}
                finally{if(command!=null)Interlocked.Exchange(ref inFlight,0);}
                if(Volatile.Read(ref stopped)==0)wake.WaitOne(500);
            }}finally{Interlocked.Exchange(ref snapshot,unavailable);Interlocked.Exchange(ref pending,null);Interlocked.Exchange(ref inFlight,0);wake.Dispose();}
        }
        // Called off the game fiber by the plugin unload path.
        public void Dispose(){RequestStop();if(thread!=null&&thread!=Thread.CurrentThread)thread.Join(1200);}
    }
}
