using System;

[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("TestSwitch")]

namespace RichAudio.AudioSwitch
{
    internal sealed class Switch
    {
        internal const string DefaultDonor = "VOLTIC";
        internal const string PrivateAudible = "RA_RC_AUDIBLE";
        internal const string PrivateQuiet = "RA_RC_QUIET";

        internal enum ComparisonStage
        {
            None, AudiblePending, AudibleHeard, StockPending, QuietReady, QuietActive, Complete, Halted
        }

        string target;
        internal string Generation { get; private set; }
        internal string Phase { get; private set; }
        internal ComparisonStage Comparison { get; private set; }
        internal bool KeepMarkerOnRestore { get { return Comparison == ComparisonStage.AudibleHeard; } }

        internal Switch() { Phase = "idle"; Generation = Guid.NewGuid().ToString("N"); }

        internal void Observe(string current)
        {
            if (current == target) return;
            target = current;
            Generation = Guid.NewGuid().ToString("N");
            Phase = "idle";
            if (Comparison != ComparisonStage.None && Comparison != ComparisonStage.Complete)
                Comparison = ComparisonStage.Halted;
        }

        internal string RecordFinding(string finding, string generation, bool running, bool tokenValid)
        {
            if (target == null || generation != Generation || !tokenValid || !running)
                return "original running ADDER unavailable";
            if (Comparison == ComparisonStage.AudiblePending && finding == "RecognisedPrivateMotor")
                Comparison = ComparisonStage.AudibleHeard;
            else if (Comparison == ComparisonStage.StockPending && finding == "StockReturned")
                Comparison = ComparisonStage.QuietReady;
            else if ((Comparison == ComparisonStage.AudiblePending && finding == "PrivateMotorUnresolved") ||
                     (Comparison == ComparisonStage.StockPending && finding == "StockReturnUnresolved"))
                Comparison = ComparisonStage.Halted;
            else
                return "finding unavailable in this phase";
            return "report saved";
        }

        internal string Command(string operation, string generation, bool foreground, bool running,
                                bool tokenValid, Action<string> dispatch, string donor = DefaultDonor)
        {
            if (!foreground) return "GTA is not foreground";
            if (target == null || generation != Generation) return "target changed or unavailable";
            if (!running) return "engine stopped";
            if (!tokenValid) return "vehicle token mismatch";
            bool apply = operation == "Ready";
            if (apply && donor != DefaultDonor && donor != "RCBANDITO" && donor != PrivateAudible && donor != PrivateQuiet)
                return "unsupported donor";
            if (!(apply && Phase == "idle") && !(operation == "Restore" && Phase == "restore available"))
                return "operation unavailable";

            ComparisonStage next = Comparison;
            if (apply)
            {
                if (donor == PrivateQuiet)
                {
                    if (Comparison != ComparisonStage.QuietReady)
                        return "confirm the private motor and audible stock return before quiet apply";
                    next = ComparisonStage.QuietActive;
                }
                else
                {
                    if (Comparison != ComparisonStage.None) return "private comparison already started";
                    if (donor == PrivateAudible) next = ComparisonStage.AudiblePending;
                }
            }
            else if (Comparison != ComparisonStage.None)
            {
                next = ComparisonStage.Halted;
                if (Comparison == ComparisonStage.AudibleHeard) next = ComparisonStage.StockPending;
                if (Comparison == ComparisonStage.QuietActive) next = ComparisonStage.Complete;
            }

            // A failed call may already have changed audio. Allow stock restoration,
            // but never advance a private listening comparison after uncertainty.
            if (next != ComparisonStage.None) Comparison = ComparisonStage.Halted;
            Phase = apply ? "restore available" : "restore uncertain";
            try { dispatch(apply ? donor : "ADDER"); }
            catch (Exception e) { return "uncertain: " + e.Message; }
            Comparison = next;
            if (!apply) Phase = "idle";
            return "returned";
        }
    }
}
