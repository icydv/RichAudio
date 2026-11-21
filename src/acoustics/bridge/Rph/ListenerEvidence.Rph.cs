// Shared with device-free fixtures. Invoke only on the finalization worker:
// no filesystem work, serialization or thread joins run on the game fiber.
using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
using RichAudio.Beacon.Windows;

namespace RichAudio.Beacon.Rph
{
    internal static class ListenerEvidence
    {
        internal static bool Complete(StatePublisher writer,Func<string> sidecarPath,Action<string> report)
        {
            string stage="publisher-dispose";
            try
            {
                writer.Dispose();
                // Another finalizer may already own the idempotent Dispose.
                // Bound the wait for its worker before freezing the evidence.
                var wait=Stopwatch.StartNew();while(!writer.Finished&&wait.ElapsedMilliseconds<1000)Thread.Sleep(5);
                stage="publisher-evidence";
                bool finished=writer.Finished;
                var terminal=writer.Diagnostic??new TransportResult{
                    FirstFrame=writer.FirstFrame,FirstAcceptedFrame=writer.FirstAcceptedFrame,
                    StartupDiscarded=writer.StartupDiscarded,Transmitted=writer.Transmitted,
                    Connection=writer.Attempts,Stage="shutdown",Code="worker-not-finished",
                    Outcome="incomplete",Terminal=false,AnotherAttempt=false,HadAcceptedFrame=writer.Sent>0};
                string json=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=12}.Serialize(new{
                    schemaVersion=1,scope="listener-publisher-timings-and-counters-only",writerFinished=finished,
                    accepted=writer.Sent,transmitted=writer.Transmitted,replaced=writer.Replaced,
                    expiredBeforeEncoding=writer.ExpiredBeforeEncoding,expiredAfterEncoding=writer.ExpiredAfterEncoding,
                    firstPublishedSequence=writer.FirstPublishedSequence,firstTransmittedSequence=writer.FirstTransmittedSequence,
                    terminal=terminal});
                byte[] bytes=new UTF8Encoding(false,true).GetBytes(json);
                if(bytes.Length>16384)throw new InvalidDataException("Bounded listener evidence required");
                Report(report,"RichAudio listener publisher "+json);
                stage="publisher-evidence-path";
                var link=InGameSettingsLink.Load(sidecarPath());
                string target=AcousticSettingsStore.PrivatePath(link.WorkspaceRoot,".local/listener-publisher.json");
                InGameSettingsLink.LocalFile(target);
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                target=AcousticSettingsStore.PrivatePath(link.WorkspaceRoot,target);
                stage="publisher-evidence-write";
                // CreateNew preserves previous evidence. Failure never deletes,
                // replaces, retries or exports paths, payloads or capabilities.
                using(var file=new FileStream(target,FileMode.CreateNew,FileAccess.Write,FileShare.Read,4096,FileOptions.WriteThrough))
                {file.Write(bytes,0,bytes.Length);file.Flush(true);}
                return true;
            }
            catch(Exception e){Report(report,"RichAudio listener evidence unavailable stage="+stage+" exception="+e.GetType().Name);return false;}
        }
        private static void Report(Action<string> report,string message){try{if(report!=null)report(message);}catch{/* Evidence persistence remains independent of console availability. */}}
    }
}
