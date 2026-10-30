// Owned current-user snapshot transport. No game or endpoint dependency.
using System;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.IO.Pipes;using System.Runtime.InteropServices;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;using System.Security.AccessControl;using System.Security.Principal;using System.Text;using System.Threading;
namespace RichAudio.Beacon.Transport {
 [DataContract] public sealed class GameplayVehicle {
  [DataMember(Name="id",IsRequired=true)]public string Id;
  [DataMember(Name="generation",IsRequired=true)]public int Generation;
  [DataMember(Name="observationTicks",IsRequired=true)]public long ObservationTicks;
  [DataMember(Name="model",IsRequired=true)]public uint Model;
  [DataMember(Name="context",IsRequired=true)]public string Context;
  [DataMember(Name="position",IsRequired=true)]public double[] Position;
  [DataMember(Name="velocity",IsRequired=true)]public double[] Velocity;
  [DataMember(Name="forward",IsRequired=true)]public double[] Forward;
  [DataMember(Name="up",IsRequired=true)]public double[] Up;
  [DataMember(Name="operatingPoint",IsRequired=true)]public double OperatingPoint;
  [DataMember(Name="running",IsRequired=true)]public bool Running;
  [DataMember(Name="valid",IsRequired=true)]public bool Valid;
 }
 [DataContract] public sealed class GameplayFrame {
  [DataMember(Name="version",IsRequired=true)]public int Version=1;
  [DataMember(Name="session",IsRequired=true)]public string Session;
  [DataMember(Name="listener",IsRequired=true)]public ListenerState Listener;
  [DataMember(Name="vehicles",IsRequired=true)]public GameplayVehicle[] Vehicles;
 }
 public static class GameplayWire {
  public const int MaximumBytes=32768;
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetNamedPipeClientProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe,out uint pid);
  [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetNamedPipeServerProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe,out uint pid);
  public static void Peer(PipeStream pipe,int expected,bool server){uint pid;bool ok=server?GetNamedPipeClientProcessId(pipe.SafePipeHandle,out pid):GetNamedPipeServerProcessId(pipe.SafePipeHandle,out pid);Protocol.Check(ok&&pid==(uint)expected,"owned gameplay peer PID");}
  public static PipeSecurity Security(){var sid=WindowsIdentity.GetCurrent().User;var s=new PipeSecurity();s.SetAccessRuleProtection(true,false);s.SetOwner(sid);s.AddAccessRule(new PipeAccessRule(sid,PipeAccessRights.FullControl,AccessControlType.Allow));return s;}
  public static void Validate(GameplayFrame f,string session){
   Protocol.Check(f!=null&&f.Version==1&&f.Session==session,"gameplay session");Protocol.Validate(f.Listener);Protocol.Check(f.Listener.Session==session&&f.Vehicles!=null&&f.Vehicles.Length<=8,"gameplay frame budget");
   var seen=new HashSet<string>();foreach(var v in f.Vehicles){Protocol.Check(v!=null&&v.Id!=null&&System.Text.RegularExpressions.Regex.IsMatch(v.Id,"\\A[\\w:-]{1,64}\\z")&&seen.Add(v.Id)&&v.Generation>0&&(v.Context=="player"||v.Context=="npc"),"vehicle identity/context");
    Protocol.Check(Protocol.Finite(v.OperatingPoint)&&v.OperatingPoint>=0&&v.OperatingPoint<=1,"observed operating ratio");
    Protocol.Check(v.ObservationTicks>=0&&Math.Abs(v.ObservationTicks-f.Listener.ObservationTicks)<=Stopwatch.Frequency/20,"source sampling clock");
    foreach(var a in new[]{v.Position,v.Velocity,v.Forward,v.Up}){Protocol.Check(a!=null&&a.Length==3,"vehicle vector");foreach(double x in a)Protocol.Check(Protocol.Finite(x)&&Math.Abs(x)<=100000,"vehicle vector bounds");}
    double speed=Norm(v.Velocity),dot=0;for(int i=0;i<3;i++)dot+=v.Forward[i]*v.Up[i];Protocol.Check(speed<=100&&Math.Abs(Norm(v.Forward)-1)<1e-4&&Math.Abs(Norm(v.Up)-1)<1e-4&&Math.Abs(dot)<1e-4,"vehicle basis/speed");
   }
  }
  static double Norm(double[] a){return Math.Sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);}
  public static byte[] Encode(GameplayFrame f,string session){Validate(f,session);using(var m=new MemoryStream()){new DataContractJsonSerializer(typeof(GameplayFrame)).WriteObject(m,f);Protocol.Check(m.Length<=MaximumBytes,"gameplay packet size");return m.ToArray();}}
  public static GameplayFrame Decode(byte[] b,string session){Protocol.Check(b!=null&&b.Length>0&&b.Length<=MaximumBytes,"gameplay packet size");new UTF8Encoding(false,true).GetString(b);using(var m=new MemoryStream(b)){var f=(GameplayFrame)new DataContractJsonSerializer(typeof(GameplayFrame)).ReadObject(m);Validate(f,session);return f;}}
  public static NamedPipeServerStream Server(string name){return new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,MaximumBytes,MaximumBytes,Security());}
  public static byte[] Read(PipeStream p){var h=ReadExact(p,4);int n=BitConverter.ToInt32(h,0);Protocol.Check(n>0&&n<=MaximumBytes,"gameplay frame length");return ReadExact(p,n);}
  static byte[] ReadExact(PipeStream p,int n){var b=new byte[n];int at=0;while(at<n){var op=p.BeginRead(b,at,n-at,null,null);using(var wait=op.AsyncWaitHandle){if(!wait.WaitOne(1000))throw new TimeoutException("gameplay transport stalled");int got=p.EndRead(op);if(got==0)throw new EndOfStreamException();at+=got;}}return b;}
  public static void Write(PipeStream p,byte[] b){var frame=new byte[b.Length+4];Buffer.BlockCopy(BitConverter.GetBytes(b.Length),0,frame,0,4);Buffer.BlockCopy(b,0,frame,4,b.Length);TransportStop.Write(p,frame);}
 }
 public sealed class GameplayPublisher:IDisposable {
  readonly object gate=new object();readonly AutoResetEvent wake=new AutoResetEvent(false);readonly string session;Thread thread;volatile bool stop;GameplayFrame latest;string endpoint;int expectedPid;NamedPipeClientStream pipe;
  public long Sent,Expired,Failures;public GameplayPublisher(string session){this.session=session;}
  public void Start(){thread=new Thread(Run){IsBackground=true,Name="RichAudio gameplay latest snapshot"};thread.Start();}
  public void Configure(string name,int pid){lock(gate){endpoint=name;expectedPid=pid;var p=pipe;pipe=null;if(p!=null)p.Dispose();}wake.Set();}
  public void Publish(GameplayFrame frame){Interlocked.Exchange(ref latest,frame);wake.Set();}
  void Run(){while(!stop){wake.WaitOne(50);if(stop)break;var f=Interlocked.Exchange(ref latest,null);if(f==null)continue;
   try{string name;int pid;lock(gate){name=endpoint;pid=expectedPid;}if(name==null||pid<=0)continue;
    if((Stopwatch.GetTimestamp()-f.Listener.ObservationTicks)*1000d/Stopwatch.Frequency>250){Expired++;continue;}
    NamedPipeClientStream p;lock(gate)p=pipe;if(p==null){p=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous);p.Connect(150);GameplayWire.Peer(p,pid,false);lock(gate){if(name!=endpoint){p.Dispose();continue;}pipe=p;}}
    var b=GameplayWire.Encode(f,session);if((Stopwatch.GetTimestamp()-f.Listener.ObservationTicks)*1000d/Stopwatch.Frequency>250){Expired++;continue;}
    GameplayWire.Write(p,b);TransportStop.Ack(p,TransportStop.Accepted);Sent++;
   }catch(ThreadAbortException){throw;}catch{Failures++;lock(gate){var p=pipe;pipe=null;if(p!=null)p.Dispose();}wake.WaitOne(200);}
  }}
  public void RequestStop(){stop=true;wake.Set();lock(gate){if(pipe!=null)pipe.Dispose();pipe=null;}}
  public void Dispose(){RequestStop();if(thread!=null&&!thread.Join(1500))throw new TimeoutException("gameplay publisher cleanup");wake.Dispose();}
 }
}
