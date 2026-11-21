using System;
using RichAudio.Settings.InGame;

// Actual transition and immutable render/hit transforms; no RPH or device IO.
public static class TestMenuTransition
{
    private static int checks;
    private static void Check(bool value,string reason){checks++;if(!value)throw new Exception("MenuTransition: "+reason);}
    private static void Near(double actual,double expected,string reason){Check(Math.Abs(actual-expected)<1e-8,reason);}
    private static void Reject(Action action,string reason){bool rejected=false;try{action();}catch(ArgumentException){rejected=true;}Check(rejected,reason);}
    public static int Run()
    {
        checks=0;OpeningAndClosing();ReversalAndForcedClose();ClockAndBounds();FrameTransform();return checks;
    }
    private static void OpeningAndClosing()
    {
        var transition=new MenuTransition();var state=transition.Sample(0);
        Check(!state.Visible&&!state.CapturesInput&&!state.TargetOpen&&state.Progress==0,"starts closed without gameplay capture");
        transition.SetOpen(true,10);state=transition.Sample(10);
        Check(state.Visible&&state.CapturesInput&&!state.FullyOpen&&state.Progress==0,"opening captures focus before its first visible pixels");
        double previous=0;for(int t=15;t<=230;t+=5){state=transition.Sample(t);Check(state.Progress>=previous&&state.Progress>=0&&state.Progress<=1&&state.CapturesInput,"opening is monotonic, bounded and focused");previous=state.Progress;}
        Check(state.FullyOpen&&state.Opacity==1,"full opening finishes after220ms");
        transition.SetOpen(false,230);state=transition.Sample(230,true);Check(state.Progress==1&&state.CapturesInput&&!state.TargetOpen,"closing starts at the current visible endpoint");
        previous=1;for(int t=235;t<=450;t+=5){state=transition.Sample(t,true);Check(state.Progress<=previous&&state.Progress>=0&&state.CapturesInput,"closing stays focused throughout its fade");previous=state.Progress;}
        Check(!state.Visible&&!state.FullyOpen&&state.CapturesInput&&state.Progress==0,"held closing input remains captured after pixels disappear");
        Check(transition.Sample(500,true).CapturesInput,"continued button hold cannot leak to gameplay");
        state=transition.Sample(501,false);Check(!state.Visible&&!state.CapturesInput,"closing input release completes focus exit");
        Check(!transition.Sample(502,true).CapturesInput,"a new gameplay input does not reacquire closed-menu focus");
        var ease=new MenuTransition();ease.SetOpen(true,0);Near(ease.Sample(55).Progress,.15625,"opening uses eased, non-linear motion");Near(ease.Sample(110).Progress,.5,"eased midpoint");Near(ease.Sample(165).Progress,.84375,"symmetrical eased finish");
    }
    private static void ReversalAndForcedClose()
    {
        var transition=new MenuTransition();transition.SetOpen(true,0);double opening=transition.Sample(77).Progress;
        transition.SetOpen(false,77);Near(transition.Sample(77,true).Progress,opening,"reversing opening preserves its exact visible fraction");
        double closing=transition.Sample(100,true).Progress;Check(closing<opening&&closing>0,"reversed close moves toward zero without a jump");
        transition.SetOpen(true,100);Near(transition.Sample(100).Progress,closing,"reversing closing preserves its exact visible fraction");
        Check(transition.Sample(130).Progress>closing,"reopened transition progresses forward");
        transition.SetOpen(true,130);Check(transition.Sample(400).FullyOpen,"repeated same target does not restart animation");
        transition.SetOpen(false,410);Check(transition.Sample(450,false).CapturesInput,"releasing early still captures during the remaining visible fade");
        transition.ResetClosed(451);var state=transition.Sample(451,true);Check(!state.Visible&&!state.CapturesInput,"forced Story/console/failure close clears presentation and focus immediately");
        transition.SetOpen(true,452);transition.SetOpen(false,452);Check(transition.Sample(452,true).CapturesInput,"immediate open-close retains its initiating button release guard");Check(!transition.Sample(453,false).CapturesInput,"immediate close releases when the button does");
    }
    private static void ClockAndBounds()
    {
        Reject(()=>new MenuTransition(0),"zero duration rejected");Reject(()=>new MenuTransition(1001),"unbounded duration rejected");Reject(()=>new MenuTransition(Double.NaN),"nonfinite duration rejected");
        var transition=new MenuTransition();transition.Sample(100);Reject(()=>transition.Sample(99),"backwards sample clock rejected");Reject(()=>transition.SetOpen(true,99),"backwards target clock rejected");Reject(()=>transition.ResetClosed(99),"backwards reset clock rejected");Reject(()=>transition.Sample(Double.PositiveInfinity),"infinite clock rejected");Reject(()=>transition.Sample(Double.NaN),"NaN clock rejected");Reject(()=>transition.Sample(-1),"negative clock rejected");
        Check(!transition.Sample(100).CapturesInput,"rejected clock input cannot mutate the closed state");
    }
    private static void FrameTransform()
    {
        var rect=new DrawCommand(DrawCommandKind.Rectangle,100,50,80,30,unchecked((int)0x80402010));
        var text=new DrawCommand(DrawCommandKind.Text,105,55,0,0,unchecked((int)0xFFD4AF37),"Vehicle",18,true);
        var region=new HitRegion(HitRegionKind.Row,2,-1,100,50,80,30);var frame=new MenuFrame(new[]{rect,text},new[]{region});
        var transition=new MenuTransition();var hidden=MenuTransition.Transform(frame,transition.Sample(0));Check(hidden.Commands.Count==0&&hidden.Regions.Count==0,"fully hidden presentation cannot retain invisible hit regions");
        transition.SetOpen(true,0);var state=transition.Sample(110);var transformed=MenuTransition.Transform(frame,state,32);
        Near(transformed.Commands[0].X,84,"half-open draw command has bounded leftward slide");Near(transformed.Regions[0].X,84,"hit target slides with its rendered row");Check(transformed.Regions[0].Contains(85,55)&&!transformed.Regions[0].Contains(170,55),"hit test uses the transformed, aligned bounds");
        Check(transformed.Commands[0].Argb==unchecked((int)0x40402010),"existing rectangle transparency scales without changing colour");Check(transformed.Commands[1].Argb==unchecked((int)0x80D4AF37),"text alpha rounds consistently");
        Check(transformed.Commands[1].Text==text.Text&&transformed.Commands[1].Bold&&transformed.Commands[1].FontSize==18,"text identity and style remain unchanged");
        Check(rect.X==100&&rect.Argb==unchecked((int)0x80402010)&&region.X==100,"immutable source frame is not edited");
        var full=MenuTransition.Transform(frame,transition.Sample(220),48);Check(full.Commands[0].X==rect.X&&full.Commands[0].Argb==rect.Argb&&full.Regions[0].X==region.X,"fully open presentation exactly retains geometry and colour");
        var dimTransition=new MenuTransition();dimTransition.SetOpen(true,0);var dim=MenuTransition.Present(frame,dimTransition.Sample(110),1920,1080);
        Check(dim.Commands[0].X==0&&dim.Commands[0].Y==0&&dim.Commands[0].Width==1920&&dim.Commands[0].Height==1080,"scene dimming remains fixed to the viewport rather than sliding with the panel");
        double halfShift=AcousticMenuModel.SidebarWidth*AcousticMenuModel.SidebarScale(1920,1080)*.5;
        Check(dim.Commands[0].Argb==unchecked((int)0x17000000),"scene dimmer is deliberately subtle at half-open");
        Check(Math.Abs(dim.Commands[1].X-(100-halfShift))<.001,"entire left sidebar slides from beyond the viewport edge");
        Check(Math.Abs(dim.Regions[0].X-(100-halfShift))<.001,"animated hit geometry stays aligned with sidebar commands");
        var open=MenuTransition.Present(frame,dimTransition.Sample(220),1920,1080);
        var pointer=MenuTransition.Present(frame,dimTransition.Sample(220),1920,1080,210,140,true);
        Check(pointer.Commands.Count==open.Commands.Count+14,"seven two-layer cursor segments render after all panel commands");
        Check(pointer.Commands[pointer.Commands.Count-1].Argb==unchecked((int)0xFFF2EFE7),
            "custom pointer is the last, fully opaque RPH draw layer");
        Check(pointer.Commands[pointer.Commands.Count-1].X>=210&&pointer.Commands[pointer.Commands.Count-1].Y>=140,
            "cursor location uses untransformed normalized input coordinates");
        Check(MenuTransition.Present(frame,dimTransition.Sample(220),1920,1080,1200,140,true).Commands.Count==open.Commands.Count,
            "pointer outside the sidebar is not doubled over the GTA scene");
        Check(MenuTransition.Present(frame,dimTransition.Sample(220),1920,1080,210,140,false).Commands.Count==open.Commands.Count,
            "keyboard-only presentation adds no decorative pointer");
        dimTransition.SetOpen(false,220);Check(MenuTransition.Present(frame,dimTransition.Sample(440),1920,1080).Commands.Count==0,"fully closed actual presentation removes dimmer and panel");
        Reject(()=>MenuTransition.Transform(frame,state,Single.NaN),"nonfinite slide rejected");Reject(()=>MenuTransition.Transform(frame,state,-1),"negative slide rejected");Reject(()=>MenuTransition.Transform(frame,state,4097),"unbounded slide rejected");Reject(()=>MenuTransition.Transform(null,state),"null frame rejected");Reject(()=>MenuTransition.Transform(frame,null),"null transition state rejected");
    }
    public static int Main(){try{Console.WriteLine("PASS "+Run()+" menu transition, focus-release and immutable hit-transform checks; no game or device");return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
