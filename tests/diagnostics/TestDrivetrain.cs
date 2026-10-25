using System;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Text;
using RichAudio.Telemetry;
using RichAudio.Rph;
public static class TestDrivetrain
{
    static int checks;
    static void Check(bool condition,string name){if(!condition)throw new Exception(name);checks++;}
    public static int Main(string[] args)
    {
        string root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);RawRpmDiagnostic raw;
        foreach(double n in new[]{0.0,0.2,1.0}){int calls=0;var value=RpmAcquisition.Read(()=>{calls++;return n;},true,out raw);Check(calls==1&&value.Status=="observed"&&value.Value==n&&raw.RawValue==n&&raw.IsFinite==true,"Valid ratio unchanged; getter read once");}
        foreach(double n in new[]{-0.5,1.5,6500.0}){var value=RpmAcquisition.Read(()=>n,true,out raw);Check(value.Status=="unavailable"&&!value.Value.HasValue&&raw.RawValue==n&&raw.IsFinite==true,"Out-of-range raw retained only as diagnostic; never scaled or clamped");}
        foreach(double n in new[]{double.NaN,double.PositiveInfinity,double.NegativeInfinity}){var value=RpmAcquisition.Read(()=>n,true,out raw);Check(value.Status=="unavailable"&&raw.IsFinite==false&&!raw.RawValue.HasValue&&raw.NonFiniteKind!=null,"Nonfinite categorized without JSON numeric sentinel");var line=DrivetrainDiagnosticJson.Serialize(new DrivetrainDiagnosticFrame{Kind="diagnostic_sample",Vehicles={new DrivetrainDiagnosticEntry{RawRpm=raw,ValidatedRpmRatio=value}}});Check(DrivetrainDiagnosticJson.Parse(line).Vehicles[0].RawRpm.RawValue==null,"Nonfinite diagnostic roundtrip");}
        var failed=RpmAcquisition.Read(()=>{throw new InvalidOperationException("private detail must not escape");},true,out raw);Check(failed.Status=="unavailable"&&raw.GetterStatus=="exception"&&raw.ExceptionType=="InvalidOperationException","Getter exception has typed availability, no private message");
        failed=RpmAcquisition.Read(null,true,out raw);Check(failed.Status=="unavailable"&&raw.GetterStatus=="unavailable","Missing getter remains missing");
        RpmAcquisition.Read(()=>0.2,false,out raw);Check(raw==null,"Disabled diagnostics produce no raw object");
        Field<bool> yes=Field<bool>.Observed(true,"boolean","authored"),no=Field<bool>.Observed(false,"boolean","authored"),missing=Field<bool>.Missing("boolean","authored");
        Check(RpmAcquisition.Role(yes,yes,yes)=="player_vehicle","Player role");Check(RpmAcquisition.Role(no,yes,yes)=="driven_npc","NPC role");Check(RpmAcquisition.Role(no,no,no)=="unoccupied","Unoccupied requires explicit occupancy evidence");Check(RpmAcquisition.Role(no,no,yes)=="passenger_only","No driver is not assumed unoccupied");Check(RpmAcquisition.Role(missing,yes,yes)=="unknown_player_role","Unknown role not fabricated");
        var observation=new VehicleObservation{Token="authored",PlayerVehicle=yes,DriverPresent=yes,DiagnosticOccupants=yes};observation.RpmRatio=RpmAcquisition.Read(()=>6400,true,out raw);observation.RawRpm=raw;
        var input=new ObservationFrame{Time=0};input.Vehicles.Add(observation);var tracker=new Tracker("authored");var production=tracker.Process(input);production.Context="idle";var diagnostic=DrivetrainDiagnosticJson.From(production,input);
        string productionJson=JsonLines.Serialize(production);Check(!productionJson.Contains("RawRpm")&&!productionJson.Contains("6400")&&JsonLines.Parse(productionJson).SchemaVersion==1,"Production schema and unavailable RPM retained");
        Check(diagnostic.Vehicles[0].TrackingId==production.Vehicles[0].TrackingId&&diagnostic.Vehicles[0].ValidatedRpmRatio.Status=="unavailable"&&diagnostic.Vehicles[0].RawRpm.RawValue==6400,"Sidecar linked to source identity with unchanged validity");
        string path=Path.Combine(root,"bounded.jsonl");var recorder=new DrivetrainDiagnosticRecorder(path,"authored",2,1,8192,10);Check(!recorder.IsDue(0),"Recorder starts disabled");recorder.Enable(0);Check(recorder.IsDue(0),"Explicit enable");recorder.TryRecord(new DrivetrainDiagnosticFrame{Kind="diagnostic_sample",TimestampSeconds=0});Check(!recorder.IsDue(0.05),"Diagnostic cadence capped");recorder.Disable();recorder.Enable(0.1);recorder.TryRecord(new DrivetrainDiagnosticFrame{Kind="diagnostic_sample",TimestampSeconds=0.1});Check(!recorder.IsDue(0.2),"Frame lifetime cap survives toggle");recorder.Complete(0.3);Check(recorder.Wait(3000)&&recorder.Error==null,"Asynchronous writer drains and terminates");var frames=File.ReadAllLines(path).Select(DrivetrainDiagnosticJson.Parse).ToArray();Check(frames.Length==4&&frames[0].Kind=="diagnostic_start"&&frames[3].Kind=="diagnostic_end"&&frames[3].WrittenFrames==2,"Versioned header, bounded samples and footer");Check(new FileInfo(path).Length<=8192,"Byte cap includes header and footer");
        path=Path.Combine(root,"byte-limit.jsonl");recorder=new DrivetrainDiagnosticRecorder(path,"authored",20,1,8192,20);recorder.Enable(0);recorder.TryRecord(new DrivetrainDiagnosticFrame{Kind="diagnostic_sample",TimestampSeconds=0,Detail=new string('x',8192)});recorder.Complete(0.1);Check(recorder.Wait(3000)&&new FileInfo(path).Length<=8192,"Oversize sample cannot exceed disk cap");Check(DrivetrainDiagnosticJson.Parse(File.ReadAllLines(path).Last()).ByteLimitOmissions==1,"Byte omission reported");
        path=Path.Combine(root,"duration.jsonl");recorder=new DrivetrainDiagnosticRecorder(path,"authored",20,1,8192,20);recorder.Enable(0);recorder.Disable();recorder.Enable(2);Check(!recorder.IsDue(2),"Duration cap cannot be restarted");recorder.Complete(2);Check(recorder.Wait(3000),"Duration-limited writer closes");
        string old="{\"OutputDirectory\":\""+root.Replace("\\","\\\\")+"\",\"SampleHz\":20,\"SourceLimit\":8,\"CensusLimit\":128,\"QueueCapacity\":64,\"AcquisitionBudgetMs\":2}";
        CaptureConfig config;using(var stream=new MemoryStream(Encoding.UTF8.GetBytes(old)))config=(CaptureConfig)new DataContractJsonSerializer(typeof(CaptureConfig)).ReadObject(stream);config.Validate();Check(!config.AllowRawDrivetrainDiagnostics&&config.DiagnosticMaxFrames==2400,"Historical configuration remains valid and diagnostics disabled");
        config.DiagnosticMaxBytes=1;try{config.Validate();throw new Exception("Bounds accepted");}catch(InvalidDataException){checks++;}
        Console.WriteLine("PASS: "+checks+" drivetrain diagnostic assertions; authored data, no game APIs.");return 0;
    }
}
