#requires -Version 7.0
[CmdletBinding()]
param([string]$Binary='',[string]$Output='')
$ErrorActionPreference='Stop'

function Get-ShvExpectedExports {
 @('?nativeInit@@YAX_K@Z','?nativePush64@@YAX_K@Z','?nativeCall@@YAPEA_KXZ','?scriptRegister@@YAXPEAUHINSTANCE__@@P6AXXZ@Z','?scriptUnregister@@YAXPEAUHINSTANCE__@@@Z','?scriptWait@@YAXK@Z')
}

function Assert-ShvBuildOutputPath([string]$Path,[string]$Repository,[string]$GameRoot) {
 $full=[IO.Path]::GetFullPath($Path);$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\','/')
 if($full.Equals($game,[StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($game+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Refusing build or inspection output inside the game installation.'}
 $allowed=$false
 foreach($name in @('build','.local')){
  $root=[IO.Path]::GetFullPath((Join-Path $Repository $name)).TrimEnd('\','/')
  if($full.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){$allowed=$true}
 }
 if(!$allowed){throw 'Output must be a descendant of this repository build or .local directory.'}
 # Refuse output through a junction/symlink so lexical containment cannot be
 # used to redirect a compiler, receipt or inspector into the game directory.
 $cursor=$full
 while($cursor){
  if(Test-Path -LiteralPath $cursor){$item=Get-Item -LiteralPath $cursor -Force;if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Refusing output through a filesystem reparse point.'}}
  $parent=[IO.Path]::GetDirectoryName($cursor);if($parent -eq $cursor){break};$cursor=$parent
 }
 return $full
}

function Get-ShvPeImage {
 [CmdletBinding()]
 param([Parameter(Mandatory=$true)][string]$Path)
 $file=Get-Item -LiteralPath $Path
 if($file.Length -lt 64 -or $file.Length -gt 134217728){throw 'PE input length is outside the static inspection bound.'}
 $stream=[IO.File]::OpenRead($file.FullName);$pe=[Reflection.PortableExecutable.PEReader]::new($stream)
 try{
  $headers=$pe.PEHeaders;$header=$headers.PEHeader
  if(!$header){throw 'Input has no PE optional header.'}
  $width=if($header.Magic.ToString() -eq 'PE32Plus'){8}elseif($header.Magic.ToString() -eq 'PE32'){4}else{throw 'Unsupported PE format.'}
  function Read-ShvRva([long]$Rva,[int]$Length){
   if($Rva -lt 0 -or $Rva -gt [int]::MaxValue -or $Length -lt 0 -or $Length -gt 65536){throw 'PE read exceeds static RVA/span bounds.'}
   $block=$pe.GetSectionData([int]$Rva);if($block.Length -lt $Length){throw 'PE RVA span is not backed by the input image.'}
   return ,([byte[]]$block.GetContent(0,$Length))
  }
  function Read-ShvName([long]$Rva){
   if($Rva -le 0 -or $Rva -gt [int]::MaxValue){throw 'Invalid PE name RVA.'}
   $block=$pe.GetSectionData([int]$Rva);$limit=[Math]::Min(1024,$block.Length);$bytes=[byte[]]$block.GetContent(0,$limit);$length=0
   while($length -lt $limit -and $bytes[$length] -ne 0){$length++}
   if($length -eq $limit){throw 'PE name is unterminated or exceeds 1023 bytes.'}
   return [Text.Encoding]::ASCII.GetString($bytes,0,$length)
  }
  $imports=[Collections.Generic.List[object]]::new();$directory=$header.ImportTableDirectory
  if($directory.RelativeVirtualAddress -ne 0){
   $limit=[Math]::Min(4096,[Math]::Floor($directory.Size/20));$terminated=$false
   for($index=0;$index -lt $limit;$index++){
    $descriptor=Read-ShvRva ($directory.RelativeVirtualAddress+20*$index) 20
    $original=[BitConverter]::ToUInt32($descriptor,0);$nameRva=[BitConverter]::ToUInt32($descriptor,12);$first=[BitConverter]::ToUInt32($descriptor,16)
    if($original -eq 0 -and $nameRva -eq 0 -and $first -eq 0){$terminated=$true;break}
    if($nameRva -eq 0){throw 'PE import descriptor is missing a module name.'}
    $module=Read-ShvName $nameRva;$thunk=if($original){$original}else{$first};$functions=[Collections.Generic.List[string]]::new();$ordinals=[Collections.Generic.List[int]]::new();$thunksTerminated=$false
    for($slot=0;$slot -lt 8192;$slot++){
     $bytes=Read-ShvRva ($thunk+$width*$slot) $width
     $value=if($width -eq 8){[BitConverter]::ToUInt64($bytes,0)}else{[uint64][BitConverter]::ToUInt32($bytes,0)}
     if($value -eq 0){$thunksTerminated=$true;break}
     $ordinalFlag=if($width -eq 8){[uint64]::Parse('8000000000000000',[Globalization.NumberStyles]::HexNumber)}else{[uint64]0x80000000L}
     if(($value -band $ordinalFlag) -ne 0){$ordinals.Add([int]($value -band 0xffff));continue}
     if($value -gt [int]::MaxValue-2){throw 'Import-by-name RVA exceeds supported image bounds.'}
     $functions.Add((Read-ShvName ([long]$value+2)))
    }
    if(!$thunksTerminated){throw 'PE import thunk list exceeds the inspection bound.'}
    $imports.Add([ordered]@{Module=$module;Functions=@($functions);Ordinals=@($ordinals)})
   }
   if(!$terminated){throw 'PE import descriptor list is unterminated or oversized.'}
  }
  $exports=[Collections.Generic.List[object]]::new();$directory=$header.ExportTableDirectory;$exportFunctionCount=0;$exportNameCount=0
  if($directory.RelativeVirtualAddress -ne 0){
   $table=Read-ShvRva $directory.RelativeVirtualAddress 40
   $base=[BitConverter]::ToUInt32($table,16);$functionCount=[BitConverter]::ToUInt32($table,20);$nameCount=[BitConverter]::ToUInt32($table,24)
   $exportFunctionCount=$functionCount;$exportNameCount=$nameCount
   $functionsRva=[BitConverter]::ToUInt32($table,28);$namesRva=[BitConverter]::ToUInt32($table,32);$ordinalsRva=[BitConverter]::ToUInt32($table,36)
   if($functionCount -gt 8192 -or $nameCount -gt 8192 -or $nameCount -gt $functionCount){throw 'PE export table exceeds static inspection bounds.'}
   for($index=0;$index -lt $nameCount;$index++){
    $nameRva=[BitConverter]::ToUInt32((Read-ShvRva ($namesRva+4*$index) 4),0);$ordinal=[BitConverter]::ToUInt16((Read-ShvRva ($ordinalsRva+2*$index) 2),0)
    if($ordinal -ge $functionCount){throw 'PE named export has an out-of-range ordinal.'}
    $functionRva=[BitConverter]::ToUInt32((Read-ShvRva ($functionsRva+4*$ordinal) 4),0)
    $forwarded=$functionRva -ge $directory.RelativeVirtualAddress -and $functionRva -lt ([long]$directory.RelativeVirtualAddress+$directory.Size)
    $exports.Add([ordered]@{Name=(Read-ShvName $nameRva);Ordinal=([long]$base+$ordinal);Forwarded=$forwarded;HasFunction=($functionRva -ne 0)})
   }
  }
  $entry=$header.AddressOfEntryPoint;$entryExecutable=$false
  if($entry -gt 0){
   foreach($section in $headers.SectionHeaders){if($entry -ge $section.VirtualAddress -and $entry -lt ([long]$section.VirtualAddress+[Math]::Max($section.VirtualSize,$section.SizeOfRawData)) -and ([uint32]$section.SectionCharacteristics -band 0x20000000) -ne 0){$null=Read-ShvRva $entry 1;$entryExecutable=$true}}
  }
  [ordered]@{Name=$file.Name;Bytes=$file.Length;Sha256=(Get-FileHash -LiteralPath $file.FullName).Hash.ToLowerInvariant();Machine=$headers.CoffHeader.Machine.ToString();PeKind=$header.Magic.ToString();IsDll=([int]$headers.CoffHeader.Characteristics -band 0x2000) -ne 0;EntryPointPresent=$entry -gt 0;EntryPointExecutable=$entryExecutable;HasClrMetadata=$pe.HasMetadata;GuardCF=([int]$header.DllCharacteristics -band 0x4000) -ne 0;DynamicBase=([int]$header.DllCharacteristics -band 0x40) -ne 0;NxCompatible=([int]$header.DllCharacteristics -band 0x100) -ne 0;HighEntropyVa=([int]$header.DllCharacteristics -band 0x20) -ne 0;Imports=@($imports);Exports=@($exports);ExportFunctionCount=$exportFunctionCount;ExportNameCount=$exportNameCount;DelayImportDirectoryPresent=$header.DelayImportTableDirectory.RelativeVirtualAddress -ne 0;CodeExecuted=$false}
 }finally{$pe.Dispose();$stream.Dispose()}
}

function Assert-ShvProductImage($Image){
 if($Image.Machine -ne 'Amd64' -or $Image.PeKind -ne 'PE32Plus' -or !$Image.IsDll -or !$Image.EntryPointPresent -or !$Image.EntryPointExecutable -or $Image.HasClrMetadata){throw 'Product must be a native AMD64 PE32+ DLL with a backed executable entry point.'}
 if(!$Image.GuardCF -or !$Image.DynamicBase -or !$Image.NxCompatible -or !$Image.HighEntropyVa){throw 'Product is missing requested PE hardening flags.'}
 if($Image.ExportFunctionCount -ne 0 -or $Image.Exports.Count -ne 0){throw 'Product must not export named or ordinal-only fixture, test or other API entry points.'}
 if($Image.DelayImportDirectoryPresent){throw 'Unexpected delayed imports require separate review.'}
 $framework=@($Image.Imports | Where-Object {$_.Module -ieq 'ScriptHookV.dll'})
 if($framework.Count -ne 1 -or $framework[0].Ordinals.Count -ne 0){throw 'Product must import exactly one named ScriptHookV.dll interface.'}
 $expected=@(Get-ShvExpectedExports | Sort-Object);$actual=@($framework[0].Functions | Sort-Object)
 if($actual.Count -ne 6 -or @(Compare-Object $expected $actual).Count -ne 0){throw 'Product ScriptHookV imports differ from the six verified decorated exports.'}
 foreach($module in $Image.Imports){
  if($module.Module -ieq 'ScriptHookV.dll'){continue}
  if($module.Module -notmatch '^(KERNEL32|ADVAPI32|SHELL32|OLE32|USER32|SHLWAPI|PATHCCH|BCRYPT|CRYPT32|COMBASE|NTDLL)\.dll$' -and $module.Module -notmatch '^(api-ms-win-(core|security|crt)-|ext-ms-win-)[A-Za-z0-9_.-]+\.dll$'){throw ('Unexpected non-OS product dependency: '+$module.Module)}
  if($module.Ordinals.Count -gt 0){throw 'Unreviewed OS ordinal imports in product.'}
 }
 return $true
}

if($MyInvocation.InvocationName -ne '.' -and $Binary){
 $result=Get-ShvPeImage -Path $Binary;$null=Assert-ShvProductImage $result
 if($Output){$repo=Split-Path -Parent $PSScriptRoot;$target=Assert-ShvBuildOutputPath $Output $repo 'D:\Games\steamapps\common\Grand Theft Auto V Enhanced';[IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null;$result|ConvertTo-Json -Depth 9|Set-Content -LiteralPath $target -Encoding utf8}
 Write-Output ('PASS static AMD64 probe PE, exact six ScriptHookV imports, isolated entry point and OS-only dependencies. SHA256 '+$result.Sha256)
}
