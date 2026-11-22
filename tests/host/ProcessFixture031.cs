using System;using System.Diagnostics;using System.IO;using System.Threading;
internal static class ProcessFixture031 {
 static int Main(string[] args){
  if(args.Length==3&&args[0]=="exit"){uint code=UInt32.Parse(args[1]);int delay=Int32.Parse(args[2]);if(delay<0||delay>5000)return 91;Thread.Sleep(delay);return unchecked((int)code);}
  if(args.Length==2&&args[0]=="descendant"){
   var p=Process.Start(new ProcessStartInfo{FileName=Process.GetCurrentProcess().MainModule.FileName,Arguments="exit 0 5000",UseShellExecute=false,CreateNoWindow=true});
   File.WriteAllText(args[1],p.Id+"\n"+p.StartTime.ToUniversalTime().Ticks+"\n");
   Thread.Sleep(5000);p.Dispose();return 0;
  }
  return 92;
 }
}
