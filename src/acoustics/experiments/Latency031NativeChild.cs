using System;
using RichAudio.Beacon.Transport;
namespace RichAudio.Experiments {
 internal sealed class Latency031NativeChild : ILatency031OwnedChild {
  readonly OwnedProcessLifetime lifetime;
  internal Latency031NativeChild(OwnedProcessLifetime value){if(value==null)throw new ArgumentNullException("value");lifetime=value;}
  public int Id {get{return lifetime.Id;}}public long StartUtcTicks {get{return lifetime.StartUtcTicks;}}
  public bool WaitForExit(int milliseconds){return lifetime.WaitForExit(milliseconds);}
  public Latency031ExitObservation CaptureExit(){var status=lifetime.CaptureExitStatus();return new Latency031ExitObservation{Exited=status.State==OwnedProcessState.Exited,Available=status.State==OwnedProcessState.Exited&&status.ExitCode.HasValue,ExitCode=status.ExitCode,NativeError=status.NativeError,WaitResult=status.WaitResult};}
  public Latency031CloseObservation CloseLifetime(){return Convert(lifetime.CloseLifetime());}
  internal static Latency031CloseObservation Convert(OwnedProcessCloseStatus value){return new Latency031CloseObservation{Attempted=value.Attempted,Succeeded=value.Succeeded,NativeError=value.NativeError};}
 }
}
