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
            "Enables or stops the installed automatic Story Mode audio. GTA's original sounds remain active in experimental additive mode. No manual host command is needed.",
            "Scales RichAudio's owned output from 0 to 100% of the reviewed profile. It cannot boost above that profile; loudness is not a substitute for acoustic realism.",
            "Includes or removes valid first- and second-order reflection paths. Old contributions fade through the existing renderer; source history and direct sound remain intact.",
            "Doppler follows the causal propagation cursor. Independent Doppler bypass is not implemented; this read-only control cannot pretend to turn it off.",
            "Shows a compact, noninteractive overlay with fresh host/backend information. Unavailable or stale state is labelled unavailable rather than inferred from your selection.",
            "Shows or hides the optional SoundMap viewer. Gameplay audio works independently of the viewer. Its local service remains owned by RichAudio.",
            "Stock fallback uses only GTA audio. Experimental additive plays verified RichAudio sources alongside GTA engine audio. Selective native replacement is unavailable; no horns, tyres or other GTA sounds are muted.",
            "Chooses the menu key for future openings. Apply to save. Other mods may use the same key; choose another if needed. F4, Escape and gameplay keys are reserved.",
            "Saves your preferences for this and future launches. Enabled additive mode starts automatically when offline Story Mode is ready.",
            "Restores safe defaults, including GTA stock fallback and hidden SoundMap. Apply to save the defaults.",
            "Closes the menu and releases its input focus. Unapplied edits are discarded; an already requested background save may still complete.",
            "Records a private acoustic timeline and RichAudio-owned PCM through SoundMap. This does not start the host, sound source or world publisher. Microphone and system audio are excluded."
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
        // Full-height, left-anchored sidebar. No floating window margins:
        // the 1000-unit canvas is fitted to the actual drawable screen height.
        internal const float SidebarWidth=620f,SidebarHeight=1000f;
        internal static float SidebarScale(int width,int height)
        {
            if(width<640||height<360||width>7680||height>4320)throw new ArgumentException("Bounded menu viewport required");
            return Math.Min(height/SidebarHeight,width/900f);
        }
        private static void Viewport(int width,int height,out float scale,out float x,out float y)
        {
            scale=SidebarScale(width,height);x=0;y=0;
        }
        private static readonly int SelectedRow=unchecked((int)0xF02B3037),
            Divider=unchecked((int)0x70424B56),
            PanelInset=unchecked((int)0xF21C2229);
        private void Row(Painter p,int row,float y,float height,string label,string value,bool locked=false)
        {
            bool selected=SelectedIndex==row;
            p.Rect(24,y,572,height-2,selected?SelectedRow:RowBackground);
            if(selected)p.Rect(24,y,3,height-2,Gold);
            p.Rect(39,y+height-2,540,1,Divider);
            p.Text(label,40,y+8,17,locked?Muted:TextColor,selected);
            if(!String.IsNullOrEmpty(value))p.Text(value,330,y+9,15,selected?GoldLight:Muted,selected);
            p.Hit(HitRegionKind.Row,row,-1,24,y,572,height-2);
        }
        public MenuFrame BuildFrame(int width,int height,MenuStatus status)
        {
            if(!Visible)return new MenuFrame(new DrawCommand[0],new HitRegion[0]);
            float s,x,y;Viewport(width,height,out s,out x,out y);var p=new Painter(x,y,s,SidebarWidth);
            status=status??MenuStatus.Unavailable("No host status received");

            // Restrained charcoal, gold accents, and a fine right-hand edge.
            // The translucent scene dimmer is composed by MenuTransition.Present.
            p.Rect(0,0,SidebarWidth,SidebarHeight,Background);
            p.Rect(0,0,4,SidebarHeight,unchecked((int)0xDAD4AF37));
            p.Rect(619,0,1,SidebarHeight,Divider);
            p.Rect(620,0,7,SidebarHeight,unchecked((int)0x35000000));
            p.Text("RichAudio",30,24,38,Gold,true);
            p.Text("IMMERSIVE WORLD AUDIO",32,73,12,Muted,true);
            p.Text("SETTINGS",520,47,12,Muted,true);
            p.Rect(30,105,559,1,Divider);

            p.Rect(24,121,572,109,PanelInset);
            p.Rect(24,121,3,109,Gold);
            p.Text("ENGINE STATUS",39,132,12,GoldLight,true);
            if(status.Available)
            {
                p.Text(Title(status.ActiveQuality)+"  /  cap "+status.PathBudget+" paths/source",39,152,20,TextColor,true);
                p.Text(status.ActiveAcceleration.ToUpperInvariant(),501,157,14,Gold,true);
                string device=String.IsNullOrEmpty(status.Device)?"Device information unavailable":status.Device;
                p.Wrap(device,39,182,530,12,Muted,1);
                p.Wrap(!String.IsNullOrEmpty(status.FallbackReason)?"Fallback: "+status.FallbackReason:status.Detail,
                    39,203,532,12,!String.IsNullOrEmpty(status.FallbackReason)?Warning:Muted,1);
            }
            else if(status.StockAudioActive)
            {
                p.Text("Stock audio active",39,155,20,TextColor,true);
                p.Wrap(status.Detail,39,187,525,13,Muted,2);
            }
            else
            {
                p.Text("Quality / backend unavailable",39,155,19,TextColor,true);
                p.Wrap(status.Detail,39,186,525,13,Muted,2);
            }

            p.Text("ACOUSTICS",30,237,12,GoldLight,true);
            p.Text("* 32 / 64: higher processing cost",347,237,11,Warning);
            Row(p,0,254,78,"Acoustic Quality",Title(Pending.Quality)+(qualityExperimental(Pending.Quality)?" (experimental)":""));
            string[] qualityNames={"AUTO","12","16","32*","64*"};
            int quality=Array.IndexOf(MenuPreferences.Qualities,Pending.Quality);
            for(int i=0;i<5;i++)
            {
                float cx=316+i*54;
                p.Rect(cx,295,50,26,i==quality?unchecked((int)0xE0514230):unchecked((int)0xA4293139));
                p.Text(qualityNames[i],cx+7,300,13,i==quality?GoldLight:Muted,i==quality);
                p.Hit(HitRegionKind.QualityChoice,0,i,cx,292,50,32);
            }
            Row(p,1,334,67,"Acoustic Acceleration",null);
            string[] accelerationNames={"AUTO","CPU","GPU"};
            int acceleration=Array.IndexOf(MenuPreferences.Accelerations,Pending.Acceleration);
            for(int i=0;i<3;i++)
            {
                float cx=317+i*91;
                p.Rect(cx,367,86,26,i==acceleration?unchecked((int)0xE0514230):unchecked((int)0xA4293139));
                p.Text(accelerationNames[i],cx+20,373,13,i==acceleration?GoldLight:Muted,i==acceleration);
                p.Hit(HitRegionKind.AccelerationChoice,1,i,cx,365,86,30);
            }

            p.Text("PLAYBACK",30,409,12,GoldLight,true);
            string activeAudio=status.StockAudioActive?"GTA audio active / RichAudio stopped":
                status.Available&&status.ActiveOutputEnabled.HasValue&&status.ActiveOutputLevel.HasValue&&status.ActiveEarlyReflections.HasValue?
                "Active: "+(status.ActiveOutputEnabled.Value?"On":"Muted")+" / "+
                ((int)Math.Round(status.ActiveOutputLevel.Value*100)).ToString(CultureInfo.InvariantCulture)+"% / early "+
                (status.ActiveEarlyReflections.Value?"On":"Off"):"Active audio state unavailable";
            p.Text(activeAudio,207,410,12,Muted);
            Row(p,2,432,40,"RichAudio output",Pending.Enabled?"On":"Muted");
            Row(p,3,473,62,"Output Level",((int)Math.Round(Pending.OutputLevel*100)).ToString(CultureInfo.InvariantCulture)+"%");
            p.Rect(331,512,239,4,unchecked((int)0xFF4A535D));
            p.Rect(331,512,(float)(239*Pending.OutputLevel),4,Gold);
            p.Rect(328+(float)(239*Pending.OutputLevel),506,7,16,SelectedIndex==3?GoldLight:TextColor);
            p.Hit(HitRegionKind.Level,3,-1,331,502,239,27);
            Row(p,4,537,40,"Early Reflections",Pending.EarlyReflections?"On":"Off");
            Row(p,5,578,40,"Doppler","On (fixed)",true);
            Row(p,6,619,40,"Diagnostics Overlay",Pending.DiagnosticsOverlay?"On":"Off");
            Row(p,7,660,40,"SoundMap viewer",Pending.SoundMapVisible?"Visible":"Hidden");
            Row(p,8,701,40,"Audio integration",Pending.IntegrationMode=="experimental-additive"?"Additive (experimental)":"GTA stock fallback");
            Row(p,MenuKeyRow,742,52,"Open menu key",null);
            int menuKey=Array.IndexOf(MenuPreferences.MenuToggleKeys,Pending.MenuToggleKey);
            for(int i=0;i<MenuPreferences.MenuToggleKeys.Length;i++)
            {
                float cx=324+i*52;
                p.Rect(cx,759,48,25,i==menuKey?unchecked((int)0xE0514230):unchecked((int)0xA4293139));
                p.Text(MenuPreferences.MenuToggleKeys[i],cx+10,764,12,i==menuKey?GoldLight:Muted,i==menuKey);
                p.Hit(HitRegionKind.MenuKeyChoice,MenuKeyRow,i,cx,756,48,30);
            }

            // The context stays readable without making every row a separate card.
            p.Rect(24,802,572,60,PanelInset);
            p.Rect(24,802,3,60,Gold);
            string description=Descriptions[SelectedIndex];
            if(SelectedIndex==RecordingRow)description=(AudioTestRecordingMode?
                "Local WAVs: RichAudio and the selected output mix, including other apps. No microphone or uploads.":Descriptions[RecordingRow])+" "+RecordingDetail;
            if(SelectedIndex==ResetRow&&!CanApply)description=ResetAvailable?
                "Recovers this configuration by preserving original bytes before saving validated defaults. The background service rechecks the file.":
                "Settings recovery is unavailable for this configuration. No file or preference will be replaced.";
            p.Wrap(description,37,810,537,13,TextColor,3);

            string recordingButton=AudioTestRecordingMode?(RecordingPending?"TEST PENDING":RecordingActive?"STOP AUDIO TEST":"RECORD AUDIO TEST"):
                (RecordingPending?"REC PENDING":RecordingActive?"STOP RECORDING":"START RECORDING");
            string[] buttons={"APPLY CHANGES","RESET DEFAULTS","BACK",recordingButton};
            for(int i=0;i<4;i++)
            {
                int row=ApplyRow+i;float cx=24+(i%2)*290,cy=868+(i/2)*35;
                bool selected=SelectedIndex==row;
                bool locked=i==0&&!CanApply||i==1&&!CanApply&&!ResetAvailable||i==3&&(!RecordingAvailable||RecordingPending);
                p.Rect(cx,cy,280,32,selected&&!locked?unchecked((int)0xF0524631):PanelInset);
                if(selected)p.Rect(cx,cy,3,32,Gold);
                string shown=locked?(i==0?"APPLY UNAVAILABLE":i==1?"RESET UNAVAILABLE":
                    AudioTestRecordingMode?recordingButton:RecordingPending?"REC PENDING":"REC UNAVAILABLE"):buttons[i];
                p.Text(shown,cx+12,cy+7,14,locked?Muted:selected?GoldLight:TextColor,selected);
                p.Hit(HitRegionKind.Row,row,-1,cx,cy,280,32);
            }
            p.Text("ARROWS  Navigate     ENTER  Select     ESC  Close",31,939,12,Muted);
            string notice=Notice;
            if(String.IsNullOrEmpty(notice))notice=Dirty?"Pending changes - Apply to save.":"Preferences saved. Active state is measured separately.";
            p.Wrap(notice,31,963,551,12,NoticeIsError?unchecked((int)0xFFE0A28B):GoldLight,2);
            lastFrame=new MenuFrame(p.Commands.ToArray(),p.Hits.ToArray());return lastFrame;
        }
        public MenuFrame BuildDiagnosticFrame(int width,int height,MenuStatus status)
        {
            float s,x,y;Viewport(width,height,out s,out x,out y);var p=new Painter(24*s,height-137*s,s,760);
            status=status??MenuStatus.Unavailable("Host status unavailable");
            p.Rect(0,0,470,112,Background);p.Rect(0,0,3,112,Gold);p.Text("RichAudio",15,10,21,Gold,true);
            string active=status.StockAudioActive?"GTA stock audio":status.Available?Title(status.ActiveQuality)+" / "+status.ActiveAcceleration.ToUpperInvariant()+" / cap "+status.PathBudget+" paths":"Quality / backend unavailable";
            p.Text(active,15,40,18,TextColor);
            string detail=!String.IsNullOrEmpty(status.FallbackReason)?"Fallback: "+status.FallbackReason:status.Available?status.Detail:status.Detail;
            p.Wrap(detail,15,70,435,14,Muted,2);
            return new MenuFrame(p.Commands.ToArray(),new HitRegion[0]);
        }
        private static bool qualityExperimental(string quality){return quality=="quality"||quality=="max";}
    }
}
