// SDK-independent immutable menu data. No file, game, audio or graphics device IO.
using System;
using System.Collections.ObjectModel;

namespace RichAudio.Settings.InGame
{
    public enum MenuInput { Up, Down, Left, Right, Accept, Back }
    public enum MenuAction { None, Apply, Close, Reset, StartRecording, StopRecording }
    public enum DrawCommandKind { Rectangle, Text }
    public enum HitRegionKind { Row, QualityChoice, AccelerationChoice, Level }

    public sealed class MenuPreferences
    {
        public readonly string Quality, Acceleration;
        public readonly bool Enabled, EarlyReflections, DiagnosticsOverlay;
        public readonly double OutputLevel;
        public static readonly string[] Qualities={"auto","performance","balanced","quality","max"};
        public static readonly string[] Accelerations={"auto","cpu","gpu"};
        public static MenuPreferences Defaults {get{return new MenuPreferences("auto","auto");}}
        public MenuPreferences(string quality,string acceleration,bool enabled=true,double outputLevel=1,
            bool earlyReflections=true,bool diagnosticsOverlay=false)
        {
            if(Array.IndexOf(Qualities,quality)<0||Array.IndexOf(Accelerations,acceleration)<0||
                Double.IsNaN(outputLevel)||Double.IsInfinity(outputLevel)||outputLevel<0||outputLevel>1)
                throw new ArgumentException("Validated menu preferences required");
            Quality=quality;Acceleration=acceleration;Enabled=enabled;OutputLevel=outputLevel;
            EarlyReflections=earlyReflections;DiagnosticsOverlay=diagnosticsOverlay;
        }
        public MenuPreferences With(string quality=null,string acceleration=null,bool? enabled=null,double? outputLevel=null,
            bool? earlyReflections=null,bool? diagnosticsOverlay=null)
        {return new MenuPreferences(quality??Quality,acceleration??Acceleration,enabled??Enabled,outputLevel??OutputLevel,
            earlyReflections??EarlyReflections,diagnosticsOverlay??DiagnosticsOverlay);}
        public bool Same(MenuPreferences other)
        {return other!=null&&Quality==other.Quality&&Acceleration==other.Acceleration&&Enabled==other.Enabled&&
            OutputLevel==other.OutputLevel&&EarlyReflections==other.EarlyReflections&&DiagnosticsOverlay==other.DiagnosticsOverlay;}
    }

    public sealed class MenuStatus
    {
        public readonly bool Available;
        public readonly string RequestedQuality,ActiveQuality,RequestedAcceleration,ActiveAcceleration,Device,FallbackReason,Detail;
        public readonly int PathBudget;
        public readonly long GpuResultsApplied;
        public readonly bool? ActiveOutputEnabled,ActiveEarlyReflections;
        public readonly double? ActiveOutputLevel;
        private static string Bounded(string value,int length)
        {if(String.IsNullOrEmpty(value))return "";value=value.Replace('\r',' ').Replace('\n',' ');return value.Length>length?value.Substring(0,length):value;}
        private MenuStatus(bool available,string requestedQuality,string activeQuality,string requestedAcceleration,
            string activeAcceleration,string device,string fallbackReason,int pathBudget,long gpuResultsApplied,string detail,
            bool? outputEnabled=null,double? outputLevel=null,bool? earlyReflections=null)
        {
            Available=available;RequestedQuality=Bounded(requestedQuality,24);ActiveQuality=Bounded(activeQuality,24);
            RequestedAcceleration=Bounded(requestedAcceleration,12);ActiveAcceleration=Bounded(activeAcceleration,12);
            Device=Bounded(device,128);FallbackReason=Bounded(fallbackReason,180);PathBudget=pathBudget;
            GpuResultsApplied=gpuResultsApplied;Detail=Bounded(detail,260);
            ActiveOutputEnabled=outputEnabled;ActiveOutputLevel=outputLevel;ActiveEarlyReflections=earlyReflections;
        }
        public static MenuStatus Unavailable(string reason)
        {return new MenuStatus(false,"","","","","","",0,0,String.IsNullOrEmpty(reason)?"Host status unavailable":reason);}
        public static MenuStatus Measured(string requestedQuality,string activeQuality,string requestedAcceleration,string activeAcceleration,
            string device,string fallbackReason,int pathBudget,long gpuResultsApplied,string detail,
            bool? outputEnabled=null,double? outputLevel=null,bool? earlyReflections=null)
        {
            int activeIndex=Array.IndexOf(MenuPreferences.Qualities,activeQuality);
            if(Array.IndexOf(MenuPreferences.Qualities,requestedQuality)<0||Array.IndexOf(MenuPreferences.Qualities,activeQuality)<1||
                Array.IndexOf(MenuPreferences.Accelerations,requestedAcceleration)<0||
                (activeAcceleration!="cpu"&&activeAcceleration!="gpu")||pathBudget<1||pathBudget>64||gpuResultsApplied<0||
                (activeAcceleration=="gpu"&&gpuResultsApplied==0))return Unavailable("Active backend not established by measured host status");
            int[] budgets={0,12,16,32,64};if(pathBudget!=budgets[activeIndex])return Unavailable("Active quality and path budget disagree");
            if(outputLevel.HasValue&&(Double.IsNaN(outputLevel.Value)||Double.IsInfinity(outputLevel.Value)||outputLevel.Value<0||outputLevel.Value>1))
                return Unavailable("Active output level is invalid");
            return new MenuStatus(true,requestedQuality,activeQuality,requestedAcceleration,activeAcceleration,device,
                fallbackReason,pathBudget,gpuResultsApplied,detail,outputEnabled,outputLevel,earlyReflections);
        }
    }

    public sealed class DrawCommand
    {
        public readonly DrawCommandKind Kind;
        public readonly float X,Y,Width,Height,FontSize;
        public readonly int Argb;
        public readonly string Text;
        public readonly bool Bold;
        public DrawCommand(DrawCommandKind kind,float x,float y,float width,float height,int argb,string text=null,float fontSize=0,bool bold=false)
        {Kind=kind;X=x;Y=y;Width=width;Height=height;Argb=argb;Text=text??"";FontSize=fontSize;Bold=bold;}
    }
    public sealed class HitRegion
    {
        public readonly HitRegionKind Kind;
        public readonly int RowIndex,ValueIndex;
        public readonly float X,Y,Width,Height;
        public HitRegion(HitRegionKind kind,int rowIndex,int valueIndex,float x,float y,float width,float height)
        {Kind=kind;RowIndex=rowIndex;ValueIndex=valueIndex;X=x;Y=y;Width=width;Height=height;}
        public bool Contains(float x,float y){return x>=X&&y>=Y&&x<X+Width&&y<Y+Height;}
    }
    public sealed class MenuFrame
    {
        public readonly ReadOnlyCollection<DrawCommand> Commands;
        public readonly ReadOnlyCollection<HitRegion> Regions;
        public MenuFrame(DrawCommand[] commands,HitRegion[] regions)
        {
            if(commands.Length>256||regions.Length>64)throw new InvalidOperationException("Bounded menu frame required");
            Commands=Array.AsReadOnly((DrawCommand[])commands.Clone());Regions=Array.AsReadOnly((HitRegion[])regions.Clone());
        }
    }
}
