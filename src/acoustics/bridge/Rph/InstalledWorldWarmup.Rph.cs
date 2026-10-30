using System.Diagnostics;
using Rage;
using Rage.Attributes;
using RichAudio.Preparation;
namespace RichAudio.Beacon.Rph {
 internal static class InstalledWorldWarmup {
  static readonly WorldWarmupSupervisor worker=new WorldWarmupSupervisor();
  internal static void Start(){string executable=Process.GetCurrentProcess().MainModule.FileName;worker.Start(WorldWarmupSupervisor.ConfigurationForGameExecutable(executable),executable);}
  internal static void Stop(){worker.Stop();}
  [ConsoleCommand(Name="RichAudioWorldWarmupStatus",Description="Startup world preparation status; does not start audio or native replacement")]
  public static void Status(){Game.Console.Print("RichAudio world preparation: "+worker.State+". Read preparation.json for coverage; audio replacement remains disabled.");}
 }
}
