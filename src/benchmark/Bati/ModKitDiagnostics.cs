using System;
using System.Runtime.Serialization;

namespace RichAudio.BatiResearch
{
    [DataContract] public sealed class NativeIntegerObservation
    {
        [DataMember] public string ReturnType="System.Int32",Status="UNKNOWN",ExceptionType,Hex;
        [DataMember] public int? Raw;
        public NativeIntegerObservation Copy(){return (NativeIntegerObservation)MemberwiseClone();}
    }
    [DataContract] public sealed class ModKitDiagnostic
    {
        [DataMember] public int Version=1,RequestedSelection=0,VerifiedIndexedCategories;
        [DataMember] public uint? VehicleModel;
        [DataMember] public bool RequestIssued;
        [DataMember] public bool? InstallerReturnedNormally;
        [DataMember] public string Installer="SET_VEHICLE_MOD_KIT",InstallerReturnType="System.Void",InstallerExceptionType;
        [DataMember(EmitDefaultValue=false)] public string InvocationReturnType="System.Int32";
        [DataMember] public string Ownership="UNKNOWN",Indication="UNKNOWN",DocumentedKitIdentityValidity="UNKNOWN",Verification="NOT_VERIFIED",Reason="not attempted";
        [DataMember] public NativeIntegerObservation Before=new NativeIntegerObservation(),After=new NativeIntegerObservation(),AvailableKitCount=new NativeIntegerObservation();
        public ModKitDiagnostic Copy(){var c=(ModKitDiagnostic)MemberwiseClone();c.Before=Before.Copy();c.After=After.Copy();c.AvailableKitCount=AvailableKitCount.Copy();return c;}
        // Historical 16-bit index representation is only a conservative screening bound,
        // never an Enhanced validity certificate or a comparison with per-model kit count.
        public static string Classify(int raw)
        {
            if(raw==65535)return "NO_KIT_SENTINEL_HISTORICAL";
            if(raw<0)return "INVALID_NEGATIVE";
            if(raw>65535)return "OUTSIDE_HISTORICAL_REPRESENTATION";
            return "RAW_INDEX_SEMANTICS_UNKNOWN";
        }
    }
}
