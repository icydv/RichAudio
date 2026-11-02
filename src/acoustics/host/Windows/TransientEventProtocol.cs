using System;using System.IO;
namespace RichAudio.Beacon.Windows {
 // Dedicated owned-child pipe, independent of continuous RA07 credits/PCM.
 public static class TransientEventProtocol {
  public const int Bytes=144;
  static uint U(byte[] b,int p){return (uint)(b[p]|b[p+1]<<8|b[p+2]<<16|b[p+3]<<24);}
  static long L(byte[] b,int p){return BitConverter.ToInt64(b,p);}
  public static PreparedTransientEvent Decode(byte[] b,uint expectedSequence) {
   if(b==null||b.Length!=Bytes||b[0]!=82||b[1]!=65||b[2]!=69||b[3]!=50||b[4]!=1||b[5]!=0||b[6]!=1||b[7]!=0||U(b,8)!=Bytes||U(b,12)!=expectedSequence||U(b,52)!=48000||L(b,96)!=-1||L(b,136)!=0)throw new InvalidDataException("Synthetic transient descriptor framing/session transport sequence");
   uint source=U(b,24),sourceGen=U(b,28),slot=U(b,32),kernelGen=U(b,36),scene=U(b,40),listener=U(b,44),priority=U(b,48),uncertainty=U(b,112),late=U(b,116);
   if(source>8||sourceGen>Int32.MaxValue||slot>7||kernelGen>Int32.MaxValue||scene>Int32.MaxValue||listener>Int32.MaxValue||priority>1||uncertainty>4800||late>2400||L(b,16)<1||L(b,104)<0)throw new InvalidDataException("Synthetic transient descriptor bounds");
   return new PreparedTransientEvent{EventId=L(b,16),SourceSequence=L(b,104),SourceId=(int)source,SourceGeneration=(int)sourceGen,KernelSlot=(int)slot,KernelGeneration=(int)kernelGen,SceneGeneration=(int)scene,ListenerGeneration=(int)listener,Priority=(int)priority,
    OccurrenceLowerQpc=L(b,56),OccurrenceUpperQpc=L(b,64),AcquisitionBeforeQpc=L(b,72),ObservationAfterQpc=L(b,80),Frequency=L(b,88),UncertaintyFrames=(int)uncertainty,MaximumLatenessFrames=(int)late,SessionLow=BitConverter.ToUInt64(b,120),SessionHigh=BitConverter.ToUInt64(b,128)};
  }
  public static bool ReadExact(Stream stream,byte[] data){int n=0;while(n<data.Length){int got=stream.Read(data,n,data.Length-n);if(got==0){if(n==0)return false;throw new EndOfStreamException("Truncated synthetic event descriptor");}n+=got;}return true;}
 }
}
