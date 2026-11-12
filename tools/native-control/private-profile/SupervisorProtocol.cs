using System;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;

namespace RichAudio.GateA.Private01.Supervision {
 // These handles carry experiment control only. They contain no game handles,
 // native addresses, audio, or restoration authority.
 public static class SupervisorNames {
  public static string Name(string session,string kind){
   if(session==null||!System.Text.RegularExpressions.Regex.IsMatch(session,"\\A[a-f0-9]{32}\\z"))throw new ArgumentException("fresh supervision session required");
   return "Local\\RichAudio.Private01."+session+"."+kind;
  }
  internal static string IdentityKind(int pid,long creation){if(pid<=0||creation<=0)throw new ArgumentException("monitored process identity");return "identity-"+pid+"-"+creation;}
  internal static EventWaitHandle CreateEvent(string session,string kind,bool manual){
   var sid=WindowsIdentity.GetCurrent().User;var acl=new EventWaitHandleSecurity();acl.SetAccessRuleProtection(true,false);acl.SetOwner(sid);acl.AddAccessRule(new EventWaitHandleAccessRule(sid,EventWaitHandleRights.FullControl,AccessControlType.Allow));
   bool created;var value=new EventWaitHandle(false,manual?EventResetMode.ManualReset:EventResetMode.AutoReset,Name(session,kind),out created,acl);
   if(!created){value.Dispose();throw new InvalidOperationException("supervision session already exists");}return value;
  }
  internal static Mutex CreateGuard(string session){
   var sid=WindowsIdentity.GetCurrent().User;var acl=new MutexSecurity();acl.SetAccessRuleProtection(true,false);acl.SetOwner(sid);acl.AddAccessRule(new MutexAccessRule(sid,MutexRights.FullControl,AccessControlType.Allow));
   bool created;var value=new Mutex(true,Name(session,"guard"),out created,acl);
   if(!created){value.Dispose();throw new InvalidOperationException("supervision guard already exists");}return value;
  }
  internal static Semaphore CreateActivation(string session){
   var sid=WindowsIdentity.GetCurrent().User;var acl=new SemaphoreSecurity();acl.SetAccessRuleProtection(true,false);acl.SetOwner(sid);acl.AddAccessRule(new SemaphoreAccessRule(sid,SemaphoreRights.FullControl,AccessControlType.Allow));
   bool created;var value=new Semaphore(1,1,Name(session,"one-activation"),out created,acl);
   if(!created){value.Dispose();throw new InvalidOperationException("activation lease already exists");}return value;
  }
 }
 public sealed class SupervisorProbeClient:IDisposable {
  readonly Mutex guard;readonly EventWaitHandle stop,pulse,failure,retired,stopped;readonly Semaphore activation;
  SupervisorProbeClient(Mutex guard,EventWaitHandle stop,EventWaitHandle pulse,EventWaitHandle failure,EventWaitHandle retired,EventWaitHandle stopped,Semaphore activation){this.guard=guard;this.stop=stop;this.pulse=pulse;this.failure=failure;this.retired=retired;this.stopped=stopped;this.activation=activation;}
  public static SupervisorProbeClient TryOpen(string session){
   using(var process=System.Diagnostics.Process.GetCurrentProcess())return OpenBound(session,process.Id,process.StartTime.ToUniversalTime().Ticks);
  }
#if SUPERVISION_FIXTURES
  public static SupervisorProbeClient OpenBoundForFixture(string session,int pid,long creation){return OpenBound(session,pid,creation);}
#endif
  static SupervisorProbeClient OpenBound(string session,int pid,long creation){
   Mutex guard=null;EventWaitHandle stop=null,pulse=null,failure=null,retired=null,stopped=null;Semaphore activation=null;
   try{
    using(var binding=EventWaitHandle.OpenExisting(SupervisorNames.Name(session,SupervisorNames.IdentityKind(pid,creation))))if(!binding.WaitOne(0))return null;
    guard=Mutex.OpenExisting(SupervisorNames.Name(session,"guard"));
    stop=EventWaitHandle.OpenExisting(SupervisorNames.Name(session,"stop"));pulse=EventWaitHandle.OpenExisting(SupervisorNames.Name(session,"heartbeat"));
    failure=EventWaitHandle.OpenExisting(SupervisorNames.Name(session,"failure"));retired=EventWaitHandle.OpenExisting(SupervisorNames.Name(session,"retired"));
    stopped=EventWaitHandle.OpenExisting(SupervisorNames.Name(session,"stopped"));activation=Semaphore.OpenExisting(SupervisorNames.Name(session,"one-activation"));
    return new SupervisorProbeClient(guard,stop,pulse,failure,retired,stopped,activation);
   }catch(WaitHandleCannotBeOpenedException){if(guard!=null)guard.Dispose();if(activation!=null)activation.Dispose();foreach(var h in new[]{stop,pulse,failure,retired,stopped})if(h!=null)h.Dispose();return null;}
  }
  public bool StopRequested {
   get{
    if(stop.WaitOne(0))return true;
    bool acquired=false;try{try{acquired=guard.WaitOne(0);}catch(AbandonedMutexException){acquired=true;}return acquired;}
    finally{if(acquired)guard.ReleaseMutex();}
   }
  }
  // Call every supported script tick, including the dormant/manual phases.
  // False means revoke arming and proceed only with supported normal cleanup.
  public bool Heartbeat(){if(StopRequested)return false;pulse.Set();return true;}
  // Consume only on the explicit manual activation command, before spawning.
  // Never release: script reload, disposal and failed spawn cannot renew it.
  public bool TryClaimActivation(){if(StopRequested||!activation.WaitOne(0))return false;return !StopRequested;}
  public void ReportFailure(){failure.Set();}
  public void ReportStopAcknowledged(){stopped.Set();}
  // Only after BOTH exact disposable lifetimes have been positively retired.
  // This is a probe report, not proof of resource unload or disk restoration.
  public void ReportVehiclesRetired(){retired.Set();}
  public void Dispose(){guard.Dispose();stop.Dispose();pulse.Dispose();failure.Dispose();retired.Dispose();stopped.Dispose();activation.Dispose();}
 }
}
