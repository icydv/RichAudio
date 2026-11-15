using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using RichAudio.NativeSuppression01;

// AUTOMATION_FIXTURES replaces only startup GTA identity/decorator binding.
// The real bounded IO worker, parser, durable barriers and automatic controller
// are used. Every game operation is an explicitly authored fake, not a live test.
internal static class DisposableBridge07
{
    static int Main(string[] args) {
        try {
            string root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);
            File.WriteAllText(Path.Combine(root,"RichAudio.NativeSuppression07.ini"),"Enabled=true");
            var bridge=new LocalBridge(root,root);var api=new TestAutomaticNative07.Api();AutomaticRun run=null;int token=500;
            long end=Stopwatch.GetTimestamp()+90*Stopwatch.Frequency;
            while(Stopwatch.GetTimestamp()<end) {
                if(bridge.Enabled&&run==null)run=new AutomaticRun(api,bridge,Stopwatch.GetTimestamp,Stopwatch.Frequency,()=>++token,bridge.Session);
                if(run!=null) {
                    RunCommand c;while(bridge.TryCommand(out c))bridge.Reply(c.Id,run.Command(c,bridge.Capture));
                    run.Tick(bridge.Capture);bridge.Publish(run.State);
                    if(run.State.Finished){Thread.Sleep(200);bridge.Close();Thread.Sleep(200);return 0;}
                }
                Thread.Sleep(10);
            }
            bridge.Close();return 2;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
