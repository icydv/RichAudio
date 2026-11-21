using System;
using System.Collections.Generic;
using RichAudio.AudioSwitch;

class TestSwitch
{
    static void Check(bool value) { if (!value) throw new Exception("Switch assertion failed"); }
    static void CheckPrivateComparison()
    {
        var calls = new List<string>();
        var s = new Switch();
        s.Observe("A");
        string generation = s.Generation;
        Check(s.Command("Ready", generation, true, true, true, calls.Add, "RA_RC_QUIET") != "returned");
        Check(s.Command("Ready", generation, true, true, true, calls.Add, "RA_RC_AUDIBLE") == "returned");
        Check(s.RecordFinding("StockReturned", generation, true, true) != "report saved");
        Check(s.RecordFinding("RecognisedPrivateMotor", generation, false, true) != "report saved");
        Check(s.RecordFinding("RecognisedPrivateMotor", generation, true, false) != "report saved");
        Check(s.RecordFinding("RecognisedPrivateMotor", "wrong generation", true, true) != "report saved");
        Check(s.RecordFinding("RecognisedPrivateMotor", generation, true, true) == "report saved");
        Check(s.KeepMarkerOnRestore);
        Check(s.Command("Restore", generation, true, true, true, calls.Add) == "returned");
        Check(s.Command("Ready", generation, true, true, true, calls.Add, "RA_RC_QUIET") != "returned");
        Check(s.RecordFinding("StockReturned", generation, true, true) == "report saved");
        Check(s.Command("Ready", generation, true, true, false, calls.Add, "RA_RC_QUIET") != "returned");
        Check(s.Command("Ready", generation, true, true, true, calls.Add, "RA_RC_QUIET") == "returned");
        Check(!s.KeepMarkerOnRestore);
        Check(s.Command("Ready", generation, true, true, true, calls.Add, "RA_RC_QUIET") != "returned");
        Check(s.Command("Restore", generation, true, true, true, calls.Add) == "returned");
        Check(s.Command("Ready", generation, true, true, true, calls.Add, "RA_RC_AUDIBLE") != "returned");
        Check(String.Join(",", calls) == "RA_RC_AUDIBLE,ADDER,RA_RC_QUIET,ADDER");
    }

    static void CheckPrivateStop(string finding)
    {
        var s = new Switch();
        s.Observe("A");
        string generation = s.Generation;
        int calls = 0;
        Action<string> set = delegate { calls++; };
        Check(s.Command("Ready", generation, true, true, true, set, "RA_RC_AUDIBLE") == "returned");
        if (finding == "changed target")
        {
            s.Observe("B");
            s.Observe("A");
            generation = s.Generation;
        }
        else if (finding == "StockReturnUnresolved")
        {
            Check(s.RecordFinding("RecognisedPrivateMotor", generation, true, true) == "report saved");
            Check(s.Command("Restore", generation, true, true, true, set) == "returned");
            Check(s.RecordFinding(finding, generation, true, true) == "report saved");
        }
        else
        {
            Check(s.RecordFinding(finding, generation, true, true) == "report saved");
            Check(s.Command("Restore", generation, true, true, true, set) == "returned");
        }
        int previous = calls;
        Check(s.RecordFinding("StockReturned", generation, true, true) != "report saved");
        Check(s.Command("Ready", generation, true, true, true, set, "RA_RC_QUIET") != "returned");
        Check(s.Command("Ready", generation, true, true, true, set, "RA_RC_AUDIBLE") != "returned");
        Check(calls == previous);
    }

    static void CheckUncertainPrivateApply()
    {
        var s = new Switch();
        s.Observe("A");
        string generation = s.Generation;
        int calls = 0;
        Action<string> set = delegate { calls++; };
        Check(s.Command("Ready", generation, true, true, true, delegate { throw new Exception(); },
                        "RA_RC_AUDIBLE").StartsWith("uncertain:"));
        Check(s.RecordFinding("RecognisedPrivateMotor", generation, true, true) != "report saved");
        Check(s.Command("Restore", generation, true, true, true, set) == "returned");
        Check(s.RecordFinding("StockReturned", generation, true, true) != "report saved");
        Check(s.Command("Ready", generation, true, true, true, set, "RA_RC_QUIET") != "returned");
        Check(calls == 1);
    }

