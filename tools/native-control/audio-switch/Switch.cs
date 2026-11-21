using System;

[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("TestSwitch")]

namespace RichAudio.AudioSwitch
{
    internal sealed class Switch
    {
        internal const string Donor = "VOLTIC";
        string target;
        internal string Generation { get; private set; }
        internal string Phase { get; private set; }

        internal Switch() { Phase = "idle"; Generation = Guid.NewGuid().ToString("N"); }

        internal void Observe(string current)
        {
            if (current == target) return;
            target = current;
            Generation = Guid.NewGuid().ToString("N");
            Phase = "idle";
        }

        internal string Command(string operation, string generation, bool foreground, bool running,
                                bool tokenValid, Action<string> dispatch)
        {
            if (!foreground) return "GTA is not foreground";
            if (target == null || generation != Generation) return "target changed or unavailable";
            if (!running) return "engine stopped";
            if (!tokenValid) return "vehicle token mismatch";
            bool apply = operation == "Ready";
            if (!(apply && Phase == "idle") && !(operation == "Restore" && Phase == "restore available"))
                return "operation unavailable";
            Phase = apply ? "restore available" : "restore uncertain";
            try { dispatch(apply ? Switch.Donor : "ADDER"); }
            catch (Exception e) { return "uncertain: " + e.Message; }
            if (!apply) Phase = "idle";
            return "returned";
        }
    }
}
