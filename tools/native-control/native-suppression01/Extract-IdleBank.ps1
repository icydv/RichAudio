#requires -Version 7.0
# Read one pinned installed source archive into fresh private evidence. No GTA process access.
param(
 [Parameter(Mandatory)][string]$GameRoot,
 [Parameter(Mandatory)][string]$OutputDirectory,
 [string]$CodeWalkerRoot='C:\Users\Libby\Desktop\CodeWalker30_dev46'
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $out)){throw 'Fresh private output required'}
foreach($path in @($out,$GameRoot,$CodeWalkerRoot)){for($p=[IO.Path]::GetFullPath($path);$p;$p=[IO.Path]::GetDirectoryName($p)){if((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked input/output refused'}}}
function Pin([string]$p){(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}
function Digest([byte[]]$b){[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant()}
$core=Join-Path $CodeWalkerRoot 'CodeWalker.Core.dll'
if((Pin $core) -cne '3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'){throw 'Pinned codec required'}
$archive=Join-Path $GameRoot 'x64/audio/sfx/STREAMED_VEHICLES_GRANULAR.rpf';$before=Pin $archive
if($before -cne 'f31cc031e06d1cfe5e863e8307857ab3c59b0736739e824277368ebee5df7eef'){throw 'Retained source archive identity changed'}
foreach($dll in Get-ChildItem -LiteralPath $CodeWalkerRoot -Filter '*.dll'){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($dll.FullName))|Out-Null}
Import-Module (Join-Path $repo 'src/acoustics/startup/CodeWalkerInitialization01.psm1')
$initialization=Initialize-InstalledCodeWalker01 -GameRoot $GameRoot
$rpf=[CodeWalker.GameFiles.RpfFile]::new($archive,'x64/audio/sfx/STREAMED_VEHICLES_GRANULAR.rpf');$rpf.ScanStructure($null,$null)
if($rpf.LastError){throw 'Source archive scan failed'}
$entries=@($rpf.AllEntries|Where-Object Name -CEQ 'v_twin_2.awc');if($entries.Count -ne 1){throw 'Unique exact source entry required'}
$bytes=$rpf.ExtractFile($entries[0]);$rawHash=Digest $bytes
if($rawHash -cne '1ce99726fc8a92e773c58cc1b54da66ec128a1104318294f54a97c000a9885bf'){throw 'Raw source entry identity differs'}
# CodeWalker.Load decrypts this buffer in place. Keep both representations explicit.
$raw=[byte[]]$bytes.Clone();$awc=[CodeWalker.GameFiles.AwcFile]::new();$awc.Load($bytes,$entries[0]);$decodedHash=Digest $bytes
if($awc.ErrorMessage -or $decodedHash -cne '1a1a43aea31f3e4e4c1dd3355a0751c0a7031ee396ffa76353c174d808cc6c5e'){throw 'Decoded source identity differs'}
if((Pin $archive) -cne $before){throw 'Source archive changed during read'}
[void][IO.Directory]::CreateDirectory($out)
[IO.File]::WriteAllBytes((Join-Path $out 'v_twin_2.awc'),$raw)
[IO.File]::WriteAllBytes((Join-Path $out 'v_twin_2.decoded.awc'),$bytes)
$receipt=@{archive=$archive;archiveSha256=$before;entry='v_twin_2.awc';rawSha256=$rawHash;decodedSha256=$decodedHash;sourceUnchanged=$true;initialization=$initialization;gameWrites=$false;processAccess=$false;extractorSha256=Pin $PSCommandPath}
[IO.File]::WriteAllText((Join-Path $out 'extraction.json'),($receipt|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
$receipt|ConvertTo-Json -Depth 5
