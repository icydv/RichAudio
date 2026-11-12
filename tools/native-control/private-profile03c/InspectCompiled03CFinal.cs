// Metadata-only inspection of the actual candidate; no candidate code is executed.
using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

internal static class InspectCompiled03CFinal
{
    sealed class Instruction { public int offset; public string op; public object operand; }
    static readonly Dictionary<ushort,OpCode> Ops=typeof(OpCodes).GetFields(BindingFlags.Public|BindingFlags.Static).ToDictionary(f=>unchecked((ushort)((OpCode)f.GetValue(null)).Value),f=>(OpCode)f.GetValue(null));
    static readonly BindingFlags Flags=BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Static|BindingFlags.Instance|BindingFlags.DeclaredOnly;
    static void Require(bool b,string reason) { if(!b)throw new InvalidOperationException(reason); }
    static string Sha(string file) { using(var f=File.OpenRead(file))using(var s=SHA256.Create())return BitConverter.ToString(s.ComputeHash(f)).Replace("-","").ToLowerInvariant(); }
    static List<Instruction> Decode(MethodBase method)
    {
        var result=new List<Instruction>();var body=method.GetMethodBody();if(body==null)return result;byte[] bytes=body.GetILAsByteArray();int i=0;
        while(i<bytes.Length) {
            int at=i;ushort code=bytes[i++];if(code==254)code=(ushort)(65024+bytes[i++]);var op=Ops[code];object value=null;int length;
            switch(op.OperandType) {
                case OperandType.InlineNone:length=0;break;
                case OperandType.ShortInlineI:length=1;value=(int)(sbyte)bytes[i];break;
                case OperandType.ShortInlineVar:case OperandType.ShortInlineBrTarget:length=1;break;
                case OperandType.InlineVar:length=2;break;
                case OperandType.InlineI8:length=8;value=BitConverter.ToInt64(bytes,i);break;
                case OperandType.InlineR:length=8;break;
                case OperandType.InlineI:length=4;value=BitConverter.ToInt32(bytes,i);break;
                case OperandType.InlineSwitch:length=4+4*BitConverter.ToInt32(bytes,i);value=BitConverter.ToInt32(bytes,i);break;
                case OperandType.InlineString:length=4;value=method.Module.ResolveString(BitConverter.ToInt32(bytes,i));break;
                case OperandType.InlineField:length=4;value=method.Module.ResolveField(BitConverter.ToInt32(bytes,i)).Name;break;
                case OperandType.InlineMethod:length=4;value=method.Module.ResolveMethod(BitConverter.ToInt32(bytes,i)).Name;break;
                default:length=4;break;
            }
            result.Add(new Instruction{offset=at,op=op.Name,operand=value});i+=length;
        }
        Require(i==bytes.Length,"IL boundary mismatch");return result;
    }
    static bool Value(List<Instruction> list,string op,object value) { return list.Any(x=>x.op==op&&Object.Equals(x.operand,value)); }
    public static int Main(string[] args)
    {
        try {
            string repo=Path.GetFullPath(args[0]);string directory=Path.Combine(repo,@".local\gate-a-shvdne-private-03c\resource-probe\build-02");
            string file=Path.Combine(directory,"RichAudio.GateAPrivate03C.Shvdne.dll");string api=Path.Combine(repo,@".local\shvdne-reference\release\ScriptHookVDotNet3.dll");string core=Path.Combine(repo,@".local\shvdne-reference\release\ScriptHookVDotNet.asi");
            Require(Sha(file)=="fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0","Candidate identity drift");
            AppDomain.CurrentDomain.ReflectionOnlyAssemblyResolve+=delegate(object sender,ResolveEventArgs e) {
                string name=new AssemblyName(e.Name).Name;
                if(name=="ScriptHookVDotNet3")return Assembly.ReflectionOnlyLoadFrom(api);
                if(name=="ScriptHookVDotNet")return Assembly.ReflectionOnlyLoadFrom(core);
                return Assembly.ReflectionOnlyLoad(e.Name);
            };
            Assembly.ReflectionOnlyLoadFrom(api);Assembly.ReflectionOnlyLoadFrom(core);var asm=Assembly.ReflectionOnlyLoadFrom(file);
            Require(asm.GetName().Version.ToString()=="0.3.1.1","Candidate version");
            var scripts=asm.GetTypes().Where(t=>t.BaseType!=null&&t.BaseType.FullName=="GTA.Script").ToArray();Require(scripts.Length==1&&scripts[0].FullName=="RichAudio.GateA.Private03.GateAPrivate03Script","Exactly one expected script");
            var controller=asm.GetType("RichAudio.GateA.Private03.ProfileAssignmentController");var apiType=asm.GetType("RichAudio.GateA.Private03.ShvdneProfileApi");
            var assign=Decode(apiType.GetMethod("AssignPrivateProfile",Flags));long setter=0x4F0C413926060B38L;
            Require(assign.Count(x=>x.op=="ldc.i8"&&Object.Equals(x.operand,setter))==1&&Value(assign,"ldstr","ra_gapriv01_bati")&&Value(assign,"ldstr","A"),"Fixed setter/profile/A binding");
            var all=asm.GetTypes().SelectMany(t=>t.GetMethods(Flags).Cast<MethodBase>().Concat(t.GetConstructors(Flags)).Concat(t.TypeInitializer==null?new MethodBase[0]:new[]{t.TypeInitializer})).Distinct().SelectMany(Decode).ToList();
            Require(all.Count(x=>x.op=="ldc.i8"&&Object.Equals(x.operand,setter))==1,"Exactly one compiled setter location");
            Require(apiType.GetConstructors(Flags).Length==1&&apiType.GetConstructors(Flags)[0].GetParameters().Length==2,"Required explicit final phase guard constructor; no permissive overload");
            int finalPhase=assign.FindLastIndex(x=>x.op=="ldfld"&&Object.Equals(x.operand,"assignmentAllowed"));
            int context=assign.FindLastIndex(x=>Object.Equals(x.operand,"EmptyStoppedAndDriveable"));
            int setterCall=assign.FindLastIndex(x=>Object.Equals(x.operand,"Call"));
            Require(context>=0&&finalPhase>context&&setterCall>finalPhase,"Final phase check after native context and before setter");
            Require(all.Any(x=>Object.Equals(x.operand,"get_NativeAssignmentAllowed")),"Actual script supplies controller deadline callback");
            var finalGuard=Decode(controller.GetMethod("get_NativeAssignmentAllowed",Flags));
            Require(finalGuard.FindLastIndex(x=>Object.Equals(x.operand,"clock"))>finalGuard.FindLastIndex(x=>Object.Equals(x.operand,"get_Healthy")),"Final callback checks clock after guard and journal health");
            var spawn=Decode(controller.GetMethod("RequestSpawn",Flags));var tick=Decode(controller.GetMethod("Tick",Flags));var baseline=Decode(controller.GetMethod("ConfirmBaseline",Flags));var request=Decode(controller.GetMethod("RequestAssignment",Flags));var keys=Decode(scripts[0].GetMethod("OnKeyDown",Flags));
            foreach(string field in new[]{"activeStarted","baselineCutoff","assignmentCutoff","retirementCutoff"})Require(Value(spawn,"stfld",field),"Shared phase origin/field: "+field);
            foreach(int n in new[]{80,100,140})Require(Value(spawn,"ldc.i4",n)||Value(spawn,"ldc.i4.s",n),"Compiled phase duration");
            foreach(string reason in new[]{"baseline-decision-80-second-limit","assignment-100-second-limit","retirement-140-second-limit","3-minute-active-limit"})Require(Value(tick,"ldstr",reason),"Independent phase stop: "+reason);
            Require(Value(baseline,"ldfld","baselineCutoff")&&Value(request,"ldfld","assignmentCutoff")&&Value(request,"call","get_BaselineAccepted"),"Baseline and assignment command gates");
            Require(Value(keys,"switch",6)&&keys.Any(x=>x.operand as string=="get_Control")&&keys.Any(x=>x.operand as string=="get_Shift"),"Manual CtrlShift F5-F10 commands");
            var binding=Decode(asm.GetType("RichAudio.GateA.Private03.PrivateCandidateBinding").TypeInitializer);var pins=(object[])new JavaScriptSerializer().DeserializeObject(File.ReadAllText(Path.Combine(repo,@".local\gate-a-shvdne-private-03\compiled-resource-pins.json")));
            foreach(Dictionary<string,object> pin in pins)Require(Value(binding,"ldstr",pin["relative"])&&Value(binding,"ldstr",pin["sha256"]),"Compiled resource pins");
            string ini=File.ReadAllText(Path.Combine(directory,"RichAudio.GateAPrivate03C.Shvdne.ini"));Require(ini.Contains("Enabled=false")&&!ini.Contains("Enabled=true")&&ini.Contains("Experiment=GATE-A-SHVDNE-PRIVATE-03C"),"Disabled default configuration");
            var result=new {passed=true,method="Reflection-only metadata and actual IL; no candidate execution or type initializer invocation",candidateSha256=Sha(file),assemblyVersion=asm.GetName().Version.ToString(),script=scripts[0].FullName,setterLocations=1,fixedNative="4F0C413926060B38",fixedProfile="ra_gapriv01_bati",targetRole="A",defaultEnabled=false,compiledPinsVerified=true,compiledBaselineGate=true,sharedSpawnOriginVerified=true,requiredFinalNativePhaseGuard=true,noPermissiveConstructor=true,phaseGuardAfterNativeContext=true,finalCallbackClockLast=true,baselineCutoffMs=80000,assignmentCutoffMs=100000,normalRetirementMs=140000,absoluteActiveMs=180000,assignmentIL=assign,finalGuardIL=finalGuard,requestSpawnIL=spawn,tickIL=tick,baselineIL=baseline,assignmentRequestIL=request,commandsIL=keys};
            var json=new JavaScriptSerializer{MaxJsonLength=8000000}.Serialize(result);using(var output=new FileStream(Path.Combine(directory,"compiled-inspection.json"),FileMode.CreateNew))using(var writer=new StreamWriter(output))writer.Write(json);
            Console.WriteLine("PASS actual03C compiled metadata, one fixed A-only setter, defaultdisabled, manual controls, resource pins and80/100/140/180 phase gates");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
