// Converts only fresh, measured producer status into presentation data. No IO,
// game API or inference from the requested selector is performed here.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Web.Script.Serialization;

namespace RichAudio.Settings.InGame
{
    public static class HostMenuStatus
    {
        private static string Text(Dictionary<string,object> d,string key,string fallback="")
        {object raw;string text=d.TryGetValue(key,out raw)?raw as string:null;return text??fallback;}
        private static long Count(Dictionary<string,object> d,string key)
        {
            object raw;if(!d.TryGetValue(key,out raw))return 0;
            if(!(raw is int||raw is long||raw is decimal||raw is double))throw new FormatException();
            double n=Convert.ToDouble(raw,CultureInfo.InvariantCulture);
            if(Double.IsNaN(n)||Double.IsInfinity(n)||n<0||n>9007199254740991d||n!=Math.Floor(n))throw new FormatException();
            return (long)n;
        }
        public static MenuStatus Read(string json,DateTime utcNow,long savedRevision=0)
        {
            if(String.IsNullOrEmpty(json))return MenuStatus.Unavailable("No configured engine status. Save before host startup; an unconfigured host needs restart.");
            try
            {
                if(json.Length>16384)throw new FormatException();
                var wrapper=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=20}.DeserializeObject(json) as Dictionary<string,object>;
                object raw;if(wrapper==null||!wrapper.TryGetValue("schemaVersion",out raw)||!Equals(raw,1))throw new FormatException();
                if(Text(wrapper,"hostState")!="running")return MenuStatus.Unavailable("GTA stock fallback. RichAudio output is stopped; native audio remains active.");
                DateTime recorded;if(!DateTime.TryParse(Text(wrapper,"recordedAtUtc"),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out recorded))throw new FormatException();
                double age=(utcNow.ToUniversalTime()-recorded.ToUniversalTime()).TotalSeconds;
                if(age>3||age< -1)return MenuStatus.Unavailable("Host status is stale. Active quality and backend are unverified.");
                var state=wrapper.TryGetValue("status",out raw)?raw as Dictionary<string,object>:null;
                if(state==null)return MenuStatus.Unavailable("Waiting for measured acoustic-engine status.");
                string acceleration=Text(state,"activeAcceleration"),device=Text(state,"gpuDevice");
                long applied=Count(state,"gpuResultsApplied"),budget=Count(state,"pathBudget");
                string normalized=System.Text.RegularExpressions.Regex.Replace(device.Trim(),"\\s+"," ");
                bool software=normalized.Equals("Microsoft Basic Render Driver",StringComparison.OrdinalIgnoreCase)||
                    normalized.Equals("Microsoft Basic Display Adapter",StringComparison.OrdinalIgnoreCase)||
                    normalized.Equals("Microsoft WARP",StringComparison.OrdinalIgnoreCase)||normalized.Equals("WARP",StringComparison.OrdinalIgnoreCase);
                if(acceleration=="gpu"&&(Text(state,"gpuCapability")!="hardware-directcompute"||applied==0||String.IsNullOrWhiteSpace(device)||software))
                    return MenuStatus.Unavailable("GPU selected but completed hardware processing has not been established.");
                long revision=Count(state,"settingsRevision");
                string detail=revision<savedRevision?"Preferences saved; waiting for engine acknowledgement. ":"Engine report. ";
                detail+=(Text(state,"integrationMode")=="experimental-additive"?"ADDITIVE: GTA engine audio remains. ":Text(state,"integrationMode")=="stock-fallback"?"GTA stock fallback. ":"");
                detail+="Deadline misses: "+Count(state,"qualityDeadlineMisses")+"; dropped GPU results: "+Count(state,"droppedResults")+". ";
                if(state.ContainsKey("activeVehicles"))detail+="Vehicles: "+Count(state,"activeVehicles")+"; emitters: "+Count(state,"activeEmitters")+"; underrun frames: "+Count(state,"nativeUnderflowFrames")+". ";
                if(state.TryGetValue("richAudioEnabled",out raw)&&raw is bool)detail+=(bool)raw?"Output enabled. ":"Owned output muted. ";
                if(state.TryGetValue("earlyReflections",out raw)&&raw is bool)detail+=(bool)raw?"Early reflections on.":"Direct propagation only.";
                bool? enabled=state.TryGetValue("richAudioEnabled",out raw)&&raw is bool?(bool?)raw:null;
                bool? early=state.TryGetValue("earlyReflections",out raw)&&raw is bool?(bool?)raw:null;
                double? level=null;if(state.TryGetValue("outputLevel",out raw)&&(raw is int||raw is long||raw is double||raw is decimal))level=Convert.ToDouble(raw,CultureInfo.InvariantCulture);
                return MenuStatus.Measured(Text(state,"requestedQuality"),Text(state,"activeQuality"),Text(state,"requestedAcceleration"),
                    acceleration,device,Text(state,"fallbackReason"),(int)Math.Min(budget,Int32.MaxValue),applied,detail,enabled,level,early);
            }
            catch{return MenuStatus.Unavailable("Invalid host status. Active processing has not been established.");}
        }
    }
}
