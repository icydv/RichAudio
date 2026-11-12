using System;
using System.Collections.Generic;
using System.Linq;
using RichAudio.GateA.Private03;

internal static class TestGateAPrivate03C
{
    sealed class Journal : IProbeJournal
    {
        internal bool Health = true, FailDispatch;
        internal long Issued, Flushed;
        internal List<string> Lines = new List<string>();
        public bool Healthy { get { return Health; } }
        public long Append(string line) { if (FailDispatch && line.StartsWith("native-dispatch-attempt", StringComparison.Ordinal)) return 0; Lines.Add(line); return Health ? ++Issued : 0; }
        public bool Persisted(long ticket) { return Health && ticket > 0 && Flushed >= ticket; }
        internal void Flush() { Flushed = Issued; }
    }
    sealed class Guard : IPrivateProbeGuard
    {
        internal bool Live = true, Claimed, Stop, Retired;
        public bool Ready { get { return Live && !Stop; } }
        public bool ClaimActivation() { if (!Ready || Claimed) return false; Claimed = true; return true; }
        public void RequestStop() { Stop = true; }
        public void StopAcknowledged() { }
        public void VehiclesRetired() { Retired = true; }
    }
    sealed class Api : IProfileProbeApi
    {
        internal int Calls, Assignments, Spawned, Assigned;
        internal bool Story = true, Moving, Overlap;
        internal Dictionary<int,int> Live = new Dictionary<int,int>();
        internal List<int> Deleted = new List<int>();
        public bool StoryReady { get { Calls++; return Story; } }
        public void PreparePair() { Calls++; }
        public bool ModelReady { get { Calls++; return true; } }
        public ProbeLifetime Spawn(string role,int token) { Calls++;int handle=Overlap?1:++Spawned;Live[handle]=token;return new ProbeLifetime {Handle=handle,Token=token,Role=role}; }
        public bool Exists(ProbeLifetime x) { Calls++;return Live.ContainsKey(x.Handle); }
        public bool Matches(ProbeLifetime x) { Calls++;return Live.ContainsKey(x.Handle)&&Live[x.Handle]==x.Token; }
        public bool EmptyStoppedAndDriveable(ProbeLifetime x) { Calls++;return !Moving; }
        public string ReadSnapshot(ProbeLifetime x) { Calls++;return "role="+x.Role+" handle="+x.Handle; }
        public void AssignPrivateProfile(ProbeLifetime x) { Calls++;Assignments++;Assigned=x.Handle; }
        public bool Retire(ProbeLifetime x) { Calls++;if(Moving)return false;Deleted.Add(x.Handle);Live.Remove(x.Handle);return true; }
        public void ReleaseModel() { Calls++; }
    }
    sealed class F
    {
        internal long Now = 1000;
        internal readonly Journal Journal = new Journal();
        internal readonly Guard Guard = new Guard();
        internal readonly Api Api = new Api();
        internal ProfileAssignmentController C;
        int token=10;
        internal F() { C=new ProfileAssignmentController(Api,Journal,delegate{return Now;},1000,delegate{return ++token;},Guard); }
        internal void Spawn() { C.RequestSpawn();Journal.Flush();C.Tick();Check(C.Active,"pair active"); }
        internal void Baseline() { C.ConfirmBaseline("BASELINES_A_B_MARKER_FREE");Journal.Flush();C.Tick();Check(C.BaselineAccepted,"baseline durable"); }
        internal void Pair() { Spawn();Baseline(); }
    }
    static int cases,checks;
    static void Check(bool b,string message) { checks++;if(!b)throw new Exception(message); }
    static void Test(string name,Action a) { a();cases++;Console.WriteLine("PASS "+name); }
    static void Refused(Action a) { bool rejected=false;try{a();}catch(InvalidOperationException){rejected=true;}Check(rejected,"expected refusal"); }
    public static int Main(string[] args)
    {
        try {
            bool demonstrate=args.Length==1&&args[0]=="demonstrate-old";
            if(demonstrate) {
                var lateBaseline=new F();lateBaseline.Spawn();lateBaseline.Now=81000;lateBaseline.Baseline();
                var lateAssignment=new F();lateAssignment.Pair();lateAssignment.Now=101000;lateAssignment.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");lateAssignment.Journal.Flush();lateAssignment.C.Tick();
                var lateRetirement=new F();lateRetirement.Pair();lateRetirement.Now=141000;lateRetirement.C.Tick();
                Check(lateBaseline.C.BaselineAccepted,"old80secondbaselineaccepted");Check(lateAssignment.Api.Assignments==1,"old100secondassignmentdispatched");Check(lateRetirement.C.Active&&!lateRetirement.Guard.Stop,"old140secondretirementnotrequested");
                Console.WriteLine("DEMONSTRATED old probe accepts baseline at80s, dispatches at100s and remains active at140s; procedure phase bounds are not independently enforced");return 0;
            }
            Test("baseline boundary is before80seconds and cannot renew from confirmation",delegate {
                var f=new F();f.Spawn();f.Now=80999;f.C.ConfirmBaseline("BASELINES_A_B_MARKER_FREE");f.Journal.Flush();f.Now=81000;f.C.Tick();
                Check(!f.C.BaselineAccepted&&f.C.Finished&&f.Api.Assignments==0,"baseline durable acceptance must precede80seconds");
            });
            Test("late baseline command refused at80seconds",delegate {var f=new F();f.Spawn();f.Now=81000;Refused(delegate{f.C.ConfirmBaseline("BASELINES_A_B_MARKER_FREE");});f.C.Tick();Check(f.C.Finished&&f.Guard.Stop,"expired gate independently stops");});
            Test("assignment command refused at100seconds",delegate {var f=new F();f.Pair();f.Now=101000;Refused(delegate{f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");});f.C.Tick();Check(f.C.Finished&&f.Api.Assignments==0,"no late native");});
            Test("durable pending assignment cannot cross100secondboundary",delegate {var f=new F();f.Pair();f.Now=100999;f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");f.Journal.Flush();f.Now=101000;f.C.Tick();Check(f.Api.Assignments==0&&f.C.Finished,"dispatch deadline repeats afterdurability");});
            Test("assignment immediately before100seconds remains Aonly one-shot",delegate {var f=new F();f.Pair();f.Now=100999;f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");f.Journal.Flush();f.C.Tick();Check(f.Api.Assignments==1&&f.Api.Assigned==1,"A dispatched once");Refused(delegate{f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");});});
            Test("unassigned active experiment stops independently at100seconds",delegate {var f=new F();f.Pair();f.Now=101000;f.C.Tick();Check(f.C.Finished&&f.Guard.Stop&&f.Guard.Retired,"missed assignment gate retires");});
            Test("assigned experiment begins normal retirement at140seconds",delegate {var f=new F();f.Pair();f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");f.Journal.Flush();f.C.Tick();f.Now=141000;f.C.Tick();Check(f.C.Finished&&f.Guard.Stop&&f.C.CleanupComplete&&f.Api.Assignments==1,"normal retirement no secondsetter");});
            Test("moving vehicle at140seconds is preserved until normal dismount retry",delegate {var f=new F();f.Pair();f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");f.Journal.Flush();f.C.Tick();f.Api.Moving=true;f.Now=141000;f.C.Tick();Check(!f.C.CleanupComplete&&f.Api.Deleted.Count==0&&f.Guard.Stop,"moving vehicle retained");f.Api.Moving=false;f.C.Stop("manual normaldis mount");Check(f.C.CleanupComplete&&f.Api.Assignments==1,"retirement retry no newassignment");});
            Test("late callback beyond3minutes still stops without dispatch",delegate {var f=new F();f.Pair();f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");f.Journal.Flush();f.Now=181000;f.C.Tick();Check(f.C.Finished&&f.Api.Assignments==0,"absolute active cutoff wins");});
            Test("identity reuse while awaiting durable assignment rejects both mutation and cleanup",delegate {var f=new F();f.Pair();f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");f.Api.Live[1]=999;f.Journal.Flush();f.C.Tick();Check(f.Api.Assignments==0&&!f.Api.Deleted.Contains(1)&&f.C.Finished,"reusedAprotected");});
            Test("abort while pending assignment invokes zero further game APIs",delegate {var f=new F();f.Pair();f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");int before=f.Api.Calls;f.C.Aborted();f.Journal.Flush();f.C.Tick();Check(f.Api.Calls==before&&f.Api.Assignments==0&&f.Guard.Stop,"abort nongameonly");});
            Test("dispatch evidence queue failure consumes attempt before native",delegate {var f=new F();f.Pair();f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");f.Journal.Flush();f.Journal.FailDispatch=true;f.C.Tick();Check(f.C.AssignmentAttempted&&f.Api.Assignments==0&&f.C.Finished,"evidencefailconsumed");Refused(delegate{f.C.RequestAssignment("ASSIGN_PRIVATE_TO_A");});});
            Test("overlapping returned lifetime rejects pair before assignment",delegate {var f=new F();f.Api.Overlap=true;f.C.RequestSpawn();f.Journal.Flush();f.C.Tick();Check(!f.C.Active&&f.C.Finished&&f.Api.Assignments==0,"overlaprejected");});
            Test("supervisor loss before baseline acceptance cancels activation",delegate {var f=new F();f.Spawn();f.C.ConfirmBaseline("BASELINES_A_B_MARKER_FREE");f.Journal.Flush();f.Guard.Live=false;f.C.Tick();Check(!f.C.BaselineAccepted&&f.C.Finished&&f.Api.Assignments==0,"supervisorlossstop");});
            Console.WriteLine("PASS PRIVATE03C cases="+cases+" assertions="+checks+"; authored offline stub calls only");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
