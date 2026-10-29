using System;

namespace RichAudio.Settings.InGame
{
    public sealed partial class AcousticMenuModel
    {
        public const int RowCount=12;
        public bool Visible {get;private set;}
        public int SelectedIndex {get;private set;}
        public MenuPreferences Pending {get;private set;}
        public bool CanApply {get;private set;}
        public bool ResetAvailable {get;private set;}
        public bool Dirty {get{return !Pending.Same(baseline);}}
        public string Notice {get;private set;}
        public bool NoticeIsError {get;private set;}
        private MenuPreferences baseline;
        private MenuFrame lastFrame;
        private float lastMouseX=Single.NaN,lastMouseY=Single.NaN;
        public AcousticMenuModel(){baseline=Pending=MenuPreferences.Defaults;CanApply=true;Notice="";}
        public void Open(MenuPreferences preferences,bool canApply=true)
        {
            if(preferences==null)throw new ArgumentNullException("preferences");
            baseline=Pending=preferences.With();CanApply=canApply;ResetAvailable=false;SelectedIndex=0;Visible=true;Notice="";NoticeIsError=false;
            lastMouseX=lastMouseY=Single.NaN;lastFrame=null;
        }
        public void Close(){Visible=false;Pending=baseline.With();lastFrame=null;}
        public void SetWritable(bool canApply){CanApply=canApply;}
        public void SetResetAvailable(bool resetAvailable){ResetAvailable=resetAvailable;}
        public void SetNotice(string message,bool error=false)
        {Notice=(message??"").Replace('\r',' ').Replace('\n',' ');if(Notice.Length>160)Notice=Notice.Substring(0,160);NoticeIsError=error;}
        public void Acknowledge(MenuPreferences saved,string message)
        {
            if(saved==null)throw new ArgumentNullException("saved");bool newer=Visible&&!Pending.Same(saved);baseline=saved.With();
            if(!Visible)Pending=baseline.With();SetNotice(newer?"Previous preferences saved; current edits remain pending.":message);
        }
        public MenuAction Handle(MenuInput input)
        {
            if(!Visible)return MenuAction.None;
            if(input==MenuInput.Back){Close();return MenuAction.Close;}
            if(input==MenuInput.Up){SelectedIndex=(SelectedIndex+RowCount-1)%RowCount;return MenuAction.None;}
            if(input==MenuInput.Down){SelectedIndex=(SelectedIndex+1)%RowCount;return MenuAction.None;}
            if(input==MenuInput.Left||input==MenuInput.Right){
                int direction=input==MenuInput.Left?-1:1;
                if(SelectedIndex>=9){SelectedIndex=9+(SelectedIndex-9+direction+3)%3;return MenuAction.None;}
                Adjust(direction,false);return MenuAction.None;
            }
            if(input==MenuInput.Accept){
                if(SelectedIndex==9){if(!CanApply){SetNotice("Settings storage unavailable. Preferences have not been saved.",true);return MenuAction.None;}
                    SetNotice("Saving requested. Active engine state is shown separately.");return MenuAction.Apply;}
                if(SelectedIndex==10){
                    if(!CanApply){
                        if(!ResetAvailable){SetNotice("Settings recovery is unavailable. Preferences have not been changed.",true);return MenuAction.None;}
                        Pending=MenuPreferences.Defaults;SetNotice("Defaults reset requested. The background service must preserve the original settings first.");return MenuAction.Reset;
                    }
                    Pending=MenuPreferences.Defaults;SetNotice("Defaults selected. Apply to save; Back discards pending changes.");return MenuAction.None;
                }
                if(SelectedIndex==11){Close();return MenuAction.Close;}
                Adjust(1,true);
            }
            return MenuAction.None;
        }
        private void Adjust(int direction,bool cycle)
        {
            switch(SelectedIndex){
                case 0:{int index=Array.IndexOf(MenuPreferences.Qualities,Pending.Quality),next=cycle?(index+1)%5:Math.Max(0,Math.Min(4,index+direction));
                    Pending=Pending.With(quality:MenuPreferences.Qualities[next]);break;}
                case 1:{int index=Array.IndexOf(MenuPreferences.Accelerations,Pending.Acceleration),next=cycle?(index+1)%3:Math.Max(0,Math.Min(2,index+direction));
                    Pending=Pending.With(acceleration:MenuPreferences.Accelerations[next]);break;}
                case 2:Pending=Pending.With(enabled:cycle?!Pending.Enabled:direction>0);break;
                case 3:Pending=Pending.With(outputLevel:Math.Max(0,Math.Min(1,Math.Round((Pending.OutputLevel+direction*.05)*20)/20)));break;
                case 4:Pending=Pending.With(earlyReflections:cycle?!Pending.EarlyReflections:direction>0);break;
                case 6:Pending=Pending.With(diagnosticsOverlay:cycle?!Pending.DiagnosticsOverlay:direction>0);break;
                default:SetNotice("This control is read-only; no unsupported effect has been enabled.");return;
            }
            SetNotice("Pending changes. Apply to save and update a configured host.");
        }
        public MenuAction Pointer(float pixelX,float pixelY,bool click,int wheel)
        {
            if(!Visible||lastFrame==null||Single.IsNaN(pixelX)||Single.IsNaN(pixelY)||Single.IsInfinity(pixelX)||Single.IsInfinity(pixelY))return MenuAction.None;
            if(wheel!=0)return Handle(wheel>0?MenuInput.Up:MenuInput.Down);
            bool moved=Single.IsNaN(lastMouseX)||Math.Abs(pixelX-lastMouseX)>.5f||Math.Abs(pixelY-lastMouseY)>.5f;
            lastMouseX=pixelX;lastMouseY=pixelY;HitRegion hit=null;
            // Later value hit regions take precedence over their enclosing row.
            for(int i=lastFrame.Regions.Count-1;i>=0;i--)if(lastFrame.Regions[i].Contains(pixelX,pixelY)){hit=lastFrame.Regions[i];break;}
            if(hit==null)return MenuAction.None;if(moved||click)SelectedIndex=hit.RowIndex;
            if(!click)return MenuAction.None;
            if(hit.Kind==HitRegionKind.QualityChoice){Pending=Pending.With(quality:MenuPreferences.Qualities[hit.ValueIndex]);SetNotice("Pending changes. Apply to save.");return MenuAction.None;}
            if(hit.Kind==HitRegionKind.AccelerationChoice){Pending=Pending.With(acceleration:MenuPreferences.Accelerations[hit.ValueIndex]);SetNotice("Pending changes. Apply to save.");return MenuAction.None;}
            if(hit.Kind==HitRegionKind.Level){double value=Math.Max(0,Math.Min(1,(pixelX-hit.X)/hit.Width));Pending=Pending.With(outputLevel:Math.Round(value*20)/20);SetNotice("Pending output level. Apply to save.");return MenuAction.None;}
            if(SelectedIndex==0||SelectedIndex==1||SelectedIndex==3)return MenuAction.None;
            return Handle(MenuInput.Accept);
        }
    }
}
