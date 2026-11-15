using System;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using GTA.Native;
using RichAudio.NativeSuppression01;
internal static class TestAutomaticSdk08
{
    static int checks;
    static void Check(bool b,string s){checks++;if(!b)throw new Exception(s);}
    static unsafe int Main(){try{
        Check(!AppDomain.CurrentDomain.GetAssemblies().Any(x=>x.GetName().Name=="ScriptHookVDotNet"),"no mixed core loaded");
        var data=typeof(InputArgument).GetField("_data",BindingFlags.Instance|BindingFlags.NonPublic);Check(data!=null,"real retained SDK argument metadata");
        foreach(int initial in new[]{0,1,2306,2562,Int32.MaxValue,-1,Int32.MinValue}){
            int handle=initial;InputArgument arg=IdleNativeApi.CreateDeleteArgument(&handle);ulong ptr=(ulong)data.GetValue(arg);
            Check(ptr==(ulong)&handle&&Marshal.ReadInt32(new IntPtr((void*)ptr))==initial,"actual DELETE_ENTITY helper addresses caller int");Marshal.WriteInt32(new IntPtr((void*)ptr),0);Check(handle==0,"SDK pointer output mutates only fixture stack");
            var horn=IdleNativeApi.CreateHornArguments(initial);Check(horn.Length==4,"physical horn arity");Check((ulong)data.GetValue(horn[0])==unchecked((ulong)(long)initial),"physical horn exact signed handle");Check((ulong)data.GetValue(horn[1])==600,"physical horn bounded milliseconds");Check((ulong)data.GetValue(horn[3])==0,"physical horn forever=false");
        }
        uint j=0;foreach(char c in "helddown"){j+=(byte)c;j+=j<<10;j^=j>>6;}j+=j<<3;j^=j>>11;j+=j<<15;
        Check((ulong)data.GetValue(IdleNativeApi.CreateHornArguments(1)[2])==j,"HELDDOWN hash matches retained SDK route");
        float z=41.2f;InputArgument ground=IdleNativeApi.CreateGroundArgument(&z);ulong gp=(ulong)data.GetValue(ground);Check(gp==(ulong)&z,"ground output addresses caller float");Marshal.WriteInt32(new IntPtr((void*)gp),BitConverter.ToInt32(BitConverter.GetBytes(42.5f),0));Check(z==42.5f,"ground output is typed single precision");
        Check(!AppDomain.CurrentDomain.GetAssemblies().Any(x=>x.GetName().Name=="ScriptHookVDotNet"),"native dispatches zero; core never loaded");
        Console.WriteLine("PASS assertions="+checks+"; actual retained SDK delete/ground/horn argument helpers; no native calls, game or core");return 0;
    }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
