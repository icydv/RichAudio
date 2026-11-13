using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Collections.Generic;

// File/catalog metadata only. No target process, repair, registration or loading.
public static class CatalogEvidence {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct CatalogInfo {
  public uint Size;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string Path;
 }
 [DllImport("wintrust.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CryptCATAdminAcquireContext2(out IntPtr admin,IntPtr subsystem,string algorithm,IntPtr policy,uint flags);
 [DllImport("wintrust.dll",SetLastError=true)] static extern bool CryptCATAdminCalcHashFromFileHandle2(IntPtr admin,IntPtr file,ref uint size,byte[] hash,uint flags);
 [DllImport("wintrust.dll",SetLastError=true)] static extern IntPtr CryptCATAdminEnumCatalogFromHash(IntPtr admin,byte[] hash,uint size,uint flags,ref IntPtr previous);
 [DllImport("wintrust.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CryptCATCatalogInfoFromContext(IntPtr context,ref CatalogInfo info,uint flags);
 [DllImport("wintrust.dll")] static extern bool CryptCATAdminReleaseCatalogContext(IntPtr admin,IntPtr context,uint flags);
 [DllImport("wintrust.dll")] static extern bool CryptCATAdminReleaseContext(IntPtr admin,uint flags);
 static object Inspect(string path){
  var catalogs=new List<string>();IntPtr admin;
  if(!CryptCATAdminAcquireContext2(out admin,IntPtr.Zero,"SHA256",IntPtr.Zero,0))throw new System.ComponentModel.Win32Exception();
  try {using(var f=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)){
   uint size=0;CryptCATAdminCalcHashFromFileHandle2(admin,f.SafeFileHandle.DangerousGetHandle(),ref size,null,0);
   if(size==0||size>128)throw new InvalidDataException("catalog digest length");var hash=new byte[size];
   if(!CryptCATAdminCalcHashFromFileHandle2(admin,f.SafeFileHandle.DangerousGetHandle(),ref size,hash,0))throw new System.ComponentModel.Win32Exception();
   IntPtr previous=IntPtr.Zero;var context=CryptCATAdminEnumCatalogFromHash(admin,hash,size,0,ref previous);
   if(context!=IntPtr.Zero){try {var info=new CatalogInfo{Size=(uint)Marshal.SizeOf(typeof(CatalogInfo))};if(!CryptCATCatalogInfoFromContext(context,ref info,0))throw new System.ComponentModel.Win32Exception();catalogs.Add(info.Path);}finally{CryptCATAdminReleaseCatalogContext(admin,context,0);}}
   return new{path=System.IO.Path.GetFullPath(path),memberHash=BitConverter.ToString(hash).Replace("-","").ToLowerInvariant(),algorithm="SHA256 Authenticode/catalog member digest; distinct from raw file SHA256",catalogs=catalogs};
  }}finally{CryptCATAdminReleaseContext(admin,0);}
 }
 public static int Main(string[] args){try {if(args.Length!=1)throw new ArgumentException("one file list JSON");var json=new JavaScriptSerializer();var paths=json.Deserialize<string[]>(File.ReadAllText(args[0]));var rows=new List<object>();foreach(string path in paths)rows.Add(Inspect(path));Console.WriteLine(json.Serialize(rows));return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
