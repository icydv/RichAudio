// Harmless test API. Never used to compile a deployable plugin.
using System;
using System.Reflection;
[assembly:AssemblyVersion("0.0.0.0")]
#if UNKNOWN_VERSION
[assembly:AssemblyFileVersion("9.9.9.9")]
#else
[assembly:AssemblyFileVersion("1.132.1428.17748")]
#endif
namespace Rage
{
    public sealed class Object{ }
    public static class Fixture
    {
        public static int GetterCalls;
        public static bool ThrowOnRead,Loading,Paused;
        public static Player Player;
        public static T Read<T>(T value){GetterCalls++;if(ThrowOnRead)throw new InvalidOperationException("fixture-api-failed");return value;}
        public static void Reset(){GetterCalls=0;ThrowOnRead=false;Loading=false;Paused=false;Player=null;}
    }
    public static class Game
    {
        public static GameConsole Console{get{return Fixture.Read(new GameConsole());}}
        public static Player LocalPlayer{get{return Fixture.Read(Fixture.Player);}}
        public static bool IsLoading{get{return Fixture.Read(Fixture.Loading);}}
#if WRONG_PAUSED
        public static int IsPaused{get{return 0;}}
#else
        public static bool IsPaused{get{return Fixture.Read(Fixture.Paused);}}
#endif
    }
    public sealed class GameConsole
    {
#if !MISSING_CONSOLE_OPEN
#if WRONG_CONSOLE_OPEN
        public int IsOpen{get{return 0;}}
#else
        public bool IsOpen{get{return Fixture.Read(false);}}
#endif
#endif
        public void Print(string value){Fixture.Read(value);}
    }
    public static class GameFiber{public static void Sleep(int milliseconds){Fixture.Read(milliseconds);}}
    public sealed class Player{public Ped Ped;public Ped Character{get{return Fixture.Read(Ped);}}}
    public class Entity
    {
        public bool Valid=true,Dead;public IntPtr Address;public PoolHandle Pool;public Model EntityModel;
        public Vector3 Location,Motion,Forward=new Vector3(0,1,0),Up=new Vector3(0,0,1);
        public bool IsValid(){return Fixture.Read(Valid);}
        public bool IsDead{get{return Fixture.Read(Dead);}}
        public IntPtr MemoryAddress{get{return Fixture.Read(Address);}}
        public PoolHandle Handle{get{return Fixture.Read(Pool);}}
        public Model Model{get{return Fixture.Read(EntityModel);}}
        public Vector3 Position{get{return Fixture.Read(Location);}}
        public Vector3 Velocity{get{return Fixture.Read(Motion);}}
        public Vector3 ForwardVector{get{return Fixture.Read(Forward);}}
        public Vector3 UpVector{get{return Fixture.Read(Up);}}
    }
    public sealed class Ped:Entity{public Vehicle Vehicle;public Vehicle CurrentVehicle{get{return Fixture.Read(Vehicle);}}}
    public sealed class Vehicle:Entity
    {
        public Ped Owner;public bool Running=true;
        public Ped Driver{get{return Fixture.Read(Owner);}}
#if !MISSING_ENGINE
        public bool IsEngineOn{get{return Fixture.Read(Running);}}
#endif
    }
    public struct PoolHandle
    {
        public uint IndexValue,RawValue;public byte CounterValue;
        public uint Index{get{return Fixture.Read(IndexValue);}}
#if WRONG_COUNTER
        public int Counter{get{return CounterValue;}}
#else
        public byte Counter{get{return Fixture.Read(CounterValue);}}
#endif
        public uint Value{get{return Fixture.Read(RawValue);}}
    }
    public struct Model{public uint Value;public uint Hash{get{return Fixture.Read(Value);}}}
    public struct Vector3
    {
        public float X,Y;
#if WRONG_VECTOR
        public double Z;
#else
        public float Z;
#endif
        public Vector3(float x,float y,float z){X=x;Y=y;Z=z;}
    }
#if EXTRA_BYTES
    public static class DifferentArtifact{public const string Marker="same-version-distinct-api-bytes";}
#endif
}
namespace Rage.Native
{
    public sealed class NativeArgument{public static implicit operator NativeArgument(int value){return new NativeArgument();}}
    public static class NativeFunction
    {
#if WRONG_NATIVE
        public static object CallByName<T>(string name,params NativeArgument[] args){throw new InvalidOperationException("no-native-execution");}
#else
        public static T CallByName<T>(string name,params NativeArgument[] args){throw new InvalidOperationException("no-native-execution");}
#endif
    }
}
