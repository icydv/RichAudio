// Original synthetic material only. Calls the separately built pinned public
// GTACrypto implementation, never a key loader, archive API or game executable.
using System;
using System.IO;
using System.Collections;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using CodeWalker.GameFiles;
public static class NgReference041 {
 static void Need(bool ok,string why){if(!ok)throw new Exception(why);}
 static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 public static int Main(string[] args){try{
  Need(args.Length==1,"One exact synthetic input required");byte[] input=File.ReadAllBytes(args[0]);Need(input.Length<=2097152,"Bounded synthetic oracle packet");
  var json=new JavaScriptSerializer{MaxJsonLength=2097152,RecursionLimit=12};var packet=json.Deserialize<Dictionary<string,object>>(System.Text.Encoding.UTF8.GetString(input));
  Need((string)packet["kind"]=="original-synthetic-ng-oracle041","Synthetic fixture required");var material=(Dictionary<string,object>)packet["material"];
  var keys=Convert.FromBase64String((string)material["expandedKeys"]);var tables=Convert.FromBase64String((string)material["tables"]);var lut=Convert.FromBase64String((string)material["hashLut"]);
  Need(keys.Length==27472&&tables.Length==278528&&lut.Length==256,"Exact original synthetic profile dimensions");
  GTA5Keys.PC_NG_KEYS=new byte[101][];for(int i=0;i<101;i++){GTA5Keys.PC_NG_KEYS[i]=new byte[272];Buffer.BlockCopy(keys,i*272,GTA5Keys.PC_NG_KEYS[i],0,272);}
  GTA5Keys.PC_NG_DECRYPT_TABLES=new uint[17][][];for(int r=0;r<17;r++){GTA5Keys.PC_NG_DECRYPT_TABLES[r]=new uint[16][];for(int s=0;s<16;s++){var table=new uint[256];Buffer.BlockCopy(tables,(r*16+s)*1024,table,0,1024);GTA5Keys.PC_NG_DECRYPT_TABLES[r][s]=table;}}
  GTA5Keys.PC_LUT=lut;var output=new List<object>();
  foreach(Dictionary<string,object> test in (IEnumerable)packet["cases"]){string name=(string)test["archiveName"];uint length=unchecked((uint)Convert.ToUInt64(test["archiveBytes"]));var bytes=Convert.FromBase64String((string)test["cipher"]);Need(bytes.Length<=16384,"Bounded synthetic oracle ciphertext");
   byte[] selected=GTACrypto.GetNGKey(name,length);int index=Array.FindIndex(GTA5Keys.PC_NG_KEYS,k=>Object.ReferenceEquals(k,selected));var decoded=GTACrypto.DecryptNG(bytes,name,length);
   output.Add(new{ id=(string)test["id"],filenameHash=GTA5Hash.CalculateHash(name),keyIndex=index,selectedKeySHA256=Hash(selected),decodedSHA256=Hash(decoded),decodedBytes=decoded.Length });
  }
  Console.WriteLine(json.Serialize(new{kind="pinned-CodeWalker-synthetic-NG-oracle041",sourceCommit="485d56bec00262ed7fa472261cce7bbc6202b96e",parserSHA256=Hash(File.ReadAllBytes(typeof(GTACrypto).Assembly.Location)),cases=output,gameFilesRead=false,realKeysLoaded=false,enhancedCompatibilityVerified=false}));return 0;
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
}
