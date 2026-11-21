using System;
using RichAudio.Settings.InGame;

// Device-free input policy fixtures, not evidence of live RPH/controller compatibility.
public static class TestMenuInputRouter
{
    private static int assertions;
    private static void Check(bool value,string message)
    {assertions++;if(!value)throw new Exception("MenuInputRouter: "+message);}
    private static bool[] Held(params MenuInput[] inputs)
    {bool[] held=new bool[6];foreach(MenuInput input in inputs)held[(int)input]=true;return held;}
    private static MenuInputResult Tick(MenuInputRouter router,double time,bool visible=false,bool toggle=false,
        bool request=false,bool console=false,bool story=true,bool paused=false,bool loading=false,bool[] nav=null)
    {return router.Update(time,story,paused,loading,console,visible,toggle,request,nav??Held());}
    private static MenuInputRouter OpenAndArm()
    {
        MenuInputRouter router=new MenuInputRouter();
        Check(Tick(router,0,toggle:true).Open,"fresh toggle opens");
        Check(!Tick(router,1,visible:true).Action.HasValue,"release frame arms without action");
        return router;
    }
    public static int Run()
    {
        assertions=0;ToggleEdges();RapidTransitionReversal();NavigationGate();DirectionRepeat();AcceptAndBack();Guards();ConsoleRequests();InvalidInput();ShortcutBinding();
        return assertions;
    }
    private static void ShortcutBinding()
    {
        var latch=new MenuShortcutLatch();Check(latch.Key=="F10"&&!latch.WaitingForRelease,"default shortcut is F10 without a stale startup latch");
        latch.Configure("F7");Check(latch.WaitingForRelease&&latch.PreviousKey=="F10","saved key change records both keys for release");
        Check(!latch.Held(false,true,false)&&latch.WaitingForRelease,"old key held during Apply cannot toggle the rebound menu");
        Check(!latch.Held(true,false,false)&&latch.WaitingForRelease,"new key already held during Apply cannot count as a fresh press");
        Check(!latch.Held(false,false,true)&&latch.WaitingForRelease,"controller chord also needs release across a rebind");
        Check(!latch.Held(false,false,false)&&!latch.WaitingForRelease&&latch.PreviousKey=="F7","releasing the gesture rearms the new key and forgets the old key");
        Check(latch.Held(true,false,false),"fresh rebound shortcut is usable");latch.Configure("F7");
        Check(!latch.WaitingForRelease,"unchanged settings snapshots do not restart key arming");
        latch.Configure("Escape");Check(latch.Key=="F10"&&latch.WaitingForRelease,"reserved or invalid key falls back to F10 through the same safe release gate");
        latch.Held(false,false,false);Check(latch.Held(false,false,true),"existing controller shortcut remains usable after release");
        var router=OpenAndArm();latch=new MenuShortcutLatch();latch.Configure("F6");
        Check(!Tick(router,2,visible:true,toggle:latch.Held(true,false,false)).Close,"already-held new binding cannot close the menu even without a timed debounce");
        Check(!Tick(router,3,visible:true,toggle:latch.Held(false,true,false)).Close,"held old binding is also suppressed during rebind release");
        Check(!Tick(router,4,visible:true,toggle:latch.Held(false,false,false)).Close,"binding release arms without synthesising a toggle");
        Check(Tick(router,5,visible:true,toggle:latch.Held(true,false,false)).Close,"fresh rebound shortcut works immediately after release");
    }
    private static void ToggleEdges()
    {
        MenuInputRouter router=new MenuInputRouter();
        MenuInputResult result=Tick(router,0,nav:Held(MenuInput.Down));
        Check(!result.Open&&!result.Close&&!result.Action.HasValue&&!result.SuppressGameplay,"hidden navigation ignored");
        result=Tick(router,1,toggle:true);
        Check(result.Open&&!result.Close&&result.SuppressGameplay,"opening consumes gameplay input");
        result=Tick(router,2,visible:true,toggle:true);
        Check(!result.Open&&!result.Close,"held toggle does not repeat");
        Tick(router,3,visible:true);
        result=Tick(router,4,visible:true,toggle:true);
        Check(result.Close&&!result.Open&&result.SuppressGameplay&&!result.Action.HasValue,"fresh rapid toggle closes and consumes closing frame");
        Check(!Tick(router,5,toggle:true).Open,"held close toggle cannot reopen");
        Tick(router,6);
        Check(Tick(router,7,toggle:true).Open,"released toggle can reopen without arbitrary dead time");
        Check(!Tick(router,8,visible:true,toggle:true).Close,"held reopen gesture cannot close again");
    }
    private static void RapidTransitionReversal()
    {
        var router=new MenuInputRouter();var transition=new MenuTransition();
        Check(Tick(router,0,toggle:true).Open,"first fresh edge requests opening");transition.SetOpen(true,0);Tick(router,1,visible:true);
        double opening=transition.Sample(100).Progress;Check(opening>0&&opening<1,"actual presentation is still opening before220ms");
        Check(Tick(router,100,visible:true,toggle:true).Close,"fresh edge can reverse opening before220ms");transition.SetOpen(false,100);
        Check(Math.Abs(transition.Sample(100,true).Progress-opening)<1e-12,"router close preserves the actual animated fraction");
        Check(!Tick(router,110,toggle:true).Open,"held rapid close is not a new gesture");Tick(router,120);
        double closing=transition.Sample(140).Progress;Check(closing>0&&closing<opening,"actual presentation is partway through its reversed close");
        Check(Tick(router,140,toggle:true).Open,"a genuinely released and pressed key reverses closing immediately");transition.SetOpen(true,140);
        Check(Math.Abs(transition.Sample(140).Progress-closing)<1e-12&&transition.Sample(140).CapturesInput,"reopening continues from the visible position without releasing focus");
    }
    private static void NavigationGate()
    {
        MenuInputRouter router=new MenuInputRouter();
        Check(Tick(router,0,toggle:true,nav:Held(MenuInput.Right)).Open,"controller chord opens");
        Check(!Tick(router,10,visible:true,nav:Held(MenuInput.Right)).Action.HasValue,"opening chord cannot change quality");
        Check(!Tick(router,500,visible:true,nav:Held(MenuInput.Accept)).Action.HasValue,"all controls must be released before arming");
        Check(!Tick(router,510,visible:true).Action.HasValue,"release only arms");
        Check(Tick(router,520,visible:true,nav:Held(MenuInput.Right)).Action==MenuInput.Right,"fresh direction after release accepted");
        Tick(router,530);
        Check(!Tick(router,540,visible:true,nav:Held(MenuInput.Down)).Action.HasValue,"externally opened menu also requires release");
        Tick(router,550,visible:true);
        Check(Tick(router,560,visible:true,nav:Held(MenuInput.Down)).Action==MenuInput.Down,"external open arms correctly");
    }
    private static void DirectionRepeat()
    {
        MenuInputRouter router=OpenAndArm();
        Check(Tick(router,10,visible:true,nav:Held(MenuInput.Down)).Action==MenuInput.Down,"initial directional edge");
        Check(!Tick(router,409,visible:true,nav:Held(MenuInput.Down)).Action.HasValue,"initial repeat waits 400ms");
        Check(Tick(router,410,visible:true,nav:Held(MenuInput.Down)).Action==MenuInput.Down,"initial repeat at 400ms");
        Check(!Tick(router,519,visible:true,nav:Held(MenuInput.Down)).Action.HasValue,"repeat waits 110ms");
        Check(Tick(router,520,visible:true,nav:Held(MenuInput.Down)).Action==MenuInput.Down,"repeat at 110ms");
        Check(Tick(router,5000,visible:true,nav:Held(MenuInput.Down)).Action==MenuInput.Down,"long gap yields one action");
        Check(!Tick(router,5001,visible:true,nav:Held(MenuInput.Down)).Action.HasValue,"no accumulated repeat burst");
        Check(Tick(router,5010,visible:true,nav:Held(MenuInput.Left)).Action==MenuInput.Left,"changed direction immediately acts");
        Check(!Tick(router,5020,visible:true,nav:Held(MenuInput.Up,MenuInput.Down)).Action.HasValue,"opposing directions cancel");
        Check(Tick(router,5030,visible:true,nav:Held(MenuInput.Up,MenuInput.Right)).Action==MenuInput.Up,"orthogonal priority deterministic");
    }
    private static void AcceptAndBack()
    {
        MenuInputRouter router=OpenAndArm();
        Check(Tick(router,10,visible:true,nav:Held(MenuInput.Accept)).Action==MenuInput.Accept,"accept edge");
        Check(!Tick(router,500,visible:true,nav:Held(MenuInput.Accept)).Action.HasValue,"accept never repeats");
        Tick(router,510,visible:true);
        Check(Tick(router,520,visible:true,nav:Held(MenuInput.Accept)).Action==MenuInput.Accept,"accept rearms after release");
        Tick(router,530,visible:true);
        MenuInputResult result=Tick(router,540,visible:true,nav:Held(MenuInput.Back,MenuInput.Accept));
        Check(result.Close&&result.SuppressGameplay&&!result.Action.HasValue,"back precedes accept and consumes closing frame");
        result=Tick(router,550,nav:Held(MenuInput.Back));
        Check(!result.Close&&!result.Action.HasValue&&!result.SuppressGameplay,"held back ignored while hidden");
    }
    private static void Guards()
    {
        for(int guard=0;guard<4;guard++)
        {
            MenuInputRouter router=OpenAndArm();
            MenuInputResult result=Tick(router,300,visible:true,toggle:true,request:true,
                story:guard!=0,paused:guard==1,loading:guard==2,console:guard==3,nav:Held(MenuInput.Right));
            Check(result.Close&&!result.Open&&!result.SuppressGameplay&&!result.Action.HasValue,"guard closes and releases gameplay "+guard);
            result=Tick(router,600,toggle:true,nav:Held(MenuInput.Right));
            Check(result.Open==(guard==3),"only pending console request opens after guard clears "+guard);
            if(guard!=3)
            {
                Tick(router,610);
                Check(Tick(router,620,toggle:true).Open,"fresh toggle needed after guard "+guard);
            }
        }
        MenuInputRouter hidden=new MenuInputRouter();
        Check(!Tick(hidden,0,story:false,toggle:true).Open,"online toggle cannot open");
        Check(!Tick(hidden,1,toggle:true).Open,"online held edge consumed");
    }
    private static void ConsoleRequests()
    {
        MenuInputRouter router=new MenuInputRouter();
        Check(!Tick(router,0,console:true,request:true).Open,"console request waits for console closure");
        Check(!Tick(router,1,console:true,request:true).Open,"repeated pending request stays bounded");
        Check(Tick(router,2).Open,"console close consumes one pending request");
        Check(!Tick(router,3,visible:true).Open,"pending request consumed once");
        Check(!Tick(router,4).Open,"external close cannot replay request");
        Check(Tick(router,5,request:true).Open,"request with closed console opens immediately");
        Check(!Tick(router,6,visible:true,request:true).Close,"open request does not toggle visible menu shut");
        Tick(router,7,console:true,request:true);
        Tick(router,8,console:true,loading:true);
        Check(!Tick(router,9).Open,"loading discards pending console request");
    }
    private static void InvalidInput()
    {
        MenuInputRouter router=OpenAndArm();
        MenuInputResult result=Tick(router,Double.NaN,visible:true,toggle:true);
        Check(result.Close&&!result.Open&&!result.SuppressGameplay,"invalid time fails closed");
        Check(!Tick(router,1000,toggle:true).Open,"invalid frame consumes held toggle");
        Tick(router,1001);
        Check(Tick(router,1002,toggle:true).Open,"valid fresh edge recovers");
        result=Tick(router,999,visible:true);
        Check(result.Close&&!result.SuppressGameplay,"clock reversal fails closed");
        result=router.Update(1003,true,false,false,false,true,false,false,new bool[5]);
        Check(result.Close&&!result.SuppressGameplay,"wrong input extent fails closed");
        result=router.Update(1004,true,false,false,false,true,false,false,null);
        Check(result.Close&&!result.SuppressGameplay,"missing input fails closed");
    }
}
