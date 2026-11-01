// Separate Story Mode overlay through public RPH graphics/input APIs. This does
// not replace the stock pause frontend or start any RichAudio audio session.
using System;
using System.Diagnostics;
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
        private static InGameSettingsBridge bridge;
        private static InGameRecordingBridge recordingBridge;
        private static readonly AcousticMenuModel menu=new AcousticMenuModel();
        private static readonly MenuInputRouter input=new MenuInputRouter();
        private static long editingRevision,awaitingRevision=-1;
        private static MenuPreferences awaitingPreferences;
        private static bool awaitingRecording;
        private static bool mouseDown,mouseVisible;
        private static float mouseX=-1,mouseY=-1;
        private static int layoutWidth,layoutHeight;
        private static string lastDiagnostic;
        private static int diagnosticReports;

        internal static void Start()
        {
            if(Interlocked.Exchange(ref started,1)!=0)return;
            stopping=false;renderFailed=false;
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
            stopping=true;presentation=null;Interlocked.Exchange(ref consoleRequested,0);
            Game.RawFrameRender-=Render;
            var service=bridge;bridge=null;if(service!=null){service.RequestStop();ThreadPool.QueueUserWorkItem(delegate{service.Dispose();});}
            var recording=recordingBridge;recordingBridge=null;if(recording!=null){recording.RequestStop();ThreadPool.QueueUserWorkItem(delegate{recording.Dispose();});}
            // The owned fiber sees stopping at its next yield. No input hook or
            // persistent game-control mutation needs restoration.
        }
        private static MenuPreferences Preferences(AcousticSettings s)
        {return new MenuPreferences(s.Quality,s.Acceleration,s.RichAudioEnabled,s.OutputLevel,s.EarlyReflections,s.DiagnosticsOverlay);}
        private static bool Key(Keys key){return Game.IsKeyDownRightNow(key);}
        private static bool Button(bool connected,ControllerButtons button){return connected&&Game.IsControllerButtonDownRightNow(button);}
        private static void Run()
        {
            try
            {
                while(!stopping)
                {
                    var service=bridge;if(service==null)break;var state=service.Snapshot;
                    string diagnosticKey=state.Available+" "+state.Diagnostic.Summary;
                    if(diagnosticKey!=lastDiagnostic){lastDiagnostic=diagnosticKey;if(diagnosticReports++<8)
                        Game.Console.Print("RichAudio preferences available="+state.Available+" "+state.Diagnostic.Summary);}
                    bool loading=Game.IsLoading,paused=Game.IsPaused,console=Game.Console.IsOpen;
                    bool story=!loading&&!NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")&&!NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS");
                    // An offline frontend is not a playable Story session.
                    if(story)
                    {
                        int player=NativeFunction.CallByName<int>("PLAYER_ID"),ped=NativeFunction.CallByName<int>("PLAYER_PED_ID");
                        story=ped!=0&&NativeFunction.CallByName<bool>("IS_PLAYER_PLAYING",player)&&
                            NativeFunction.CallByName<bool>("DOES_ENTITY_EXIST",ped)&&!NativeFunction.CallByName<bool>("IS_PLAYER_SWITCH_IN_PROGRESS");
                    }
                    Keys toggle; if(!Enum.TryParse<Keys>(state.ToggleKey,out toggle))toggle=Keys.F10;
                    bool connected=state.ControllerEnabled&&Game.IsControllerConnected;
                    bool toggleHeld=Key(toggle)||(Button(connected,ControllerButtons.LeftShoulder)&&Button(connected,ControllerButtons.DPadRight));
                    var held=new[]{Key(Keys.Up)||Button(connected,ControllerButtons.DPadUp),Key(Keys.Down)||Button(connected,ControllerButtons.DPadDown),
                        Key(Keys.Left)||Button(connected,ControllerButtons.DPadLeft),Key(Keys.Right)||Button(connected,ControllerButtons.DPadRight),
                        Key(Keys.Enter)||Button(connected,ControllerButtons.A),Key(Keys.Escape)||Button(connected,ControllerButtons.B)};
                    var routed=input.Update(Stopwatch.GetTimestamp()*1000d/Stopwatch.Frequency,story,paused,loading,console,menu.Visible,
                        toggleHeld,Interlocked.Exchange(ref consoleRequested,0)!=0,held);
                    if(routed.Close){menu.Close();presentation=null;mouseVisible=false;}
                    if(routed.Open)
                    {
                        menu.Open(Preferences(state.Settings),state.Available);editingRevision=state.SavedRevision;awaitingRevision=-1;
                        layoutWidth=layoutHeight=0;
                        mouseVisible=false;mouseX=mouseY=-1;mouseDown=Game.GetMouseState().IsLeftButtonDown;Game.GetMouseWheelDelta();
                    }
                    // These are frame-scoped controls, only while visible or
                    // consuming its closing key. No pause/global state is set.
                    if(routed.SuppressGameplay)NativeFunction.Natives.DISABLE_ALL_CONTROL_ACTIONS(0);
                    if(renderFailed){menu.Close();presentation=null;break;}
                    if(menu.Visible)
                    {
                        var recorder=recordingBridge;var recordState=recorder==null?null:recorder.Snapshot;
                        menu.SetRecording(recordState!=null&&recordState.Available,recordState!=null&&recordState.Active,
                            recordState!=null&&recordState.Pending,recordState==null?"SoundMap recorder unavailable":recordState.Detail);
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
                        var size=Game.Resolution;
                        var status=HostMenuStatus.Read(state.StatusJson,DateTime.UtcNow,state.SavedRevision);
                        if(layoutWidth!=size.Width||layoutHeight!=size.Height)
                        {menu.BuildFrame(size.Width,size.Height,status);layoutWidth=size.Width;layoutHeight=size.Height;}
                        MenuAction action=MenuAction.None;
                        if(routed.Action.HasValue){mouseVisible=false;action=menu.Handle(routed.Action.Value);}
                        // Cursor axes are normalized game input, rather than
                        // assuming undocumented MouseState X/Y coordinates.
                        NativeFunction.Natives.SET_MOUSE_CURSOR_THIS_FRAME();
                        float nx=NativeFunction.CallByName<float>("GET_DISABLED_CONTROL_NORMAL",0,(int)GameControl.CursorX),
                            ny=NativeFunction.CallByName<float>("GET_DISABLED_CONTROL_NORMAL",0,(int)GameControl.CursorY);
                        var mouse=Game.GetMouseState();bool click=mouse.IsLeftButtonDown&&!mouseDown;mouseDown=mouse.IsLeftButtonDown;
                        int wheel=Game.GetMouseWheelDelta();
                        if(!Single.IsNaN(nx)&&!Single.IsInfinity(nx)&&!Single.IsNaN(ny)&&!Single.IsInfinity(ny)&&nx>=0&&nx<=1&&ny>=0&&ny<=1)
                        {
                            float x=nx*(size.Width-1),y=ny*(size.Height-1);
                            bool moved=mouseX>=0&&(Math.Abs(x-mouseX)>.75f||Math.Abs(y-mouseY)>.75f);
                            mouseX=x;mouseY=y;if(moved||click||wheel!=0)mouseVisible=true;
                            if(mouseVisible){var pointerAction=menu.Pointer(x,y,click,wheel);if(pointerAction!=MenuAction.None)action=pointerAction;}
                        }
                        if(action==MenuAction.Apply)
                        {
                            var p=menu.Pending;
                            var desired=new AcousticSettings(p.Quality,p.Acceleration,Math.Max(1,editingRevision),p.Enabled,p.OutputLevel,p.EarlyReflections,p.DiagnosticsOverlay);
                            if(service.TryApply(desired,editingRevision)){awaitingRevision=editingRevision;awaitingPreferences=p.With();menu.SetNotice("Saving preferences in the background...");}
                            else menu.SetNotice("Save unavailable or already pending. Preferences have not been applied.",true);
                        }
                        else if(action==MenuAction.Reset)
                        {
                            if(service.TryResetDefaults(state.SavedRevision))
                            {awaitingRevision=state.SavedRevision;awaitingPreferences=MenuPreferences.Defaults;menu.SetNotice("Preserving invalid preferences and restoring defaults...");}
                            else menu.SetNotice("Defaults were not restored. Current files were preserved.",true);
                        }
                        else if(action==MenuAction.StartRecording||action==MenuAction.StopRecording)
                        {
                            if(recorder==null||!recorder.TrySetRecording(action==MenuAction.StartRecording))menu.SetNotice("Recorder unavailable, changed or request pending. Check SoundMap.",true);
                            else awaitingRecording=true;
                        }
                        if(menu.Visible)presentation=menu.BuildFrame(size.Width,size.Height,status);
                        else presentation=null;
                    }
                    else if(story&&!paused&&!console&&state.Settings.DiagnosticsOverlay)
                    {
                        var size=Game.Resolution;presentation=menu.BuildDiagnosticFrame(size.Width,size.Height,
                            HostMenuStatus.Read(state.StatusJson,DateTime.UtcNow,state.SavedRevision));
                    }
                    else presentation=null;
                    if(menu.Visible||routed.SuppressGameplay)GameFiber.Yield();else GameFiber.Sleep(20);
                }
            }
            catch(ThreadAbortException){throw;}
            catch(Exception e){Game.Console.Print("RichAudio settings overlay unavailable: "+e.GetType().Name+". Listener and geometry controls remain separate.");}
            finally{presentation=null;menu.Close();Stop();}
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
            }
            catch(ThreadAbortException){throw;}
            catch{renderFailed=true;presentation=null;}
        }
    }
}
