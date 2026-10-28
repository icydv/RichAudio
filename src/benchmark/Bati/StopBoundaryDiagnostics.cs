// Optional research observations only. Nothing in this file issues a driving or entity command.
using System;
using System.Collections.Generic;
using System.Runtime.Serialization;
using RichAudio.MarkerResearch;

namespace RichAudio.BatiResearch
{
    [DataContract] public sealed class DiagnosticValue
    {
        [DataMember] public string Availability="UNKNOWN",ExceptionType;
        [DataMember] public double? StartedAt,EndedAt,Raw;
        public DiagnosticValue Copy(){return (DiagnosticValue)MemberwiseClone();}
    }
    [DataContract] public sealed class TaskRequestReceipt
    {
        [DataMember] public int Sequence,DestinationIndex,DrivingStyle;
        [DataMember] public string DestinationName,ExceptionType;
        [DataMember] public Identity Bike,Rider;
        [DataMember] public double RequestedAt,RequestedSpeed;
        [DataMember] public double? ReturnedAt,DistanceFromLastWrapperPosition,DistanceObservedAt;
        [DataMember] public bool ReturnedNormally;
        public TaskRequestReceipt Copy(){return (TaskRequestReceipt)MemberwiseClone();}
    }
    [DataContract] public sealed class BoundaryFacts
    {
        [DataMember] public double PreviousAt,SampleGap,WrapperDisplacement,WrapperSpeedDelta;
        [DataMember] public bool SamePosition,SameRotation,MovementBegan,MovementEnded,GenericStatusChanged;
        [DataMember] public bool? SpecificStatusChanged;
        [DataMember] public double? NativeSpeedDelta;
        public BoundaryFacts Copy(){return (BoundaryFacts)MemberwiseClone();}
    }
    [DataContract] public sealed class StopBoundaryReading
    {
        [DataMember] public int Version=1,Sequence,TaskRequestSequence;
        [DataMember] public uint ScriptTaskHash=0x21D33957;
        [DataMember] public Identity Bike,Rider;
        [DataMember] public string TimestampBasis="experiment monotonic seconds; sequential acquisition intervals",
            NativePosition="NOT_IMPLEMENTED_VECTOR_MARSHALLING_UNVERIFIED",NativeVelocity="NOT_IMPLEMENTED_VECTOR_MARSHALLING_UNVERIFIED",
            IdentityStatus="UNKNOWN",DisabledReason;
        [DataMember] public double WrapperStartedAt,WrapperEndedAt,StartedAt,EndedAt,OverheadMilliseconds;
        [DataMember] public DiagnosticValue TaskStatus=new DiagnosticValue(),NativeSpeed=new DiagnosticValue();
        [DataMember] public double? NativeMinusWrapperSpeed;
        [DataMember] public BoundaryFacts Boundary;
        public StopBoundaryReading Copy(){var c=(StopBoundaryReading)MemberwiseClone();c.TaskStatus=TaskStatus.Copy();c.NativeSpeed=NativeSpeed.Copy();c.Boundary=Boundary==null?null:Boundary.Copy();return c;}
    }
    [DataContract] public sealed class StopBoundarySummary
    {
        [DataMember] public int Version=1,Observations,TaskCalls,SpeedCalls;
        [DataMember] public string DisabledReason;
        [DataMember] public double TotalMilliseconds,MaximumMilliseconds;
        [DataMember] public TaskRequestReceipt[] Requests;
        [DataMember] public StopBoundaryReading LastObservation;
    }
    public sealed class StopBoundaryProbe
    {
        // Fixed research caps, not a hard execution deadline for an in-flight native call.
        public const int MaximumObservations=2500;
        public const double BudgetMilliseconds=2;
        private readonly bool enabled;
        private readonly Func<double> clock;
        private readonly MarkerPoint[] destinations;
        private readonly string[] destinationNames;
        private readonly List<TaskRequestReceipt> requests=new List<TaskRequestReceipt>();
        private bool taskFailed,speedFailed;
        private string disabled;
        private int observations,taskCalls,speedCalls;
        private double total,maximum;
        private Reading previous;
        private StopBoundaryReading last;
        public StopBoundaryProbe(bool enabled,Func<double> clock,MarkerPoint[] destinations,string[] names)
        {this.enabled=enabled;this.clock=clock;this.destinations=destinations==null?null:(MarkerPoint[])destinations.Clone();destinationNames=names==null?null:(string[])names.Clone();}
        public double? Now(){return enabled? (double?)clock():null;}
        public void Fault(Exception e){disabled="OBSERVER_EXCEPTION_"+e.GetType().Name;}
        // Receipt methods use only already copied data and the local clock. They do not sample GTA.
        public void BeginDrive(Identity rider,Identity bike,MarkerPoint destination,double speed,int style)
        {
            if(!enabled)return;
            if(requests.Count>=5){disabled="REQUEST_RECEIPT_CAP";return;}
            int index=-1;
            if(destinations!=null)for(int i=0;i<destinations.Length;i++)if(Check.Distance(destinations[i],destination)==0){index=i;break;}
            var r=new TaskRequestReceipt{Sequence=requests.Count+1,DestinationIndex=index,DestinationName=index>=0&&destinationNames!=null&&index<destinationNames.Length?destinationNames[index]:"UNKNOWN",Bike=bike,Rider=rider,RequestedAt=clock(),RequestedSpeed=speed,DrivingStyle=style};
            if(previous!=null&&previous.Bike.Same(bike)&&previous.Rider.Same(rider)&&previous.Position.Valid){r.DistanceFromLastWrapperPosition=Check.Distance(previous.Position,destination);r.DistanceObservedAt=previous.At;}
            requests.Add(r);
        }
        public void EndDrive(bool returned,string exceptionType)
        {
            if(!enabled||requests.Count==0||disabled=="REQUEST_RECEIPT_CAP")return;
            var r=requests[requests.Count-1];r.ReturnedAt=clock();r.ReturnedNormally=returned;r.ExceptionType=exceptionType;
        }
        private DiagnosticValue Read(Func<double> getter,bool integer,ref bool failed,ref int calls)
        {
            var v=new DiagnosticValue();
            if(failed){v.Availability="DISABLED_AFTER_FAILURE";return v;}
            if(disabled!=null){v.Availability="DISABLED";return v;}
            v.StartedAt=clock();calls++;
            try{double raw=getter();if(Check.Finite(raw))v.Raw=raw;
                if(!Check.Finite(raw)||raw<0||(integer&&(raw>7||raw!=Math.Truncate(raw)))){v.Availability="UNKNOWN_INVALID_VALUE";failed=true;}
                else v.Availability="AVAILABLE";
            }catch(Exception e){v.Availability="UNKNOWN_EXCEPTION";v.ExceptionType=e.GetType().Name;failed=true;}
            v.EndedAt=clock();return v;
        }
        public StopBoundaryReading Observe(Reading r,double wrapperStart,double wrapperEnd,Func<int> task,Func<double> speed,Func<bool> sameIdentity)
        {
            if(!enabled)return null; // No clocks, getters, identity calls or allocations on this path.
            if(observations>=MaximumObservations){disabled="OBSERVATION_CAP";return null;}
            var d=new StopBoundaryReading{Sequence=++observations,TaskRequestSequence=requests.Count,Bike=r.Bike,Rider=r.Rider,WrapperStartedAt=wrapperStart,WrapperEndedAt=wrapperEnd,StartedAt=clock()};
            bool match=false;try{if(disabled==null)match=r.Bike.Valid&&r.Rider.Valid&&sameIdentity();}catch(Exception e){disabled="IDENTITY_EXCEPTION_"+e.GetType().Name;}
            if(!match)disabled=disabled??"IDENTITY_UNVERIFIED";
            if((clock()-d.StartedAt)*1000>BudgetMilliseconds)disabled=disabled??"OBSERVATION_BUDGET";
            d.TaskStatus=Read(()=>task(),true,ref taskFailed,ref taskCalls);
            if((clock()-d.StartedAt)*1000>BudgetMilliseconds)disabled=disabled??"OBSERVATION_BUDGET";
            d.NativeSpeed=Read(speed,false,ref speedFailed,ref speedCalls);
            try{if(match)match=sameIdentity();}catch{match=false;}
            d.IdentityStatus=match?"MATCHED_BEFORE_AND_AFTER":"UNKNOWN";
            if(!match){disabled=disabled??"IDENTITY_CHANGED";d.TaskStatus.Availability="UNKNOWN_IDENTITY";d.NativeSpeed.Availability="UNKNOWN_IDENTITY";}
            d.EndedAt=clock();d.OverheadMilliseconds=(d.EndedAt-d.StartedAt)*1000;
            if(!Check.Finite(wrapperStart)||!Check.Finite(wrapperEnd)||wrapperStart> wrapperEnd||wrapperEnd>d.StartedAt||d.OverheadMilliseconds<0){disabled="INVALID_ACQUISITION_CLOCK";d.TaskStatus.Availability="UNKNOWN_TIMING";d.NativeSpeed.Availability="UNKNOWN_TIMING";}
            if(d.OverheadMilliseconds>BudgetMilliseconds)disabled=disabled??"OBSERVATION_BUDGET";
            if(d.NativeSpeed.Availability=="AVAILABLE")d.NativeMinusWrapperSpeed=d.NativeSpeed.Raw-r.Speed;
            d.DisabledReason=disabled;total+=d.OverheadMilliseconds;maximum=Math.Max(maximum,d.OverheadMilliseconds);
            d.Boundary=Compare(previous,r,last,d);last=d.Copy();previous=r.Copy();previous.StopBoundary=null;return d;
        }
        public static BoundaryFacts Compare(Reading before,Reading after,StopBoundaryReading a,StopBoundaryReading b)
        {
            if(before==null||after==null||!before.Bike.Same(after.Bike)||!before.Rider.Same(after.Rider)||after.At<=before.At||after.At-before.At>.25)return null;
            var f=new BoundaryFacts{PreviousAt=before.At,SampleGap=after.At-before.At,WrapperDisplacement=Check.Distance(before.Position,after.Position),WrapperSpeedDelta=after.Speed-before.Speed,SamePosition=Check.Distance(before.Position,after.Position)==0,SameRotation=Check.Distance(before.Rotation,after.Rotation)==0,MovementBegan=before.Speed<=.25&&after.Speed>.25,MovementEnded=before.Speed>.25&&after.Speed<=.25,GenericStatusChanged=before.TaskState!=after.TaskState};
            if(a!=null&&b!=null&&a.IdentityStatus=="MATCHED_BEFORE_AND_AFTER"&&b.IdentityStatus=="MATCHED_BEFORE_AND_AFTER"&&a.Bike.Same(before.Bike)&&a.Rider.Same(before.Rider)&&b.Bike.Same(after.Bike)&&b.Rider.Same(after.Rider)){
                if(a.TaskRequestSequence==b.TaskRequestSequence&&a.TaskStatus.Availability=="AVAILABLE"&&b.TaskStatus.Availability=="AVAILABLE")f.SpecificStatusChanged=a.TaskStatus.Raw!=b.TaskStatus.Raw;
                if(a.NativeSpeed.Availability=="AVAILABLE"&&b.NativeSpeed.Availability=="AVAILABLE")f.NativeSpeedDelta=b.NativeSpeed.Raw-a.NativeSpeed.Raw;
            }return f;
        }
        public StopBoundarySummary Snapshot()
        {
            if(!enabled)return null;var copy=new TaskRequestReceipt[requests.Count];for(int i=0;i<copy.Length;i++)copy[i]=requests[i].Copy();
            return new StopBoundarySummary{Observations=observations,TaskCalls=taskCalls,SpeedCalls=speedCalls,DisabledReason=disabled,TotalMilliseconds=total,MaximumMilliseconds=maximum,Requests=copy,LastObservation=last==null?null:last.Copy()};
        }
    }
}
