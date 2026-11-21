using System;
using System.IO;
using System.Text.RegularExpressions;

namespace RichAudio.Acoustics.Observation
{
    public interface IVehicleContactApi03
    {
        VehicleIdentity03 ReadIdentity();
        bool ReadLastCollision(out double[] position,out double[] normal,out string materialName);
    }
    public sealed class VehicleContactObservation03
    {
        public int schema=1,generation;
        public string kind="vehicle-last-contact-observation-03",evidenceBasis,session,vehicleId,status,retirementReason,exceptionType,materialName,materialNameStatus;
        public bool runtimeVerified=false,mayGenerateAudio=false,nativePrimary=true,lastContactOnly=true,
            coordinatesQualified=false,materialQualified=false,physicalIntensityAvailable=false;
        public bool? found;
        public double[] rawPosition,rawNormal;
        public int? exceptionHResult;
        public long sequence,clockFrequency,captureBeforeQpc,captureAfterQpc;
        public long? queryBeforeQpc,queryAfterQpc;
        public VehicleIdentity03 identity;
    }
    public sealed class VehicleContactSampler03
    {
        readonly IVehicleContactApi03 api;readonly IVehicleObservationClock03 clock;
        readonly string session,vehicleId,evidenceBasis;readonly int generation;readonly VehicleIdentity03 expected;
        long sequence,lastBefore=-1,lastAfter=-1,frequency;bool retired;
        public VehicleContactSampler03(IVehicleContactApi03 api,IVehicleObservationClock03 clock,string session,string vehicleId,int generation,
            VehicleIdentity03 expected,string evidenceBasis)
        {
            if(api==null||clock==null||!Regex.IsMatch(session??"","\\A[a-f0-9]{32}\\z")||
                !Regex.IsMatch(vehicleId??"","\\A[A-Za-z0-9:._-]{1,48}\\z")||generation<1||expected.poolValue==0||
                (evidenceBasis!="candidate-native-poll"&&evidenceBasis!="authored-device-free-api-fixture"))throw new ArgumentException("Explicit retained contact-poll context required");
            this.api=api;this.clock=clock;this.session=session;this.vehicleId=vehicleId;this.generation=generation;this.expected=expected;this.evidenceBasis=evidenceBasis;
        }
        long Now(){long t=clock.Timestamp();if(t<0||t>9007199254740991)throw new InvalidOperationException("Invalid contact clock");return t;}
        void Finish(VehicleContactObservation03 value){value.captureAfterQpc=Now();if(value.captureAfterQpc<value.captureBeforeQpc)throw new InvalidOperationException("Contact clock regressed");lastBefore=value.captureBeforeQpc;lastAfter=value.captureAfterQpc;}
        VehicleContactObservation03 Retire(VehicleContactObservation03 value,string why){retired=true;value.status="retired";value.retirementReason=why;return value;}
        static bool Vector(double[] input){if(input==null||input.Length!=3)return false;foreach(double x in input)if(Double.IsNaN(x)||Double.IsInfinity(x)||Math.Abs(x)>1000000)return false;return true;}
        static string Kind(Exception e){return e is TimeoutException?"TimeoutException":e is InvalidOperationException?"InvalidOperationException":e is ArgumentException?"ArgumentException":e is IOException?"IOException":e is NotSupportedException?"NotSupportedException":"Exception";}
        bool InBudget(VehicleContactObservation03 value,long at){return (decimal)(at-value.captureBeforeQpc)*1000<=frequency*10;}
        public VehicleContactObservation03 Capture()
        {
            if(retired)throw new InvalidOperationException("Contact-poll lease is terminal");
            if(sequence>=4096){retired=true;throw new InvalidOperationException("Contact-poll record budget exhausted");}
            try{
                long hz=clock.Frequency;if(hz<=0||hz>1000000000||(frequency!=0&&frequency!=hz))throw new InvalidOperationException("Contact clock invalid/changed");frequency=hz;
                var value=new VehicleContactObservation03{session=session,vehicleId=vehicleId,generation=generation,identity=expected,evidenceBasis=evidenceBasis,
                    sequence=sequence++,clockFrequency=hz,captureBeforeQpc=Now(),materialNameStatus="unavailable"};
                if(value.captureBeforeQpc<lastAfter)throw new InvalidOperationException("Contact clock regressed");
                if(lastBefore>=0&&(decimal)(value.captureBeforeQpc-lastBefore)*1000>frequency*250){Finish(value);return Retire(value,"observation-gap-expired");}
                VehicleIdentity03 before;
                try{before=api.ReadIdentity();}catch(System.Threading.ThreadAbortException){throw;}catch{Finish(value);return Retire(value,"identity-read-failed");}
                value.identity=before;
                if(!before.exists||!before.inPlayerDriverScope||!expected.SameLifetime(before)){Finish(value);return Retire(value,!before.exists?"vehicle-disappeared":!expected.SameLifetime(before)?"vehicle-lifetime-changed":"player-driver-scope-lost");}
                long query=Now();
                if(!InBudget(value,query)){Finish(value);value.status="acquisition-rejected";value.retirementReason="acquisition-over-budget";return value;}
                value.queryBeforeQpc=query;
                try{
                    double[] position,normal;string material;
                    value.found=api.ReadLastCollision(out position,out normal,out material);
                    if(value.found.Value){
                        if(!Vector(position)||!Vector(normal)){value.status="invalid";value.found=null;}
                        else{
                            value.rawPosition=(double[])position.Clone();value.rawNormal=(double[])normal.Clone();
                            if(material!=null&&material.Length<=64&&Regex.IsMatch(material,"\\A[A-Za-z0-9_.: -]{1,64}\\z")){value.materialName=material;value.materialNameStatus="value";}
                            else value.materialNameStatus=material==null?"unavailable":"invalid";
                        }
                    }
                }catch(System.Threading.ThreadAbortException){throw;}
                catch(Exception e){value.status="error";value.found=null;value.exceptionType=Kind(e);value.exceptionHResult=e.HResult;}
                value.queryAfterQpc=Now();if(value.queryAfterQpc<value.queryBeforeQpc)throw new InvalidOperationException("Contact query clock regressed");
                if(!InBudget(value,value.queryAfterQpc.Value)){Finish(value);value.status="acquisition-rejected";value.retirementReason="acquisition-over-budget";return value;}
                VehicleIdentity03 after;
                try{after=api.ReadIdentity();}catch(System.Threading.ThreadAbortException){throw;}catch{Finish(value);return Retire(value,"identity-read-failed");}
                Finish(value);
                if(!after.exists||!after.inPlayerDriverScope||!expected.SameLifetime(after))return Retire(value,!after.exists?"vehicle-disappeared":!expected.SameLifetime(after)?"vehicle-lifetime-changed":"player-driver-scope-lost");
                if(!InBudget(value,value.captureAfterQpc)){value.status="acquisition-rejected";value.retirementReason="acquisition-over-budget";}
                else if(value.status==null)value.status="observed";
                return value;
            }catch(System.Threading.ThreadAbortException){retired=true;throw;}catch{retired=true;throw;}
        }
    }
}
