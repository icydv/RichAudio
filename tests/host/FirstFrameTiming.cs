using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
internal static class FirstFrameTiming {
 static void Wait(Func<bool> done,int ms){var t=Stopwatch.StartNew();while(!done()&&t.ElapsedMilliseconds<ms)Thread.Sleep(5);if(!done())throw new TimeoutException("bounded harness wait");}
 static int Main(string[] a){
  if(a.Length!=4)return 2;
  bool receiver=a[0]=="receive",warm=a[2]=="warm";double warmMs=0,callbackMs=0;long callbackBytes=0;
  if(warm){var t=Stopwatch.StartNew();var s=Protocol.Synthetic(new string('a',32),0,0);var b=Protocol.Frame(s);Protocol.Decode(b.Length>4?Slice(b):b,b.Length-4);warmMs=t.Elapsed.TotalMilliseconds;}
  object record;
  if(receiver){using(var server=new StatePipeServer(a[1],delegate(ListenerState s,double age){var t=Stopwatch.StartNew();string json=Protocol.EncodeJson(s);if(callbackBytes==0){callbackBytes=json.Length;callbackMs=t.Elapsed.TotalMilliseconds;}},true)){
   server.Start();File.WriteAllText(a[3]+".ready","ready");Wait(()=>server.Finished,6000);
   record=new {role="receiver",warm=warm,warmMs=warmMs,accepted=server.Accepted,rejected=server.Rejected,connections=server.Connections,diagnostic=server.Diagnostic,callbackMs=callbackMs,callbackBytes=callbackBytes};
  }}else{using(var sender=new StatePublisher(a[1],1,true)){
   sender.Start();var t=Stopwatch.StartNew();int n=0;
   while(t.ElapsedMilliseconds<600&&!sender.Finished){sender.Publish(Protocol.Synthetic(new string('a',32),n++,0));Thread.Sleep(50);}
   sender.RequestStop();Wait(()=>sender.Finished,2500);
   record=new {role="sender",warm=warm,warmMs=warmMs,sent=sender.Sent,attempts=sender.Attempts,diagnostic=sender.Diagnostic};
  }}
  File.WriteAllText(a[3],new JavaScriptSerializer().Serialize(record));return 0;
 }
 static byte[] Slice(byte[] b){var r=new byte[b.Length-4];Buffer.BlockCopy(b,4,r,0,r.Length);return r;}
}
