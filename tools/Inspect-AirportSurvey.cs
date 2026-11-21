// Read-only local input inspection. Writes a fresh private snapshot, never game files.
using System;using System.IO;using RichAudio.AirportResearch;using RichAudio.BatiResearch;
public static class InspectAirportSurvey
{
 public static int Main(string[] args)
 {
  if(args.Length!=4){Console.Error.WriteLine("Expected explicit marker file, SHA256, historical session and new private output file.");return 2;}
  try{var markers=MarkerSet.Load(args[0],args[1],3,args[2],"runtime-observation");var survey=new Survey(markers,"offline-input-check");SurveyPersistence.Save(args[3],survey.Snapshot());Console.WriteLine("PASS: original revision-3 runtime markers validated unchanged; no route certification, game API or deployment.");return 0;}catch(Exception e){Console.Error.WriteLine(e.GetType().Name+": "+e.Message);return 1;}
 }
}
