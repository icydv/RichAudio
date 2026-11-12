using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using RichAudio.Beacon.Transport;

namespace RichAudio.Integration
{
    public sealed class SharedFrameSampler
    {
        sealed class Tracked
        {
            internal string Id, Context;
            internal uint Model;
            internal int Generation = 1;
            internal long Ticks;
            internal long LastSeen;
            internal double[] Position;
        }
        sealed class Candidate
        {
            internal int Handle;
            internal bool Player, Existing;
            internal double Distance;
            internal GameplayVehicle Wire;
            internal GameplayVehicleObservation02 Observation;
        }
        readonly string session;
        readonly IGameObservationSource source;
        readonly Func<uint, string, bool> allows;
        readonly int maximum;
        readonly Func<long> now;
        readonly Dictionary<int, Tracked> tracked = new Dictionary<int, Tracked>();
        readonly CameraListenerTracker listener = new CameraListenerTracker();
        int[] discovered = new int[0];
        long nextDiscovery, instance;
        int cursor;
        public readonly ObservationTiming02 Timing;
        public StartupTrace02B StartupTrace {get;set;}
        public bool IncludeTransportObservations;
        public string LastStatus { get; private set; }
        public VehicleObservation[] LastObservations { get; private set; }
        public long Captures, MissingOperatingPoints, Retirements, GetterFailures, OverBudget;
        public double MaximumObservationMs { get; private set; }
        public string WorldPreparationStartedUtc { get; set; }

        public SharedFrameSampler(string session, IGameObservationSource source, Func<uint, string, bool> allows, int maximum, Func<long> monotonicNow = null)
        {
            if (source == null || allows == null || maximum < 1 || maximum > GameplayWire.MaximumVehicles)
                throw new ArgumentException("sampler configuration");
            this.session = session; this.source = source; this.allows = allows; this.maximum = maximum;
            now = monotonicNow ?? Stopwatch.GetTimestamp;Timing=new ObservationTiming02(now);
            LastStatus = "not-sampled"; LastObservations = new VehicleObservation[0];
        }
        public void Invalidate()
        {
            Retirements += tracked.Count; tracked.Clear(); discovered = new int[0];
            nextDiscovery = 0; cursor = 0; listener.Invalidate(); LastObservations = new VehicleObservation[0];
        }
        static bool Vector(double[] v, double bound)
        {
            if (v == null || v.Length != 3) return false;
            foreach (double x in v) if (!Protocol.Finite(x) || Math.Abs(x) > bound) return false;
            return true;
        }
        static double Distance(double[] a, double[] b)
        { double s = 0; for (int i = 0; i < 3; i++) s += (a[i] - b[i]) * (a[i] - b[i]); return Math.Sqrt(s); }
        static double Dot(double[] a, double[] b)
        { double s = 0; for (int i = 0; i < 3; i++) s += a[i] * b[i]; return s; }
        static bool ValidPose(VehicleObservation o)
        {
            return Vector(o.Position, 100000) && Vector(o.Velocity, 100000) && Vector(o.Forward, 1.00001) &&
                Vector(o.Up, 1.00001) && Dot(o.Velocity, o.Velocity) <= 10000 &&
                Math.Abs(Math.Sqrt(Dot(o.Forward, o.Forward)) - 1) < .0001 &&
                Math.Abs(Math.Sqrt(Dot(o.Up, o.Up)) - 1) < .0001 && Math.Abs(Dot(o.Forward, o.Up)) < .0001;
        }
        void Retire(int handle)
        { if (tracked.Remove(handle)) Retirements++; }

