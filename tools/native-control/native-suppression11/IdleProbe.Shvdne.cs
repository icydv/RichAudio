using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using GTA;
using GTA.Native;

[assembly:System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.8")]
[assembly:System.Reflection.AssemblyVersion("0.11.0.0")]
namespace RichAudio.NativeSuppression01
{
    public sealed class IdleProbe : Script
    {
        readonly LocalBridge bridge;
        AutomaticRun run;bool aborted;volatile bool emergencyRequested;
        public IdleProbe() {
            Interval=0;bridge=new LocalBridge(Path.GetDirectoryName(Filename),Candidate.ExecutionDirectory);
            Tick+=OnTick;KeyDown+=OnKey;
            Aborted+=delegate {aborted=true;if(run!=null)run.Abort();bridge.Close();};
        }
        void OnTick(object sender,EventArgs e) {
            if(aborted)return;
            if(run==null) {
                if(!bridge.Enabled||!bridge.Healthy)return;
                // Constructed on the first verified script callback, never on IO.
                var api=new IdleNativeApi(bridge.DecoratorLock,delegate(string s){bridge.Write(s);});
                run=new AutomaticRun(api,bridge,Stopwatch.GetTimestamp,Stopwatch.Frequency,delegate{return BitConverter.ToInt32(Guid.NewGuid().ToByteArray(),0)&Int32.MaxValue;},bridge.Session);
            }
            try {
                if(emergencyRequested){emergencyRequested=false;run.Stop("manual emergency stop",bridge.Capture);}
                RunCommand c;int bounded=0;
                while(bounded++<2&&bridge.TryCommand(out c))bridge.Reply(c.Id,run.Command(c,bridge.Capture));
                run.Tick(bridge.Capture);bridge.Publish(run.State);Draw(run.State.Status);
            } catch(ThreadAbortException){throw;}
            catch(Exception ex){bridge.Write("callback-fault "+ex.GetType().Name+":"+ex.Message);run.Stop("callback fault",bridge.Capture);bridge.Publish(run.State);}
        }
        void OnKey(object sender,KeyEventArgs e) {
            if(!aborted&&run!=null&&e.Control&&e.Shift&&e.KeyCode==Keys.F9)emergencyRequested=true;
        }
        static void Draw(string status) {
            Function.Call(Hash.SET_TEXT_FONT,0);Function.Call(Hash.SET_TEXT_SCALE,0f,.35f);Function.Call(Hash.SET_TEXT_COLOUR,255,230,100,255);Function.Call(Hash.SET_TEXT_OUTLINE);
            Function.Call(Hash.BEGIN_TEXT_COMMAND_DISPLAY_TEXT,"STRING");Function.Call(Hash.ADD_TEXT_COMPONENT_SUBSTRING_PLAYER_NAME,"RA automatic audio test: "+status);Function.Call(Hash.END_TEXT_COMMAND_DISPLAY_TEXT,.02f,.12f,0);
        }
    }
}
