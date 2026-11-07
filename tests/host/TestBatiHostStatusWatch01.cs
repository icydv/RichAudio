using System;using System.IO;using System.Threading;using System.Diagnostics;using RichAudio.Beacon.Windows;
class TestBatiHostStatusWatch01 {
 static volatile bool done;
 static void Need(bool value){if(!value)throw new Exception("status lifetime contract");}
 static void Main(string[]args){var utc=new DateTime(2026,1,1,0,0,0,DateTimeKind.Utc);var w=new BatiHostStatusWatch01();
  Need(!w.Expired(9999,0,1000));Need(w.Expired(10001,0,1000));
  w.Observe(true,utc.AddSeconds(10),utc.AddSeconds(10),10000,1000);Need(!w.Expired(10001,0,1000));
  w.Observe(true,DateTime.FromFileTimeUtc(0),utc.AddSeconds(11),11000,1000);Need(!w.Expired(11000,0,1000));
  w.Observe(false,DateTime.MinValue,utc.AddSeconds(12),12000,1000);Need(!w.Expired(12000,0,1000));
  w.Observe(true,utc.AddSeconds(10),utc.AddSeconds(14),14000,1000);Need(w.Expired(15000,0,1000));
  w.Observe(true,utc.AddSeconds(16),utc.AddSeconds(16),16000,1000);Need(!w.Expired(16000,0,1000));Need(w.Expired(21000,0,1000));
  w.Observe(true,utc.AddSeconds(99),utc.AddSeconds(22),22000,1000);Need(w.Expired(22000,0,1000));
  Console.WriteLine("PASS 10 status-watch contracts: sentinel/missing/unchanged/future cannot extend the original five-second publication lifetime");
  if(args.Length==1){string p=Path.Combine(args[0],"atomic-status-control.json");File.WriteAllText(p,"original");long started=Stopwatch.GetTimestamp()-Stopwatch.Frequency*11;w=new BatiHostStatusWatch01();w.Observe(true,File.GetLastWriteTimeUtc(p),DateTime.UtcNow,Stopwatch.GetTimestamp(),Stopwatch.Frequency);int invalid=0,probes=0;
   var writer=new Thread(delegate(){while(!done){File.WriteAllText(p+".pending","original publication");File.Replace(p+".pending",p,null);}});writer.Start();try{var clock=Stopwatch.StartNew();while(clock.Elapsed.TotalSeconds<2){bool exists=File.Exists(p);DateTime stamp=exists?File.GetLastWriteTimeUtc(p):DateTime.MinValue,now=DateTime.UtcNow;long qpc=Stopwatch.GetTimestamp();if(!exists||now-stamp>TimeSpan.FromSeconds(5))invalid++;probes++;w.Observe(exists,stamp,now,qpc,Stopwatch.Frequency);Need(!w.Expired(qpc,started,Stopwatch.Frequency));}}finally{done=true;Need(writer.Join(2000));}
   Console.WriteLine("PASS atomic publication race: probes="+probes+" legacyInvalidProbes="+invalid+" correctedFalseTimeouts=0");
  }
 }
}
