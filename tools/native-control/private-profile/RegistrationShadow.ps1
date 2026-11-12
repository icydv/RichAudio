# Build a complete private OPEN update archive shadow. Never writes to GTA.
# Windows PowerShell 5.1 for the retained CodeWalker dev46 binary.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$GameRoot,
 [Parameter(Mandatory=$true)][string]$Pack,
 [Parameter(Mandatory=$true)][string]$Output,
 [string]$CodeWalkerRoot='C:\Users\Libby\Desktop\CodeWalker30_dev46'
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local\gate-a-shvdne-private-01\registration')).TrimEnd('\')+'\'
$out=[IO.Path]::GetFullPath($Output)
if(!$out.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh private registration output required'}
if($Pack-cnotmatch'^ra_private01_[a-f0-9]{8}$'){throw 'Exact private pack namespace required'}
foreach($path in @($out,$GameRoot,$CodeWalkerRoot)){for($p=[IO.Path]::GetFullPath($path);$p;$p=[IO.Path]::GetDirectoryName($p)){if((Test-Path -LiteralPath $p)-and((Get-Item -LiteralPath $p -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked input/output refused'}}}
$source=Join-Path ([IO.Path]::GetFullPath($GameRoot)) 'update\update.rpf'
$core=Join-Path $CodeWalkerRoot 'CodeWalker.Core.dll'
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
if((Hash $core)-cne'3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'){throw 'Pinned retained CodeWalker required'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$receipt=[ordered]@{schema=1;kind='complete-private-Gen9-shadow';state='preparing';pack=$Pack;source=$source;sourceBytes=(Get-Item $source).Length;sourceSha256=(Hash $source);gameFilesWritten=$false;runtimeMountVerified=$false;approvedForInstallation=$false;failure=$null}
$receiptPath=Join-Path $out 'shadow-receipt.json'
$target=Join-Path $out 'update.rpf'
try {
 foreach($dll in Get-ChildItem -LiteralPath $CodeWalkerRoot -Filter '*.dll'){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($dll.FullName))|Out-Null}
 Import-Module (Join-Path $repo 'src\acoustics\startup\CodeWalkerInitialization01.psm1') -Force
 $receipt.initialization=Initialize-InstalledCodeWalker01 -GameRoot $GameRoot
 Add-Type -TypeDefinition @'
using System;using System.IO;using System.Security.Cryptography;
public static class RegistrationRawHash {
 public static string Read(FileStream s,long offset,long count) {
  if(offset<0||count<0||offset>s.Length-count)throw new InvalidDataException("Entry outside archive");
  s.Position=offset;var b=new byte[1048576];using(var sha=SHA256.Create()){
   while(count>0){int n=s.Read(b,0,(int)Math.Min(count,b.Length));if(n==0)throw new EndOfStreamException();sha.TransformBlock(b,0,n,b,0);count-=n;}
   sha.TransformFinalBlock(b,0,0);return BitConverter.ToString(sha.Hash).Replace("-","").ToLowerInvariant();
  }
 }
}
'@
 function Scan([string]$path){
  $rpf=New-Object CodeWalker.GameFiles.RpfFile($path,'update\update.rpf')
  $errors=New-Object 'System.Collections.Generic.List[string]'
  $rpf.ScanStructure($null,[Action[string]]{param($s)$errors.Add($s)})
  if($rpf.LastError-or$errors.Count){throw ('Archive scan failed: '+$rpf.LastError+'; '+($errors-join'; '))}
  return $rpf
 }
 function Inventory($rpf,[string]$path){
  $rows=New-Object 'System.Collections.Generic.List[object]'
  $s=[IO.File]::OpenRead($path)
  try {foreach($e in $rpf.AllEntries){
   $row=[ordered]@{path=$e.Path;type=$e.GetType().Name;name=$e.Name}
   if($e-is[CodeWalker.GameFiles.RpfFileEntry]){
    $row.size=$e.GetFileSize();$row.storedSize=$e.FileSize;$row.encrypted=$e.IsEncrypted
    if($e-is[CodeWalker.GameFiles.RpfBinaryFileEntry]){$row.uncompressedSize=$e.FileUncompressedSize;$row.encryptionType=$e.EncryptionType}
    if($e-is[CodeWalker.GameFiles.RpfResourceFileEntry]){$row.systemFlags=$e.SystemFlags.Value;$row.graphicsFlags=$e.GraphicsFlags.Value}
    $row.rawSha256=[RegistrationRawHash]::Read($s,$rpf.StartPos+[long]$e.FileOffset*512,$e.GetFileSize())
   }
   $rows.Add([pscustomobject]$row)
  }}finally{$s.Dispose()}
  return @($rows.ToArray()|Sort-Object path)
 }
 Write-Output 'Reading complete original member inventory.'
 $original=Scan $source
 $receipt.sourceEncryption=$original.Encryption.ToString()
 $before=Inventory $original $source
 $before|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $out 'original-members.json') -Encoding UTF8
 $entries=@($original.AllEntries|Where-Object {$_.Path-ceq'update\update.rpf\common\data\dlclist.xml'})
 if($entries.Count-ne1){throw 'Exact unique DLC list required'}
 $listBytes=$original.ExtractFile($entries[0]);if(!$listBytes-or$listBytes.Length-gt1MB){throw 'Bounded DLC list required'}
 [IO.File]::WriteAllBytes((Join-Path $out 'dlclist.original.xml'),$listBytes)
 $xml=New-Object Xml.XmlDocument;$xml.PreserveWhitespace=$true;$xml.LoadXml([Text.Encoding]::UTF8.GetString($listBytes).TrimStart([char]0xfeff))
 $paths=$xml.SelectSingleNode('/SMandatoryPacksData/Paths');$mount='dlcpacks:/'+$Pack+'/'
 if(!$paths-or@($paths.SelectNodes('Item')|Where-Object {$_.InnerText-ieq$mount}).Count){throw 'Malformed or already registered list'}
 $originalItems=@($paths.SelectNodes('Item')|ForEach-Object OuterXml)
 $item=$xml.CreateElement('Item');$item.InnerText=$mount;[void]$paths.AppendChild($item)
 $newList=[Text.UTF8Encoding]::new($false).GetBytes($xml.OuterXml)
 Write-Output 'Copying complete original archive into private worktree.'
 [IO.File]::Copy($source,$target,$false)
 if((Hash $target)-cne$receipt.sourceSha256){throw 'Full private copy differs'}
 $privateRpf=Scan $target
 [CodeWalker.GameFiles.RpfFile]::SetEncryptionType($privateRpf,[CodeWalker.GameFiles.RpfEncryption]::OPEN)
 $privateRpf=Scan $target
 if($privateRpf.Encryption-ne[CodeWalker.GameFiles.RpfEncryption]::OPEN){throw 'OPEN table conversion failed'}
 $entry=@($privateRpf.AllEntries|Where-Object {$_.Path-ceq'update\update.rpf\common\data\dlclist.xml'})
 [void][CodeWalker.GameFiles.RpfFile]::CreateFile($entry[0].Parent,'dlclist.xml',$newList,$true)
 Write-Output 'Verifying every untouched raw member and resource flag.'
 $afterRpf=Scan $target;$after=Inventory $afterRpf $target
 if($before.Count-ne$after.Count){throw 'Archive entry count changed'}
 $listPath='update\update.rpf\common\data\dlclist.xml'
 $verified=0
 for($i=0;$i-lt$before.Count;$i++){
  if($before[$i].path-cne$after[$i].path){throw 'Archive path tree changed'}
  if($before[$i].path-ceq$listPath){continue}
  if(($before[$i]|ConvertTo-Json -Compress)-cne($after[$i]|ConvertTo-Json -Compress)){throw ('Untouched archive member differs: '+$before[$i].path)}
  $verified++
 }
 $changed=@($afterRpf.AllEntries|Where-Object {$_.Path-ceq$listPath})
 $roundtrip=$afterRpf.ExtractFile($changed[0])
 if([Convert]::ToBase64String($roundtrip)-cne[Convert]::ToBase64String($newList)){throw 'DLC-list byte readback differs'}
 $check=New-Object Xml.XmlDocument;$check.PreserveWhitespace=$true;$check.LoadXml([Text.Encoding]::UTF8.GetString($roundtrip))
 $items=@($check.SelectNodes('/SMandatoryPacksData/Paths/Item'))
 if($items.Count-ne$originalItems.Count+1-or$items[-1].InnerText-cne$mount){throw 'Expected single append only'}
 for($i=0;$i-lt$originalItems.Count;$i++){if($items[$i].OuterXml-cne$originalItems[$i]){throw 'Original DLC declaration changed'}}
 [IO.File]::WriteAllBytes((Join-Path $out 'dlclist.candidate.xml'),$newList)
 $after|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $out 'candidate-members.json') -Encoding UTF8
 $receipt.state='offline-complete-shadow-verified';$receipt.shadow=$target;$receipt.shadowSha256=Hash $target;$receipt.shadowBytes=(Get-Item $target).Length
 $receipt.entries=$before.Count;$receipt.untouchedEntriesVerified=$verified;$receipt.originalDlcItems=$originalItems.Count;$receipt.appendedMount=$mount
 $receipt.originalDlclistSha256=Hash (Join-Path $out 'dlclist.original.xml');$receipt.candidateDlclistSha256=Hash (Join-Path $out 'dlclist.candidate.xml')
 $receipt.proposedDestination='mods/update/update.rpf';$receipt.scope='Complete source archive copied; only top-level OPEN table and dlclist member intentionally rewritten; every other raw member and metadata compared including complete nested archive bytes. No runtime mount proof.'
}catch{$receipt.state='refused';$receipt.failure=$_.Exception.Message;throw}
finally{
 $receipt.sourceAfterSha256=Hash $source;$receipt.sourceUnchanged=$receipt.sourceAfterSha256-ceq$receipt.sourceSha256
 $receipt|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $receiptPath -Encoding UTF8
 if(!$receipt.sourceUnchanged){throw 'Original archive changed during preparation'}
}
Write-Output ('PASS complete private shadow: '+$receiptPath)
