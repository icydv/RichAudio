// Original authored bootstrap container writer. Never opens an installation.
// The inverse of CodeWalker by dexyfex's GenerateMagicData is used only for tests.
using System;
using System.IO;
using System.IO.Compression;
using CodeWalker.GameFiles;
public static class CodeWalkerBootstrapFixture09 {
 public static int Main(string[] args) {
  if(args.Length!=4)throw new ArgumentException("exact original state/AES/output/mode required");
  byte[] state=File.ReadAllBytes(args[0]),key=File.ReadAllBytes(args[1]);
  if(state.Length!=306256||key.Length!=32)throw new ArgumentException("original input sizes");
  int size=args[3]=="short"?306271:args[3]=="excess"?306273:args[3]=="bomb"?2097152:306272;
  byte[] payload=new byte[size];Buffer.BlockCopy(state,0,payload,0,Math.Min(state.Length,size));
  byte[] compressed;
  using(var memory=new MemoryStream()) {using(var deflate=new DeflateStream(memory,CompressionMode.Compress,true))deflate.Write(payload,0,payload.Length);compressed=memory.ToArray();}
  var encrypted=GTACrypto.EncryptAESData(compressed,key);var random=new Random(unchecked((int)JenkHash.GenHash(key)));var add=new byte[4][];
  for(int r=0;r<4;r++){add[r]=new byte[encrypted.Length];random.NextBytes(add[r]);}
  for(int i=0;i<encrypted.Length;i++)encrypted[i]=unchecked((byte)(encrypted[i]+add[0][i]+add[1][i]+add[2][i]+add[3][i]));
  using(var output=new FileStream(args[2],FileMode.CreateNew,FileAccess.Write))output.Write(encrypted,0,encrypted.Length);
  // Positive memory initialization and an independent state-byte control.
  if(args[3]=="valid") {GTA5Keys.InitializeFromRichAudio09(encrypted,key);for(int i=0;i<101;i++)for(int j=0;j<272;j++)if(GTA5Keys.PC_NG_KEYS[i][j]!=state[i*272+j])throw new Exception("NG schedule control failed");for(int i=0;i<256;i++)if(GTA5Hash.LUT[i]!=state[306000+i])throw new Exception("hash LUT refresh failed");}
  Array.Clear(state,0,state.Length);Array.Clear(key,0,key.Length);Array.Clear(payload,0,payload.Length);return 0;
 }
}
