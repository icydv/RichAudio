// Test-only CLR runtime facade. Production and fixture-policy diagnostic plugins
// are compiled against the authentic reviewed SDK, never this file.
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading;

[assembly: AssemblyVersion("0.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace Rage.Attributes
{
    [AttributeUsage(AttributeTargets.Assembly)]
    public sealed class PluginAttribute : Attribute
    {
        public PluginAttribute(string name) { Name = name; }
        public string Name { get; private set; }
        public string Author { get; set; }
        public string Description { get; set; }
        public string EntryPoint { get; set; }
        public string ExitPoint { get; set; }
        public bool PrefersSingleInstance { get; set; }
        public bool ShouldTickInPauseMenu { get; set; }
    }
}

namespace Rage
{
    public static class Game
    {
        static readonly object Gate = new object();
        static readonly List<string> Lines = new List<string>();
        public static void LogTrivial(string message)
        {
            lock (Gate)
            {
                if (message == null || message.Length > 512 || Lines.Count >= 32)
                    throw new InvalidOperationException("fixture-log-bound");
                Lines.Add(message);
            }
        }
        public static string[] FixtureLogs() { lock (Gate) return Lines.ToArray(); }
    }

    public static class GameFiber
    {
        static int sleeps;
        public static void Sleep(int milliseconds)
        {
            if (milliseconds < 0 || milliseconds > 1000)
                throw new InvalidOperationException("fixture-sleep-bound");
            Interlocked.Increment(ref sleeps);
            Thread.Sleep(milliseconds);
        }
        public static int FixtureSleeps { get { return Volatile.Read(ref sleeps); } }
    }
}
