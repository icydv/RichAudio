// Minimal test-only surroundings for executing the unchanged real RPH sampler.
// The actual composition, validator and clock mapping have their own regressions.
namespace RichAudio.Beacon.Rph
{
    internal static class CameraSampler{internal static bool Ready=true;internal static bool StoryReady(){return Ready;}}
}
namespace RichAudio.Beacon.Handoff
{
    internal static class ShvOperatingStateHandoff
    {
        internal const uint BatiModel=0xf9300cc5;
        internal sealed class HostContext
        {
            internal readonly uint Model;internal readonly long StartTicks,EndTicks;
            internal HostContext(string a,string b,string c,string d,string e,int generation,uint model,bool running,bool valid,long start,long end)
            {Model=model;StartTicks=start;EndTicks=end;}
        }
    }
    internal sealed partial class HandoffPeerObservation
    {
        internal readonly ShvOperatingStateHandoff.HostContext Context;
        internal readonly ulong VehicleAddress,PedAddress;
        internal HandoffPeerObservation(object owner,ShvOperatingStateHandoff.HostContext context,ulong vehicleAddress,ulong pedAddress,
            uint vehicleIndex,byte vehicleCounter,uint vehicleValue,uint pedIndex,byte pedCounter,uint pedValue,
            double[] position,double[] velocity,double[] forward,double[] up)
        {Context=context;VehicleAddress=vehicleAddress;PedAddress=pedAddress;}
    }
}
