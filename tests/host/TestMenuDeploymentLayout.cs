using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;

class TestMenuDeploymentLayout
{
    static int checks;
    static void Check(bool ok,string name){checks++;if(!ok)throw new Exception(name);}
    static void Wait(Func<bool> test,string name){var clock=Stopwatch.StartNew();while(!test()&&clock.ElapsedMilliseconds<5000)Thread.Sleep(10);Check(test(),name);}
    static void Reject(Action action,string name){bool failed=false;try{action();}catch(ArgumentException){failed=true;}catch(IOException){failed=true;}catch(InvalidDataException){failed=true;}Check(failed,name);}
    static string Pointer(string workspace){return new JavaScriptSerializer().Serialize(new Dictionary<string,object>{{"schemaVersion",1},{"workspaceRoot",workspace},{"settingsPath",".local/acoustic-settings.json"},{"toggleKey","F10"},{"controllerEnabled",true}});}
    static void Safe(MenuDiagnostic d){Check(!d.Summary.Contains("\\")&&!d.Summary.Contains(":")&&!d.Summary.Contains("private-marker")&&d.Summary.Length<180,"safe bounded diagnostics");}
    static int Main(string[] args)
    {
        Process service=null;
        try{
            string root=Path.GetFullPath(args[0]),repo=Path.GetFullPath(args[1]);
            string game=Path.Combine(root,"game"),workspace=Path.Combine(root,"workspace"),exe=Path.Combine(game,"GTA5_Enhanced.exe");
            Directory.CreateDirectory(Path.Combine(game,"Plugins"));Directory.CreateDirectory(Path.Combine(workspace,".local"));File.WriteAllText(exe,"fixture only; never executed");
            string cacheAssembly=typeof(InGameSettingsLink).Assembly.Location;
            Check(Path.GetDirectoryName(cacheAssembly)==Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location),"real component assembly loaded beside fixture in cache");
            string legacy=Path.Combine(Path.GetDirectoryName(cacheAssembly),"RichAudio.Menu.json");
            Reject(()=>InGameSettingsLink.Load(legacy),"old assembly-relative sidecar resolution reproduces missing-file failure");
            string pointer=InGameSettingsLink.SidecarForGameExecutable(exe);
            Check(pointer==Path.Combine(game,"Plugins","RichAudio.Menu.json"),"resolver uses deployed game Plugins directory");
            Reject(()=>InGameSettingsLink.SidecarForGameExecutable("relative.exe"),"resolver rejects relative or wrong host");
            File.WriteAllText(pointer,Pointer(workspace));
            string prefs=Path.Combine(workspace,".local","acoustic-settings.json");
            var initial=new AcousticSettings("balanced","auto",1,true,1,true,true);File.WriteAllText(prefs,initial.Serialize());
            using(var bridge=new InGameSettingsBridge(pointer)){
                bridge.Start();Wait(()=>bridge.Snapshot.Available,"valid deployed pointer loads without audio host");
                Check(bridge.Snapshot.Settings.Quality=="balanced"&&bridge.Snapshot.Settings.DiagnosticsOverlay,"full saved preferences loaded");
                Check(bridge.Snapshot.StatusJson==null&&bridge.Snapshot.Diagnostic.Code=="loaded","preferences available while host state absent");
                Check(bridge.TryApply(initial.WithSelections("performance","cpu",1),1),"quality change accepted");
                Wait(()=>bridge.Snapshot.SavedRevision>1&&!bridge.Snapshot.Pending,"quality change persisted");
                Check(AcousticSettingsStore.Load(workspace,prefs).Quality=="performance","actual file contains quality change");
                string original=File.ReadAllText(prefs);File.WriteAllText(prefs,"{\"schemaVersion\":2,\"private-marker\":true}");
                Wait(()=>!bridge.Snapshot.Available&&bridge.Snapshot.Diagnostic.Stage=="preferences-schema","unsupported settings classified");
                Check(File.ReadAllText(prefs).Contains("private-marker"),"unsupported bytes preserved");Safe(bridge.Snapshot.Diagnostic);
                File.WriteAllText(prefs,original);Wait(()=>bridge.Snapshot.Available,"background worker recovers after valid settings return");
                File.WriteAllText(pointer,"{private-marker-invalid}");
                Wait(()=>!bridge.Snapshot.Available&&bridge.Snapshot.Diagnostic.Stage=="sidecar-schema","invalid sidecar classified");Safe(bridge.Snapshot.Diagnostic);
                File.WriteAllText(pointer,Pointer(workspace));Wait(()=>bridge.Snapshot.Available,"worker recovers after sidecar repair");
                File.Delete(pointer);Wait(()=>!bridge.Snapshot.Available&&bridge.Snapshot.Diagnostic.Code=="file-missing","missing sidecar classified");
                Check(bridge.Snapshot.Diagnostic.ExceptionType=="FileNotFoundException","precise classified exception");Safe(bridge.Snapshot.Diagnostic);
                File.WriteAllText(pointer,Pointer(workspace));Wait(()=>bridge.Snapshot.Available,"worker survives missing sidecar");
            }
            using(var reloaded=new InGameSettingsBridge(pointer)){reloaded.Start();Wait(()=>reloaded.Snapshot.Available,"worker reload");Check(reloaded.Snapshot.Settings.Quality=="performance","persisted quality reloaded");}
            File.Delete(prefs);
            using(var fresh=new InGameSettingsBridge(pointer)){
                fresh.Start();Wait(()=>fresh.Snapshot.Available,"missing preferences allow first-time configuration");
                Check(fresh.Snapshot.SavedRevision==0&&fresh.Snapshot.Diagnostic.Code=="defaults-unsaved","unsaved supported defaults distinguished");
                Check(fresh.TryApply(initial,0),"defaults can be saved");Wait(()=>fresh.Snapshot.SavedRevision>0,"first save completes");
            }
            service=new Process{StartInfo=new ProcessStartInfo{FileName="node.exe",Arguments="\""+Path.Combine(repo,"tools","soundmap","server.mjs")+"\" --root \""+workspace+"\" --port 0",WorkingDirectory=repo,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true}};
            Check(service.Start(),"actual SoundMap service started without host");
            Wait(()=>File.Exists(Path.Combine(workspace,".local","soundmap","service.json")),"private descriptor created");
            using(var recording=new InGameRecordingBridge(pointer))using(var prefsBridge=new InGameSettingsBridge(pointer)){
                recording.Start();prefsBridge.Start();Wait(()=>recording.Snapshot.Available&&prefsBridge.Snapshot.Available,"actual recorder service connected while host stopped");
                Check(!recording.Snapshot.Active&&prefsBridge.Snapshot.StatusJson==null,"connected recorder, idle recording and absent host remain separate");
                service.Kill();service.WaitForExit();Wait(()=>!recording.Snapshot.Available&&recording.Snapshot.Diagnostic.Code=="service-disconnected","recorder outage classified");
                Check(prefsBridge.Snapshot.Available,"recorder disconnection does not disable preferences");Safe(recording.Snapshot.Diagnostic);
            }
            Console.WriteLine("PASS: "+checks+" deployment-layout checks; actual .NET components, cached assembly, real SoundMap service, no GTA/audio endpoint.");return 0;
        }catch(Exception e){Console.Error.WriteLine("Deployment fixture failure: "+e.GetType().Name+" "+e.Message);return 1;}
        finally{if(service!=null){if(!service.HasExited){service.Kill();service.WaitForExit();}service.Dispose();}}
    }
}
