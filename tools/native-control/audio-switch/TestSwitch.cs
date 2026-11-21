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
}
