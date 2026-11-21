using System;
using System.Diagnostics;
using RichAudio.Beacon.Transport;
using RichAudio.Integration;

namespace RichAudio.AudioSwitch
{
    // Capture just the switch's already-validated target. No pool enumeration.
    internal sealed class PowertrainFrames
    {
        internal const uint Adder = 0xB779A091u;
        internal const string NativeRevEvidence = "shvdne-enhanced-native-F9DDA40BC293A61E";
        readonly string session;
        readonly IGameObservationSource source;
        readonly CameraListenerTracker camera = new CameraListenerTracker();
        ListenerState lastListener;
        internal string Failure { get; private set; }
        internal double MaximumCallbackMs { get; private set; }

        internal PowertrainFrames(string session, IGameObservationSource source)
        {
            this.session = session;
            this.source = source;
        }

        internal GameplayFrame Capture(int handle, string generation, long revision, string mode)
        {
            long began = Stopwatch.GetTimestamp();
            try
            {
                if (!source.StoryReady || source.PlayerVehicleHandle != handle)
                    return Refuse("bound ADDER is unavailable in Story Mode", true);

                var decision = camera.Observe(session, source.ReadCamera());
                if (!decision.Publish)
                    return Refuse(decision.Classification, decision.Terminal);

                var v = source.ReadVehicle(handle);
                if (v == null || v.Handle != handle || v.Model != Adder ||
                    !v.Exists || v.Dead || !v.PlayerDriver || !v.Running || v.Failure != null)
                    return Refuse("bound running ADDER changed during observation", false);
                if (!v.RpmRatio.HasValue || !Protocol.Finite(v.RpmRatio.Value) ||
                    v.RpmRatio.Value <= 0 || v.RpmRatio.Value > 1 ||
                    v.OperatingPointEvidence != "candidate-public-native-unqualified-shvdne")
                    return Refuse("SHVDNE native rev ratio unavailable for the running ADDER", false);

                var state = decision.Listener;
                long after = Stopwatch.GetTimestamp();
                if (v.Before < began || v.After > after || v.After <= v.Before ||
                    v.Observed != v.Before + (v.After - v.Before) / 2 ||
                    after - began > Stopwatch.Frequency / 100 ||
                    Math.Abs(v.Observed - state.ObservationTicks) > Stopwatch.Frequency / 20)
                    return Refuse("vehicle observation exceeded its frame budget", false);
                var frame = new GameplayFrame
                {
                    Session = session, Listener = state,
                    ValidThroughTicks = Math.Min(state.ObservationTicks, v.Observed) + Stopwatch.Frequency / 4,
                    PowertrainRevision = revision, PowertrainGate = mode,
                    OperatingPointEvidence = NativeRevEvidence,
                    Vehicles = new[] { new GameplayVehicle
                    {
                        Id = generation, Generation = 1, ObservationTicks = v.Observed,
                        Model = Adder, Context = "player", Position = v.Position, Velocity = v.Velocity,
                        Forward = v.Forward, Up = v.Up, OperatingPoint = v.RpmRatio.Value,
                        Running = true, Valid = true, RiderAttached = v.PlayerDriver,
                        RiderViewAttached = v.PlayerDriver && v.VehicleView
                    }}
                };
                // Validation stays at the existing publisher/host wire boundaries.
                lastListener = state;
                Failure = null;
                return frame;
            }
            finally
            {
                MaximumCallbackMs = Math.Max(MaximumCallbackMs, (Stopwatch.GetTimestamp() - began) * 1000d / Stopwatch.Frequency);
            }
        }

        GameplayFrame Refuse(string reason, bool invalidateCamera)
        {
            if (invalidateCamera) camera.Invalidate();
            Failure = reason;
            return null;
        }

        internal GameplayFrame Withdraw(long revision)
        {
            if (lastListener == null) return null;
            return new GameplayFrame
            {
                Session = session, Listener = lastListener, Vehicles = new GameplayVehicle[0],
                ValidThroughTicks = lastListener.ObservationTicks + Stopwatch.Frequency / 4,
                PowertrainRevision = revision, PowertrainGate = "withdraw"
            };
        }
    }
}
