using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;

namespace RichAudio.Acoustics.Observation
{
    // Read-only acquisition candidate. No loop, transport, renderer, native write,
    // clock conversion, event trigger or source-position inference lives here.
    public struct VehicleIdentity03
    {
        public uint poolValue,poolIndex,model;
        public byte poolCounter;
        public bool exists,inPlayerDriverScope;
        public bool SameLifetime(VehicleIdentity03 other)
        {
            return poolValue==other.poolValue&&poolIndex==other.poolIndex&&poolCounter==other.poolCounter&&model==other.model;
        }
    }
    public interface IVehicleObservationApi03
    {
        VehicleIdentity03 ReadIdentity();
        bool ReadHornPlaying();
        bool ReadEngineOn();
        bool ReadEngineStarting();
        double ReadRawRevolutionsRatio();
        int ReadCurrentGear();
        double ReadRawSpeed();
    }
    public interface IVehicleObservationClock03
    {
        long Frequency {get;}
        long Timestamp();
    }
    public sealed class VehicleObservationClock03:IVehicleObservationClock03
    {
        public long Frequency {get{return Stopwatch.Frequency;}}
        public long Timestamp(){return Stopwatch.GetTimestamp();}
    }
    public sealed class VehicleField03
    {
        public string name,status,exceptionType;
        public object value;
        public long? beforeQpc,afterQpc;
        public int? exceptionHResult;
    }
    public sealed class VehicleObservation03
    {
        public int schema=1,generation;
        public string kind="vehicle-read-only-observation-03",evidenceBasis,session,vehicleId,status,retirementReason;
        public bool runtimeVerified=false,mayGenerateAudio=false,nativePrimary=true,sourcePoseAvailable=false;
        public VehicleIdentity03 identity;
        public long sequence,clockFrequency,captureBeforeQpc,captureAfterQpc;
        public VehicleField03[] fields;
    }
    public sealed class VehicleObservationSampler03
    {
        public const int FieldCount=6,MaximumRecords=4096,MaximumAcquisitionMilliseconds=10;
        const long ExactIntegerLimit=9007199254740991;
        readonly IVehicleObservationApi03 api;
        readonly IVehicleObservationClock03 clock;
        readonly string session,vehicleId,evidenceBasis;
        readonly int generation;
        readonly VehicleIdentity03 expected;
        readonly Func<object>[] getters;
        static readonly Func<object,bool> BooleanValue=value=>value is bool;
        static readonly Func<object,bool> GearValue=value=>value is int&&(int)value>=-128&&(int)value<=127;
        static readonly Func<object,bool> RawValue=RawNumber;
        long sequence,lastCaptureBefore=-1,lastCaptureAfter=-1,acceptedFrequency;
        bool retired;
        public bool Retired {get{return retired;}}
        public string RetirementReason {get;private set;}
        public VehicleObservationSampler03(IVehicleObservationApi03 api,IVehicleObservationClock03 clock,
            string session,string vehicleId,int generation,VehicleIdentity03 expected,string evidenceBasis)
        {
            if(api==null||clock==null||!Regex.IsMatch(session??"","\\A[a-f0-9]{32}\\z")||
                !Regex.IsMatch(vehicleId??"","\\A[A-Za-z0-9:._-]{1,48}\\z")||generation<1||expected.poolValue==0||
                (evidenceBasis!="candidate-native-poll"&&evidenceBasis!="authored-device-free-api-fixture"))
                throw new ArgumentException("Explicit bounded observation context required");
            this.api=api;this.clock=clock;this.session=session;this.vehicleId=vehicleId;
            this.generation=generation;this.expected=expected;this.evidenceBasis=evidenceBasis;
            getters=new Func<object>[]{()=>api.ReadHornPlaying(),()=>api.ReadEngineOn(),()=>api.ReadEngineStarting(),
                ()=>api.ReadRawRevolutionsRatio(),()=>api.ReadCurrentGear(),()=>api.ReadRawSpeed()};
        }
        long Now()
        {
            long value=clock.Timestamp();
            if(value<0||value>ExactIntegerLimit)throw new InvalidOperationException("Invalid observation clock");
            return value;
        }
        static string ExceptionKind(Exception exception)
        {
            if(exception is TimeoutException)return "TimeoutException";
            if(exception is InvalidOperationException)return "InvalidOperationException";
            if(exception is ArgumentException)return "ArgumentException";
            if(exception is IOException)return "IOException";
            if(exception is NotSupportedException)return "NotSupportedException";
            return "Exception";
        }
        static VehicleField03 Unavailable(string name)
        {
            return new VehicleField03{name=name,status="unavailable"};
        }
        VehicleField03 Read(string name,Func<object> getter,Func<object,bool> valid)
        {
            var field=new VehicleField03{name=name,beforeQpc=Now()};
            try {field.value=getter();field.status=valid(field.value)?"value":"invalid";if(field.status!="value")field.value=null;}
            catch(System.Threading.ThreadAbortException){throw;}
            catch(Exception exception){field.status="error";field.value=null;field.exceptionType=ExceptionKind(exception);field.exceptionHResult=exception.HResult;}
            field.afterQpc=Now();
            if(field.afterQpc<field.beforeQpc)throw new InvalidOperationException("Observation clock regressed");
            return field;
        }
        static bool RawNumber(object value)
        {
            double number=(double)value;
            return !Double.IsNaN(number)&&!Double.IsInfinity(number)&&Math.Abs(number)<=1000000;
        }
        VehicleObservation03 Stop(VehicleObservation03 record,string reason)
        {
            retired=true;RetirementReason=reason;record.status="retired";record.retirementReason=reason;return record;
        }
        void Finish(VehicleObservation03 record)
        {
            record.captureAfterQpc=Now();
            if(record.captureAfterQpc<record.captureBeforeQpc)throw new InvalidOperationException("Capture clock regressed");
            lastCaptureBefore=record.captureBeforeQpc;
            lastCaptureAfter=record.captureAfterQpc;
        }
        public VehicleObservation03 Capture()
        {
            if(retired)throw new InvalidOperationException("Observation lease is terminal");
            if(sequence>=MaximumRecords){retired=true;RetirementReason="record-budget-exhausted";throw new InvalidOperationException("Observation record budget exhausted");}
            try {
                long frequency=clock.Frequency;
                if(frequency<=0||frequency>1000000000)throw new InvalidOperationException("Explicit valid QPC frequency required");
                if(acceptedFrequency!=0&&frequency!=acceptedFrequency)throw new InvalidOperationException("Observation clock frequency changed");
                acceptedFrequency=frequency;
                var record=new VehicleObservation03{session=session,vehicleId=vehicleId,generation=generation,
                    identity=expected,evidenceBasis=evidenceBasis,sequence=sequence++,clockFrequency=frequency,
                    captureBeforeQpc=Now(),fields=new[]{Unavailable("hornPlaying"),Unavailable("engineOn"),Unavailable("engineStarting"),
                        Unavailable("rawRevolutionsRatio"),Unavailable("currentGear"),Unavailable("rawSpeed")}};
                if(record.captureBeforeQpc<lastCaptureAfter)throw new InvalidOperationException("Capture clock regressed");
                if(lastCaptureBefore>=0&&(decimal)(record.captureBeforeQpc-lastCaptureBefore)*1000>frequency*250){Finish(record);return Stop(record,"observation-gap-expired");}
                VehicleIdentity03 before;
                try {before=api.ReadIdentity();}
                catch(System.Threading.ThreadAbortException){throw;}
                catch {Finish(record);return Stop(record,"identity-read-failed");}
                record.identity=before;
                if(!before.exists||!before.inPlayerDriverScope||!expected.SameLifetime(before)){
                    Finish(record);
                    return Stop(record,!before.exists?"vehicle-disappeared":!expected.SameLifetime(before)?"vehicle-lifetime-changed":"player-driver-scope-lost");
                }
                bool overBudget=false;
                for(int i=0;i<FieldCount;i++){
                    long at=Now();
                    if((decimal)(at-record.captureBeforeQpc)*1000>frequency*MaximumAcquisitionMilliseconds){overBudget=true;break;}
                    record.fields[i]=Read(record.fields[i].name,getters[i],i<3?BooleanValue:i==4?GearValue:RawValue);
                }
                long workAfter=Now();
                if(overBudget||(decimal)(workAfter-record.captureBeforeQpc)*1000>frequency*MaximumAcquisitionMilliseconds){
                    Finish(record);record.status="acquisition-rejected";record.retirementReason="acquisition-over-budget";return record;
                }
                VehicleIdentity03 after;
                try {after=api.ReadIdentity();}
                catch(System.Threading.ThreadAbortException){throw;}
                catch {Finish(record);return Stop(record,"identity-read-failed");}
                Finish(record);
                if(!after.exists||!after.inPlayerDriverScope||!expected.SameLifetime(after))
                    return Stop(record,!after.exists?"vehicle-disappeared":!expected.SameLifetime(after)?"vehicle-lifetime-changed":"player-driver-scope-lost");
                if(overBudget||(decimal)(record.captureAfterQpc-record.captureBeforeQpc)*1000>frequency*MaximumAcquisitionMilliseconds){record.status="acquisition-rejected";record.retirementReason="acquisition-over-budget";}
                else record.status="observed";
                return record;
            }
            catch(System.Threading.ThreadAbortException){retired=true;RetirementReason="capture-aborted";throw;}
            catch {retired=true;RetirementReason="clock-or-capture-failed";throw;}
        }
    }
}
