using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;

namespace RichAudio.Telemetry
{
    // One producer, one consumer. Slots are published only after their immutable record is complete.
    public sealed class SpscQueue<T> where T:class
    {
        private readonly T[] slots;
        private long read,write;
        public int Capacity {get {return slots.Length;}}
        public SpscQueue(int capacity) {if(capacity<1||capacity>4096)throw new ArgumentOutOfRangeException("capacity");slots=new T[capacity];}
        public bool TryWrite(T value) {if(value==null)throw new ArgumentNullException("value");long w=write;if(w-Volatile.Read(ref read)>=slots.Length)return false;slots[w%slots.Length]=value;Volatile.Write(ref write,w+1);return true;}
        public bool TryRead(out T value) {long r=read;if(r>=Volatile.Read(ref write)){value=null;return false;}value=slots[r%slots.Length];slots[r%slots.Length]=null;Volatile.Write(ref read,r+1);return true;}
    }
    public static class JsonLines
    {
        public static string Serialize(CaptureRecord record) {using(var ms=new MemoryStream()){new DataContractJsonSerializer(typeof(CaptureRecord)).WriteObject(ms,record);return Encoding.UTF8.GetString(ms.ToArray());}}
        public static CaptureRecord Parse(string line) {using(var ms=new MemoryStream(Encoding.UTF8.GetBytes(line))){return (CaptureRecord)new DataContractJsonSerializer(typeof(CaptureRecord)).ReadObject(ms);}}
    }
    public sealed class AsyncRecorder
    {
        private readonly SpscQueue<CaptureRecord> queue;
        private readonly Thread worker;
        private readonly string path;
        private volatile bool completing;
        private volatile string error;
        private CaptureRecord final;
        private long dropped,written;
        public long Dropped {get {return Interlocked.Read(ref dropped);}}
        public long Written {get {return Interlocked.Read(ref written);}}
        public string Error {get {return error;}}
        public bool Finished {get {return !worker.IsAlive;}}
        public AsyncRecorder(string outputPath,int capacity) {path=outputPath;queue=new SpscQueue<CaptureRecord>(capacity);worker=new Thread(Run){IsBackground=true,Name="RichAudio JSONL writer"};worker.Start();}
        public bool TryRecord(CaptureRecord r) {if(completing||error!=null){Interlocked.Increment(ref dropped);return false;}r.QueueDropped=Dropped;if(!queue.TryWrite(r)){Interlocked.Increment(ref dropped);return false;}return true;}
        // Call on producer context. Graceful wait belongs on a non-game worker or cooperative fiber polling.
        public void Complete(CaptureRecord footer) {if(completing)return;final=footer;completing=true;}
        public bool Wait(int milliseconds) {return worker.Join(milliseconds);}
        private void Run() {
            try {
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
                using(var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read))
                using(var writer=new StreamWriter(file,new UTF8Encoding(false))) {
                    int flushCount=0;
                    while(true) {
                        CaptureRecord r;if(queue.TryRead(out r)){writer.WriteLine(JsonLines.Serialize(r));Interlocked.Increment(ref written);if(++flushCount>=20){writer.Flush();flushCount=0;}continue;}
                        if(completing)break;
                        Thread.Sleep(5);
                    }
                    if(final!=null){final.QueueDropped=Dropped;writer.WriteLine(JsonLines.Serialize(final));Interlocked.Increment(ref written);}
                    writer.Flush();
                }
            } catch(Exception ex) {error=ex.GetType().Name+": "+ex.Message;}
        }
    }
}
