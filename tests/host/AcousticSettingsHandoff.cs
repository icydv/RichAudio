// Actual GUI Save -> settings monitor -> host queue/writer -> producer -> status.
// No Host.Main/Run, WASAPI object, audio endpoint or visible window is used.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Settings;
using RichAudio.Settings.InGame;

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
            int mutedBlocks=0,resumedBlocks=0;double mutedEnergy=0,resumedEnergy=0,maximumStep=0;float previousLeft=0,previousRight=0;
            InGameSettingsBridge menuBridge=null;var menu=new AcousticMenuModel();
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
                string pointer=Path.Combine(directory,"RichAudio.Menu.json");
                File.WriteAllText(pointer,json.Serialize(new Dictionary<string,object>{{"schemaVersion",1},{"workspaceRoot",root},
                    {"settingsPath",path.Substring(root.TrimEnd(Path.DirectorySeparatorChar).Length+1)},{"toggleKey","F10"},{"controllerEnabled",true}}));
                menuBridge=new InGameSettingsBridge(pointer);menuBridge.Start();
                while(wall.Elapsed.TotalSeconds<12)
                {
                    if(child.HasExited || producerError!=null)throw new Exception("Settings producer stopped before handoff completed");
                    if(ring.Count>0){fixed(float* p=frames){ring.Fill(p,512,.08f);}
                        double energy=0;for(int i=0;i<512;i++){float l=frames[i*2],r=frames[i*2+1];
                            if(Single.IsNaN(l)||Single.IsNaN(r)||Single.IsInfinity(l)||Single.IsInfinity(r)||Math.Abs(l)>=1||Math.Abs(r)>=1)throw new Exception("Nonfinite or clipped settings-handoff PCM");
                            maximumStep=Math.Max(maximumStep,Math.Max(Math.Abs(l-previousLeft),Math.Abs(r-previousRight)));previousLeft=l;previousRight=r;energy+=l*l+r*r;}
                        if(phase==5){mutedEnergy+=energy;mutedBlocks++;}if(phase==7){resumedEnergy+=energy;resumedBlocks++;}}
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
                        else if(phase==2 && cpu && quality=="performance" && budget==12 && menuBridge.Snapshot.Available&&!menuBridge.Snapshot.Pending&&
                            d.ContainsKey("settingsRevision")&&Convert.ToInt64(d["settingsRevision"])==menuBridge.Snapshot.SavedRevision)
                        {
                            OpenMenu(menu,menuBridge.Snapshot.Settings);menu.Handle(MenuInput.Right);menu.Handle(MenuInput.Right); // Performance -> Quality.
                            SelectMenuRow(menu,3);for(int i=0;i<12;i++)menu.Handle(MenuInput.Left); // Existing profile attenuated to 0.40.
                            SelectMenuRow(menu,4);menu.Handle(MenuInput.Left);SelectMenuRow(menu,6);menu.Handle(MenuInput.Right);
                            if(!ApplyMenu(menu,menuBridge))throw new Exception("Native menu did not queue quality/audio preferences");phase=3;
                        }
                        else if(phase==3 && AudioState(d,true,.4,false,true)&&cpu&&quality=="quality"&&budget==32&&Convert.ToInt32(d["actualPathCount"])==1&&
                            Convert.ToDouble(d["outputGain"])<.40001&&MenuSynchronized(menuBridge,d))
                        {OpenMenu(menu,menuBridge.Snapshot.Settings);SelectMenuRow(menu,2);menu.Handle(MenuInput.Left);
                            if(!ApplyMenu(menu,menuBridge))throw new Exception("Native menu did not queue smooth owned-output mute");phase=4;}
                        else if(phase==4 && AudioState(d,false,.4,false,true)&&Convert.ToDouble(d["outputTarget"])==0&&Convert.ToDouble(d["outputGain"])<1e-8&&MenuSynchronized(menuBridge,d))phase=5;
                        else if(phase==5 && mutedBlocks>=12)
                        {OpenMenu(menu,menuBridge.Snapshot.Settings);SelectMenuRow(menu,2);menu.Handle(MenuInput.Right);
                            if(!ApplyMenu(menu,menuBridge))throw new Exception("Native menu did not queue owned-output restoration");phase=6;}
                        else if(phase==6 && AudioState(d,true,.4,false,true)&&Convert.ToDouble(d["outputGain"])>.39999&&MenuSynchronized(menuBridge,d))phase=7;
                        else if(phase==7 && resumedBlocks>=12)
                        {OpenMenu(menu,menuBridge.Snapshot.Settings);SelectMenuRow(menu,10);menu.Handle(MenuInput.Accept);
                            if(!ApplyMenu(menu,menuBridge))throw new Exception("Native Reset Defaults did not reach the shared preference service");phase=8;}
                        else if(phase==8 && AudioState(d,true,1,true,false)&&(string)d["requestedQuality"]=="auto"&&(string)d["requestedAcceleration"]=="auto"&&
                            Convert.ToDouble(d["outputGain"])>.99999&&MenuSynchronized(menuBridge,d)){phase=9;completed=wall.Elapsed.TotalMilliseconds;}
                    }
                    if(wall.Elapsed.TotalMilliseconds>=nextUiRefresh){ui.RefreshStatus();nextUiRefresh=wall.Elapsed.TotalMilliseconds+1000;}
                    if(phase==9 && wall.Elapsed.TotalMilliseconds-completed>200)break;
                    Thread.Sleep(4);
                }
                if(phase!=9)throw new Exception("Actual producer did not acknowledge the external/native menu settings sequence; phase="+phase);
                if(acousticSettingsMonitor.Applied!=6)throw new Exception("Settings changes did not traverse the real background monitor exactly once");
                if(mutedBlocks<12||resumedBlocks<12||mutedEnergy>1e-18||resumedEnergy<1e-12||maximumStep>.02)throw new Exception("Native mute/restoration or bounded PCM transition failed");
                if(output!=null || ring.Peak<=0 || ring.UnderflowFrames!=0 || rejectedBlocks!=0 || receivedBlocks<20)throw new Exception("Device-free PCM handoff invariant failed");
            }
            catch(Exception e){producerError=e.GetType().Name+": "+e.Message;}
            finally
            {
                stop=true;SendControl("stop");if(child!=null&&!child.WaitForExit(2500)){child.Kill();child.WaitForExit(1000);producerError="Settings producer exceeded shutdown bound";}
                inputStop=true;inputSignal.Set();if(inputWriter!=null)inputWriter.Join(1000);if(reader!=null)reader.Join(1000);if(diagnostic!=null)diagnostic.Join(1000);
                if(acousticSettingsMonitor!=null)acousticSettingsMonitor.Dispose();if(menuBridge!=null)menuBridge.Dispose();if(ui!=null)ui.Dispose();
            }
            var generations=new HashSet<string>();Dictionary<string,object> final=null;int maximumPaths=0,mutedEmissionBlocks=0;
            lock(logLock)
            {
                foreach(string line in rendererLog)
                {
                    if(line.StartsWith("{\"type\":\"block\",",StringComparison.Ordinal))
                    {
                        var block=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=24}.DeserializeObject(line) as Dictionary<string,object>;
                        maximumPaths=Math.Max(maximumPaths,Convert.ToInt32(block["paths"]));
                        object settings;if(block.TryGetValue("acoustic",out settings)&&settings is Dictionary<string,object>){var a=(Dictionary<string,object>)settings;
                            if(a.ContainsKey("richAudioEnabled")&&!(bool)a["richAudioEnabled"]){mutedEmissionBlocks++;
                                if(!(bool)block["emitting"])producerError=producerError??"Owned output mute incorrectly stopped the source";}}
                        object raw;if(block.TryGetValue("sourceGenerations",out raw)&&raw is Dictionary<string,object>)
                            foreach(var pair in (Dictionary<string,object>)raw)generations.Add(pair.Key+":"+Convert.ToString(pair.Value,System.Globalization.CultureInfo.InvariantCulture));
                    }
                    if(line.StartsWith("{\"type\":\"final\",",StringComparison.Ordinal))final=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=24}.DeserializeObject(line) as Dictionary<string,object>;
                }
                WriteNew(Path.Combine(directory,"producer.txt"),string.Join(Environment.NewLine,rendererLog.ToArray()));
            }
            if(final==null || child.ExitCode!=0 || generations.Count!=1 || maximumPaths<=12 || mutedEmissionBlocks<12)producerError=producerError??"Real higher path capacity, source identity or clean shutdown not established";
            if(final!=null){var dsp=final["dsp"] as Dictionary<string,object>;var simulation=final["simulation"] as Dictionary<string,object>;
                if(dsp==null || simulation==null || Convert.ToInt64(dsp["limited"])!=0 || Convert.ToInt64(dsp["cursorResets"])!=0 || Convert.ToInt64(simulation["resets"])!=1)
                    producerError=producerError??"Quality transition reset history or violated PCM continuity";}
            var result=new Dictionary<string,object>{{"schemaVersion",1},{"deviceConstructed",output!=null},{"visibleWindowShown",false},
                {"changesAcknowledged",phase==9},{"nativeMenuModelApplied",phase==9},{"earlyReflectionsOffDirectOnly",phase==9},
                {"mutedBlocks",mutedBlocks},{"mutedEnergy",mutedEnergy},{"resumedEnergy",resumedEnergy},{"maximumAdjacentStep",maximumStep},
                {"emittingWhileMutedBlocks",mutedEmissionBlocks},
                {"sourceIdentities",generations.Count},{"maximumProcessedPaths",maximumPaths},{"receivedBlocks",receivedBlocks},{"peak",ring.Peak},
                {"underflowFrames",ring.UnderflowFrames},{"rejectedBlocks",rejectedBlocks},{"error",producerError},
                {"monitor",acousticSettingsMonitor.Metrics()}};
            WriteNew(Path.Combine(directory,"result.json"),json.Serialize(result));Console.WriteLine(json.Serialize(result));
            return producerError==null?0:1;
        }
        private static void OpenMenu(AcousticMenuModel menu,AcousticSettings settings)
        {menu.Open(new MenuPreferences(settings.Quality,settings.Acceleration,settings.RichAudioEnabled,settings.OutputLevel,settings.EarlyReflections,settings.DiagnosticsOverlay));}
        private static void SelectMenuRow(AcousticMenuModel menu,int row){for(int i=0;i<AcousticMenuModel.RowCount&&menu.SelectedIndex!=row;i++)menu.Handle(MenuInput.Down);}
        private static bool ApplyMenu(AcousticMenuModel menu,InGameSettingsBridge bridge)
        {
            SelectMenuRow(menu,9);if(menu.Handle(MenuInput.Accept)!=MenuAction.Apply)return false;var p=menu.Pending;var current=bridge.Snapshot;
            return bridge.TryApply(new AcousticSettings(p.Quality,p.Acceleration,Math.Max(1,current.SavedRevision),p.Enabled,p.OutputLevel,p.EarlyReflections,p.DiagnosticsOverlay),current.SavedRevision);
        }
        private static bool MenuSynchronized(InGameSettingsBridge bridge,Dictionary<string,object> d)
        {var current=bridge.Snapshot;return current.Available&&!current.Pending&&Convert.ToInt64(d["settingsRevision"])==current.SavedRevision;}
        private static bool AudioState(Dictionary<string,object> d,bool enabled,double level,bool early,bool overlay)
        {return d.ContainsKey("richAudioEnabled")&&(bool)d["richAudioEnabled"]==enabled&&Convert.ToDouble(d["outputLevel"])==level&&
            (bool)d["earlyReflections"]==early&&(bool)d["diagnosticsOverlay"]==overlay;}
    }
    public static class AcousticSettingsHandoff
    {
        [STAThread] public static int Main(string[] args){try{if(args.Length!=1)throw new ArgumentException("Repository root required");return HostProgram.SettingsHandoff(Path.GetFullPath(args[0]));}
            catch(Exception e){Console.Error.WriteLine(e);return 1;}}
    }
}
