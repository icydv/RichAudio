using System;
using System.Diagnostics;
using System.Threading;
using Rage;
using Rage.Attributes;
using RichAudio.Beacon.Windows;

namespace RichAudio.Beacon.Rph
{
    internal static class PassiveListener
    {
        private static PassiveSoundMapBridge bridge;private static volatile bool stopping;
        internal static void Start()
        {
            stopping=false;
#if PLAYABLE_PRODUCT
            bridge=new PassiveSoundMapBridge(InGameSettingsLink.SidecarForGameExecutable(Process.GetCurrentProcess().MainModule.FileName),true);
#else
            bridge=new PassiveSoundMapBridge(InGameSettingsLink.SidecarForGameExecutable(Process.GetCurrentProcess().MainModule.FileName));
#endif
            bridge.Start();
            GameFiber.StartNew(Run,"RichAudio passive camera");
        }
        [ConsoleCommand(Name="RichAudioSoundMapStatus",Description="Passive camera feed status; no audio or sensing starts")]
        public static void Status(){var b=bridge;Game.Console.Print("RichAudio SoundMap "+(b==null?"stopped":b.Diagnostic)+"; camera-only, native scale unverified.");}
        private static void Run()
        {
            long sequence=0,generation=1,lastGame=-1;bool previous=false;
            try{
                while(!stopping){
                    var b=bridge;if(b==null)break;if(!b.Enabled){GameFiber.Sleep(100);continue;}bool story=CameraSampler.StoryReady();b.SetStoryReady(story);
                    if(previous!=story){generation++;previous=story;}
                    if(story){var o=CameraSampler.Read();if(o.GameTime<lastGame)generation++;lastGame=o.GameTime;
                        bool valid=!o.Paused&&(o.After-o.Before)/(double)Stopwatch.Frequency<=0.05;
                        b.Publish(new PassiveCameraSample{Sequence=sequence++,Generation=generation,ObservationTicks=o.Observed,ObservedAtUnixMs=o.UnixMs,Position=o.Position,Forward=o.Forward,Up=o.Up,Velocity=null,Valid=valid,Reason=o.Paused?"paused":valid?"passive-native-camera":"slow-observation"});}
                    GameFiber.Sleep(Math.Max(1,1000/b.SampleHz));
                }
            }catch(ThreadAbortException){throw;}catch(Exception e){Game.Console.Print("RichAudio passive camera stopped: "+e.GetType().Name);}
        }
        internal static void Stop(){stopping=true;var b=bridge;bridge=null;if(b!=null){b.RequestStop();ThreadPool.QueueUserWorkItem(delegate{try{b.Dispose();}catch(Exception e){Trace.WriteLine("RichAudio passive cleanup: "+e.GetType().Name);}});}}
    }
}
