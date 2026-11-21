// Original bounded listener-state protocol. No game or audio-device dependency.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;

namespace RichAudio.Beacon.Transport
{
    [DataContract]
    public sealed class ListenerState
    {
        [DataMember(Name="version",IsRequired=true)] public int Version;
        [DataMember(Name="session",IsRequired=true)] public string Session;
        [DataMember(Name="generation",IsRequired=true)] public long Generation;
        [DataMember(Name="sequence",IsRequired=true)] public long Sequence;
        [DataMember(Name="observationTicks",IsRequired=true)] public long ObservationTicks;
        [DataMember(Name="clockFrequency",IsRequired=true)] public long ClockFrequency;
        [DataMember(Name="gameTimeMs",IsRequired=true)] public long GameTimeMs;
        [DataMember(Name="position",IsRequired=true)] public double[] Position;
        [DataMember(Name="velocity",IsRequired=true)] public double[] Velocity;
        [DataMember(Name="forward",IsRequired=true)] public double[] Forward;
        [DataMember(Name="up",IsRequired=true)] public double[] Up;
        [DataMember(Name="listenerKind",IsRequired=true)] public string ListenerKind;
        [DataMember(Name="velocityKind",IsRequired=true)] public string VelocityKind;
        [DataMember(Name="paused",IsRequired=true)] public bool Paused;
        [DataMember(Name="valid",IsRequired=true)] public bool Valid;
        [DataMember(Name="reason",IsRequired=true)] public string Reason;
        [DataMember(Name="coordinates",IsRequired=true)] public string Coordinates;
        [DataMember(Name="units",IsRequired=true)] public string Units;
        [DataMember(Name="sourceId",IsRequired=true)] public string SourceId;
    }

    public static class Protocol
    {
        public const int Version=1, MaximumBytes=4096;
        public const string DefaultPipe="RichAudio.Acoustics07.Listener.v1";
        private const long ExactIntegerLimit=9007199254740991;
        private static readonly UTF8Encoding Utf8=new UTF8Encoding(false,true);
        private static readonly HashSet<string> Names=new HashSet<string>(new[]{"version","session","generation","sequence","observationTicks","clockFrequency","gameTimeMs","position","velocity","forward","up","listenerKind","velocityKind","paused","valid","reason","coordinates","units","sourceId"},StringComparer.Ordinal);