    static void Main()
    {
        TestPowertrainHandoff();
        var calls = new List<string>();
        var s = new Switch();
        Action<string> set = calls.Add;
        s.Observe("A");
        string a = s.Generation;
        Check(s.Command("Ready", a, false, true, true, set).Contains("foreground"));
        Check(s.Command("Ready", a, true, true, true, set) == "returned");
        s.Command("Ready", a, true, true, true, set);
        Check(s.Command("Restore", a, true, true, true, set) == "returned");
        s.Command("Restore", a, true, true, true, set);
        Check(String.Join(",", calls) == "VOLTIC,ADDER");
        s.Command("Ready", a, true, true, true, set);
        s.Observe("B");
        s.Command("Restore", a, true, true, true, set);
        s.Observe("A");
        s.Command("Restore", a, true, true, true, set);
        Check(calls.Count == 3);
        a = s.Generation;
        s.Command("Ready", a, true, true, true, delegate { calls.Add("uncertain"); throw new Exception(); });
        s.Command("Ready", a, true, true, true, set);
        Check(calls.Count == 4);
        s.Command("Restore", a, true, true, false, set);
        Check(calls.Count == 4);
        s.Command("Restore", a, true, true, true, delegate { calls.Add("restore uncertain"); throw new Exception(); });
        s.Command("Restore", a, true, true, true, set);
        Check(calls.Count == 5);
        s.Observe(null);
        s.Command("Ready", s.Generation, true, true, true, set);
        Check(calls.Count == 5);
        var quiet = new Switch();
        quiet.Observe("stock ADDER");
        string car = quiet.Generation;
        var requests = new List<string>();
        Check(quiet.Command("Ready", car, true, true, true, requests.Add, "NULL") == "unsupported donor");
        Check(quiet.Command("Ready", car, true, true, true, requests.Add, "RCBANDITO") == "returned");
        quiet.Command("Ready", car, true, true, true, requests.Add, "VOLTIC");
        quiet.Command("Restore", "different", true, true, true, requests.Add);
        Check(quiet.Command("Restore", car, true, true, true, requests.Add) == "returned");
        quiet.Command("Restore", car, true, true, true, requests.Add);
        Check(String.Join(",", requests) == "RCBANDITO,ADDER");
        CheckPrivateComparison();
        CheckPrivateStop("changed target");
        CheckPrivateStop("PrivateMotorUnresolved");
        CheckPrivateStop("StockReturnUnresolved");
        CheckUncertainPrivateApply();
        Console.WriteLine("Passed private comparison sequence, evidence, failure and target gates.");
        Console.WriteLine("Passed single dispatch, same-target restore, foreground, target replacement, token loss and uncertainty checks.");
    }

