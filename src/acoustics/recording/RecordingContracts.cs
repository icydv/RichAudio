using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace RichAudio.Beacon.Windows.Recording
{
    // Integration facts supplied by the approval controller, never trusted JSON.
    public sealed class RecordingReadiness
    {
        public readonly bool FeatureEnabled,ExplicitUserStart,TelemetryQualified,HandoffQualified,LivePcmVerified,HumanListeningApproved,LoopbackExplicitlyApproved;
        // A first demonstration may be measured before its listening result is
        // known. This narrow internal capability does not approve that result or
        // turn on the production recording feature.
        public readonly bool FirstDemoMeasurement;
        internal readonly bool FixtureOnly;
        public RecordingReadiness(bool featureEnabled=false,bool explicitUserStart=false,bool telemetryQualified=false,bool handoffQualified=false,bool livePcmVerified=false,bool humanListeningApproved=false,bool loopbackExplicitlyApproved=false)
        {FeatureEnabled=featureEnabled;ExplicitUserStart=explicitUserStart;TelemetryQualified=telemetryQualified;HandoffQualified=handoffQualified;LivePcmVerified=livePcmVerified;HumanListeningApproved=humanListeningApproved;LoopbackExplicitlyApproved=loopbackExplicitlyApproved;}
        public bool CoreAllowed {get{return FirstDemoMeasurement&&ExplicitUserStart||FeatureEnabled&&ExplicitUserStart&&TelemetryQualified&&HandoffQualified&&LivePcmVerified&&HumanListeningApproved;}}
        private RecordingReadiness(bool fixture,bool explicitStart,bool loopback):this(false,explicitStart,false,false,false,false,loopback){FixtureOnly=fixture;FirstDemoMeasurement=true;}
        internal static RecordingReadiness FirstDemo(bool explicitPerRunStart,bool loopback,bool fixtureOnly)
        {if(!explicitPerRunStart||loopback&&!explicitPerRunStart)throw new InvalidOperationException("Explicit first-demo recording permission required");return new RecordingReadiness(fixtureOnly,true,loopback);}
        private RecordingReadiness(bool fixture,RecordingReadiness basis):this(basis.FeatureEnabled,basis.ExplicitUserStart,basis.TelemetryQualified,basis.HandoffQualified,basis.LivePcmVerified,basis.HumanListeningApproved,basis.LoopbackExplicitlyApproved){FixtureOnly=fixture;}
        internal static RecordingReadiness Fixture(){return new RecordingReadiness(true,new RecordingReadiness(true,true,true,true,true,true,false));}
    }
    public sealed class RecordingOptions
    {
        public readonly int Seconds;public readonly long MaximumBytes;
        public RecordingOptions(int seconds=120,long maximumBytes=134217728)
        {if(seconds<1||seconds>120||maximumBytes<1048576||maximumBytes>268435456)throw new ArgumentOutOfRangeException("Bounded recording options");Seconds=seconds;MaximumBytes=maximumBytes;}
    }
    public sealed class RecordingSnapshot
    {
        public readonly string State,Reason,RecordingId;public readonly long OwnedFrames,LoopbackFrames,Bytes;public readonly bool Complete,EndpointOpened;
        internal RecordingSnapshot(string state,string reason,string id,long owned,long loopback,long bytes,bool complete,bool endpoint)
        {State=state;Reason=reason;RecordingId=id;OwnedFrames=owned;LoopbackFrames=loopback;Bytes=bytes;Complete=complete;EndpointOpened=endpoint;}
    }
    // A measured two-way anchor bounds source-clock offset; no common origin is
    // inferred from a matching frequency, process name or UTC timestamp.
    public sealed class ClockAlignment
    {
        public readonly string SourceDomain;public readonly long SourceTick,SourceFrequency,HostBefore,HostAfter;
        public ClockAlignment(string domain,long sourceTick,long sourceFrequency,long hostBefore,long hostAfter)
        {if(String.IsNullOrEmpty(domain)||domain.Length>96||sourceFrequency<=0||hostBefore<0||hostAfter<hostBefore)throw new ArgumentException("Clock anchor");SourceDomain=domain;SourceTick=sourceTick;SourceFrequency=sourceFrequency;HostBefore=hostBefore;HostAfter=hostAfter;}
        public double HostTicks(long sourceTick){return HostBefore+(HostAfter-HostBefore)/2d+(sourceTick-SourceTick)*(double)Stopwatch.Frequency/SourceFrequency;}
        public double MinimumUncertaintyMs {get{return (HostAfter-HostBefore)*500d/Stopwatch.Frequency;}}
    }
    internal sealed class LosslessWaveWriter:IDisposable
    {
        readonly Stream stream;readonly BinaryWriter writer;readonly int blockAlign;readonly long dataOffset,sizeOffset,factOffset;long bytes;bool closed;
        internal readonly int Rate,Channels;internal long Frames {get{return bytes/blockAlign;}}
        internal static byte[] FloatStereo(){return new byte[]{3,0,2,0,128,187,0,0,0,220,5,0,8,0,32,0,0,0};}
        internal LosslessWaveWriter(Stream output,byte[] format)
        {
            if(output==null||!output.CanWrite||!output.CanSeek||format==null||format.Length<18||format.Length>64)throw new ArgumentException("Seekable WAV stream and bounded WAVEFORMATEX required");
            int tag=BitConverter.ToUInt16(format,0),bits=BitConverter.ToUInt16(format,14),extra=BitConverter.ToUInt16(format,16);
            Channels=BitConverter.ToUInt16(format,2);Rate=(int)BitConverter.ToUInt32(format,4);blockAlign=BitConverter.ToUInt16(format,12);
            if(format.Length!=18+extra||Channels<1||Channels>8||Rate<8000||Rate>192000||blockAlign!=Channels*bits/8||BitConverter.ToUInt32(format,8)!=(uint)(Rate*blockAlign))throw new InvalidDataException("WAV format contract");
            int codec=tag;
            if(tag==65534){if(extra!=22)throw new InvalidDataException("Extensible WAV format");var guidBytes=new byte[16];Buffer.BlockCopy(format,24,guidBytes,0,16);var guid=new Guid(guidBytes);if(guid==new Guid("00000001-0000-0010-8000-00aa00389b71"))codec=1;else if(guid==new Guid("00000003-0000-0010-8000-00aa00389b71"))codec=3;else throw new NotSupportedException("Unsupported mix codec");}
            if(!(codec==3&&bits==32||codec==1&&(bits==16||bits==24||bits==32)))throw new NotSupportedException("Lossless PCM/float mix only");
            stream=output;writer=new BinaryWriter(stream,Encoding.ASCII);
            writer.Write(Encoding.ASCII.GetBytes("RIFF"));writer.Write(0u);writer.Write(Encoding.ASCII.GetBytes("WAVEfmt "));writer.Write((uint)format.Length);writer.Write(format);
            writer.Write(Encoding.ASCII.GetBytes("fact"));writer.Write(4u);factOffset=stream.Position;writer.Write(0u);
            writer.Write(Encoding.ASCII.GetBytes("data"));sizeOffset=stream.Position;writer.Write(0u);dataOffset=stream.Position;
        }
        internal void Write(byte[] data,int count){if(closed||count<0||count>data.Length||count%blockAlign!=0||bytes+count>UInt32.MaxValue-128)throw new InvalidDataException("WAV data bound");writer.Write(data,0,count);bytes+=count;}
        internal void FlushHeader(){writer.Flush();if((bytes&1)!=0&&stream.Position==dataOffset+bytes)writer.Write((byte)0);long end=stream.Position;stream.Position=4;writer.Write(checked((uint)(dataOffset+bytes+(bytes&1)-8)));stream.Position=factOffset;writer.Write(checked((uint)Frames));stream.Position=sizeOffset;writer.Write(checked((uint)bytes));stream.Position=end;writer.Flush();var file=stream as FileStream;if(file!=null)file.Flush(true);else stream.Flush();}
        public void Dispose(){if(closed)return;try{FlushHeader();}finally{closed=true;writer.Dispose();}}
    }
}
