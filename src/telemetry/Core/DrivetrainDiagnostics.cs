using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;

namespace RichAudio.Telemetry
{
    // Experimental sidecar only. Never a substitute for the validated RPM field.
    [DataContract] public sealed class RawRpmDiagnostic
    {
        [DataMember] public string GetterStatus,NonFiniteKind,ExceptionType;
        [DataMember] public double? RawValue;
        [DataMember] public bool? IsFinite;
    }
    public static class RpmAcquisition
    {
        public static Field<double> Read(Func<double> getter,bool diagnostic,out RawRpmDiagnostic raw)
        {
            raw=null;
            if(getter==null) {
                if(diagnostic)raw=new RawRpmDiagnostic{GetterStatus="unavailable"};
                return Field<double>.Missing("ratio","getter_unavailable");
            }
            try {
                double value=getter(); // Exactly one invocation, shared by both outputs.
                bool finite=Validity.Finite(value);
                if(diagnostic)raw=new RawRpmDiagnostic{GetterStatus="returned",IsFinite=finite,RawValue=finite?(double?)value:null,
                    NonFiniteKind=finite?null:double.IsNaN(value)?"NaN":value>0?"positive_infinity":"negative_infinity"};
                var field=Field<double>.Observed(value,"ratio, not crankshaft RPM","RPH Vehicle.EngineRevolutionsRatio; live validation pending");
                if(field.Value.HasValue&&(value<0||value>1))return Field<double>.Missing("ratio","invalid_out_of_range_RPM_ratio");
                return field;
            } catch(Exception ex) {
                if(diagnostic)raw=new RawRpmDiagnostic{GetterStatus="exception",ExceptionType=ex.GetType().Name};
                return Field<double>.Missing("ratio, not crankshaft RPM","getter_failed:"+ex.GetType().Name);
            }
        }
        public static string Role(Field<bool> player,Field<bool> driver,Field<bool> occupants)
        {
            if(player==null||!player.Value.HasValue)return "unknown_player_role";
            if(player.Value==true)return "player_vehicle";
            if(driver!=null&&driver.Value==true)return "driven_npc";
            if(occupants!=null&&occupants.Value==false)return "unoccupied";
            if(driver!=null&&driver.Value==false&&occupants!=null&&occupants.Value==true)return "passenger_only";
            return "non_player_occupancy_unknown";
        }
    }
    [DataContract] public sealed class DrivetrainDiagnosticEntry
    {
        [DataMember] public string TrackingId,Role;
        [DataMember] public Field<uint> Model;
        [DataMember] public Field<bool> EngineRunning,HasOccupants;
        [DataMember] public Field<double> SpeedMps,ValidatedRpmRatio;
        [DataMember] public Field<Vec3> Acceleration;
        [DataMember] public Field<int> Gear;
        [DataMember] public RawRpmDiagnostic RawRpm;
    }
    [DataContract] public sealed class DrivetrainDiagnosticFrame
    {
        [DataMember] public int DiagnosticSchemaVersion=1;
        [DataMember] public bool DiagnosticOnly=true;
        [DataMember] public string Kind,SessionId,Context;
        [DataMember] public double TimestampSeconds,PrepareMs;
        [DataMember] public long TelemetrySequence,QueueDrops,WrittenFrames,ByteLimitOmissions;
        [DataMember] public List<DrivetrainDiagnosticEntry> Vehicles=new List<DrivetrainDiagnosticEntry>();
        [DataMember] public string Detail;
    }
    public static class DrivetrainDiagnosticJson
    {
        public static string Serialize(DrivetrainDiagnosticFrame frame) {using(var ms=new MemoryStream()){new DataContractJsonSerializer(typeof(DrivetrainDiagnosticFrame)).WriteObject(ms,frame);return Encoding.UTF8.GetString(ms.ToArray());}}
        public static DrivetrainDiagnosticFrame Parse(string line) {using(var ms=new MemoryStream(Encoding.UTF8.GetBytes(line))){return (DrivetrainDiagnosticFrame)new DataContractJsonSerializer(typeof(DrivetrainDiagnosticFrame)).ReadObject(ms);}}
        public static DrivetrainDiagnosticFrame From(CaptureRecord record,ObservationFrame input)
        {
            var result=new DrivetrainDiagnosticFrame{Kind="diagnostic_sample",SessionId=record.SessionId,Context=record.Context,TimestampSeconds=record.TimestampSeconds,TelemetrySequence=record.Sequence};
            foreach(var state in record.Vehicles) {
                VehicleObservation observation=null;
                foreach(var candidate in input.Vehicles)if(candidate.Token==state.Token){observation=candidate;break;}
                if(observation==null||observation.RawRpm==null)continue;
                result.Vehicles.Add(new DrivetrainDiagnosticEntry{TrackingId=state.TrackingId,Role=RpmAcquisition.Role(state.PlayerVehicle,state.DriverPresent,observation.DiagnosticOccupants),Model=state.Model,
                    EngineRunning=state.EngineRunning,HasOccupants=observation.DiagnosticOccupants,SpeedMps=state.Velocity.Value.HasValue?Field<double>.Estimated(state.Velocity.Value.Value.Length,"m/s","magnitude of observed velocity"):Field<double>.Missing("m/s","velocity_unavailable"),
                    ValidatedRpmRatio=state.RpmRatio,Gear=state.Gear,Acceleration=state.Acceleration,RawRpm=observation.RawRpm});
            }
            return result;
        }
    }
    // Lifetime caps cannot be reset by toggling capture. No game calls or file writes on producer.
    public sealed class DrivetrainDiagnosticRecorder
    {
        private readonly SpscQueue<DrivetrainDiagnosticFrame> queue;
        private readonly Thread worker;
        private readonly string path,session;
        private readonly int maxFrames,maxBytes;
        private readonly double maxSeconds,period;
        private double first=-1,next;
        private int attempted;
        private long dropped,written,byteOmitted;
        private volatile bool enabled,complete,volumeStopped;
        private volatile string error;
        private DrivetrainDiagnosticFrame footer;
        public long Dropped {get{return Interlocked.Read(ref dropped);}}
        public string Error {get{return error;}}
        public bool Finished {get{return !worker.IsAlive;}}
        public DrivetrainDiagnosticRecorder(string output,string sessionId,int frames,double seconds,int bytes,double hz)
        {
            if(string.IsNullOrEmpty(sessionId)||sessionId.Length>64||frames<1||frames>6000||!Validity.Finite(seconds)||seconds<1||seconds>300||bytes<8192||bytes>32*1024*1024||!Validity.Finite(hz)||hz<1||hz>20)throw new ArgumentOutOfRangeException();
            path=output;session=sessionId;maxFrames=frames;maxSeconds=seconds;maxBytes=bytes;period=1/hz;queue=new SpscQueue<DrivetrainDiagnosticFrame>(64);
            worker=new Thread(Run){IsBackground=true,Name="RichAudio private drivetrain writer"};worker.Start();
        }
        public void Enable(double now){if(!Validity.Finite(now)||now<0)throw new ArgumentOutOfRangeException();if(first<0){first=now;next=now;}enabled=true;}
        public void Disable(){enabled=false;}
        public bool IsDue(double now){return enabled&&!complete&&!volumeStopped&&error==null&&attempted<maxFrames&&now>=next&&now>=first&&now-first<maxSeconds;}
        public bool TryRecord(DrivetrainDiagnosticFrame frame)
        {
            if(!IsDue(frame.TimestampSeconds))return false;
            attempted++;next=frame.TimestampSeconds+period;
            if(!queue.TryWrite(frame)){Interlocked.Increment(ref dropped);return false;}return true;
        }
        public void Complete(double now){if(complete)return;footer=new DrivetrainDiagnosticFrame{Kind="diagnostic_end",SessionId=session,TimestampSeconds=now};complete=true;enabled=false;}
        public bool Wait(int ms){return worker.Join(ms);}
        private void Run()
        {
            try {
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
                using(var stream=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read))
                using(var writer=new StreamWriter(stream,new UTF8Encoding(false))) {
                    long bytes=0;int flush=0;
                    var header=new DrivetrainDiagnosticFrame{Kind="diagnostic_start",SessionId=session,Detail="UNVERIFIED raw SDK values; no scaling/clamping or physical RPM calibration; lifetime caps frames="+maxFrames+",seconds="+maxSeconds.ToString(CultureInfo.InvariantCulture)+",bytes="+maxBytes+",hz="+(1/period).ToString(CultureInfo.InvariantCulture)};
                    string line=DrivetrainDiagnosticJson.Serialize(header);writer.WriteLine(line);bytes+=Encoding.UTF8.GetByteCount(line)+Encoding.UTF8.GetByteCount(writer.NewLine);
                    while(true) {
                        DrivetrainDiagnosticFrame frame;
                        if(queue.TryRead(out frame)) {
                            line=DrivetrainDiagnosticJson.Serialize(frame);int size=Encoding.UTF8.GetByteCount(line)+Encoding.UTF8.GetByteCount(writer.NewLine);
                            if(bytes+size>maxBytes-4096){volumeStopped=true;Interlocked.Increment(ref byteOmitted);continue;}
                            writer.WriteLine(line);bytes+=size;Interlocked.Increment(ref written);if(++flush>=10){writer.Flush();flush=0;}continue;
                        }
                        if(complete)break;Thread.Sleep(5);
                    }
                    footer.QueueDrops=Dropped;footer.WrittenFrames=Interlocked.Read(ref written);footer.ByteLimitOmissions=Interlocked.Read(ref byteOmitted);
                    writer.WriteLine(DrivetrainDiagnosticJson.Serialize(footer));writer.Flush();
                }
            }catch(Exception ex){error=ex.GetType().Name+": "+ex.Message;}
        }
    }
}
