// Authored RPH ABI stand-in. The exact candidate is compiled against the retained SDK, never this file.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Threading;
namespace Rage {
 public struct Vector3 {public float X,Y,Z;}
 public struct PoolHandle {public uint Value{get;set;} public uint Index{get;set;} public byte Counter{get;set;}}
 public struct Model {public uint Hash{get;set;}}
 public interface IHandleable {}
 public class Entity:IHandleable {
  public PoolHandle Handle {get;set;} public IntPtr MemoryAddress{get;set;} public Model Model{get;set;}
  public bool IsValid(){return true;}
 }
 public sealed class Ped:Entity {public Vehicle CurrentVehicle{get;set;}}
 public sealed class Vehicle:Entity {}
 public sealed class Player {public Ped Character{get;set;}}
 public sealed class GameConsole {
  public string Last;
  public readonly List<string> Lines=new List<string>();
  public void Print(string s){Last=s;Lines.Add(s);System.Console.WriteLine(s);}
 }
 public static class Game {
  public static bool IsLoading{get;set;} public static bool IsPaused{get;set;}
  public static Player LocalPlayer{get;set;}
  public static GameConsole Console{get;private set;}
  public static string LastLog;
  static readonly Dictionary<string,MethodInfo> commands=new Dictionary<string,MethodInfo>(StringComparer.OrdinalIgnoreCase);
  // This fixture models only the public signatures exercised by this candidate.
  public static void AddConsoleCommands(params MethodInfo[] methods){
   foreach(var method in methods){
    var command=(Attributes.ConsoleCommandAttribute)Attribute.GetCustomAttribute(method,typeof(Attributes.ConsoleCommandAttribute));
    var parameters=method.GetParameters();
    bool supported=parameters.Length==0||parameters.Length==2&&parameters[0].ParameterType==typeof(string)&&parameters[1].ParameterType==typeof(int);
    if(command==null||String.IsNullOrEmpty(command.Name)||!method.IsPublic||!method.IsStatic||method.ContainsGenericParameters||
       method.ReturnType!=typeof(void)||!supported)throw new ArgumentException("Unsupported console method: "+method.Name);
    commands.Add(command.Name,method);
   }
  }
  public static int CommandCount{get{return commands.Count;}}
  public static void Dispatch(string line){
   var tokens=line.Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries);
   MethodInfo method;
   if(tokens.Length==0||!commands.TryGetValue(tokens[0],out method))throw new InvalidOperationException("Unknown command");
   var parameters=method.GetParameters();
   if(tokens.Length!=parameters.Length+1)throw new ArgumentException("Console argument count");
   if(parameters.Length==0){method.Invoke(null,null);return;}
   int pid;
   if(!Int32.TryParse(tokens[2],NumberStyles.Integer,CultureInfo.InvariantCulture,out pid))throw new ArgumentException("Console integer argument");
   method.Invoke(null,new object[]{tokens[1],pid});
  }
  public static void UnloadPlugin(Assembly owner,Action exit){
   try{exit();}
   finally{
    var names=new List<string>();
    foreach(var entry in commands)if(entry.Value.DeclaringType.Assembly==owner)names.Add(entry.Key);
    foreach(var name in names)commands.Remove(name);
   }
  }
  public static void LogTrivial(string line){LastLog=line;}
  static Game(){Console=new GameConsole();}
 }
 public sealed class GameFiber {
  public static Thread Last;
  public static GameFiber StartNew(ThreadStart start,string name){Last=new Thread(start){IsBackground=true,Name=name};Last.Start();return new GameFiber();}
  public static void Sleep(int ms){Thread.Sleep(ms);}
 }
}
namespace Rage.Attributes {
 public sealed class PluginAttribute:Attribute {
  public PluginAttribute(string name){}
  public string Author{get;set;} public string Description{get;set;} public string EntryPoint{get;set;}
  public string ExitPoint{get;set;} public bool PrefersSingleInstance{get;set;}
 }
 public sealed class ConsoleCommandAttribute:Attribute {public string Name{get;set;}public string Description{get;set;}}
}
namespace Rage.Native {
 public sealed class NativeArgument {
  public static implicit operator NativeArgument(float value){return new NativeArgument();}
  public static implicit operator NativeArgument(int value){return new NativeArgument();}
 }
 public static class NativeFunction {
  public static int Calls,HornCalls;
  public static volatile int Proxy;
  public static volatile bool Ready,AlternateHorn;
  public static object Natives{get{return new DynamicCalls();}}
  public sealed class DynamicCalls {
   public void x252BDC06B73FA6EA(int proxy,out Rage.Vector3 origin,out uint hash){
    Interlocked.Increment(ref Calls);if(proxy!=37)throw new Exception("wrong proxy");
    origin=new Rage.Vector3{X=4,Y=7,Z=9};hash=0xab12u;
   }
  }
  public static T CallByName<T>(string name,params NativeArgument[] args){
   Interlocked.Increment(ref Calls);
   object value;
   switch(name){
    case "NETWORK_IS_SESSION_STARTED":case "NETWORK_IS_GAME_IN_PROGRESS":case "IS_PLAYER_SWITCH_IN_PROGRESS":value=false;break;
    case "IS_PLAYER_PLAYING":case "DOES_ENTITY_EXIST":value=true;break;
    case "PLAYER_ID":case "PLAYER_PED_ID":value=1;break;
    case "GET_FINAL_RENDERED_CAM_COORD":case "GET_FINAL_RENDERED_CAM_ROT":value=new Rage.Vector3();break;
    case "GET_GAME_TIMER":value=3u;break;
    case "GET_INTERIOR_FROM_COLLISION":value=Proxy;break;
    case "IS_INTERIOR_READY":value=Ready;break;
    case "GET_VEHICLE_DEFAULT_HORN":var i=Interlocked.Increment(ref HornCalls);value=AlternateHorn&&i%2==1?13u:7u;break;
    default:throw new Exception("Unexpected native: "+name);
   }
   return (T)value;
  }
 }
}
