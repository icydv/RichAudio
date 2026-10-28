// Original managed declarations of public Windows Core Audio ABI signatures.
using System;
using System.Runtime.InteropServices;

namespace RichAudio.Beacon.Windows
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumeratorClass { }
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int flow, uint state, out IMMDeviceCollection collection);
        [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr callback);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr callback);
    }
    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int Item(uint index, out IMMDevice device);
    }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr activation, [MarshalAs(UnmanagedType.IUnknown)] out object obj);
        [PreserveSig] int OpenPropertyStore(uint access, out IPropertyStore store);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out uint state);
    }
    [StructLayout(LayoutKind.Sequential)]
    internal struct PropertyKey { internal Guid Format; internal uint Id; }
    [StructLayout(LayoutKind.Explicit, Size = 24)]
    internal struct PropVariant
    {
        [FieldOffset(0)] internal ushort Type;
        [FieldOffset(8)] internal IntPtr Pointer;
    }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPropertyStore
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
        [PreserveSig] int Commit();
    }
    [ComImport, Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint flags, long bufferDuration, long periodicity, IntPtr format, IntPtr session);
        [PreserveSig] int GetBufferSize(out uint frames);
        [PreserveSig] int GetStreamLatency(out long duration);
        [PreserveSig] int GetCurrentPadding(out uint frames);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr handle);
        [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }
    [ComImport, Guid("F294ACFC-3146-4483-A7BF-ADDCA7C260E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioRenderClient
    {
        [PreserveSig] int GetBuffer(uint frames, out IntPtr buffer);
        [PreserveSig] int ReleaseBuffer(uint frames, uint flags);
    }
    [ComImport, Guid("CD63314F-3FBA-4A1B-812C-EF96358728E7"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioClock
    {
        [PreserveSig] int GetFrequency(out ulong frequency);
        [PreserveSig] int GetPosition(out ulong position, out ulong qpcPosition);
        [PreserveSig] int GetCharacteristics(out uint characteristics);
    }
    [ComImport, Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        [PreserveSig] int ReleaseBuffer(uint frames);
        [PreserveSig] int GetNextPacketSize(out uint frames);
    }
    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    internal struct WaveFormat
    {
        internal ushort Tag, Channels;
        internal uint SamplesPerSecond, AverageBytesPerSecond;
        internal ushort BlockAlign, BitsPerSample, ExtraSize;
        internal static WaveFormat FloatStereo48k()
        {
            return new WaveFormat { Tag = 3, Channels = 2, SamplesPerSecond = 48000, AverageBytesPerSecond = 384000, BlockAlign = 8, BitsPerSample = 32, ExtraSize = 0 };
        }
    }
    internal static class Native
    {
        [DllImport("avrt.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern IntPtr AvSetMmThreadCharacteristicsW(string task,ref uint index);
        [DllImport("avrt.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool AvRevertMmThreadCharacteristics(IntPtr task);
        [DllImport("ole32.dll")] internal static extern int PropVariantClear(ref PropVariant value);
        internal static void Check(int hr) { if (hr < 0) Marshal.ThrowExceptionForHR(hr); }
        internal static void Release(object obj) { if (obj != null && Marshal.IsComObject(obj)) Marshal.ReleaseComObject(obj); }
        internal static string Name(IMMDevice device)
        {
            IPropertyStore store = null; PropVariant value = new PropVariant();
            try
            {
                Check(device.OpenPropertyStore(0, out store));
                PropertyKey key = new PropertyKey { Format = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), Id = 14 };
                Check(store.GetValue(ref key, out value));
                return value.Type == 31 ? Marshal.PtrToStringUni(value.Pointer) : "Unnamed output";
            }
            finally { PropVariantClear(ref value); Release(store); }
        }
        internal static IMMDevice Device(IMMDeviceEnumerator enumerator, int index)
        {
            IMMDevice device;
            if (index < 0) { Check(enumerator.GetDefaultAudioEndpoint(0, 1, out device)); return device; }
            IMMDeviceCollection collection = null;
            try
            {
                Check(enumerator.EnumAudioEndpoints(0, 1, out collection)); uint count; Check(collection.GetCount(out count));
                if (index >= count) throw new ArgumentOutOfRangeException("device", "Output index unavailable");
                Check(collection.Item((uint)index, out device)); return device;
            }
            finally { Release(collection); }
        }
        internal static IAudioClient Client(IMMDevice device)
        {
            object value; Guid iid = typeof(IAudioClient).GUID; Check(device.Activate(ref iid, 23, IntPtr.Zero, out value)); return (IAudioClient)value;
        }
    }
}
