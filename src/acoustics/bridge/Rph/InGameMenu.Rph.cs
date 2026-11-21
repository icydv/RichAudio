// Separate Story Mode overlay through public RPH graphics/input APIs. This does
// not replace the stock pause frontend or start any RichAudio audio session.
using System;
using System.Diagnostics;
using System.Globalization;
using System.Text;
#if !MENU_DIAGNOSTICS_ONLY
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Rage;
using Rage.Attributes;
using Rage.Native;
using RichAudio.Beacon.Windows;
using RichAudio.Settings.InGame;

namespace RichAudio.Beacon.Rph
{
    internal static class InGameMenu
    {
        private static int started,consoleRequested;
        private static volatile bool stopping,renderFailed;
        private static volatile MenuFrame presentation;
        private static volatile MenuFrame firstOpenFrame,firstOpenRenderedFrame;
        private static bool firstOpenAnimationStarted;
        private static InGameSettingsBridge bridge;
        private static InGameRecordingBridge recordingBridge;
        private static readonly AcousticMenuModel menu=new AcousticMenuModel();
        private static readonly MenuInputRouter input=new MenuInputRouter();
        private static readonly MenuTransition transition=new MenuTransition(260);
        private static MenuFrame openPresentation;
        private static readonly MenuShortcutLatch shortcut=new MenuShortcutLatch();
        private static long editingRevision,awaitingRevision=-1;
        private static MenuPreferences awaitingPreferences;
        private static bool awaitingRecording;
        private static bool mouseDown,mouseVisible;
        private static float mouseX=-1,mouseY=-1;
        private static int layoutWidth,layoutHeight;
        private static string lastDiagnostic;
        private static int diagnosticReports;
        private static double nextIdleRefreshMs;

