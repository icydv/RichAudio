using System;
using System.Diagnostics;
using Rage;
using Rage.Native;
using RichAudio.Beacon.Transport;

namespace RichAudio.Beacon.Rph
{
    // Both game fibers execute cooperatively; a shared 25 ms getter cache reduces
    // repeated native observations while preserving their original sample time.
    internal sealed class CameraObservation
    {
        internal long Before,After,Observed,UnixMs;internal uint GameTime;internal bool Paused;
        internal double[] Position,Forward,Up;
    }
    // Camera translation is presentation state, not a physical player velocity.
    // A bounded, well-formed cut starts a new spatial generation; its frame is
    // consumed privately and never published. Only a later independent camera
    // acquisition can restore a measured difference within that generation.
    internal sealed class CameraListenerTracker
    {
        internal sealed class Decision
        {
            internal CameraObservation Previous,Current;
            internal long Sequence,Generation;
            internal double? Dt,SpeedSquared;
            internal double[] Delta,Velocity;
            internal bool Publish,Terminal;
            internal string Classification;
            internal ListenerState Listener;
        }
        CameraObservation previous;
        long sequence,generation=1;
        static bool Vector(double[] v,double bound)
        {if(v==null||v.Length!=3)return false;foreach(double x in v)if(!Protocol.Finite(x)||Math.Abs(x)>bound)return false;return true;}
        static double Dot(double[] a,double[] b){double sum=0;for(int i=0;i<3;i++)sum+=a[i]*b[i];return sum;}
        static bool Same(double[] a,double[] b)
        {if(a==null||b==null||a.Length!=b.Length)return false;for(int i=0;i<a.Length;i++)if(a[i]!=b[i])return false;return true;}
        internal Decision Observe(string session,CameraObservation camera)
        {
            var d=new Decision{Previous=previous,Current=camera,Sequence=sequence,Generation=generation,
                Classification="listener-continuous",Publish=true};
            if(previous!=null&&camera!=null){
                d.Dt=(camera.Observed-previous.Observed)/(double)Stopwatch.Frequency;
                if(camera.Position!=null&&camera.Position.Length==3&&previous.Position!=null&&previous.Position.Length==3){
                    d.Delta=new double[3];for(int i=0;i<3;i++)d.Delta[i]=camera.Position[i]-previous.Position[i];
                    if(d.Dt>0){d.Velocity=new double[3];double sum=0;for(int i=0;i<3;i++){d.Velocity[i]=d.Delta[i]/d.Dt.Value;sum+=d.Velocity[i]*d.Velocity[i];}d.SpeedSquared=sum;}
                }
            }
            string invalid=null;
            if(camera==null||camera.Before<0||camera.After<camera.Before||camera.Observed<camera.Before||camera.Observed>camera.After
                ||camera.Observed!=camera.Before+(camera.After-camera.Before)/2
                ||(decimal)(camera.After-camera.Before)*1000/Stopwatch.Frequency>10)invalid="listener-acquisition-invalid";
            else if(!Vector(camera.Position,1000000)||!Vector(camera.Forward,1.00001)||!Vector(camera.Up,1.00001)
                ||Math.Abs(Math.Sqrt(Dot(camera.Forward,camera.Forward))-1)>=.0001
                ||Math.Abs(Math.Sqrt(Dot(camera.Up,camera.Up))-1)>=.0001||Math.Abs(Dot(camera.Forward,camera.Up))>=.0001)invalid="listener-pose-invalid";
            else if(camera.Paused)invalid="listener-paused";
            else if(previous!=null&&d.Dt==0){
                if(camera.Before!=previous.Before||camera.After!=previous.After||camera.GameTime!=previous.GameTime||camera.Paused!=previous.Paused
                    ||!Same(camera.Position,previous.Position)||!Same(camera.Forward,previous.Forward)||!Same(camera.Up,previous.Up))invalid="listener-same-time-changed-observation";
                else {d.Publish=false;d.Classification="listener-cached-observation";}
            }
            else if(previous!=null&&(d.Dt<0||d.Dt>.25))invalid="listener-time-discontinuous";
            else if(previous!=null&&d.Dt<.001)invalid="listener-interval-too-small";
            else if(d.SpeedSquared.HasValue&&!Protocol.Finite(d.SpeedSquared.Value))invalid="listener-numerical-velocity-invalid";
            else if(previous!=null&&(d.SpeedSquared>10000||camera.GameTime<previous.GameTime
                ||camera.Paused!=previous.Paused||Dot(camera.Forward,previous.Forward)<=-.99||Dot(camera.Up,previous.Up)<=-.99)){
                d.Publish=false;d.Classification=d.SpeedSquared>10000?"listener-position-discontinuity":camera.GameTime<previous.GameTime?
                    "listener-game-clock-transition":"listener-orientation-discontinuity";
                d.Generation=++generation;
            }
            if(invalid!=null){d.Publish=false;d.Terminal=true;d.Classification=invalid;return d;}
            // Zero components with unavailable provenance are only an initial
            // condition, or private discarded state. They never describe travel
            // across a camera cut. Subsequent published velocity is measured
            // solely from the two observations in the current generation.
            d.Listener=new ListenerState{Version=1,Session=session,Generation=generation,Sequence=sequence++,
                ObservationTicks=camera.Observed,ClockFrequency=Stopwatch.Frequency,GameTimeMs=camera.GameTime,
                Position=camera.Position,Velocity=d.Publish&&previous!=null&&d.Velocity!=null?d.Velocity:new double[]{0,0,0},
                Forward=camera.Forward,Up=camera.Up,ListenerKind="camera",
                VelocityKind=d.Publish&&previous!=null&&d.Velocity!=null?"estimated-camera-difference":"unavailable",
                Paused=false,Valid=true,Reason="valid",Coordinates="gta-native-unscaled",Units="native-unverified",SourceId=null};
            previous=camera;return d;
        }
    }
    internal static class CameraSampler
    {
        private static CameraObservation cached;
        internal static bool StoryReady()
        {
            if(Game.IsLoading||NativeFunction.CallByName<bool>("NETWORK_IS_SESSION_STARTED")||NativeFunction.CallByName<bool>("NETWORK_IS_GAME_IN_PROGRESS"))return false;
            int player=NativeFunction.CallByName<int>("PLAYER_ID"),ped=NativeFunction.CallByName<int>("PLAYER_PED_ID");
            return ped!=0&&NativeFunction.CallByName<bool>("IS_PLAYER_PLAYING",player)&&NativeFunction.CallByName<bool>("DOES_ENTITY_EXIST",ped)&&!NativeFunction.CallByName<bool>("IS_PLAYER_SWITCH_IN_PROGRESS");
        }
        internal static CameraObservation Read()
        {
            long now=Stopwatch.GetTimestamp();if(cached!=null&&(now-cached.After)/(double)Stopwatch.Frequency<0.025)return cached;
            long before=Stopwatch.GetTimestamp();Vector3 position=NativeFunction.CallByName<Vector3>("GET_FINAL_RENDERED_CAM_COORD");
            Vector3 rotation=NativeFunction.CallByName<Vector3>("GET_FINAL_RENDERED_CAM_ROT",2);
            uint game=NativeFunction.CallByName<uint>("GET_GAME_TIMER");bool paused=Game.IsPaused;
            long after=Stopwatch.GetTimestamp(),observed=before+(after-before)/2;
            double[] forward,up;CameraBasis.FromZxyDegrees(rotation.X,rotation.Y,rotation.Z,out forward,out up);
            long unix=(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds-(long)((after-observed)*1000.0/Stopwatch.Frequency);
            cached=new CameraObservation{Before=before,After=after,Observed=observed,UnixMs=unix,GameTime=game,Paused=paused,Position=new[]{(double)position.X,position.Y,position.Z},Forward=forward,Up=up};return cached;
        }
    }
}
