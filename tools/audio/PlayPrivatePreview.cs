// Local-only, explicit user-authorised preview. No network or game integration.
using System;
using System.IO;
using System.Media;
class PlayPrivatePreview {
 static int Main(string[] args) {
  try {
   if(args.Length!=1)throw new Exception("One private WAV path required");
   var p=Path.GetFullPath(args[0]);
   if(p.StartsWith("\\\\") || Path.GetExtension(p).ToLowerInvariant()!=".wav")throw new Exception("Local WAV only");
   if(Array.IndexOf(p.Split(Path.DirectorySeparatorChar),".local")<0)throw new Exception("Private local file required");
   var f=new FileInfo(p);if(f.Length<44||f.Length>8*1024*1024)throw new Exception("Preview size bound");
   using(var r=new BinaryReader(File.OpenRead(p))) {
    if(new string(r.ReadChars(4))!="RIFF")throw new Exception("Not RIFF");
    r.BaseStream.Position=20;if(r.ReadUInt16()!=1)throw new Exception("PCM only");
    var channels=r.ReadUInt16();var rate=r.ReadUInt32();r.BaseStream.Position=40;var bytes=r.ReadUInt32();
    if(channels<1||channels>2||rate<8000||rate>96000||bytes/(double)(rate*channels*2)>30)throw new Exception("Preview layout/duration bound");
   }
   using(var s=new SoundPlayer(p)){s.Load();s.PlaySync();}
   Console.WriteLine("Local playback completed; this is not human listening confirmation.");return 0;
  } catch(Exception e){Console.Error.WriteLine(e.GetType().Name+": "+e.Message);return 1;}
 }
}
