#if SHV_HANDOFF_09
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using Rage;
using Rage.Native;

namespace RichAudio.Beacon.Rph
{
    // Functional surface only. Third-party distribution authentication is outside
    // this policy. Reflection does not invoke a getter/native or prove its runtime
    // behaviour; actual Story/vehicle/camera calls retain their fail-safe checks.
    internal static class RphHandoffCompatibility
    {
        internal sealed class Result
        {
            public bool Compatible;
            public string Reason,ApiAssemblyName,ApiModuleName,ApiMvid,ApiLocation,
                ApiSha256,ApiFileVersion,DiagnosticStatus;
        }

        internal static Result Inspect()
        {
            var result=new Result{Compatible=false,Reason="rph-required-api-incompatible"};
            try
            {
                // These are the types bound by the actual typed calls, not names
                // resolved from an arbitrary file. Forwarded/split API types are
                // allowed when their actual assemblies are in this AppDomain.
                foreach(Type type in new[]{typeof(Game),typeof(GameConsole),typeof(GameFiber),typeof(Player),
                    typeof(Ped),typeof(Vehicle),typeof(Entity),typeof(PoolHandle),typeof(Model),
                    typeof(Vector3),typeof(NativeFunction),typeof(NativeArgument)})
                {
                    bool loaded=false;foreach(Assembly assembly in AppDomain.CurrentDomain.GetAssemblies())
                        if(System.Object.ReferenceEquals(assembly,type.Assembly)){loaded=true;break;}
                    Require(loaded&&type.IsVisible&&!type.ContainsGenericParameters,"typed-context");
                }
                Require(typeof(Entity).IsAssignableFrom(typeof(Ped))&&typeof(Entity).IsAssignableFrom(typeof(Vehicle)),"entity-context");
                Require(typeof(PoolHandle).IsValueType&&typeof(Model).IsValueType&&typeof(Vector3).IsValueType,"value-contract");
                Property(typeof(Game),"Console",typeof(GameConsole),true);
                Property(typeof(Game),"LocalPlayer",typeof(Player),true);
                Property(typeof(Game),"IsLoading",typeof(bool),true);
                Property(typeof(Game),"IsPaused",typeof(bool),true);
#if SHV_HANDOFF_14
                Property(typeof(GameConsole),"IsOpen",typeof(bool),false);
#endif
                Method(typeof(GameConsole),"Print",typeof(void),false,typeof(string));
                Method(typeof(GameFiber),"Sleep",typeof(void),true,typeof(int));
                Property(typeof(Player),"Character",typeof(Ped),false);
                Property(typeof(Ped),"CurrentVehicle",typeof(Vehicle),false);
                Property(typeof(Vehicle),"Driver",typeof(Ped),false);
                Property(typeof(Vehicle),"IsEngineOn",typeof(bool),false);
                Method(typeof(Entity),"IsValid",typeof(bool),false);
                Property(typeof(Entity),"IsDead",typeof(bool),false);
                Property(typeof(Entity),"MemoryAddress",typeof(IntPtr),false);
                Property(typeof(Entity),"Handle",typeof(PoolHandle),false);
                Property(typeof(Entity),"Model",typeof(Model),false);
                foreach(string name in new[]{"Position","Velocity","ForwardVector","UpVector"})
                    Property(typeof(Entity),name,typeof(Vector3),false);
                Property(typeof(PoolHandle),"Index",typeof(uint),false);
                Property(typeof(PoolHandle),"Counter",typeof(byte),false);
                Property(typeof(PoolHandle),"Value",typeof(uint),false);
                Property(typeof(Model),"Hash",typeof(uint),false);
                foreach(string name in new[]{"X","Y","Z"})
                {
                    FieldInfo field=typeof(Vector3).GetField(name,BindingFlags.Public|BindingFlags.Instance);
                    Require(field!=null&&field.FieldType==typeof(float),"Vector3."+name);
                }
                Method(typeof(NativeArgument),"op_Implicit",typeof(NativeArgument),true,typeof(int));
                MethodInfo dispatch=null;
                foreach(MethodInfo method in typeof(NativeFunction).GetMethods(BindingFlags.Public|BindingFlags.Static))
                {
                    if(method.Name!="CallByName"||!method.IsGenericMethodDefinition||method.GetGenericArguments().Length!=1)continue;
                    ParameterInfo[] parameters=method.GetParameters();
                    if(parameters.Length!=2||parameters[0].ParameterType!=typeof(string)
                        ||parameters[1].ParameterType!=typeof(NativeArgument[])||!method.ReturnType.IsGenericParameter)continue;
                    Require(dispatch==null,"native-dispatch-ambiguous");dispatch=method;
                }
                Require(dispatch!=null&&(dispatch.CallingConvention&CallingConventions.VarArgs)==0,"native-dispatch");
                foreach(Type value in new[]{typeof(bool),typeof(int),typeof(uint),typeof(Vector3)})
                    Require(dispatch.MakeGenericMethod(value).ReturnType==value,"native-result-contract");
                result.Compatible=true;result.Reason="rph-required-api-shapes-present";
            }
            catch(System.Threading.ThreadAbortException){throw;}
            catch(Exception error){result.Reason="rph-required-api-incompatible:"+Bound(error is InvalidDataException?error.Message:error.GetType().Name,128);}
            CaptureDiagnostics(result);
            return result;
        }

