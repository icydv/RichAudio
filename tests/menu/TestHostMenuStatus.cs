using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
namespace RichAudio.Settings.InGame
{
    public static class TestHostMenuStatus
    {
        private static int checks;
        private static void Check(bool ok){checks++;if(!ok)throw new Exception("Measured menu status check "+checks);}
        public static int Run()
        {
            checks=0;var now=new DateTime(2026,10,29,12,0,0,DateTimeKind.Utc);
            var status=new Dictionary<string,object>{{"requestedQuality","quality"},{"activeQuality","quality"},{"requestedAcceleration","gpu"},
                {"activeAcceleration","cpu"},{"gpuDevice","Example hardware"},{"gpuCapability","unsupported"},{"gpuResultsApplied",0},
                {"pathBudget",32},{"settingsRevision",4},{"qualityDeadlineMisses",2},{"droppedResults",1},{"richAudioEnabled",true},{"outputLevel",.5},{"earlyReflections",false}};
            var wrapper=new Dictionary<string,object>{{"schemaVersion",1},{"hostState","running"},{"recordedAtUtc",now.ToString("o")},{"status",status}};
            var json=new JavaScriptSerializer();
            Func<MenuStatus> read=()=>HostMenuStatus.Read(json.Serialize(wrapper),now,5);
            var cpu=read();Check(cpu.Available&&cpu.ActiveAcceleration=="cpu");Check(cpu.Detail.Contains("waiting for engine acknowledgement"));
            status["activeAcceleration"]="gpu";Check(!read().Available);
            status["gpuCapability"]="hardware-directcompute";Check(!read().Available);
            status["gpuResultsApplied"]=12;var gpu=read();Check(gpu.Available&&gpu.GpuResultsApplied==12&&gpu.ActiveAcceleration=="gpu");
            Check(gpu.ActiveOutputEnabled==true&&gpu.ActiveOutputLevel==.5&&gpu.ActiveEarlyReflections==false);
            status["gpuDevice"]="Microsoft Basic Render Driver";Check(!read().Available);status["gpuDevice"]="Example hardware";
            status["gpuDevice"]="";Check(!read().Available);status["gpuDevice"]="Example hardware";
            wrapper["recordedAtUtc"]=now.AddSeconds(-4).ToString("o");Check(!read().Available);
            wrapper["recordedAtUtc"]=now.AddSeconds(2).ToString("o");Check(!read().Available);
            wrapper["recordedAtUtc"]=now.ToString("o");wrapper["hostState"]="stopped";Check(!read().Available);
            wrapper["hostState"]="running";status["gpuResultsApplied"]=-1;Check(!read().Available);
            status["gpuResultsApplied"]=true;Check(!read().Available);status["gpuResultsApplied"]=12;
            status["pathBudget"]=65;Check(!read().Available);status["pathBudget"]=32;
            status["activeQuality"]="auto";Check(!read().Available);status["activeQuality"]="quality";
            status["settingsRevision"]=5;Check(!read().Detail.Contains("waiting for engine acknowledgement"));
            Check(!HostMenuStatus.Read(null,now).Available);Check(!HostMenuStatus.Read("{}",now).Available);
            Check(!HostMenuStatus.Read("not JSON",now).Available);Check(!HostMenuStatus.Read(new String('x',16385),now).Available);
            return checks;
        }
    }
}
