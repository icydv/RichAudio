# Windows PowerShell5.1, explicit fresh public profile, wholly original geometry.
[CmdletBinding()]param([Parameter(Mandatory)][string]$ProfileRoot,[Parameter(Mandatory)][string]$OutputRoot,[ValidateSet(0,40)][int]$PositionX=0,[ValidateSet(2,3)][int]$HalfWidth=2)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition-eq'Core'){throw 'Use Windows PowerShell5.1 for the explicit original fixture process'}
$repo=Split-Path $PSScriptRoot -Parent;$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/world-03'));$profile=[IO.Path]::GetFullPath($ProfileRoot);$output=[IO.Path]::GetFullPath($OutputRoot)
foreach($p in @($profile,$output)){if(!$p.StartsWith($allowed+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Explicit private world-03 profile/output only'};for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked profile/output refused'}}}
if(Test-Path -LiteralPath $output){throw 'Fresh original building fixture output required'}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function WriteNew([string]$p,[byte[]]$b){$s=[IO.File]::Open($p,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$s.Write($b,0,$b.Length)}finally{$s.Dispose()}}
$profilePath=Join-Path $profile 'profile.json';$profileSHA256=Hash $profilePath;$binding=Get-Content -LiteralPath $profilePath -Raw|ConvertFrom-Json
if(!$binding.passed-or$binding.kind-cne'CodeWalker-public-source-private-profile03'-or$binding.sourceCommit-cne'485d56bec00262ed7fa472261cce7bbc6202b96e'-or(Hash (Join-Path $profile 'CodeWalker.Core.dll'))-cne$binding.parserSha256){throw 'Exact explicit public-source parser profile required'}
foreach($dependency in $binding.dependencies){if((Hash (Join-Path $profile $dependency.file))-cne$dependency.sha256){throw 'Public parser dependency drift'}}
foreach($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $profile $name)))|Out-Null}
$sources=@('src/acoustics/world/CodeWalkerResourceBoundary03.cs','src/acoustics/world/CodeWalkerStaticResourceAdapter02.cs','src/acoustics/world/CodeWalkerCollisionAdapter.cs','tests/CodeWalkerXml042.cs','tests/CodeWalkerBuildingFixture05.cs')
$pins=@($sources|ForEach-Object{@{file=$_;sha256=Hash (Join-Path $repo $_)}});$toolSHA256=Hash $PSCommandPath
$refs=@((Join-Path $profile 'CodeWalker.Core.dll'),(Join-Path $profile 'SharpDX.dll'),(Join-Path $profile 'SharpDX.Mathematics.dll'),'System.Web.Extensions.dll','System.IO.Compression.dll','System.Xml.dll')
Add-Type -Path @($sources|ForEach-Object{Join-Path $repo $_}) -ReferencedAssemblies $refs
$initial=[CodeWalker.GameFiles.RpfManager]::IsGen9;$proof=[RichAudio.Tests.CodeWalkerBuildingFixture05]::Run($binding.parserSha256,[single]$PositionX,[single]$HalfWidth)|ConvertFrom-Json
if([CodeWalker.GameFiles.RpfManager]::IsGen9-ne$initial){throw 'Parser selector not restored'}
[IO.Directory]::CreateDirectory($output)|Out-Null;$artifacts=@()
foreach($resource in $proof.binaryResources){$name='original.'+$resource.kind;$p=Join-Path $output $name;$b=[Convert]::FromBase64String($resource.base64);if($b.Length-ne$resource.bytes){throw 'Original binary byte count'};WriteNew $p $b;if((Hash $p)-cne$resource.sha256){throw 'Written original binary digest'};$resource.PSObject.Properties.Remove('base64');$artifacts+=@{file=$name;bytes=$b.Length;sha256=$resource.sha256}}
foreach($resource in $proof.roundtrip.resources){$name='original.'+$resource.kind+'.xml';$p=Join-Path $output $name;$b=[Convert]::FromBase64String($resource.xmlBase64);if($b.Length-ne$resource.xmlBytes){throw 'Original XML byte count'};WriteNew $p $b;if((Hash $p)-cne$resource.xmlSHA256){throw 'Written original XML digest'};$resource.PSObject.Properties.Remove('xmlBase64');foreach($mode in @('defaultRoundTrip','explicitWriterRoundTrip')){$resource.$mode.PSObject.Properties.Remove('base64')};$artifacts+=@{file=$name;bytes=$b.Length;sha256=$resource.xmlSHA256}}
foreach($pin in $pins){if((Hash (Join-Path $repo $pin.file))-cne$pin.sha256){throw 'Fixture source drift'}}
foreach($dependency in $binding.dependencies){if((Hash (Join-Path $profile $dependency.file))-cne$dependency.sha256){throw 'Public parser dependency drift after generation'}}
if((Hash $profilePath)-cne$profileSHA256-or(Hash (Join-Path $profile 'CodeWalker.Core.dll'))-cne$binding.parserSha256-or(Hash $PSCommandPath)-cne$toolSHA256){throw 'Public profile/parser/tool drift'}
$receipt=[ordered]@{schema=1;kind='CodeWalkerOriginalClosedBuildingFixture05Proof';passed=$true;sourceAuthority='original-authored-fixture-only';parserSourceCommit=$binding.sourceCommit;parserSHA256=$binding.parserSha256;profileSHA256=$profileSHA256;toolSHA256=$toolSHA256;sources=$pins;artifacts=$artifacts;proof=$proof;parserSelectorRestored=$true;installedResourcesRead=$false;privateInputsRead=$false;endpointOpened=$false;arbitraryNativeContainmentQualified=$false;limits='One original closed box through actual public binary/XML APIs; no genuine building, installed provenance, runtime activation or physical-unit proof'}
WriteNew (Join-Path $output 'fixture-proof.json') ([Text.Encoding]::UTF8.GetBytes(($receipt|ConvertTo-Json -Depth 96)))
Write-Output 'PASS original actual-format CodeWalker box:8vertices12triangles, closedmanifold,8readbackcontrols(4noncoplanar),3actualXMLexports/6staticDTOroundtrips. No genuine-resource or physical-unit qualification.'
