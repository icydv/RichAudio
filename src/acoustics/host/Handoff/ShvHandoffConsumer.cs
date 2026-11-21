using System;
using System.Diagnostics;
using System.Threading;

namespace RichAudio.Beacon.Handoff
{
    internal interface IHandoffHostClock
    {
        long Frequency{get;}
        long Now{get;}
    }
    internal sealed class StopwatchHandoffClock:IHandoffHostClock
    {
        internal static readonly StopwatchHandoffClock Instance=new StopwatchHandoffClock();
        private StopwatchHandoffClock(){}
        public long Frequency{get{return Stopwatch.Frequency;}}
        public long Now{get{return Stopwatch.GetTimestamp();}}
    }

    // No native, game-fiber, renderer, device or user callback runs on this
    // worker. The worker retires internal state; the RPH owner observes that
    // state on its game fiber. Every read independently enforces expiry too.
    internal sealed class ShvHandoffConsumer:IDisposable
    {
        internal const int MaximumPollMs=20;
        readonly object gate=new object();
        readonly ShvOperatingStateHandoff validator;
        readonly IHandoffHostClock clock;
        readonly ManualResetEvent stop=new ManualResetEvent(false),retiredEvent=new ManualResetEvent(false);
        Thread worker;
        ShvOperatingStateHandoff.Candidate current;
        bool started,disposed,retired;
        string reason;
        long initialExpiry,activeDeadline,lastClock=-1,retiredAt,accepted;
        internal ShvHandoffConsumer(ShvOperatingStateHandoff validator,IHandoffHostClock clock)
        {
            if(validator==null||clock==null||clock.Frequency<=0||clock.Frequency>1000000000
                ||clock.Frequency!=validator.HostFrequency)throw new ArgumentException("owned host clock domain");
            this.validator=validator;this.clock=clock;
        }
        internal bool LiveHandoffReady{get{return false;}}
        internal bool Retired{get{lock(gate)return retired;}}
        internal string RetirementReason{get{lock(gate)return reason;}}
        internal long RetiredAtHostTicks{get{lock(gate)return retiredAt;}}
        internal long AcceptedCount{get{lock(gate)return accepted;}}
        internal bool WorkerAlive{get{lock(gate)return worker!=null&&worker.IsAlive;}}

        internal void StartExpecting()
        {
            lock(gate){
                if(started||disposed||retired)throw new InvalidOperationException("one consumer start");
                long now=clock.Now;
                if(now<0||(decimal)now+clock.Frequency*120>Int64.MaxValue)
                    throw new InvalidOperationException("host clock range");
                lastClock=now;initialExpiry=now+clock.Frequency*ShvOperatingStateHandoff.MaximumAgeMs/1000;
                activeDeadline=now+clock.Frequency*120;
                started=true;
                worker=new Thread(Run){IsBackground=true,Name="RichAudio passive handoff expiry"};
                try{worker.Start();}catch{RetireOwned("expiry-worker-start-failed",now);throw;}
            }
        }
        void Run()
        {
            try{while(!stop.WaitOne(MaximumPollMs))lock(gate){if(retired||disposed)return;CheckExpiry(clock.Now);}}
            catch(ThreadAbortException){throw;}
            catch{lock(gate){if(!retired)RetireOwned("expiry-worker-failed",lastClock<0?0:lastClock);}}
        }
        bool CheckExpiry(long now)
        {
            if(retired||disposed)return false;
            if(!started)return false;
            if(now<0||now<lastClock){RetireOwned("host-clock-discontinuity",Math.Max(0,now));return false;}
            lastClock=now;
            if(now>=activeDeadline){RetireOwned("consumer-active-deadline",now);return false;}
            if(validator.Retired){RetireOwned(validator.RetirementReason??"validator-retired",now);return false;}
            long expiry=current==null?initialExpiry:current.ValidThroughHostTicks;
            if(now>expiry){RetireOwned(current==null?"source-silence-before-first":"source-silence-or-expiry",now);return false;}
            return true;
        }
        void RetireOwned(string why,long now)
        {
            if(retired)return;
            validator.Retire(why);retired=true;reason=why;retiredAt=now;current=null;
            retiredEvent.Set();stop.Set();
        }
        internal bool Submit(ShvOperatingStateHandoff.Observation observation,
            ShvOperatingStateHandoff.BindingCapability binding,ShvOperatingStateHandoff.ClockCapability mapping)
        {
            lock(gate){
                long now=clock.Now;
                if(!CheckExpiry(now))return false;
                var decision=validator.Accept(observation,binding,mapping,now);
                if(!decision.Accepted){RetireOwned(decision.Reason,now);return false;}
                current=decision.Value;accepted++;return true;
            }
        }
        internal bool TryGetCurrent(out ShvOperatingStateHandoff.Candidate value)
        {
            lock(gate){
                value=null;
                if(!CheckExpiry(clock.Now)||current==null)return false;
                value=current;return true;
            }
        }
        internal void Invalidate(string why)
        { lock(gate){if(!retired)RetireOwned(why,Math.Max(0,clock.Now));} }
        internal bool WaitRetired(int milliseconds)
        {
            if(milliseconds<0||milliseconds>5000)throw new ArgumentOutOfRangeException("milliseconds");
            return retiredEvent.WaitOne(milliseconds);
        }
        public void Dispose()
        {
            Thread owned;
            lock(gate){
                if(disposed)return;
                if(!retired)RetireOwned("consumer-stopped",Math.Max(0,clock.Now));
                disposed=true;stop.Set();owned=worker;
            }
            if(owned!=null&&!owned.Join(1200))throw new TimeoutException("handoff expiry worker cleanup");
            // No worker or source callback uses these handles after the join.
            stop.Dispose();retiredEvent.Dispose();
        }
    }
}