        internal static void Start()
        {
            if(Interlocked.Exchange(ref started,1)!=0)return;
            stopping=false;renderFailed=false;
            firstOpenFrame=firstOpenRenderedFrame=null;firstOpenAnimationStarted=false;
            try
            {
                // RPH loads a cached copy of this assembly without its JSON sidecar.
                // The exact-build guard already established the host executable.
                string sidecar=InGameSettingsLink.SidecarForGameExecutable(Process.GetCurrentProcess().MainModule.FileName);
                bridge=new InGameSettingsBridge(sidecar);bridge.Start();
                recordingBridge=new InGameRecordingBridge(sidecar);recordingBridge.Start();
                Game.RawFrameRender+=Render;
                GameFiber.StartNew(Run,"RichAudio settings overlay");
            }
            catch{Stop();throw;}
        }
        [ConsoleCommand(Name="RichAudioSettings",Description="Open Story Mode RichAudio settings after closing the RPH console; starts no audio")]
        public static void OpenSettings(){Interlocked.Exchange(ref consoleRequested,1);}
        [ConsoleCommand(Name="RichAudioSettingsStatus",Description="Safe preference/host/recorder diagnostics; no paths, contents or tokens")]
        public static void SettingsStatus()
        {
            var b=bridge;var s=b==null?null:b.Snapshot;var r=recordingBridge;var rs=r==null?null:r.Snapshot;
            Game.Console.Print("RichAudio settings preferences="+(s!=null&&s.Available?"available":"unavailable")+" "+
                (s==null?"stage=worker code=not-started exception=none":s.Diagnostic.Summary)+
                " host="+(s==null||s.StatusJson==null?"stopped-or-no-status":"status-present")+
                " recorder="+(rs!=null&&rs.Available?"connected":"disconnected")+
                (rs==null?"":" "+rs.Diagnostic.Summary));
        }
        internal static void Stop()
        {
            if(Interlocked.Exchange(ref started,0)==0)return;
            stopping=true;presentation=openPresentation=null;Interlocked.Exchange(ref consoleRequested,0);
            firstOpenFrame=firstOpenRenderedFrame=null;firstOpenAnimationStarted=false;
            Game.RawFrameRender-=Render;
            var service=bridge;bridge=null;if(service!=null){service.RequestStop();ThreadPool.QueueUserWorkItem(delegate{service.Dispose();});}
            var recording=recordingBridge;recordingBridge=null;if(recording!=null){recording.RequestStop();ThreadPool.QueueUserWorkItem(delegate{recording.Dispose();});}
            // The owned fiber sees stopping at its next yield. No input hook or
            // persistent game-control mutation needs restoration.
        }
        private static MenuPreferences Preferences(AcousticSettings s)
        {return new MenuPreferences(s.Quality,s.Acceleration,s.RichAudioEnabled,s.OutputLevel,s.EarlyReflections,s.DiagnosticsOverlay,s.IntegrationMode,s.SoundMapVisible,s.MenuToggleKey,s.AirflowEnabled,s.AirflowLevel);}
        private static bool Key(Keys key){return Game.IsKeyDownRightNow(key);}
        private static bool Button(bool connected,ControllerButtons button){return connected&&Game.IsControllerButtonDownRightNow(button);}
        private static void Run()
        {
            long loop=0;var stage=MenuOperationStage.Unknown;
            var observed=new MenuFailureObservation();
            try
            {
                while(!stopping)
                {
                    loop++;observed=new MenuFailureObservation();stage=MenuOperationStage.ReadPreferencesSnapshot;
                    var service=bridge;if(service==null)break;var state=service.Snapshot;
                    observed.PreferencesAvailable=state.Available;stage=MenuOperationStage.PreferencesDiagnostic;
                    string diagnosticKey=state.Available+" "+state.Diagnostic.Summary;
                    if(diagnosticKey!=lastDiagnostic){lastDiagnostic=diagnosticKey;if(diagnosticReports++<8)
                        Game.Console.Print("RichAudio preferences available="+state.Available+" "+state.Diagnostic.Summary);}
                    stage=MenuOperationStage.ReadLoading;bool loading=Game.IsLoading;observed.Loading=loading;
                    stage=MenuOperationStage.ReadPaused;bool paused=Game.IsPaused;observed.Paused=paused;
                    stage=MenuOperationStage.ReadConsoleOpen;bool console=Game.Console.IsOpen;observed.ConsoleOpen=console;
                    bool story=!loading;
                    if(story){stage=MenuOperationStage.NetworkSession;story=!NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED");}
                    if(story){stage=MenuOperationStage.NetworkGame;story=!NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS");}
                    // An offline frontend is not a playable Story session.
                    if(story)
                    {
                        stage=MenuOperationStage.PlayerId;int player=NativeFunction.CallByName<int>("PLAYER_ID");
                        stage=MenuOperationStage.PlayerPed;int ped=NativeFunction.CallByName<int>("PLAYER_PED_ID");
                        story=ped!=0;
                        if(story){stage=MenuOperationStage.PlayerPlaying;story=NativeFunction.CallByName<bool>("IS_PLAYER_PLAYING",player);}
                        if(story){stage=MenuOperationStage.PedExists;story=NativeFunction.CallByName<bool>("DOES_ENTITY_EXIST",ped);}
                        if(story){stage=MenuOperationStage.PlayerSwitch;story=!NativeFunction.CallByName<bool>("IS_PLAYER_SWITCH_IN_PROGRESS");}
                    }
                    observed.Story=story;
                    double now=Stopwatch.GetTimestamp()*1000d/Stopwatch.Frequency;
                    stage=MenuOperationStage.ConfigureShortcut;
                    shortcut.Configure(state.Settings.MenuToggleKey);
                    Keys activeToggle,previousToggle;Enum.TryParse<Keys>(shortcut.Key,out activeToggle);Enum.TryParse<Keys>(shortcut.PreviousKey,out previousToggle);
                    stage=MenuOperationStage.ControllerConnection;
                    bool connected=state.ControllerEnabled&&Game.IsControllerConnected;
                    observed.ControllerInput=connected;stage=MenuOperationStage.ControllerChord;
                    bool chord=Button(connected,ControllerButtons.LeftShoulder)&&Button(connected,ControllerButtons.DPadRight);
                    stage=MenuOperationStage.ToggleInputs;
                    bool toggleHeld=shortcut.Held(Key(activeToggle),Key(previousToggle),chord);
                    stage=MenuOperationStage.NavigationInputs;
                    var held=new[]{Key(Keys.Up)||Button(connected,ControllerButtons.DPadUp),Key(Keys.Down)||Button(connected,ControllerButtons.DPadDown),
                        Key(Keys.Left)||Button(connected,ControllerButtons.DPadLeft),Key(Keys.Right)||Button(connected,ControllerButtons.DPadRight),
                        Key(Keys.Enter)||Button(connected,ControllerButtons.A),Key(Keys.Escape)||Button(connected,ControllerButtons.B)};
                    stage=MenuOperationStage.InputRouting;observed.MenuVisible=menu.Visible;
                    var routed=input.Update(now,story,paused,loading,console,menu.Visible,
                        toggleHeld,Interlocked.Exchange(ref consoleRequested,0)!=0,held);
                    if(routed.Close){stage=MenuOperationStage.CloseModel;menu.Close();observed.MenuVisible=false;mouseVisible=false;}
                    if(routed.Open)
                    {
                        stage=MenuOperationStage.OpenModel;
                        menu.Open(Preferences(state.Settings),state.Available);editingRevision=state.SavedRevision;awaitingRevision=-1;
                        observed.MenuVisible=true;
                        layoutWidth=layoutHeight=0;
                        mouseVisible=false;mouseX=mouseY=-1;
                        stage=MenuOperationStage.ReadOpenMouse;mouseDown=Game.GetMouseState().IsLeftButtonDown;
                        stage=MenuOperationStage.ReadOpenWheel;Game.GetMouseWheelDelta();
                    }
                    bool eligible=story&&!paused&&!loading&&!console;
                    if(!eligible){stage=MenuOperationStage.CloseModel;menu.Close();observed.MenuVisible=false;stage=MenuOperationStage.Transition;transition.ResetClosed(now);openPresentation=null;}
                    stage=MenuOperationStage.Transition;
                    if(menu.Visible&&!firstOpenAnimationStarted)transition.ResetClosed(now);
                    transition.SetOpen(menu.Visible,now);
                    stage=MenuOperationStage.ReadMouseState;
                    var mouse=Game.GetMouseState();
                    stage=MenuOperationStage.ClosingInputs;
                    bool closingInputHeld=Key(activeToggle)||(shortcut.WaitingForRelease&&Key(previousToggle))||chord||mouse.IsLeftButtonDown||mouse.IsRightButtonDown;
                    foreach(bool down in held)closingInputHeld|=down;
                    stage=MenuOperationStage.Transition;
                    var motion=transition.Sample(now,closingInputHeld);
                    // Frame-scoped suppression includes both animation phases
                    // and the release of the closing gesture. No game pause,
                    // persistent input hook or OS cursor ownership is applied.
                    bool captured=eligible&&(routed.SuppressGameplay||motion.CapturesInput);
                    observed.InputCaptured=captured;
                    if(captured){
                        stage=MenuOperationStage.DisableControls0;NativeFunction.Natives.DISABLE_ALL_CONTROL_ACTIONS(0);
                        stage=MenuOperationStage.DisableControls1;NativeFunction.Natives.DISABLE_ALL_CONTROL_ACTIONS(1);
                        stage=MenuOperationStage.DisableControls2;NativeFunction.Natives.DISABLE_ALL_CONTROL_ACTIONS(2);
                        stage=MenuOperationStage.ShowNativeCursor;NativeFunction.Natives.SET_MOUSE_CURSOR_THIS_FRAME();
                        if(now>=nextIdleRefreshMs){
                            // Documented no-argument timer resets, not camera
                            // ownership. RPH documents int for a void native.
                            // At most two calls per second while modal focus is
                            // captured; no call or restoration after closing.
                            stage=MenuOperationStage.ResetIdleCamera;NativeFunction.CallByHash<int>(0xF4F2C0D4EE209E20UL);
                            stage=MenuOperationStage.ResetVehicleIdleCamera;NativeFunction.CallByHash<int>(0x9E4CFFF989258472UL);
                            nextIdleRefreshMs=now+1000;
                        }
                    }
                    if(renderFailed){menu.Close();presentation=null;break;}
                    if(menu.Visible)
                    {
                        stage=MenuOperationStage.ReadRecorderSnapshot;
                        var recorder=recordingBridge;var recordState=recorder==null?null:recorder.Snapshot;
                        stage=MenuOperationStage.UpdateModel;
                        menu.SetRecording(recordState!=null&&recordState.Available,recordState!=null&&recordState.Active,
                            recordState!=null&&recordState.Pending,recordState==null?"SoundMap recorder unavailable":recordState.Detail);
#if PLAYABLE_PRODUCT
                        menu.SetAudioTestRecording(false,false,false,"Locked until an approved vehicle playback test passes.");
#endif
                        if(awaitingRecording&&(recordState==null||!recordState.Pending)){
                            awaitingRecording=false;menu.SetNotice(recordState==null?"Recording outcome unavailable; check SoundMap.":recordState.Detail,recordState==null||!recordState.Available);}
                        menu.SetWritable(state.Available&&!state.Pending);
                        menu.SetResetAvailable(state.ResetAvailable&&!state.Pending);
                        if(awaitingRevision>=0&&!state.Pending)
                        {
                            bool terminal=false;
                            if(state.Error==null&&state.SavedRevision>awaitingRevision&&awaitingPreferences!=null&&awaitingPreferences.Same(Preferences(state.Settings)))
                            {editingRevision=state.SavedRevision;menu.Acknowledge(Preferences(state.Settings),"Preferences saved. Engine acknowledgement is shown separately.");terminal=true;}
                            else if(state.Error!=null||!state.Available||state.SavedRevision>awaitingRevision)
                            {menu.SetNotice(state.Error??"Preferences were not saved. Reopen after reviewing current settings.",true);terminal=true;}
                            // An unchanged, error-free snapshot does not prove
                            // a just-enqueued background write has completed.
                            if(terminal){awaitingRevision=-1;awaitingPreferences=null;}
                        }
                        else if(!state.Available)menu.SetNotice(state.Error??"Settings storage unavailable. No preferences have been changed.",true);
                        stage=MenuOperationStage.ReadViewport;var size=Game.Resolution;
                        stage=MenuOperationStage.ReadHostStatus;
                        var status=HostMenuStatus.Read(state.StatusJson,DateTime.UtcNow,state.SavedRevision);
                        if(layoutWidth!=size.Width||layoutHeight!=size.Height)
                        {stage=MenuOperationStage.BuildFrame;menu.BuildFrame(size.Width,size.Height,status);layoutWidth=size.Width;layoutHeight=size.Height;}
                        stage=MenuOperationStage.UpdateModel;
                        MenuAction action=MenuAction.None;
                        if(motion.FullyOpen&&routed.Action.HasValue){mouseVisible=false;action=menu.Handle(routed.Action.Value);}
                        // Cursor axes are normalized game input, rather than
                        // assuming undocumented MouseState X/Y coordinates.
                        stage=MenuOperationStage.ReadCursorX;float nx=NativeFunction.CallByName<float>("GET_DISABLED_CONTROL_NORMAL",0,(int)GameControl.CursorX);
                        stage=MenuOperationStage.ReadCursorY;float ny=NativeFunction.CallByName<float>("GET_DISABLED_CONTROL_NORMAL",0,(int)GameControl.CursorY);
                        stage=MenuOperationStage.ReadMouseButton;
                        bool click=mouse.IsLeftButtonDown&&!mouseDown;mouseDown=mouse.IsLeftButtonDown;
                        stage=MenuOperationStage.ReadWheel;
                        int wheel=Game.GetMouseWheelDelta();
                        if(!Single.IsNaN(nx)&&!Single.IsInfinity(nx)&&!Single.IsNaN(ny)&&!Single.IsInfinity(ny)&&nx>=0&&nx<=1&&ny>=0&&ny<=1)
                        {
                            float x=nx*(size.Width-1),y=ny*(size.Height-1);
                            bool moved=mouseX>=0&&(Math.Abs(x-mouseX)>.75f||Math.Abs(y-mouseY)>.75f);
                            mouseX=x;mouseY=y;if(moved||click||wheel!=0)mouseVisible=true;
                            if(motion.FullyOpen&&mouseVisible){stage=MenuOperationStage.PointerInput;var pointerAction=menu.Pointer(x,y,click,wheel);if(pointerAction!=MenuAction.None)action=pointerAction;}
                        }
                        if(action==MenuAction.Apply)
                        {
                            var p=menu.Pending;
                            var desired=new AcousticSettings(p.Quality,p.Acceleration,Math.Max(1,editingRevision),p.Enabled,p.OutputLevel,p.EarlyReflections,p.DiagnosticsOverlay,p.IntegrationMode,p.SoundMapVisible,p.MenuToggleKey,p.AirflowEnabled,p.AirflowLevel);
                            stage=MenuOperationStage.QueueApply;
                            if(service.TryApply(desired,editingRevision)){awaitingRevision=editingRevision;awaitingPreferences=p.With();menu.SetNotice("Saving preferences in the background...");}
                            else menu.SetNotice("Save unavailable or already pending. Preferences have not been applied.",true);
                        }
                        else if(action==MenuAction.Reset)
                        {
                            stage=MenuOperationStage.QueueReset;
                            if(service.TryResetDefaults(state.SavedRevision))
                            {awaitingRevision=state.SavedRevision;awaitingPreferences=MenuPreferences.Defaults;menu.SetNotice("Preserving invalid preferences and restoring defaults...");}
                            else menu.SetNotice("Defaults were not restored. Current files were preserved.",true);
                        }
                        else if(action==MenuAction.StartAudioTest||action==MenuAction.StopAudioTest)
                        {
                            // Production session control must bind the reviewed
                            // local recorder and its acceptance gates. Never
                            // route this distinct intent to the SoundMap API.
                            menu.SetNotice("Audio test is unavailable until vehicle playback is approved.",true);
                        }
                        else if(action==MenuAction.StartRecording||action==MenuAction.StopRecording)
                        {
                            stage=MenuOperationStage.QueueRecording;
                            if(recorder==null||!recorder.TrySetRecording(action==MenuAction.StartRecording))menu.SetNotice("Recorder unavailable, changed or request pending. Check SoundMap.",true);
                            else awaitingRecording=true;
                        }
                        if(menu.Visible){stage=MenuOperationStage.BuildFrame;openPresentation=menu.BuildFrame(size.Width,size.Height,status);}
                    }
                    stage=MenuOperationStage.Transition;observed.MenuVisible=menu.Visible;
                    if(menu.Visible&&!firstOpenAnimationStarted)
                    {
                        // Cold layout/JIT and the first render must not consume
                        // the slide before any opening frame can be displayed.
                        // Keep input captured at the closed endpoint until the
                        // render callback has drawn this exact immutable frame.
                        now=Stopwatch.GetTimestamp()*1000d/Stopwatch.Frequency;
                        transition.ResetClosed(now);
                        if(firstOpenFrame!=null&&System.Object.ReferenceEquals(firstOpenRenderedFrame,firstOpenFrame))
                        {firstOpenAnimationStarted=true;firstOpenFrame=firstOpenRenderedFrame=null;}
                    }
                    transition.SetOpen(menu.Visible,now);motion=transition.Sample(now,closingInputHeld);
                    if(eligible&&motion.Visible&&openPresentation!=null)
                    {
                        stage=MenuOperationStage.ReadViewport;var size=Game.Resolution;stage=MenuOperationStage.PresentFrame;
                        if(!firstOpenAnimationStarted)
                        {
                            if(firstOpenFrame==null)firstOpenFrame=MenuTransition.Present(openPresentation,motion,size.Width,size.Height,mouseX,mouseY,mouseVisible);
                            presentation=firstOpenFrame;
                        }
                        else presentation=MenuTransition.Present(openPresentation,motion,size.Width,size.Height,mouseX,mouseY,mouseVisible);
                    }
                    else if(story&&!paused&&!console&&state.Settings.DiagnosticsOverlay&&!motion.CapturesInput)
                    {
                        stage=MenuOperationStage.ReadViewport;var size=Game.Resolution;stage=MenuOperationStage.BuildDiagnostics;presentation=menu.BuildDiagnosticFrame(size.Width,size.Height,
                            HostMenuStatus.Read(state.StatusJson,DateTime.UtcNow,state.SavedRevision));
                    }
                    else presentation=null;
                    stage=MenuOperationStage.Yield;
                    GameFiber.Yield();
                }
            }
            catch(ThreadAbortException){throw;}
            catch(Exception e){Game.Console.Print(MenuFailureDiagnostics.Format(stage,loop,observed,e));}
            finally{presentation=openPresentation=null;menu.Close();Stop();}
        }
        private static void Render(object sender,GraphicsEventArgs e)
        {
            // RawFrameRender must contain no natives, Game getters, input, file
            // IO, locks or host/worker waits. It consumes only this immutable view.
            var view=presentation;if(stopping||view==null)return;
            try
            {
                foreach(var c in view.Commands)
                {
                    var color=Color.FromArgb(c.Argb);
                    if(c.Kind==DrawCommandKind.Rectangle)e.Graphics.DrawRectangle(new RectangleF(c.X,c.Y,c.Width,c.Height),color);
                    else
                    {
                        e.Graphics.DrawText(c.Text,"Arial",c.FontSize,new PointF(c.X,c.Y),color);
                        if(c.Bold)e.Graphics.DrawText(c.Text,"Arial",c.FontSize,new PointF(c.X+c.FontSize*.018f,c.Y),color);
                    }
                }
                // Reference identity rejects a late callback from an older
                // lifecycle; no game API, wait or lock is added to rendering.
                if(System.Object.ReferenceEquals(view,firstOpenFrame))firstOpenRenderedFrame=view;
            }
            catch(ThreadAbortException){throw;}
            catch{renderFailed=true;presentation=null;}
        }
    }
}
#endif

// The exact production formatter is also compiled by SDK-free fixtures. It
// consumes captured values only and never reads exception messages, source
// filenames, parameters, settings contents or another game API.
namespace RichAudio.Settings.InGame
{
    internal enum MenuOperationStage
    {
        Unknown, ReadPreferencesSnapshot, PreferencesDiagnostic,
        ReadLoading, ReadPaused, ReadConsoleOpen, NetworkSession, NetworkGame,
        PlayerId, PlayerPed, PlayerPlaying, PedExists, PlayerSwitch,
        ConfigureShortcut, ControllerConnection, ControllerChord, ToggleInputs,
        NavigationInputs, InputRouting, CloseModel, OpenModel, ReadOpenMouse,
        ReadOpenWheel, Transition, ReadMouseState, ClosingInputs,
        DisableControls0, DisableControls1, DisableControls2, ShowNativeCursor,
        ResetIdleCamera, ResetVehicleIdleCamera, ReadRecorderSnapshot,
        UpdateModel, ReadViewport, ReadHostStatus, BuildFrame,
        ReadCursorX, ReadCursorY, ReadMouseButton, ReadWheel, PointerInput,
        QueueApply, QueueReset, QueueRecording, PresentFrame, BuildDiagnostics,
        Yield
    }