        public static void Check(bool test,string message){if(!test)throw new InvalidDataException(message);}
        public static bool Finite(double x){return !Double.IsNaN(x)&&!Double.IsInfinity(x);}
        private static double Norm(double[] v){return Math.Sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);}
        private static void Vector(double[] v,double bound){Check(v!=null&&v.Length==3,"three vector elements required");foreach(double x in v)Check(Finite(x)&&Math.Abs(x)<=bound,"finite bounded vector required");}
        public static void Validate(ListenerState s)
        {
            Check(s!=null&&s.Version==Version,"protocol version");
            Check(s.Session!=null&&Regex.IsMatch(s.Session,"\\A[a-f0-9]{32}\\z"),"ephemeral session identity");
            Check(s.Generation>0&&s.Generation<=ExactIntegerLimit&&s.Sequence>=0&&s.Sequence<=ExactIntegerLimit,"generation or sequence bound");
            Check(s.ObservationTicks>=0&&s.ObservationTicks<=ExactIntegerLimit&&s.ClockFrequency==Stopwatch.Frequency,"local monotonic clock required");
            Check(s.GameTimeMs>=0&&s.GameTimeMs<=UInt32.MaxValue,"game clock bound");
            Vector(s.Position,1000000);Vector(s.Velocity,1000);Vector(s.Forward,1.00001);Vector(s.Up,1.00001);
            Check(Math.Abs(Norm(s.Forward)-1)<1e-4&&Math.Abs(Norm(s.Up)-1)<1e-4,"unit orientation required");
            Check(Math.Abs(s.Forward[0]*s.Up[0]+s.Forward[1]*s.Up[1]+s.Forward[2]*s.Up[2])<1e-4,"orthogonal orientation required");
            Check(s.ListenerKind=="camera"||s.ListenerKind=="player"||s.ListenerKind=="synthetic","listener identity");
            Check(s.VelocityKind=="estimated-camera-difference"||s.VelocityKind=="observed-player"||s.VelocityKind=="authored-synthetic"||s.VelocityKind=="unavailable","velocity provenance");
            Check((s.Coordinates=="gta-native-unscaled"&&s.Units=="native-unverified")||(s.Coordinates=="research-rh-z-up-metres-v1"&&s.Units=="metres"),"explicit coordinate and scale boundary");
            Check(s.SourceId==null,"listener-only bridge cannot introduce sources");
            Check(s.Reason!=null&&s.Reason.Length<=80&&Regex.IsMatch(s.Reason,"\\A[a-z0-9-]+\\z"),"bounded status reason");
            Check(!s.Valid||s.Reason=="valid","validity reason mismatch");
        }
        public static ListenerState Copy(ListenerState s)
        {
            Validate(s);
            return new ListenerState{Version=s.Version,Session=s.Session,Generation=s.Generation,Sequence=s.Sequence,ObservationTicks=s.ObservationTicks,ClockFrequency=s.ClockFrequency,GameTimeMs=s.GameTimeMs,Position=(double[])s.Position.Clone(),Velocity=(double[])s.Velocity.Clone(),Forward=(double[])s.Forward.Clone(),Up=(double[])s.Up.Clone(),ListenerKind=s.ListenerKind,VelocityKind=s.VelocityKind,Paused=s.Paused,Valid=s.Valid,Reason=s.Reason,Coordinates=s.Coordinates,Units=s.Units,SourceId=null};
        }
        public static byte[] Encode(ListenerState s)
        {
            Validate(s);using(var stream=new MemoryStream()){new DataContractJsonSerializer(typeof(ListenerState)).WriteObject(stream,s);Check(stream.Length<=MaximumBytes,"message size");return stream.ToArray();}
        }
        public static string EncodeJson(ListenerState s){return Utf8.GetString(Encode(s));}
        public static ListenerState Decode(byte[] data,int length)
        {
            Check(data!=null&&length>0&&length<=MaximumBytes&&length<=data.Length,"message size");
            Utf8.GetString(data,0,length); // Strict UTF-8, before the serializer can replace invalid bytes.
            var seen=new HashSet<string>(StringComparer.Ordinal);
            var quotas=new XmlDictionaryReaderQuotas{MaxDepth=5,MaxArrayLength=32,MaxBytesPerRead=MaximumBytes,MaxNameTableCharCount=4096,MaxStringContentLength=128};
            using(var reader=JsonReaderWriterFactory.CreateJsonReader(data,0,length,Utf8,quotas,null))
            {
                while(reader.Read())if(reader.NodeType==XmlNodeType.Element&&reader.Depth==2)
                    Check(reader.LocalName=="item"&&reader.GetAttribute("type")=="number","numeric vector components required");
                else if(reader.NodeType==XmlNodeType.Element&&reader.Depth==1)
                {
                    string name=reader.LocalName;Check(Names.Contains(name)&&seen.Add(name),"unknown or duplicate field");
                    string expected=(name=="position"||name=="velocity"||name=="forward"||name=="up")?"array":
                        (name=="version"||name=="generation"||name=="sequence"||name=="observationTicks"||name=="clockFrequency"||name=="gameTimeMs")?"number":
                        (name=="paused"||name=="valid")?"boolean":name=="sourceId"?"null":"string";
                    Check(reader.GetAttribute("type")==expected,"JSON field type");
                }
            }
            Check(seen.Count==Names.Count,"missing fields");
            using(var stream=new MemoryStream(data,0,length,false)){var result=(ListenerState)new DataContractJsonSerializer(typeof(ListenerState)).ReadObject(stream);Validate(result);return result;}
        }
        public static byte[] Frame(ListenerState s)
        {
            byte[] payload=Encode(s),frame=new byte[payload.Length+4];Buffer.BlockCopy(BitConverter.GetBytes(payload.Length),0,frame,0,4);Buffer.BlockCopy(payload,0,frame,4,payload.Length);return frame;
        }
        public static ListenerState Synthetic(string session,long sequence,double yaw,bool paused=false)
        {
            return new ListenerState{Version=1,Session=session,Generation=1,Sequence=sequence,ObservationTicks=Stopwatch.GetTimestamp(),ClockFrequency=Stopwatch.Frequency,GameTimeMs=sequence*50,Position=new double[]{0,0,1},Velocity=new double[]{0,0,0},Forward=new double[]{-Math.Sin(yaw),Math.Cos(yaw),0},Up=new double[]{0,0,1},ListenerKind="synthetic",VelocityKind="authored-synthetic",Paused=paused,Valid=true,Reason="valid",Coordinates="research-rh-z-up-metres-v1",Units="metres",SourceId=null};
        }
    }

    // One connection uses one session. Generation advances invalidate continuity but do not reset sequence order.
    public sealed class StateValidator
    {
        private string session;private long generation,sequence=-1,ticks=-1,gameTime=-1;
        public long SequenceGaps{get;private set;} public long GenerationChanges{get;private set;}
        public double LastAgeMs{get;private set;}
        public void Accept(ListenerState state,long nowTicks)
        {
            Protocol.Validate(state);
            double age=(nowTicks-state.ObservationTicks)*1000.0/Stopwatch.Frequency;
            Protocol.Check(age>=-2&&age<=250,"stale or future observation");
            if(session!=null){Protocol.Check(state.Session==session,"session changed without reconnect");Protocol.Check(state.Sequence>sequence&&state.ObservationTicks>ticks,"duplicate or reordered state");Protocol.Check(state.Generation>=generation,"generation rollback");Protocol.Check(state.GameTimeMs>=gameTime||state.Generation>generation,"game clock reset without generation");}
            if(sequence>=0){SequenceGaps+=state.Sequence-sequence-1;if(state.Generation>generation)GenerationChanges++;}
            session=state.Session;sequence=state.Sequence;generation=state.Generation;ticks=state.ObservationTicks;gameTime=state.GameTimeMs;LastAgeMs=Math.Max(0,age);
        }
    }
}
