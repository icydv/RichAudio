// Original bounded research controller. No game, geometry, entity mutation or audio API.
using System;
using System.Collections.Generic;
using System.Runtime.Serialization;
namespace RichAudio.TrafficResearch
{
    [DataContract] public struct V3
    {
        [DataMember] public double X,Y,Z;
        public V3(double x,double y,double z){X=x;Y=y;Z=z;}
        public bool Finite {get{return Rules.Finite(X)&&Rules.Finite(Y)&&Rules.Finite(Z);}}
        public double Length {get{return Math.Sqrt(X*X+Y*Y+Z*Z);}}
        public static V3 Sub(V3 a,V3 b){return new V3(a.X-b.X,a.Y-b.Y,a.Z-b.Z);}
        public static double Dot(V3 a,V3 b){return a.X*b.X+a.Y*b.Y+a.Z*b.Z;}
    }
    public static class Rules
    {
        public static bool Finite(double n){return !double.IsNaN(n)&&!double.IsInfinity(n);}
        public static void Time(double n){if(!Finite(n)||n<0||n>86400000)throw new ArgumentException("bounded monotonic time");}
        public static void Value(float n){if(float.IsNaN(n)||float.IsInfinity(n)||n!=0)throw new ArgumentException("only the approved zero multiplier");}
    }
    [DataContract] public sealed class Area
    {
        [DataMember] public V3 Anchor,Forward,Right;
        [DataMember] public string Provenance="measured-player-pose-local-corridor-v1";
        public bool StreamedPool {get{return Provenance=="measured-player-pose-streamed-pool-v2";}}
        // Road must be on the right: longitudinal 12..42, lateral 0..12, height +/-3 native units.
        public Area Copy(){return new Area{Anchor=Anchor,Forward=Forward,Right=Right,Provenance=Provenance};}
        public void Validate(){if(!Anchor.Finite||!Forward.Finite||!Right.Finite||Anchor.Length>200000||Math.Abs(Forward.Length-1)>1e-6||Math.Abs(Right.Length-1)>1e-6||Math.Abs(V3.Dot(Forward,Right))>1e-6||Forward.Z!=0||Right.Z!=0||(!StreamedPool&&Provenance!="measured-player-pose-local-corridor-v1"))throw new ArgumentException("area basis");}
        public bool Contains(V3 p){V3 d=V3.Sub(p,Anchor);double f=V3.Dot(d,Forward),r=V3.Dot(d,Right);return p.Finite&&(StreamedPool?p.Length<=200000:f>=12&&f<=42&&r>=0&&r<=12&&Math.Abs(d.Z)<=3);}
        public V3 Point(double f,double r){return new V3(Anchor.X+f*Forward.X+r*Right.X,Anchor.Y+f*Forward.Y+r*Right.Y,Anchor.Z);}
    }
    [DataContract] public sealed class VehicleReading
    {
        [DataMember] public string Identity;
        [DataMember] public uint Handle,Model;
        [DataMember] public int PoolCounter,VehicleClass,PopulationType;
        [DataMember] public V3 Position,Velocity;
        public VehicleReading Copy(){return (VehicleReading)MemberwiseClone();}
        public void Validate(){if(string.IsNullOrEmpty(Identity)||Identity.Length>64||Handle==0||!Position.Finite||!Velocity.Finite||Position.Length>200000||Velocity.Length>200||PoolCounter<0||PoolCounter>255||VehicleClass<0||VehicleClass>22||PopulationType<0||PopulationType>32)throw new ArgumentException("vehicle reading");}
    }
    [DataContract] public sealed class Sample
    {
        [DataMember] public double AtMs,ObservationCostMs;
        [DataMember] public string Phase,Coverage;
        [DataMember] public int Enumerated,ReadErrors;
        [DataMember(EmitDefaultValue=false)] public int PoolEligible,PoolOmitted;
        [DataMember] public V3 Listener,CameraRotation;
        [DataMember] public VehicleReading[] Vehicles;
        public Sample Copy(){var s=(Sample)MemberwiseClone();s.Vehicles=Array.ConvertAll(Vehicles,v=>v.Copy());return s;}
    }
    [DataContract] public sealed class Evidence
    {
        [DataMember] public int Version=1;
        [DataMember] public string Domain,Session,State,Reason;
        [DataMember] public Area Area;
        [DataMember] public double BeginMs,FinishedMs;
        [DataMember] public int ControlCalls,ControlFrames,PartialControlFrames,MissedControlFrames;
        [DataMember] public int ObservationGaps;
        [DataMember] public long LastControlFrame=-1;
        [DataMember] public Sample[] Samples;
        [DataMember] public ControlReceipt[] Receipts;
    }
    [DataContract] public sealed class ControlReceipt
    {
        [DataMember] public double AtMs;
        [DataMember] public long Frame;
        [DataMember] public int AttemptMask,SuccessMask;
        public ControlReceipt Copy(){return (ControlReceipt)MemberwiseClone();}
    }
    public interface IFrameTrafficControl {void Request(int control,float value);}
    public sealed class Calibration
    {
        public const int WindowMs=45000,DurationMs=135000,HardLimitMs=150000,SamplePeriodMs=200;
        private readonly List<Sample> samples=new List<Sample>();
        private readonly List<ControlReceipt> receipts=new List<ControlReceipt>();
        private readonly Area area;private readonly string domain,session;
        private double begin,finished,lastTick=-1,lastSample=-1;private long lastFrame=-1;
        private int calls,frames,partial,missed,gaps;private long lastControl=-1;private bool used;
        public string State {get;private set;}public string Reason {get;private set;}
        public Calibration(Area area,string domain,string session){area.Validate();if(domain!="runtime-observation"&&domain!="original-synthetic-fixture"||string.IsNullOrEmpty(session)||session.Length>64)throw new ArgumentException("domain/session");this.area=area.Copy();this.domain=domain;this.session=session;State="IDLE";Reason="not-started";}
        public void Begin(double now){Rules.Time(now);if(used||State!="IDLE")throw new InvalidOperationException("one attempt only");used=true;begin=now;lastTick=now;State="BASELINE";Reason="running";}
        public string Phase(double now){Rules.Time(now);double t=now-begin;if(t<0)throw new ArgumentException("clock reversal");return t<WindowMs?"BASELINE":t<2*WindowMs?"SUPPRESSION_ACTIVE":t<DurationMs?"RESTORING":"COMPLETE";}
        public bool Running {get{return State=="BASELINE"||State=="SUPPRESSION_ACTIVE"||State=="RESTORING";}}
        public bool Due(double now){return Running&&(lastSample<0||now-lastSample>=SamplePeriodMs);}
        public void Tick(double now,long frame,IFrameTrafficControl control)
        {
            Rules.Time(now);if(!Running)return;if(frame<0)throw new ArgumentException("negative frame");
            if(now<lastTick||frame<lastFrame){Stop(now,"clock-or-frame-reversal",true);return;}
            if(now-begin>=HardLimitMs||now-lastTick>1000){Stop(now,"hard-timeout-or-scheduling-gap",true);return;}
            lastTick=now;State=Phase(now);if(State=="COMPLETE"){finished=now;Reason="fixed-windows-finished";return;}
            if(frame==lastFrame)return;long previous=lastFrame;lastFrame=frame;
            if(State!="SUPPRESSION_ACTIVE")return;
            if(receipts.Count>=20000){Stop(now,"control-receipt-bound",true);return;}
            if(previous>=0&&frame>previous+1)missed+=checked((int)(frame-previous-1));int applied=0;var receipt=new ControlReceipt{AtMs=now,Frame=frame};receipts.Add(receipt);
            try{for(int i=0;i<3;i++){Rules.Value(0f);receipt.AttemptMask|=1<<i;control.Request(i,0f);receipt.SuccessMask|=1<<i;calls++;applied++;lastControl=frame;}frames++;}
            catch(Exception){if(applied>0)partial++;Stop(now,"control-request-failed",true);throw;}
        }
        public void Observe(double now,Sample input)
        {
            Rules.Time(now);if(!Running||Phase(now)!=State||!Due(now))throw new InvalidOperationException("observation order/clock");
            if(input==null||input.Vehicles==null||input.Vehicles.Length>64||samples.Count>=800||input.Enumerated<0||input.Enumerated>4096||input.ReadErrors<0||input.ReadErrors>4096||!input.Listener.Finite||!input.CameraRotation.Finite||!Rules.Finite(input.ObservationCostMs)||input.ObservationCostMs<0||input.ObservationCostMs>1000)throw new ArgumentException("sample bounds");
            if(input.Coverage!="PARTIAL"&&!(domain=="original-synthetic-fixture"&&input.Coverage=="VALID"))throw new ArgumentException("coverage cannot be certified by runtime enumeration");
            if(area.StreamedPool){
                if(input.Coverage!="PARTIAL"||input.PoolEligible<0||input.PoolEligible>input.Enumerated||input.PoolEligible+input.ReadErrors!=input.Enumerated||input.Vehicles.Length!=Math.Min(PoolSelection.Limit,input.PoolEligible)||input.PoolOmitted!=input.PoolEligible-input.Vehicles.Length)throw new ArgumentException("pool selection accounting");
                foreach(var v in input.Vehicles)if(v==null||v.Identity!=PoolSelection.Identity(v.Handle,v.Model,v.PoolCounter))throw new ArgumentException("pool generation identity");
            }else if(input.PoolEligible!=0||input.PoolOmitted!=0)throw new ArgumentException("pool fields on corridor evidence");
            if(V3.Sub(input.Listener,area.Anchor).Length>.25)throw new InvalidOperationException("listener moved");
            var seen=new HashSet<string>();var handles=new HashSet<uint>();foreach(var v in input.Vehicles){if(v==null)throw new ArgumentException("missing vehicle");v.Validate();if(!area.Contains(v.Position)||!seen.Add(v.Identity)||!handles.Add(v.Handle))throw new ArgumentException("outside or duplicate observation");}
            if(lastSample>=0&&now-lastSample>400)gaps++;lastSample=now;Sample copy=input.Copy();copy.AtMs=now;copy.Phase=State;samples.Add(copy);
        }
        public void Stop(double now,string reason,bool failed){Rules.Time(now);if(!Running&&State!="IDLE")return;finished=now;State=failed?"FAILED":"STOPPED";Reason=reason;}
        public Evidence Snapshot(){return new Evidence{Version=area.StreamedPool?2:1,Domain=domain,Session=session,Area=area.Copy(),State=State,Reason=Reason,BeginMs=begin,FinishedMs=finished,ControlCalls=calls,ControlFrames=frames,PartialControlFrames=partial,MissedControlFrames=missed,ObservationGaps=gaps,LastControlFrame=lastControl,Samples=samples.ConvertAll(s=>s.Copy()).ToArray(),Receipts=receipts.ConvertAll(r=>r.Copy()).ToArray()};}
    }
}
