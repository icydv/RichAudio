using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;
using RichAudio.GateA.Private01.Supervision;

// Calls the production candidate-only Validate path. It never calls Run, opens
// a notice, captures a process identity, or launches/attaches to a game process.
public static class TestPrivateCandidateManifest01 {
 static readonly List<object> Cases=new List<object>();
 static readonly MethodInfo Validate=typeof(SupervisorMonitor).GetMethod("Validate",BindingFlags.Static|BindingFlags.NonPublic);
 const string Session="ebc9544211b1432eb6f3e8cf86138dbb";
 const string RetainedSha256="94e12d15691d3698144497d7bbcd60f99d9eab7801ba97dd878e41fb5174ef27";
 const string Prefix="{\"session\":\""+Session+"\",\"experiment\":\"GATE-A-SHVDNE-PRIVATE-03D\",\"padding\":\"";
 const string Suffix="\"}";
 static SupervisorConfiguration Config(string manifest,string directory){return new SupervisorConfiguration{
  Schema=1,Mode="candidate",Session=Session,ProcessId=1,ProcessStartUtcTicks=1,
  Executable=Assembly.GetExecutingAssembly().Location,EvidenceRoot=directory,ShowUi=true,
  FixedHardDeadlineQpc=1,ExecutionManifestPath=manifest,ExecutionManifestSha256=SupervisorFiles.Hash(manifest),
  Restoration=new[]{new RestorationCheck{Path=Path.Combine(directory,"never-installed"),Absent=true}}
 };}
 static void Invoke(SupervisorConfiguration c){
  if(c.Mode!="candidate")throw new Exception("Test must exercise candidate mode");
  try{Validate.Invoke(null,new object[]{c});}catch(TargetInvocationException e){throw e.InnerException;}
 }
 static void Check(bool value,string name){if(!value)throw new Exception(name);Cases.Add(new{name,passed=true});}
 static void Accept(SupervisorConfiguration c,string name){Invoke(c);Cases.Add(new{name,passed=true,mode=c.Mode});}
 static void Reject(SupervisorConfiguration c,string name,string message){
  Exception error=null;try{Invoke(c);}catch(Exception e){error=e;}
  if(error==null||message!=null&&!error.Message.Contains(message))throw new Exception(name+": expected rejection "+message+"; got "+error);
  Cases.Add(new{name,passed=true,mode=c.Mode,rejectedAs=error.GetType().Name,reason=error.Message.Length>256?error.Message.Substring(0,256):error.Message});
 }
 static string Save(string directory,string name,string text){string path=Path.Combine(directory,name+".json");File.WriteAllText(path,text,new UTF8Encoding(false,true));return path;}
 static SupervisorConfiguration TextCase(string directory,string name,string text){return Config(Save(directory,name,text),directory);}
 public static int Main(string[] args){try{
  if(args.Length!=2)throw new ArgumentException("retained execution manifest and new test directory required");
  string manifest=Path.GetFullPath(args[0]),directory=Path.GetFullPath(args[1]);Directory.CreateDirectory(directory);
  Check(Validate!=null,"production candidate admission method exists");
  Check(typeof(SupervisorConfiguration).GetProperty("FixtureArmPath")==null,"candidate binary has no fixture controls");
  Check(SupervisorFiles.Hash(manifest)==RetainedSha256,"original consumed PRIVATE03I manifest identity");
  var retained=Config(manifest,directory);string original=File.ReadAllText(manifest,new UTF8Encoding(false,true));
  Check(original.Length==2863378&&new FileInfo(manifest).Length==2863378,"actual production byte and character lengths");
  bool oldRejected=false;try{new JavaScriptSerializer().DeserializeObject(original);}catch(ArgumentException){oldRejected=true;}
  Check(oldRejected,"default parser reproduces original size rejection");
  Accept(retained,"actual production manifest through candidate Validate");
  retained.ExecutionManifestSha256=new string('0',64);Reject(retained,"wrong retained hash","candidate manifest binding required");
  retained=Config(manifest,directory);retained.Session=new string('a',32);Reject(retained,"wrong session","candidate manifest session differs");
  retained=Config(manifest,directory);retained.ShowUi=false;Reject(retained,"candidate still requires visible notice","explicit monitor configuration required");
  retained=Config(manifest,directory);retained.FixedHardDeadlineQpc=0;Reject(retained,"candidate still requires fixed deadline","candidate manifest binding required");
  retained=Config(manifest,directory);retained.Restoration=new RestorationCheck[0];Reject(retained,"remaining production validation still runs","bounded explicit restoration checks required");
  Reject(TextCase(directory,"malformed",original.Substring(0,original.Length-20)),"truncated actual production manifest",null);
  Reject(TextCase(directory,"empty",""),"empty manifest","candidate manifest byte bound");
  Reject(TextCase(directory,"null","null"),"null manifest","candidate manifest session differs");
  Reject(TextCase(directory,"wrong-root","[]"),"array root",null);
  Reject(TextCase(directory,"missing-scope","{}"),"missing manifest scope","candidate manifest session differs");
  Reject(TextCase(directory,"wrong-scope","{\"session\":\""+Session+"\",\"experiment\":\"wrong\"}"),"wrong experiment","candidate manifest session differs");
  int characters=3*1024*1024,bytes=4*1024*1024;
  Accept(TextCase(directory,"character-limit",Prefix+new string('x',characters-Prefix.Length-Suffix.Length)+Suffix),"exact decoded character limit");
  Reject(TextCase(directory,"too-many-characters",Prefix+new string('x',characters-Prefix.Length-Suffix.Length+1)+Suffix),"decoded character limit independent of byte limit","candidate manifest character bound");
  int remaining=bytes-Encoding.UTF8.GetByteCount(Prefix+Suffix);
  string unicode=Prefix+new string('\u00e9',remaining/2)+(remaining%2==0?"":"x")+Suffix;
  var unicodeConfig=TextCase(directory,"byte-limit",unicode);
  Check(new FileInfo(unicodeConfig.ExecutionManifestPath).Length==bytes&&unicode.Length<characters,"UTF-8 byte length differs from decoded character length");
  Accept(unicodeConfig,"exact UTF-8 byte limit with multibyte content");
  Reject(TextCase(directory,"too-many-bytes",unicode+" "),"byte limit independent of character limit","candidate manifest byte bound");
  string bom=Save(directory,"bom",Prefix+Suffix);File.WriteAllBytes(bom,new UTF8Encoding(true,true).GetPreamble());
  using(var writer=new StreamWriter(new FileStream(bom,FileMode.Append),new UTF8Encoding(false,true)))writer.Write(Prefix+Suffix);
  Accept(Config(bom,directory),"UTF-8 BOM included in digest and byte count");
  string invalid=Path.Combine(directory,"invalid-utf8.json");File.WriteAllBytes(invalid,new byte[]{123,34,0xff,34,58,48,125});
  Reject(Config(invalid,directory),"invalid UTF-8",null);
  string nested="0";for(int i=0;i<12;i++)nested="["+nested+"]";
  Reject(TextCase(directory,"too-deep","{\"session\":\""+Session+"\",\"experiment\":\"GATE-A-SHVDNE-PRIVATE-03D\",\"nested\":"+nested+"}"),"explicit recursion bound",null);
  Check(SupervisorFiles.Hash(manifest)==RetainedSha256,"original manifest remains byte-identical after tests");
  Console.WriteLine(new JavaScriptSerializer().Serialize(new{passed=true,checks=Cases.Count,candidateBinary=typeof(SupervisorMonitor).Assembly.Location,candidateSha256=SupervisorFiles.Hash(typeof(SupervisorMonitor).Assembly.Location),retainedManifest=manifest,retainedManifestSha256=RetainedSha256,retainedBytes=2863378,retainedCharacters=2863378,maximumBytes=bytes,maximumCharacters=characters,maximumDepth=8,productionCandidateValidate=true,fixtureMode=false,gameLaunched=false,liveAuthorized=false,cases=Cases}));return 0;
 }catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
