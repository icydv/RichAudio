// Standalone marker validation. No game inspection, SDK loading or mutation.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization;
using RichAudio.BatiResearch;
public static class InspectBatiReadiness
{
    [DataContract]public sealed class Result
    {
        [DataMember]public int Version=1,MarkerRevision;
        [DataMember]public string MarkerFingerprint,GameVersion="1.0.1158.16",State="BLOCKED",Domain="historical-runtime-markers-offline-readback",RouteCoverage="UNKNOWN",SpawnSurface="UNVERIFIED",TurboAvailability="UNVERIFIED",CleanupProof="UNVERIFIED";
        [DataMember]public bool RouteClear=false,LiveStartSupported=false,MarkerFileUnchanged;
        [DataMember]public double EndpointChordNativeUnits,MarkerReadValidationMs;
    }
    public static int Main(string[] args)
    {
        if(args.Length!=6){Console.Error.WriteLine("Expected private marker file, hash, revision, session, domain, fresh private result file.");return 2;}
        try{var clock=Stopwatch.StartNew();var m=MarkerSet.Load(args[0],args[1],int.Parse(args[2]),args[3],args[4]);var r=new Result{MarkerRevision=m.Revision,MarkerFingerprint=m.Fingerprint,EndpointChordNativeUnits=m.Chord,MarkerReadValidationMs=clock.Elapsed.TotalMilliseconds,MarkerFileUnchanged=Check.Hash(File.ReadAllBytes(args[0])).Equals(args[1],StringComparison.OrdinalIgnoreCase)};PrivateFiles.WriteNew(args[5],r);Console.WriteLine("Historical marker data VALID; live start BLOCKED. No route survey or game operation performed.");return 0;}catch(Exception e){Console.Error.WriteLine("Readiness rejected: "+e.GetType().Name);return 1;}
    }
}
