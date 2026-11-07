using System.Diagnostics;
using Rage;
using Rage.Attributes;
using RichAudio.Preparation;
using RichAudio.Beacon.Transport;
namespace RichAudio.Beacon.Rph {
 internal static class InstalledWorldWarmup {
  static readonly WorldWarmupSupervisor worker=new WorldWarmupSupervisor();
  internal static string StartedUtc {get{return worker.StartedUtc;}}
  internal static bool OfferInitial01(string session,ListenerState listener){return listener!=null&&listener.Valid&&!listener.Paused&&worker.OfferInitialObservation01(session,listener.Sequence,listener.Generation,listener.ObservationTicks,listener.ClockFrequency,listener.Position);}
  internal static void Start(){string executable=Process.GetCurrentProcess().MainModule.FileName;worker.Start(WorldWarmupSupervisor.ConfigurationForGameExecutable(executable),executable);}
  internal static void Stop(){worker.Stop();}
  [ConsoleCommand(Name="RichAudioWorldWarmupStatus",Description="Startup world preparation status; does not start audio or native replacement")]
  public static void Status(){Game.Console.Print("RichAudio world preparation: "+worker.State+"; initial position: "+worker.InitialObservationState+". Read preparation.json for coverage; audio replacement remains disabled.");}
 }
}
