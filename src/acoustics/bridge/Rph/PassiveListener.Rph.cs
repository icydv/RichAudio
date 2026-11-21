using System;
using System.Diagnostics;
using System.Threading;
using Rage;
using Rage.Attributes;
using RichAudio.Beacon.Transport;
using RichAudio.Beacon.Windows;

#if SOUND_MAP_VIEW_ONLY
[assembly:Plugin("RichAudio",Author="RichAudio",Description="Read-only SoundMap camera and interior observation.",EntryPoint="RichAudio.Beacon.Rph.SoundMapViewEntry.Main",ExitPoint="RichAudio.Beacon.Rph.SoundMapViewEntry.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
#endif
namespace RichAudio.Beacon.Rph
{
#if SOUND_MAP_VIEW_ONLY
    public static class SoundMapViewEntry
    {
        private static int started;
        private static volatile bool stopping;
        public static void Main(){
            if(Interlocked.Exchange(ref started,1)!=0)return;
            try{PassiveListener.Start();while(!stopping)GameFiber.Sleep(100);}
            finally{OnUnload();}
        }
        public static void OnUnload(){stopping=true;PassiveListener.Stop();}
    }
#endif
    internal static class PassiveListener
    {
        private static PassiveSoundMapBridge bridge;private static volatile bool stopping;
        internal static void Start()
        {
            stopping=false;
#if SOUND_MAP_VIEW_ONLY
            bridge=new PassiveSoundMapBridge(InGameSettingsLink.SidecarForGameExecutable(Process.GetCurrentProcess().MainModule.FileName),viewOnlyMap:true);
#elif PLAYABLE_PRODUCT
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
#if SOUND_MAP_VIEW_ONLY
            RunMap();
#else
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
#endif
        }
#if SOUND_MAP_VIEW_ONLY
        private static void RunMap()
        {
            var tracker=new CameraListenerTracker();
            CameraObservation last=null;
            long sequence=0,generation=1;
            bool invalidated=false;
            try{
                while(!stopping){
                    var b=bridge;
                    if(b==null)break;
                    if(!b.Enabled){GameFiber.Sleep(100);continue;}
                    bool story=CameraSampler.StoryReady();
                    b.SetStoryReady(story);
                    var camera=story?CameraSampler.Read():last;
                    if(camera!=null){
                        var decision=story?tracker.Observe("view-only-camera",camera):null;
                        if(decision!=null)generation=decision.Generation;
                        if(decision!=null&&decision.Publish){
                            CameraInteriorReadback raw;
                            CameraSampler.ObserveInterior(decision.Listener,out raw);
                            b.Publish(MapSample(camera,sequence++,decision.Generation,true,"passive-native-camera",raw));
                            invalidated=false;
                            last=camera;
                        }else if((decision==null||decision.Classification!="listener-cached-observation")&&!invalidated){
                            if(decision==null||decision.Terminal)tracker.Invalidate();
                            b.Publish(MapSample(camera,sequence++,generation,false,
                                decision==null?"story-mode-unavailable":decision.Classification,null));
                            invalidated=true;
                        }else if(decision!=null&&decision.Terminal)tracker.Invalidate();
                    }
                    GameFiber.Sleep(Math.Max(1,1000/b.SampleHz));
                }
            }catch(ThreadAbortException){throw;}catch(Exception e){Game.Console.Print("RichAudio map camera stopped: "+e.GetType().Name);}
        }
        private static PassiveCameraSample MapSample(CameraObservation camera,long sequence,long generation,bool valid,string reason,CameraInteriorReadback raw)
        {
            return new PassiveCameraSample{Sequence=sequence,Generation=generation,ObservationTicks=camera.Observed,
                ObservedAtUnixMs=camera.UnixMs,Position=camera.Position,Forward=camera.Forward,Up=camera.Up,
                Valid=valid,Reason=reason,InteriorOutcome=raw==null?null:raw.Outcome,InteriorProxy=raw==null?null:raw.Proxy,
                InteriorReady=raw==null?null:raw.Ready,InteriorArchetype=raw==null?null:raw.Archetype,
                InteriorOrigin=raw==null?null:raw.Origin,
                InteriorOffsetMs=raw==null?(double?)null:(raw.SampleTicks-camera.Observed)*1000.0/Stopwatch.Frequency};
        }
#endif
        internal static void Stop(){stopping=true;var b=bridge;bridge=null;if(b!=null){b.RequestStop();ThreadPool.QueueUserWorkItem(delegate{try{b.Dispose();}catch(Exception e){Trace.WriteLine("RichAudio passive cleanup: "+e.GetType().Name);}});}}
    }
}
