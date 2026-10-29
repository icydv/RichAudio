#if GEOMETRY_LIVE
using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using RichAudio.GeometryLive;
namespace RichAudio.Beacon.Windows
{
    public static partial class HostProgram
    {
        private static GeometryModel LoadGeometryModel(string root,string path)
        {
            string full=Path.GetFullPath(path),prefix=Path.GetFullPath(Path.Combine(root,".local"))+Path.DirectorySeparatorChar;
            if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase)||new FileInfo(full).Length>8192)throw new ArgumentException("Bounded private geometry model file required");
            for(var d=new DirectoryInfo(Path.GetDirectoryName(full));d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked model rejected");
            if((File.GetAttributes(full)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked model rejected");
            return GeometryModel.Parse(File.ReadAllText(full));
        }
        // Device-free integration attaches the SAME host queue, writer, stderr
        // decoder, listener callback and relay without entering Main/Run/WASAPI.
#if GEOMETRY_FIXTURE
        internal static Action BeforeFixtureStage;
        private static Thread fixtureDiagnostics;
        internal static void BeginGeometryFixture(Process producer,GeometryModel model,Func<uint> peer,string pipeName)
        {
            child=producer;stop=false;inputStop=false;geometryRelay=new GeometryHostRelay(delegate(string text){
                if(text.StartsWith("{\"type\":\"geometry-relay-stage\"",StringComparison.Ordinal)&&BeforeFixtureStage!=null)BeforeFixtureStage();Send(text);},peer,model,pipeName);
            inputWriter=new Thread(WriteControls){IsBackground=true};inputWriter.Start();
            fixtureDiagnostics=new Thread(ReadDiagnostics){IsBackground=true};fixtureDiagnostics.Start();geometryRelay.Start();
        }
        internal static void GeometryFixtureSend(string text){Send(text);}
        internal static string[] GeometryFixtureDiagnostics(){lock(logLock)return rendererLog.ToArray();}
        internal static void GeometryFixtureDrainDiagnostics(){fixtureDiagnostics.Join(1000);}
        internal static System.Collections.Generic.Dictionary<string,object> EndGeometryFixture()
        {
            geometryRelay.Dispose();var result=geometryRelay.Metrics();SendControl("stop");
            if(!child.WaitForExit(2500)){child.Kill();child.WaitForExit(1000);throw new TimeoutException("fixture producer shutdown");}
            inputStop=true;inputSignal.Set();inputWriter.Join(1000);return result;
        }
#endif
    }
}
#endif
