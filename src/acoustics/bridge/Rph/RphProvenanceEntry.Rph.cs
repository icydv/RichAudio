#if SHV_PROVENANCE_10
using System;
using System.Diagnostics;
using System.Reflection;
using System.Threading;
using Rage;
using Rage.Attributes;
using P=RichAudio.Beacon.Provenance.RphRuntimeProvenance;
using RichAudio.Beacon.Provenance;

[assembly:Plugin("RichAudio",Author="RichAudio",Description="PLAYABLE-10 runtime provenance measurement only. No ASI, handoff, gameplay or audio.",EntryPoint="RichAudio.Beacon.Rph.RphProvenanceEntry.Main",ExitPoint="RichAudio.Beacon.Rph.RphProvenanceEntry.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
namespace RichAudio.Beacon.Rph
{
    public static class RphProvenanceEntry
    {
        static int used;static volatile bool stopping;
        public static void Main()
        {
            if(Interlocked.CompareExchange(ref used,1,0)!=0)return;
            try{
                Game.LogTrivial("RichAudio PLAYABLE-10 diagnostic only; no source attachment, ASI, gameplay or audio.");
                RphProvenanceBootstrap.Configuration config=null;string reason="diagnostic-lease-absent";
                long deadline=Stopwatch.GetTimestamp()+Stopwatch.Frequency*60;
                while(!stopping&&Stopwatch.GetTimestamp()<deadline){
                    if(RphProvenanceBootstrap.TryLoad(out config,out reason))break;
                    if(reason!="diagnostic-lease-absent")throw new System.IO.InvalidDataException(reason);
                    GameFiber.Sleep(50);
                }
                if(stopping||config==null)throw new System.IO.InvalidDataException("diagnostic-lease-not-acquired");
                RphProvenanceBootstrap.VerifyInstalledScope();
                var launcher=new P.LauncherPolicy(RphProvenanceBuildPolicy.LauncherPath,RphProvenanceBuildPolicy.LauncherSha256,
                    RphProvenanceBuildPolicy.LauncherBytes,RphProvenanceBuildPolicy.LauncherVersion);
                var runtime=P.ApiRuntimePolicy.Unreviewed("Actual installed API runtime identity has not been independently authenticated; measurement cannot approve it.");
                var context=new P.SessionContext(RphProvenanceBuildPolicy.WorkspaceRoot,config.SessionId,config.SessionId,config.ProcessId,
                    config.CreationFileTime,RphProvenanceBuildPolicy.GamePath,typeof(RphProvenanceEntry).Assembly,config.CallerSha256,RphProvenanceBuildPolicy.FixturePolicy);
                var result=P.CaptureAndWrite(typeof(Game).Assembly,launcher,runtime,context);
                // No branch can advance to a source: this image does not contain
                // a source module, gameplay publisher, menu or audio lifecycle.
                Game.LogTrivial("RichAudio PLAYABLE-10 terminal="+result.TerminalReason+" reportWritten="+result.ReportWritten
                    +" reportBytes="+result.ReportBytes+" reportSha256="+result.ReportSha256+" provenanceMatched="+result.ProvenanceMatched
                    +" SourceAllowed="+result.SourceAllowed+" HandoffAllowed="+result.HandoffAllowed+" AudioAllowed="+result.AudioAllowed);
            }catch(ThreadAbortException){throw;}
            catch(Exception e){Game.LogTrivial("RichAudio PLAYABLE-10 diagnostic failed before a completed report: "+e.GetType().Name+":"+(e is System.IO.InvalidDataException?e.Message:"unobserved-details")+". No source or audio; no retry.");}
        }
        public static void OnUnload(){stopping=true;}
    }
}
#endif
