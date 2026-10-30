// Vehicle evidence enters the same bounded producer control queue as the listener.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using RichAudio.Beacon.Transport;
namespace RichAudio.Beacon.Windows
{
    public static partial class HostProgram
    {
        private static string vehicleProfile,vehicleFixturePipe;
        private static VehiclePipeServer vehiclePipe;
        private static readonly object vehicleListenerLock=new object();
        private static ListenerState vehicleListener;
        private static Func<uint> vehicleListenerPid;
        private static bool vehicleRemoved;
        private static long vehicleMessagesWritten,vehicleMessagesExpired;
        private static double maxVehicleHostQueueAgeMs,maxVehicleWriteAgeMs;
        private static double maxVehicleRoundTripMs,maxVehicleAcceptedRoundTripMs;
        private static long vehicleRelayRejected,vehicleRelayDelivered,vehicleAckSequence=-1;
        private static string vehicleAckKind;
        private static bool vehicleAckAccepted;
        private static readonly object vehicleAckLock=new object();
        private static readonly AutoResetEvent vehicleAck=new AutoResetEvent(false);
        private static readonly List<Dictionary<string,object>> vehicleReceipts=new List<Dictionary<string,object>>();
        internal static string VehicleArguments(string profile,bool listener,bool geometry,bool wav,bool incompatible,double trim,float gain)
        {
            if(profile==null)return "";
            if((profile!="v12"&&profile!="v8")||!listener||!geometry||wav||incompatible||trim!=0||gain>.20f)
                throw new ArgumentException("Vehicle demo requires v12|v8, required listener and declared geometry model, zero trim, gain <= .20 and manual startup without loopback or device probes");
            return " --vehicle-profile "+profile;
        }
        private static string VehicleProducerArguments(){return vehicleProfile==null?"":" --vehicle-profile "+vehicleProfile;}
        private static void StartVehicleReceiver(Func<uint> listenerPid)
        {
            if(vehicleProfile==null)return;vehicleListenerPid=listenerPid;
            vehiclePipe=new VehiclePipeServer(vehicleFixturePipe??VehicleWire.PipeName,VehicleReceived,VehicleEnded);vehiclePipe.Start();
        }
        private static void VehicleListenerReceived(ListenerState state){if(vehicleProfile!=null)lock(vehicleListenerLock)vehicleListener=Protocol.Copy(state);}
        private static void VehicleReceived(VehiclePacket packet,uint peer)
        {
            long now=Stopwatch.GetTimestamp();
            lock(vehicleListenerLock)VehicleListenerBinding.Validate(packet,peer,vehicleListener,vehicleListenerPid(),
                vehicleProfile=="v12"?"original-hypercar-v12":"original-supercharged-v8",now);
            lock(vehicleAckLock){vehicleAckSequence=-1;vehicleAckKind=null;vehicleAckAccepted=false;}
            vehicleAck.Reset();long started=Stopwatch.GetTimestamp();
            Enqueue(new ControlMessage{VehicleJson=VehicleProtocol.EncodeJson(packet),ObservationTicks=packet.ObservationTicks,
                QueuedTicks=Stopwatch.GetTimestamp(),Sequence=packet.Sequence,ObservationQpc100ns=packet.ObservationTicks*(10000000.0/packet.ClockFrequency)});
            if(!WaitVehicleAck(packet.Sequence,"vehicle-relay-ack"))throw new TimeoutException("vehicle stage acknowledgement");
            double roundTrip=(Stopwatch.GetTimestamp()-started)*1000.0/Stopwatch.Frequency;maxVehicleRoundTripMs=Math.Max(maxVehicleRoundTripMs,roundTrip);
            if(roundTrip<=0||roundTrip>10){vehicleRelayRejected++;Send("{\"type\":\"vehicle-relay-drop\",\"sequence\":"+packet.Sequence+"}");return;}
            maxVehicleAcceptedRoundTripMs=Math.Max(maxVehicleAcceptedRoundTripMs,roundTrip);vehicleAck.Reset();
            Send("{\"type\":\"vehicle-relay-commit\",\"sequence\":"+packet.Sequence+",\"maximumMs\":"+roundTrip.ToString("R",System.Globalization.CultureInfo.InvariantCulture)+"}");
            if(!WaitVehicleAck(packet.Sequence,"vehicle-relay-result")||!vehicleAckAccepted)throw new InvalidDataException("vehicle producer commit rejected");
            vehicleRelayDelivered++;if(packet.Action=="remove")vehicleRemoved=true;
        }
        private static bool WaitVehicleAck(long sequence,string kind){var watch=Stopwatch.StartNew();while(!stop&&watch.ElapsedMilliseconds<100){vehicleAck.WaitOne(Math.Max(1,100-(int)watch.ElapsedMilliseconds));lock(vehicleAckLock)if(vehicleAckSequence==sequence&&vehicleAckKind==kind)return true;}return false;}
        private static void VehicleDiagnostic(string line)
        {
            if(vehicleProfile==null||!line.StartsWith("{\"type\":\"vehicle-relay-",StringComparison.Ordinal))return;
            try{var d=new System.Web.Script.Serialization.JavaScriptSerializer{MaxJsonLength=4096,RecursionLimit=4}.DeserializeObject(line) as Dictionary<string,object>;
                string kind=d["type"] as string;if(kind!="vehicle-relay-ack"&&kind!="vehicle-relay-result")return;
                lock(vehicleAckLock){vehicleAckSequence=Convert.ToInt64(d["sequence"],System.Globalization.CultureInfo.InvariantCulture);vehicleAckKind=kind;vehicleAckAccepted=kind=="vehicle-relay-ack"||d.ContainsKey("accepted")&&(bool)d["accepted"];}vehicleAck.Set();
            }catch{vehicleRelayRejected++;}
        }
        private static void VehicleEnded(string reason)
        {
            // The host's authoritative Stop already owns shutdown. A callback
            // interrupted by that Stop is not an unsolicited transport failure.
            if(stop)return;
            if(reason=="deliberate-stop"&&vehicleRemoved)return;
            if(output!=null)output.Stop();RecordFailure("vehicle-terminal","Vehicle evidence ended: "+reason);stop=true;
        }
        private static void CloseVehicleReceiver(){if(vehiclePipe!=null&&!vehiclePipe.StopAndWait(1000))throw new TimeoutException("Vehicle receiver did not join");}
        private static Dictionary<string,object> VehicleMetrics(){return vehicleProfile==null?null:new Dictionary<string,object>{{"profile",vehicleProfile},{"stockAudio","additive-experimental-playback"},
            {"accepted",vehiclePipe==null?0:vehiclePipe.Accepted},{"rejected",vehiclePipe==null?0:vehiclePipe.Rejected},{"connections",vehiclePipe==null?0:vehiclePipe.Connections},
            {"terminal",vehiclePipe==null?null:vehiclePipe.Reason},{"shutdownCompleted",vehiclePipe==null||vehiclePipe.ShutdownCompleted},
            {"written",vehicleMessagesWritten},{"expiredBeforeWrite",vehicleMessagesExpired},{"maxHostQueueAgeMs",maxVehicleHostQueueAgeMs},{"maxObservationAgeAtWriteMs",maxVehicleWriteAgeMs},
            {"first128Receipts",vehicleReceipts},{"removed",vehicleRemoved},{"relayDelivered",vehicleRelayDelivered},{"relayRejected",vehicleRelayRejected},{"maximumObservedRoundTripMs",maxVehicleRoundTripMs},{"maximumAcceptedRoundTripMs",maxVehicleAcceptedRoundTripMs},
            {"forwardingBasis","per-packet measured round-trip upper bound; <=10ms acceptance"},{"rpmProvenance","normalized RPH ratio, live meaningfulness unvalidated; synthesis control is an estimate"}};}
    }
}
