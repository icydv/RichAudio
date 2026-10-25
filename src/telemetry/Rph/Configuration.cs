using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization;
using RichAudio.Telemetry;
namespace RichAudio.Rph
{
    [DataContract] public sealed class CaptureConfig
    {
        [DataMember] public bool StoryModeAcknowledged;
        [DataMember] public bool CaptureEnabled;
        [DataMember] public int SampleHz=20,SourceLimit=32,QueueCapacity=64,CensusLimit=128;
        [DataMember] public double AcquisitionBudgetMs=2;
        [DataMember] public bool ReadDrivetrain=true;
        [DataMember] public string OutputDirectory;
        public void Validate() {
            if(SampleHz<1||SampleHz>20||SourceLimit<1||SourceLimit>128||QueueCapacity<2||QueueCapacity>256||CensusLimit<SourceLimit||CensusLimit>1024||!Validity.Finite(AcquisitionBudgetMs)||AcquisitionBudgetMs<0.25||AcquisitionBudgetMs>10)throw new InvalidDataException("Configuration bounds exceeded");
            if(string.IsNullOrWhiteSpace(OutputDirectory)||!Path.IsPathRooted(OutputDirectory))throw new InvalidDataException("Use an absolute development capture path");
            string output=Path.GetFullPath(OutputDirectory).TrimEnd('\\');
            string home=Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            foreach(string root in new[]{AppDomain.CurrentDomain.BaseDirectory,Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName),Environment.GetEnvironmentVariable("RICHAUDIO_GAME_ROOT"),Path.Combine(home,@"Desktop\CodeWalker30_dev46"),Path.Combine(home,@"Downloads\6d0158-OpenRPF")}) {
                if(string.IsNullOrWhiteSpace(root))continue;
                string p=Path.GetFullPath(root).TrimEnd('\\');if(output.Equals(p,StringComparison.OrdinalIgnoreCase)||output.StartsWith(p+"\\",StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Capture output must be outside game/tool folders");
            }
            // Fail closed on reparse points: a lexical development path must not redirect into the game.
            for(var d=new DirectoryInfo(output);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Reparse-point output paths are unsupported");
        }
    }
}
