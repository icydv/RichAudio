using System;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;

namespace RichAudio.Beacon.Transport {
 // A current-user, per-session shutdown channel for the suspended/contained
 // SHVDNE launch path. The telemetry pipe protocol remains version 1.
 public static class GameplayStopSignal {
  public static string Name(int owner,string session){
   if(owner<=0||session==null||!System.Text.RegularExpressions.Regex.IsMatch(session,"\\A[a-f0-9]{32}\\z"))throw new ArgumentException("owned shutdown identity");
   return "Local\\RichAudio.Playable01.Stop."+owner+"."+session;
  }
  public static EventWaitHandle Create(int owner,string session){
   var sid=WindowsIdentity.GetCurrent().User;var security=new EventWaitHandleSecurity();security.SetAccessRuleProtection(true,false);security.SetOwner(sid);
   security.AddAccessRule(new EventWaitHandleAccessRule(sid,EventWaitHandleRights.FullControl,AccessControlType.Allow));
   bool created;var signal=new EventWaitHandle(false,EventResetMode.ManualReset,Name(owner,session),out created,security);
   if(!created){signal.Dispose();throw new InvalidOperationException("shutdown channel already exists");}return signal;
  }
  public static EventWaitHandle Open(int owner,string session){return EventWaitHandle.OpenExisting(Name(owner,session),EventWaitHandleRights.Synchronize);}
 }
}
