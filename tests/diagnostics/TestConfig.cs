using System;
using System.IO;
using RichAudio.Rph;
public static class TestConfig {
 static int checks;
 static void Accept(string path){new CaptureConfig{OutputDirectory=path}.Validate();checks++;}
 static void Reject(string path){try{new CaptureConfig{OutputDirectory=path}.Validate();}catch(InvalidDataException){checks++;return;}throw new Exception("Expected output rejection");}
 public static int Main(string[] args){
  string root=Path.GetFullPath(args[0]);string before=Environment.GetEnvironmentVariable("RICHAUDIO_GAME_ROOT");
  try{
   Reject("");Reject("relative-captures");Accept(Path.Combine(root,"capture"));
   Reject(AppDomain.CurrentDomain.BaseDirectory);
   string game=Path.Combine(root,"authored-game");Environment.SetEnvironmentVariable("RICHAUDIO_GAME_ROOT",game);
   Reject(game);Reject(Path.Combine(game,"capture"));Accept(game+"-sibling");
   string home=Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
   Reject(Path.Combine(home,@"Desktop\CodeWalker30_dev46\capture"));
   Reject(Path.Combine(home,@"Downloads\6d0158-OpenRPF\capture"));
   Console.WriteLine("PASS: "+checks+" configuration boundary assertions; actual configuration class, no game APIs.");return checks==9?0:1;
  }finally{Environment.SetEnvironmentVariable("RICHAUDIO_GAME_ROOT",before);}
 }
}
