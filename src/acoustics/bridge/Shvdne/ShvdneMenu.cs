using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;
using GTA;
using GTA.Native;
using RichAudio.Beacon.Windows;
using RichAudio.Settings.InGame;

namespace RichAudio.Integration.Shvdne
{
    // The existing preference model, transitions, hit regions and background
    // storage workers are shared unchanged. Only input and drawing belong here.
    internal sealed class ShvdneMenu
    {
        readonly InGameSettingsBridge preferences;
        readonly InGameRecordingBridge recording;
        readonly AcousticMenuModel model = new AcousticMenuModel();
        readonly MenuInputRouter input = new MenuInputRouter();
        readonly MenuShortcutLatch shortcut = new MenuShortcutLatch();
        readonly MenuTransition transition = new MenuTransition(260);
        readonly HashSet<Keys> pressed = new HashSet<Keys>();
        int stopped;
        long revision, awaiting = -1;
        MenuPreferences desired;
        MenuFrame openFrame;
        bool mouseDown, mouseVisible, firstFrame, awaitingRecording;
        float mouseX = -1, mouseY = -1;
        double nextIdleReset;
        internal ShvdneMenu(string sidecar)
        {
            preferences = new InGameSettingsBridge(sidecar);
            recording = new InGameRecordingBridge(sidecar);
            preferences.Start(); recording.Start();
        }
        static MenuPreferences Preferences(AcousticSettings s)
        { return new MenuPreferences(s.Quality,s.Acceleration,s.RichAudioEnabled,s.OutputLevel,s.EarlyReflections,s.DiagnosticsOverlay,s.IntegrationMode,s.SoundMapVisible,s.MenuToggleKey,s.AirflowEnabled,s.AirflowLevel); }
        internal void KeyDown(Keys key) { if(Volatile.Read(ref stopped)==0)pressed.Add(key); }
        internal void KeyUp(Keys key) { pressed.Remove(key); }
        // SHVDNE suppresses script key events while its console owns input.
        // Physical state also prevents a suppressed key-up from staying latched.
        bool Key(Keys key) { return pressed.Contains(key)&&Game.IsKeyPressed(key); }
        static bool Control(int id) { return Function.Call<bool>(Hash.IS_DISABLED_CONTROL_PRESSED,0,id); }
        static float Axis(int id) { return Function.Call<float>(Hash.GET_DISABLED_CONTROL_NORMAL,0,id); }
        internal void Tick(bool story)
        {
            if(Volatile.Read(ref stopped)!=0)return;
            var state = preferences.Snapshot;
            double now = Stopwatch.GetTimestamp()*1000d/Stopwatch.Frequency;
            bool paused = Game.IsPaused;
            // IS_CONTROL_ENABLED is the public focus signal available to this
            // adapter. It is sampled before our own frame-scoped suppression.
            // SHVDNE does not expose console-open state in API3; coexistence
            // with console/other overlays remains a live UI admission item.
            bool consoleOrOtherFocus = !model.Visible && !Function.Call<bool>(Hash.IS_CONTROL_ENABLED,0,1);
            shortcut.Configure(state.Settings.MenuToggleKey);
            Keys selected, previous;
            Enum.TryParse<Keys>(shortcut.Key,out selected); Enum.TryParse<Keys>(shortcut.PreviousKey,out previous);
            bool controller = state.ControllerEnabled && !Function.Call<bool>(Hash.IS_USING_KEYBOARD_AND_MOUSE,0);
            bool chord = controller && Control(205) && Control(190);
            bool toggle = shortcut.Held(Key(selected),Key(previous),chord);
            var held = new[]{Key(Keys.Up)||controller&&Control(188),Key(Keys.Down)||controller&&Control(187),
                Key(Keys.Left)||controller&&Control(189),Key(Keys.Right)||controller&&Control(190),
                Key(Keys.Enter)||controller&&Control(201),Key(Keys.Escape)||controller&&Control(202)};
            var routed = input.Update(now,story,paused,false,consoleOrOtherFocus,model.Visible,toggle,false,held);
            if(routed.Close){model.Close();mouseVisible=false;}
            if(routed.Open){model.Open(Preferences(state.Settings),state.Available);revision=state.SavedRevision;
                awaiting=-1;desired=null;mouseVisible=false;mouseX=mouseY=-1;mouseDown=Control(237);firstFrame=true;transition.ResetClosed(now);}
            bool eligible=story&&!paused&&!consoleOrOtherFocus;
            if(!eligible){model.Close();transition.ResetClosed(now);openFrame=null;return;}
            bool closingHeld=toggle||Control(237)||Control(238);
            foreach(bool down in held)closingHeld|=down;
            transition.SetOpen(model.Visible,now);
            var motion=transition.Sample(now,closingHeld);
            if(routed.SuppressGameplay||motion.CapturesInput){
                for(int group=0;group<3;group++)Function.Call(Hash.DISABLE_ALL_CONTROL_ACTIONS,group);
                Function.Call(Hash.SET_MOUSE_CURSOR_THIS_FRAME);
                if(now>=nextIdleReset){Function.Call((Hash)0xF4F2C0D4EE209E20UL);Function.Call((Hash)0x9E4CFFF989258472UL);nextIdleReset=now+1000;}
            }
            var size=GTA.UI.Screen.Resolution;
            var status=HostMenuStatus.Read(state.StatusJson,DateTime.UtcNow,state.SavedRevision);
            if(model.Visible){
                var rs=recording.Snapshot;
                model.SetRecording(rs.Available,rs.Active,rs.Pending,rs.Detail);
                model.SetAudioTestRecording(false,false,false,"Audio testing requires separate admission.");
                if(awaitingRecording&&!rs.Pending){awaitingRecording=false;model.SetNotice(rs.Detail,!rs.Available);}
                model.SetWritable(state.Available&&!state.Pending);
                model.SetResetAvailable(state.ResetAvailable&&!state.Pending);
                if(awaiting>=0&&!state.Pending){
                    if(state.Error==null&&state.SavedRevision>awaiting&&desired!=null&&desired.Same(Preferences(state.Settings))){
                        revision=state.SavedRevision;model.Acknowledge(Preferences(state.Settings),"Preferences saved. Engine acknowledgement is shown separately.");awaiting=-1;desired=null;
                    }else if(state.Error!=null||!state.Available||state.SavedRevision>awaiting){model.SetNotice(state.Error??"Preferences changed; reopen settings.",true);awaiting=-1;desired=null;}
                }
                model.BuildFrame(size.Width,size.Height,status);
                MenuAction action=MenuAction.None;
                if(motion.FullyOpen&&routed.Action.HasValue){mouseVisible=false;action=model.Handle(routed.Action.Value);}
                float nx=Axis(239),ny=Axis(240);bool down=Control(237),click=down&&!mouseDown;mouseDown=down;
                int wheel=Function.Call<bool>(Hash.IS_DISABLED_CONTROL_JUST_PRESSED,0,241)?1:Function.Call<bool>(Hash.IS_DISABLED_CONTROL_JUST_PRESSED,0,242)?-1:0;
                if(!Single.IsNaN(nx)&&!Single.IsNaN(ny)&&nx>=0&&nx<=1&&ny>=0&&ny<=1){
                    float x=nx*(size.Width-1),y=ny*(size.Height-1);
                    if(mouseX>=0&&(Math.Abs(x-mouseX)>.75f||Math.Abs(y-mouseY)>.75f)||click||wheel!=0)mouseVisible=true;
                    mouseX=x;mouseY=y;
                    if(motion.FullyOpen&&mouseVisible){var pointer=model.Pointer(x,y,click,wheel);if(pointer!=MenuAction.None)action=pointer;}
                }
                if(action==MenuAction.Apply){var p=model.Pending;
                    var value=new AcousticSettings(p.Quality,p.Acceleration,Math.Max(1,revision),p.Enabled,p.OutputLevel,p.EarlyReflections,p.DiagnosticsOverlay,p.IntegrationMode,p.SoundMapVisible,p.MenuToggleKey,p.AirflowEnabled,p.AirflowLevel);
                    if(preferences.TryApply(value,revision)){awaiting=revision;desired=p.With();model.SetNotice("Saving preferences in the background...");}
                    else model.SetNotice("Save unavailable or already pending.",true);
                }else if(action==MenuAction.Reset){
                    if(preferences.TryResetDefaults(state.SavedRevision)){awaiting=state.SavedRevision;desired=MenuPreferences.Defaults;model.SetNotice("Restoring defaults in the background...");}
                    else model.SetNotice("Defaults were not restored.",true);
                }else if(action==MenuAction.StartRecording||action==MenuAction.StopRecording){
                    awaitingRecording=recording.TrySetRecording(action==MenuAction.StartRecording);
                    if(!awaitingRecording)model.SetNotice("SoundMap recorder unavailable or request pending.",true);
                }else if(action==MenuAction.StartAudioTest||action==MenuAction.StopAudioTest)model.SetNotice("Audio testing requires separate admission.",true);
                if(model.Visible)openFrame=model.BuildFrame(size.Width,size.Height,status);
            }
            if(firstFrame&&model.Visible){transition.ResetClosed(now);motion=transition.Sample(now,closingHeld);}
            if(openFrame!=null&&(motion.Visible||firstFrame)){
                Draw(MenuTransition.Present(openFrame,motion,size.Width,size.Height,mouseX,mouseY,mouseVisible),size.Width,size.Height);
                if(firstFrame){firstFrame=false;transition.SetOpen(true,Stopwatch.GetTimestamp()*1000d/Stopwatch.Frequency);}
            }else if(state.Settings.DiagnosticsOverlay&&!motion.CapturesInput)Draw(model.BuildDiagnosticFrame(size.Width,size.Height,status),size.Width,size.Height);
        }
        static void Draw(MenuFrame frame,int width,int height)
        {
            if(width<=0||height<=0)return;
            foreach(var c in frame.Commands){
                var color=System.Drawing.Color.FromArgb(c.Argb);
                if(c.Kind==DrawCommandKind.Rectangle)Function.Call(Hash.DRAW_RECT,(c.X+c.Width/2)/width,(c.Y+c.Height/2)/height,c.Width/width,c.Height/height,color.R,color.G,color.B,color.A,false);
                else {
                    // Native font metrics differ from RPH's Arial renderer;
                    // layout and typography require visual admission at .16.
                    Function.Call(Hash.SET_TEXT_FONT,0);Function.Call(Hash.SET_TEXT_SCALE,0f,c.FontSize/height*2.25f);
                    Function.Call(Hash.SET_TEXT_COLOUR,color.R,color.G,color.B,color.A);Function.Call(Hash.SET_TEXT_CENTRE,false);
                    Function.Call(Hash.SET_TEXT_WRAP,0f,1f);Function.Call(Hash.BEGIN_TEXT_COMMAND_DISPLAY_TEXT,"STRING");
                    Function.Call(Hash.ADD_TEXT_COMPONENT_SUBSTRING_PLAYER_NAME,c.Text);Function.Call(Hash.END_TEXT_COMMAND_DISPLAY_TEXT,c.X/width,c.Y/height,0);
                }
            }
        }
        internal void Stop()
        {
            // Aborted may run on the domain thread. Do not touch the callback-
            // owned model, input sets or draw frame from here.
            if(Interlocked.Exchange(ref stopped,1)!=0)return;
            preferences.RequestStop();recording.RequestStop();
            ThreadPool.QueueUserWorkItem(delegate{preferences.Dispose();recording.Dispose();});
        }
    }
}
