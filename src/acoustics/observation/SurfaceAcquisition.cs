// Original bounded research contracts, independent of RPH and audio.
using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Threading;
using System.Collections.Generic;
namespace RichAudio.GeometryResearch
{
    [DataContract] public sealed class PlannedRay
    {
        [DataMember] public int Order,Row,Column;
        [DataMember] public double Lateral,Vertical;
        [DataMember] public Point3 Origin,End;
    }
    public static class SurfacePlan
    {
        public const string Id="parallel-wall-grid-3x3-v1";
        public const int Count=9,MaximumCalls=16,AcquisitionTimeoutMs=1000;
        public static PlannedRay[] Create(Point3 player,Point3 forward)
        {
            double h=Math.Sqrt(forward.X*forward.X+forward.Y*forward.Y);
            if(!player.Finite||!forward.Finite||h<.5)throw new InvalidDataException("Invalid fixed pose");
            Point3 d=new Point3(forward.X/h,forward.Y/h,0),right=new Point3(d.Y,-d.X,0);
            var rays=new List<PlannedRay>();
            for(int row=0;row<3;row++)for(int col=0;col<3;col++){
                double x=(col-1)*.75,z=(row-1)*.5;
                Point3 a=new Point3(player.X+x*right.X,player.Y+x*right.Y,player.Z+1+z);
                Point3 b=new Point3(a.X+8*d.X,a.Y+8*d.Y,a.Z);
                if(!a.Finite||!b.Finite)throw new InvalidDataException("Ray outside coordinate bound");
                rays.Add(new PlannedRay{Order=rays.Count,Row=row,Column=col,Lateral=x,Vertical=z,Origin=a,End=b});
            }
            return rays.ToArray();
        }
    }
    // The owner controls readiness, the command may claim once, and completion ends the wait.
    // Stop never resets a consumed acquisition. No RPH fiber or thread is created here.
    public sealed class AcquisitionLifecycle
    {
        private int state,calls,stop;
        private readonly object sync=new object();
        public bool Begin(){lock(sync){if(StopRequested||state!=0)return false;state=1;return true;}}
        public bool IsRunning {get{return Volatile.Read(ref state)==1;}}
        public bool IsTerminal {get{return Volatile.Read(ref state)==2||StopRequested;}}
        public bool StopRequested {get{return Volatile.Read(ref stop)!=0;}}
        public int Calls {get{return Volatile.Read(ref calls);}}
        public bool NextCall(){lock(sync){if(!IsRunning||StopRequested||calls>=SurfacePlan.Count)return false;calls++;return true;}}
        public void Complete(){Interlocked.Exchange(ref state,2);}
        public void RequestStop(){Interlocked.Exchange(ref stop,1);}
    }
    [DataContract] public sealed class SurfaceSample
    {
        [DataMember] public string Id;
        [DataMember] public PlannedRay Ray;
        [DataMember] public GeometryObservation Observation;
    }
    [DataContract] public sealed class SurfaceBatch
    {
        [DataMember] public int SchemaVersion=1;
        [DataMember] public string PlanId=SurfacePlan.Id,SessionId,GameVersion="1.0.1158.16",FrameworkVersion="1.132.1428.17748";
        [DataMember] public string CoordinateSpace="gta-native-units-unverified",TimeUnit="monotonic-ms",Completion="not_executed",ErrorClass;
        [DataMember] public int PlannedQueries=SurfacePlan.Count,TraceCalls;
        [DataMember] public double StartedAtMs,FinishedAtMs,ValidationDurationMs;
        [DataMember] public long ManagedMemoryBytes;
        [DataMember] public Point3 PlayerPosition,Forward;
        [DataMember] public List<SurfaceSample> Samples=new List<SurfaceSample>();
    }
    public static class BatchPersistence
    {
        // Final name is published only after a closed/flushed file. On host termination,
        // a reservation and/or .partial file can remain; neither is a successful batch.
        public static void SaveNew(string path,SurfaceBatch batch)
        {
            string partial=path+".partial";
            using(var stream=new FileStream(partial,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
                new DataContractJsonSerializer(typeof(SurfaceBatch)).WriteObject(stream,batch);stream.Flush(true);
            }
            File.Move(partial,path);
        }
    }
}
