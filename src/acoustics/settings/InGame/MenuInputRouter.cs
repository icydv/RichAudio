using System;

namespace RichAudio.Settings.InGame
{
    // A saved key change cannot turn a key already held during Apply into a
    // fresh menu-toggle gesture. The adapter supplies physical held states.
    public sealed class MenuShortcutLatch
    {
        public string Key {get;private set;}
        public string PreviousKey {get;private set;}
        public bool WaitingForRelease {get;private set;}
        public MenuShortcutLatch(){Key=PreviousKey="F10";}
        public void Configure(string key)
        {
            if(Array.IndexOf(MenuPreferences.MenuToggleKeys,key)<0)key="F10";
            if(key==Key)return;PreviousKey=Key;Key=key;WaitingForRelease=true;
        }
        public bool Held(bool selectedKeyHeld,bool previousKeyHeld,bool controllerChordHeld)
        {
            if(WaitingForRelease){if(selectedKeyHeld||previousKeyHeld||controllerChordHeld)return false;WaitingForRelease=false;PreviousKey=Key;}
            return selectedKeyHeld||controllerChordHeld;
        }
    }
    // Decisions only: the adapter owns visibility, pause state and actual input suppression.
    public struct MenuInputResult
    {
        public readonly bool Open, Close, SuppressGameplay;
        public readonly MenuInput? Action;
        public MenuInputResult(bool open,bool close,MenuInput? action,bool suppressGameplay)
        {Open=open;Close=close;Action=action;SuppressGameplay=suppressGameplay;}
    }

    public sealed class MenuInputRouter
    {
        private const double InitialRepeatMs=400, RepeatMs=110;
        private readonly bool[] previousNavigation=new bool[6];
        private bool previousToggle, previousVisible, navigationArmed, pendingConsoleRequest;
        private double lastTime=Double.NegativeInfinity,nextRepeat;
        private int repeatingDirection=-1;

        // Navigation order is exactly MenuInput: Up, Down, Left, Right, Accept, Back.
        // A console request opens the menu once the console closes; it does not toggle it shut.
        public MenuInputResult Update(double nowMs,bool storyMode,bool paused,bool loading,bool consoleOpen,
            bool menuVisible,bool toggleHeld,bool consoleRequest,bool[] navigationHeld)
        {
            bool toggleEdge=toggleHeld&&!previousToggle;previousToggle=toggleHeld;
            if(Double.IsNaN(nowMs)||Double.IsInfinity(nowMs)||nowMs<0||nowMs<lastTime||
                navigationHeld==null||navigationHeld.Length!=6)
            {
                pendingConsoleRequest=false;previousVisible=false;ResetNavigation(navigationHeld);
                return new MenuInputResult(false,menuVisible,null,false);
            }
            lastTime=nowMs;
            if(!storyMode||paused||loading)
            {
                pendingConsoleRequest=false;previousVisible=false;ResetNavigation(navigationHeld);
                return new MenuInputResult(false,menuVisible,null,false);
            }
            if(consoleRequest)pendingConsoleRequest=true;
            if(consoleOpen)
            {
                previousVisible=false;ResetNavigation(navigationHeld);
                return new MenuInputResult(false,menuVisible,null,false);
            }

            // Physical rising edges already reject held keys. An additional
            // time gate would discard genuine taps and prevent reversing the
            // shorter220ms presentation. Rebinding has its own release gate.
            bool toggle=toggleEdge;
            bool requested=pendingConsoleRequest;pendingConsoleRequest=false;
            if(!menuVisible)
            {
                ResetNavigation(navigationHeld);previousVisible=toggle||requested;
                return new MenuInputResult(previousVisible,false,null,previousVisible);
            }
            if(toggle)
            {
                previousVisible=false;ResetNavigation(navigationHeld);
                return new MenuInputResult(false,true,null,true);
            }
            if(!previousVisible)ResetNavigation(navigationHeld);
            previousVisible=true;
            if(!navigationArmed)
            {
                bool released=true;
                for(int i=0;i<6;i++)released&=!navigationHeld[i];
                navigationArmed=released;RecordNavigation(navigationHeld);
                return new MenuInputResult(false,false,null,true);
            }

            // Back takes precedence over Accept, and neither repeats while held.
            if(navigationHeld[(int)MenuInput.Back]&&!previousNavigation[(int)MenuInput.Back])
            {
                previousVisible=false;ResetNavigation(navigationHeld);
                return new MenuInputResult(false,true,null,true);
            }
            MenuInput? action=null;
            if(navigationHeld[(int)MenuInput.Accept]&&!previousNavigation[(int)MenuInput.Accept])
                action=MenuInput.Accept;
            int direction=Direction(navigationHeld);
            if(direction!=repeatingDirection)
            {
                repeatingDirection=direction;nextRepeat=nowMs+InitialRepeatMs;
                if(direction>=0&&!action.HasValue)action=(MenuInput)direction;
            }
            else if(direction>=0&&nowMs>=nextRepeat)
            {
                // At most one action per update, including after a long scheduling gap.
                nextRepeat=nowMs+RepeatMs;
                if(!action.HasValue)action=(MenuInput)direction;
            }
            RecordNavigation(navigationHeld);
            return new MenuInputResult(false,false,action,true);
        }

        private static int Direction(bool[] held)
        {
            // Opposing buttons cancel. Orthogonal simultaneous buttons have stable enum priority.
            if(held[0]!=held[1])return held[0]?0:1;
            if(held[2]!=held[3])return held[2]?2:3;
            return -1;
        }
        private void ResetNavigation(bool[] held)
        {
            navigationArmed=false;repeatingDirection=-1;nextRepeat=0;
            if(held!=null&&held.Length==6)RecordNavigation(held);
            else Array.Clear(previousNavigation,0,previousNavigation.Length);
        }
        private void RecordNavigation(bool[] held)
        {for(int i=0;i<6;i++)previousNavigation[i]=held[i];}
    }
}
