using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;

namespace RichAudio.Settings.Tests
{
    public static class SettingsTests
    {
        private static int checks;
        private static void Check(bool value,string message){checks++;if(!value)throw new Exception(message);}
        private static void Reject(Action action,string message){bool failed=false;try{action();}catch(ArgumentException){failed=true;}catch(InvalidDataException){failed=true;}catch(IOException){failed=true;}Check(failed,message);}
        [STAThread] public static int Main(string[] args)
        {
            try
            {
                if(args.Length!=1)throw new ArgumentException("Repository root required");
                string root=Path.Combine(Path.GetFullPath(args[0]),".local","settings-fixture-"+Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(root);string path=AcousticSettingsStore.DefaultPath(root),resolved;
                Check(AcousticSettingsStore.Resolve(root,null,null,null,out resolved)==null,"absent settings preserve the legacy launch");
                var selected=new AcousticSettings("quality","cpu",1);
                Check(selected.MenuToggleKey=="F10"&&AcousticSettings.Defaults(1).MenuToggleKey=="F10","legacy/default menu key remains F10");
                Check(!selected.AirflowEnabled&&selected.AirflowLevel==.35,"legacy engine-only default has no added airflow");
                var airflow=new AcousticSettings("balanced","auto",1,airflowEnabled:true,airflowLevel:.45);
                Check(AcousticSettings.Parse(airflow.Serialize()).SamePreferences(airflow),"airflow selection survives restart serialization");
                Check(airflow.WithRevision(2).AirflowEnabled&&airflow.WithSelections("max","cpu",2).AirflowLevel==.45&&airflow.WithAudio(false,.4,false,false).AirflowEnabled,"other controls retain airflow selection");
                Check(!airflow.SamePreferences(selected),"airflow edits count as preference changes");
                foreach(double bad in new[]{Double.NaN,Double.PositiveInfinity,-.1,1.1})Reject(delegate{new AcousticSettings("auto","cpu",1,airflowLevel:bad);},"invalid airflow level rejected");
                Reject(delegate{AcousticSettings.Parse(airflow.Serialize().Replace("\"airflowEnabled\":true","\"airflowEnabled\":1"));},"wrong attachment-independent airflow preference scalar rejected");
                Reject(delegate{AcousticSettings.Parse(airflow.Serialize().Replace("\"airflowLevel\":0.45","\"airflowLevel\":0.45,\"airflowLevel\":0.5"));},"duplicate airflow level rejected");
                var rebound=new AcousticSettings("quality","cpu",1,false,.35,false,true,"experimental-additive",true,"F7");
                Check(AcousticSettings.Parse(rebound.Serialize()).SamePreferences(rebound),"rebound menu key and all audio preferences survive serialization");
                Check(rebound.WithRevision(2).MenuToggleKey=="F7"&&rebound.WithSelections("balanced","auto",2).MenuToggleKey=="F7"&&rebound.WithAudio(true,.5,true,false).MenuToggleKey=="F7","background revisions, editor selections and audio updates retain the menu binding");
                Check(!rebound.SamePreferences(new AcousticSettings("quality","cpu",1,false,.35,false,true,"experimental-additive",true,"F9")),"menu-only changes count as changed preferences");
                Check(AcousticSettings.Parse("{\"schemaVersion\":1,\"revision\":1,\"acousticQuality\":\"auto\",\"acousticAcceleration\":\"auto\"}").MenuToggleKey=="F10","old four-field preferences retain usable default binding");
                foreach(string bad in new[]{"Escape","F4","Enter","W","Ctrl+F7",""})
                    Check(AcousticSettings.Parse(rebound.Serialize().Replace("\"F7\"","\""+bad+"\"")).MenuToggleKey=="F10","reserved or invalid persisted key falls back safely");
                Check(AcousticSettings.Parse(rebound.Serialize().Replace("\"F7\"","9")).MenuToggleKey=="F10","wrong key scalar falls back without discarding validated audio preferences");
                Check(AcousticSettings.Parse(rebound.Serialize().Replace("\"F7\"","\" f9 \"")).MenuToggleKey=="F9","case and whitespace normalize to a supported binding");
                Reject(delegate{AcousticSettings.Parse(rebound.Serialize().Replace("\"menuToggleKey\":\"F7\"","\"menuToggleKey\":\"F7\",\"menuToggleKey\":\"F9\""));},"duplicate menu key remains rejected");
                string reboundPath=Path.Combine(root,".local","rebound.json");AcousticSettingsStore.Save(root,reboundPath,rebound);
                Check(AcousticSettingsStore.Load(root,reboundPath).MenuToggleKey=="F7","selected menu key is persisted for subsequent launches");
                Check(selected.ProducerArguments()==" --acoustic-quality quality --acoustic-acceleration cpu","actual producer argument contract");
                var command=new JavaScriptSerializer().DeserializeObject(selected.ControlMessage()) as Dictionary<string,object>;
                Check((string)command["type"]=="acoustic-settings"&&(string)command["quality"]=="quality"&&(string)command["acceleration"]=="cpu","actual live control contract");
                AcousticSettingsStore.Save(root,path,selected);var loaded=AcousticSettingsStore.Load(root,path);
                Check(loaded.Quality=="quality"&&loaded.Acceleration=="cpu"&&loaded.Revision==1,"atomic settings persist and reload");
                byte[] bytes=File.ReadAllBytes(path);Check(bytes[0]==(byte)'{'&&bytes[bytes.Length-1]==(byte)'}',"persisted JSON has no BOM or partial frame");
                string concurrent=Path.Combine(Path.GetDirectoryName(path),"reader-settings.json");AcousticSettingsStore.Save(root,concurrent,selected);
                using(var held=new FileStream(concurrent,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))
                {AcousticSettingsStore.Save(root,concurrent,new AcousticSettings("max","gpu",2));Check(AcousticSettingsStore.Load(root,concurrent).Revision==2,"atomic update coexists with live readers");
                    using(var old=new StreamReader(held,Encoding.UTF8)){Check(AcousticSettings.Parse(old.ReadToEnd()).Revision==1,"existing reader retains a complete previous snapshot");}}
                Check(AcousticSettingsStore.Resolve(root,null,null,null,out resolved).Quality=="quality","next launch automatically uses persisted selection");
                Check(AcousticSettingsStore.ResolveForLaunch(root,null,null,null,true,out resolved)==null,"saved incremental preferences do not disable the existing known-WAV path");
                Reject(delegate{AcousticSettingsStore.ResolveForLaunch(root,null,"quality",null,true,out resolved);},"explicit processing selection cannot pretend to reprocess a known WAV");
                Check(AcousticSettingsStore.Resolve(root,null,"max","gpu",out resolved).Acceleration=="gpu","explicit CLI combination reaches selected settings");
                Reject(delegate{new AcousticSettings("ultra","gpu",1);},"unknown quality rejected");
                Reject(delegate{new AcousticSettings("quality","pretend-gpu",1);},"unknown acceleration rejected");
                Reject(delegate{new AcousticSettings("quality","gpu",9007199254740992L);},"unsafe revision rejected");
                Reject(delegate{AcousticSettings.Parse(selected.Serialize().Replace("\"quality\"","false"));},"wrong JSON scalar rejected");
                Reject(delegate{AcousticSettings.Parse(selected.Serialize().Replace("\"revision\":1","\"revision\":1.5"));},"fractional revision rejected");
                Reject(delegate{AcousticSettings.Parse(selected.Serialize().Replace("\"schemaVersion\":1","\"schemaVersion\":1,\"schemaVersion\":1"));},"duplicate key rejected");
                Reject(delegate{AcousticSettings.Parse(selected.Serialize().Replace("\"revision\":1","\"revision\":1,\"unexpected\":true"));},"unknown key rejected");
                Reject(delegate{AcousticSettingsStore.PrivatePath(root,Path.Combine(root,"public.json"));},"public settings destination rejected");
                Reject(delegate{AcousticSettingsStore.Save(root,path,selected);},"stale revision cannot overwrite newer settings");
                Check(File.ReadAllText(path)==selected.Serialize(),"rejected write preserves original bytes");
                File.WriteAllText(path,"{broken");Reject(delegate{AcousticSettingsStore.Load(root,path);},"corrupt persisted settings fail closed");
                Reject(delegate{AcousticSettingsStore.Save(root,path,new AcousticSettings("max","gpu",2));},"unexpected file is preserved rather than repaired");
                Check(File.ReadAllText(path)=="{broken","corrupt original preserved");
                File.WriteAllText(path,selected.Serialize());var applied=new List<AcousticSettings>();
                string status=AcousticSettingsStore.StatusPath(path);
                using(var overridden=new AcousticSettingsMonitor(root,path,new AcousticSettings("max","gpu",1),applied.Add))
                {overridden.PollOnce();Check(overridden.Rejected==0&&applied.Count==0,"CLI startup override is not rejected by the unchanged persisted file");}
                File.Delete(status); // Only this test's own stopped-status record.
                using(var monitor=new AcousticSettingsMonitor(root,path,selected,applied.Add))
                {
                    AcousticSettingsStore.Save(root,path,new AcousticSettings("max","gpu",2));monitor.PollOnce();
                    Check(applied.Count==1&&applied[0].Quality=="max"&&applied[0].Acceleration=="gpu","background monitor forwards new selections without restarting a host");
                    monitor.PollOnce();Check(applied.Count==1,"unchanged file does not duplicate controls");
                    File.WriteAllText(path,new AcousticSettings("balanced","auto",1).Serialize());monitor.PollOnce();
                    Check(monitor.Rejected==1&&applied.Count==1,"reordered settings do not replace the current selection");
                    File.WriteAllText(path,new AcousticSettings("max","gpu",2).Serialize());
                    monitor.PollOnce();Check(monitor.LastError==null&&applied.Count==1,"restored unchanged valid settings clear the file error without reapplying");
                    monitor.PublishStatus("{\"type\":\"acoustic-settings-status\",\"requestedQuality\":\"max\",\"activeQuality\":\"quality\",\"pathBudget\":32,\"requestedAcceleration\":\"gpu\",\"activeAcceleration\":\"cpu\",\"gpuCapability\":false,\"gpuDevice\":null,\"fallbackReason\":\"fixture-unsupported\"}");
                    Check(!File.Exists(status),"diagnostic receipt is a mailbox with no synchronous file write");monitor.PollOnce();
                    string presentation=StatusPresentation.Render(File.ReadAllText(status),DateTime.UtcNow);
                    Check(presentation.Contains("actual backend: cpu")&&presentation.Contains("fixture-unsupported")&&presentation.Contains("quality"),"actual fallback and active quality displayed independently of requested GPU/Max");
                    Check(StatusPresentation.Render(File.ReadAllText(status),DateTime.UtcNow.AddSeconds(4)).Contains("stale"),"stale status is not reported as active GPU");
                }
                Check(StatusPresentation.Render(File.ReadAllText(status),DateTime.UtcNow).Contains("Host stopped"),"normal host closure marks backend unavailable");
                Check(StatusPresentation.Render(null,DateTime.UtcNow).Contains("unavailable"),"offline editor invents no active backend");
                Check(StatusPresentation.Render("{}",DateTime.UtcNow).Contains("Invalid"),"invalid status does not imply GPU activity");
                using(var window=new AcousticSettingsWindow(root,path))
                {
                    Check(window.QualitySelector.Maximum==4&&window.AccelerationSelector.Items.Count==3,"real UI has five slider positions and independent acceleration selector");
                    window.QualitySelector.Value=3;window.AccelerationSelector.SelectedIndex=1;window.SaveSelection();
                    loaded=AcousticSettingsStore.Load(root,path);Check(loaded.Quality=="quality"&&loaded.Acceleration=="cpu"&&loaded.Revision>2,"actual slider Save persists its selected combination");
                    Check(window.DiagnosticsText.Contains("unavailable"),"UI does not claim a selected backend is running while host stopped");
                    foreach(int[] pair in new[]{new[]{0,0},new[]{1,2},new[]{2,0},new[]{3,1},new[]{4,2}})
                    {
                        window.QualitySelector.Value=pair[0];window.AccelerationSelector.SelectedIndex=pair[1];window.SaveSelection();loaded=AcousticSettingsStore.Load(root,path);
                        Check(loaded.Quality==AcousticSettings.Qualities[pair[0]]&&loaded.Acceleration==AcousticSettings.Accelerations[pair[1]],"every slider position persists independently of acceleration");
                    }
                }
                Check(Directory.GetFiles(Path.GetDirectoryName(path),"*.tmp").Length==0,"successful atomic publication leaves no temporary files");
                Console.WriteLine("PASS: "+checks+" acoustic settings persistence, actual UI controls and host-monitor checks; no window shown, game or audio endpoint opened.");return 0;
            }
            catch(Exception e){Console.Error.WriteLine(e);return 1;}
        }
    }
}