    internal struct MenuFailureObservation
    {
        public bool? PreferencesAvailable,Loading,Paused,ConsoleOpen,Story;
        public bool? ControllerInput,MenuVisible,InputCaptured;
    }

    internal static class MenuFailureDiagnostics
    {
        internal const int MaxFrames=12,MaxCharacters=2048;
        private static string Flag(bool? value){return value.HasValue?(value.Value?"true":"false"):"unknown";}
        private static string Symbol(string value,int maximum,bool typeName)
        {
            if(String.IsNullOrEmpty(value)||value.Length>maximum)return "unavailable";
            foreach(char c in value)
                if(!(c>='A'&&c<='Z'||c>='a'&&c<='z'||c>='0'&&c<='9'||c=='_'||typeName&&(c=='.'||c=='+')))
                    return "unavailable";
            return value;
        }
        internal static string Format(MenuOperationStage stage,long loop,MenuFailureObservation observed,Exception error)
        {
            try
            {
                string stageName=Enum.IsDefined(typeof(MenuOperationStage),stage)?stage.ToString():"Unknown";
                string exception=error==null?"none":Symbol(error.GetType().FullName,96,true);
                string shortException=error==null?"none":Symbol(error.GetType().Name,64,false);
                var text=new StringBuilder(384);
                text.Append("RichAudio settings overlay unavailable: ").Append(shortException).Append(". stage=").Append(stageName)
                    .Append(" loop=").Append(loop<0?"unavailable":loop.ToString(CultureInfo.InvariantCulture))
                    .Append(" exception=").Append(exception)
                    .Append(" prefs=").Append(Flag(observed.PreferencesAvailable))
                    .Append(" loading=").Append(Flag(observed.Loading)).Append(" paused=").Append(Flag(observed.Paused))
                    .Append(" console=").Append(Flag(observed.ConsoleOpen)).Append(" story=").Append(Flag(observed.Story))
                    .Append(" controller=").Append(Flag(observed.ControllerInput)).Append(" visible=").Append(Flag(observed.MenuVisible))
                    .Append(" captured=").Append(Flag(observed.InputCaptured));
                var methods=new StringBuilder(256);int frames=0;
                if(error!=null)
                {
                    // Reflection metadata only: needFileInfo=false and no
                    // StackTrace.ToString/GetFileName/parameter enumeration.
                    var trace=new StackTrace(error,false);
                    for(int i=0;i<trace.FrameCount&&i<MaxFrames;i++)
                    {
                        var frame=trace.GetFrame(i);var method=frame==null?null:frame.GetMethod();
                        if(method==null)continue;
                        string type=method.DeclaringType==null?"unavailable":Symbol(method.DeclaringType.FullName,96,true);
                        string name=Symbol(method.Name,64,false),entry=type+"."+name;
                        if(text.Length+methods.Length+entry.Length+40>MaxCharacters)break;
                        if(frames>0)methods.Append('|');methods.Append(entry);frames++;
                    }
                }
                text.Append(" frames=").Append(frames.ToString(CultureInfo.InvariantCulture)).Append(" stack=")
                    .Append(frames==0?"unavailable":methods.ToString());
                return text.ToString();
            }
            catch
            {
                // A diagnostic failure cannot bypass the adapter's finally.
                return "RichAudio settings overlay unavailable. stage=Unknown loop=unavailable exception=unavailable frames=0 stack=unavailable";
            }
        }
    }
}
