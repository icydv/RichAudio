using System;
using System.Collections.Generic;
using RichAudio.AudioSwitch;

class TestSwitch
{
    static void Check(bool value) { if (!value) throw new Exception("Switch assertion failed"); }
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
        Check(String.Join(",", calls) == "ra_quiet_orchard,ADDER");
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
        Console.WriteLine("Passed single dispatch, same-target restore, foreground, target replacement, token loss and uncertainty checks.");
    }
}
