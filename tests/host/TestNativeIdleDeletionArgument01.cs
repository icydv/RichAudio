using System;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using GTA.Native;
using RichAudio.NativeSuppression01;

// Runs only the real SDK's pointer argument conversion code. No Function.Call,
// script instance, NativeMemory access, game process, or SHVDNE core is involved.
public static class TestNativeIdleDeletionArgument01
{
    static int checks;
    static void Check(bool value, string message)
    {
        checks++;
        if (!value) throw new Exception(message);
    }
    static void NoCoreLoaded()
    {
        Check(!AppDomain.CurrentDomain.GetAssemblies().Any(x => x.GetName().Name == "ScriptHookVDotNet"), "SHVDNE core must not be loaded");
    }
    [MethodImpl(MethodImplOptions.NoInlining)]
    static unsafe void TypedHandleRoundTrip()
    {
        var data = typeof(InputArgument).GetField("_data", BindingFlags.Instance | BindingFlags.NonPublic);
        Check(data != null && data.FieldType == typeof(ulong), "reviewed input argument metadata");
        foreach (int initialHandle in new[] { 1794, 2050, 0, 1, Int32.MaxValue, -1, Int32.MinValue })
        {
            int handle = initialHandle;
            InputArgument argument = IdleNativeApi.CreateDeleteArgument(&handle);
            ulong pointer = (ulong)data.GetValue(argument);
            Check(pointer == (ulong)&handle, "production helper passes the address, not the handle value");
            IntPtr address = new IntPtr((void*)pointer);
            Check(Marshal.ReadInt32(address) == initialHandle, "production helper preserves the exact 32-bit handle");
            // This is the test's own stack slot, not game memory. Model the
            // documented output mutation without dispatching DELETE_ENTITY.
            Marshal.WriteInt32(address, 0);
            Check(handle == 0, "output write updates the original caller-owned handle");
        }
    }
    public static int Main()
    {
        try
        {
            AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs args) {
                throw new InvalidOperationException("Unexpected dependency resolution refused: " + args.Name);
            };
            NoCoreLoaded();
            TypedHandleRoundTrip();
            NoCoreLoaded();
            Console.WriteLine("PASS assertions=" + checks + "; exact retained API argument regression; native dispatches=0; SHVDNE core loaded=false; game launched=false; live deletion unqualified");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
