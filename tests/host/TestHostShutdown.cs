using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.IO.Pipes;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;
using RichAudio.Beacon.Transport;

namespace RichAudio.Beacon.Tests
{
    public static class TestHostShutdown
    {
        public static int Main(string[] args)
        {
            if(args.Length==2)return Integration(args[0],args[1]);
            using(var child=new Process {StartInfo=new ProcessStartInfo {FileName="node.exe",Arguments="-e \"process.stdin.resume();process.stdin.on('end',()=>process.exit(0));\"",UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true}})
            {
                child.Start();
                using(var writer=new StreamWriter(child.StandardInput.BaseStream,new UTF8Encoding(false,true))){writer.WriteLine("fixture");writer.Flush();}
                if(!child.WaitForExit(3000)){child.Kill();throw new Exception("Fixture child failed to exit");}
                try{child.StandardInput.Close();throw new Exception("Legacy ownership bug did not reproduce");}
                catch(ObjectDisposedException error){Console.WriteLine("REPRODUCED legacy HostProgram shutdown: "+error);}
            }
            return 0;
        }
        private static void Require(bool test,string message){if(!test)throw new Exception(message);}
        private static int Integration(string root,string mode)
        {
            if(mode=="blocked-callback")return BlockedCallbackIntegration(root);
            string directory=Path.Combine(Path.GetTempPath(),"RichAudio-host-shutdown-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);
            string pipe="RichAudio.Shutdown."+Guid.NewGuid().ToString("N");Exception senderError=null;
            var sender=new Thread(delegate(){try{
                using(var client=new NamedPipeClientStream(".",pipe,PipeDirection.InOut,PipeOptions.Asynchronous)){
                    client.Connect(3000);
                    if(mode=="disconnect")return;
                    if(mode=="controlled"||mode=="audio-stop-fault"){TransportStop.Write(client,TransportStop.Frame());TransportStop.Ack(client,TransportStop.Stopped);return;}
                    var state=Protocol.Synthetic(new string('a',32),0,0);state.ObservationTicks=Stopwatch.GetTimestamp()+Stopwatch.Frequency;
                    TransportStop.Write(client,Protocol.Frame(state));
                    try{TransportStop.ReadAck(client);}catch(InvalidDataException){}catch(IOException){}
                }
            }catch(Exception error){senderError=error;}});sender.IsBackground=true;
            try{
                if(mode=="evidence-failure")Directory.CreateDirectory(Path.Combine(directory,"renderer-diagnostics.txt"));
                sender.Start();int result=HostProgram.RunShutdownFixture(root,directory,pipe,mode=="secondary",null,
                    mode=="audio-stop-fault"||mode=="audio-after-listener-fault"?"InvalidOperationException: fixture producer starvation during output stop":null);
                Require(sender.Join(3000),"sender terminated");Require(senderError==null,"actual pipe sender failure: "+senderError);
                var summary=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(directory,"host-result.json")));
                Require((bool)summary["deviceFreeFixture"],"endpoint was not started");Require((bool)summary["ownedThreadsJoined"],"owned Process stream threads joined");
                var transport=(Dictionary<string,object>)summary["transport"];Require((bool)transport["outputMuted"]&&(bool)transport["hostStopped"]&&(bool)transport["shutdownCompleted"],"muted and transport callback joined");
                string primary=summary["producerError"] as string;
                if(mode=="controlled"){Require(result==0&&primary==null,"controlled stop remains successful: "+primary);}
                else if(mode=="audio-stop-fault"){
                    Require(result==1&&primary!=null&&primary.Contains("fixture producer starvation"),"late audio fault promoted into truthful terminal result");
                    Require(((Dictionary<string,object>)summary["primaryFailure"])["stage"].Equals("audio-output"),"late audio failure stage retained");
                    Require(((Dictionary<string,object>)summary["audio"])["error"].Equals(primary),"summary audio fault agrees with primary failure");
                }
                else {Require(result==1&&primary!=null&&primary.StartsWith("Listener terminal:"),"original listener failure retained: "+primary);Require(primary.Contains(mode=="disconnect"?"connection/clean-eof":"freshness/invalid-age"),"specific first listener failure");}
                var secondary=(System.Collections.IList)summary["secondaryFailures"];
                if(mode=="secondary")Require(secondary.Count==1&&((Dictionary<string,object>)secondary[0])["stage"].Equals("fixture-secondary"),"secondary shutdown failure separately retained");
                else if(mode=="audio-after-listener-fault")Require(secondary.Count==1&&((Dictionary<string,object>)secondary[0])["stage"].Equals("audio-output"),"late audio fault retained separately without replacing listener failure");
                else if(mode=="evidence-failure")Require(secondary.Count==1&&((Dictionary<string,object>)secondary[0])["stage"].Equals("diagnostic-evidence"),"diagnostic write failure does not prevent terminal result");
                else Require(secondary.Count==0,"no unexpected secondary shutdown failures");
                if(mode!="evidence-failure")Require(File.Exists(Path.Combine(directory,"renderer-diagnostics.txt")),"diagnostic summary retained");
                Console.WriteLine("PASS actual host shutdown "+mode+": original listener result, joined streams, terminal summary; no endpoint.");return 0;
            }finally{Require(Path.GetDirectoryName(directory)==Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar),"fixture cleanup boundary");Directory.Delete(directory,true);}
        }
        private static int BlockedCallbackIntegration(string root)
        {
            string directory=Path.Combine(Path.GetTempPath(),"RichAudio-host-shutdown-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);
            string pipe="RichAudio.Shutdown."+Guid.NewGuid().ToString("N");Exception senderError=null,stopperError=null;
            using(var entered=new ManualResetEvent(false))using(var release=new ManualResetEvent(false)){
                var sender=new Thread(delegate(){try{using(var client=new NamedPipeClientStream(".",pipe,PipeDirection.InOut,PipeOptions.Asynchronous)){
                    client.Connect(3000);TransportStop.Write(client,Protocol.Frame(Protocol.Synthetic(new string('b',32),0,0)));
                    release.WaitOne();
                }}catch(Exception error){senderError=error;}}){IsBackground=true};
                var stopper=new Thread(delegate(){try{Require(entered.WaitOne(3000),"actual listener callback entered");HostProgram.StopShutdownFixture();}catch(Exception error){stopperError=error;}}){IsBackground=true};
                try{
                    sender.Start();stopper.Start();
                    int result=HostProgram.RunShutdownFixture(root,directory,pipe,false,delegate{entered.Set();release.WaitOne();});
                    Require(stopper.Join(3000)&&stopperError==null,"fixture stop thread completed: "+stopperError);
                    var summary=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(directory,"host-result.json")));
                    var transport=(Dictionary<string,object>)summary["transport"];
                    Require(result==1&&(bool)summary["deviceFreeFixture"]&&(bool)summary["ownedThreadsJoined"],"actual host stopped its producer without endpoint access");
                    Require((bool)transport["outputMuted"]&&(bool)transport["hostStopped"]&&!(bool)transport["shutdownCompleted"],"blocked listener is muted and explicitly not joined");
                    Require((bool)summary["geometryRelayDisposalDeferred"],"in-flight listener retains its actual geometry callback target");
                    Require(((string)summary["producerError"]).StartsWith("TimeoutException: Listener callback thread"),"join timeout remains primary failure");
                    var secondary=(System.Collections.IList)summary["secondaryFailures"];
                    bool deferred=false;foreach(Dictionary<string,object> failure in secondary){string stage=(string)failure["stage"];
                        Require(stage=="geometry-shutdown-deferred"||stage=="producer-stop","unexpected secondary failure: "+new JavaScriptSerializer().Serialize(failure));if(stage=="geometry-shutdown-deferred")deferred=true;}
                    Require(deferred,"deferred disposal is separately reported");
                    object relay=typeof(HostProgram).GetField("geometryRelay",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Static).GetValue(null);
                    Require(!(bool)relay.GetType().GetField("stopped",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance).GetValue(relay),"actual relay has not been disposed while its callback is in flight");
                    release.Set();Require(sender.Join(3000)&&senderError==null,"actual sender exited: "+senderError);
                    HostProgram.ReleaseShutdownFixtureResources();
                    Require((bool)relay.GetType().GetField("stopped",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance).GetValue(relay),"fixture disposes retained relay only after released callback joined");
                    Console.WriteLine("PASS actual host shutdown blocked-callback: timeout retained, actual geometry relay kept alive until listener exits, terminal summary; no endpoint.");return 0;
                }finally{
                    release.Set();sender.Join(3000);stopper.Join(3000);HostProgram.ReleaseShutdownFixtureResources();
                    Require(Path.GetDirectoryName(directory)==Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar),"fixture cleanup boundary");Directory.Delete(directory,true);
                }
            }
        }
    }
}
