// Actual SDK-independent menu model, input and draw-command preview fixtures.
// No RPH assembly, game, endpoint or visible window is used.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Web.Script.Serialization;
using RichAudio.Settings.InGame;

public static class TestInGameMenu
{
    private static int assertions;
    private static void Check(bool condition,string message){assertions++;if(!condition)throw new Exception("In-game menu fixture: "+message);}
    private static void Select(AcousticMenuModel menu,int row){for(int i=0;menu.SelectedIndex!=row&&i<AcousticMenuModel.RowCount;i++)menu.Handle(MenuInput.Down);Check(menu.SelectedIndex==row,"bounded row navigation");}
    private static bool HasText(MenuFrame frame,string text){foreach(var c in frame.Commands)if(c.Kind==DrawCommandKind.Text&&c.Text.Contains(text))return true;return false;}
    private static HitRegion Region(MenuFrame frame,HitRegionKind kind,int row,int value)
    {foreach(var hit in frame.Regions)if(hit.Kind==kind&&hit.RowIndex==row&&hit.ValueIndex==value)return hit;throw new Exception("Expected menu hit region");}
    private static MenuAction Click(AcousticMenuModel model,HitRegion hit,float fraction=.5f)
    {return model.Pointer(hit.X+hit.Width*fraction,hit.Y+hit.Height*.5f,true,0);}
    private static void ModelTests()
    {
        var menu=new AcousticMenuModel();Check(!menu.Visible,"initially hidden");
        Check(menu.Handle(MenuInput.Accept)==MenuAction.None&&menu.Pointer(0,0,true,0)==MenuAction.None,"hidden input ignored");
        Check(menu.BuildFrame(1920,1080,null).Commands.Count==0,"hidden menu emits no drawing");
        var defaults=MenuPreferences.Defaults;Check(defaults.Quality=="auto"&&defaults.Acceleration=="auto"&&defaults.Enabled&&defaults.OutputLevel==1&&defaults.EarlyReflections&&!defaults.DiagnosticsOverlay,"reviewed defaults");
        foreach(double bad in new[]{Double.NaN,Double.PositiveInfinity,-.01,1.01}){bool rejected=false;try{new MenuPreferences("auto","cpu",outputLevel:bad);}catch(ArgumentException){rejected=true;}Check(rejected,"invalid level rejected");}
        menu.Open(defaults);Check(menu.Visible&&!menu.Dirty,"open copies baseline");
        menu.Handle(MenuInput.Left);Check(menu.Pending.Quality=="auto","quality slider clamps lower end");
        for(int i=0;i<4;i++)menu.Handle(MenuInput.Right);Check(menu.Pending.Quality=="max","all five real quality positions accessible");
        menu.Handle(MenuInput.Right);Check(menu.Pending.Quality=="max","quality slider clamps upper end");
        menu.Handle(MenuInput.Accept);Check(menu.Pending.Quality=="auto","Enter cycles quality");
        menu.Handle(MenuInput.Right);menu.Handle(MenuInput.Right);menu.Handle(MenuInput.Right);
        Select(menu,1);menu.Handle(MenuInput.Right);menu.Handle(MenuInput.Right);
        Check(menu.Pending.Quality=="quality"&&menu.Pending.Acceleration=="gpu","quality and GPU independent");
        Select(menu,2);menu.Handle(MenuInput.Accept);Check(!menu.Pending.Enabled,"owned output toggle");
        Select(menu,3);for(int i=0;i<5;i++)menu.Handle(MenuInput.Left);Check(Math.Abs(menu.Pending.OutputLevel-.75)<1e-12,"level steps by five percent");
        for(int i=0;i<40;i++)menu.Handle(MenuInput.Right);Check(menu.Pending.OutputLevel==1,"level never boosts beyond profile");
        Select(menu,4);menu.Handle(MenuInput.Accept);Check(!menu.Pending.EarlyReflections,"early processing toggle");
        foreach(int locked in new[]{5,7,8}){Select(menu,locked);var before=menu.Pending;menu.Handle(MenuInput.Accept);menu.Handle(MenuInput.Left);Check(menu.Pending.Same(before),"unsupported effect stays read-only");}
        Select(menu,6);menu.Handle(MenuInput.Accept);Check(menu.Pending.DiagnosticsOverlay,"diagnostics preference changes");
        Select(menu,9);Check(menu.Handle(MenuInput.Accept)==MenuAction.Apply,"Apply requests persistence, not an engine launch");
        var submitted=menu.Pending;menu.Acknowledge(submitted,"Saved; awaiting engine report");Check(!menu.Dirty,"save acknowledgment updates baseline");
        Select(menu,3);menu.Handle(MenuInput.Left);var newer=menu.Pending;menu.Acknowledge(submitted,"Earlier save finished");Check(menu.Pending.Same(newer)&&menu.Dirty,"old save acknowledgement cannot erase newer edits");
        Check(menu.Notice=="Previous preferences saved; current edits remain pending.","save notice cannot claim newer edits were saved");
        Select(menu,10);menu.Handle(MenuInput.Accept);Check(menu.Pending.Same(MenuPreferences.Defaults),"Reset Defaults prepares genuine defaults");
        Check(menu.Handle(MenuInput.Back)==MenuAction.Close&&!menu.Visible,"Back closes and releases model focus");
        Check(menu.Pending.Same(submitted),"unapplied defaults are discarded on Back");
        menu.Open(defaults,false);Select(menu,9);Check(menu.Handle(MenuInput.Accept)==MenuAction.None&&menu.NoticeIsError,"unavailable storage cannot claim Apply");
        menu.SetWritable(true);Check(menu.Handle(MenuInput.Accept)==MenuAction.Apply,"service readiness restores Apply");
        menu.Open(defaults.With(quality:"max"),false);Select(menu,10);
        Check(menu.Handle(MenuInput.Accept)==MenuAction.None&&menu.Pending.Quality=="max"&&menu.NoticeIsError,"unavailable reset cannot change or save preferences");
        Check(HasText(menu.BuildFrame(1920,1080,null),"RESET UNAVAILABLE"),"unavailable recovery action is visibly disabled");
        menu.SetResetAvailable(true);Check(menu.Handle(MenuInput.Accept)==MenuAction.Reset&&menu.Pending.Same(defaults)&&!menu.CanApply,"bounded malformed-file recovery requests separate service action");
        menu.Close();Check(menu.Handle(MenuInput.Down)==MenuAction.None,"closed keyboard stays inactive");
    }
    private static void PointerTests()
    {
        var menu=new AcousticMenuModel();menu.Open(MenuPreferences.Defaults);var frame=menu.BuildFrame(1920,1080,MenuStatus.Unavailable("Host offline"));
        Click(menu,Region(frame,HitRegionKind.QualityChoice,0,4));Check(menu.Pending.Quality=="max","mouse selects Max target");
        Click(menu,Region(frame,HitRegionKind.AccelerationChoice,1,1));Check(menu.Pending.Acceleration=="cpu"&&menu.Pending.Quality=="max","mouse acceleration independent");
        Click(menu,Region(frame,HitRegionKind.Level,3,-1),.25f);Check(menu.Pending.OutputLevel==.25,"mouse output slider reaches actual preference");
        var before=menu.Pending;Click(menu,Region(frame,HitRegionKind.Row,7,-1));Check(menu.Pending.Same(before),"clicking unavailable reverb does not enable it");
        Check(Click(menu,Region(frame,HitRegionKind.Row,9,-1))==MenuAction.Apply,"mouse Apply dispatches action");
        int selected=menu.SelectedIndex;menu.Pointer(1,1,false,1);Check(menu.SelectedIndex!=selected,"wheel navigates bounded selection");
        menu.BuildFrame(800,600,null);frame=menu.BuildFrame(3440,1440,null);
        Click(menu,Region(frame,HitRegionKind.QualityChoice,0,2));Check(menu.Pending.Quality=="balanced","hit regions rebuild after resize");
        var fixedPointer=Region(frame,HitRegionKind.Row,4,-1);float px=fixedPointer.X+5,py=fixedPointer.Y+5;
        menu.Pointer(px,py,false,0);Select(menu,0);menu.Pointer(px,py,false,0);Check(menu.SelectedIndex==0,"stationary mouse does not override keyboard focus");
    }
    private static MenuStatus CpuFallback()
    {return MenuStatus.Measured("quality","quality","gpu","cpu","Illustrative supported GPU","GPU deadline exceeded",32,0,"Controlled fixture status; no live session",true,.6,false);}
    private static void StatusAndLayoutTests()
    {
        var menu=new AcousticMenuModel();menu.Open(MenuPreferences.Defaults.With(quality:"max",acceleration:"gpu"));
        var unavailable=menu.BuildFrame(1920,1080,MenuStatus.Unavailable("Host offline"));
        Check(HasText(unavailable,"backend unavailable"),"selection does not invent active GPU");
        Check(!MenuStatus.Measured("max","max","gpu","gpu","GPU","",64,0,"").Available,"zero dispatch proof cannot establish GPU");
        Check(!MenuStatus.Measured("max","max","gpu","gpu","GPU","",32,4,"").Available,"inconsistent active quality budget rejected");
        Check(!MenuStatus.Measured("performance","performance","cpu","cpu","CPU","",12,0,"",true,Double.NaN,true).Available,"invalid measured audio level rejected");
        Check(HasText(unavailable,"Active audio state unavailable"),"missing measurements cannot invent active audio preferences");
        menu.Handle(MenuInput.Right);var fallback=menu.BuildFrame(1920,1080,CpuFallback());
        Check(HasText(fallback,"CPU")&&HasText(fallback,"GPU deadline exceeded"),"actual fallback remains visible while edits are pending");
        Check(HasText(fallback,"Active: On / 60% / early Off")&&menu.Pending.OutputLevel==1&&menu.Pending.EarlyReflections,"active audio is distinct from pending preferences");
        Check(HasText(fallback,"experimental")&&HasText(fallback,"timing limits"),"unsafe high tiers clearly experimental");
        bool goldTitle=false;foreach(var c in fallback.Commands)if(c.Text=="RichAudio"&&c.Argb==unchecked((int)0xFFD4AF37))goldTitle=true;
        Check(goldTitle,"actual heading command uses metallic gold accent");
        foreach(int[] size in new[]{new[]{800,600},new[]{1280,720},new[]{1920,1080},new[]{3440,1440},new[]{3840,2160}}){
            var frame=menu.BuildFrame(size[0],size[1],CpuFallback());
            Check(frame.Commands.Count<=256&&frame.Regions.Count<=64,"bounded drawing/input frame");
            foreach(var c in frame.Commands){Check(c.X>=0&&c.Y>=0&&c.X<size[0]&&c.Y<size[1],"command origin inside viewport");
                if(c.Kind==DrawCommandKind.Rectangle)Check(c.X+c.Width<=size[0]+1&&c.Y+c.Height<=size[1]+1,"rectangle inside viewport");}
            foreach(var hit in frame.Regions)Check(hit.X>=0&&hit.Y>=0&&hit.X+hit.Width<=size[0]&&hit.Y+hit.Height<=size[1],"pointer bounds inside viewport");
        }
        menu.Close();var diagnostic=menu.BuildDiagnosticFrame(1920,1080,MenuStatus.Unavailable("No host"));
        Check(diagnostic.Regions.Count==0&&HasText(diagnostic,"unavailable"),"optional diagnostics never captures hidden gameplay input");
    }
    private static void Draw(MenuFrame frame,int width,int height,string output)
    {
        using(var image=new Bitmap(width,height,PixelFormat.Format32bppArgb))using(var g=Graphics.FromImage(image)){
            g.Clear(Color.FromArgb(15,23,30));g.TextRenderingHint=TextRenderingHint.AntiAliasGridFit;g.SmoothingMode=SmoothingMode.AntiAlias;
            foreach(var c in frame.Commands){using(var brush=new SolidBrush(Color.FromArgb(c.Argb))){
                if(c.Kind==DrawCommandKind.Rectangle)g.FillRectangle(brush,c.X,c.Y,c.Width,c.Height);
                else using(var font=new Font("Arial",c.FontSize,FontStyle.Regular,GraphicsUnit.Pixel)){
                    g.DrawString(c.Text,font,brush,c.X,c.Y,StringFormat.GenericTypographic);
                    if(c.Bold)g.DrawString(c.Text,font,brush,c.X+c.FontSize*.018f,c.Y,StringFormat.GenericTypographic);
                }
            }}
            using(var font=new Font("Arial",Math.Max(12,height/90f),FontStyle.Regular,GraphicsUnit.Pixel))using(var brush=new SolidBrush(Color.FromArgb(150,170,185)))
                g.DrawString("CONTROLLED DRAW-COMMAND PREVIEW\nIllustrative status. No GTA execution or compatibility claim.",font,brush,width*.58f,height*.08f);
            image.Save(output,ImageFormat.Png);
        }
    }
    private static void Previews(string root,string destination)
    {
        string prefix=Path.GetFullPath(Path.Combine(root,".local"))+Path.DirectorySeparatorChar,dest=Path.GetFullPath(destination);
        Check(dest.StartsWith(prefix,StringComparison.OrdinalIgnoreCase),"private preview destination");
        for(var d=new DirectoryInfo(dest);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked preview output rejected");
        if(File.Exists(dest)||Directory.Exists(dest))throw new IOException("Fresh preview output required");Directory.CreateDirectory(dest);
        var menu=new AcousticMenuModel();menu.Open(MenuPreferences.Defaults);
        for(int i=0;i<3;i++)menu.Handle(MenuInput.Right);menu.Handle(MenuInput.Down);menu.Handle(MenuInput.Right);menu.Handle(MenuInput.Right);
        Select(menu,3);for(int i=0;i<5;i++)menu.Handle(MenuInput.Left);Select(menu,0);
        foreach(int[] size in new[]{new[]{800,600},new[]{1280,720},new[]{1920,1080},new[]{3440,1440}}){
            var frame=menu.BuildFrame(size[0],size[1],CpuFallback());Draw(frame,size[0],size[1],Path.Combine(dest,"richaudio-menu-"+size[0]+"x"+size[1]+".png"));}
        var unavailable=menu.BuildFrame(1920,1080,MenuStatus.Unavailable("Host offline. Saved settings apply at configured startup."));
        Draw(unavailable,1920,1080,Path.Combine(dest,"richaudio-menu-unavailable.png"));
        var original=menu.BuildFrame(1920,1080,CpuFallback());
        var json=new JavaScriptSerializer{MaxJsonLength=262144};File.WriteAllText(Path.Combine(dest,"draw-commands.json"),json.Serialize(original.Commands));
        File.WriteAllText(Path.Combine(dest,"result.json"),json.Serialize(new Dictionary<string,object>{{"schemaVersion",1},{"checks",assertions},
            {"provenance","Software preview of actual menu drawing commands and illustrative status. Not an in-game screenshot."},
            {"gameLaunched",false},{"audioEndpointOpened",false},{"visibleWindowOpened",false},{"drawCommands",original.Commands.Count},
            {"hitRegions",original.Regions.Count},{"goldArgb","D4AF37"},{"resolutions",new[]{"800x600","1280x720","1920x1080","3440x1440"}}}));
        Console.WriteLine("PRIVATE controlled menu previews: "+dest);
    }
    public static int Main(string[] args)
    {
        try{
            if(args.Length!=2)throw new ArgumentException("Repository root and fresh private preview output required");
            ModelTests();PointerTests();StatusAndLayoutTests();
#if MENU_INPUT_TESTS
            assertions+=TestMenuInputRouter.Run();
#endif
#if MENU_STATUS_TESTS
            assertions+=TestHostMenuStatus.Run();
#endif
            Previews(args[0],args[1]);Console.WriteLine("PASS: "+assertions+" menu model, input, status and drawing checks; no game, endpoint or visible window.");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}
