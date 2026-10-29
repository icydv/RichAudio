using System;
using System.IO;
using System.Threading;
using RichAudio.Beacon.Windows;

namespace RichAudio.Beacon.Tests
{
    public static class TestAudioHost
    {
        private static int checks;
        private static void Check(bool value,string text){checks++;if(!value)throw new Exception(text);}
        private static void Throws(Action action,string text){bool rejected=false;try{action();}catch(ArgumentException){rejected=true;}catch(InvalidDataException){rejected=true;}catch(EndOfStreamException){rejected=true;}Check(rejected,text);}
        public static unsafe int Main(string[] args)
        {
            try
            {
                if(args.Length==2&&(args[0]=="--owned-recorder-fixture"||args[0]=="--owned-recorder-outage-fixture"))
                {
                    using(var tap=new OwnedOutputTap(args[1])){
                        var deadline=System.Diagnostics.Stopwatch.StartNew();while(!tap.IsCapturing&&deadline.ElapsedMilliseconds<3000)Thread.Sleep(10);Check(tap.IsCapturing,"explicit recording active");
                        var exact=new float[1024];for(int j=0;j<1024;j++)exact[j]=(j%2==0?.125f:-.25f);
                        fixed(float* p=exact){for(int i=0;i<100;i++){tap.Commit(tap.Prepare(p,512,i*512,i*512+512));Thread.Sleep(args[0]=="--owned-recorder-outage-fixture"?10:2);}}
                    }
                    Console.WriteLine("PASS owned recorder HTTP fixture: 100 submitted post-gain blocks, no endpoint.");return 0;
                }
                if(args.Length==1&&args[0]=="--device-starvation")
                {
                    var starved=new PcmRing();var silence=new float[1024];for(int i=0;i<4;i++)starved.TryWrite(silence,512);
                    using(var sink=new WasapiOutput(starved,-1))
                    {
                        sink.Start();Check(sink.Ready.WaitOne(5000),"device ready");
                        var timeout=System.Diagnostics.Stopwatch.StartNew();while(sink.Error==null&&timeout.ElapsedMilliseconds<2000)Thread.Sleep(10);
                        Check(sink.Error!=null&&sink.Error.Contains("Producer starvation"),"actual device stops on first producer starvation");
                        Check(starved.UnderflowFrames>0&&starved.FirstUnderflowFrame==2048,"exact first missing device frame");
                        Check(starved.Peak==0,"silent failure injection");
                    }
                    Console.WriteLine("PASS: "+checks+" silent actual-device starvation assertions; no automatic restart.");return 0;
                }
                if(args.Length!=0)throw new ArgumentException("Unsupported test option");
                Check(HostProgram.BeaconFrequencyArguments(95,"harmonic",false)=="","default producer invocation preserved");
                Check(HostProgram.BeaconFrequencyArguments(600,"harmonic",false)==" --beacon-frequency-hz 600","owned frequency forwarded invariantly");
                foreach(double hz in new double[]{double.NaN,double.PositiveInfinity,0,19.9,2000.1})Throws(delegate{HostProgram.BeaconFrequencyArguments(hz,"harmonic",false);},"invalid frequency rejected before endpoint");
                Throws(delegate{HostProgram.BeaconFrequencyArguments(600,"pulse",false);},"custom pulse frequency out of scope");
                Throws(delegate{HostProgram.BeaconFrequencyArguments(600,"harmonic",true);},"WAV cannot masquerade as tuned beacon");
                Check(HostProgram.BeaconLevelArguments(.22,"harmonic",false)=="","default source level invocation preserved");
                Check(HostProgram.BeaconLevelArguments(.44,"harmonic",false)==" --beacon-level 0.44","source level forwarded invariantly");
                foreach(double level in new double[]{double.NaN,-.01,.51})Throws(delegate{HostProgram.BeaconLevelArguments(level,"harmonic",false);},"invalid source level rejected");
                Throws(delegate{HostProgram.BeaconLevelArguments(.44,"harmonic",true);},"WAV custom level rejected");
                // Deterministic baseline: accepted age 5 ms, encoding 10 ms, queue wait 20 ms.
                double legacyForwarded=5+20;
                double corrected=HostProgram.ObservationAgeAtWrite(1000,1035,1000);
                Check(legacyForwarded==25&&corrected==35,"callback time omitted by legacy formula, retained once by write age");
                Check(HostProgram.ObservationAgeAtWrite(1001,1000,1000)==0,"permitted negative age remains nonnegative on forwarding");
                Check(HostProgram.ObservationAgeAtWrite(1000,1251,1000)==251,"expired handoff remains expired, no clamping to limit");
                var ring=new PcmRing();var input=new float[1024];for(int i=0;i<512;i++){input[i*2]=.2f;input[i*2+1]=-.1f;}
                for(int i=0;i<PcmRing.Slots;i++)Check(ring.TryWrite(input,512),"ring accepts capacity");Check(!ring.TryWrite(input,512),"ring refuses overrun");Check(ring.Count==8,"count");
                var output=new float[1024];fixed(float* p=output){Check(ring.Fill(p,256,.1f)==256,"partial block read");}
                Check(ring.Count==8&&ring.TakeCredits()==0,"no premature slot release");Check(Math.Abs(output[0]-.02)<1e-7&&Math.Abs(output[1]+.01)<1e-7,"stereo gain");
                fixed(float* p=output){ring.Fill(p,256,.1f);}Check(ring.Count==7&&ring.TakeCredits()==1,"one slot credit");
                for(int i=0;i<7;i++)fixed(float* p=output){ring.Fill(p,512,0);}Check(ring.Count==0,"drained");Check(ring.UnderflowFrames==0,"no invented underrun");
                fixed(float* p=output){Check(ring.Fill(p,512,.1f)==0,"empty output silent");}Check(ring.UnderflowFrames==512,"actual underrun counted");Check(output[0]==0&&output[1023]==0,"silence filled");
                Throws(delegate{ring.TryWrite(new float[]{float.NaN,float.NaN},1);},"nonfinite PCM");Throws(delegate{ring.TryWrite(new float[]{2,0},1);},"excessive PCM");Throws(delegate{ring.TryWrite(input,513);},"oversized block");
                var h=new byte[16];h[0]=82;h[1]=65;h[2]=48;h[3]=55;h[8]=0;h[9]=2;Check(BlockProtocol.ValidateHeader(h,0)==512,"binary frame valid");h[4]=1;Throws(delegate{BlockProtocol.ValidateHeader(h,0);},"sequence rejects");h[4]=0;h[12]=1;Throws(delegate{BlockProtocol.ValidateHeader(h,0);},"flags reject");h[12]=0;h[8]=1;h[9]=2;Throws(delegate{BlockProtocol.ValidateHeader(h,0);},"frame overflow");h[0]=0;Throws(delegate{BlockProtocol.ValidateHeader(h,0);},"magic");
                Check(!BlockProtocol.ReadExact(new MemoryStream(new byte[0]),new byte[4],4),"clean EOF");Throws(delegate{BlockProtocol.ReadExact(new MemoryStream(new byte[3]),new byte[4],4);},"truncated frame");
                var concurrent=new PcmRing();var samples=new float[1024];int produced=0;Exception failure=null;
                var producer=new Thread(delegate(){try{while(produced<300){samples[0]=produced/1000f;if(concurrent.TryWrite(samples,512))produced++;else Thread.Yield();}}catch(Exception ex){failure=ex;}});producer.Start();
                int consumed=0;while(consumed<300){if(concurrent.Count==0){Thread.Yield();continue;}fixed(float* p=output){Check(concurrent.Fill(p,512,.25f)==512,"concurrent complete block");}Check(Math.Abs(output[0]-consumed/4000f)<1e-7,"concurrent sequence");consumed++;}producer.Join();Check(failure==null&&produced==300&&concurrent.UnderflowFrames==0,"SPSC stress");
                string root=Path.Combine(Path.GetTempPath(),"RichAudioHostTest-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
                try{Check(HostProgram.PrivateOutput(root,".local/fresh").StartsWith(root),"private path");Throws(delegate{HostProgram.PrivateOutput(root,"public");},"public path rejects");Directory.CreateDirectory(Path.Combine(root,".local","existing"));Throws(delegate{HostProgram.PrivateOutput(root,".local/existing");},"overwrite rejects");}finally{if(Path.GetDirectoryName(root)!=Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar))throw new Exception("test cleanup boundary");Directory.Delete(root,true);}
                var player=new WasapiOutput(new PcmRing(),-1);Throws(delegate{player.Volume=.9f;},"unsafe gain rejects");Throws(delegate{player.Volume=float.NaN;},"NaN gain rejects");player.Dispose();
                // The capture tap sees the exact post-gain samples already filled
                // for WASAPI; test uses managed memory and never opens a device.
                using(var tap=new OwnedOutputTap()){
                    tap.CaptureForTest("held-callback");int held;fixed(float* p=output){held=tap.Prepare(p,512,0,512);}tap.CaptureForTest(null);Check(!tap.Quiescent,"in-flight endpoint submission prevents false flush acknowledgement");tap.Commit(held);Check(tap.Quiescent&&tap.Peek()!=null,"commit publishes evidence before flush can complete");tap.Release();
                    tap.CaptureForTest("fixture");fixed(float* p=output){int slot=tap.Prepare(p,512,1024,1536);tap.Commit(slot);}
                    var recorded=tap.Peek();Check(recorded!=null&&recorded.SubmittedFrame==1024&&recorded.ConsumedFrame==1536,"owned PCM lineage");
                    for(int i=0;i<1024;i++)Check(BitConverter.ToInt32(BitConverter.GetBytes(recorded.Samples[i]),0)==BitConverter.ToInt32(BitConverter.GetBytes(output[i]),0),"exact post-gain float bits");tap.Release();
                    fixed(float* p=output){for(int i=0;i<OwnedOutputTap.Capacity;i++)tap.Commit(tap.Prepare(p,512,i*512,i*512+512));Check(tap.Prepare(p,512,99999,100511)==-1,"recorder overflow drops evidence without blocking audio");}
                    Check(tap.DroppedChunks==1&&tap.DroppedFrames==512,"capture gap counters");while(tap.Peek()!=null)tap.Release();
                    var watch=System.Diagnostics.Stopwatch.StartNew();fixed(float* p=output){for(int i=0;i<20000;i++){tap.Commit(tap.Prepare(p,512,i*512,i*512+512));tap.Release();}}
                    double captureMs=watch.Elapsed.TotalMilliseconds;tap.CaptureForTest(null);watch.Restart();fixed(float* p=output){for(int i=0;i<20000;i++)tap.Commit(tap.Prepare(p,512,i*512,i*512+512));}
                    Console.WriteLine("Owned recorder device-free callback: enabled "+(captureMs/20).ToString("F3",System.Globalization.CultureInfo.InvariantCulture)+" us/block; disabled "+(watch.Elapsed.TotalMilliseconds/20).ToString("F3",System.Globalization.CultureInfo.InvariantCulture)+" us/block; 20000 x 512 frames, exact float copy, no network/endpoint.");
                }
                player.Dispose(); bool lifecycleRejected=false;try{player.Start();}catch(InvalidOperationException){lifecycleRejected=true;}Check(lifecycleRejected,"disposed output cannot reopen endpoint");
                var capture=new LoopbackCapture(-1,1);capture.Dispose();capture.Dispose();lifecycleRejected=false;try{capture.Start();}catch(InvalidOperationException){lifecycleRejected=true;}Check(lifecycleRejected,"disposed capture cannot reopen endpoint");
                Throws(delegate{new WasapiOutput(null,-1);},"null ring rejects");
                Check(System.Runtime.InteropServices.Marshal.SizeOf(typeof(WaveFormat))==18,"public WAVEFORMATEX ABI size");
                Check(typeof(IAudioClock).GUID.ToString()=="cd63314f-3fba-4a1b-812c-ef96358728e7","Microsoft IAudioClock IID");
                Check(typeof(IMMDeviceCollection).GUID.ToString()=="0bd7a1be-7a1a-44db-8397-cc5392387b5e","Microsoft IMMDeviceCollection IID");
                ring.EndOfStream=true;fixed(float* p=output){ring.Fill(p,512,.1f);}Check(ring.EndSilenceFrames==512&&ring.UnderflowFrames==512,"known EOF silence distinct from starvation");
                var flags=System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.NonPublic;
                using(var unopened=new WasapiOutput(new PcmRing(),-1)){
                    unopened.Muted=false;typeof(HostProgram).GetField("output",flags).SetValue(null,unopened);
                    HostProgram.ListenerEnded(new RichAudio.Beacon.Transport.TransportResult{Outcome="failed",Stage="schema",Code="invalid-schema",Terminal=true});
                    Check(unopened.Muted,"terminal transport immediately mutes without opening endpoint");
                    Check((bool)typeof(HostProgram).GetField("stop",flags).GetValue(null),"terminal transport stops host");
                    Check(((string)typeof(HostProgram).GetField("producerError",flags).GetValue(null)).Contains("schema/invalid-schema"),"terminal status visible");
                    typeof(HostProgram).GetField("output",flags).SetValue(null,null);
                }
                Console.WriteLine("PASS: "+checks+" original host/ring/framing assertions; no audio endpoint opened.");return 0;
            }catch(Exception ex){Console.Error.WriteLine(ex);return 1;}
        }
    }
}
