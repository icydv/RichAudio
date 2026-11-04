// Original fixture bytes only. Controlled Windows file-handle/mapping lifetime.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;
public static class RuntimeCleanup13 {
 [StructLayout(LayoutKind.Sequential)]struct Info {public uint Attributes;public System.Runtime.InteropServices.ComTypes.FILETIME Created,Accessed,Written;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle file,out Info info);
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateFileMapping(SafeFileHandle file,IntPtr security,uint protection,uint high,uint low,string name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr MapViewOfFile(IntPtr mapping,uint access,uint high,uint low,UIntPtr bytes);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool UnmapViewOfFile(IntPtr view);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetFileInformationByHandle(SafeFileHandle file,int kind,ref int info,uint size);
 static void Need(bool ok,string operation){if(!ok)throw new Exception(operation+":"+Marshal.GetLastWin32Error());}
 static bool Same(Info a,Info b){return a.Volume==b.Volume&&a.IndexHigh==b.IndexHigh&&a.IndexLow==b.IndexLow&&a.SizeHigh==b.SizeHigh&&a.SizeLow==b.SizeLow&&a.Written.dwHighDateTime==b.Written.dwHighDateTime&&a.Written.dwLowDateTime==b.Written.dwLowDateTime&&b.Links==1;}
 static int DeleteBound(string[] args){
  var parents=new List<SafeFileHandle>();SafeFileHandle file=null;
  try{
   if(args.Length!=7)throw new Exception("bound deletion arguments required");
   string target=Path.GetFullPath(args[1]),stage=Path.GetDirectoryName(target),root=Path.GetDirectoryName(stage);
   if(Path.GetFileName(target)!="node.exe"||Path.GetFileName(stage)!="stage"||Path.GetFileName(Path.GetDirectoryName(root))!=".local"||!Regex.IsMatch(Path.GetFileName(root),"^world041-contained-[A-Za-z0-9]{6}$"))throw new Exception("owned literal runtime target required");
   // Held non-delete-sharing directory handles prevent parent rename between
   // validation and the single handle-bound disposition request.
   var chain=new List<string>();for(string at=stage;!string.IsNullOrEmpty(at);at=Path.GetDirectoryName(at))chain.Add(at);chain.Reverse();
   foreach(string at in chain){var parent=CreateFile(at,0x80,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);Need(!parent.IsInvalid,"parent open");parents.Add(parent);Info pi;Need(GetFileInformationByHandle(parent,out pi)&&(pi.Attributes&0x400)==0&&(pi.Attributes&0x10)!=0,"parent identity");}
   file=CreateFile(target,0x80010000,5,IntPtr.Zero,3,0x00200000,IntPtr.Zero);
   if(file.IsInvalid){int code=Marshal.GetLastWin32Error();Console.WriteLine("{\"state\":\"unavailable\",\"operation\":\"CreateFileW\",\"win32Code\":"+code+",\"deleteAccessAcquired\":false,\"dispositionAttempted\":false,\"dispositionAccepted\":false}");return 0;}
   Info before;Need(GetFileInformationByHandle(file,out before),"bound identity");
   ulong index=((ulong)before.IndexHigh<<32)|before.IndexLow,size=((ulong)before.SizeHigh<<32)|before.SizeLow;
   ulong written=((ulong)(uint)before.Written.dwHighDateTime<<32)|(uint)before.Written.dwLowDateTime;
   Need((before.Attributes&0x410)==0&&before.Links==1&&before.Volume==uint.Parse(args[2])&&index==ulong.Parse(args[3])&&size==ulong.Parse(args[4])&&written>=116444736000000000UL&&(written-116444736000000000UL)*100UL==ulong.Parse(args[5])&&size>0&&size<=134217728,"expected identity drift");
   using(var stream=new FileStream(file,FileAccess.Read)){
    string digest;using(var sha=SHA256.Create())digest=BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();Need(digest==args[6],"expected content drift");
    Info after;Need(GetFileInformationByHandle(file,out after)&&Same(before,after),"identity changed while hashing");
    // FileDispositionInfoEx: DELETE | POSIX_SEMANTICS. No read-only override,
    // fallback deletion, attribute edits or image-check bypass is requested.
    int deletion=3;bool requested=SetFileInformationByHandle(file,21,ref deletion,4);int code=requested?0:Marshal.GetLastWin32Error();
    Console.WriteLine("{\"state\":\""+(requested?"deleted":"disposition-failed")+"\",\"operation\":\"SetFileInformationByHandle\",\"informationClass\":21,\"dispositionFlags\":3,\"win32Code\":"+code+",\"deleteAccessAcquired\":true,\"identityMatched\":true,\"sha256Matched\":true,\"dispositionAttempted\":true,\"dispositionAccepted\":"+(requested?"true":"false")+"}");
   }
   return 0;
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
  finally{if(file!=null)file.Dispose();for(int i=parents.Count-1;i>=0;i--)parents[i].Dispose();}
 }
 public static int Main(string[] args){
  if(args.Length>0&&args[0]=="delete-bound")return DeleteBound(args);
  SafeFileHandle file=null;IntPtr mapping=IntPtr.Zero,view=IntPtr.Zero;
  try{
   if(args.Length!=2)throw new Exception("mode and original owned target required");
   string mode=args[0],target=Path.GetFullPath(args[1]);
   if(mode!="no-delete-share"&&mode!="delete-share"&&mode!="data-map"&&mode!="image-map")throw new Exception("unknown mode");
   file=CreateFile(target,0x80000000,mode=="no-delete-share"?1u:7u,IntPtr.Zero,3,0x00200000,IntPtr.Zero);Need(!file.IsInvalid,"open");Info info;Need(GetFileInformationByHandle(file,out info),"identity");Need((info.Attributes&0x410)==0&&info.Links==1,"regular single-link file");
   if(mode=="data-map"||mode=="image-map"){
    mapping=CreateFileMapping(file,IntPtr.Zero,mode=="image-map"?0x01000002u:2u,0,0,null);Need(mapping!=IntPtr.Zero,"mapping");
    view=MapViewOfFile(mapping,4,0,0,UIntPtr.Zero);Need(view!=IntPtr.Zero,"view");
    // A mapping has an independently observable lifetime after its file handle.
    file.Dispose();file=null;
   }
   Console.WriteLine("{\"stage\":\"held\",\"mode\":\""+mode+"\",\"volume\":"+info.Volume+",\"fileIndex\":\""+(((ulong)info.IndexHigh<<32)|info.IndexLow)+"\",\"fileHandleClosed\":"+(file==null?"true":"false")+",\"mappingHeld\":"+(mapping!=IntPtr.Zero?"true":"false")+"}");Console.Out.Flush();
   if(Console.ReadLine()!="release")throw new Exception("explicit release command required");
   if(view!=IntPtr.Zero){Need(UnmapViewOfFile(view),"unmap");view=IntPtr.Zero;}
   if(mapping!=IntPtr.Zero){Need(CloseHandle(mapping),"mapping close");mapping=IntPtr.Zero;}
   if(file!=null){file.Dispose();file=null;}
   Console.WriteLine("{\"stage\":\"released\",\"fileHandleClosed\":true,\"mappingHeld\":false}");Console.Out.Flush();
   return 0;
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
  finally{if(view!=IntPtr.Zero)UnmapViewOfFile(view);if(mapping!=IntPtr.Zero)CloseHandle(mapping);if(file!=null)file.Dispose();}
 }
}
