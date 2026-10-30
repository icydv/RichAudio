// Original validation/conversion helper. No playback, resampling or normalization.
using System;
using System.IO;
using System.Security.Cryptography;
public sealed class StockPcmMetrics {
 public int Frames {get;set;} public int SampleRate {get;set;} public int Channels {get;set;}
 public int BitsPerSample {get;set;} public int PeakInt16 {get;set;} public int FullScaleSamples {get;set;}
 public long NonzeroSamples {get;set;} public double Peak {get;set;} public double Rms {get;set;}
 public double Dc {get;set;} public double MaximumAdjacentStep {get;set;} public double DirectWrapJump {get;set;}
 public double RoundTripMaximumInt16Error {get;set;} public string FloatSha256 {get;set;}
 public string Pcm16Sha256 {get;set;}
}
public static class StockPcmDecode {
 static void Check(bool ok,string message){if(!ok)throw new InvalidDataException(message);}
 public static string Hash(byte[] bytes){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","");}
 public static StockPcmMetrics Convert(byte[] wav,int declaredRate,int declaredFrames,string output){
  Check(wav!=null&&wav.Length>=44,"PCM WAV header missing");
  Check(System.Text.Encoding.ASCII.GetString(wav,0,4)=="RIFF"&&System.Text.Encoding.ASCII.GetString(wav,8,4)=="WAVE"&&
        System.Text.Encoding.ASCII.GetString(wav,12,4)=="fmt "&&System.Text.Encoding.ASCII.GetString(wav,36,4)=="data","Expected canonical decoder WAV chunks");
  Check(BitConverter.ToInt32(wav,4)==wav.Length-8&&BitConverter.ToInt32(wav,16)==16,"WAV sizes differ");
  int channels=BitConverter.ToUInt16(wav,22),rate=BitConverter.ToInt32(wav,24),bits=BitConverter.ToUInt16(wav,34),n=BitConverter.ToInt32(wav,40)/2;
  Check(BitConverter.ToUInt16(wav,20)==1&&channels==1&&bits==16,"Only verified mono Int16 decoded input supported");
  Check(rate==declaredRate&&rate>=8000&&rate<=192000&&n==declaredFrames&&n>0&&n<=rate*60,"Declared PCM frame/rate differs");
  Check(wav.Length==44+n*2&&BitConverter.ToInt32(wav,28)==rate*2&&BitConverter.ToUInt16(wav,32)==2,"WAV data/alignment differs");
  byte[] pcm=new byte[n*2],floats=new byte[n*4];Buffer.BlockCopy(wav,44,pcm,0,pcm.Length);
  double squares=0,sum=0,maxStep=0,roundtrip=0;int peak=0,full=0;long nonzero=0;float previous=0,first=0,last=0;
  for(int i=0;i<n;i++){
   short raw=BitConverter.ToInt16(pcm,i*2);float value=raw/32768.0f;
   if(i==0)first=value;else maxStep=Math.Max(maxStep,Math.Abs(value-previous));previous=value;last=value;
   byte[] bytes=BitConverter.GetBytes(value);Buffer.BlockCopy(bytes,0,floats,i*4,4);
   peak=Math.Max(peak,Math.Abs((int)raw));if(raw==short.MinValue||raw==short.MaxValue)full++;if(raw!=0)nonzero++;
   squares+=(double)value*value;sum+=value;roundtrip=Math.Max(roundtrip,Math.Abs((double)value*32768-raw));
  }
  Check(nonzero>0&&roundtrip==0,"Silent or lossy Int16-to-float conversion");
  using(var file=new FileStream(output,FileMode.CreateNew,FileAccess.Write,FileShare.Read))file.Write(floats,0,floats.Length);
  return new StockPcmMetrics{Frames=n,SampleRate=rate,Channels=channels,BitsPerSample=bits,PeakInt16=peak,FullScaleSamples=full,
   NonzeroSamples=nonzero,Peak=peak/32768.0,Rms=Math.Sqrt(squares/n),Dc=sum/n,MaximumAdjacentStep=maxStep,DirectWrapJump=Math.Abs(first-last),
   RoundTripMaximumInt16Error=roundtrip,FloatSha256=Hash(floats),Pcm16Sha256=Hash(pcm)};
 }
}
