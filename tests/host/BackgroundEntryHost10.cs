// Owned moving window plus real bridge/runner. GTA API observations are authored.
// AUTOMATION_FIXTURES excludes only GTA executable/API/decorator-lock binding.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using RichAudio.NativeSuppression01;
internal sealed class BackgroundEntryHost10:Form
{
    readonly string root,mode;readonly LocalBridge bridge;readonly TestAutomaticNative08.Api api=new TestAutomaticNative08.Api();
    readonly Timer timer=new Timer{Interval=50};AutomaticRun run;int frame,token=500;readonly long end=Stopwatch.GetTimestamp()+100*Stopwatch.Frequency;
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,StringBuilder b,int n);
    [STAThread]static int Main(string[] args){Application.EnableVisualStyles();Application.Run(new BackgroundEntryHost10(args[0],args[1]));return 0;}
    BackgroundEntryHost10(string path,string kind){root=Path.GetFullPath(path);mode=kind;Text="Owned background capture fixture - "+kind+" - "+Process.GetCurrentProcess().Id;ClientSize=new Size(960,540);DoubleBuffered=true;StartPosition=FormStartPosition.CenterScreen;
        File.WriteAllText(Path.Combine(root,"RichAudio.NativeSuppression10.ini"),"Enabled=true");bridge=new LocalBridge(root,root);
        Shown+=delegate{var b=new StringBuilder(512);GetClassName(Handle,b,b.Capacity);File.WriteAllText(Path.Combine(root,"window-selector.txt"),Text+":"+b+":"+Path.GetFileName(Process.GetCurrentProcess().MainModule.FileName));};
        FormClosed+=delegate{timer.Stop();bridge.Close();System.Threading.Thread.Sleep(200);};timer.Tick+=Tick;timer.Start();}
    void Tick(object sender,EventArgs e){
        if(File.Exists(Path.Combine(root,"close-fixture"))||Stopwatch.GetTimestamp()>=end){Close();return;}
        if(bridge.Enabled&&run==null)run=new AutomaticRun(api,bridge,Stopwatch.GetTimestamp,Stopwatch.Frequency,()=>++token,bridge.Session);
        if(run!=null&&!File.Exists(Path.Combine(root,"freeze-game-state"))){RunCommand c;while(bridge.TryCommand(out c))bridge.Reply(c.Id,run.Command(c,bridge.Capture));run.Tick(bridge.Capture);bridge.Publish(run.State);}
        if(mode!="frozen"&&mode!="blank")frame++;
        Invalidate();
    }
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);if(mode=="blank"){e.Graphics.Clear(Color.Black);return;}
        e.Graphics.Clear(Color.FromArgb(25,50,75));for(int i=0;i<8;i++)using(var b=new SolidBrush(Color.FromArgb(40+i*20,100,170-i*10)))e.Graphics.FillRectangle(b,i*120,0,120,540);
        e.Graphics.FillEllipse(Brushes.White,(frame*17)%800,180,100,100);e.Graphics.DrawString("OWNED FIXTURE - no GTA\nFrame "+frame,SystemFonts.DefaultFont,Brushes.Black,30,30);}
}
