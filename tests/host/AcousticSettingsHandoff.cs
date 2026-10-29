// Actual GUI Save -> settings monitor -> host queue/writer -> producer -> status.
// No Host.Main/Run, WASAPI object, audio endpoint or visible window is used.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Settings;

namespace RichAudio.Beacon.Windows
{
    public static partial class HostProgram
    {
        internal static unsafe int SettingsHandoff(string root)
        {
            string directory=PrivateOutput(root,Path.Combine(".local","settings-handoff-"+Guid.NewGuid().ToString("N")));
            Directory.CreateDirectory(directory);string path=Path.Combine(directory,"settings.json");
            var first=new AcousticSettings("performance","cpu",1);AcousticSettingsStore.Save(root,path,first);
            var ring=new PcmRing();Thread reader=null,diagnostic=null;int phase=0;double completed=-1,nextUiRefresh=0;
            AcousticSettingsWindow ui=null;var wall=Stopwatch.StartNew();var frames=new float[1024];
            try
            {
                string resolved;var selected=AcousticSettingsStore.Resolve(root,path,null,null,out resolved);
                acousticSettingsMonitor=new AcousticSettingsMonitor(root,resolved,selected,delegate(AcousticSettings s){Send(s.ControlMessage());});
                child=new Process{StartInfo=new ProcessStartInfo{FileName="node.exe",WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,
                    RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,
                    Arguments=Quote(Path.Combine(root,"tools","Run-Acoustics07.mjs"))+" --scene enclosure --sources 1 --beacon harmonic --trace-blocks yes --history-diagnostics yes"+selected.ProducerArguments()}};
                child.Start();inputWriter=new Thread(WriteControls){IsBackground=true};inputWriter.Start();
                diagnostic=new Thread(ReadDiagnostics){IsBackground=true};diagnostic.Start();
                reader=new Thread(delegate(){ReadBlocks(child.StandardOutput.BaseStream,ring);}){IsBackground=true};reader.Start();
                acousticSettingsMonitor.Start();ui=new AcousticSettingsWindow(root,path);Send("{\"type\":\"credit\",\"blocks\":4}");SendControl("start");
                while(wall.Elapsed.TotalSeconds<6)
                {
                    if(child.HasExited || producerError!=null)throw new Exception("Settings producer stopped before handoff completed");
                    if(ring.Count>0){fixed(float* p=frames){ring.Fill(p,512,.08f);}}
                    int credits=ring.TakeCredits();if(credits>0)Send("{\"type\":\"credit\",\"blocks\":"+credits+"}");
                    string status=latestAcousticSettingsStatus;
                    if(status!=null)
                    {
                        var d=new JavaScriptSerializer().DeserializeObject(status) as Dictionary<string,object>;
                        bool cpu=d.ContainsKey("activeAcceleration")&&(string)d["activeAcceleration"]=="cpu";
                        string quality=d.ContainsKey("activeQuality")?d["activeQuality"] as string:null;
                        int budget=d.ContainsKey("pathBudget")?Convert.ToInt32(d["pathBudget"]):0;
                        if(phase==0 && cpu && quality=="performance" && budget==12){ui.QualitySelector.Value=4;ui.AccelerationSelector.SelectedIndex=1;ui.SaveSelection();phase=1;}
                        else if(phase==1 && cpu && quality=="max" && budget==64){ui.QualitySelector.Value=1;ui.SaveSelection();phase=2;}
                        else if(phase==2 && cpu && quality=="performance" && budget==12){phase=3;completed=wall.Elapsed.TotalMilliseconds;}
                    }
                    if(wall.Elapsed.TotalMilliseconds>=nextUiRefresh){ui.RefreshStatus();nextUiRefresh=wall.Elapsed.TotalMilliseconds+1000;}
                    if(phase==3 && wall.Elapsed.TotalMilliseconds-completed>350)break;
                    Thread.Sleep(4);
                }
                if(phase!=3)throw new Exception("Actual producer did not acknowledge both UI quality changes");
                if(acousticSettingsMonitor.Applied!=2)throw new Exception("Settings changes did not traverse the real background monitor exactly once");
                if(output!=null || ring.Peak<=0 || ring.UnderflowFrames!=0 || rejectedBlocks!=0 || receivedBlocks<20)throw new Exception("Device-free PCM handoff invariant failed");
            }
            catch(Exception e){producerError=e.GetType().Name+": "+e.Message;}
            finally
            {
                stop=true;SendControl("stop");if(child!=null&&!child.WaitForExit(2500)){child.Kill();child.WaitForExit(1000);producerError="Settings producer exceeded shutdown bound";}
                inputStop=true;inputSignal.Set();if(inputWriter!=null)inputWriter.Join(1000);if(reader!=null)reader.Join(1000);if(diagnostic!=null)diagnostic.Join(1000);
                if(acousticSettingsMonitor!=null)acousticSettingsMonitor.Dispose();if(ui!=null)ui.Dispose();
            }
            var generations=new HashSet<string>();Dictionary<string,object> final=null;int maximumPaths=0;
            lock(logLock)
            {
                foreach(string line in rendererLog)
                {
                    if(line.StartsWith("{\"type\":\"block\",",StringComparison.Ordinal))
                    {
                        var block=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=24}.DeserializeObject(line) as Dictionary<string,object>;
                        maximumPaths=Math.Max(maximumPaths,Convert.ToInt32(block["paths"]));
                        object raw;if(block.TryGetValue("sourceGenerations",out raw)&&raw is Dictionary<string,object>)
                            foreach(var pair in (Dictionary<string,object>)raw)generations.Add(pair.Key+":"+Convert.ToString(pair.Value,System.Globalization.CultureInfo.InvariantCulture));
                    }
                    if(line.StartsWith("{\"type\":\"final\",",StringComparison.Ordinal))final=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=24}.DeserializeObject(line) as Dictionary<string,object>;
                }
                WriteNew(Path.Combine(directory,"producer.txt"),string.Join(Environment.NewLine,rendererLog.ToArray()));
            }
            if(final==null || child.ExitCode!=0 || generations.Count!=1 || maximumPaths<=12)producerError=producerError??"Real higher path capacity, source identity or clean shutdown not established";
            if(final!=null){var dsp=final["dsp"] as Dictionary<string,object>;var simulation=final["simulation"] as Dictionary<string,object>;
                if(dsp==null || simulation==null || Convert.ToInt64(dsp["limited"])!=0 || Convert.ToInt64(dsp["cursorResets"])!=0 || Convert.ToInt64(simulation["resets"])!=1)
                    producerError=producerError??"Quality transition reset history or violated PCM continuity";}
            var result=new Dictionary<string,object>{{"schemaVersion",1},{"deviceConstructed",output!=null},{"visibleWindowShown",false},
                {"changesAcknowledged",phase==3},{"sourceIdentities",generations.Count},{"maximumProcessedPaths",maximumPaths},{"receivedBlocks",receivedBlocks},{"peak",ring.Peak},
                {"underflowFrames",ring.UnderflowFrames},{"rejectedBlocks",rejectedBlocks},{"error",producerError},
                {"monitor",acousticSettingsMonitor.Metrics()}};
            WriteNew(Path.Combine(directory,"result.json"),json.Serialize(result));Console.WriteLine(json.Serialize(result));
            return producerError==null?0:1;
        }
    }
    public static class AcousticSettingsHandoff
    {
        [STAThread] public static int Main(string[] args){try{if(args.Length!=1)throw new ArgumentException("Repository root required");return HostProgram.SettingsHandoff(Path.GetFullPath(args[0]));}
            catch(Exception e){Console.Error.WriteLine(e);return 1;}}
    }
}
