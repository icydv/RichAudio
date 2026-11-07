using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Rage;

namespace RichAudio {
 internal enum ObservationAction { None, Start, Donor, Stop }

 internal sealed class ObservationKeys {
#if !OBSERVATION_AUTHORED_FOCUS
  static readonly uint OwnPid=(uint)Process.GetCurrentProcess().Id;
#endif
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);

  internal static bool Foreground(){
#if OBSERVATION_AUTHORED_FOCUS
   return object.Equals(AppDomain.CurrentDomain.GetData("RichAudio.AuthoredForeground"),true);
#else
   var window=GetForegroundWindow();
   uint owner;
   return window!=IntPtr.Zero&&GetWindowThreadProcessId(window,out owner)!=0&&owner==OwnPid;
#endif
  }

  // Rearm only after all chord keys are released in an eligible context.
  // Only the backslash edge dispatches. Modifier changes cannot fire it.
  bool released;
  internal ObservationAction Poll(bool eligible){
   if(!eligible){released=false;return ObservationAction.None;}
   bool slash=Game.IsKeyDownRightNow(Keys.OemPipe)||Game.IsKeyDownRightNow(Keys.OemBackslash);
   bool leftCtrl=Game.IsKeyDownRightNow(Keys.LControlKey), rightCtrl=Game.IsKeyDownRightNow(Keys.RControlKey);
   bool shift=Game.IsKeyDownRightNow(Keys.LShiftKey)||Game.IsKeyDownRightNow(Keys.RShiftKey);
   bool leftAlt=Game.IsKeyDownRightNow(Keys.LMenu), rightAlt=Game.IsKeyDownRightNow(Keys.RMenu);
   bool ctrl=leftCtrl||rightCtrl;
   if(!slash&&!ctrl&&!shift&&!leftAlt&&!rightAlt)released=true;
   if(!released||!slash)return ObservationAction.None;
   released=false;
   if(leftAlt||rightAlt)return ObservationAction.None;
   if(ctrl)return shift?ObservationAction.Start:ObservationAction.Donor;
   return shift?ObservationAction.Stop:ObservationAction.None;
  }
 }
}
