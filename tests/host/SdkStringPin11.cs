using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
[assembly:System.Reflection.AssemblyVersion("3.9.0.6")]
// Test-only replacement for the mixed core's string lifetime service. This
// exposes no native dispatcher, game state, scanning or controller API. The
// unmodified retained SDK still constructs each actual InputArgument itself.
namespace SHVDN {
    public sealed class ScriptDomain {
        static readonly ScriptDomain domain=new ScriptDomain();
        readonly Dictionary<string,IntPtr> pinned=new Dictionary<string,IntPtr>();
        public static ScriptDomain CurrentDomain{get{return domain;}}
        public IntPtr PinString(string value){IntPtr p;if(!pinned.TryGetValue(value,out p)){p=Marshal.StringToHGlobalAnsi(value);pinned.Add(value,p);}return p;}
    }
}
