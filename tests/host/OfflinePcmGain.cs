// Device-free fixture: only PcmRing.cs and BCL are linked. No Windows host/audio APIs.
using System;
using System.Globalization;
using System.IO;
using RichAudio.Beacon.Windows;
internal static class OfflinePcmGain {
 public static unsafe int Main(string[] args){
  try{
   if(args.Length!=3)throw new ArgumentException("input-float32 output-float32 gain");
   float gain=float.Parse(args[2],CultureInfo.InvariantCulture);
   if(float.IsNaN(gain)||float.IsInfinity(gain)||gain<0||gain>.25f)throw new ArgumentException("Gain bounds");
   long bytes=new FileInfo(args[0]).Length;
   if(bytes<8||bytes>48000L*10*8||bytes%8!=0)throw new ArgumentException("PCM size bounds");
   var ring=new PcmRing();var input=new float[1024];var output=new float[1024];
   using(var reader=new BinaryReader(File.OpenRead(args[0])))
   using(var writer=new BinaryWriter(new FileStream(args[1],FileMode.CreateNew,FileAccess.Write))){
    while(reader.BaseStream.Position<bytes){
     int frames=(int)Math.Min(512,(bytes-reader.BaseStream.Position)/8);
     for(int i=0;i<frames*2;i++)input[i]=reader.ReadSingle();
     if(!ring.TryWrite(input,frames))throw new InvalidOperationException("Unexpected queue full");
     fixed(float* p=output)if(ring.Fill(p,frames,gain)!=frames)throw new InvalidOperationException("Missing frame");
     for(int i=0;i<frames*2;i++)writer.Write(output[i]);
    }
   }
   if(ring.UnderflowFrames!=0||ring.Count!=0)throw new InvalidOperationException("Ring continuity");
   Console.WriteLine("PASS actual PcmRing gain; frames="+ring.ConsumedFrames+"; no endpoint linked");return 0;
  }catch(Exception ex){Console.Error.WriteLine(ex.GetType().Name+": "+ex.Message);return 1;}
 }
}
