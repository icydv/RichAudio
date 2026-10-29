// Real host relay. All waiting/pipe writes occur on background threads, never WASAPI.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
namespace RichAudio.GeometryLive
{
    public sealed class GeometryModel
    {
        public double Scale;public double[] Offset;public string Reference;
        private static double Number(object x){Protocol.Check(x is int||x is long||x is double||x is decimal,"numeric model value");double v=Convert.ToDouble(x,CultureInfo.InvariantCulture);Protocol.Check(Protocol.Finite(v),"finite model");return v;}
        public static GeometryModel Parse(string text){var j=new JavaScriptSerializer{MaxJsonLength=8192,RecursionLimit=8};var d=j.DeserializeObject(text) as Dictionary<string,object>;
            Protocol.Check(d!=null&&d.Count==4&&(string)d["basis"]=="declared-demonstration-scale","explicit model assumption");
            var a=d["sourceOffsetNative"] as object[];Protocol.Check(a!=null&&a.Length==3,"owned source offset");var offset=new double[3];for(int i=0;i<3;i++){offset[i]=Number(a[i]);Protocol.Check(Math.Abs(offset[i])<=6,"source offset bound");}
            double scale=Number(d["metresPerNativeUnit"]);Protocol.Check(scale>=.01&&scale<=10,"model scale bound");
            string reference=d["reference"] as string;Protocol.Check(System.Text.RegularExpressions.Regex.IsMatch(reference??"","\\A[\\w.:-]{1,80}\\z"),"model reference");
            return new GeometryModel{Scale=scale,Offset=offset,Reference=reference};}
    }
    public sealed class GeometryHostRelay:IDisposable
    {
        private readonly Action<string> send;private readonly Func<uint> listenerPid;private readonly GeometryModel model;
        private readonly object sync=new object();private readonly AutoResetEvent changed=new AutoResetEvent(false),ack=new AutoResetEvent(false);
        private readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=131072,RecursionLimit=32};
        private readonly GeometryPipeServer pipe;private Thread thread;private volatile bool stopped;
        private ListenerState listener;private GeometryPacket latest;private long listenerSequence=-1,epoch,revision,transaction,cancelThrough;
        private string geometrySession;private double[] origin,source;private Dictionary<string,object> configuration;
        private long ackSequence=-1;private string ackKind;private bool ackAccepted;
        public long Forwarded,Rejected,Delivered,Disconnects;public double MaximumAcceptedRoundTripMs,MaximumObservedRoundTripMs;
        public string Reason;public GeometryPacket LastRejected;
        public GeometryHostRelay(Action<string> send,Func<uint> listenerPid,GeometryModel model,string pipeName=GeometryWire.PipeName)
        {this.send=send;this.listenerPid=listenerPid;this.model=model;pipe=new GeometryPipeServer(pipeName,Received,Unavailable);}
        public void Start(){pipe.Start();thread=new Thread(Run){IsBackground=true,Name="RichAudio measured geometry relay"};thread.Start();}
        public void Listener(ListenerState state){lock(sync)listener=Protocol.Copy(state);changed.Set();}
        private void Received(GeometryPacket p,uint peer)
        {
            lock(sync){Protocol.Check(listener!=null&&peer==listenerPid()&&p.SourcePid==peer&&p.ListenerSession==listener.Session&&
                p.ListenerGeneration==listener.Generation&&listener.Valid&&!listener.Paused&&
                (Stopwatch.GetTimestamp()-listener.ObservationTicks)*1000.0/Stopwatch.Frequency<=250,"geometry must match accepted listener peer/session");latest=p;}
            if(p.Status=="unavailable"){if(p.RejectedGroup!=null)LastRejected=p;Unavailable(p.Reason??"publisher-unavailable");}else changed.Set();
        }
        public void Unavailable(string reason)
        {
            Dictionary<string,object> close;
            lock(sync){latest=null;Reason=reason;Disconnects++;cancelThrough=transaction;
                close=new Dictionary<string,object>{{"type","geometry-relay-close"},{"through",cancelThrough},{"event",UnavailableEvent(reason)}};}
            send(json.Serialize(close));changed.Set();
        }
        private Dictionary<string,object> UnavailableEvent(string reason){
            if(configuration==null)return null;
            return new Dictionary<string,object>{{"type","geometry"},{"epoch",epoch},{"revision",++revision},{"clockId",configuration["clockIdInternal"]},
                {"session",geometrySession},{"build","1.0.1158.16"},{"interior",configuration["interior"]},{"groups",new object[0]},
                {"unavailableReason","geometry-unavailable"}};
        }
        // Called by the existing stderr reader; never by the audio callback.
        public bool Diagnostic(string line)
        {
            if(!line.StartsWith("{\"type\":\"geometry-relay-",StringComparison.Ordinal))return false;
            try{var d=json.DeserializeObject(line) as Dictionary<string,object>;string type=d["type"] as string;
                if(type!="geometry-relay-ack"&&type!="geometry-relay-result")return true;
                lock(sync){ackSequence=Convert.ToInt64(d["sequence"],CultureInfo.InvariantCulture);ackKind=type;
                    ackAccepted=type=="geometry-relay-ack"||(d.ContainsKey("accepted")&&(bool)d["accepted"]);}
                ack.Set();return true;
            }catch{Rejected++;Reason="invalid-relay-diagnostic";return true;}
        }
        private static object[] Vec(double[] x){return new object[]{x[0],x[1],x[2]};}
        private Dictionary<string,object> Configuration(GeometryPacket p,ListenerState s)
        {
            if(origin==null){origin=(double[])s.Position.Clone();source=new double[3];for(int i=0;i<3;i++)source[i]=origin[i]+model.Offset[i];}
            var lo=new double[3];var hi=new double[3];for(int i=0;i<3;i++){lo[i]=origin[i]-12;hi[i]=origin[i]+12;}
            var pairs=new List<object>();foreach(var pair in p.Pairs)pairs.Add(new Dictionary<string,object>{{"observationMs",pair.ObservationMs},
                {"listenerTicks",pair.ListenerTicks},{"uncertaintyMs",pair.UncertaintyMs}});
            var clock=new Dictionary<string,object>{{"id",p.ClockId},{"relation","paired-same-rate-monotonic"},{"basis","publisher-paired-samples"},
                {"frequency",p.Frequency},{"samples",pairs}};
            return new Dictionary<string,object>{{"epoch",epoch},{"geometrySession",p.GeometrySession},{"listenerSession",s.Session},
                {"minimumListenerGeneration",s.Generation},{"build",p.Build},{"interior",p.Interior},
                {"coordinates",new Dictionary<string,object>{{"originNative",Vec(origin)},{"axes",new[]{new[]{1,0,0},new[]{0,1,0},new[]{0,0,1}}},
                    {"metresPerNativeUnit",model.Scale},{"basis","declared-demonstration-scale"},{"reference",model.Reference}}},
                {"region",new Dictionary<string,object>{{"minNative",Vec(lo)},{"maxNative",Vec(hi)}}},
                {"sources",new[]{new Dictionary<string,object>{{"id","beacon-0"},{"rights","original-generated"},{"reference","authored-native-beacon"},
                    {"generation",1},{"positionNative",Vec(source)},{"velocityNative",new[]{0,0,0}},{"forwardNative",new[]{1,0,0}},{"upNative",new[]{0,0,1}}}}},
                {"clock",clock},{"materialsByKind",new Dictionary<string,object>{{"wall",new Dictionary<string,object>{{"reflection",new[]{.85,.6,.3}},{"transmission",new[]{.025,.004,.0004}},{"reference","authored-wall"}}},
                    {"ground",new Dictionary<string,object>{{"reflection",new[]{.7,.45,.2}},{"reference","authored-ground"}}}}},
                {"engine",new Dictionary<string,object>{{"order",2}}}};
        }
        private void Run()
        {
            long committedPacket=-1;string committedSession=null;bool configured=false;
            try{while(!stopped){changed.WaitOne(20);ListenerState s;GeometryPacket p;
                lock(sync){s=listener==null?null:Protocol.Copy(listener);p=latest;}
                if(s==null||s.Sequence==listenerSequence)continue;listenerSequence=s.Sequence;
                if(p!=null&&(p.ListenerSession!=s.Session||p.ListenerGeneration!=s.Generation)){Unavailable("listener-context-changed");p=null;}
                if((Stopwatch.GetTimestamp()-s.ObservationTicks)*1000.0/Stopwatch.Frequency>250)continue;
                var messages=new List<object>();
                if(p!=null&&p.Status=="snapshot"&&(p.GeometrySession!=committedSession||p.Sequence!=committedPacket)){
                    try{GeometryWire.Validate(p,Stopwatch.GetTimestamp());}catch(Exception e){LastRejected=p;Rejected++;Unavailable(e.GetType().Name);continue;}
                    lock(sync){
                        if(geometrySession!=p.GeometrySession||configuration==null){epoch++;revision=0;geometrySession=p.GeometrySession;
                            configuration=Configuration(p,s);configuration["clockIdInternal"]=p.ClockId;configured=false;}
                        if(!configured){var copy=new Dictionary<string,object>(configuration);copy.Remove("clockIdInternal");messages.Add(new Dictionary<string,object>{{"type","geometry-config"},{"configuration",copy}});}
                        var raw=json.DeserializeObject(Encoding.UTF8.GetString(GeometryWire.Encode(p))) as Dictionary<string,object>;
                        messages.Add(new Dictionary<string,object>{{"type","geometry"},{"epoch",epoch},{"revision",++revision},{"clockId",p.ClockId},
                            {"session",p.GeometrySession},{"build",p.Build},{"interior",p.Interior},{"groups",raw["Groups"]},{"publisherSequence",p.Sequence}});
                    }
                }
                long id,begin;lock(sync){id=++transaction;ackSequence=-1;ackKind=null;}
                ack.Reset();begin=Stopwatch.GetTimestamp();double age=(begin-s.ObservationTicks)*1000.0/Stopwatch.Frequency;
                var state=json.DeserializeObject(Protocol.EncodeJson(s));
                send(json.Serialize(new Dictionary<string,object>{{"type","geometry-relay-stage"},{"sequence",id},
                    {"listener",new Dictionary<string,object>{{"type","listener"},{"receiptAgeMs",age},{"state",state}}},{"messages",messages}}));
                if(!WaitAck(id,"geometry-relay-ack",100)){Rejected++;Reason="stage-ack-timeout";continue;}
                double roundTrip=(Stopwatch.GetTimestamp()-begin)*1000.0/Stopwatch.Frequency;
                MaximumObservedRoundTripMs=Math.Max(MaximumObservedRoundTripMs,roundTrip);
                lock(sync){if(id<=cancelThrough)continue;}
                if(roundTrip>10){Rejected++;Reason="measured-delivery-bound-exceeded";
                    send(json.Serialize(new Dictionary<string,object>{{"type","geometry-relay-drop"},{"sequence",id}}));continue;}
                MaximumAcceptedRoundTripMs=Math.Max(MaximumAcceptedRoundTripMs,roundTrip);
                ack.Reset();send(json.Serialize(new Dictionary<string,object>{{"type","geometry-relay-commit"},{"sequence",id},{"maximumMs",roundTrip}}));
                if(!WaitAck(id,"geometry-relay-result",100)||!ackAccepted){Rejected++;Reason="commit-rejected";continue;}
                Delivered++;if(messages.Count>0){Forwarded++;configured=true;committedPacket=p.Sequence;committedSession=p.GeometrySession;}
            }}catch(Exception e){if(!stopped){Reason=e.GetType().Name;try{Unavailable(Reason);}catch{}}}
        }
        private bool WaitAck(long id,string kind,int milliseconds){var w=Stopwatch.StartNew();while(!stopped&&w.ElapsedMilliseconds<milliseconds){
            ack.WaitOne(Math.Max(1,milliseconds-(int)w.ElapsedMilliseconds));lock(sync)if(ackSequence==id&&ackKind==kind)return true;}return false;}
        public Dictionary<string,object> Metrics(){return new Dictionary<string,object>{{"forwarded",Forwarded},{"transactions",Delivered},{"rejected",Rejected},
            {"disconnects",Disconnects},{"maximumAcceptedRoundTripMs",MaximumAcceptedRoundTripMs},{"maximumObservedRoundTripMs",MaximumObservedRoundTripMs},
            {"reason",Reason},{"pipeAccepted",pipe.Accepted},{"pipeRejected",pipe.Rejected},{"rejectedEvidenceAvailable",LastRejected!=null||pipe.LastRejectedBytes!=null}};}
        public byte[] RejectedEvidence(){return LastRejected!=null?GeometryWire.Encode(LastRejected):pipe.LastRejectedBytes;}
        public void Dispose(){stopped=true;pipe.Dispose();changed.Set();ack.Set();if(thread!=null&&thread!=Thread.CurrentThread)thread.Join(1000);}
    }
}
