using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;

namespace RichAudio {
 [DataContract] internal sealed class ProfileProbeRequest {
  [DataMember(IsRequired=true)] public string ProfileA {get;set;}
  [DataMember(IsRequired=true)] public string MarkerA {get;set;}
  [DataMember(IsRequired=true)] public string Mode {get;set;}
  [DataMember] public string ProfileB {get;set;}
  [DataMember] public string MarkerB {get;set;}
  [DataMember(IsRequired=true)] public float X {get;set;}
  [DataMember(IsRequired=true)] public float Y {get;set;}
  [DataMember(IsRequired=true)] public float Z {get;set;}
 }
 internal static class ProfileProbeInput {
  internal static ProfileProbeRequest Open(){
   if(String.IsNullOrEmpty(ProfileProbeBuild.RequestSHA256))throw new InvalidOperationException("no sealed marker request");
   string path=Path.Combine(ObservationBuild.SessionDirectory,"profile-request.json");
   for(string at=path;at!=null;at=Path.GetDirectoryName(at)){
    if((File.Exists(at)||Directory.Exists(at))&&(File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)
     throw new InvalidDataException("linked marker request");
   }
   using(var input=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read))
   using(var sha=SHA256.Create()){
    if(input.Length<=0||input.Length>2048)throw new InvalidDataException("marker request size");
    string actual=BitConverter.ToString(sha.ComputeHash(input)).Replace("-","");
    if(!String.Equals(actual,ProfileProbeBuild.RequestSHA256,StringComparison.OrdinalIgnoreCase))
     throw new InvalidDataException("marker request differs from the build pin");
    input.Position=0;
    return (ProfileProbeRequest)new DataContractJsonSerializer(typeof(ProfileProbeRequest)).ReadObject(input);
   }
  }
 }
}
