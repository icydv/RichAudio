// Deliberately authored, device-free API doubles for the actual menu adapter.
// These model call boundaries only and do not establish real RPH contracts.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Windows.Forms;
using RichAudio.Beacon.Windows;

namespace RichAudio.MenuFailureFixtures
{
    public static class FakeProbe
    {
        public const string Secret="PRIVATE_MESSAGE_C:\\Users\\PrivateFixture\\settings.json_TOKEN_abcdef";
        public static string FaultCall;
        public static bool FaultFired,FailDiagnosticPrint;
        public static int Yields,Starts,GraphicsCalls;
        public static Action OnYield;
        public static readonly List<string> Calls=new List<string>();
        public static void Reset(string call)
        {FaultCall=call;FaultFired=false;FailDiagnosticPrint=false;Yields=Starts=GraphicsCalls=0;OnYield=null;Calls.Clear();Rage.Game.Reset();}
        [MethodImpl(MethodImplOptions.NoInlining)]
        public static void Hit(string call)
        {Calls.Add(call);if(call==FaultCall&&!FaultFired){FaultFired=true;ThrowTagged();}}
        [MethodImpl(MethodImplOptions.NoInlining)]
        private static void ThrowTagged(){throw new NullReferenceException(Secret);}
    }
}
namespace Rage.Attributes
{
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class ConsoleCommandAttribute:Attribute
    {public string Name{get;set;}public string Description{get;set;}}
}
namespace Rage
{
    [Flags] public enum ControllerButtons {LeftShoulder=1,DPadRight=2,DPadUp=4,DPadDown=8,DPadLeft=16,A=32,B=64}
    public enum GameControl {CursorX=239,CursorY=240}
    public struct MouseState {public bool IsLeftButtonDown{get{return false;}}public bool IsRightButtonDown{get{return false;}}}
    public sealed class FakeConsole
    {
        public readonly List<string> Lines=new List<string>();
        public bool IsOpen{get{RichAudio.MenuFailureFixtures.FakeProbe.Hit("console-open");return false;}}
        public void Print(string text)
        {
            if(RichAudio.MenuFailureFixtures.FakeProbe.FailDiagnosticPrint&&text!=null&&text.Contains("stage=")&&text.Contains("loop="))
                throw new InvalidOperationException("Fixture console sink rejected diagnostic output");
            Lines.Add(text);
        }
    }
    public sealed class GraphicsEventArgs:EventArgs {public readonly FakeGraphics Graphics=new FakeGraphics();}
    public sealed class FakeGraphics
    {
        public void DrawRectangle(RectangleF rectangle,Color color){RichAudio.MenuFailureFixtures.FakeProbe.GraphicsCalls++;RichAudio.MenuFailureFixtures.FakeProbe.Hit("render");}
        public void DrawText(string text,string font,float size,PointF position,Color color){RichAudio.MenuFailureFixtures.FakeProbe.GraphicsCalls++;RichAudio.MenuFailureFixtures.FakeProbe.Hit("render");}
    }
    public static class Game
    {
        private static EventHandler<GraphicsEventArgs> frame;
        public static int RenderSubscribers;
        public static readonly FakeConsole Console=new FakeConsole();
        public static event EventHandler<GraphicsEventArgs> RawFrameRender
        {add{frame+=value;RenderSubscribers++;}remove{frame-=value;RenderSubscribers--;}}
        public static void Reset(){frame=null;RenderSubscribers=0;Console.Lines.Clear();}
        public static bool IsLoading{get{RichAudio.MenuFailureFixtures.FakeProbe.Hit("loading");return false;}}
        public static bool IsPaused{get{RichAudio.MenuFailureFixtures.FakeProbe.Hit("paused");return false;}}
        public static bool IsControllerConnected{get{RichAudio.MenuFailureFixtures.FakeProbe.Hit("controller");return false;}}
        public static bool IsControllerButtonDownRightNow(ControllerButtons button){RichAudio.MenuFailureFixtures.FakeProbe.Hit("controller-button");return false;}
        public static bool IsKeyDownRightNow(Keys key){RichAudio.MenuFailureFixtures.FakeProbe.Hit("key");return false;}
        public static MouseState GetMouseState(){RichAudio.MenuFailureFixtures.FakeProbe.Hit("mouse");return new MouseState();}
        public static int GetMouseWheelDelta(){RichAudio.MenuFailureFixtures.FakeProbe.Hit("wheel");return 0;}
        public static Size Resolution{get{RichAudio.MenuFailureFixtures.FakeProbe.Hit("resolution");return new Size(1920,1080);}}
        public static void RaiseFrame(){var handler=frame;if(handler!=null)handler(null,new GraphicsEventArgs());}
    }
    public static class GameFiber
    {
        private static Action scheduled;
        public static void StartNew(Action action,string name){RichAudio.MenuFailureFixtures.FakeProbe.Starts++;scheduled=action;}
        public static void Pump(){var work=scheduled;scheduled=null;if(work==null)throw new Exception("No actual adapter fiber scheduled");work();}
        public static void Yield(){RichAudio.MenuFailureFixtures.FakeProbe.Yields++;RichAudio.MenuFailureFixtures.FakeProbe.Hit("yield");var action=RichAudio.MenuFailureFixtures.FakeProbe.OnYield;if(action!=null)action();}
    }
}
namespace Rage.Native
{
    public sealed class FakeNativeActions
    {public void DISABLE_ALL_CONTROL_ACTIONS(int group){}public void SET_MOUSE_CURSOR_THIS_FRAME(){}}
    public static class NativeFunction
    {
        public static readonly dynamic Natives=new FakeNativeActions();
        public static T CallByHash<T>(ulong hash,params object[] values){RichAudio.MenuFailureFixtures.FakeProbe.Hit("native-hash");return default(T);}
        public static T CallByName<T>(string name,params object[] values)
        {
            RichAudio.MenuFailureFixtures.FakeProbe.Hit(name);
            object result=default(T);
            if(typeof(T)==typeof(bool))result=name=="IS_PLAYER_PLAYING"||name=="DOES_ENTITY_EXIST";
            else if(typeof(T)==typeof(int))result=1;
            else if(typeof(T)==typeof(float))result=.5f;
            return (T)result;
        }
    }
}
namespace RichAudio.Beacon.Windows
{
    public static class InGameSettingsLink {public static string SidecarForGameExecutable(string ignored){return "fixture-only-no-filesystem";}}
    public sealed class InGameSettingsSnapshot
    {
        public readonly AcousticSettings Settings=new AcousticSettings("auto","auto",1,false);
        public readonly bool Available=true,ControllerEnabled=true,Pending=false,ResetAvailable=true;
        public readonly long SavedRevision=1;
        public readonly string StatusJson=null,Error=null;
        public readonly MenuDiagnostic Diagnostic=new MenuDiagnostic("preferences","loaded");
    }
    public sealed class InGameSettingsBridge:IDisposable
    {
        public static InGameSettingsBridge Last;
        public readonly ManualResetEvent Disposed=new ManualResetEvent(false);
        public int StopRequests,Disposals;
        public readonly InGameSettingsSnapshot Snapshot=new InGameSettingsSnapshot();
        public InGameSettingsBridge(string ignored){Last=this;}
        public void Start(){}
        public bool TryApply(AcousticSettings desired,long revision){return false;}
        public bool TryResetDefaults(long revision){return false;}
        public void RequestStop(){Interlocked.Increment(ref StopRequests);}
        public void Dispose(){Interlocked.Increment(ref Disposals);Disposed.Set();}
    }
    public sealed class InGameRecordingSnapshot
    {public readonly bool Available=false,Active=false,Pending=false;public readonly string Detail="Fixture recorder unavailable";public readonly MenuDiagnostic Diagnostic=new MenuDiagnostic("recorder","disconnected");}
    public sealed class InGameRecordingBridge:IDisposable
    {
        public static InGameRecordingBridge Last;
        public readonly ManualResetEvent Disposed=new ManualResetEvent(false);
        public int StopRequests,Disposals;
        public readonly InGameRecordingSnapshot Snapshot=new InGameRecordingSnapshot();
        public InGameRecordingBridge(string ignored){Last=this;}
        public void Start(){}
        public bool TrySetRecording(bool start){throw new Exception("Fixture must not request recording");}
        public void RequestStop(){Interlocked.Increment(ref StopRequests);}
        public void Dispose(){Interlocked.Increment(ref Disposals);Disposed.Set();}
    }
}
