using System;
namespace RichAudio.Beacon.Windows {
 // Matches the bound Node profile. Selection is explicit in the owner-verified
 // package manifest; absent/legacy selection remains the original100ms/8blocks.
 internal sealed class GameplayLatencyProfile {
  internal readonly string Id;internal readonly int ControlDelayMilliseconds,StartupBlocks,ProducerBlocks;
  GameplayLatencyProfile(string id,int delay,int startup,int blocks){Id=id;ControlDelayMilliseconds=delay;StartupBlocks=startup;ProducerBlocks=blocks;}
  internal static GameplayLatencyProfile Resolve(string id){
   if(id==null||id=="baseline")return new GameplayLatencyProfile("baseline",100,8,8);
   if(id=="low-latency-01")return new GameplayLatencyProfile(id,75,8,6);
   if(id=="street-01")return new GameplayLatencyProfile(id,75,8,6);
   throw new ArgumentException("Unknown immutable gameplay latency profile");
  }
 }
 // A one-way, fixed credit-window reduction on the host control worker. Cold
 // startup retains the original reserve until genuine playback is reported.
 // No timers, callback work, extra PCM queue, adaptive target or clock shift.
 internal sealed class GameplayCreditWindow {
  readonly int reduction;int retired;internal volatile bool SourcePrepared;
  internal GameplayCreditWindow(GameplayLatencyProfile p){reduction=p.StartupBlocks-p.ProducerBlocks;}
  internal int Return(int credits){if(credits<0||credits>PcmRing.Slots)throw new ArgumentOutOfRangeException("credits");if(SourcePrepared&&retired<reduction){int n=Math.Min(credits,reduction-retired);credits-=n;retired+=n;}return credits;}
  internal int Retired {get{return retired;}}
 }
}
