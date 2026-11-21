using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using Rage;
using Rage.Attributes;
using Rage.Native;
using RichAudio.Beacon.Transport;

[assembly:Plugin("RichAudio Listener Beacon Bridge",Author="RichAudio",Description="ACOUSTICS-07 opt-in read-only camera listener; no game sound ownership",EntryPoint="RichAudio.Beacon.Rph.ListenerBridge.Main",ExitPoint="RichAudio.Beacon.Rph.ListenerBridge.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]
namespace RichAudio.Beacon.Rph
{
    public static class ListenerBridge
    {
        private static volatile bool ready,requested,shutdown;
        private static StatePublisher publisher;
        private static TransportResult lastTransport; private static long lastSent;
        private static readonly SessionPermit permit=new SessionPermit();
        private static long observations,missed;
        private static int starts;
        private const int MaximumStarts=1,MaximumSeconds=120;
        [ConsoleCommand(Name="RichAudioBeaconStart",Description="Read camera listener at 20 Hz for at most 120 seconds; no game mutations")]
        public static void Start(){if(ready&&permit.TryConsume())requested=true;}
        [ConsoleCommand(Name="RichAudioBeaconStop",Description="Stop listener telemetry; host freshness gate fades its owned beacon")]
        public static void Stop(){requested=false;}
        [ConsoleCommand(Name="RichAudioBeaconStatus",Description="Print listener counters only; no world coordinates")]
        public static void Status(){var p=publisher;var d=p==null?lastTransport:p.Diagnostic;var expired=p==null?(d==null?null:d.FirstExpiredUnsent):p.FirstExpiredUnsent;Game.Console.Print("RichAudio beacon bridge ready="+ready+" requested="+requested+" observations="+Interlocked.Read(ref observations)+" missed="+Interlocked.Read(ref missed)+" sent="+(p==null?lastSent:p.Sent)+" attempts="+(p==null?(d==null?0:d.Connection):p.Attempts)+" terminal="+(d==null?"none":d.Stage+"/"+d.Code+"/"+d.Outcome)+" expiredUnsentBefore="+(p==null?(d==null?0:d.ExpiredBeforeEncoding):p.ExpiredBeforeEncoding)+" expiredUnsentAfter="+(p==null?(d==null?0:d.ExpiredAfterEncoding):p.ExpiredAfterEncoding)+" firstExpiredAgeMs="+(expired==null?"none":expired.AgeMs.ToString("F3",System.Globalization.CultureInfo.InvariantCulture))+"; one Start per plugin instance; no native audio control.");}
        public static void Main()
        {
            try
            {
                // Compile success is not runtime compatibility. A new runtime/build needs separate review.
                string exe=Process.GetCurrentProcess().MainModule.FileName;
                if(!Path.GetFileName(exe).Equals("GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||FileVersionInfo.GetVersionInfo(exe).FileVersion!="1.0.1158.16"||FileVersionInfo.GetVersionInfo(typeof(Game).Assembly.Location).FileVersion!="1.132.1428.17748")
                    throw new NotSupportedException("Reviewed exact-build guard");
                ready=true;Game.Console.Print("RichAudio beacon listener READY, sending OFF. One Start and one connection attempt per plugin instance; 120 second cap. No sound or world mutation.");
                while(!shutdown)
                {
                    if(!requested){GameFiber.Sleep(25);continue;}
                    if(starts>=MaximumStarts){requested=false;continue;}
                    starts++;RunSession();requested=false;
                }
            }
            catch(ThreadAbortException){throw;}
            catch(Exception e){Game.Console.Print("RichAudio beacon bridge stopped: "+e.GetType().Name);}
            finally{ready=false;requested=false;var p=publisher;if(p!=null){p.RequestStop();ThreadPool.QueueUserWorkItem(delegate{p.Dispose();});}publisher=null;}
        }
        private static void RunSession()
        {
            string session=Guid.NewGuid().ToString("N");long sequence=0,generation=1,lastGame=-1,lastTick=0;double[] lastPosition=null;bool? lastPause=null;
            long start=Stopwatch.GetTimestamp();double next=start,period=Stopwatch.Frequency/20.0;
            var writer=new StatePublisher(Protocol.DefaultPipe,1,true);
            try
            {
                publisher=writer;writer.Start();
                while(requested&&!shutdown&&(Stopwatch.GetTimestamp()-start)/(double)Stopwatch.Frequency<MaximumSeconds)
                {
                    long now=Stopwatch.GetTimestamp();if(now<next){GameFiber.Sleep(5);continue;}
                    long skipped=(long)Math.Floor((now-next)/period);if(skipped>0)Interlocked.Add(ref missed,skipped);next+=(skipped+1)*period;
                    try
                    {
                        // Supported getters only; no collisions, entities, audio setters or reverse command channel.
                        if(NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))break;
                        long before=Stopwatch.GetTimestamp();Vector3 position=NativeFunction.CallByName<Vector3>("GET_FINAL_RENDERED_CAM_COORD");
                        Vector3 rotation=NativeFunction.CallByName<Vector3>("GET_FINAL_RENDERED_CAM_ROT",2);
                        uint game=NativeFunction.CallByName<uint>("GET_GAME_TIMER");bool paused=Game.IsPaused;long after=Stopwatch.GetTimestamp(),observed=before+(after-before)/2;
                        double[] forward,up;CameraBasis.FromZxyDegrees(rotation.X,rotation.Y,rotation.Z,out forward,out up);
                        double[] p={position.X,position.Y,position.Z},v={0,0,0};string velocityKind="unavailable";bool valid=true;string reason="valid";
                        if(game<lastGame||(lastPause.HasValue&&lastPause.Value!=paused)){generation++;lastPosition=null;}
                        if(lastPosition!=null&&!paused)
                        {
                            double dt=(observed-lastTick)/(double)Stopwatch.Frequency;
                            if(dt>0&&dt<=0.25){for(int k=0;k<3;k++)v[k]=(p[k]-lastPosition[k])/dt;velocityKind="estimated-camera-difference";}
                            else{generation++;valid=false;reason="observation-gap";}
                            for(int k=0;k<3;k++)if(!Protocol.Finite(v[k])||Math.Abs(v[k])>1000){generation++;v=new double[3];velocityKind="unavailable";valid=false;reason="camera-discontinuity";break;}
                        }
                        if((after-before)/(double)Stopwatch.Frequency>0.05){generation++;valid=false;reason="slow-observation";}
                        var state=new ListenerState{Version=1,Session=session,Generation=generation,Sequence=sequence++,ObservationTicks=observed,ClockFrequency=Stopwatch.Frequency,GameTimeMs=game,Position=p,Velocity=v,Forward=forward,Up=up,ListenerKind="camera",VelocityKind=velocityKind,Paused=paused,Valid=valid,Reason=reason,Coordinates="gta-native-unscaled",Units="native-unverified",SourceId=null};
                        writer.Publish(state);Interlocked.Increment(ref observations);lastPosition=p;lastTick=observed;lastGame=game;lastPause=paused;
                    }
                    catch(ThreadAbortException){throw;}
                    catch{break;} // Missing native/invalid state stops emission; host rejects stale state and fades.
                    if(writer.Finished)break; // Exhausted bounded reconnect budget; no endless retry on the game thread.
                    GameFiber.Yield();
                }
                writer.RequestStop();
                // Do not wait for pipe I/O on the game fiber. Poll its bounded exit before Dispose.
                long stoppingAt=Stopwatch.GetTimestamp();while(!writer.Finished&&!shutdown&&(Stopwatch.GetTimestamp()-stoppingAt)/(double)Stopwatch.Frequency<1)GameFiber.Sleep(5);
                lastTransport=writer.Diagnostic;lastSent=writer.Sent;
            }
            finally{writer.RequestStop();ThreadPool.QueueUserWorkItem(delegate{writer.Dispose();});}
            publisher=null;Game.Console.Print("RichAudio beacon listener stopped. Terminal="+(lastTransport==null?"unknown":lastTransport.Stage+"/"+lastTransport.Code+"/"+lastTransport.Outcome)+"; another Start is disabled. No world state to restore.");
        }
        public static void OnUnload(){ready=false;requested=false;shutdown=true;var p=publisher;if(p!=null)p.RequestStop();}
    }
}
