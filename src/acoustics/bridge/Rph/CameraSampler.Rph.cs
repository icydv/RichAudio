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
