// Executes the production host serializer and persistent settings roundtrip.
// No GameplayHost instance, audio endpoint or game process is constructed.
using System;using RichAudio.Beacon.Windows;
internal static class TestStreetSettingsWire01 {
 public static int Main(string[] args){try{
  string root=args[0],file=AcousticSettingsStore.DefaultPath(root);
  var original=new AcousticSettings("balanced","cpu",1,true,1,true,false,"experimental-additive",false,"F10",true,.4);
  AcousticSettingsStore.Save(root,file,original);var loaded=AcousticSettingsStore.Load(root,file);
  if(!loaded.SamePreferences(original))throw new Exception("persistent preference mismatch");
  Console.WriteLine(GameplayHost.SettingsCommand(loaded,false));
  Console.WriteLine(GameplayHost.SettingsCommand(loaded,true));return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
