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
            Check(cpu.WorldDetail.Contains("no qualified installed coverage"));
            var world=new Dictionary<string,object>{{"stage","building-missing-regions"},{"installedWorldVerified",false},
                {"preparation",new Dictionary<string,object>{{"completedEligibleTiles",3},{"eligibleTiles",9},{"totalTiles",12}}}};
            status["acousticWorld"]=world;Check(read().WorldDetail.Contains("3/9 cached; 12 declared"));
            world["stage"]="ready-within-declared-coverage";Check(read().WorldDetail.Contains("installed coverage unverified"));
            world["installedWorldVerified"]=true;Check(read().WorldDetail.Contains("ready-within-declared-coverage"));
            ((Dictionary<string,object>)world["preparation"])["completedEligibleTiles"]=10;Check(read().WorldDetail.Contains("invalid coverage"));
            ((Dictionary<string,object>)world["preparation"])["completedEligibleTiles"]=3;
            var coverage=new Dictionary<string,object>{{"denominator",12},{"geometry",new Dictionary<string,object>{{"eligible",12},{"prepared",9}}},{"placement",new Dictionary<string,object>{{"cacheIdentityQualified",3}}},{"activation",new Dictionary<string,object>{{"observedActive",0},{"unobserved",12}}}};
            world["coverageStates"]=coverage;Check(read().WorldDetail.Contains("models 9/12")&&read().WorldDetail.Contains("placed(model) 3")&&read().WorldDetail.Contains("runtime unobserved"));
            ((Dictionary<string,object>)coverage["geometry"])["prepared"]=13;Check(read().WorldDetail.Contains("invalid coverage"));
            ((Dictionary<string,object>)coverage["geometry"])["prepared"]=9;coverage.Remove("denominator");Check(read().WorldDetail.Contains("invalid coverage"));
            status.Remove("acousticWorld");
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
            wrapper["hostState"]="stopped";wrapper["status"]=new Dictionary<string,object>{{"integrationMode","stock-fallback"},{"nativeReplacement",false},{"reason","GTA stock fallback"}};
            var fallback=read();Check(fallback.StockAudioActive&&!fallback.Available&&fallback.Detail.Contains("GTA keeps its original"));
            wrapper["recordedAtUtc"]=now.AddSeconds(-4).ToString("o");Check(!read().StockAudioActive);
            wrapper["recordedAtUtc"]=now.ToString("o");var stopped=(Dictionary<string,object>)wrapper["status"];stopped["reason"]="GTA stock fallback: blocked-InvalidDataException";
            Check(!read().StockAudioActive&&read().Detail.Contains("blocked-InvalidDataException"));
            stopped["reason"]="GTA stock fallback";stopped["nativeReplacement"]=true;Check(!read().StockAudioActive);
            return checks;
        }
    }
}
