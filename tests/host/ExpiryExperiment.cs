using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
public sealed class DomainSender:MarshalByRefObject {
 public string Run(string pipe,string mode){
  using(var p=new StatePublisher(pipe,1,true)){
   int delayed=0;Action hold=delegate{if(Interlocked.Increment(ref delayed)==1)Thread.Sleep(mode=="late"?900:350);};
   if(mode=="before"||mode=="late")p.BeforeEncodeTest=hold;if(mode=="after")p.AfterEncodeTest=hold;
   p.Start();var watch=Stopwatch.StartNew();long n=0;
   while(watch.ElapsedMilliseconds<1100&&!p.Finished){p.Publish(Protocol.Synthetic(new string('a',32),n++,0));while(watch.ElapsedMilliseconds<n*50&&!p.Finished)Thread.Sleep(0);}
   p.RequestStop();watch.Restart();while(!p.Finished&&watch.ElapsedMilliseconds<1500)Thread.Sleep(1);
   if(!p.Finished)throw new TimeoutException("sender lifetime");
#if EXPIRY_BASELINE
   return new JavaScriptSerializer().Serialize(new{sent=p.Sent,attempts=p.Attempts,replaced=p.Replaced,diagnostic=p.Diagnostic});
#else
   return new JavaScriptSerializer().Serialize(new{sent=p.Sent,attempts=p.Attempts,replaced=p.Replaced,beforeDelayMs=p.BeforeDelayMs,afterDelayMs=p.AfterDelayMs,expiredBefore=p.ExpiredBeforeEncoding,expiredAfter=p.ExpiredAfterEncoding,firstExpired=p.FirstExpiredUnsent,firstPublished=p.FirstPublishedSequence,firstTransmitted=p.FirstTransmittedSequence,diagnostic=p.Diagnostic});
#endif
  }
 }
 public override object InitializeLifetimeService(){return null;}
}
internal static class ExpiryExperiment {
 static int Main(string[] a){
  if(a[0]=="console"){Console.WriteLine("READY synthetic-console; no endpoint");Console.Out.Flush();if(a.Length>1)File.WriteAllText(a[1],"emitted");Thread.Sleep(1200);return 0;}
  if(a[0]=="receive"){
   using(var s=new StatePipeServer(a[1],null,true)){s.Start();File.WriteAllText(a[3]+".ready","ready");var w=Stopwatch.StartNew();while(!s.Finished&&w.ElapsedMilliseconds<5000)Thread.Sleep(1);if(!s.Finished)throw new TimeoutException("receiver lifetime");File.WriteAllText(a[3],new JavaScriptSerializer().Serialize(new{accepted=s.Accepted,rejected=s.Rejected,connections=s.Connections,diagnostic=s.Diagnostic}));}return 0;
  }
  string result;
  if(a[2]=="domain"){var d=AppDomain.CreateDomain("original-synthetic-domain");try{var sender=(DomainSender)d.CreateInstanceAndUnwrap(typeof(DomainSender).Assembly.FullName,typeof(DomainSender).FullName);result=sender.Run(a[1],"none");}finally{AppDomain.Unload(d);}}
  else result=new DomainSender().Run(a[1],a[2]);
  File.WriteAllText(a[3],result);return 0;
 }
}
