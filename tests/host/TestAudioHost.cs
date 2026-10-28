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
