// Original offline validation. Historical evidence is not current route clearance.
using System;using System.IO;using System.Linq;using System.Runtime.Serialization.Json;
using RichAudio.AirportResearch;using RichAudio.GeometryResearch;using RichAudio.MarkerResearch;
namespace RichAudio.BatiResearch
{
 public static class FiveStopRoute
 {
  static readonly int[] counts={12,3,3,3,9};static readonly string[] names={"Start","Mid1","Mid2","Mid3","Finish"};
  static byte[] Read(string file,string fingerprint){PrivateFiles.RequireLocal(file);using(var f=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read)){Check.That(f.Length>0&&f.Length<=2097152,"survey file bound");var b=new byte[(int)f.Length];int offset=0;while(offset<b.Length){int n=f.Read(b,offset,b.Length-offset);Check.That(n>0,"incomplete survey read");offset+=n;}Check.That(Check.Hash(b).Equals(fingerprint,StringComparison.OrdinalIgnoreCase),"survey fingerprint mismatch");return b;}}
  public static SurveyRecord Parse(byte[] bytes){Check.That(bytes!=null&&bytes.Length>0&&bytes.Length<=2097152,"survey bytes bound");using(var f=new MemoryStream(bytes)){var result=(SurveyRecord)new DataContractJsonSerializer(typeof(SurveyRecord),new DataContractJsonSerializerSettings{MaxItemsInObjectGraph=32768}).ReadObject(f);Check.That(f.Position==f.Length,"survey trailing bytes");return result;}}
  static string Json<T>(T x){using(var f=new MemoryStream()){new DataContractJsonSerializer(typeof(T)).WriteObject(f,x);return System.Text.Encoding.UTF8.GetString(f.ToArray());}}
  public static void ValidateSnapshot(SurveyRecord r,int number,MarkerSet m)
  {
   Check.That(r!=null&&r.Version==1&&r.GameVersion=="1.0.1158.16"&&r.RphVersion=="1.132.1428.17748"&&r.Domain==m.Domain&&r.MarkerRevision==m.Revision&&r.MarkerFingerprint.Equals(m.Fingerprint,StringComparison.OrdinalIgnoreCase)&&r.HistoricalMarkerSession==m.Session&&!string.IsNullOrEmpty(r.Session)&&r.Session.Length<=64&&r.Plan=="airport-six-stops-v1"&&r.Units=="uncalibrated-native-game-units"&&r.QueryLimit==36,"original survey provenance");
   Check.That(Check.Distance(r.OriginalStart,m.Start)==0&&Check.Distance(r.OriginalFinish,m.Finish)==0&&Check.Distance(r.OriginalListener,m.Listener)==0&&r.OriginalMarkersUnchanged&&!r.RouteClear&&!r.BenchmarkStartSupported&&r.RouteCoverage=="UNKNOWN"&&r.RouteContinuity=="UNKNOWN"&&r.StoppingDistance=="UNKNOWN","historical markers/uncertainty changed");
   Check.That(number>=1&&number<=5&&r.Stops!=null&&r.Stops.Length==number&&r.ActualCalls==counts.Take(number).Sum()&&r.IntermediatePoints==Math.Min(3,number-1),"five-stop cumulative counts");
   double last=-1;uint? player=null;int? generation=null;
   for(int j=0;j<number;j++){
    var s=r.Stops[j];Check.That(s!=null&&s.Revision==j+1&&s.Kind==names[j]&&s.Completion=="COMPLETE_WITH_UNKNOWNS"&&s.ActualCalls==counts[j]&&s.PlannedCalls==counts[j]&&s.SkippedCalls==0&&s.Plan!=null&&s.Plan.Count==counts[j]&&s.Observations!=null&&s.Observations.Count==counts[j],"completed stop shape");SurveyPlan.ValidatePose(s.Player);
    Check.That(s.Player.AtMs>last&&(!player.HasValue||player==s.Player.Player&&generation==s.Player.Generation)&&s.FinishedMs>=s.Player.AtMs&&s.FinishedMs-s.Player.AtMs<=5000,"stop identity/time");last=s.FinishedMs;player=s.Player.Player;generation=s.Player.Generation;
    MarkerPoint anchor=j==0?m.Start:j==4?m.Finish:s.Player.Position;Check.That(Check.Distance(anchor,s.Anchor)<1e-8&&Check.Distance(anchor,m.Start)<=2000&&Check.Distance(anchor,m.Finish)<=2000,"actual observation anchors");
    var expected=SurveyPlan.Ground((StopKind)j,s.Anchor,s.Player.Forward).ToList();
    if(j==0){var centre=s.Observations[4];Check.That(centre.Completion=="hit"&&centre.HitPosition.HasValue,"start support required as candidate, not clearance");expected.AddRange(SurveyPlan.Body(SurveyPlan.M(centre.HitPosition.Value),s.Player.Forward));}
    for(int i=0;i<counts[j];i++){var p=s.Plan[i];var e=expected[i];var o=s.Observations[i];Check.That(p.Order==i&&p.Role==e.Role&&Point3.Sub(p.Origin,e.Origin).Length<1e-8&&Point3.Sub(p.End,e.End).Length<1e-8,"unchanged fixed query plan");var v=ObservationRules.Validate(o);Check.That(v.RecordValid&&(o.Completion!="hit"||v.SurfaceValid)&&o.SessionId==r.Session&&o.QueryProvenance==(p.Role=="ground-probe"?"airport-ground-probe-v1":"airport-body-line-v1")&&o.IgnoredPlayerHandle==s.Player.Player&&o.Origin.HasValue&&o.End.HasValue&&Point3.Sub(o.Origin.Value,p.Origin).Length<=.001&&Point3.Sub(o.End.Value,p.End).Length<=.001&&o.ObservedAtMs>=s.Player.AtMs&&o.ObservedAtMs-s.Player.AtMs<=2500,"invalid original trace");}
    var assessed=Survey.Clone(s);SurveyPlan.Assess(assessed);Check.That(assessed.Surface==s.Surface&&assessed.BodyClearance==s.BodyClearance&&s.Surface=="PARTIAL_SAMPLED_SUPPORT"&&s.Coverage=="PARTIAL"&&s.Continuity=="UNKNOWN"&&s.CandidateOnly&&!s.ReplacesOriginalMarker,"surface interpretation is partial");
    Check.That(s.Navigation!=null&&s.Navigation.Calls<=2&&s.Navigation.Calls>=0&&s.Navigation.Classification==SurveyPlan.ClassifyNavigation(s.Navigation)&&s.Interference!=null&&s.Interference.Enumerations>=0&&s.Interference.Enumerations<=3&&s.Interference.Nearby!=null&&s.Interference.Nearby.Length<=64&&s.Interference.Coverage=="PARTIAL_STREAMED_POOL"&&!s.Interference.FutureClearance,"navigation/interference scope");
   }
  }
  public static AirportRouteCandidate Load(string directory,MarkerSet markers,string[] fingerprints)
  {
   Check.That(fingerprints!=null&&fingerprints.Length==6,"pin five snapshots and closed record");SurveyRecord previous=null;
   for(int i=1;i<=5;i++){var r=Parse(Read(Path.Combine(directory,"stop-"+i+".json"),fingerprints[i-1]));ValidateSnapshot(r,i,markers);Check.That(r.State=="READY_FOR_NEXT_STOP","unexpected historical completion");if(previous!=null)Check.That(r.Session==previous.Session&&Json(r.Stops.Take(i-1).ToArray())==Json(previous.Stops),"snapshots mix sessions or alter earlier observations");previous=r;}
   var closed=Parse(Read(Path.Combine(directory,"closed.json"),fingerprints[5]));ValidateSnapshot(closed,5,markers);Check.That(closed.State=="STOPPED"&&closed.Session==previous.Session&&Json(closed.Stops)==Json(previous.Stops),"later failure must preserve five completed stops");
   var candidate=new AirportRouteCandidate{Domain=markers.Domain,SurveySession=previous.Session,MarkerRevision=markers.Revision,MarkerFingerprint=markers.Fingerprint,RecordFingerprints=(string[])fingerprints.Clone(),Revision="five-stop-v1-"+Check.Hash(System.Text.Encoding.ASCII.GetBytes(string.Join("|",fingerprints))).Substring(0,16),StopNames=(string[])names.Clone(),Points=previous.Stops.Select(s=>s.Anchor).ToArray(),StartSupport=SurveyPlan.M(previous.Stops[0].Observations[4].HitPosition.Value)};candidate.Validate(markers);return candidate;
  }
 }
}
