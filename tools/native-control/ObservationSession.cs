using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace RichAudio {
 [DataContract] internal sealed class ObservationSchedule {
  [DataMember(IsRequired=true)] public string Session {get;set;}
  [DataMember(IsRequired=true)] public long ArmByUtcMs {get;set;}
  [DataMember(IsRequired=true)] public long StopByUtcMs {get;set;}
 }
 [DataContract] internal sealed class ObservationBinding {
  [DataMember(IsRequired=true)] public string Session {get;set;}
  [DataMember(IsRequired=true)] public int GamePid {get;set;}
  [DataMember(IsRequired=true)] public string GameCreation {get;set;}
  [DataMember(IsRequired=true)] public int ReceiverPid {get;set;}
  [DataMember(IsRequired=true)] public string ReceiverCreation {get;set;}
 }

 internal sealed class ObservationSession {
  readonly long clockStart=Stopwatch.GetTimestamp(), utcStart=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
  internal string Token {get;private set;}
  internal long ArmBy {get;private set;}
  internal long StopBy {get;private set;}
  readonly int gamePid;
  readonly string gameCreation;
  static string PathFor(string name){return Path.Combine(ObservationBuild.SessionDirectory,name);}

  static void CheckPath(string path){
   for(string at=path;at!=null;at=Path.GetDirectoryName(at)){
    if((File.Exists(at)||Directory.Exists(at))&&(File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)
     throw new InvalidDataException("linked observation session path");
   }
  }

  static T Read<T>(string name){
   string path=PathFor(name);
   CheckPath(path);
   using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)){
    if(file.Length<=0||file.Length>2048)throw new InvalidDataException("observation session size");
    return (T)new DataContractJsonSerializer(typeof(T)).ReadObject(file);
   }
  }

  internal static string Creation(Process process){
   return process.StartTime.ToUniversalTime().ToFileTimeUtc().ToString(System.Globalization.CultureInfo.InvariantCulture);
  }

  ObservationSession(ObservationSchedule schedule){
   Guid token;
   if(!Guid.TryParseExact(schedule.Session,"N",out token)||token==Guid.Empty||schedule.Session!=token.ToString("N")||
      schedule.ArmByUtcMs<=utcStart||schedule.StopByUtcMs<=schedule.ArmByUtcMs||
      schedule.StopByUtcMs-utcStart>25*60*1000)throw new InvalidDataException("invalid or expired observation schedule");
   Token=schedule.Session;
   ArmBy=schedule.ArmByUtcMs;
   StopBy=schedule.StopByUtcMs;
   using(var game=Process.GetCurrentProcess()){gamePid=game.Id;gameCreation=Creation(game);}
  }

  internal static ObservationSession Open(){
   var session=new ObservationSession(Read<ObservationSchedule>("observation-schedule.json"));
   string path=PathFor("observation-owner.json");
   CheckPath(path);
   if(File.Exists(path))throw new InvalidDataException("observation session already claimed");
   // The fixed sealed directory makes the retained create-new marker an
   // inter-AppDomain claim for this approval, even after the owner exits.
   using(var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read))
   using(var writer=new StreamWriter(file)){
    writer.Write("{\"session\":\""+session.Token+"\",\"gamePid\":"+session.gamePid+",\"gameCreation\":\""+session.gameCreation+"\"}");
    writer.Flush();file.Flush(true);
   }
   return session;
  }

  internal bool Before(long utcDeadline){
   return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()<utcDeadline&&
    (Stopwatch.GetTimestamp()-clockStart)*1000d/Stopwatch.Frequency<utcDeadline-utcStart;
  }

  internal ObservationBinding TryBind(out Process receiver){
   receiver=null;
   if(!File.Exists(PathFor("observation-binding.json")))return null;
   var binding=Read<ObservationBinding>("observation-binding.json");
   if(binding.Session!=Token||binding.GamePid!=gamePid||binding.GameCreation!=gameCreation||
      binding.ReceiverPid<=0||binding.ReceiverPid==gamePid)throw new InvalidDataException("observation binding does not match the owner");
   var candidate=Process.GetProcessById(binding.ReceiverPid);
   try{
    GC.KeepAlive(candidate.Handle);
    if(candidate.HasExited||Creation(candidate)!=binding.ReceiverCreation)
     throw new InvalidDataException("observation receiver lifetime mismatch");
    receiver=candidate;
    return binding;
   }finally{if(receiver==null)candidate.Dispose();}
  }
 }
}
