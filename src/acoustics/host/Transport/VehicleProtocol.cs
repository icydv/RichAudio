// Original single-vehicle evidence. Read-only game facts; no measured crankshaft RPM or torque claim.
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
    public sealed class VehiclePacket
    {
        [DataMember(Name="version",IsRequired=true)] public int Version;
        [DataMember(Name="session",IsRequired=true)] public string Session;
        [DataMember(Name="listenerGeneration",IsRequired=true)] public long ListenerGeneration;
        [DataMember(Name="generation",IsRequired=true)] public long Generation;
        [DataMember(Name="sequence",IsRequired=true)] public long Sequence;
        [DataMember(Name="observationTicks",IsRequired=true)] public long ObservationTicks;
        [DataMember(Name="clockFrequency",IsRequired=true)] public long ClockFrequency;
        [DataMember(Name="gameTimeMs",IsRequired=true)] public long GameTimeMs;
        [DataMember(Name="sourcePid",IsRequired=true)] public uint SourcePid;
        [DataMember(Name="vehicleId",IsRequired=true)] public string VehicleId;
        [DataMember(Name="model",IsRequired=true)] public uint Model;
        [DataMember(Name="profile",IsRequired=true)] public string Profile;
        [DataMember(Name="action",IsRequired=true)] public string Action;
        [DataMember(Name="position",IsRequired=true)] public double[] Position;
        [DataMember(Name="velocity",IsRequired=true)] public double[] Velocity;
        [DataMember(Name="forward",IsRequired=true)] public double[] Forward;
        [DataMember(Name="up",IsRequired=true)] public double[] Up;
        [DataMember(Name="speed",IsRequired=true)] public double Speed;
        [DataMember(Name="engineRunning",IsRequired=true)] public bool EngineRunning;
        [DataMember(Name="rpmRatio",IsRequired=true)] public double? RpmRatio;
        [DataMember(Name="gear",IsRequired=true)] public int? Gear;
        [DataMember(Name="valid",IsRequired=true)] public bool Valid;
        [DataMember(Name="reason",IsRequired=true)] public string Reason;
        [DataMember(Name="rights",IsRequired=true)] public string Rights;
        [DataMember(Name="coordinates",IsRequired=true)] public string Coordinates;
        [DataMember(Name="units",IsRequired=true)] public string Units;
    }
    public static class VehicleProtocol
    {
        public const int MaximumBytes=4096;
        private const long MaximumInteger=9007199254740991;
        private static readonly UTF8Encoding Utf8=new UTF8Encoding(false,true);
        private static readonly HashSet<string> Names=new HashSet<string>(new[]{"version","session","listenerGeneration","generation","sequence","observationTicks","clockFrequency","gameTimeMs","sourcePid","vehicleId","model","profile","action","position","velocity","forward","up","speed","engineRunning","rpmRatio","gear","valid","reason","rights","coordinates","units"},StringComparer.Ordinal);
        private static readonly HashSet<string> Numbers=new HashSet<string>(new[]{"version","listenerGeneration","generation","sequence","observationTicks","clockFrequency","gameTimeMs","sourcePid","model","speed","rpmRatio","gear"},StringComparer.Ordinal);
        private static void Vector(double[] v,double bound){Protocol.Check(v!=null&&v.Length==3,"vehicle vector length");foreach(double x in v)Protocol.Check(Protocol.Finite(x)&&Math.Abs(x)<=bound,"vehicle finite vector");}
        private static double Norm(double[] v){return Math.Sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);}
        public static void Validate(VehiclePacket p)
        {
            Protocol.Check(p!=null&&p.Version==1,"vehicle version");
            Protocol.Check(Regex.IsMatch(p.Session??"","\\A[a-f0-9]{32}\\z"),"vehicle listener session");
            Protocol.Check(p.ListenerGeneration>0&&p.ListenerGeneration<=MaximumInteger&&p.Generation>0&&p.Generation<=MaximumInteger&&p.Sequence>=0&&p.Sequence<=2400,"vehicle generation/sequence bounds");
            Protocol.Check(p.ObservationTicks>=0&&p.ObservationTicks<=MaximumInteger&&p.ClockFrequency==Stopwatch.Frequency&&p.GameTimeMs>=0&&p.GameTimeMs<=UInt32.MaxValue&&p.SourcePid>0,"vehicle clock/peer bounds");
            Protocol.Check(Regex.IsMatch(p.VehicleId??"","\\A[A-Za-z0-9:-]{1,64}\\z"),"vehicle identity");
            Protocol.Check(p.Profile=="original-hypercar-v12"||p.Profile=="original-supercharged-v8","vehicle original profile");
            Protocol.Check(p.Action=="update"||p.Action=="remove","vehicle lifecycle action");
            Vector(p.Position,1000000);Vector(p.Velocity,100);Vector(p.Forward,1.00001);Vector(p.Up,1.00001);
            Protocol.Check(Norm(p.Velocity)<=100&&Math.Abs(Norm(p.Forward)-1)<1e-4&&Math.Abs(Norm(p.Up)-1)<1e-4,"vehicle pose/speed bounds");
            Protocol.Check(Math.Abs(p.Forward[0]*p.Up[0]+p.Forward[1]*p.Up[1]+p.Forward[2]*p.Up[2])<1e-4,"vehicle orthogonal orientation");
            Protocol.Check(Protocol.Finite(p.Speed)&&p.Speed>=0&&p.Speed<=100,"vehicle speed");
            Protocol.Check(!p.RpmRatio.HasValue||Protocol.Finite(p.RpmRatio.Value)&&p.RpmRatio.Value>=0&&p.RpmRatio.Value<=1,"normalized ratio, not RPM");
            Protocol.Check(!p.Gear.HasValue||p.Gear.Value>=-1&&p.Gear.Value<=12,"vehicle framework gear");
            Protocol.Check(Regex.IsMatch(p.Reason??"","\\A[a-z0-9-]{1,80}\\z")&&(!p.Valid||p.Reason=="valid"),"vehicle validity reason");
            Protocol.Check(p.Action!="remove"||!p.Valid&&!p.EngineRunning,"vehicle removal must stop source");
            Protocol.Check(p.Rights=="original-generated"&&p.Coordinates=="gta-native-unscaled"&&p.Units=="native-unverified","vehicle ownership/coordinates");
        }
        public static void Fresh(VehiclePacket p,long now){double age=(now-p.ObservationTicks)*1000.0/p.ClockFrequency;Protocol.Check(age>=-2&&age<=250,"vehicle freshness");}
        public static byte[] Encode(VehiclePacket p){Validate(p);using(var s=new MemoryStream()){new DataContractJsonSerializer(typeof(VehiclePacket)).WriteObject(s,p);Protocol.Check(s.Length<=MaximumBytes,"vehicle size");return s.ToArray();}}
        public static string EncodeJson(VehiclePacket p){return Utf8.GetString(Encode(p));}
        public static VehiclePacket Copy(VehiclePacket p){Validate(p);return new VehiclePacket{Version=p.Version,Session=p.Session,ListenerGeneration=p.ListenerGeneration,Generation=p.Generation,Sequence=p.Sequence,ObservationTicks=p.ObservationTicks,ClockFrequency=p.ClockFrequency,GameTimeMs=p.GameTimeMs,SourcePid=p.SourcePid,VehicleId=p.VehicleId,Model=p.Model,Profile=p.Profile,Action=p.Action,Position=(double[])p.Position.Clone(),Velocity=(double[])p.Velocity.Clone(),Forward=(double[])p.Forward.Clone(),Up=(double[])p.Up.Clone(),Speed=p.Speed,EngineRunning=p.EngineRunning,RpmRatio=p.RpmRatio,Gear=p.Gear,Valid=p.Valid,Reason=p.Reason,Rights=p.Rights,Coordinates=p.Coordinates,Units=p.Units};}
        public static VehiclePacket Decode(byte[] data)
        {
            Protocol.Check(data!=null&&data.Length>0&&data.Length<=MaximumBytes,"vehicle size");Utf8.GetString(data);
            var seen=new HashSet<string>(StringComparer.Ordinal);var quotas=new XmlDictionaryReaderQuotas{MaxDepth=5,MaxArrayLength=3,MaxBytesPerRead=MaximumBytes,MaxNameTableCharCount=4096,MaxStringContentLength=128};
            using(var reader=JsonReaderWriterFactory.CreateJsonReader(data,0,data.Length,Utf8,quotas,null))while(reader.Read()){
                if(reader.NodeType!=XmlNodeType.Element)continue;
                if(reader.Depth==1){string n=reader.LocalName,t=reader.GetAttribute("type");Protocol.Check(Names.Contains(n)&&seen.Add(n),"vehicle unknown/duplicate field");
                    string expected=n=="position"||n=="velocity"||n=="forward"||n=="up"?"array":n=="engineRunning"||n=="valid"?"boolean":Numbers.Contains(n)?"number":"string";
                    Protocol.Check(t==expected||((n=="rpmRatio"||n=="gear")&&t=="null"),"vehicle JSON type");}
                else if(reader.Depth==2)Protocol.Check(reader.LocalName=="item"&&reader.GetAttribute("type")=="number","vehicle vector numeric");
            }
            Protocol.Check(seen.Count==Names.Count,"vehicle missing field");using(var s=new MemoryStream(data,false)){var p=(VehiclePacket)new DataContractJsonSerializer(typeof(VehiclePacket)).ReadObject(s);Validate(p);return p;}
        }
    }
    public sealed class VehicleValidator
    {
        private string session,id,profile;private long sequence=-1,ticks=-1,generation,listenerGeneration,game;private bool removed;private uint model,pid;
        public void Accept(VehiclePacket p,long now,uint peer)
        {
            VehicleProtocol.Validate(p);VehicleProtocol.Fresh(p,now);Protocol.Check(p.SourcePid==peer,"vehicle pipe peer");
            Protocol.Check(!removed,"vehicle stream ended");
            if(session!=null){Protocol.Check(p.Session==session&&p.VehicleId==id&&p.Profile==profile&&p.Generation==generation&&p.Model==model&&p.SourcePid==pid,"one owned vehicle per session");
                Protocol.Check(p.Sequence>sequence&&p.ObservationTicks>ticks&&p.ListenerGeneration>=listenerGeneration&&(p.GameTimeMs>=game||p.ListenerGeneration>listenerGeneration),"vehicle monotonic evidence");}
            session=p.Session;id=p.VehicleId;profile=p.Profile;generation=p.Generation;model=p.Model;pid=p.SourcePid;sequence=p.Sequence;ticks=p.ObservationTicks;listenerGeneration=p.ListenerGeneration;game=p.GameTimeMs;removed=p.Action=="remove";
        }
    }
    // Shared by the real host callback and its adversarial binding tests.
    public static class VehicleListenerBinding
    {
        public static void Validate(VehiclePacket packet,uint peer,ListenerState listener,uint listenerPid,string expectedProfile,long now)
        {
            VehicleProtocol.Fresh(packet,now);
            Protocol.Check(listener!=null&&listener.Valid&&!listener.Paused&&peer==listenerPid&&packet.SourcePid==peer&&
                packet.Session==listener.Session&&packet.ListenerGeneration==listener.Generation&&packet.ClockFrequency==listener.ClockFrequency&&
                listener.ListenerKind=="camera"&&listener.Coordinates=="gta-native-unscaled"&&listener.Units=="native-unverified"&&
                (now-listener.ObservationTicks)*1000.0/listener.ClockFrequency>=-2&&
                (now-listener.ObservationTicks)*1000.0/listener.ClockFrequency<=250,"vehicle must match fresh accepted listener peer/session");
            Protocol.Check(packet.Profile==expectedProfile,"vehicle selected profile mismatch");
        }
    }
}
