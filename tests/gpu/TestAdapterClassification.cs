// Actual native-helper classifier, without constructing a D3D device. These
// synthetic adapter descriptors are policy regressions, not hardware evidence.
using System;
using System.Runtime.InteropServices;
namespace RichAudio.AcousticGpu {
    internal static class TestAdapterClassification {
        private static int checks;
        private static void Check(bool expected,string name,uint vendor,uint device,uint flags,ulong dedicated){
            var desc=new Native.AdapterDesc{Description=name,Vendor=vendor,Device=device,Flags=flags,DedicatedVideo=new UIntPtr(dedicated)};
            bool actual=HardwareAdapterPolicy.IsEligible(desc);if(actual!=expected)throw new Exception("Adapter classifier: "+name);checks++;
        }
        public static int Main(){try{
            if(Marshal.SizeOf(typeof(Native.AdapterDesc))!=312)throw new Exception("DXGI_ADAPTER_DESC1 x64 ABI size");checks++;
            foreach(var field in new[]{new{ Name="Vendor",Offset=256 },new{ Name="Device",Offset=260 },new{ Name="DedicatedVideo",Offset=272 },new{ Name="Luid",Offset=296 },new{ Name="Flags",Offset=304 }}){
                if(Marshal.OffsetOf(typeof(Native.AdapterDesc),field.Name).ToInt32()!=field.Offset)throw new Exception("DXGI_ADAPTER_DESC1 x64 ABI offset: "+field.Name);checks++;
            }
            Check(false,"Microsoft Basic Render Driver",0x1414,0x008c,2,0);
            Check(false,"Microsoft Basic Render Driver",0x1414,0x008c,0,0);
            Check(false,"  microsoft  basic render driver  ",0,0,0,0);
            Check(false,"Localized or unknown renderer name",0x1414,0x008c,0,0);
            Check(false,"Microsoft WARP",0,0,0,0);
            Check(false,"WARP",0,0,0,0);
            Check(false,"Microsoft Basic Display Adapter",0,0,0,0);
            Check(false,"Microsoft Reference Rasterizer",0,0,0,0);
            Check(false,"NVIDIA GeForce RTX 2080 SUPER",0x10de,0x1e81,2,8UL*1024*1024*1024);
            Check(false,"",0x10de,0x1e81,0,8UL*1024*1024*1024);
            Check(true,"NVIDIA GeForce RTX 2080 SUPER",0x10de,0x1e81,0,8UL*1024*1024*1024);
            Check(true,"AMD Radeon RX 7800 XT",0x1002,0x747e,0,16UL*1024*1024*1024);
            Check(true,"Intel Iris Xe Graphics",0x8086,0x9a49,0,0);
            Check(true,"Intel Iris Xe Graphics",0x8086,0x9a49,1,0);
            Check(true,"Microsoft GPU-P hardware adapter",0x1414,0x008e,0,0);
            Console.WriteLine("PASS: "+checks+" actual adapter-classifier assertions; no GPU device constructed");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
    }
}