    static void TestPowertrainHandoff()
    {
        const string car = "ADDER generation";
        var commands = new List<string>();
        long revision = 1;
        Func<bool, long> gain = audible => { commands.Add(audible ? "voice" : "mute"); return ++revision; };
        Func<long> withdraw = () => { commands.Add("withdraw"); return ++revision; };
        var handoff = new PowertrainHandoff(1000, gain, withdraw, commands.Add, (operation, detail) => {});
        var prepare = new PowertrainEvidence(car, 1, "prepare", true, true, false, null);
        handoff.Start(car, 0);
        handoff.Advance(50, car, true, true, new PowertrainEvidence(car, 1, "prepare", false, false, false, null));
        Check(commands.Count == 0);
        handoff.Advance(70, car, true, true, new PowertrainEvidence(car, 1, "prepare", false, false, false, "callback budget exceeded"));
        Check(commands.Count == 0 && handoff.Phase == "Preparing");
        handoff.Advance(80, car, true, true, new PowertrainEvidence(car, 1, "prepare", true, true, false, "current ADDER rev ratio unavailable"));
        Check(commands.Count == 0 && handoff.Phase == "Preparing");
        handoff.Advance(100, car, true, true, prepare);
        Check(String.Join(",", commands) == "RA_RC_QUIET,voice");
        handoff.Advance(150, car, true, true, new PowertrainEvidence(car, 2, "voice", true, true, false, null));
        Check(handoff.Phase == "Active");
        handoff.Mute(200);
        Check(handoff.Resume(210) != "accepted");
        handoff.Advance(250, car, true, true, new PowertrainEvidence(car, 3, "mute", true, true, false, null));
        Check(handoff.Phase == "Muted");
        Check(handoff.Resume(300) == "accepted");
        handoff.Advance(350, car, true, true, new PowertrainEvidence(car, 4, "voice", true, true, false, null));
        Check(String.Join(",", commands) == "RA_RC_QUIET,voice,mute,voice");
        handoff.Restore(400);
        handoff.Advance(450, car, true, true, new PowertrainEvidence(car, 4, "voice", true, true, false, null));
        Check(String.Join(",", commands) == "RA_RC_QUIET,voice,mute,voice,withdraw");
        handoff.Advance(500, car, true, true, new PowertrainEvidence(car, 5, "withdraw", false, false, false, null));
        Check(String.Join(",", commands) == "RA_RC_QUIET,voice,mute,voice,withdraw,ADDER");
        handoff.Advance(550, car, true, true, new PowertrainEvidence(car, 5, "withdraw", false, false, false, null));
        Check(commands.Count == 6 && handoff.Phase == "Restored");

        commands.Clear();
        var failed = new PowertrainHandoff(1000, gain, withdraw, commands.Add, (operation, detail) => {});
        failed.Start(car, 0);
        failed.Advance(100, car, true, true, new PowertrainEvidence(car, 0, null, false, false, true, "output unavailable"));
        Check(String.Join(",", commands) == "withdraw" && failed.CanRetry);

        commands.Clear(); revision = 1;
        var loss = new PowertrainHandoff(1000, gain, withdraw, commands.Add, (operation, detail) => {});
        loss.Start(car, 0);
        loss.Advance(100, car, true, true, prepare);
        loss.Advance(150, car, true, true, new PowertrainEvidence(car, 2, "voice", true, true, false, null));
        loss.Advance(400, car, true, false, new PowertrainEvidence(car, 0, null, false, false, true, "host exited"));
        Check(String.Join(",", commands) == "RA_RC_QUIET,voice,withdraw,ADDER");
        Check(loss.Phase == "Restored");

        commands.Clear(); revision = 1;
        var changed = new PowertrainHandoff(1000, gain, withdraw, commands.Add, (operation, detail) => {});
        changed.Start(car, 0);
        changed.Advance(100, car, true, true, prepare);
        changed.Restore(200);
        changed.Advance(250, "other car", false, false, new PowertrainEvidence(car, 3, "withdraw", false, false, true, null));
        Check(String.Join(",", commands) == "RA_RC_QUIET,voice,withdraw" && changed.Phase == "Lost");

        commands.Clear(); revision = 1;
        var stalled = new PowertrainHandoff(1000, gain, withdraw, commands.Add, (operation, detail) => {});
        stalled.Start(car, 0);
        stalled.Advance(100, car, true, true, prepare);
        stalled.Advance(150, car, true, true, new PowertrainEvidence(car, 2, "voice", true, true, false, null));
        stalled.Advance(450, car, true, false, new PowertrainEvidence(car, 2, "voice", false, true, false, null));
        Check(stalled.Phase == "Releasing" && String.Join(",", commands) == "RA_RC_QUIET,voice,withdraw");
        stalled.Advance(500, car, true, false, new PowertrainEvidence("other car", 3, "withdraw", false, false, false, null));
        Check(commands.Count == 3);
        stalled.Advance(550, car, true, false, new PowertrainEvidence(car, 3, "withdraw", false, false, false, null));
        Check(stalled.Phase == "Restored" && !stalled.CanRetry && commands.Count == 4 && commands[3] == "ADDER");

        commands.Clear(); revision = 1;
        var refused = new PowertrainHandoff(1000, gain, withdraw, commands.Add, (operation, detail) => {});
        refused.Start(car, 0);
        refused.Advance(100, car, true, false, prepare);
        Check(String.Join(",", commands) == "withdraw" && refused.Phase == "Failed");

        commands.Clear(); revision = 1;
        var gainFault = new PowertrainHandoff(1000, audible => { throw new InvalidOperationException(); },
            withdraw, commands.Add, (operation, detail) => {});
        gainFault.Start(car, 0);
        gainFault.Advance(100, car, true, true, prepare);
        Check(gainFault.Phase == "Releasing" && String.Join(",", commands) == "RA_RC_QUIET,withdraw");
        gainFault.Advance(500, car, true, false, new PowertrainEvidence(car, 0, null, false, false, true, "host exited"));
        Check(gainFault.Phase == "Restored" && commands.Count == 3 && commands[2] == "ADDER");

        commands.Clear(); revision = 1;
        var unknown = new PowertrainHandoff(1000, gain, withdraw, profile =>
        {
            commands.Add(profile);
            throw new InvalidOperationException("indeterminate setter fixture");
        }, (operation, detail) => {});
        unknown.Start(car, 0);
        unknown.Advance(100, car, true, true, prepare);
        unknown.Advance(500, car, true, false, new PowertrainEvidence(car, 0, null, false, false, true, "host exited"));
        Check(unknown.Phase == "Uncertain" && !unknown.CanRetry && String.Join(",", commands) == "RA_RC_QUIET,withdraw");
        Check(unknown.Restore(550) == "accepted");
        unknown.Advance(600, car, true, false, new PowertrainEvidence(car, 0, null, false, false, true, null));
        Check(unknown.Phase == "Uncertain" && String.Join(",", commands) == "RA_RC_QUIET,withdraw,ADDER");
        Check(unknown.Restore(650) != "accepted");
        Console.WriteLine("Passed powertrain readiness, single-owner gain, output drain, host recovery, and identity fixtures.");
    }
}
