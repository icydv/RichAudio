using System;using RichAudio.Beacon.Windows;
class TestGameplayFixtureCadence01 {
 static void Need(bool value,string reason){if(!value)throw new Exception(reason);}
 static unsafe void CheckCapture(){
  var ring=new PcmRing();
  var capture=new ClockedOutputCapture(960);
  var input=new float[1024];
  for(int i=0;i<input.Length;i++)input[i]=(i-512)/1024f;
  Need(ring.TryWrite(input,512),"write known stereo samples");
  var output=new float[1920];
  fixed(float* p=output)ring.FillCalibrated(p,960,1);
  capture.Append(output,960,0);
  Need(ring.UnderflowFrames==448&&capture.Frames==ring.ConsumedFrames,"capture includes missing-frame silence");
  bool discontinuity=false;try{capture.Append(output,0,1);}catch(System.IO.InvalidDataException){discontinuity=true;}
  Need(discontinuity,"refuse noncontiguous file clock");
  var file=new System.IO.MemoryStream();capture.Save(file);
  using(var reader=new System.IO.BinaryReader(new System.IO.MemoryStream(file.ToArray()))){
   reader.BaseStream.Position=12;
   while(reader.BaseStream.Position<reader.BaseStream.Length){
    var chunk=new string(reader.ReadChars(4));int size=reader.ReadInt32();
    if(chunk=="data"){
     Need(size==960*8,"capture payload extent");
     for(int i=0;i<1920;i++)Need(reader.ReadSingle()==(i<input.Length?input[i]:0),"sample bound to actual sink output");
     return;
    }
    reader.BaseStream.Position+=size+(size&1);
   }
  }
  throw new Exception("capture missing PCM");
 }
 static unsafe void Main(){var cadence=new GameplayFixtureCadence01(0,1000);Need(cadence.Due(1)==20,"20ms cadence");cadence.Begin(0,8);Need(cadence.Due(1)==20,"ordinary jitter retains phase");cadence.Begin(1,120);Need(cadence.Due(2)==140,"delayed thread must not request an instantaneous backlog");
  CheckCapture();
  var mapped=new ClockedOutputCapture(1920,true);var pcm=new float[1920];
  mapped.Append(pcm,960,0,0,512,100,107);
  mapped.Append(pcm,960,960,512,960,125,131);
  using(var map=new System.IO.MemoryStream()){
   mapped.SaveCallbacks(map);
   string csv=System.Text.Encoding.UTF8.GetString(map.ToArray()).Replace("\r","");
   Need(csv.Contains("0,0,960,512,100,107\n960,512,960,960,125,131\n"),"callback map keeps sink and producer intervals distinct after missing frames");
  }
  var latency=new GameplayFixtureLatency();latency.Admission(0,891);latency.Admission(512,937);
  using(var data=new System.IO.StringWriter()){
   latency.WriteAdmissions(data);
   Need(data.ToString().Replace("\r","").Contains("0,891\n1,937\n"),"captured producer admissions use the host callback clock");
  }
  var old=new PcmRing();var samples=new float[1024];for(int i=0;i<samples.Length;i++)samples[i]=.01f;for(int i=0;i<8;i++)Need(old.TryWrite(samples,512),"initial capacity");var output=new float[1920];fixed(float* p=output){for(int i=0;i<5;i++)old.FillCalibrated(p,960,1);}Need(old.UnderflowFrames==704,"legacy instantaneous five-chunk burst overdraws 4096 frames");
  var real=new PcmRing();for(int i=0;i<8;i++)real.TryWrite(samples,512);cadence=new GameplayFixtureCadence01(0,1000);long now=100;for(int i=0;i<5;i++){long due=cadence.Due(i);if(now<due)now=due;cadence.Begin(i,now);fixed(float* p=output)real.FillCalibrated(p,960,1);int credits=real.TakeCredits();for(int n=0;n<credits;n++)Need(real.TryWrite(samples,512),"producer uses only returned credits");}Need(real.UnderflowFrames==0,"healthy producer gets scheduled between callbacks");
  var stalled=new PcmRing();for(int i=0;i<8;i++)stalled.TryWrite(samples,512);fixed(float* p=output){for(int i=0;i<5;i++)stalled.FillCalibrated(p,960,1);}bool rejected=false;try{stalled.RequireContinuousProducer();}catch(InvalidOperationException){rejected=true;}Need(rejected&&stalled.UnderflowFrames==704,"genuine producer stall remains fatal");Console.WriteLine("PASS cadence/jitter/delayed callback/unchanged capacity/real starvation contracts");
 }
}
