using System;using System.IO;using System.Collections.Concurrent;using System.Runtime.Serialization;using System.Runtime.Serialization.Json;using System.Threading;
namespace RichAudio.BatiResearch
{
 public static class PresenceProof
 {
  // A native query uses the saved full GUID, never a wrapper handle reset by Delete().
  public static Presence Assess(bool creationKeyMatches,bool previouslyNativePresent,bool? nativeExists,bool wrapperValid,bool wrapperMatches)
  {
   if(!creationKeyMatches||!previouslyNativePresent||!nativeExists.HasValue)return Presence.Unknown;
   if(nativeExists.Value&&wrapperValid)return wrapperMatches?Presence.Present:Presence.Reused;
   if(!nativeExists.Value&&!wrapperValid)return Presence.Absent;
   return Presence.Unknown;
  }
 }
 [DataContract]public sealed class ExperimentApproval
 {
  [DataMember]public int Version,MaximumRuns,MaximumEntities;
  [DataMember]public bool Approved,StoryModeOnly;
  [DataMember]public string ScopeNonce,BinaryFingerprint,CandidateFingerprint,ExpiresUtc;
  public void Validate(string nonce,string binary,string candidate,DateTime now){DateTime until;Check.That(Version==1&&Approved&&StoryModeOnly&&MaximumRuns==1&&MaximumEntities==2&&nonce!=null&&System.Text.RegularExpressions.Regex.IsMatch(nonce,"^[A-Fa-f0-9]{32}$")&&ScopeNonce==nonce&&BinaryFingerprint!=null&&CandidateFingerprint!=null&&System.Text.RegularExpressions.Regex.IsMatch(BinaryFingerprint,"^[A-Fa-f0-9]{64}$")&&System.Text.RegularExpressions.Regex.IsMatch(CandidateFingerprint,"^[A-Fa-f0-9]{64}$")&&BinaryFingerprint.Equals(binary,StringComparison.OrdinalIgnoreCase)&&CandidateFingerprint.Equals(candidate,StringComparison.OrdinalIgnoreCase)&&DateTime.TryParse(ExpiresUtc,System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.AdjustToUniversal|System.Globalization.DateTimeStyles.AssumeUniversal,out until)&&until>now&&until-now<=TimeSpan.FromHours(2),"fresh separate experiment approval not established");}
 }
 // Bounded copied observations; only this background worker performs streaming disk I/O.
 public sealed class ExperimentWriter:IDisposable
 {
  private readonly BlockingCollection<Reading> queue=new BlockingCollection<Reading>(256);private readonly Thread thread;private volatile bool failed,closed;public bool Failed {get{return failed;}}public bool Closed {get{return closed;}}
  public ExperimentWriter(string file){PrivateFiles.RequireLocal(file);Check.That(!File.Exists(file),"new stream required");var stream=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.Read);thread=new Thread(delegate(){try{using(stream)using(var w=new StreamWriter(stream)){foreach(var r in queue.GetConsumingEnumerable()){using(var b=new MemoryStream()){new DataContractJsonSerializer(typeof(Reading)).WriteObject(b,r);w.WriteLine(System.Text.Encoding.UTF8.GetString(b.ToArray()));}w.Flush();}}closed=true;}catch{failed=true;}});thread.IsBackground=true;thread.Name="RichAudio bounded benchmark evidence writer";thread.Start();}
  public bool Add(Reading r){return !failed&&!closed&&!queue.IsAddingCompleted&&queue.TryAdd(r.Copy());}
  public void Dispose(){queue.CompleteAdding();if(!thread.Join(2000))failed=true;}
 }
}
