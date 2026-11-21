#if STREET_TRACKED_DIAGNOSTIC_01
// Passive diagnostic ABI/comparison, deliberately absent from ordinary builds.
using System;using System.Diagnostics;using System.IO;using System.Runtime.InteropServices;
namespace RichAudio.StreetTracked01 {
 internal enum FailureStage01:uint {None,NetworkGame,NetworkSession,PauseMenu,Loading,PlayerSwitch,PlayerId,PlayerPlaying,PlayerPed,PedVehicle,EntityExists,EntityIsVehicle,EntityDead,EntityModel,Address,EngineRunning,Driver,Ratio,Clock,Limit,CallerStopped}
 [StructLayout(LayoutKind.Sequential,Pack=8)]internal struct Description01 {internal uint Size,Version,Pid,Fixture;internal long Frequency,Now,Instance;}
 [StructLayout(LayoutKind.Sequential,Pack=8)]internal struct Request01 {internal uint Size,Version;internal ulong Session0,Session1,Address;internal uint MaximumRecords,MaximumSeconds;}
 [StructLayout(LayoutKind.Sequential,Pack=8)]internal struct Identity01 {internal long Before,After;internal ulong Address;internal int Handle,Driver;internal uint Model,Running;}
 [StructLayout(LayoutKind.Sequential,Pack=8)]internal struct Failure01 {internal long Before,After;internal ulong Native,Address;internal uint Stage,RawBits;internal int Handle;internal uint Returned;}
 [StructLayout(LayoutKind.Sequential,Pack=8)]internal struct Record01 {internal uint Size,Version;internal ulong Session0,Session1,Sequence;internal Identity01 Pre,Post;internal long TargetBefore,TargetAfter,ReadNow;internal uint RawBits,Status,Reason,Phase;internal Failure01 Failure;}
 internal sealed class Peer01 {
  internal long Before,After;internal uint Value,Index,Model,RawRatioBits;internal byte Counter;internal ulong Address;internal bool Running,RiderAttached,IdentityComplete,RunningObserved,RatioObserved,RiderObserved;internal double RawRatio;
  internal bool Same(Peer01 x){return x!=null&&Value==x.Value&&Index==x.Index&&Counter==x.Counter&&Address==x.Address&&Model==x.Model;}
 }
 internal sealed class Comparer01 {
  readonly Peer01 original;readonly ulong session0,session1;readonly long frequency;ulong sequence;long lastAfter;int nativeHandle;
  internal Comparer01(Peer01 peer,ulong a,ulong b,long clock){original=peer;session0=a;session1=b;frequency=clock;Need(peer!=null&&peer.Address!=0&&peer.Model==0xF9300CC5&&clock==Stopwatch.Frequency,"diagnostic-original-peer/clock");}
  static void Need(bool yes,string why){if(!yes)throw new InvalidDataException(why);}
  internal object Compare(Peer01 before,Peer01 after,Record01 row,long now){
   Need(original.Same(before)&&original.Same(after),"diagnostic-RPH-pool-lifetime-changed");
   Need(before.IdentityComplete&&before.RunningObserved&&before.RatioObserved&&before.RiderObserved&&after.IdentityComplete&&after.RunningObserved&&after.RatioObserved&&after.RiderObserved,"diagnostic-RPH-incomplete-getter-witness");
   Need(row.Size==200&&row.Version==2&&row.Session0==session0&&row.Session1==session1&&row.Sequence>sequence,"diagnostic-session/sequence");
   Need(row.Status==1&&row.Phase==3&&row.Reason==0,"diagnostic-native-not-active/good");
   Need(row.Pre.Model==original.Model&&row.Post.Model==original.Model&&row.Pre.Address==original.Address&&row.Post.Address==original.Address&&row.Pre.Handle==row.Post.Handle&&row.Pre.Handle!=0,"diagnostic-independent-address/model");
   Need(nativeHandle==0||row.Pre.Handle==nativeHandle,"diagnostic-retained-native-handle-changed");
   Need(row.Pre.Running<=1&&row.Post.Running<=1,"diagnostic-running-raw");
   Need(before.Before>=0&&before.After>=before.Before&&after.Before>=before.After&&after.After>=after.Before&&row.Pre.Before>=0&&row.Pre.After>=row.Pre.Before&&row.TargetBefore>=row.Pre.After&&row.TargetAfter>=row.TargetBefore&&row.Post.Before>=row.TargetAfter&&row.Post.After>=row.Post.Before&&row.ReadNow>=row.Post.After&&now>=row.ReadNow,"diagnostic-original-clock-order");
   Need((decimal)now-row.Pre.Before<=frequency/4m&&(decimal)now-before.Before<=frequency/4m&&(decimal)now-after.Before<=frequency/4m&&row.TargetBefore>=lastAfter,"diagnostic-original-evidence-stale");
   Need(Math.Abs((decimal)before.Before-row.TargetBefore)<=frequency/20m&&Math.Abs((decimal)after.After-row.TargetAfter)<=frequency/20m,"diagnostic-independent-peer-skew");
   sequence=row.Sequence;lastAfter=row.TargetAfter;nativeHandle=row.Pre.Handle;float raw=BitConverter.ToSingle(BitConverter.GetBytes(row.RawBits),0);
   return new {sequence=row.Sequence,nativeBefore=row.TargetBefore,nativeAfter=row.TargetAfter,rawBits=row.RawBits,rawValue=Single.IsNaN(raw)||Single.IsInfinity(raw)?(object)raw.ToString(System.Globalization.CultureInfo.InvariantCulture):raw,
    rawFinite=!Single.IsNaN(raw)&&!Single.IsInfinity(raw),rawWithinRatioContract=!Single.IsNaN(raw)&&raw>=0&&raw<=1,
    rphRawBefore=Double.IsNaN(before.RawRatio)||Double.IsInfinity(before.RawRatio)?(object)before.RawRatio.ToString(System.Globalization.CultureInfo.InvariantCulture):before.RawRatio,rphRawAfter=Double.IsNaN(after.RawRatio)||Double.IsInfinity(after.RawRatio)?(object)after.RawRatio.ToString(System.Globalization.CultureInfo.InvariantCulture):after.RawRatio,rphRunningBefore=before.Running,rphRunningAfter=after.Running,
    nativeRunningBefore=row.Pre.Running,nativeRunningAfter=row.Post.Running,riderAttachedBefore=before.RiderAttached,riderAttachedAfter=after.RiderAttached,
    nativeDriverBefore=row.Pre.Driver,nativeDriverAfter=row.Post.Driver,sourceAddressMatched=true,sourcePoolMatched=true,
    clockFrequency=frequency,observedAt=now,acceptedForAudio=false,physicalRpmEstablished=false};
  }
 }
 internal sealed class NativeModule01:IDisposable {
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate uint DescribeFn(out Description01 d,uint size);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate uint BeginFn(ref Request01 r,uint size);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate uint ReadFn(out Record01 r,uint size);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate void StopFn();
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate uint ClosedFn();
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr GetModuleHandle(string name);
  [DllImport("kernel32.dll",CharSet=CharSet.Ansi)]static extern IntPtr GetProcAddress(IntPtr module,string name);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern uint GetModuleFileName(IntPtr module,System.Text.StringBuilder name,int count);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool GetModuleHandleEx(uint flags,IntPtr address,out IntPtr module);
  [DllImport("kernel32.dll")]static extern bool FreeLibrary(IntPtr module);
  readonly object gate=new object();IntPtr ownedModule;bool disposed,processLifetimePinned;
  readonly DescribeFn describe;readonly BeginFn begin;readonly ReadFn read;readonly StopFn stop;readonly ClosedFn closed;internal readonly Description01 Description;
  static T Function<T>(IntPtr module,string name)where T:class {var p=GetProcAddress(module,name);if(p==IntPtr.Zero)throw new InvalidDataException("diagnostic-export-missing");return Marshal.GetDelegateForFunctionPointer(p,typeof(T))as T;}
  internal NativeModule01(string path,string expectedSha,bool fixture=false){
   if(Marshal.SizeOf(typeof(Description01))!=40||Marshal.SizeOf(typeof(Request01))!=40||Marshal.SizeOf(typeof(Identity01))!=40||Marshal.SizeOf(typeof(Failure01))!=48||Marshal.SizeOf(typeof(Record01))!=200)throw new InvalidDataException("diagnostic-ABI-layout");
   // Attach ONLY. This never loads a dormant/absent module into GTA.
   var module=GetModuleHandle(Path.GetFileName(path));if(module==IntPtr.Zero)throw new InvalidDataException("diagnostic-module-not-already-loaded");
   if(!GetModuleHandleEx(4,module,out ownedModule)||ownedModule!=module)throw new InvalidDataException("diagnostic-module-pin");
   try{
   var actual=new System.Text.StringBuilder(32768);if(GetModuleFileName(module,actual,actual.Capacity)==0||!String.Equals(Path.GetFullPath(path),Path.GetFullPath(actual.ToString()),StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("diagnostic-module-path");
   using(var f=File.OpenRead(path))using(var sha=System.Security.Cryptography.SHA256.Create())if(BitConverter.ToString(sha.ComputeHash(f)).Replace("-","").ToLowerInvariant()!=expectedSha)throw new InvalidDataException("diagnostic-module-sha");
   describe=Function<DescribeFn>(module,"StreetDescribe01");begin=Function<BeginFn>(module,"StreetBegin01");read=Function<ReadFn>(module,"StreetRead01");stop=Function<StopFn>(module,"StreetStop01");closed=Function<ClosedFn>(module,"StreetClosed01");
   long before=Stopwatch.GetTimestamp();Description01 d;if(describe(out d,40)!=0)throw new InvalidDataException("diagnostic-description");long after=Stopwatch.GetTimestamp();
   if(d.Size!=40||d.Version!=2||d.Pid!=Process.GetCurrentProcess().Id||d.Fixture!=(fixture?1u:0u)||d.Frequency!=Stopwatch.Frequency||d.Instance<=0||d.Instance>d.Now||d.Now<before||d.Now>after||after-before>Stopwatch.Frequency/250)throw new InvalidDataException("diagnostic-independent-clock/instance");Description=d;
   }catch{if(ownedModule!=IntPtr.Zero){FreeLibrary(ownedModule);ownedModule=IntPtr.Zero;}throw;}
  }
  internal void Begin(ulong a,ulong b,Peer01 peer,uint records,uint seconds){lock(gate){if(disposed)throw new ObjectDisposedException("diagnostic-module");
   // The SHV API does not expose an outside-the-callback completion join. A
   // flag written immediately before ret cannot prove safe last-ref unmapping.
   // Explicitly armed diagnostics therefore retain code until process exit.
   IntPtr pinned;if(!GetModuleHandleEx(5,ownedModule,out pinned)||pinned!=ownedModule)throw new InvalidDataException("diagnostic-process-lifetime-pin");processLifetimePinned=true;
   var r=new Request01{Size=40,Version=2,Session0=a,Session1=b,Address=peer.Address,MaximumRecords=records,MaximumSeconds=seconds};if(begin(ref r,40)!=0)throw new InvalidDataException("diagnostic-begin-once");}}
  internal uint Read(out Record01 row){lock(gate){if(disposed)throw new ObjectDisposedException("diagnostic-module");return read(out row,200);}}
  internal void Stop(){lock(gate){if(!disposed)stop();}}
  internal sealed class Closure {public bool scriptLoopExitObserved,moduleReferenceReleased,processLifetimePinned;public int boundMs;public double elapsedMs;public uint terminalReadCode;internal Record01 Terminal;public string completionAuthority="inside-callback-loop-exit; no external SHV join";}
  internal Closure ObserveClosureAndRelease(int milliseconds){
   if(milliseconds<0||milliseconds>1000)throw new ArgumentOutOfRangeException("milliseconds");Stop();var watch=Stopwatch.StartNew();bool joined=false;
   do{lock(gate){if(disposed)throw new ObjectDisposedException("diagnostic-module");joined=closed()==1;}if(joined||watch.ElapsedMilliseconds>=milliseconds)break;System.Threading.Thread.Sleep(5);}while(true);
   lock(gate){Record01 terminal;uint terminalCode=read(out terminal,200);disposed=true;bool released=false;if(joined&&processLifetimePinned&&ownedModule!=IntPtr.Zero){released=FreeLibrary(ownedModule);if(released)ownedModule=IntPtr.Zero;}
    // Unknown/stuck native work keeps its reference until process exit. This
    // bounded one-diagnostic retention cannot unmap code still on the SHV fiber.
    return new Closure{scriptLoopExitObserved=joined,moduleReferenceReleased=released,processLifetimePinned=processLifetimePinned,boundMs=milliseconds,elapsedMs=watch.Elapsed.TotalMilliseconds,terminalReadCode=terminalCode,Terminal=terminal};}
  }
  public void Dispose(){ObserveClosureAndRelease(0);}
 }
}
#endif
