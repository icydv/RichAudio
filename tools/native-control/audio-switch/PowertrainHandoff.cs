using System;

namespace RichAudio.AudioSwitch
{
    internal sealed class PowertrainAssignmentRefused : Exception
    {
        internal PowertrainAssignmentRefused(string reason) : base(reason) {}
    }

    internal struct PowertrainEvidence
    {
        internal readonly string Generation, Mode, Failure;
        internal readonly long Revision;
        internal readonly bool Fresh, Prepared, Ended;

        internal PowertrainEvidence(string generation, long revision, string mode,
                                    bool fresh, bool prepared, bool ended, string failure)
        {
            Generation = generation;
            Revision = revision;
            Mode = mode;
            Fresh = fresh;
            Prepared = prepared;
            Ended = ended;
            Failure = failure;
        }
    }

    // Driven on the SHVDNE callback. Host actions only publish state to the IPC worker.
    internal sealed class PowertrainHandoff
    {
        readonly long frequency;
        readonly Func<bool, long> setGain;
        readonly Func<long> withdraw;
        readonly Action<string> assign;
        readonly Action<string, string> log;
        long revision = 1;
        long deadline;
        long withdrawRevision;
        string generation;
        bool quietMayBeSelected;
        bool withdrawRequested;

        internal string Phase { get; private set; }
        internal string Reason { get; private set; }
        internal bool CanRetry { get { return Phase == "Failed" && !quietMayBeSelected; } }
        internal bool NeedsTarget
        {
            get
            {
                return Phase == "Preparing" || Phase == "Activating" || Phase == "Active" ||
                    Phase == "Muting" || Phase == "Muted" || Phase == "Resuming" ||
                    Phase == "Releasing" || (Phase == "Uncertain" && quietMayBeSelected);
            }
        }
        internal bool TracksInput
        {
            get { return NeedsTarget && Phase != "Uncertain" && (!withdrawRequested || withdrawRevision > 0); }
        }

        internal PowertrainHandoff(long frequency, Func<bool, long> setGain, Func<long> withdraw,
                                   Action<string> assign, Action<string, string> log)
        {
            this.frequency = frequency;
            this.setGain = setGain;
            this.withdraw = withdraw;
            this.assign = assign;
            this.log = log;
            Phase = "Inactive";
        }

        void Move(string phase, string reason)
        {
            if (Phase == phase && Reason == reason) return;
            Phase = phase;
            Reason = reason;
            log(phase, reason);
        }

        internal void Start(string currentGeneration, long now)
        {
            generation = currentGeneration;
            deadline = now + 20 * frequency;
            Move("Preparing", "waiting for advancing muted render and output on the bound ADDER");
        }

        internal string Mute(long now)
        {
            if (Phase != "Active") return "RichAudio is not active";
            try { revision = setGain(false); }
            catch (Exception failure)
            {
                RequestRelease(now, "could not request mute: " + failure.Message);
                return "mute failed, stock return pending";
            }
            deadline = now + 2 * frequency;
            Move("Muting", "waiting for muted output and endpoint buffer reset");
            return "accepted";
        }

        internal string Resume(long now)
        {
            if (Phase != "Muted") return "wait for confirmed mute before resuming";
            try { revision = setGain(true); }
            catch (Exception failure)
            {
                RequestRelease(now, "could not request fresh voice: " + failure.Message);
                return "resume failed, stock return pending";
            }
            deadline = now + 2 * frequency;
            Move("Resuming", "waiting for fresh audible output");
            return "accepted";
        }

        internal string Restore(long now)
        {
            if (Phase == "Releasing") return "stock return is already pending";
            if (Phase == "Preparing")
            {
                Withdraw();
                Move("Failed", "operator cancelled preparation while stock was selected");
                return Reason;
            }
            if (!quietMayBeSelected) return "no native quiet assignment to restore";
            RequestRelease(now, "operator requested stock");
            return "accepted";
        }

        void Withdraw()
        {
            if (withdrawRequested) return;
            withdrawRequested = true;
            try { withdrawRevision = withdraw(); }
            catch (Exception failure) { log("Withdrawal request failed", failure.Message); }
        }

        void RequestRelease(long now, string reason)
        {
            Withdraw();
            deadline = now + 5 * frequency;
            Move("Releasing", reason);
        }

        bool Ack(PowertrainEvidence host, long wantedRevision, string mode)
        {
            return host.Generation == generation && host.Revision == wantedRevision && host.Mode == mode;
        }

        internal void Advance(long now, string currentGeneration, bool ownsTarget,
                              bool canPrepare, PowertrainEvidence host)
        {
            if (!NeedsTarget) return;
            if (currentGeneration != generation || !ownsTarget)
            {
                Withdraw();
                quietMayBeSelected = false;
                Move("Lost", "the original vehicle lifetime or owner token changed");
                return;
            }

            if (Phase == "Uncertain") return;
            if (Phase == "Preparing")
            {
                if (!canPrepare || host.Ended || now >= deadline)
                {
                    Withdraw();
                    Move("Failed", !canPrepare ? "stock readiness lost before native quiet" :
                        host.Failure ?? "no current muted render and advancing output before deadline");
                    return;
                }
                if (host.Failure != null || !host.Fresh || !host.Prepared || !Ack(host, revision, "prepare"))
                {
                    if (host.Failure != null) Move("Preparing", host.Failure);
                    return;
                }
                log("Prepared", "current muted renderer and endpoint progress verified");
                quietMayBeSelected = true;
                try { assign(Switch.PrivateQuiet); }
                catch (PowertrainAssignmentRefused failure)
                {
                    Withdraw();
                    quietMayBeSelected = false;
                    Move("Failed", failure.Message);
                    return;
                }
                catch (Exception failure)
                {
                    Withdraw();
                    Move("Uncertain", "native quiet result uncertain: " + failure.Message);
                    return;
                }
                try { revision = setGain(true); }
                catch (Exception failure)
                {
                    RequestRelease(now, "native quiet returned but voice request failed: " + failure.Message);
                    return;
                }
                deadline = now + 2 * frequency;
                Move("Activating", "native quiet returned, waiting for audible output acknowledgement");
                return;
            }

            if (Phase != "Releasing")
            {
                bool transition = Phase == "Activating" || Phase == "Muting" || Phase == "Resuming";
                if (host.Failure != null || host.Ended || (!host.Fresh && !transition) || (transition && now >= deadline))
                    RequestRelease(now, host.Failure ?? "host output progress expired");
                else if (host.Fresh)
                {
                    if (Phase == "Muting" && Ack(host, revision, "mute"))
                        Move("Muted", "endpoint buffer reset confirmed");
                    else if ((Phase == "Activating" || Phase == "Resuming") && Ack(host, revision, "voice"))
                        Move("Active", "fresh audible output submitted");
                }
            }

            if (Phase != "Releasing") return;
            if (host.Ended || (withdrawRevision > 0 && Ack(host, withdrawRevision, "withdraw")))
            {
                log("Withdrawn", host.Ended ? "owned host exited" : "endpoint buffer reset confirmed");
                quietMayBeSelected = false;
                try { assign("ADDER"); }
                catch (PowertrainAssignmentRefused failure)
                {
                    Move("Lost", failure.Message);
                    return;
                }
                catch (Exception failure)
                {
                    Move("Uncertain", "stock assignment result uncertain: " + failure.Message);
                    return;
                }
                Move("Restored", "stock assignment returned after replacement withdrawal");
            }
            else if (now >= deadline && Reason != "waiting for confirmed endpoint withdrawal before stock return")
                Move("Releasing", "waiting for confirmed endpoint withdrawal before stock return");
        }
    }
}
