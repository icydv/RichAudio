using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using RichAudio.NativeSuppression01;
internal static class DisposableFocus08 {
    [STAThread] public static void Main(string[] args) {
        string root=args[0],mode=args[1];Directory.CreateDirectory(root);
        var form=new Form {Text="RichAudio owned focus fixture "+mode,Width=380,Height=120};
        form.Controls.Add(new Label {Text="Disposable offline focus fixture; no GTA or OBS",Dock=DockStyle.Fill});
        var end=new Timer {Interval=25000};end.Tick+=delegate{form.Close();};end.Start();
        LocalBridge bridge=null;AutomaticRun run=null;Timer ticks=null;
        if(mode!="obs") {
            File.WriteAllText(Path.Combine(root,"RichAudio.NativeSuppression08.ini"),"Enabled=true");
            bridge=new LocalBridge(root,root);var api=new TestAutomaticNative08.Api();int token=10;
            run=new AutomaticRun(api,bridge,Stopwatch.GetTimestamp,Stopwatch.Frequency,()=>++token,bridge.Session);
            ticks=new Timer {Interval=50};ticks.Tick+=delegate{run.Tick(bridge.Capture);bridge.Publish(run.State);};ticks.Start();
            form.Deactivate+=delegate{if(mode=="pause-background")api.Frozen=true;if(mode=="stale-background")ticks.Stop();};
            form.Activated+=delegate{api.Frozen=false;ticks.Start();};
        }
        Application.Run(form);if(ticks!=null)ticks.Stop();if(bridge!=null)bridge.Close();
    }
}