        public GameplayFrame Capture()
        {
            long began=now(),allocation=ObservationTiming02.AllocationStart(),cameraTicks=0,enumerationTicks=0,getterTicks=0;int count=0;var trace=StartupTrace;bool returned=false;string traceException=null;if(trace!=null)trace.Begin(began);
            try { Captures++; LastObservations = new VehicleObservation[0];
            bool ready;if(trace!=null)trace.Mark(ObservationStage02B.Other);try{ready=source.StoryReady;}finally{if(trace!=null)trace.Mark(ObservationStage02B.Readiness);}
            if (!ready) { LastStatus = "story-not-ready"; Invalidate();if(trace!=null)trace.Mark(ObservationStage02B.EarlyReturn); return null; }
            long cameraBegan=now();CameraObservation camera;CameraListenerTracker.Decision decision;
            try{camera=source.ReadCamera();if(trace!=null)trace.Mark(ObservationStage02B.CameraManaged);try{decision=listener.Observe(session,camera);}finally{if(trace!=null)trace.Mark(ObservationStage02B.ListenerValidation);}}finally{cameraTicks=now()-cameraBegan;Timing.CameraListener.Add(ObservationTiming02.Ms(cameraTicks));if(trace!=null)trace.Mark(ObservationStage02B.Instrumentation);}
            LastStatus = decision.Classification;
            if (decision.Terminal) { Invalidate();if(trace!=null)trace.Mark(ObservationStage02B.EarlyReturn); return null; }
            if (!decision.Publish){if(trace!=null)trace.Mark(ObservationStage02B.EarlyReturn);return null;}
            CameraInteriorReadback raw = null;
            GameplayInterior interior;try{interior=source.ReadCameraInterior(decision.Listener,out raw);}finally{if(trace!=null)trace.Mark(ObservationStage02B.Interior);}
            // Interior activation retains the existing preparation-epoch contract.
            if (WorldPreparationStartedUtc == null) interior = null;
            var handles = new List<int>(maximum + 8);
            int player = source.PlayerVehicleHandle;
            if (player != 0) handles.Add(player);
            foreach (int h in new List<int>(tracked.Keys))
                if (!handles.Contains(h)) handles.Add(h);
            if(trace!=null)trace.Mark(ObservationStage02B.PlayerTrackedHandles);
            if (began >= nextDiscovery)
            {
                long enumerationBegan=now();try{discovered=source.DiscoverVehicles(camera.Position,600)??new int[0];}finally{enumerationTicks=now()-enumerationBegan;if(trace!=null)trace.Mark(ObservationStage02B.Discovery);Timing.Enumeration.Add(ObservationTiming02.Ms(enumerationTicks));if(trace!=null)trace.Mark(ObservationStage02B.Instrumentation);}
                cursor = 0; nextDiscovery = began + Stopwatch.Frequency;
            }
            for (int n = 0; n < 8 && cursor < discovered.Length; n++)
            {
                int h = discovered[cursor++]; if (h != 0 && !handles.Contains(h)) handles.Add(h);
            }
            if(trace!=null)trace.Mark(ObservationStage02B.HandleCandidates);
            var result = new List<GameplayVehicle>(maximum);
            var observed = new List<VehicleObservation>(maximum);
            var candidates = new List<Candidate>(maximum + 8);
            foreach (int handle in handles)
            {
                if (now() - began > Stopwatch.Frequency / 100) break;
                try
                {
                    if(trace!=null)trace.Mark(ObservationStage02B.Other);long getterBegan=now();VehicleObservation o;try{o=source.ReadVehicle(handle);}finally{getterTicks+=now()-getterBegan;if(trace!=null)trace.Mark(ObservationStage02B.VehicleGetters);}count++;
                    if (o == null || o.Handle != handle || !o.Exists || o.Dead || o.Failure != null)
                    { Retire(handle); continue; }
                    observed.Add(o);
                    if (o.Before < 0 || o.After < o.Before || o.Observed != o.Before + (o.After - o.Before) / 2 ||
                        o.After - o.Before > Stopwatch.Frequency / 100 ||
                        Math.Abs((decimal)o.Observed - camera.Observed) > Stopwatch.Frequency / 20m || !ValidPose(o))
                    { LastStatus = "vehicle-observation-invalid"; continue; }
                    double distance = Distance(o.Position, camera.Position);
                    if (distance > 600 && !o.PlayerDriver) { Retire(handle); continue; }
                    string context = o.PlayerDriver ? "player" : "npc";
                    Tracked t;
                    bool existing = tracked.TryGetValue(handle, out t);
                    if (existing && (t.Model != o.Model || o.Observed <= t.LastSeen || o.Observed - t.LastSeen > Stopwatch.Frequency / 4))
                    { Retire(handle); t = null; existing = false; }
                    if (t == null)
                    {
                        if (!allows(o.Model, context)) continue;
                        t = new Tracked { Id = "shvdne-" + (++instance), Model = o.Model, Context = context };
                        tracked[handle] = t;
                    }
                    // Context is fixed at creation: mounting/dismounting changes
                    // attachment, not the selected source bank or its history.
                    if (!allows(o.Model, t.Context)) { Retire(handle); continue; }
                    t.LastSeen = o.Observed;
                    var candidate = new Candidate { Handle = handle, Player = o.PlayerDriver, Existing = existing, Distance = distance };
                    candidates.Add(candidate);
                    // Retain the original synthesis history when its provider
                    // is missing. Only diagnostic transport tracks pose alone.
                    if(!IncludeTransportObservations&&(!o.RpmRatio.HasValue||!Protocol.Finite(o.RpmRatio.Value)||o.RpmRatio<0||o.RpmRatio>1))
                    {MissingOperatingPoints++;LastStatus="vehicle-operating-point-unavailable";continue;}
                    if (t.Position != null && o.Observed <= t.Ticks) { Retire(handle); LastStatus = "vehicle-time-reversed"; continue; }
                    if (t.Position != null && (o.Observed - t.Ticks > Stopwatch.Frequency / 4 ||
                        Distance(t.Position, o.Position) > 100 * (o.Observed - t.Ticks) / (double)Stopwatch.Frequency + .5)) t.Generation++;
                    t.Position = (double[])o.Position.Clone(); t.Ticks = o.Observed;
                    if(IncludeTransportObservations)candidate.Observation=new GameplayVehicleObservation02{Id=t.Id,Generation=t.Generation,Model=o.Model,Context=t.Context,ObservationTicks=o.Observed,Position=(double[])o.Position.Clone(),Velocity=(double[])o.Velocity.Clone(),Forward=(double[])o.Forward.Clone(),Up=(double[])o.Up.Clone(),Running=o.Running,Valid=true,RiderAttached=o.PlayerDriver,RiderViewAttached=o.PlayerDriver&&o.VehicleView,OperatingPoint=null,OperatingPointEvidence="unavailable"};
                    if (!o.RpmRatio.HasValue || !Protocol.Finite(o.RpmRatio.Value) || o.RpmRatio < 0 || o.RpmRatio > 1)
                    { MissingOperatingPoints++; LastStatus = "vehicle-operating-point-unavailable"; continue; }
                    candidate.Wire = new GameplayVehicle { Id = t.Id, Generation = t.Generation, Model = o.Model, Context = t.Context,
                        ObservationTicks = o.Observed, Position = (double[])o.Position.Clone(), Velocity = (double[])o.Velocity.Clone(),
                        Forward = (double[])o.Forward.Clone(), Up = (double[])o.Up.Clone(), Running = o.Running,
                        OperatingPoint = o.RpmRatio.Value, Valid = true, RiderAttached = o.PlayerDriver,
                        RiderViewAttached = o.PlayerDriver && o.VehicleView };
                }
                catch (ThreadAbortException) { throw; }
                catch (Exception) { GetterFailures++; Retire(handle); LastStatus = "vehicle-getter-failed"; }
                finally{if(trace!=null)trace.Mark(ObservationStage02B.SourceBookkeeping);}
            }
            // Admit newly discovered nearby NPCs even when the fleet is full.
            // Existing lifetimes receive the same 1.3 distance hysteresis as the
            // RPH path. Full integer handle breaks ties deterministically.
            if(trace!=null)trace.Mark(ObservationStage02B.Other);
            candidates.Sort(delegate(Candidate a, Candidate b) {
                int p = b.Player.CompareTo(a.Player); if (p != 0) return p;
                int d = (a.Distance / (a.Existing ? 1.3 : 1)).CompareTo(b.Distance / (b.Existing ? 1.3 : 1));
                return d != 0 ? d : a.Handle.CompareTo(b.Handle);
            });
            var diagnostic=IncludeTransportObservations?new List<GameplayVehicleObservation02>(maximum):null;
            var admitted = new HashSet<int>();
            for (int i = 0; i < candidates.Count && i < maximum; i++)
            { admitted.Add(candidates[i].Handle);if(diagnostic!=null&&candidates[i].Observation!=null)diagnostic.Add(candidates[i].Observation); if (candidates[i].Wire != null) result.Add(candidates[i].Wire); }
            foreach (int h in new List<int>(tracked.Keys)) if (!admitted.Contains(h)) Retire(h);
            LastObservations = observed.ToArray();if(trace!=null)trace.Mark(ObservationStage02B.SortingAdmission);
            double elapsed = (now() - began) * 1000d / Stopwatch.Frequency;
            MaximumObservationMs = Math.Max(MaximumObservationMs, elapsed);
            if (elapsed > 10) { OverBudget++; result.Clear();if(diagnostic!=null)diagnostic.Clear(); LastStatus = "vehicle-batch-over-budget"; }
            if(trace!=null)trace.Mark(ObservationStage02B.Other);
            var frame = new GameplayFrame { Session = session, Listener = decision.Listener, Vehicles = result.ToArray(),
                VehicleObservations02=diagnostic==null?null:diagnostic.ToArray(),WorldPreparationStartedUtc = WorldPreparationStartedUtc, CameraInterior01 = interior, CameraInteriorReadback = raw };
            if(trace!=null)trace.Mark(ObservationStage02B.FrameConstruction);
            try{GameplayWire.Validate(frame,session);}finally{if(trace!=null)trace.Mark(ObservationStage02B.WireValidation);}
            returned=true;return frame;
            }catch(ThreadAbortException){traceException="ThreadAbortException";throw;}catch(Exception e){traceException=e.GetType().Name;throw;}finally{long elapsed=now()-began;Timing.VehicleGetters.Add(ObservationTiming02.Ms(getterTicks));Timing.Conversion.Add(ObservationTiming02.Ms(Math.Max(0,elapsed-cameraTicks-enumerationTicks-getterTicks)));long ended=Timing.FinishBatch(began,count,allocation);if(trace!=null)trace.Complete(ended,LastStatus,returned,traceException);}
        }
    }
}
