// Isolated validation entry. The unchanged menu owns its existing input,
// drawing and preference workers; no gameplay/audio/observation entry is linked.
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using Rage;
using Rage.Attributes;

[assembly:Plugin("RichAudio MENU-02",Author="RichAudio",Description="Isolated F10 sidebar validation; no audio host, observation or recording service.",EntryPoint="RichAudio.Beacon.Rph.Menu02Entry.Main",ExitPoint="RichAudio.Beacon.Rph.Menu02Entry.OnUnload",PrefersSingleInstance=true,ShouldTickInPauseMenu=true)]

namespace RichAudio.Beacon.Rph
{
    public static class Menu02Entry
    {
        private static int started;
        private static volatile bool stopping;

        public static void Main()
        {
            if(Interlocked.Exchange(ref started,1)!=0)return;
            stopping=false;
            try
            {
                // Historical candidate policy, not an assertion about the
                // present installation or authentication of the loaded API.
                string executable=Process.GetCurrentProcess().MainModule.FileName;
                string api=typeof(Game).Assembly.Location;
                if(!String.Equals(Path.GetFileName(executable),"GTA5_Enhanced.exe",StringComparison.OrdinalIgnoreCase)||
                    FileVersionInfo.GetVersionInfo(executable).FileVersion!="1.0.1158.16"||
                    FileVersionInfo.GetVersionInfo(api).FileVersion!="1.132.1428.17748")
                    throw new InvalidOperationException("MENU-02 historical compatibility policy mismatch");
                InGameMenu.Start();
                Game.Console.Print("RichAudio MENU-02: isolated menu validation. Audio host and SoundMap service are not linked.");
                while(!stopping)GameFiber.Yield();
            }
            catch(ThreadAbortException){throw;}
            catch(Exception e){Game.Console.Print("RichAudio MENU-02 unavailable: "+e.GetType().Name);}
            finally{OnUnload();}
        }

        public static void OnUnload()
        {
            stopping=true;
            if(Interlocked.Exchange(ref started,0)==0)return;
            InGameMenu.Stop();
        }
    }
}
