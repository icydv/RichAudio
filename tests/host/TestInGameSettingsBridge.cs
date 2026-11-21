using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;

namespace RichAudio.Settings.Tests
{
    public static class InGameSettingsBridgeTests
    {
        private static int checks;
        private static readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=20};
        private static void Check(bool value,string label){checks++;if(!value)throw new Exception(label);}
        private static void Reject(Action action,string label){bool rejected=false;try{action();}catch(ArgumentException){rejected=true;}catch(InvalidDataException){rejected=true;}catch(IOException){rejected=true;}Check(rejected,label);}
        private static void Wait(Func<bool> predicate,string label){var watch=Stopwatch.StartNew();while(!predicate()&&watch.ElapsedMilliseconds<3000)Thread.Sleep(5);Check(predicate(),label);}
        private static string Link(string root,string relative,string key="F10",bool controller=true)
        {return json.Serialize(new Dictionary<string,object>{{"schemaVersion",1},{"workspaceRoot",root},{"settingsPath",relative},{"toggleKey",key},{"controllerEnabled",controller}});}
        [STAThread] public static int Main(string[] args)
        {
            try
            {
                if(args.Length!=1)throw new ArgumentException("Repository root required");string root=Path.GetFullPath(args[0]);
                string relative=Path.Combine(".local","menu-bridge-fixture-"+Guid.NewGuid().ToString("N")),dir=Path.Combine(root,relative);
                Directory.CreateDirectory(dir);string prefsRelative=Path.Combine(relative,"preferences.json"),prefs=Path.Combine(root,prefsRelative),pointer=Path.Combine(dir,"RichAudio.Menu.json");
                var legacy=AcousticSettings.Parse("{\"schemaVersion\":1,\"revision\":1,\"acousticQuality\":\"quality\",\"acousticAcceleration\":\"cpu\"}");
                Check(legacy.RichAudioEnabled&&legacy.OutputLevel==1&&legacy.EarlyReflections&&!legacy.DiagnosticsOverlay,"old v1 files retain the calibrated profile defaults");
                var audio=new AcousticSettings("max","cpu",2,false,.35,false,true);
                Check(AcousticSettings.Parse(audio.Serialize()).SamePreferences(audio),"all six preferences persist and validate");
                Check(audio.ProducerArguments().Contains("--rich-audio-enabled false")&&audio.ProducerArguments().Contains("--rich-audio-output-level 0.35")&&
                    audio.ProducerArguments().Contains("--early-reflections false")&&audio.ProducerArguments().Contains("--acoustic-diagnostics-overlay true"),"actual producer arguments carry supported audio controls invariantly");
                var control=json.DeserializeObject(audio.ControlMessage()) as Dictionary<string,object>;
                Check((bool)control["richAudioEnabled"]==false&&(bool)control["earlyReflections"]==false&&(bool)control["diagnosticsOverlay"]&&Convert.ToDouble(control["outputLevel"])==.35,"host live control retains all supported preferences");
                Reject(delegate{AcousticSettings.Parse(audio.Serialize().Replace("\"outputLevel\":0.35","\"outputLevel\":true"));},"boolean output level rejected");
                Reject(delegate{AcousticSettings.Parse(audio.Serialize().Replace("\"earlyReflections\":false","\"earlyReflections\":false,\"earlyReflections\":true"));},"duplicate optional preference rejected");
                Reject(delegate{AcousticSettings.Parse(audio.Serialize().Replace("\"outputLevel\":0.35","\"outputLevel\":1.01"));},"output cannot exceed calibrated profile");
                Reject(delegate{AcousticSettings.Parse(audio.Serialize().Replace("\"earlyReflections\":false","\"earlyReflections\":false,\"doppler\":false"));},"unsupported Doppler toggle is never silently persisted");
                AcousticSettingsStore.SaveExpected(root,prefs,legacy,0);AcousticSettingsStore.SaveExpected(root,prefs,audio,1);
                Reject(delegate{AcousticSettingsStore.SaveExpected(root,prefs,legacy.WithRevision(3),1);},"compare-and-save rejects a stale editor even with a larger proposed revision");
                Check(AcousticSettingsStore.Load(root,prefs).SamePreferences(audio),"CAS rejection preserves the external editor's audio preferences");
                using(var editor=new AcousticSettingsWindow(root,prefs))
                {editor.QualitySelector.Value=2;editor.AccelerationSelector.SelectedIndex=0;editor.SaveSelection();var saved=AcousticSettingsStore.Load(root,prefs);
                    Check(!saved.RichAudioEnabled&&saved.OutputLevel==.35&&!saved.EarlyReflections&&saved.DiagnosticsOverlay,"external quality editor preserves all four newer preferences");}
                File.WriteAllText(pointer,Link(root,prefsRelative));var link=InGameSettingsLink.Load(pointer);
                Check(link.SettingsPath==prefs&&link.ToggleKey=="F10"&&link.ControllerEnabled,"validated menu pointer scopes the common settings file");
                File.WriteAllText(pointer,Link(root,prefsRelative,"F4"));Reject(delegate{InGameSettingsLink.Load(pointer);},"default RPH console shortcut is not reserved by the menu");
                File.WriteAllText(pointer,Link(root,"../public.json"));Reject(delegate{InGameSettingsLink.Load(pointer);},"menu pointer cannot escape private storage");
                File.WriteAllText(pointer,Link("\\\\unavailable\\share",prefsRelative));Reject(delegate{InGameSettingsLink.Load(pointer);},"remote workspace paths are rejected");
                File.WriteAllText(pointer,Link(root,prefsRelative).Replace("\"schemaVersion\":1","\"schemaVersion\":1,\"schemaVersion\":1"));
                Reject(delegate{InGameSettingsLink.Load(pointer);},"duplicate pointer fields rejected");
                using(var missing=new InGameSettingsBridge(Path.Combine(dir,"missing-menu.json")))
                {missing.Start();Wait(()=>!missing.Snapshot.Available&&missing.Snapshot.Error.Contains("unavailable"),"missing pointer is shown unavailable");Check(!missing.TryResetDefaults(0),"missing pointer never pretends to save");missing.RequestStop();}
                string freshRelative=Path.Combine(relative,"fresh-preferences.json"),fresh=Path.Combine(root,freshRelative);File.WriteAllText(pointer,Link(root,freshRelative));
                using(var bridge=new InGameSettingsBridge(pointer))
                {
                    bridge.Start();Wait(()=>bridge.Snapshot.Available,"valid pointer works without a host or existing preferences");
                    Check(bridge.Snapshot.SavedRevision==0&&bridge.Snapshot.Settings.SamePreferences(AcousticSettings.Defaults(1)),"missing preferences display explicit defaults with an unsaved revision");
                    Check(bridge.TryApply(audio,0),"game-fiber API queues a preference save without filesystem waiting");
                    {var queued=bridge.Snapshot;Check(queued.Pending||queued.SavedRevision>0||queued.Error!=null,"accepted operation cannot look complete before publication");}
                    Check(!bridge.TryApply(legacy,0),"single pending slot rejects a second unacknowledged update");
                    Wait(()=>bridge.Snapshot.SavedRevision>0&&!bridge.Snapshot.Pending,"off-fiber save acknowledgement becomes available");
                    Check(AcousticSettingsStore.Load(root,fresh).SamePreferences(audio)&&bridge.Snapshot.StatusJson==null,"host-absent preference persistence is genuine and status remains unknown");
                    var old=bridge.Snapshot;var external=old.Settings.WithSelections("quality","gpu",old.SavedRevision+1);
                    AcousticSettingsStore.SaveExpected(root,fresh,external,old.SavedRevision);bridge.TryApply(legacy,old.SavedRevision);
                    Wait(()=>bridge.Snapshot.SavedRevision==external.Revision&&!bridge.Snapshot.Pending,"concurrent editor changes are reloaded");
                    Check(AcousticSettingsStore.Load(root,fresh).SamePreferences(external),"stale in-game draft does not overwrite newer external values");
                    long revision=bridge.Snapshot.SavedRevision;Check(bridge.TryResetDefaults(revision),"Reset Defaults queues the same real preference transaction");
                    Wait(()=>bridge.Snapshot.SavedRevision>revision&&!bridge.Snapshot.Pending,"Reset Defaults persists off-fiber");
                    Check(bridge.Snapshot.Settings.SamePreferences(AcousticSettings.Defaults(1)),"Reset Defaults restores all six settings without starting a host");
                    string status=AcousticSettingsStore.StatusPath(fresh);
                    string stale=json.Serialize(new Dictionary<string,object>{{"schemaVersion",1},{"hostSession",new string('a',32)},{"hostState","running"},
                        {"recordedAtUtc",DateTime.UtcNow.AddSeconds(-5).ToString("o")},{"status",new Dictionary<string,object>{{"type","acoustic-settings-status"},
                            {"requestedQuality","quality"},{"activeQuality","quality"},{"requestedAcceleration","gpu"},{"activeAcceleration","cpu"},
                            {"gpuResultsApplied",0},{"fallbackReason","fixture-unsupported"},{"pathBudget",32}}}});
                    File.WriteAllText(status,stale);Wait(()=>bridge.Snapshot.StatusJson==stale,"status mailbox preserves the original producer timestamp");
                    Check(StatusPresentation.Render(bridge.Snapshot.StatusJson,DateTime.UtcNow).Contains("stale"),"expired host status is not refreshed by the menu's filesystem polling");
                    string malformedOwn="{\"schemaVersion\":1,\"revision\":5,\"acousticQuality\":\"quality\",\"acousticAcceleration\":";
                    File.WriteAllText(fresh,malformedOwn);Wait(()=>!bridge.Snapshot.Available,"malformed preferences leave the game/menu safe and unavailable");
                    Check(File.ReadAllText(fresh)==malformedOwn&&bridge.Snapshot.ResetAvailable,"recognizable malformed own bytes remain unchanged until an explicit recoverable reset");
                    long beforeRecovery=bridge.Snapshot.SavedRevision;Check(bridge.TryResetDefaults(beforeRecovery),"explicit Reset Defaults queues bounded malformed-config recovery");
                    {var queued=bridge.Snapshot;Check(queued.Pending||queued.SavedRevision>beforeRecovery,"reset remains pending even while the prior snapshot has an error");}
                    Wait(()=>bridge.Snapshot.Available&&bridge.Snapshot.SavedRevision>beforeRecovery,"malformed-config reset restores working defaults in game");
                    string[] backups=Directory.GetFiles(Path.GetDirectoryName(fresh),Path.GetFileName(fresh)+".invalid-*.json");
                    Check(backups.Length==1&&File.ReadAllText(backups[0])==malformedOwn&&bridge.Snapshot.Settings.SamePreferences(AcousticSettings.Defaults(1)),"reset preserves exact invalid bytes in a fresh sibling backup");
                    string future=bridge.Snapshot.Settings.Serialize().Replace("\"schemaVersion\":1","\"schemaVersion\":2");File.WriteAllText(fresh,future);
                    Wait(()=>!bridge.Snapshot.Available&&!bridge.Snapshot.ResetAvailable,"unsupported future preferences fail closed without destructive downgrade");
                    Check(!bridge.TryResetDefaults(bridge.Snapshot.SavedRevision)&&File.ReadAllText(fresh)==future,"unsupported future-format bytes remain preserved");
                    var restored=AcousticSettings.Defaults(revision=DateTime.UtcNow.Ticks/10000);File.WriteAllText(fresh,restored.Serialize());
                    Wait(()=>bridge.Snapshot.Available&&bridge.Snapshot.SavedRevision==revision,"valid restored settings recover without a plugin restart");
                    File.WriteAllText(pointer,Link(root,freshRelative,"F11",false));Wait(()=>bridge.Snapshot.ToggleKey=="F11"&&!bridge.Snapshot.ControllerEnabled,"validated shortcut/controller preferences refresh off-fiber");
                    File.WriteAllText(pointer,Link(root,Path.Combine(relative,"other.json")));Wait(()=>!bridge.Snapshot.Available,"changed pointer scope is rejected for the current plugin lifetime");
                    Check(!File.Exists(Path.Combine(dir,"other.json")),"scope change creates no unexpected settings file");
                    bridge.RequestStop();Check(!bridge.TryApply(legacy,revision),"unload rejects new preference requests without waiting");
                }
                string conflict=Path.Combine(dir,"reset-conflict.json"),digest;File.WriteAllText(conflict,"{\"schemaVersion\":1,\"acousticQuality\":false,\"acousticAcceleration\":");
                Check(AcousticSettingsStore.TryMalformedRecovery(root,conflict,out digest),"malformed recovery binds its exact observed bytes");
                File.WriteAllText(conflict,"{changed-elsewhere");
                Reject(delegate{AcousticSettingsStore.RecoverDefaults(root,conflict,digest,0);},"stale malformed-config reset cannot replace newer external bytes");
                Check(File.ReadAllText(conflict)=="{changed-elsewhere"&&Directory.GetFiles(dir,"reset-conflict.json.invalid-*.json").Length==0,"hash-CAS reset rejection preserves external bytes without misleading backup");
                string unrelated=Path.Combine(dir,"unrelated.json");
                foreach(string text in new[]{"{\"unrelated\":\"data\"}","plain unrelated text","{\"unrelated\":{\"schemaVersion\":1,\"acousticQuality\":false,\"acousticAcceleration\":false}}",
                    "{\"schemaVersion\":2,\"acousticQuality\":\"auto\",\"acousticAcceleration\":\"cpu\"}","{\"schemaVersion\":1,\"schemaVersion\":1,\"acousticQuality\":false,\"acousticAcceleration\":false}"})
                {File.WriteAllText(unrelated,text);Check(!AcousticSettingsStore.TryMalformedRecovery(root,unrelated,out digest),"unrelated, ambiguous or future-format bytes cannot be recovered as own v1 preferences");
                    Check(File.ReadAllText(unrelated)==text,"unrecognized bytes remain untouched");}
                byte[] binary={255,254,0,1};File.WriteAllBytes(unrelated,binary);
                Check(!AcousticSettingsStore.TryMalformedRecovery(root,unrelated,out digest)&&File.ReadAllBytes(unrelated).Length==binary.Length,"invalid UTF-8 is not identified as this application's malformed settings");
                Console.WriteLine("PASS: "+checks+" native-menu configuration, off-fiber persistence, CAS, reset and stale-status checks; no GTA, visible menu or audio endpoint.");return 0;
            }
            catch(Exception e){Console.Error.WriteLine(e);return 1;}
        }
    }
}
