// Original synthetic native responses: none of these kit values came from GTA.
using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;
using RichAudio.BatiResearch;using RichAudio.MarkerResearch;
public static class ModKitTests
{
    static int assertions;static void Yes(bool ok,string message){assertions++;if(!ok)throw new Exception(message);}
    static void Reject(Action call,string message){bool failed=false;try{call();}catch{failed=true;}Yes(failed,message);}
    static byte[] Json<T>(T value){using(var b=new MemoryStream()){new DataContractJsonSerializer(typeof(T)).WriteObject(b,value);return b.ToArray();}}
    static MarkerSet Markers(){var p=new MarkerPlan("original-synthetic-fixture","kit-markers");p.Set(MarkerKind.Start,new MarkerPose{Position=new MarkerPoint(0,0,1),AtMs=1});p.Set(MarkerKind.Finish,new MarkerPose{Position=new MarkerPoint(100,0,1),AtMs=2});var r=p.Set(MarkerKind.Listener,new MarkerPose{Position=new MarkerPoint(50,20,3),AtMs=3,OnFoot=true});var bytes=Json(r);return MarkerSet.Parse(bytes,Check.Hash(bytes),3,"kit-markers","original-synthetic-fixture");}
    static Controller Ready(FakeWorld world){var m=Markers();var c=new Controller(m,new Policy(),world,"kit-run");c.Prepare(new RouteEvidence{Domain=m.Domain,Session="kit-run",MarkerFingerprint=m.Fingerprint,Revision="synthetic-kit-route",Points=new[]{m.Start,m.Finish},SurfaceSpawnVerified=true,TrafficIsolationVerified=true,CoverageComplete=true,CleanupReviewed=true});c.Arm(true);return c;}
    [DataContract] public sealed class Case
    {
        [DataMember]public string Domain="original-synthetic-fixture",Name;[DataMember]public bool Started;
        [DataMember]public ModKitDiagnostic Kit;[DataMember]public Upgrade[] Upgrades;
    }
    public static int Main(string[] args)
    {
        string root=args[0];Directory.CreateDirectory(root);var cases=new List<Case>();
        foreach(int raw in new[]{0,207}){
            var world=new FakeWorld{KitAfter=raw};var c=Ready(world);Yes(c.Start(0),"indexed functional confirmation permits synthetic setup");var r=c.Snapshot();var k=r.ModKit;
            Yes(world.RequestedKit==0&&k.RequestIssued&&k.InstallerReturnedNormally==true,"explicit default request and normal void-call return recorded");
            Yes(k.Before.Raw==65535&&k.After.Raw==raw&&k.After.ReturnType=="System.Int32"&&k.After.Status=="RETURNED","exact integer observations, including initial sentinel");
            Yes(k.AvailableKitCount.Raw==1&&k.DocumentedKitIdentityValidity=="UNKNOWN"&&k.Indication=="RAW_INDEX_SEMANTICS_UNKNOWN","model kit count never validates a global index");
            Yes(k.Verification=="VERIFIED_BY_INDEXED_READBACK"&&k.VerifiedIndexedCategories==3&&r.Upgrades.Where(u=>u.Category!=18&&u.Count>0).All(u=>u.RequestReturnedNormally&&u.Observed==u.Count-1),"only actual highest indexed readback supplies functional proof");
            Yes(r.Upgrades.Single(u=>u.Category==15).Status=="UNSUPPORTED","unsupported suspension stays explicit");
            var copy=c.Snapshot();copy.ModKit.After.Raw=999;copy.ModKit.AvailableKitCount.Status="forged";Yes(c.Snapshot().ModKit.After.Raw==raw&&c.Snapshot().ModKit.AvailableKitCount.Status=="RETURNED","diagnostic snapshots deep copied");
            cases.Add(new Case{Name="functional-"+raw,Started=true,Kit=k,Upgrades=r.Upgrades});c.Abort();
        }
        var faults=new Dictionary<string,Action<FakeWorld>>{
            {"no-kit-sentinel",w=>w.KitAfter=65535},{"negative",w=>w.KitAfter=-1},{"outside-historical-width",w=>w.KitAfter=int.MaxValue},
            {"missing-before",w=>w.KitBefore=null},{"missing-after",w=>w.KitAfter=null},{"throw-before",w=>w.BeforeGetterFailure=true},{"throw-after",w=>w.AfterGetterFailure=true},
            {"installer-fails",w=>w.InstallerFailure=true},{"missing-count",w=>w.KitCount=null},{"count-throws",w=>w.KitCountFailure=true},{"zero-kits",w=>w.KitCount=0},{"negative-count",w=>w.KitCount=-1},
            {"unsupported-all",w=>{foreach(var key in w.Counts.Keys.ToArray())w.Counts[key]=0;}},{"invalid-category-count",w=>w.Counts[11]=-1},{"category-cap",w=>w.Counts[11]=129},
            {"indexed-mismatch",w=>w.Readback=false},{"partial-setter-exception",w=>w.TuningFailure=true},{"ownership-lost-after-getter",w=>w.AfterGetterOwnershipLoss=true},
            {"later-indexed-mismatch",w=>w.MismatchedCategory=13},{"later-setter-exception",w=>w.ThrowSetCategory=13}
        };
        foreach(var fault in faults){var w=new FakeWorld();fault.Value(w);var c=Ready(w);Yes(!c.Start(0),"failure blocks setup: "+fault.Key);var r=c.Snapshot();
            Yes(w.Spawns==1&&!r.Rider.Valid&&w.Drives==0&&w.Brakes==0&&r.Samples.Length==0,"no rider/drive/brake after prerequisite failure");
            Yes(r.Outcome=="FAILED"&&r.ModKit.Verification=="FAILED"&&!string.IsNullOrEmpty(r.ModKit.Reason),"diagnostic reason survives failed setup");
            if(fault.Key=="ownership-lost-after-getter")Yes(r.Stage=="CleanupPending"&&w.Deleted.Count==0&&r.ModKit.Ownership=="UNKNOWN_OR_LOST","unknown ownership prevents unsafe cleanup");
            else Yes(r.Stage=="Cleaned"&&w.Deleted.SequenceEqual(new uint[]{10}),"only exact synthetic owned bike cleaned");
            Reject(()=>c.Start(1),"consumed failure never retries");
            if(fault.Key=="no-kit-sentinel")Yes(r.ModKit.After.Raw==65535&&r.ModKit.After.Hex=="0x0000FFFF"&&r.ModKit.Indication=="NO_KIT_SENTINEL_HISTORICAL","sentinel retained without reinterpreting it");
            if(fault.Key=="negative")Yes(r.ModKit.After.Raw==-1&&r.ModKit.After.Hex=="0xFFFFFFFF","signed raw value never masked or invented");
            if(fault.Key=="missing-after")Yes(!r.ModKit.After.Raw.HasValue&&r.ModKit.After.Status=="UNAVAILABLE"&&r.ModKit.After.Hex==null,"unavailable is not zero");
            if(fault.Key=="throw-before")Yes(r.ModKit.Before.ExceptionType=="InvalidOperationException"&&!r.ModKit.RequestIssued&&!r.ModKit.InstallerReturnedNormally.HasValue,"getter failure stops before installer; type only");
            if(fault.Key=="installer-fails")Yes(r.ModKit.InstallerReturnedNormally==false&&r.ModKit.After.Status=="UNKNOWN","no fabricated after-reading following installer exception");
            if(fault.Key=="partial-setter-exception")Yes(r.Upgrades[0].Status=="INCOMPLETE_EXCEPTION"&&!r.Upgrades[0].RequestReturnedNormally&&!r.Upgrades[0].Observed.HasValue,"partial setter is not a verified modification");
            if(fault.Key.StartsWith("later-"))Yes(r.ModKit.VerifiedIndexedCategories==1&&r.Upgrades[0].Status=="VERIFIED"&&r.ModKit.Verification=="FAILED","earlier successful modification cannot hide incomplete later setup");
            cases.Add(new Case{Name=fault.Key,Started=false,Kit=r.ModKit,Upgrades=r.Upgrades});
        }
        Yes(new ModKitDiagnostic().InstallerReturnType=="System.Void"&&new ModKitDiagnostic().InvocationReturnType=="System.Int32","native and invocation return types distinguished");
        using(var b=new MemoryStream(System.Text.Encoding.UTF8.GetBytes("{\"InstallerReturnType\":\"System.Void\"}"))){var old=(ModKitDiagnostic)new DataContractJsonSerializer(typeof(ModKitDiagnostic)).ReadObject(b);Yes(old.InvocationReturnType==null&&old.InstallerReturnType=="System.Void","older invocation type remains unavailable");}
        var direct=new FakeWorld();var id=direct.CreateBike(new MarkerPoint(),"direct-kit","bike");var tuning=new StockTuning();Yes(tuning.Apply(direct,id),"direct functional confirmation");Reject(()=>tuning.Apply(direct,id),"no direct tuning retry");
        var file=Path.Combine(root,"kit-cases.json");PrivateFiles.WriteNew(file,cases.ToArray());var data=File.ReadAllBytes(file);Yes(data.SequenceEqual(Json(cases.ToArray())),"deterministic persisted diagnostics");
        var text=System.Text.Encoding.UTF8.GetString(data);Yes(!text.Contains("private paths")&&!text.Contains("private diagnostic")&&!text.Contains("Handle")&&!text.Contains("Generation")&&!text.Contains("ScopeNonce"),"new diagnostic contains neither exception messages nor private creation identifiers");
        using(var b=new MemoryStream(data)){var restored=(Case[])new DataContractJsonSerializer(typeof(Case[])).ReadObject(b);Yes(Json(restored).SequenceEqual(data),"lossless diagnostic roundtrip");}
        using(var b=new MemoryStream(System.Text.Encoding.UTF8.GetBytes("{\"Version\":1,\"Outcome\":\"historical\",\"Upgrades\":[]}"))){var old=(RunRecord)new DataContractJsonSerializer(typeof(RunRecord)).ReadObject(b);Yes(old.ModKit==null,"historical absent diagnostic remains unavailable");}
        Reject(()=>PrivateFiles.WriteNew(file,cases.ToArray()),"private diagnostic cannot overwrite");Reject(()=>PrivateFiles.WriteNew(Path.GetFullPath("public-kit.json"),cases.ToArray()),"private diagnostic path guard");
        Console.WriteLine("PASS: "+assertions+" mod-kit contract assertions across "+cases.Count+" original synthetic cases; no GTA or SDK execution.");return 0;
    }
}
