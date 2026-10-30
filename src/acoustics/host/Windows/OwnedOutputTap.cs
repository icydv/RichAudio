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
    // One WASAPI producer, one network consumer. No locks, allocation, disk or
    // HTTP on the endpoint callback. Full queue drops evidence, never audio.
    public sealed class OwnedOutputTap : IDisposable
    {
        internal const int Capacity=64, MaximumFrames=2048;
        internal sealed class Chunk { internal readonly float[] Samples=new float[MaximumFrames*2]; internal int Frames,SuppliedFrames;internal long SubmittedFrame,ConsumedFrame,ProducerFrameStart,QpcTicks,UnderflowFrames,EndSilenceFrames;internal string RecordingId; }
        private readonly Chunk[] slots=new Chunk[Capacity];
        private int write,read,inFlight;private volatile string recordingId;private volatile bool stop;
        private readonly Thread writer;private string url,token;private readonly string configurationPath,hostId=Guid.NewGuid().ToString("N");
        private readonly JavaScriptSerializer json=new JavaScriptSerializer();
        private readonly long anchorTicks=Stopwatch.GetTimestamp(),anchorUnixMs=(long)(DateTime.UtcNow-new DateTime(1970,1,1)).TotalMilliseconds;
        public long CapturedFrames,DroppedFrames,DroppedChunks,UploadedFrames,UploadFailures,MaximumCopyTicks;
        public string LastError;
        public string TerminalFailure;
        public OwnedOutputTap(string configuration) : this()
        {
            configurationPath=Path.GetFullPath(configuration);ReadConfiguration();
            writer=new Thread(Run);writer.IsBackground=true;writer.Name="RichAudio owned PCM evidence";writer.Start();
        }
        private void ReadConfiguration()
        {
            string configuration=configurationPath;var directory=Directory.GetParent(configuration);
            if(Path.GetFileName(configuration)!="service.json"||directory.Name!="soundmap"||directory.Parent.Name!=".local")throw new ArgumentException("Private .local/soundmap/service.json required");
            for(var ancestor=directory;ancestor!=null;ancestor=ancestor.Parent)if((ancestor.Attributes&FileAttributes.ReparsePoint)!=0)throw new ArgumentException("Linked SoundMap configuration rejected");
            var info=new FileInfo(configuration);if(!info.Exists||info.Length>4096||(info.Attributes&FileAttributes.ReparsePoint)!=0)throw new ArgumentException("Private SoundMap descriptor required");
            var config=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(configuration));
            if(Convert.ToInt32(config["schemaVersion"])!=1)throw new ArgumentException("SoundMap descriptor schema");
            url=Convert.ToString(config["url"]);token=Convert.ToString(config["token"]);Uri uri;
            if(!Uri.TryCreate(url,UriKind.Absolute,out uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.Port<1||uri.AbsolutePath!="/"||uri.Query!=""||uri.Fragment!=""||uri.UserInfo!=""||token.Length!=64)throw new ArgumentException("Invalid private SoundMap descriptor");
            for(int i=0;i<token.Length;i++)if(!Uri.IsHexDigit(token[i]))throw new ArgumentException("Invalid SoundMap capability");
        }
        internal OwnedOutputTap(){for(int i=0;i<Capacity;i++)slots[i]=new Chunk();}
        internal void CaptureForTest(string id){recordingId=id;}
        internal bool IsCapturing {get{return recordingId!=null;}}
        internal unsafe int Prepare(float* samples,int frames,long submittedFrame,long consumedFrame,long producerFrameStart=-1,int suppliedFrames=-1,long underflowFrames=0,long endSilenceFrames=0)
        {
            Interlocked.Increment(ref inFlight);string id=recordingId;if(id==null){Interlocked.Decrement(ref inFlight);return -1;}
            if(frames<1||frames>MaximumFrames){Interlocked.Increment(ref DroppedChunks);Interlocked.Add(ref DroppedFrames,frames);Interlocked.Decrement(ref inFlight);return -1;}
            int w=write;if(w-Thread.VolatileRead(ref read)>=Capacity){Interlocked.Increment(ref DroppedChunks);Interlocked.Add(ref DroppedFrames,frames);Interlocked.Decrement(ref inFlight);return -1;}
            long started=Stopwatch.GetTimestamp();Chunk chunk=slots[w%Capacity];
            for(int i=0;i<frames*2;i++)chunk.Samples[i]=samples[i];
            chunk.Frames=frames;chunk.SubmittedFrame=submittedFrame;chunk.ConsumedFrame=consumedFrame;chunk.QpcTicks=Stopwatch.GetTimestamp();chunk.RecordingId=id;
            chunk.ProducerFrameStart=producerFrameStart<0?consumedFrame-frames:producerFrameStart;chunk.SuppliedFrames=suppliedFrames<0?frames:suppliedFrames;chunk.UnderflowFrames=underflowFrames;chunk.EndSilenceFrames=endSilenceFrames;
            MaximumCopyTicks=Math.Max(MaximumCopyTicks,Stopwatch.GetTimestamp()-started);return w;
        }
        internal void Commit(int slot){if(slot<0)return;Interlocked.Add(ref CapturedFrames,slots[slot%Capacity].Frames);Thread.VolatileWrite(ref write,slot+1);Interlocked.Decrement(ref inFlight);}
        internal void Cancel(int slot){if(slot>=0)Interlocked.Decrement(ref inFlight);}
        internal bool Quiescent {get{return Thread.VolatileRead(ref inFlight)==0;}}
        internal Chunk Peek(){int r=read;return r==Thread.VolatileRead(ref write)?null:slots[r%Capacity];}
        internal void Release(){Thread.VolatileWrite(ref read,read+1);}
        private Dictionary<string,object> Post(string route,byte[] bytes,string contentType)
        {
            var request=(HttpWebRequest)WebRequest.Create(url.TrimEnd('/')+route);request.Method="POST";request.Proxy=null;request.AllowAutoRedirect=false;request.ServicePoint.Expect100Continue=false;request.Timeout=250;request.ReadWriteTimeout=250;request.ContentType=contentType;request.ContentLength=bytes.Length;request.Headers["X-RichAudio-Token"]=token;
            using(var output=request.GetRequestStream())output.Write(bytes,0,bytes.Length);
            using(var response=request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream())){var text=new StringBuilder();var chars=new char[1024];int count;while((count=reader.Read(chars,0,chars.Length))>0){if(text.Length+count>16384)throw new InvalidDataException("SoundMap response bound");text.Append(chars,0,count);}return json.Deserialize<Dictionary<string,object>>(text.ToString());}
        }
        private Dictionary<string,object> PostJson(string route,object value){return Post(route,Encoding.UTF8.GetBytes(json.Serialize(value)),"application/json");}
        private Dictionary<string,object> Status(){return new Dictionary<string,object>{{"hostId",hostId},{"anchorQpcTicks",anchorTicks},{"anchorUnixMs",anchorUnixMs},{"qpcFrequency",Stopwatch.Frequency},{"capturedFrames",Interlocked.Read(ref CapturedFrames)},{"droppedFrames",Interlocked.Read(ref DroppedFrames)},{"droppedChunks",Interlocked.Read(ref DroppedChunks)},{"uploadedFrames",Interlocked.Read(ref UploadedFrames)},{"uploadFailures",Interlocked.Read(ref UploadFailures)},{"audioClock","submittedFrame is actual post-gain host output; consumedFrame is producer PCM lineage; QPC samples are host submission time, not speaker time"}};}
        private void Upload()
        {
            Chunk first=Peek();if(first==null)return;
            // Batch contiguous slots only; preserve every submission anchor.
            string id=first.RecordingId;long frame=first.SubmittedFrame;var entries=new List<object>();var pcm=new byte[16*MaximumFrames*8];int frames=0,count=0;
            while(count<16){Chunk chunk=Peek();if(chunk==null||chunk.RecordingId!=id||chunk.SubmittedFrame!=frame+frames)break;
                entries.Add(new Dictionary<string,object>{{"submittedFrame",chunk.SubmittedFrame},{"consumedFrame",chunk.ConsumedFrame},{"producerFrameStart",chunk.ProducerFrameStart},{"suppliedFrames",chunk.SuppliedFrames},{"underflowFrames",chunk.UnderflowFrames},{"endSilenceFrames",chunk.EndSilenceFrames},{"frames",chunk.Frames},{"qpcTicks",chunk.QpcTicks}});
                Buffer.BlockCopy(chunk.Samples,0,pcm,frames*8,chunk.Frames*8);frames+=chunk.Frames;count++;Release();}
            var metadata=Status();metadata["recordingId"]=id;metadata["submittedFrame"]=frame;metadata["frames"]=frames;metadata["submissions"]=entries;
            byte[] header=Encoding.UTF8.GetBytes(json.Serialize(metadata)),packet=new byte[4+header.Length+frames*8];Buffer.BlockCopy(BitConverter.GetBytes(header.Length),0,packet,0,4);Buffer.BlockCopy(header,0,packet,4,header.Length);Buffer.BlockCopy(pcm,0,packet,4+header.Length,frames*8);
            try{var response=Post("/api/host/pcm",packet,"application/octet-stream");if(response.ContainsKey("accepted")&&(bool)response["accepted"])Interlocked.Add(ref UploadedFrames,frames);else throw new IOException("Recorder did not accept PCM");}
            catch(Exception ex){Interlocked.Increment(ref UploadFailures);Interlocked.Add(ref DroppedFrames,frames);Interlocked.Add(ref DroppedChunks,count);LastError=ex.GetType().Name;}
        }
        private void Run()
        {
            string active=null;long nextPoll=0,activeCaptureSuspensions=0;var watch=Stopwatch.StartNew();
            while(!stop){
                if(watch.ElapsedMilliseconds>=nextPoll){nextPoll=watch.ElapsedMilliseconds+100;
                    try{var response=PostJson("/api/host/control",Status());var rec=response.ContainsKey("recording")?response["recording"] as Dictionary<string,object>:null;string next=rec==null?null:Convert.ToString(rec["id"]);
                        if(next!=active){recordingId=null;long end=watch.ElapsedMilliseconds+750;while((Peek()!=null||!Quiescent)&&watch.ElapsedMilliseconds<end){if(Peek()!=null)Upload();else Thread.Sleep(1);}
                            if(active!=null)PostJson("/api/host/event",new Dictionary<string,object>{{"type","recording-flushed"},{"recordingId",active},{"metrics",Status()},{"queuedTailChunks",write-read},{"callbackInFlight",!Quiescent},{"captureSuspensions",activeCaptureSuspensions}});
                            active=next;activeCaptureSuspensions=0;recordingId=next;if(next!=null)PostJson("/api/host/event",new Dictionary<string,object>{{"type","owned-capture-start"},{"recordingId",next},{"metrics",Status()}});}
                        else recordingId=next;
                    }catch(Exception ex){recordingId=null;if(active!=null)activeCaptureSuspensions++;LastError=ex.GetType().Name;try{ReadConfiguration();}catch(Exception configError){LastError=configError.GetType().Name;}}
                }
                if(Peek()!=null)Upload();else Thread.Sleep(5);
            }
            recordingId=null;long deadline=watch.ElapsedMilliseconds+750;while((Peek()!=null||!Quiescent)&&watch.ElapsedMilliseconds<deadline){if(Peek()!=null)Upload();else Thread.Sleep(1);}
            try{PostJson("/api/host/event",new Dictionary<string,object>{{"type","host-capture-stop"},{"recordingId",active},{"metrics",Status()},{"queuedTailChunks",write-read},{"callbackInFlight",!Quiescent},{"captureSuspensions",activeCaptureSuspensions},{"terminalFailure",TerminalFailure}});}catch(Exception ex){LastError=ex.GetType().Name;}
        }
        public Dictionary<string,object> Metrics(){var value=Status();value["maximumCallbackCopyMs"]=MaximumCopyTicks*1000.0/Stopwatch.Frequency;value["queueCapacityChunks"]=Capacity;value["queueCapacityBytes"]=Capacity*MaximumFrames*8;value["queuedChunks"]=write-read;value["error"]=LastError;return value;}
        public void Dispose(){recordingId=null;stop=true;if(writer!=null&&writer.IsAlive&&!writer.Join(2000))LastError="Recorder writer shutdown timeout; background writer only";}
    }
}
