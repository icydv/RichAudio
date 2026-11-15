// Reflection-only inspection of the actual experiment DLL. No candidate code runs.
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
internal static class InspectAutomatic07
{
    sealed class I { public int offset; public string op; public object value; }
    static readonly BindingFlags F=BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance|BindingFlags.Static|BindingFlags.DeclaredOnly;
    static readonly Dictionary<ushort,OpCode> Ops=typeof(OpCodes).GetFields(BindingFlags.Public|BindingFlags.Static).ToDictionary(x=>unchecked((ushort)((OpCode)x.GetValue(null)).Value),x=>(OpCode)x.GetValue(null));
    static readonly List<string> Checks=new List<string>();
    static void Need(bool b,string reason){if(!b)throw new Exception(reason);Checks.Add(reason);}
    static string Sha(string p){using(var f=File.OpenRead(p))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
    static List<I> Decode(MethodBase m){
        var r=new List<I>();var body=m.GetMethodBody();if(body==null)return r;var b=body.GetILAsByteArray();int i=0;
        while(i<b.Length){int at=i;ushort key=b[i++];if(key==254)key=(ushort)(65024+b[i++]);var op=Ops[key];int n;object v=null;
            switch(op.OperandType){
                case OperandType.InlineNone:n=0;break;
                case OperandType.ShortInlineI:n=1;v=(int)(sbyte)b[i];break;
                case OperandType.ShortInlineVar:case OperandType.ShortInlineBrTarget:n=1;break;
                case OperandType.InlineVar:n=2;break;
                case OperandType.InlineI8:n=8;v=BitConverter.ToInt64(b,i);break;
                case OperandType.InlineR:n=8;break;
                case OperandType.InlineI:n=4;v=BitConverter.ToInt32(b,i);break;
                case OperandType.InlineSwitch:n=4+4*BitConverter.ToInt32(b,i);break;
                case OperandType.InlineString:n=4;v=m.Module.ResolveString(BitConverter.ToInt32(b,i));break;
                case OperandType.InlineField:n=4;v=m.Module.ResolveField(BitConverter.ToInt32(b,i),m.DeclaringType.GetGenericArguments(),m.IsGenericMethod?m.GetGenericArguments():null).Name;break;
                case OperandType.InlineMethod:n=4;var c=m.Module.ResolveMethod(BitConverter.ToInt32(b,i),m.DeclaringType.GetGenericArguments(),m.IsGenericMethod?m.GetGenericArguments():null);v=c.DeclaringType.FullName+"::"+c.Name+"("+String.Join(",",c.GetParameters().Select(p=>p.ParameterType.FullName))+")";break;
                default:n=4;break;
            }
            r.Add(new I{offset=at,op=op.Name,value=v});i+=n;
        }
        if(i!=b.Length)throw new Exception("IL boundary mismatch");return r;
    }
    static bool Has(List<I> x,string text){return x.Any(y=>y.value is string&&((string)y.value).Contains(text));}
    public static int Main(string[] args){try{
        string repo=Path.GetFullPath(args[0]),buildPath=Path.GetFullPath(args[1]),outPath=Path.GetFullPath(args[2]);
        var json=new JavaScriptSerializer{MaxJsonLength=16000000};var build=(Dictionary<string,object>)json.DeserializeObject(File.ReadAllText(buildPath));
        var binary=(Dictionary<string,object>)build["binary"];string file=(string)binary["path"];
        Need(Sha(file)==(string)binary["sha256"],"actual DLL equals build receipt");
        string api=Path.Combine(repo,@".local\shvdne-reference\release\ScriptHookVDotNet3.dll"),core=Path.Combine(repo,@".local\shvdne-reference\release\ScriptHookVDotNet.asi");
        AppDomain.CurrentDomain.ReflectionOnlyAssemblyResolve+=delegate(object sender,ResolveEventArgs e){var name=new AssemblyName(e.Name).Name;if(name=="ScriptHookVDotNet3")return Assembly.ReflectionOnlyLoadFrom(api);if(name=="ScriptHookVDotNet")return Assembly.ReflectionOnlyLoadFrom(core);return Assembly.ReflectionOnlyLoad(e.Name);};
        Assembly.ReflectionOnlyLoadFrom(api);var a=Assembly.ReflectionOnlyLoadFrom(file);
        Need(a.GetName().Version.ToString()=="0.7.0.0","separate candidate version 0.7.0.0");
        var scripts=a.GetTypes().Where(t=>t.BaseType!=null&&t.BaseType.FullName=="GTA.Script").ToArray();Need(scripts.Length==1,"exactly one script entry");
        Type controller=a.GetType("RichAudio.NativeSuppression01.IdleExperiment"),adapter=a.GetType("RichAudio.NativeSuppression01.IdleNativeApi"),binding=a.GetType("RichAudio.NativeSuppression01.Candidate");
        Need((string)binding.GetField("SourceCommit",F).GetRawConstantValue()==(string)build["sourceCommit"],"compiled source commit");
        var dlc=(Dictionary<string,object>)build["dlc"];Need((string)binding.GetField("DlcSha256",F).GetRawConstantValue()==(string)dlc["sha256"]&&Sha((string)dlc["path"])==(string)dlc["sha256"],"compiled actual DLC pin");
        var order=Decode(controller.TypeInitializer).Where(x=>x.op=="ldstr").Select(x=>(string)x.value).ToArray();Need(order.SequenceEqual(new[]{"BATI","ADDER","BATI","ra_ns06_adder_select","BATI"}),"compiled exact phase order and names");
        var assign=Decode(adapter.GetMethod("Assign",F));
        var all=a.GetTypes().SelectMany(t=>t.GetMethods(F).Cast<MethodBase>().Concat(t.GetConstructors(F)).Concat(t.TypeInitializer==null?new MethodBase[0]:new[]{t.TypeInitializer})).Distinct().SelectMany(Decode).ToList();
        Need(all.Count(x=>x.op=="ldc.i8"&&Object.Equals(x.value,0x4F0C413926060B38L))==1,"one compiled setter location");
        Need(Has(assign,"GTA.Native.InputArgument::op_Implicit(System.Int32)")&&Has(assign,"GTA.Native.InputArgument::op_Implicit(System.String)"),"actual SDK int-handle and string-name argument conversions");
        Need(Has(assign,"CanRestore")&&assign.Any(x=>x.op=="ldstr"&&Object.Equals(x.value,"fixed profile, exact owned A and safe Story context required")),"A-only whitelist and exact lifetime guard");
        int native=assign.FindIndex(x=>x.value is string&&((string)x.value).Contains("GTA.Native.Function::Call"));
        int guard=assign.FindLastIndex(x=>x.value is string&&((string)x.value).Contains("System.Func`1[[System.Boolean"));
        Need(guard>assign.FindIndex(x=>x.value is string&&((string)x.value).Contains("CanRestore"))&&guard<native,"final callback after native prerequisites and before setter");
        var confirmation=Decode(controller.GetMethod("ConfirmObservation",F));Need(!Has(confirmation,"Snapshot")&&!Has(confirmation,"GET_VEHICLE_DEFAULT_HORN"),"no horn-getter predicate in evidence acceptance");
        var keys=Decode(scripts[0].GetMethod("OnKey",F));Need(Has(keys,"emergencyRequested")&&!Has(keys,"Arm")&&!Has(keys,"Apply")&&!Has(keys,"ConfirmObservation")&&Has(Decode(scripts[0].GetMethod("OnTick",F)),"Stop"),"manual emergency queued into same checked callback; no keyboard phase or evidence acceptance");
        var automatic=Decode(a.GetType("RichAudio.NativeSuppression01.AutomaticRun").GetMethod("Tick",F));int arm=automatic.FindIndex(x=>x.value is string&&((string)x.value).Contains("IdleExperiment::Arm"));int apply=automatic.FindIndex(x=>x.value is string&&((string)x.value).Contains("IdleExperiment::Apply"));Need(arm>=0&&apply>arm&&!automatic.Skip(arm+1).Take(apply-arm-1).Any(x=>x.op=="call"||x.op=="callvirt"),"actual IL arms and applies together with no intervening IO, clock wait or chat");
        Need(Has(automatic,"Durable")&&Has(automatic,"dispatch-reserved"),"durable reservation before local dispatch");
        Need(!Has(all,"SendKeys")&&!Has(all,"SendInput")&&!Has(all,"AUTOMATED-DISPOSABLE-FIXTURE"),"no keyboard simulation or fixture startup bypass in candidate");
        Need(Has(Decode(controller.GetMethod("Tick",F)),"525 second release reserve"),"compiled terminal release reserve");
        Need(Has(Decode(controller.GetMethod("Cleanup",F)),"record release outcome before retirement"),"compiled audible-outcome cleanup gate");
        Need(Has(Decode(adapter.GetMethod("CreateDeleteArgument",F)),"op_Implicit(System.Void*)"),"real SDK caller-owned deletion argument conversion");
        Need(File.ReadAllText(Path.Combine(Path.GetDirectoryName(file),"RichAudio.NativeSuppression07.ini")).Trim()=="Enabled=false","disabled default INI");
        Need(!AppDomain.CurrentDomain.GetAssemblies().Any(x=>x.GetName().Name==a.GetName().Name||x.GetName().Name=="ScriptHookVDotNet"),"candidate and mixed core never execution-loaded");
        var output=new {passed=true,checks=Checks,method="Reflection-only metadata and decoded actual IL; no type initializer or candidate execution",candidateSha256=Sha(file),buildReceiptSha256=Sha(buildPath),assemblyVersion=a.GetName().Version.ToString(),phaseOrder=order,assignmentIL=assign,confirmationIL=confirmation,nativeCalls=0,gameLaunched=false,runtimeQualified=false};
        using(var stream=new FileStream(outPath,FileMode.CreateNew))using(var writer=new StreamWriter(stream))writer.Write(json.Serialize(output));
        Console.WriteLine("PASS checks="+Checks.Count+"; actual DLL metadata and SDK conversion IL; no candidate execution");return 0;
    }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
