using System;using RichAudio.Beacon.Windows;
class TestGameplayFixtureCadence01 {
 static void Need(bool value,string reason){if(!value)throw new Exception(reason);}
 static unsafe void Main(){var cadence=new GameplayFixtureCadence01(0,1000);Need(cadence.Due(1)==20,"20ms cadence");cadence.Begin(0,8);Need(cadence.Due(1)==20,"ordinary jitter retains phase");cadence.Begin(1,120);Need(cadence.Due(2)==140,"delayed thread must not request an instantaneous backlog");
  var old=new PcmRing();var samples=new float[1024];for(int i=0;i<samples.Length;i++)samples[i]=.01f;for(int i=0;i<8;i++)Need(old.TryWrite(samples,512),"initial capacity");var output=new float[1920];fixed(float* p=output){for(int i=0;i<5;i++)old.FillCalibrated(p,960,1);}Need(old.UnderflowFrames==704,"legacy instantaneous five-chunk burst overdraws 4096 frames");
  var real=new PcmRing();for(int i=0;i<8;i++)real.TryWrite(samples,512);cadence=new GameplayFixtureCadence01(0,1000);long now=100;for(int i=0;i<5;i++){long due=cadence.Due(i);if(now<due)now=due;cadence.Begin(i,now);fixed(float* p=output)real.FillCalibrated(p,960,1);int credits=real.TakeCredits();for(int n=0;n<credits;n++)Need(real.TryWrite(samples,512),"producer uses only returned credits");}Need(real.UnderflowFrames==0,"healthy producer gets scheduled between callbacks");
  var stalled=new PcmRing();for(int i=0;i<8;i++)stalled.TryWrite(samples,512);fixed(float* p=output){for(int i=0;i<5;i++)stalled.FillCalibrated(p,960,1);}bool rejected=false;try{stalled.RequireContinuousProducer();}catch(InvalidOperationException){rejected=true;}Need(rejected&&stalled.UnderflowFrames==704,"genuine producer stall remains fatal");Console.WriteLine("PASS cadence/jitter/delayed callback/unchanged capacity/real starvation contracts");
 }
}