        static void Property(Type owner,string name,Type value,bool isStatic)
        {
            PropertyInfo property=owner.GetProperty(name,BindingFlags.Public|(isStatic?BindingFlags.Static:BindingFlags.Instance));
            MethodInfo getter=property==null?null:property.GetGetMethod();
            Require(property!=null&&property.PropertyType==value&&property.GetIndexParameters().Length==0
                &&getter!=null&&getter.IsStatic==isStatic&&!getter.ContainsGenericParameters,"property:"+owner.Name+"."+name);
        }
        static void Method(Type owner,string name,Type value,bool isStatic,params Type[] parameters)
        {
            MethodInfo method=owner.GetMethod(name,BindingFlags.Public|(isStatic?BindingFlags.Static:BindingFlags.Instance),null,parameters,null);
            Require(method!=null&&method.ReturnType==value&&!method.ContainsGenericParameters
                &&(method.CallingConvention&CallingConventions.VarArgs)==0,"method:"+owner.Name+"."+name);
        }
        static void Require(bool condition,string reason){if(!condition)throw new InvalidDataException(reason);}
        static string Bound(string value,int length){return value==null?null:value.Length<=length?value:value.Substring(0,length);}
        static void Observe(Action capture,ref int failures)
        {
            try{capture();}
            catch(System.Threading.ThreadAbortException){throw;}
            catch{failures++;}
        }
        static void CaptureDiagnostics(Result result)
        {
            // No diagnostic field contributes to Compatible. Empty, inaccessible,
            // changed or unknown API files are troubleshooting data only. This
            // best-effort on-disk hash is not a proof of loaded memory contents.
            int failures=0;Assembly assembly=typeof(Game).Assembly;
            Observe(delegate{result.ApiAssemblyName=Bound(assembly.FullName,512);},ref failures);
            Observe(delegate{result.ApiModuleName=Bound(assembly.ManifestModule.Name,256);
                result.ApiMvid=assembly.ManifestModule.ModuleVersionId.ToString("D");},ref failures);
            Observe(delegate{result.ApiLocation=Bound(assembly.Location,2048);},ref failures);
            if(String.IsNullOrEmpty(result.ApiLocation))failures++;
            else
            {
                Observe(delegate{result.ApiFileVersion=Bound(FileVersionInfo.GetVersionInfo(result.ApiLocation).FileVersion,128);},ref failures);
                Observe(delegate{using(var file=File.OpenRead(result.ApiLocation))using(var hash=SHA256.Create())
                    result.ApiSha256=BitConverter.ToString(hash.ComputeHash(file)).Replace("-","").ToLowerInvariant();},ref failures);
            }
            result.DiagnosticStatus=failures==0?"best-effort-metadata-captured":"best-effort-metadata-incomplete";
        }
    }
}
#endif
