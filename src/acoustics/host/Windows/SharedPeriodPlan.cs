using System;
namespace RichAudio.Beacon.Windows {
 // Pure plan validation. No COM/device query, initialization or fallback change.
 public static class SharedPeriodPlan {
  public static bool IsLegal(uint requested,uint minimum,uint maximum,uint fundamental,uint defaultPeriod) {
   return fundamental>0&&minimum>0&&minimum<=maximum&&
    defaultPeriod>=minimum&&defaultPeriod<=maximum&&defaultPeriod%fundamental==0&&requested>=minimum&&requested<=maximum&&requested%fundamental==0;
  }
  public static double CapacityMilliseconds(uint frames,uint sampleRate){if(frames==0||sampleRate==0)throw new ArgumentException("Explicit queried format required");return frames*1000d/sampleRate;}
 }
}
