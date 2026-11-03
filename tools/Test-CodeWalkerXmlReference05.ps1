# Exact public profile and original versioned XML fixture corpus only.
[CmdletBinding()]param([Parameter(Mandatory)][string]$ProfileRoot,[Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition-eq'Core'){throw 'Windows PowerShell5.1 required for public reference assembly'}
$repo=Split-Path $PSScriptRoot -Parent
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/world-03'))
$profile=[IO.Path]::GetFullPath($ProfileRoot);$output=[IO.Path]::GetFullPath($OutputRoot)
foreach($p in @($profile,$output)){if(!$p.StartsWith($allowed+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Only new worktree public-profile/output allowed'};for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked reference path refused'}}}
if(Test-Path -LiteralPath $output){throw 'Fresh original reference output required'}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$binding=Get-Content -LiteralPath (Join-Path $profile 'profile.json') -Raw|ConvertFrom-Json
if(!$binding.passed-or$binding.sourceCommit-cne'485d56bec00262ed7fa472261cce7bbc6202b96e'-or(Hash (Join-Path $profile 'CodeWalker.Core.dll'))-cne$binding.parserSha256){throw 'Exact pinned public profile required'}
foreach($d in $binding.dependencies){if((Hash (Join-Path $profile $d.file))-cne$d.sha256){throw 'Public profile dependency drift'}}
foreach($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $profile $name)))|Out-Null}
$sources=@('src/acoustics/world/CodeWalkerResourceBoundary03.cs','src/acoustics/world/CodeWalkerStaticResourceAdapter02.cs','src/acoustics/world/CodeWalkerCollisionAdapter.cs','tests/CodeWalkerXmlReference05.cs')
$refs=@((Join-Path $profile 'CodeWalker.Core.dll'),(Join-Path $profile 'SharpDX.dll'),(Join-Path $profile 'SharpDX.Mathematics.dll'),'System.Web.Extensions.dll','System.IO.Compression.dll','System.Xml.dll')
Add-Type -Path @($sources|ForEach-Object{Join-Path $repo $_}) -ReferencedAssemblies $refs
[IO.Directory]::CreateDirectory($output)|Out-Null
$rows=@();foreach($group in @('legacy-building','gen9-building','gen9-passage','gen9-open','legacy-transform-challenge','gen9-transform-challenge','gen9-corner','gen9-corner-east','gen9-corner-wide')){
 $items=@();foreach($kind in @('ymap','ytyp','ybn')){$relative='tests/fixtures/CodeWalkerXml05/'+$group+'/original.'+$kind+'.xml';$p=Join-Path $repo $relative;$xml=[IO.File]::ReadAllBytes($p);$packet=[RichAudio.Tests.CodeWalkerXmlReference05]::Normalize($xml,$kind,$binding.parserSha256)|ConvertFrom-Json;$decoded=$packet.decodedJson|ConvertFrom-Json;$items+=@{kind=$kind;xmlSHA256=Hash $p;xmlBytes=$xml.Length;data=$decoded.data}}
 $map=[IO.File]::ReadAllBytes((Join-Path $repo ('tests/fixtures/CodeWalkerXml05/'+$group+'/original.ymap.xml')))
 $collision=[IO.File]::ReadAllBytes((Join-Path $repo ('tests/fixtures/CodeWalkerXml05/'+$group+'/original.ybn.xml')))
 $world=[RichAudio.Tests.CodeWalkerXmlReference05]::World($map,$collision,0)|ConvertFrom-Json
 $rows+=@{group=$group;resources=$items;world=$world}
}
$rawHashes=[RichAudio.Tests.CodeWalkerXmlReference05]::NameHashes()|ConvertFrom-Json
$hashVectors=@();foreach($row in $rawHashes){$hashVectors+=@{text=[string]$row.text;hash=[uint32]$row.hash}}
$receipt=[ordered]@{schema=1;kind='CodeWalker-original-XML05-reference';passed=$true;parserSourceCommit=$binding.sourceCommit;parserSHA256=$binding.parserSha256;sourceAuthority='original-authored-fixture';fixtureSets=$rows;nameHashVectors=$hashVectors;gameFilesRead=$false;keysRead=$false;installedEnhancedCompatibilityVerified=$false;meaning='Actual public XML parser plus resource rebuild, existing normalized adapter and world placement APIs; wholly original geometry, not installed provenance'}
$json=$receipt|ConvertTo-Json -Depth 100
$dest=Join-Path $output 'reference.json';$stream=[IO.File]::Open($dest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write);try{$bytes=[Text.Encoding]::UTF8.GetBytes($json);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
Write-Output 'PASS 27 original XML resources normalized by independent pinned public CodeWalker parser'
