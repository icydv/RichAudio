// Original device-free declaration fixture. It is not an RPH runtime or game.
using System;
namespace Rage
{
    public struct Vector3 {public float X,Y,Z;}
    public struct PoolHandle {public uint Value,Index;public byte Counter;}
    public struct Model {public uint Hash;}
    public class Entity
    {
        public PoolHandle Handle;public Model Model;public bool Valid=true,IsDead;
        public float SpeedValue;
        public bool LastCollisionFound;public Vector3 LastCollisionPosition,LastCollisionNormal;public string LastCollisionMaterial;
        public bool IsValid(){return Valid;}
        public float Speed {get{return SpeedValue;}}
        public bool GetLastCollision(out Vector3 position,out Vector3 normal,out string materialName){position=LastCollisionPosition;normal=LastCollisionNormal;materialName=LastCollisionMaterial;return LastCollisionFound;}
    }
    public class Ped:Entity {public Vehicle CurrentVehicle;}
    public class Vehicle:Entity
    {
        public Ped Driver;public bool HornValue,EngineValue=true,StartingValue;
        public float RatioValue=50;public sbyte GearValue=1;
        public static int Writes;
        public bool IsEngineOn {get{return EngineValue;}set{Writes++;EngineValue=value;}}
        public bool IsEngineStarting {get{return StartingValue;}set{Writes++;StartingValue=value;}}
        public float EngineRevolutionsRatio {get{return RatioValue;}}
        public sbyte CurrentGear {get{return GearValue;}}
    }
    public class Player {public Ped Character;}
    public static class Game {public static Player LocalPlayer=new Player();}
}
namespace Rage.Native
{
    public static class NativeFunction
    {
        public static int Calls;public static ulong LastHash;
        public static T CallByHash<T>(ulong hash,params object[] arguments)
        {
            if(hash!=0x9D6BFC12B05C6121||arguments.Length!=1||!(arguments[0] is Rage.Vehicle))throw new InvalidOperationException("Unexpected fixture native");
            Calls++;LastHash=hash;return (T)(object)((Rage.Vehicle)arguments[0]).HornValue;
        }
    }
}
