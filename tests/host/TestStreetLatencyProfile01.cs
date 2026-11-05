// Actual immutable profile + production credit window + SPSC PCM ring, without
// a device, game executable, playback or private source material.
using System;using System.Collections.Generic;using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;using RichAudio.Beacon.Transport;
internal static class TestStreetLatencyProfile01 {
 static int checks;static void Need(bool yes,string reason){checks++;if(!yes)throw new Exception(reason);}
 static float Marker(long frame){return (frame%251-125)*.0005f;}
 static object Profile(GameplayLatencyProfile p){return new{id=p.Id,controlDelayMs=p.ControlDelayMilliseconds,startupBlocks=p.StartupBlocks,producerCreditBlocks=p.ProducerBlocks,ringCapacityBlocks=PcmRing.Slots};}
 static bool Selection(string profile,string demo,string continuity,params PlayableModel[] models){try{PlayableConfiguration.ValidateStreetLatencySelection01(new PlayableConfiguration{LatencyProfile=profile,DemoProfile=demo,ContinuityPolicy=continuity,Eligible=models});return true;}catch(System.IO.InvalidDataException){return false;}}
 public static unsafe int Main(){try{
  var street=GameplayLatencyProfile.Resolve("street-01");var original=GameplayLatencyProfile.Resolve("low-latency-01");var baseline=GameplayLatencyProfile.Resolve(null);Need(street.ControlDelayMilliseconds==original.ControlDelayMilliseconds&&street.StartupBlocks==original.StartupBlocks&&street.ProducerBlocks==original.ProducerBlocks,"exact existing selected timing policy");Need(baseline.ControlDelayMilliseconds==100&&baseline.ProducerBlocks==8,"ordinary absent selection unchanged");
  var player=new PlayableModel{Model=0xf9300cc5,Context="player"};var npc=new PlayableModel{Model=0xf9300cc5,Context="npc"};var other=new PlayableModel{Model=1,Context="player"};
  bool[] selections={Selection("street-01",null,null,player),Selection("street-01",null,"camera-source-01",player,npc),Selection("street-01","PLAYABLE-13",null,player),Selection("street-01",null,"baseline",player),Selection("street-01",null,null,other),Selection("street-01",null,null,npc),Selection("street-01",null,null,player,player),Selection("street-01",null,null,new PlayableModel[0])};
  for(int i=0;i<selections.Length;i++)Need(selections[i]==(i<2),"normal Bati-only manifest selection case "+i);
  var ring=new PcmRing(street.StartupBlocks);var window=new GameplayCreditWindow(street);var input=new float[1024];var output=new float[1024];long generated=0,consumed=0;
  Action produce=delegate{for(int i=0;i<512;i++){input[i*2]=Marker(generated+i);input[i*2+1]=-input[i*2];}Need(ring.TryWrite(input,512),"credit-limited admission");generated+=512;};
  Action consume=delegate{fixed(float* p=output)Need(ring.FillCalibrated(p,512,1)==512,"actual ring supplies complete block");for(int i=0;i<512;i++)Need(output[i*2]==Marker(consumed+i)&&output[i*2+1]==-Marker(consumed+i),"sample-exact PCM through physical native ring");consumed+=512;ring.RequireContinuousProducer();};
  for(int i=0;i<8;i++)produce();Need(ring.Count==8,"cold startup remains eight blocks");consume();Need(window.Return(ring.TakeCredits())==1&&window.Retired==0,"no retirement before prepared-source report");produce();Need(ring.Count==8,"cold reserve unchanged");
  window.SourcePrepared=true;for(int i=0;i<2;i++){consume();Need(window.Return(ring.TakeCredits())==0,"one of exactly two existing credits retired");}Need(window.Retired==2&&ring.Count==6,"fixed six-block steady window");
  for(int i=0;i<64;i++){consume();int credits=window.Return(ring.TakeCredits());Need(credits==1,"steady callback returns original credit");produce();Need(ring.Count==6,"no extra queue or adaptive reserve");}
  long exactFrames=consumed;while(ring.Count>0)consume();fixed(float* p=output)ring.FillCalibrated(p,512,1);bool fatal=false;try{ring.RequireContinuousProducer();}catch(InvalidOperationException){fatal=true;}Need(fatal&&ring.UnderflowFrames==512,"real starvation remains fatal and visible");
  Console.WriteLine(new JavaScriptSerializer().Serialize(new{passed=true,checks,street=Profile(street),sealedLowLatency01=Profile(original),baseline=Profile(baseline),manifestSelections=selections,physicalRingBlocks=PcmRing.Slots,steadyWindowBlocks=6,startupCreditsRetired=window.Retired,bitExactFrames=exactFrames,underflowFailureRetained=true,endpointOpened=false,gameLaunched=false,physicalLatencyMeasured=false}));return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
