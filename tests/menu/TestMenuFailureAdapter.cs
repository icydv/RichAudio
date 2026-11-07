using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Rage;
using RichAudio.Beacon.Rph;
using RichAudio.Beacon.Windows;
using RichAudio.MenuFailureFixtures;
using RichAudio.Settings.InGame;

public static class TestMenuFailureAdapter
{
    private static int checks;
    private static readonly List<object> cases=new List<object>();
    private static void Check(bool value,string reason){checks++;if(!value)throw new Exception(reason);}
    private static object PrivateField(string name){return typeof(InGameMenu).GetField(name,BindingFlags.NonPublic|BindingFlags.Static).GetValue(null);}
    private static void CleanupAssertions(InGameSettingsBridge settings,InGameRecordingBridge recorder)
    {
        Check(settings.Disposed.WaitOne(2000)&&recorder.Disposed.WaitOne(2000),"Actual Stop did not complete both queued fixture disposals");
        Check(settings.StopRequests==1&&recorder.StopRequests==1,"Actual worker-stop requests were missing or repeated");
        Check(settings.Disposals==1&&recorder.Disposals==1,"Actual queued disposal was missing or repeated");
        Check(Game.RenderSubscribers==0,"Actual render callback was not detached");
        Check((int)PrivateField("started")==0&&(bool)PrivateField("stopping"),"Actual adapter lifecycle did not stop");
        Check(PrivateField("presentation")==null&&PrivateField("openPresentation")==null,"Failed adapter retained visible presentation");
        Check(PrivateField("bridge")==null&&PrivateField("recordingBridge")==null,"Failed adapter retained worker references");
        Check(!((RichAudio.Settings.InGame.AcousticMenuModel)PrivateField("menu")).Visible,"Failed adapter remained open");
        Check(FakeProbe.Starts==1,"Actual adapter silently retried/restarted its fiber");
        InGameMenu.Stop();Check(settings.StopRequests==1&&recorder.StopRequests==1,"Repeated Stop duplicated cleanup");
    }
    private static void RunFault(string name,string fault,string expectedStage,bool consoleFailure=false)
    {
        FakeProbe.Reset(fault);FakeProbe.FailDiagnosticPrint=consoleFailure;
        FakeProbe.OnYield=delegate{throw new Exception("Fault fixture unexpectedly reached Yield without its selected failure");};
        InGameMenu.Start();var settings=InGameSettingsBridge.Last;var recorder=InGameRecordingBridge.Last;
        Check(Game.RenderSubscribers==1,"Actual Start did not attach render callback");
        Exception escaped=null;try{GameFiber.Pump();}catch(Exception e){escaped=e;}
        CleanupAssertions(settings,recorder);
        Check(FakeProbe.FaultFired,"Chosen API fault was not reached by actual Run");
        Check(FakeProbe.Calls.Count>0&&FakeProbe.Calls[FakeProbe.Calls.Count-1]==fault,"Failure reporting queried another game/input/native state after the throwing API");
        int faultCalls=0;foreach(string call in FakeProbe.Calls)if(call==fault)faultCalls++;
        Check(faultCalls==1,"Selected failure was retried instead of using captured observations");
        string joined=String.Join("\n",Game.Console.Lines.ToArray());
        if(consoleFailure)Check(escaped is InvalidOperationException,"Fixture console failure did not exercise catch-output failure");
        else{
            Check(escaped==null,"A normally reportable adapter fault escaped its catch");
            Check(joined.Contains("stage="+expectedStage),"Actual adapter did not retain selected operation stage: "+expectedStage);
            Check(joined.Contains("NullReferenceException")&&joined.Contains("ThrowTagged"),"Actual adapter diagnostic lost exception type or originating method");
            Check(joined.Contains("loop=1"),"Actual adapter did not retain its first iteration identity");
            Check(joined.Contains("prefs=true"),"Available preference observation was lost");
        }
        Check(!joined.Contains(FakeProbe.Secret)&&!joined.Contains("PRIVATE_MESSAGE")&&!joined.Contains("TOKEN_abcdef"),"Actual adapter emitted a private exception message");
        foreach(string line in Game.Console.Lines)Check(line.Length<=2048,"Actual diagnostic log exceeded the formatter bound");
        cases.Add(new{name=name,expectedStage=expectedStage,apiDouble=fault,faultReached=FakeProbe.FaultFired,lines=Game.Console.Lines.ToArray(),yields=FakeProbe.Yields,cleanup=true,escapedType=escaped==null?null:escaped.GetType().Name,
            scope="Actual adapter/catch/finally/Stop executed against authored API and worker doubles; no real RPH contract proof"});
        settings.Disposed.Dispose();recorder.Disposed.Dispose();
    }
    private static void RunColdFirstOpen()
    {
        FakeProbe.Reset(null);
        var opacity=new List<int>();
        var panelX=new List<float>();
        FakeProbe.OnYield=delegate{
            var frame=(MenuFrame)PrivateField("presentation");
            opacity.Add(frame==null||frame.Commands.Count==0?-1:(int)((uint)frame.Commands[0].Argb>>24));
            panelX.Add(frame==null||frame.Commands.Count<2?Single.NaN:frame.Commands[1].X);
            if(FakeProbe.Yields==1){Thread.Sleep(320);Game.RaiseFrame();}
            else if(FakeProbe.Yields==2){Game.RaiseFrame();Thread.Sleep(90);}
            else InGameMenu.Stop();
        };
        InGameMenu.Start();InGameMenu.OpenSettings();
        var settings=InGameSettingsBridge.Last;var recorder=InGameRecordingBridge.Last;
        try{GameFiber.Pump();}finally{InGameMenu.Stop();}
        CleanupAssertions(settings,recorder);
        Check(opacity.Count==3,"Cold opening did not reach the expected three presentation frames");
        Check(opacity[0]==0,"First opening must prepare the closed endpoint before drawing");
        Check(opacity[1]==0&&panelX[1]<0,"A delayed first paint consumed the opening animation before it could be seen");
        Check(opacity[2]>0&&opacity[2]<46&&panelX[2]>panelX[1]&&panelX[2]<0,"After first paint, opening must show an intermediate slide and dimmer frame");
        Check(!String.Join("\n",Game.Console.Lines.ToArray()).Contains("loop="),"Cold opening manufactured an exception diagnostic");
        cases.Add(new{name="cold first menu presentation",authoredFirstPaintDelayMs=320,opacity=opacity.ToArray(),panelX=panelX.ToArray(),passed=true,
            scope="Actual adapter with authored API/render doubles; no GTA/RPH rendering proof"});
        settings.Disposed.Dispose();recorder.Disposed.Dispose();
    }
    public static int Main(string[] args)
    {
        try{
            if(args.Length!=1)throw new ArgumentException("Private output required");
            RunFault("loading getter", "loading", "ReadLoading");
            RunFault("paused getter", "paused", "ReadPaused");
            RunFault("console getter", "console-open", "ReadConsoleOpen");
            RunFault("network native", "NETWORK_IS_SESSION_STARTED", "NetworkSession");
            RunFault("controller getter", "controller", "ControllerConnection");
            RunFault("toggle key", "key", "ToggleInputs");
            RunFault("hidden mouse read", "mouse", "ReadMouseState");
            RunFault("yield failure", "yield", "Yield");
            RunFault("catch logging failure still cleans up", "loading", "ReadLoading", true);
            FakeProbe.Reset(null);FakeProbe.OnYield=delegate{InGameMenu.Stop();};
            InGameMenu.Start();var settings=InGameSettingsBridge.Last;var recorder=InGameRecordingBridge.Last;GameFiber.Pump();CleanupAssertions(settings,recorder);
            Check(!String.Join("\n",Game.Console.Lines.ToArray()).Contains("loop="),"Normal stop manufactured an exception diagnostic");
            cases.Add(new{name="normal stop",cleanup=true,yields=FakeProbe.Yields});settings.Disposed.Dispose();recorder.Disposed.Dispose();
            RunColdFirstOpen();
            string path=Path.Combine(Path.GetFullPath(args[0]),"adapter-result.json");
            var result=new{kind="MenuFailureActualAdapterStubFixture",checks=checks,cases=cases.ToArray(),passed=true,realAdapterExecuted=true,authoredApiAndWorkerDoubles=true,realRphUsed=false,
                gameOrAudioEndpoint=false,deviceWindow=false,recordingRequested=false,actualNreCauseIdentified=false};
            using(var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var writer=new StreamWriter(file,new UTF8Encoding(false)))writer.Write(new JavaScriptSerializer().Serialize(result));
            Console.WriteLine("PASS: "+checks+" actual adapter stage/fault/cleanup checks across "+cases.Count+" authored cases; no RPH or device");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
