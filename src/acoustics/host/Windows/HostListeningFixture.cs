// Test-only entry to the actual Run/transport/relay/producer/renderer path.
// The unstarted WasapiOutput remains the gain/mute authority. A bounded paced
// consumer fills the SAME PcmRing and recorder tap without opening an endpoint.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace RichAudio.Beacon.Windows
{
    public static partial class HostProgram
    {
        private static bool listeningFixture=false;
        private static string listeningGeometryPipe=null;
        private static FileStream fixturePreHost,fixturePostHost;
        private static readonly object fixtureCaptureLock=new object();
        private static long fixtureSinkBegin,fixtureSinkNext,fixtureSinkFrames,fixturePreHostFrames,fixtureMissedBudgets,fixtureLastSubmissionQpc;
        private static double fixtureMaximumLatenessMs;
        private static readonly float[] fixtureSinkSamples=new float[PcmRing.MaximumFrames*2];
        private static readonly byte[] fixtureSinkBytes=new byte[PcmRing.MaximumFrames*8];

        internal static int RunListeningFixture(string root,string directory,string listenerPipe,string geometryPipe,string modelPath,string soundMapConfig)
        {
#if GEOMETRY_LIVE
            if(!System.Reflection.Assembly.GetExecutingAssembly().GetName().Name.EndsWith(".Tests",StringComparison.Ordinal))throw new InvalidOperationException("Test assembly only");
            if(listeningFixture)throw new InvalidOperationException("One actual host fixture per process");
            string full=Path.GetFullPath(directory),local=Path.GetFullPath(Path.Combine(root,".local"))+Path.DirectorySeparatorChar;
            if(!full.StartsWith(local,StringComparison.OrdinalIgnoreCase))throw new ArgumentException("Private fixture directory required");
            if(string.IsNullOrEmpty(listenerPipe)||string.IsNullOrEmpty(geometryPipe))throw new ArgumentException("Dedicated fixture pipes required");
            Directory.CreateDirectory(full);
            fixturePreHost=new FileStream(Path.Combine(full,"pre-host.f32le"),FileMode.CreateNew,FileAccess.Write,FileShare.Read);
            fixturePostHost=new FileStream(Path.Combine(full,"post-host.f32le"),FileMode.CreateNew,FileAccess.Write,FileShare.Read);
            var settings=new AcousticSettings("balanced","auto",1);
            string settingsPath=Path.Combine(full,"acoustic-settings.json");
            File.WriteAllText(settingsPath,settings.Serialize());
            listeningGeometryPipe=geometryPipe;listeningFixture=true;auditionOutputEnabled=true;
            return Run(root,"open-road","harmonic",1,12,.20f,-1,false,false,false,true,null,full,600,.44,modelPath,
                settings,settingsPath,soundMapConfig,
                AuditionArguments(12,"open-road","harmonic",1,600,.44,.20f,true,true,false,false),listenerPipe);
#else
            throw new NotSupportedException("Actual listening fixture requires geometry-enabled build");
#endif
        }
        internal static void ListeningFixtureControl(string command)
        {
            if(!listeningFixture)throw new InvalidOperationException("Listening fixture not running");
            if(command!="start"&&command!="emit-stop"&&command!="stop"&&command!="mute"&&command!="resume")throw new ArgumentException("Existing owned control only");
            Control(command);
        }
        internal static string[] ListeningFixtureDiagnostics(){lock(logLock)return rendererLog.ToArray();}
        private static string ListeningFixtureArguments(){return listeningFixture?" --trace-blocks yes --history-diagnostics yes":"";}
        private static string ListeningFixtureGeometryPipe(){return listeningGeometryPipe??"RichAudio.Acoustics081.Geometry.v1";}
        private static void CaptureListeningFixturePreHost(byte[] payload,int frames)
        {
            if(!listeningFixture)return;
            lock(fixtureCaptureLock){if(fixturePreHost!=null){fixturePreHost.Write(payload,0,frames*8);fixturePreHostFrames+=frames;}}
        }
        private static unsafe void ConsumeListeningFixture(PcmRing ring,OwnedOutputTap recorder)
        {
            if(!listeningFixture||stop)return;
            long now=Stopwatch.GetTimestamp();
            if(fixtureSinkBegin==0){if(ring.Count<4)return;fixtureSinkBegin=now;fixtureSinkNext=now;}
            // Windows may round the host's 2 ms sleep to a scheduler quantum.
            // Consume every block due on the same 48 kHz clock, within the
            // existing four-block prefill; never slow the PCM timeline to the
            // number of main-loop wakeups or wait for ring.Count to catch up.
            int due=0;
            while(!stop&&now>=fixtureSinkNext){
            if(++due>4){RecordFailure("device-free-sink-clock","Paced consumer exceeded four-block catch-up bound");return;}
            double late=(now-fixtureSinkNext)*1000.0/Stopwatch.Frequency;
            fixtureMaximumLatenessMs=Math.Max(fixtureMaximumLatenessMs,late);if(late>512/48.0)fixtureMissedBudgets++;
            long underflow=ring.UnderflowFrames,endSilence=ring.EndSilenceFrames,producerStart=ring.ConsumedFrames-underflow-endSilence;
            int supplied,capture=-1;
            fixtureLastSubmissionQpc=Stopwatch.GetTimestamp();
            fixed(float* p=fixtureSinkSamples){
                supplied=ring.Fill(p,512,output.Muted?0:output.Volume);
                if(recorder!=null)capture=recorder.Prepare(p,512,fixtureSinkFrames,ring.ConsumedFrames,producerStart,supplied,
                    ring.UnderflowFrames-underflow,ring.EndSilenceFrames-endSilence);
            }
            if(recorder!=null)recorder.Commit(capture);
            Buffer.BlockCopy(fixtureSinkSamples,0,fixtureSinkBytes,0,fixtureSinkBytes.Length);
            fixturePostHost.Write(fixtureSinkBytes,0,fixtureSinkBytes.Length);
            fixtureSinkFrames+=512;fixtureSinkNext=fixtureSinkBegin+(long)(fixtureSinkFrames*Stopwatch.Frequency/48000.0);
            if(ring.UnderflowFrames>0)RecordFailure("device-free-sink","Producer starvation in paced actual PCM ring; no automatic resume");
            if(producerError!=null)return;
            now=Stopwatch.GetTimestamp();
            }
        }
        private static void CloseListeningFixture()
        {
            if(!listeningFixture)return;
            lock(fixtureCaptureLock){if(fixturePreHost!=null){fixturePreHost.Dispose();fixturePreHost=null;}}
            if(fixturePostHost!=null){fixturePostHost.Dispose();fixturePostHost=null;}
        }
        private static Dictionary<string,object> ListeningFixtureMetrics(PcmRing ring)
        {
            return new Dictionary<string,object>{{"endpointOpened",false},{"rate",48000},{"channels",2},{"gain",.20},
                {"frames",fixtureSinkFrames},{"preHostFrames",fixturePreHostFrames},{"peak",ring.Peak},
                {"rms",ring.ConsumedFrames>0?Math.Sqrt(ring.SumSquares/(ring.ConsumedFrames*2)):0},
                {"underflowFrames",ring.UnderflowFrames},{"firstUnderflowFrame",ring.FirstUnderflowFrame},
                {"missedSinkBudgets",fixtureMissedBudgets},{"maximumLatenessMs",fixtureMaximumLatenessMs},
                {"lastSubmissionQpcTicks",fixtureLastSubmissionQpc},{"qpcFrequency",Stopwatch.Frequency},
                {"sink","actual PcmRing.Fill and OwnedOutputTap, paced device-free consumer; not WASAPI timing proof"}};
        }
    }
}
