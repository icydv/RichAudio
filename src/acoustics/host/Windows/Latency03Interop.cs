using System;
using System.Runtime.InteropServices;

namespace RichAudio.Beacon.Windows {
 // Flattened IAudioClient + IAudioClient2 + IAudioClient3 public SDK vtable.
 // Declaring it does not activate a device. Only the isolated runtime factory
 // queries this interface on its already selected client after authorization.
 [ComImport,Guid("7ED4EE07-8E67-4CD4-8C1A-2B7A5987AD42"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 internal interface IAudioClient3Latency03 {
  [PreserveSig]int Initialize(int shareMode,uint flags,long bufferDuration,long periodicity,IntPtr format,IntPtr session);
  [PreserveSig]int GetBufferSize(out uint frames);
  [PreserveSig]int GetStreamLatency(out long duration);
  [PreserveSig]int GetCurrentPadding(out uint frames);
  [PreserveSig]int IsFormatSupported(int shareMode,IntPtr format,out IntPtr closest);
  [PreserveSig]int GetMixFormat(out IntPtr format);
  [PreserveSig]int GetDevicePeriod(out long defaultPeriod,out long minimumPeriod);
  [PreserveSig]int Start();[PreserveSig]int Stop();[PreserveSig]int Reset();
  [PreserveSig]int SetEventHandle(IntPtr handle);
  [PreserveSig]int GetService(ref Guid iid,[MarshalAs(UnmanagedType.IUnknown)]out object service);
  [PreserveSig]int IsOffloadCapable(int category,[MarshalAs(UnmanagedType.Bool)]out bool capable);
  [PreserveSig]int SetClientProperties(IntPtr properties);
  [PreserveSig]int GetBufferSizeLimits(IntPtr format,[MarshalAs(UnmanagedType.Bool)]bool eventDriven,out long minimumDuration,out long maximumDuration);
  [PreserveSig]int GetSharedModeEnginePeriod(IntPtr format,out uint defaultFrames,out uint fundamentalFrames,out uint minimumFrames,out uint maximumFrames);
  [PreserveSig]int GetCurrentSharedModeEnginePeriod(out IntPtr format,out uint currentFrames);
  [PreserveSig]int InitializeSharedAudioStream(uint flags,uint periodFrames,IntPtr format,IntPtr session);
 }
}
