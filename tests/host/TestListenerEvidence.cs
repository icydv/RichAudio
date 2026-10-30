using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Rph;
using RichAudio.Beacon.Transport;

internal static class TestListenerEvidence
{
    private static void Check(bool test,string message){if(!test)throw new Exception(message);}
    private static void Until(Func<bool> test){var watch=Stopwatch.StartNew();while(!test()&&watch.ElapsedMilliseconds<2500)Thread.Sleep(5);Check(test(),"bounded fixture wait");}
    public static int Main(string[] args)
    {
        try{
            string root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);
            string sidecar=Path.Combine(root,"menu.json");
            File.WriteAllText(sidecar,new JavaScriptSerializer().Serialize(new{schemaVersion=1,workspaceRoot=root,settingsPath=".local/acoustic-settings.json",toggleKey="F10",controllerEnabled=true}));
            string name="RichAudio.Evidence."+Guid.NewGuid().ToString("N");
            var lines=new List<string>();bool saved=false;int reportedThread=0,mainThread=Thread.CurrentThread.ManagedThreadId;
            using(var server=new StatePipeServer(name,null))using(var writer=new StatePublisher(name)){
                server.Start();writer.Start();var original=Protocol.Synthetic(new string('a',32),0,0);writer.Publish(original);Until(()=>writer.Sent==1);
                writer.RequestStop();
                var finalizer=new Thread(delegate(){saved=ListenerEvidence.Complete(writer,()=>sidecar,delegate(string message){reportedThread=Thread.CurrentThread.ManagedThreadId;lines.Add(message);});});
                finalizer.Start();Check(finalizer.Join(2500)&&saved,"background evidence write");Until(()=>server.Finished);
                Check(writer.Finished&&reportedThread!=mainThread,"writer join or background evidence");
                string target=Path.Combine(root,".local","listener-publisher.json"),text=File.ReadAllText(target);
                Check(text.Contains("\"writerFinished\":true")&&text.Contains("\"FirstFrame\":{")&&text.Contains("\"FirstAcceptedFrame\":{")&&text.Contains("\"StartupDiscarded\":0")&&text.Contains("deliberate-stop"),"terminal timing evidence incomplete");
                var savedEvidence=(Dictionary<string,object>)new JavaScriptSerializer().DeserializeObject(text);
                var savedTerminal=(Dictionary<string,object>)savedEvidence["terminal"];
                foreach(string field in new[]{"FirstFrame","FirstAcceptedFrame"}){
                    var timing=(Dictionary<string,object>)savedTerminal[field];
                    Check(Convert.ToInt64(timing["ObservationTicks"])==original.ObservationTicks&&Convert.ToInt64(timing["ClockFrequency"])==original.ClockFrequency,"saved original QPC changed");
                }
                Check(!text.Contains(new string('a',32))&&!text.Contains("position")&&!text.Contains("velocity")&&!text.Contains("token")&&!text.Contains(root),"private payload leaked");
                Check(new FileInfo(target).Length<=16384&&lines.Count==1,"evidence bounds");
                Check(!ListenerEvidence.Complete(writer,()=>sidecar,lines.Add)&&File.ReadAllText(target)==text,"prior evidence overwritten");
                Check(lines[lines.Count-1].Contains("publisher-evidence-write")&&!lines[lines.Count-1].Contains(root),"write error disclosure");
                string invalid=Path.Combine(root,"invalid.json");File.WriteAllText(invalid,"{\"token\":\"PRIVATE-CAPABILITY\"}");
                Check(!ListenerEvidence.Complete(writer,()=>invalid,lines.Add),"invalid settings link accepted");
                Check(!String.Join("\n",lines.ToArray()).Contains("PRIVATE-CAPABILITY"),"invalid sidecar contents leaked");
                string another=Path.Combine(root,"console-unavailable");Directory.CreateDirectory(another);string otherSidecar=Path.Combine(another,"menu.json");
                File.WriteAllText(otherSidecar,new JavaScriptSerializer().Serialize(new{schemaVersion=1,workspaceRoot=another,settingsPath=".local/acoustic-settings.json",toggleKey="F10",controllerEnabled=true}));
                Check(ListenerEvidence.Complete(writer,()=>otherSidecar,delegate{throw new Exception("console offline");})&&File.Exists(Path.Combine(another,".local","listener-publisher.json")),"console failure prevented file evidence");
            }
            Console.WriteLine("{\"suite\":\"listener-publisher-evidence\",\"passed\":7,\"failed\":0,\"liveGta\":false,\"endpointConstructed\":false}");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
