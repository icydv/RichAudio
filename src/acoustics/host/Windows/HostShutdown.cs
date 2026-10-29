using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;

namespace RichAudio.Beacon.Windows
{
    public static partial class HostProgram
    {
        private static Action shutdownFixtureHook;
        private static Action listenerFixtureHook;
        private static RichAudio.Beacon.Transport.StatePipeServer shutdownFixturePipe;
        private static void RecordFailure(string stage,string message,Exception exception=null)
        {
            string detail=exception==null?message:exception.GetType().Name+": "+message;
            var evidence=new Dictionary<string,object>{{"stage",stage},{"message",detail},{"exceptionType",exception==null?null:exception.GetType().Name},
                {"stack",exception==null?null:Limit(exception.StackTrace,1500)},{"duringShutdown",stop}};
            lock(failureLock){if(producerError==null){producerError=detail;primaryFailure=evidence;}else if(secondaryFailures.Count<16)secondaryFailures.Add(evidence);}
        }
        private static string Limit(string value,int maximum){return value==null||value.Length<=maximum?value:value.Substring(0,maximum);}
        private static void ShutdownStep(string stage,Action action){try{action();}catch(Exception error){RecordFailure(stage,error.Message,error);}}
        private static void JoinOwnedThread(Thread thread,string label){if(thread!=null&&thread.IsAlive&&!thread.Join(1000))throw new TimeoutException(label+" did not stop; resources retained until process exit");}
        private static void PublishTerminal(string directory,Dictionary<string,object> result)
        {
            string diagnostics=Path.Combine(directory,"renderer-diagnostics.txt");
            if(!File.Exists(diagnostics))ShutdownStep("diagnostic-evidence",delegate{lock(logLock)WriteNew(diagnostics,string.Join(Environment.NewLine,rendererLog.ToArray()));});
            lock(failureLock){result["producerError"]=producerError;result["primaryFailure"]=primaryFailure;result["secondaryFailures"]=secondaryFailures.ToArray();}
            result["listenerTerminal"]=listenerTerminal;result["controlsRejectedDuringShutdown"]=controlsRejectedDuringShutdown;
            result["listenerTerminalBoundary"]=listenerTerminalBoundary;
            if(producerError!=null)result["terminationReason"]="failure";
            string target=Path.Combine(directory,"host-result.json");
            if(File.Exists(target))target=Path.Combine(directory,"host-terminal-fallback.json");
            WriteNew(target,new System.Web.Script.Serialization.JavaScriptSerializer{MaxJsonLength=262144,RecursionLimit=32}.Serialize(result));
        }
        // Accessible only to the compiled test assembly, never via host CLI.
        // Exercises the actual producer, listener terminal callback and Run's
        // finalization while leaving WasapiOutput unstarted (no endpoint access).
        internal static int RunShutdownFixture(string root,string directory,string pipeName,bool injectSecondary=false,Action blockedListener=null,string audioError=null)
        {
            if(!System.Reflection.Assembly.GetExecutingAssembly().GetName().Name.EndsWith(".Tests",StringComparison.Ordinal))throw new InvalidOperationException("Test assembly only");
            if(!Path.GetFullPath(directory).StartsWith(Path.GetFullPath(Path.GetTempPath()),StringComparison.OrdinalIgnoreCase))throw new ArgumentException("Disposable fixture directory required");
            if(injectSecondary)shutdownFixtureHook=delegate{throw new ObjectDisposedException("fixture-secondary","Deliberate secondary failure for first-error retention test");};
            if(audioError!=null)shutdownFixtureHook=delegate{output.Error=audioError;};
            if(blockedListener!=null){listenerFixtureHook=blockedListener;
#if GEOMETRY_LIVE
                geometryRelay=new RichAudio.GeometryLive.GeometryHostRelay(Send,delegate{return 0;},new RichAudio.GeometryLive.GeometryModel{Scale=1,Offset=new double[]{-6,0,1},Reference="shutdown-fixture"},pipeName+".Geometry");geometryRelay.Start();}
#else
                throw new NotSupportedException("Geometry callback fixture requires the geometry-enabled build");}
#endif
            return Run(root,"open-road","harmonic",1,5,.08f,-1,false,false,false,true,null,directory,95,.22,null,null,null,null,"",pipeName);
        }
        internal static void StopShutdownFixture(){if(listenerFixtureHook==null)throw new InvalidOperationException("Blocked callback fixture required");Control("stop");}
        internal static void ReleaseShutdownFixtureResources()
        {
            if(shutdownFixturePipe!=null&&!shutdownFixturePipe.StopAndWait(1000))throw new TimeoutException("Released fixture listener failed to exit");
#if GEOMETRY_LIVE
            if(geometryRelay!=null)geometryRelay.Dispose();
#endif
            listenerFixtureHook=null;
        }
    }
}
