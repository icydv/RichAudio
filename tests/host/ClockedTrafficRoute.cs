using System;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;

// Private authored observations for the normal clocked producer.
internal sealed class ClockedTrafficRoute {
 public sealed class Vehicle {
  public int Track {get;set;}
  public string Id {get;set;}
  public int Generation {get;set;}
  public uint Model {get;set;}
  public string Context {get;set;}
  public double[] Position {get;set;}
  public double[] Velocity {get;set;}
  public double[] Forward {get;set;}
  public double[] Up {get;set;}
  public double OperatingPoint {get;set;}
  public bool Running {get;set;}
  public bool Valid {get;set;}
 }
 public sealed class Frame {
  public double[] Forward {get;set;}
  public Vehicle[] Vehicles {get;set;}
 }
 public string Route {get;set;}
 public int StepMs {get;set;}
 public int Seconds {get;set;}
 public Frame[] Frames {get;set;}
 public static ClockedTrafficRoute Load(string file){
  return new JavaScriptSerializer{MaxJsonLength=16*1024*1024}.Deserialize<ClockedTrafficRoute>(File.ReadAllText(file));
 }
 public Frame At(double time){
  int index=(int)(Math.Max(0,Math.Min(Seconds,time))*1000/StepMs);
  return Frames[index];
 }
 public static GameplayVehicle[] VehiclesAt(Frame frame,long now,int limit,bool hold){
  var vehicles=new List<GameplayVehicle>(limit);
  foreach(var v in frame.Vehicles)if(v.Track<limit){
   vehicles.Add(new GameplayVehicle{Id=v.Id,Generation=v.Generation,ObservationTicks=now,Model=v.Model,Context=v.Context,
    Position=v.Position,Velocity=hold?new double[3]:v.Velocity,Forward=v.Forward,Up=v.Up,
    OperatingPoint=v.OperatingPoint,Running=v.Running,Valid=v.Valid});
  }
  return vehicles.ToArray();
 }
}
