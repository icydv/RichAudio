using System;
using System.Collections.Generic;
using System.Globalization;

namespace RichAudio.Settings.InGame
{
    public sealed partial class AcousticMenuModel
    {
        private static readonly int Gold=unchecked((int)0xFFD4AF37),GoldLight=unchecked((int)0xFFE6CF81),
            Ink=unchecked((int)0xFF111318),TextColor=unchecked((int)0xFFECEFF2),Muted=unchecked((int)0xFF9BA4AD),
            Background=unchecked((int)0xE80D1116),RowBackground=unchecked((int)0xA91E242B),Warning=unchecked((int)0xFFE7C778);
        private static readonly string[] Descriptions={
            "Sets the maximum direct and early-path detail per source. Auto adapts to measured workload. 32/64-path tiers are experimental and can exceed audio deadlines.",
            "Chooses acoustic computation independently of quality. GPU uses owned DirectCompute resources; unavailable or late work falls back to CPU. Active status is measured below.",
            "Smoothly mutes or restores RichAudio's owned output. It does not start a beacon, publisher, host or new audio session and does not change GTA's stock sounds.",
            "Scales RichAudio's owned output from 0 to 100% of the reviewed profile. It cannot boost above that profile; loudness is not a substitute for acoustic realism.",
            "Includes or removes valid first- and second-order reflection paths. Old contributions fade through the existing renderer; source history and direct sound remain intact.",
            "Doppler follows the causal propagation cursor. Independent Doppler bypass is not implemented; this read-only control cannot pretend to turn it off.",
            "Shows a compact, noninteractive overlay with fresh host/backend information. Unavailable or stale state is labelled unavailable rather than inferred from your selection.",
            "Environment-dependent late reverberation remains a planned acoustic feature. No artificial tail or uniform reverb preset is enabled by this menu.",
            "Advanced diffraction is not implemented. This menu does not replace unobserved propagation paths with invented effects.",
            "Saves validated preferences through the background service and updates a configured host. The menu never blocks an audio callback or starts a live session.",
            "Restores Auto quality, Auto acceleration, enabled output at the reviewed level, early reflections on and diagnostics off. Apply to persist these defaults.",
            "Closes the menu and releases its input focus. Unapplied edits are discarded; an already requested background save may still complete."
        };
        private static string Title(string value)
        {return String.IsNullOrEmpty(value)?"Unavailable":Char.ToUpperInvariant(value[0])+value.Substring(1);}
        private sealed class Painter
        {
            public readonly List<DrawCommand> Commands=new List<DrawCommand>(128);
            public readonly List<HitRegion> Hits=new List<HitRegion>(24);
            public readonly float X,Y,S,W;
            public Painter(float x,float y,float scale,float width){X=x;Y=y;S=scale;W=width;}
            public void Rect(float x,float y,float w,float h,int color)
            {Commands.Add(new DrawCommand(DrawCommandKind.Rectangle,X+x*S,Y+y*S,w*S,h*S,color));}
            public void Text(string text,float x,float y,float size,int color,bool bold=false)
            {Commands.Add(new DrawCommand(DrawCommandKind.Text,X+x*S,Y+y*S,0,0,color,text,size*S,bold));}
            public void Hit(HitRegionKind kind,int row,int value,float x,float y,float w,float h)
            {Hits.Add(new HitRegion(kind,row,value,X+x*S,Y+y*S,w*S,h*S));}
            public void Wrap(string text,float x,float y,float width,float size,int color,int maximumLines)
            {
                string remainder=text??"";
                for(int line=0;line<maximumLines&&remainder.Length>0;line++){
                    int take=0;float measured=0,available=Math.Max(size*5,width-size*2);
                    while(take<remainder.Length){char c=remainder[take];float glyph=c==' '?size*.4f:
                        "ilI.,:;'!|".IndexOf(c)>=0?size*.45f:c=='W'||c=='M'||c>127?size:size*.75f;
                        if(take>0&&measured+glyph>available)break;measured+=glyph;take++;}
                    if(take<remainder.Length){int space=remainder.LastIndexOf(' ',take-1,take);if(space>take/3)take=space;}
                    string part=remainder.Substring(0,take).Trim();remainder=remainder.Substring(take).TrimStart();
                    if(line==maximumLines-1&&remainder.Length>0){part=part.TrimEnd('.',' ')+"...";remainder="";}
                    Text(part,x,y+line*(size+4),size,color);
                }
            }
        }
        private static void Viewport(int width,int height,out float scale,out float x,out float y)
        {
            if(width<640||height<360||width>7680||height>4320)throw new ArgumentException("Bounded menu viewport required");
            scale=Math.Min(height/1080f,width/1100f);float panel=760*scale;
            x=Math.Max(18*scale,(width-panel)*.075f);y=(height-960*scale)/2;
        }
        private void Row(Painter p,int row,float y,float height,string label,string value,bool locked=false)
        {
            bool selected=SelectedIndex==row;int fill=selected?Gold:RowBackground,foreground=selected?Ink:locked?Muted:TextColor;
            p.Rect(16,y,728,height-2,fill);if(!selected)p.Rect(16,y,3,height-2,unchecked((int)0x5CD4AF37));
            p.Text(label,32,y+9,21,foreground,selected);
            if(!String.IsNullOrEmpty(value))p.Text(value,382,y+10,19,foreground,selected);
            p.Hit(HitRegionKind.Row,row,-1,16,y,728,height-2);
        }
        public MenuFrame BuildFrame(int width,int height,MenuStatus status)
        {
            if(!Visible)return new MenuFrame(new DrawCommand[0],new HitRegion[0]);
            float s,x,y;Viewport(width,height,out s,out x,out y);var p=new Painter(x,y,s,760);
            status=status??MenuStatus.Unavailable("No host status received");
            p.Rect(0,0,760,960,Background);p.Rect(0,0,760,3,Gold);p.Rect(0,0,1,960,unchecked((int)0x8AD4AF37));
            p.Rect(759,0,1,960,unchecked((int)0x5CD4AF37));
            // Subtle metallic rim and shadow use the same supported text/rect
            // primitives in the RPH adapter and controlled preview.
            p.Text("RichAudio",31,20,45,unchecked((int)0xFF30250D),true);
            p.Text("RichAudio",30,17.5f,45,GoldLight,true);p.Text("RichAudio",30,19,45,Gold,true);
            p.Text("ACOUSTIC SETTINGS",33,73,15,Muted,true);
            int[] metal={unchecked((int)0xFF80651E),unchecked((int)0xFFAF8B29),Gold,GoldLight,
                unchecked((int)0xFFF3E2AB),GoldLight,Gold,unchecked((int)0xFFAF8B29)};
            for(int i=0;i<metal.Length;i++)p.Rect(30+i*87.5f,98,87.5f,2,metal[i]);
            p.Rect(16,112,728,96,unchecked((int)0xB5222B33));
            p.Text("ACTIVE ENGINE",30,122,13,Gold,true);
            if(status.Available){
                p.Text(Title(status.ActiveQuality)+"  /  cap "+status.PathBudget+" paths/source",30,145,20,TextColor,true);
                p.Text(status.ActiveAcceleration.ToUpperInvariant(),542,145,20,Gold,true);
                string device=String.IsNullOrEmpty(status.Device)?"Device information unavailable":status.Device;
                p.Wrap(device,30,171,680,13,Muted,1);
                p.Wrap(!String.IsNullOrEmpty(status.FallbackReason)?"Fallback: "+status.FallbackReason:status.Detail,30,188,680,13,
                    !String.IsNullOrEmpty(status.FallbackReason)?Warning:Muted,1);
            }else{
                p.Text("Quality / backend unavailable",30,145,20,TextColor,true);
                p.Wrap(status.Detail,30,174,680,14,Muted,1);
            }
            p.Text("ACOUSTICS",30,214,15,Muted,true);
            p.Text("* Experimental: timing limits apply",382,214,13,Warning);
            Row(p,0,238,68,"Acoustic Quality",Title(Pending.Quality)+(qualityExperimental(Pending.Quality)?" (experimental)":""));
            string[] names={"AUTO","12","16","32*","64*"};int quality=Array.IndexOf(MenuPreferences.Qualities,Pending.Quality);
            for(int i=0;i<5;i++){
                float cx=382+i*66;p.Rect(cx,273,60,24,i==quality?Ink:unchecked((int)0xAF303842));
                p.Text(names[i],cx+9,275,14,i==quality?Gold:TextColor,i==quality);
                p.Hit(HitRegionKind.QualityChoice,0,i,cx,270,60,30);
            }
            Row(p,1,306,56,"Acoustic Acceleration",null);int acceleration=Array.IndexOf(MenuPreferences.Accelerations,Pending.Acceleration);
            string[] accelerations={"AUTO","CPU","GPU"};
            for(int i=0;i<3;i++){
                float cx=382+i*110;p.Rect(cx,319,104,29,i==acceleration?Ink:unchecked((int)0xAF303842));
                p.Text(accelerations[i],cx+20,324,16,i==acceleration?Gold:TextColor,i==acceleration);
                p.Hit(HitRegionKind.AccelerationChoice,1,i,cx,315,104,36);
            }
            p.Text("AUDIO",30,376,15,Muted,true);
            string activeAudio=status.Available&&status.ActiveOutputEnabled.HasValue&&status.ActiveOutputLevel.HasValue&&status.ActiveEarlyReflections.HasValue?
                "Active: "+(status.ActiveOutputEnabled.Value?"On":"Muted")+" / "+
                ((int)Math.Round(status.ActiveOutputLevel.Value*100)).ToString(CultureInfo.InvariantCulture)+"% / early "+
                (status.ActiveEarlyReflections.Value?"On":"Off"):"Active audio state unavailable";
            p.Text(activeAudio,140,376,13,Muted);
            Row(p,2,400,44,"RichAudio output",Pending.Enabled?"On":"Muted");
            Row(p,3,444,62,"Output Level",((int)Math.Round(Pending.OutputLevel*100)).ToString(CultureInfo.InvariantCulture)+"%");
            p.Rect(382,482,326,5,unchecked((int)0xFF4A525C));p.Rect(382,482,(float)(326*Pending.OutputLevel),5,SelectedIndex==3?Ink:Gold);
            p.Rect(378+(float)(326*Pending.OutputLevel),477,8,15,SelectedIndex==3?Ink:Gold);
            p.Hit(HitRegionKind.Level,3,-1,382,472,326,27);
            Row(p,4,506,44,"Early Reflections",Pending.EarlyReflections?"On":"Off");
            Row(p,5,550,44,"Doppler", "On (fixed)",true);
            Row(p,6,594,44,"Diagnostics Overlay",Pending.DiagnosticsOverlay?"On":"Off");
            Row(p,7,638,38,"Environmental Reverb","Not available",true);
            Row(p,8,676,38,"Advanced Diffraction","Not available",true);
            p.Rect(16,728,728,86,unchecked((int)0x9E10171E));p.Rect(16,728,3,86,Gold);
            string description=Descriptions[SelectedIndex];
            if(SelectedIndex==10&&!CanApply)description=ResetAvailable?
                "Recovers this supported configuration by preserving its exact original bytes before saving validated defaults. The background service rechecks the file before replacement.":
                "Settings recovery is unavailable for this configuration. No file or preference will be replaced.";
            p.Wrap(description,31,741,680,17,TextColor,3);
            string[] buttons={"APPLY CHANGES","RESET DEFAULTS","BACK"};
            for(int i=0;i<3;i++){
                int row=9+i;float cx=16+i*246;bool selected=SelectedIndex==row;bool locked=i==0&&!CanApply||i==1&&!CanApply&&!ResetAvailable;
                p.Rect(cx,830,236,45,selected&&!locked?Gold:RowBackground);
                p.Text(locked?(i==0?"APPLY UNAVAILABLE":"RESET UNAVAILABLE"):buttons[i],cx+18,843,17,locked?Muted:selected?Ink:TextColor,selected);
                p.Hit(HitRegionKind.Row,row,-1,cx,830,236,45);
            }
            p.Text("ARROWS  Navigate / adjust     ENTER  Select     ESC  Back",30,892,15,Muted);
            string notice=Notice;
            if(String.IsNullOrEmpty(notice))notice=Dirty?"Pending changes - Apply to save.":"Preferences saved. Active state is measured separately.";
            p.Wrap(notice,30,923,700,14,NoticeIsError?unchecked((int)0xFFE0A28B):Warning,1);
            lastFrame=new MenuFrame(p.Commands.ToArray(),p.Hits.ToArray());return lastFrame;
        }
        public MenuFrame BuildDiagnosticFrame(int width,int height,MenuStatus status)
        {
            float s,x,y;Viewport(width,height,out s,out x,out y);var p=new Painter(24*s,height-137*s,s,760);
            status=status??MenuStatus.Unavailable("Host status unavailable");
            p.Rect(0,0,470,112,Background);p.Rect(0,0,3,112,Gold);p.Text("RichAudio",15,10,21,Gold,true);
            string active=status.Available?Title(status.ActiveQuality)+" / "+status.ActiveAcceleration.ToUpperInvariant()+" / cap "+status.PathBudget+" paths":"Quality / backend unavailable";
            p.Text(active,15,40,18,TextColor);
            string detail=!String.IsNullOrEmpty(status.FallbackReason)?"Fallback: "+status.FallbackReason:status.Available?status.Detail:status.Detail;
            p.Wrap(detail,15,70,435,14,Muted,2);
            return new MenuFrame(p.Commands.ToArray(),new HitRegion[0]);
        }
        private static bool qualityExperimental(string quality){return quality=="quality"||quality=="max";}
    }
}
