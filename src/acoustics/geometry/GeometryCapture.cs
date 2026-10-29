// Bounded acquisition kernel shared by the real RPH adapter and offline fixtures.
// No pipe, file, audio or game API calls except the supplied collision/getter interface.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.Serialization;
using RichAudio.GeometryResearch;
using RichAudio.Beacon.Transport;
namespace RichAudio.GeometryLive
{
    [DataContract] public sealed class ClockPair
    {
        [DataMember(Name="observationMs")] public double ObservationMs;
        [DataMember(Name="listenerTicks")] public long ListenerTicks;
        [DataMember(Name="uncertaintyMs")] public double UncertaintyMs;
    }
    public interface IGeometryClock { double Milliseconds{get;} long Ticks{get;} long Frequency{get;} ClockPair Pair(); }
    public sealed class GeometryClock:IGeometryClock
    {
        private readonly Stopwatch elapsed=Stopwatch.StartNew();
        public double Milliseconds{get{return elapsed.Elapsed.TotalMilliseconds;}} public long Ticks{get{return Stopwatch.GetTimestamp();}}
        public long Frequency{get{return Stopwatch.Frequency;}}
        public ClockPair Pair(){long a=Ticks;double ms=Milliseconds;long b=Ticks;return new ClockPair{ObservationMs=ms,
            ListenerTicks=a+(b-a)/2,UncertaintyMs=((b-a)/2.0+2)*1000.0/Frequency};}
    }
    public sealed class WorldPose {public Point3 Position,Forward;public double Speed;public int Interior;public uint Player;public bool Story,OnFoot,Paused;}
    public sealed class Collision {public bool Hit;public Point3? Position,Normal;public uint? Entity;public string EntityStatus="none_returned_static_unproven";}
    public interface IGeometryWorld {WorldPose ReadPose();Collision Query(PlannedRay ray,uint ignoredPlayer);}
    [DataContract] public sealed class GeometryPacket
    {
        [DataMember] public int Schema=1,SourcePid,Interior;
        [DataMember] public string ListenerSession,GeometrySession,ClockId,Build,Framework,Status,Reason;
        [DataMember] public long ListenerGeneration,Sequence,Frequency,SentTicks;
        [DataMember] public ClockPair[] Pairs;
        [DataMember] public TileGroup[] Groups;
        [DataMember] public TileGroup RejectedGroup;
        [DataMember] public int TotalQueries;
        [DataMember] public double MaximumStepMs,MaximumQueryMs;
    }
    public sealed class SensingSession
    {
        public const int MaximumGroups=8,MaximumQueries=72,MaximumSeconds=12;
        private readonly IGeometryWorld world;private readonly IGeometryClock clock;private readonly Action<GeometryPacket> publish;
        private readonly string listenerSession,session,build,framework;private readonly long listenerGeneration;private readonly int pid;
        private readonly ClockPair first;private readonly double started;private double next,groupCpu;private long sequence;
        private WorldPose anchor;private TileGroup group;private PlannedRay[] rays;private int groups,calls;
        public bool Stopped{get;private set;}public int Calls{get{return calls;}}public string EndReason{get;private set;}
        public double MaximumStepMs{get;private set;}public double MaximumQueryMs{get;private set;}
        public SensingSession(IGeometryWorld world,IGeometryClock clock,ListenerState listener,string geometrySession,int sourcePid,
            string build,string framework,Action<GeometryPacket> publish)
        {
            Protocol.Check(world!=null&&clock!=null&&listener!=null&&publish!=null,"sensing inputs");
            Protocol.Validate(listener);Protocol.Check(listener.Valid&&!listener.Paused&&listener.Coordinates=="gta-native-unscaled","native listener required");
            this.world=world;this.clock=clock;this.publish=publish;listenerSession=listener.Session;listenerGeneration=listener.Generation;
            session=geometrySession;pid=sourcePid;this.build=build;this.framework=framework;first=clock.Pair();started=clock.Milliseconds;
        }
        private static Point3 FloatPoint(Point3 p){return new Point3((float)p.X,(float)p.Y,(float)p.Z);}
        private void Guard(WorldPose p)
        {
            Protocol.Check(p!=null&&p.Story&&p.OnFoot&&!p.Paused&&p.Player>0&&p.Position.Finite&&p.Forward.Finite&&
                ObservationRules.Finite(p.Speed)&&p.Speed>=0&&p.Speed<=.25&&p.Interior>=0,"stationary on-foot Story Mode required");
            if(anchor!=null)Protocol.Check(p.Player==anchor.Player&&p.Interior==anchor.Interior&&
                Point3.Sub(p.Position,anchor.Position).Length<=.05,"player/interior/stationary context changed");
        }
        public void Step(ListenerState listener)
        {
            if(Stopped)return;
            double now=clock.Milliseconds;
            if(now-started>=MaximumSeconds*1000){Stop("duration-limit");return;}
            if(now<next)return;next=now+50; // At most one native query per 50 ms; no catch-up burst.
            var step=Stopwatch.StartNew();
            try{
                Protocol.Check(listener!=null&&listener.Session==listenerSession&&listener.Generation==listenerGeneration&&listener.Valid&&!listener.Paused,"listener context changed");
                WorldPose pose=world.ReadPose();Guard(pose);if(anchor==null)anchor=new WorldPose{Position=pose.Position,Forward=pose.Forward,Player=pose.Player,Interior=pose.Interior};
                if(group==null){
                    if(groups>=MaximumGroups||calls>=MaximumQueries){Stop("query-budget");return;}
                    string kind=groups%2==0?"wall":"ground";groups++;
                    group=new TileGroup{Name=kind,Kind=kind,Session=session,Build=build,Framework=framework,Interior=pose.Interior,
                        Player=pose.Position,Forward=pose.Forward,StartedMs=now};rays=TilePlan.Create(kind,pose.Position,pose.Forward);groupCpu=0;
                }
                Protocol.Check(clock.Milliseconds-group.StartedMs<1000&&clock.Milliseconds-started<MaximumSeconds*1000,"group acquisition deadline");
                Protocol.Check(step.Elapsed.TotalMilliseconds<=25,"getter CPU observation budget exceeded");
                var ray=rays[group.TraceCalls];var watch=Stopwatch.StartNew();double observedAt=clock.Milliseconds;next=observedAt+50;calls++;group.TraceCalls++;
                Collision hit=world.Query(ray,pose.Player);double queryMs=watch.Elapsed.TotalMilliseconds;watch.Restart();
                MaximumQueryMs=Math.Max(MaximumQueryMs,queryMs);
                var o=new GeometryObservation{SessionId=session,GameVersion=build,FrameworkVersion=framework,ObservedAtMs=observedAt,
                    Origin=FloatPoint(ray.Origin),End=FloatPoint(ray.End),IgnoredPlayerHandle=pose.Player,PlayerSpeed=pose.Speed,
                    SetupStatus="on_foot_stationary_by_SDK_getters",TraceCalls=1,TraceDurationMs=queryMs,Completion=hit.Hit?"hit":"miss",
                    QueryProvenance="ACOUSTICS-08.1 bounded live fixed 3x3; RPH world-only; material/extent/static identity unverified"};
                if(hit.Hit){o.HitPosition=hit.Position;o.HitNormal=hit.Normal;o.HitEntityHandle=hit.Entity;o.EntityStatus=hit.EntityStatus;
                    o.PositionStatus=hit.Position.HasValue?"observed":"unavailable";o.NormalStatus=hit.Normal.HasValue?"observed":"unavailable";}
                else{o.EntityStatus="not_returned_miss";o.PositionStatus="not_returned_miss";o.NormalStatus="not_returned_miss";}
                o.ConversionDurationMs=watch.Elapsed.TotalMilliseconds;o.Validation=ObservationRules.Validate(o);
                group.Samples.Add(new SurfaceSample{Id=group.Name+"-ray-"+ray.Order,Ray=ray,Observation=o});
                double stepMs=step.Elapsed.TotalMilliseconds;MaximumStepMs=Math.Max(MaximumStepMs,stepMs);groupCpu+=stepMs;
                Protocol.Check(queryMs<=5&&stepMs<=25&&groupCpu<=60,"native CPU observation budget exceeded");
                Protocol.Check(o.Validation.SurfaceValid,"invalid or incomplete collision support");
                if(group.TraceCalls==9){group.Completion="complete";group.FinishedMs=clock.Milliseconds;Emit("snapshot",null,group);group=null;}
            }catch(Exception e){Stop(e is System.IO.InvalidDataException?e.Message:e.GetType().Name);}
        }
        private void Emit(string status,string reason,TileGroup completed)
        {
            publish(new GeometryPacket{SourcePid=pid,ListenerSession=listenerSession,ListenerGeneration=listenerGeneration,
                GeometrySession=session,ClockId="geometry-"+session,Build=build,Framework=framework,Interior=anchor==null?0:anchor.Interior,
                Sequence=sequence++,Frequency=clock.Frequency,Pairs=new[]{first,clock.Pair()},SentTicks=clock.Ticks,Status=status,Reason=reason,
                Groups=completed==null?new TileGroup[0]:new[]{completed},RejectedGroup=status=="snapshot"?null:group,
                TotalQueries=calls,MaximumStepMs=MaximumStepMs,MaximumQueryMs=MaximumQueryMs});
        }
        public void Stop(string reason){if(Stopped)return;Stopped=true;EndReason=reason;if(group!=null){group.Completion="stopped";group.Error=reason;group.FinishedMs=clock.Milliseconds;}Emit("unavailable",reason,null);}
    }
}
