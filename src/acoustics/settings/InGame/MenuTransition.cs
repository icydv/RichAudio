// SDK-independent monotonic presentation and focus lifetime. No game or device IO.
using System;

namespace RichAudio.Settings.InGame
{
    public sealed class MenuTransitionState
    {
        public readonly double Progress;
        public readonly float Opacity;
        public readonly bool Visible,CapturesInput,TargetOpen,FullyOpen;
        internal MenuTransitionState(double progress,bool targetOpen,bool releasePending)
        {
            Progress=progress;Opacity=(float)progress;TargetOpen=targetOpen;
            Visible=targetOpen||progress>0;FullyOpen=targetOpen&&progress==1;
            CapturesInput=Visible||releasePending;
        }
    }

    public sealed class MenuTransition
    {
        public readonly double DurationMs;
        private bool hasTime,targetOpen,releasePending;
        private double lastTime,startedAt,startProgress,progress,span;
        public MenuTransition(double durationMs=220)
        {
            if(Double.IsNaN(durationMs)||Double.IsInfinity(durationMs)||durationMs<1||durationMs>1000)
                throw new ArgumentOutOfRangeException("durationMs");
            DurationMs=durationMs;
        }
        private void Advance(double nowMs)
        {
            if(Double.IsNaN(nowMs)||Double.IsInfinity(nowMs)||nowMs<0||hasTime&&nowMs<lastTime)
                throw new ArgumentOutOfRangeException("nowMs","Monotonic finite menu time required");
            hasTime=true;lastTime=nowMs;
            double target=targetOpen?1:0;
            if(span<=0){progress=target;return;}
            double u=Math.Max(0,Math.Min(1,(nowMs-startedAt)/span));
            double eased=u*u*(3-2*u);progress=startProgress+(target-startProgress)*eased;
            if(u==1){progress=target;span=0;}
        }
        public void SetOpen(bool open,double nowMs)
        {
            Advance(nowMs);if(open==targetOpen)return;
            startProgress=progress;startedAt=nowMs;targetOpen=open;
            // A reversal never jumps back to an endpoint or restarts a full
            // journey. Preserve its current fraction and bounded travel time.
            span=DurationMs*Math.Abs((open?1:0)-progress);
            releasePending=!open;
        }
        public void ResetClosed(double nowMs)
        {
            Advance(nowMs);targetOpen=false;releasePending=false;
            progress=startProgress=span=0;startedAt=nowMs;
        }
        public MenuTransitionState Sample(double nowMs,bool closingInputsHeld=false)
        {
            Advance(nowMs);
            // Fading to zero does not release a still-held closing key or
            // mouse button into gameplay. Its release completes focus exit.
            if(!targetOpen&&progress==0&&!closingInputsHeld)releasePending=false;
            return new MenuTransitionState(progress,targetOpen,releasePending);
        }
        public static MenuFrame Transform(MenuFrame frame,MenuTransitionState state,float slidePixels=32)
        {
            if(frame==null)throw new ArgumentNullException("frame");
            if(state==null)throw new ArgumentNullException("state");
            if(Single.IsNaN(slidePixels)||Single.IsInfinity(slidePixels)||slidePixels<0||slidePixels>512)
                throw new ArgumentOutOfRangeException("slidePixels");
            if(!state.Visible)return new MenuFrame(new DrawCommand[0],new HitRegion[0]);
            float dx=-slidePixels*(1-state.Opacity);
            var commands=new DrawCommand[frame.Commands.Count];var regions=new HitRegion[frame.Regions.Count];
            for(int i=0;i<commands.Length;i++)
            {
                var c=frame.Commands[i];if(c==null)throw new ArgumentException("Null menu draw command");
                int alpha=(int)((uint)c.Argb>>24),faded=(int)Math.Round(alpha*(double)state.Opacity,MidpointRounding.AwayFromZero);
                int argb=(c.Argb&0x00FFFFFF)|(faded<<24);
                commands[i]=new DrawCommand(c.Kind,c.X+dx,c.Y,c.Width,c.Height,argb,c.Text,c.FontSize,c.Bold);
            }
            for(int i=0;i<regions.Length;i++)
            {
                var r=frame.Regions[i];if(r==null)throw new ArgumentException("Null menu hit region");
                regions[i]=new HitRegion(r.Kind,r.RowIndex,r.ValueIndex,r.X+dx,r.Y,r.Width,r.Height);
            }
            return new MenuFrame(commands,regions);
        }
        public static MenuFrame Present(MenuFrame frame,MenuTransitionState state,int width,int height)
        {
            if(width<640||height<360||width>7680||height>4320)throw new ArgumentOutOfRangeException("width","Bounded menu viewport required");
            var view=Transform(frame,state,Math.Min(48,32*height/1080f));
            if(!state.Visible)return view;
            var commands=new DrawCommand[view.Commands.Count+1];
            commands[0]=new DrawCommand(DrawCommandKind.Rectangle,0,0,width,height,((int)Math.Round(82*state.Opacity))<<24);
            view.Commands.CopyTo(commands,1);var regions=new HitRegion[view.Regions.Count];view.Regions.CopyTo(regions,0);
            return new MenuFrame(commands,regions);
        }
    }
}
