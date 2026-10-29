// Standalone owned Direct3D 11 compute device. No game or audio APIs.
// ABI slots follow the Windows SDK ID3D11Device/Context and DXGI interfaces.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
namespace RichAudio.AcousticGpu {
    internal static class HardwareAdapterPolicy {
        // DXGI documents that a primary Microsoft Basic Render Driver may have
        // Flags==0. The flag alone is therefore not proof of hardware compute.
        internal static bool IsEligible(Native.AdapterDesc desc) {
            if((desc.Flags&2)!=0)return false;
            if(desc.Vendor==0x1414&&desc.Device==0x008c)return false;
            string name=System.Text.RegularExpressions.Regex.Replace((desc.Description??"").TrimEnd('\0').Trim(),"\\s+"," ");
            if(name.Length==0)return false;
            foreach(string software in new[]{"Microsoft Basic Render Driver","Microsoft Basic Display Adapter","Microsoft WARP","Microsoft WARP Adapter",
                "Microsoft WARP Renderer","Microsoft Software Rasterizer","Microsoft Reference Rasterizer","WARP","Software Adapter"})
                if(name.Equals(software,StringComparison.OrdinalIgnoreCase))return false;
            return true;
        }
    }
    internal static class Native {
        [DllImport("dxgi.dll")] internal static extern int CreateDXGIFactory1(ref Guid iid,out IntPtr factory);
        [DllImport("d3d11.dll")] internal static extern int D3D11CreateDevice(IntPtr adapter,uint driver,IntPtr software,uint flags,uint[] levels,uint count,uint sdk,out IntPtr device,out uint level,out IntPtr context);
        [DllImport("d3dcompiler_47.dll",CallingConvention=CallingConvention.StdCall)] internal static extern int D3DCompile(byte[] source,UIntPtr length,string name,IntPtr defines,IntPtr include,string entry,string target,uint flags,uint effect,out IntPtr code,out IntPtr error);
        internal static T Method<T>(IntPtr obj,int slot) where T:class {return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj),slot*IntPtr.Size),typeof(T));}
        internal static void Check(int code,string operation){if(code<0)throw new COMException(operation,code);}
        internal static void Release(ref IntPtr p){if(p!=IntPtr.Zero){Marshal.Release(p);p=IntPtr.Zero;}}
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] internal struct AdapterDesc {
            [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)] public string Description;
            public uint Vendor,Device,Subsystem,Revision;public UIntPtr DedicatedVideo,DedicatedSystem,SharedSystem;public long Luid;public uint Flags;
        }
        [StructLayout(LayoutKind.Sequential)] internal struct BufferDesc {public uint Bytes,Usage,Bind,Cpu,Misc,Stride;}
        [StructLayout(LayoutKind.Sequential)] internal struct SrvDesc {public uint Format,Dimension,First,Count,Pad0,Pad1;}
        [StructLayout(LayoutKind.Sequential)] internal struct UavDesc {public uint Format,Dimension,First,Count,Flags;}
        [StructLayout(LayoutKind.Sequential)] internal struct QueryDesc {public uint Type,Misc;}
        [StructLayout(LayoutKind.Sequential)] internal struct Mapped {public IntPtr Data;public uint Row,Depth;}
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int EnumAdapter(IntPtr self,uint index,out IntPtr adapter);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int GetDesc(IntPtr self,out AdapterDesc desc);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int CreateBuffer(IntPtr self,ref BufferDesc desc,IntPtr initial,out IntPtr buffer);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int CreateSrv(IntPtr self,IntPtr buffer,ref SrvDesc desc,out IntPtr view);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int CreateUav(IntPtr self,IntPtr buffer,ref UavDesc desc,out IntPtr view);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int CreateShader(IntPtr self,IntPtr code,UIntPtr length,IntPtr linkage,out IntPtr shader);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int CreateQuery(IntPtr self,ref QueryDesc desc,out IntPtr query);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate IntPtr BlobPointer(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate UIntPtr BlobLength(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate void Update(IntPtr self,IntPtr resource,uint subresource,IntPtr box,IntPtr source,uint row,uint depth);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate void SetViews(IntPtr self,uint first,uint count,[In] IntPtr[] views);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate void SetUavs(IntPtr self,uint first,uint count,[In] IntPtr[] views,IntPtr counts);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate void SetShader(IntPtr self,IntPtr shader,IntPtr classes,uint count);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate void Dispatch(IntPtr self,uint x,uint y,uint z);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate void Copy(IntPtr self,IntPtr destination,IntPtr source);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate void QueryAction(IntPtr self,IntPtr query);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int GetData(IntPtr self,IntPtr query,IntPtr data,uint size,uint flags);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int Map(IntPtr self,IntPtr resource,uint subresource,uint type,uint flags,out Mapped mapped);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate void Unmap(IntPtr self,IntPtr resource,uint subresource);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate void Flush(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int VideoMemory(IntPtr self,uint node,uint group,IntPtr info);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] internal delegate int EnqueueEvent(IntPtr self,IntPtr handle);
    }
    internal sealed class Device:IDisposable {
        private static readonly Process Self=Process.GetCurrentProcess();
        internal const int Segments=4096,Surfaces=128;
        internal const long OwnedBytes=Segments*32+Surfaces*64+Segments*16*2+16;
        private IntPtr factory,adapter,device,dxgiDevice2,context,shader,segmentBuffer,surfaceBuffer,outputBuffer,staging,constant,segmentView,surfaceView,outputView;
        private readonly EventWaitHandle completed=new EventWaitHandle(false,EventResetMode.ManualReset);
        private IntPtr eventQuery,disjoint;private readonly IntPtr[] timestamps=new IntPtr[4];private readonly IntPtr scratch=Marshal.AllocHGlobal(64);
        private Native.Update update;private Native.SetViews setSrvs,setConstants;private Native.SetUavs setUavs;private Native.SetShader setShader;
        private Native.Dispatch dispatch;private Native.Copy copy;private Native.QueryAction begin,end;private Native.GetData getData;private Native.Map map;private Native.Unmap unmap;private Native.Flush flush;
        private Native.EnqueueEvent enqueueEvent;
        internal readonly Dictionary<string,object> Capability=new Dictionary<string,object>();
        private int dispatchCount;private object sampledVideoMemory;private long sampledWorkingSet;
        internal Device(){var watch=Stopwatch.StartNew();try{
            Guid factoryId=new Guid("770aae78-f26f-4dba-a829-253c83d1b387");Native.Check(Native.CreateDXGIFactory1(ref factoryId,out factory),"CreateDXGIFactory1");
            var enumerate=Native.Method<Native.EnumAdapter>(factory,12);Native.AdapterDesc best=new Native.AdapterDesc();bool selected=false;
            for(uint i=0;i<16;i++){IntPtr candidate;int hr=enumerate(factory,i,out candidate);if(hr<0)break;
                Native.AdapterDesc desc;try{Native.Check(Native.Method<Native.GetDesc>(candidate,10)(candidate,out desc),"GetDesc1");
                    if(!HardwareAdapterPolicy.IsEligible(desc))continue;
                    if(!selected||desc.DedicatedVideo.ToUInt64()>best.DedicatedVideo.ToUInt64()){
                        IntPtr d,c;uint level;int result=Native.D3D11CreateDevice(candidate,0,IntPtr.Zero,0,new uint[]{0xb000},1,7,out d,out level,out c);
                        if(result<0){Native.Release(ref d);Native.Release(ref c);continue;}
                        Native.Release(ref adapter);Native.Release(ref device);Native.Release(ref context);adapter=candidate;Marshal.AddRef(adapter);device=d;context=c;best=desc;selected=true;
                    }
                }finally{Native.Release(ref candidate);}}
            if(!selected)throw new NotSupportedException("No hardware Direct3D11 compute adapter");
            Guid dxgiId=new Guid("05008617-fbfd-4051-a790-144884b4f6a9");Native.Check(Marshal.QueryInterface(device,ref dxgiId,out dxgiDevice2),"Hardware completion event capability");
            enqueueEvent=Native.Method<Native.EnqueueEvent>(dxgiDevice2,16);
            Capability["schemaVersion"]=1;Capability["supported"]=true;Capability["api"]="Direct3D11-ComputeShader5";Capability["hardware"]=true;
            Capability["device"]=best.Description.TrimEnd('\0');Capability["vendorId"]=best.Vendor;Capability["deviceId"]=best.Device;Capability["adapterLuid"]=best.Luid.ToString("X16");
            Capability["dedicatedVideoBytes"]=best.DedicatedVideo.ToUInt64();Capability["ownedBufferBytes"]=OwnedBytes;
            Capability["usesHardwareRayTracing"]=false;Capability["rayTracingCapability"]="not-probed";Capability["rayTracingBackend"]="not-implemented";
            Capability["maximumSegments"]=Segments;Capability["maximumSurfaces"]=Surfaces;Capability["marginMetres"]=.005;Capability["completionWait"]="DXGI-device-event";
            IntPtr code=IntPtr.Zero,error=IntPtr.Zero;
            try{string text;using(var source=new StreamReader(Assembly.GetExecutingAssembly().GetManifestResourceStream("RichAudio.FiniteCull")))text=source.ReadToEnd();
                byte[] bytes=Encoding.UTF8.GetBytes(text);int hr=Native.D3DCompile(bytes,(UIntPtr)bytes.Length,"RichAudioFiniteCull",IntPtr.Zero,IntPtr.Zero,"main","cs_5_0",2048|32768,0,out code,out error);
                Native.Check(hr,"D3DCompile");IntPtr pointer=Native.Method<Native.BlobPointer>(code,3)(code);UIntPtr length=Native.Method<Native.BlobLength>(code,4)(code);
                Native.Check(Native.Method<Native.CreateShader>(device,18)(device,pointer,length,IntPtr.Zero,out shader),"CreateComputeShader");
            }finally{Native.Release(ref code);Native.Release(ref error);}
            segmentBuffer=Buffer(Segments*32,8,0,0x40,32);surfaceBuffer=Buffer(Surfaces*64,8,0,0x40,64);
            outputBuffer=Buffer(Segments*16,0x80,0,0x40,16);staging=Buffer(Segments*16,0,0x20000,0,0,3);constant=Buffer(16,4,0,0,0);
            var srv=new Native.SrvDesc{Dimension=1,Count=Segments};Native.Check(Native.Method<Native.CreateSrv>(device,7)(device,segmentBuffer,ref srv,out segmentView),"CreateSegmentSRV");
            srv.Count=Surfaces;Native.Check(Native.Method<Native.CreateSrv>(device,7)(device,surfaceBuffer,ref srv,out surfaceView),"CreateSurfaceSRV");
            var uav=new Native.UavDesc{Dimension=1,Count=Segments};Native.Check(Native.Method<Native.CreateUav>(device,8)(device,outputBuffer,ref uav,out outputView),"CreateOutputUAV");
            eventQuery=Query(0);disjoint=Query(3);for(int i=0;i<4;i++)timestamps[i]=Query(2);
            update=Native.Method<Native.Update>(context,48);setSrvs=Native.Method<Native.SetViews>(context,67);setUavs=Native.Method<Native.SetUavs>(context,68);setConstants=Native.Method<Native.SetViews>(context,71);
            setShader=Native.Method<Native.SetShader>(context,69);dispatch=Native.Method<Native.Dispatch>(context,41);copy=Native.Method<Native.Copy>(context,47);
            begin=Native.Method<Native.QueryAction>(context,27);end=Native.Method<Native.QueryAction>(context,28);getData=Native.Method<Native.GetData>(context,29);
            map=Native.Method<Native.Map>(context,14);unmap=Native.Method<Native.Unmap>(context,15);flush=Native.Method<Native.Flush>(context,111);
            setShader(context,shader,IntPtr.Zero,0);setSrvs(context,0,2,new[]{segmentView,surfaceView});setUavs(context,0,1,new[]{outputView},IntPtr.Zero);setConstants(context,0,1,new[]{constant});
            sampledVideoMemory=MemoryUsage();sampledWorkingSet=Self.WorkingSet64;
            Capability["initializationMs"]=watch.Elapsed.TotalMilliseconds;Capability["processVideoMemoryBytes"]=sampledVideoMemory;Capability["processWorkingSetBytes"]=sampledWorkingSet;Capability["helperCumulativeCpuMs"]=Self.TotalProcessorTime.TotalMilliseconds;
        }catch{Dispose();throw;}}
        private IntPtr Buffer(int bytes,uint bind,uint cpu,uint misc,uint stride,uint usage=0){var desc=new Native.BufferDesc{Bytes=(uint)bytes,Usage=usage,Bind=bind,Cpu=cpu,Misc=misc,Stride=stride};IntPtr buffer;
            Native.Check(Native.Method<Native.CreateBuffer>(device,3)(device,ref desc,IntPtr.Zero,out buffer),"CreateBuffer");return buffer;}
        private IntPtr Query(uint type){var desc=new Native.QueryDesc{Type=type};IntPtr query;Native.Check(Native.Method<Native.CreateQuery>(device,24)(device,ref desc,out query),"CreateQuery");return query;}
        private object MemoryUsage(){IntPtr infoAdapter=IntPtr.Zero;try{Guid id=new Guid("645967a4-1392-4310-a798-8053ce3e93fd");if(Marshal.QueryInterface(adapter,ref id,out infoAdapter)<0)return null;
            int hr=Native.Method<Native.VideoMemory>(infoAdapter,14)(infoAdapter,0,0,scratch);return hr<0?null:(object)(ulong)Marshal.ReadInt64(scratch,8);
        }finally{Native.Release(ref infoAdapter);}}
        private void Upload(IntPtr resource,byte[] bytes,int count){var handle=GCHandle.Alloc(bytes,GCHandleType.Pinned);try{
            // Buffers have fixed maximum capacity; a null box would read beyond
            // a shorter pinned request payload. Buffer box coordinates are bytes.
            IntPtr box=IntPtr.Zero;if(resource!=constant){for(int i=0;i<3;i++)Marshal.WriteInt32(scratch,i*4,0);Marshal.WriteInt32(scratch,12,count);Marshal.WriteInt32(scratch,16,1);Marshal.WriteInt32(scratch,20,1);box=scratch;}
            update(context,resource,0,box,handle.AddrOfPinnedObject(),0,0);
        }finally{handle.Free();}}
        internal byte[] Execute(byte[] segments,byte[] surfaces,int segmentCount,int surfaceCount,double deadline,out Dictionary<string,object> metrics){
            var wall=Stopwatch.StartNew();TimeSpan cpuStart=Self.TotalProcessorTime;
            var constants=new byte[16];System.Buffer.BlockCopy(BitConverter.GetBytes(surfaceCount),0,constants,0,4);System.Buffer.BlockCopy(BitConverter.GetBytes(segmentCount),0,constants,4,4);System.Buffer.BlockCopy(BitConverter.GetBytes(.005f),0,constants,8,4);
            begin(context,disjoint);end(context,timestamps[0]);double uploadAt=wall.Elapsed.TotalMilliseconds;
            Upload(segmentBuffer,segments,segmentCount*32);Upload(surfaceBuffer,surfaces,surfaceCount*64);Upload(constant,constants,16);double uploadCpu=wall.Elapsed.TotalMilliseconds-uploadAt;
            end(context,timestamps[1]);dispatch(context,(uint)segmentCount,1,1);end(context,timestamps[2]);copy(context,staging,outputBuffer);end(context,timestamps[3]);end(context,disjoint);end(context,eventQuery);
            // DXGI flushes and signals only after prior commands complete. This
            // bounded wait is in the owned helper, never the audio callback.
            completed.Reset();Native.Check(enqueueEvent(dxgiDevice2,completed.SafeWaitHandle.DangerousGetHandle()),"Enqueue GPU completion event");
            double submit=wall.Elapsed.TotalMilliseconds;
            if(!completed.WaitOne(Math.Max(1,(int)Math.Ceiling(deadline-wall.Elapsed.TotalMilliseconds))))throw new TimeoutException("GPU completion deadline");
            int code=getData(context,eventQuery,scratch,4,1);if(code==1)throw new TimeoutException("GPU completion proof unavailable");
            Native.Check(code,"GPU completion");double waited=wall.Elapsed.TotalMilliseconds-submit;
            if(wall.Elapsed.TotalMilliseconds>deadline)throw new TimeoutException("GPU completion deadline");
            Native.Mapped mapped;double readAt=wall.Elapsed.TotalMilliseconds;Native.Check(map(context,staging,0,1,0x100000,out mapped),"ReadbackMap");
            byte[] output=new byte[segmentCount*16];try{Marshal.Copy(mapped.Data,output,0,output.Length);}finally{unmap(context,staging,0);}
            double readMs=wall.Elapsed.TotalMilliseconds-readAt;bool validTiming=getData(context,disjoint,scratch,16,1)==0;
            ulong frequency=validTiming?(ulong)Marshal.ReadInt64(scratch):0;bool nonDisjoint=validTiming&&frequency>0&&Marshal.ReadInt32(scratch,8)==0;
            var ticks=new ulong[4];if(nonDisjoint&&frequency>0)for(int i=0;i<4;i++){if(getData(context,timestamps[i],scratch,8,1)!=0){nonDisjoint=false;break;}ticks[i]=(ulong)Marshal.ReadInt64(scratch);}
            double total=wall.Elapsed.TotalMilliseconds;
            if((dispatchCount++&31)==0){Self.Refresh();sampledVideoMemory=MemoryUsage();sampledWorkingSet=Self.WorkingSet64;}
            metrics=new Dictionary<string,object>{{"device",Capability["device"]},{"hardware",true},{"completedDispatch",true},{"segments",segmentCount},{"surfacePairs",segmentCount*surfaceCount},
                {"submitMs",submit},{"uploadCpuMs",uploadCpu},{"completionWaitMs",waited},{"readbackMs",readMs},{"totalMs",total},
                {"helperCpuMs",(Self.TotalProcessorTime-cpuStart).TotalMilliseconds},{"helperCumulativeCpuMs",Self.TotalProcessorTime.TotalMilliseconds},{"gpuTimingValid",nonDisjoint},
                {"gpuUploadMs",nonDisjoint?(object)((ticks[1]-ticks[0])*1000.0/frequency):null},{"gpuExecutionMs",nonDisjoint?(object)((ticks[2]-ticks[1])*1000.0/frequency):null},
                {"gpuCopyMs",nonDisjoint?(object)((ticks[3]-ticks[2])*1000.0/frequency):null},{"ownedBufferBytes",OwnedBytes},{"processVideoMemoryBytes",sampledVideoMemory},
                {"processWorkingSetBytes",sampledWorkingSet},{"memorySampleStride",32},{"usesHardwareRayTracing",false}};
            if(total>deadline)throw new TimeoutException("GPU readback deadline");return output;
        }
        public void Dispose(){foreach(var p in timestamps)if(p!=IntPtr.Zero)Marshal.Release(p);Native.Release(ref eventQuery);Native.Release(ref disjoint);Native.Release(ref segmentView);Native.Release(ref surfaceView);Native.Release(ref outputView);
            Native.Release(ref constant);Native.Release(ref segmentBuffer);Native.Release(ref surfaceBuffer);Native.Release(ref outputBuffer);Native.Release(ref staging);Native.Release(ref shader);Native.Release(ref context);Native.Release(ref dxgiDevice2);Native.Release(ref device);Native.Release(ref adapter);Native.Release(ref factory);
            if(scratch!=IntPtr.Zero)Marshal.FreeHGlobal(scratch);completed.Dispose();}
    }
    internal static class Program {
        private const uint InputMagic=0x32384752,OutputMagic=0x32384f52;
        private static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=8192,RecursionLimit=12};
        private static byte[] Read(Stream stream,int count,bool allowEnd=false,byte[] reuse=null){var bytes=reuse??new byte[count];int at=0;while(at<count){int n=stream.Read(bytes,at,count-at);if(n==0){if(at==0&&allowEnd)return null;throw new EndOfStreamException();}at+=n;}return bytes;}
        private static void U32(byte[] bytes,int at,uint value){System.Buffer.BlockCopy(BitConverter.GetBytes(value),0,bytes,at,4);}
        private static void Initial(Stream stdout,Dictionary<string,object> value){byte[] json=Encoding.UTF8.GetBytes(Json.Serialize(value));stdout.Write(BitConverter.GetBytes(json.Length),0,4);stdout.Write(json,0,json.Length);stdout.Flush();}
        private static void Response(Stream stream,uint id,uint generation,uint status,byte[] masks,Dictionary<string,object> metrics){byte[] json=Encoding.UTF8.GetBytes(Json.Serialize(metrics));if(json.Length>8192)throw new InvalidDataException("metric size");
            var header=new byte[32];U32(header,0,OutputMagic);U32(header,4,1);U32(header,8,id);U32(header,12,generation);U32(header,16,status);U32(header,20,(uint)masks.Length);U32(header,24,(uint)json.Length);
            stream.Write(header,0,32);stream.Write(json,0,json.Length);stream.Write(masks,0,masks.Length);stream.Flush();}
        private static void Validate(byte[] bytes,int stride,bool surface,int count){for(int at=0;at<count;at+=stride){for(int k=0;k<stride;k+=4){float v=BitConverter.ToSingle(bytes,at+k);if(float.IsNaN(v)||float.IsInfinity(v)||Math.Abs(v)>512)throw new InvalidDataException("local finite bounds");}
            if(surface){double norm=0;for(int k=0;k<3;k++){float n=BitConverter.ToSingle(bytes,at+16+k*4);norm+=n*n;if(BitConverter.ToSingle(bytes,at+32+k*4)>BitConverter.ToSingle(bytes,at+48+k*4))throw new InvalidDataException("surface bounds");}if(norm<.99||norm>1.01)throw new InvalidDataException("surface normal");}}}
        public static int Main(string[] args){Device device=null;var capability=new Dictionary<string,object>();try{try{device=new Device();capability=device.Capability;}catch(Exception e){capability=new Dictionary<string,object>{{"schemaVersion",1},{"supported",false},{"hardware",false},{"api","Direct3D11-ComputeShader5"},
                {"reason",e is NotSupportedException?"No supported hardware compute adapter; software renderers excluded":e.GetType().Name+":"+e.HResult.ToString("X8")}};}
            if(args.Length>0&&args[0]=="--probe"){Console.WriteLine(Json.Serialize(capability));return capability.ContainsKey("supported")&&(bool)capability["supported"]?0:2;}
            var input=Console.OpenStandardInput();var output=Console.OpenStandardOutput();Initial(output,capability);if(device==null)return 0;uint previous=0;var life=Stopwatch.StartNew();
            var segmentInput=new byte[Device.Segments*32];var surfaceInput=new byte[Device.Surfaces*64];
            for(int request=0;request<20000&&life.Elapsed.TotalMinutes<20;request++){
                byte[] header=Read(input,32,true);if(header==null)break;uint id=BitConverter.ToUInt32(header,8),generation=BitConverter.ToUInt32(header,12);
                int n=checked((int)BitConverter.ToUInt32(header,16)),s=checked((int)BitConverter.ToUInt32(header,20));float deadline=BitConverter.ToSingle(header,24);
                if(BitConverter.ToUInt32(header,0)!=InputMagic||BitConverter.ToUInt32(header,4)!=1||id<=previous||n<1||n>Device.Segments||s<1||s>Device.Surfaces||!(!float.IsNaN(deadline)&&deadline>=1&&deadline<=100)||BitConverter.ToUInt32(header,28)!=0)throw new InvalidDataException("request bounds/order");previous=id;
                byte[] segments=Read(input,n*32,false,segmentInput),surfaces=Read(input,s*64,false,surfaceInput);Validate(segments,32,false,n*32);Validate(surfaces,64,true,s*64);
                try{Dictionary<string,object> metrics;byte[] masks=device.Execute(segments,surfaces,n,s,deadline,out metrics);Response(output,id,generation,0,masks,metrics);}
                catch(TimeoutException){Response(output,id,generation,1,new byte[0],new Dictionary<string,object>{{"reason","GPU deadline exceeded"},{"completedDispatch",false}});return 0;}
                catch(Exception e){Response(output,id,generation,3,new byte[0],new Dictionary<string,object>{{"reason",e.GetType().Name+":"+e.HResult.ToString("X8")},{"completedDispatch",false}});return 1;}
            }return 0;
        }catch(Exception e){Console.Error.WriteLine("Acoustic GPU helper: "+e.GetType().Name+":"+e.HResult.ToString("X8"));return 1;}finally{if(device!=null)device.Dispose();}}
    }
}
