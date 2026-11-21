# Windows PowerShell 5.1; explicit prepared public profile and ORIGINAL fixtures only.
[CmdletBinding()]param([Parameter(Mandatory)][string]$ProfileRoot,[Parameter(Mandatory)][string]$FixtureRoot,[Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition-eq'Core'){throw 'Use Windows PowerShell 5.1 for the explicit CodeWalker XML fixture process'}
$repo=Split-Path $PSScriptRoot -Parent
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/world-03'))
$profile=[IO.Path]::GetFullPath($ProfileRoot);$fixtures=[IO.Path]::GetFullPath($FixtureRoot);$output=[IO.Path]::GetFullPath($OutputRoot)
foreach($p in @($profile,$fixtures,$output)){
 if(!$p.StartsWith($allowed+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Only explicit private world-03 profile/original-fixture/output paths are supported'}
 for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked profile, fixture or output refused'}}
}
if(Test-Path -LiteralPath $output){throw 'Fresh XML fixture output required'}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function WriteNew([string]$p,[byte[]]$bytes){$stream=[IO.File]::Open($p,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}}
$toolSHA256=Hash $PSCommandPath
$profilePath=Join-Path $profile 'profile.json';$profileHash=Hash $profilePath;$binding=Get-Content -LiteralPath $profilePath -Raw|ConvertFrom-Json
if(!$binding.passed-or$binding.kind-cne'CodeWalker-public-source-private-profile03'-or$binding.sourceCommit-cne'485d56bec00262ed7fa472261cce7bbc6202b96e'-or(Hash (Join-Path $profile 'CodeWalker.Core.dll'))-cne$binding.parserSha256){throw 'Exact separately prepared pinned-source parser profile required'}
foreach($dependency in $binding.dependencies){if((Hash (Join-Path $profile $dependency.file))-cne$dependency.sha256){throw 'Profile dependency drift'}}
$fixtureReceipt=Join-Path $fixtures 'validation.json';$fixtureReceiptHash=Hash $fixtureReceipt;$fixture=Get-Content -LiteralPath $fixtureReceipt -Raw|ConvertFrom-Json
if(!$fixture.passed-or$fixture.gameFilesRead-or$fixture.installedEnhancedVerified-or$fixture.result.kind-cne'original-resource-building03-roundtrips'-or$fixture.result.sourceAuthority-cne'original-authored-fixture'-or$fixture.parserSha256-cne$binding.parserSha256){throw 'Only fresh original authored actual-format fixtures with matching parser identity are supported'}
foreach($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $profile $name)))|Out-Null}
$sources=@('src/acoustics/world/CodeWalkerResourceBoundary03.cs','src/acoustics/world/CodeWalkerStaticResourceAdapter02.cs','src/acoustics/world/CodeWalkerCollisionAdapter.cs','tests/CodeWalkerXml042.cs')
$pins=@($sources|ForEach-Object{@{file=$_;sha256=Hash (Join-Path $repo $_)}})
$references=@((Join-Path $profile 'CodeWalker.Core.dll'),(Join-Path $profile 'SharpDX.dll'),(Join-Path $profile 'SharpDX.Mathematics.dll'),'System.Web.Extensions.dll','System.IO.Compression.dll','System.Xml.dll')
Add-Type -Path @($sources|ForEach-Object{Join-Path $repo $_}) -ReferencedAssemblies $references
[IO.Directory]::CreateDirectory($output)|Out-Null
$initialSelector=[CodeWalker.GameFiles.RpfManager]::IsGen9
$security=[RichAudio.Tests.CodeWalkerXml042]::SecurityControls()|ConvertFrom-Json
$expectedGroups=@('legacy-building','gen9-building','gen9-passage','gen9-open')
if($fixture.result.groups.Count-ne4-or(($fixture.result.groups|ForEach-Object{$_.profile})-join',')-cne($expectedGroups-join',')){throw 'Exact four original fixture groups required'}
$groups=@();$inputPins=@();$challengeTypes=@{}
foreach($group in $fixture.result.groups){
 $raw=@{}
 if($group.resources.Count-ne3-or(($group.resources|ForEach-Object{$_.kind})-join',')-cne'ymap,ytyp,ybn'){throw 'Exact original resource triplet required'}
 foreach($item in $group.resources){$p=Join-Path (Join-Path $fixtures $group.profile) ('original.'+$item.kind);$b=[IO.File]::ReadAllBytes($p);if($b.Length-ne$item.bytes-or$b.Length-gt16777216-or(Hash $p)-cne$item.sha256){throw 'Original resource identity/bounds mismatch'};$raw[$item.kind]=$b;$inputPins+=@{file=$group.profile+'/original.'+$item.kind;bytes=$b.Length;sha256=$item.sha256}}
 $result=[RichAudio.Tests.CodeWalkerXml042]::RunGroup($raw.ymap,$raw.ytyp,$raw.ybn,[bool]$group.gen9,$binding.parserSha256)|ConvertFrom-Json
 if($group.profile-eq'legacy-building'){$challengeTypes.legacy=$raw.ytyp};if($group.profile-eq'gen9-building'){$challengeTypes.gen9=$raw.ytyp}
 if([CodeWalker.GameFiles.RpfManager]::IsGen9-ne$initialSelector){throw 'Parser selector was not restored'}
 $dir=Join-Path $output $group.profile;[IO.Directory]::CreateDirectory($dir)|Out-Null
 foreach($item in $result.resources){
  WriteNew (Join-Path $dir ('original.'+$item.kind+'.xml')) ([Convert]::FromBase64String($item.xmlBase64));$item.PSObject.Properties.Remove('xmlBase64')
  foreach($mode in @('defaultRoundTrip','explicitWriterRoundTrip')){$entry=$item.$mode;WriteNew (Join-Path $dir ($mode+'.'+$item.kind)) ([Convert]::FromBase64String($entry.base64));$entry.PSObject.Properties.Remove('base64')}
 }
 $groups+=@{profile=$group.profile;result=$result}
}
foreach($mode in @('legacy','gen9')){
 $result=[RichAudio.Tests.CodeWalkerXml042]::RunTransformChallenge($challengeTypes[$mode],($mode-eq'gen9'),$binding.parserSha256)|ConvertFrom-Json
 if([CodeWalker.GameFiles.RpfManager]::IsGen9-ne$initialSelector){throw 'Parser selector was not restored after transform challenge'}
 $name=$mode+'-transform-challenge';$dir=Join-Path $output $name;[IO.Directory]::CreateDirectory($dir)|Out-Null
 foreach($kind in @('ymap','ytyp','ybn')){WriteNew (Join-Path $dir ('original.'+$kind)) ([Convert]::FromBase64String($result.authoredInputBase64.$kind))};$result.PSObject.Properties.Remove('authoredInputBase64')
 foreach($item in $result.resources){
  WriteNew (Join-Path $dir ('original.'+$item.kind+'.xml')) ([Convert]::FromBase64String($item.xmlBase64));$item.PSObject.Properties.Remove('xmlBase64')
  foreach($round in @('defaultRoundTrip','explicitWriterRoundTrip')){$entry=$item.$round;WriteNew (Join-Path $dir ($round+'.'+$item.kind)) ([Convert]::FromBase64String($entry.base64));$entry.PSObject.Properties.Remove('base64')}
 }
 $groups+=@{profile=$name;result=$result}
}
foreach($pin in $inputPins){if((Hash (Join-Path $fixtures $pin.file))-cne$pin.sha256){throw 'Original fixture source drift'}}
foreach($pin in $pins){if((Hash (Join-Path $repo $pin.file))-cne$pin.sha256){throw 'XML test/adapter source drift'}}
foreach($dependency in $binding.dependencies){if((Hash (Join-Path $profile $dependency.file))-cne$dependency.sha256){throw 'Profile dependency drift after XML checks'}}
if((Hash $profilePath)-cne$profileHash-or(Hash $fixtureReceipt)-cne$fixtureReceiptHash-or(Hash (Join-Path $profile 'CodeWalker.Core.dll'))-cne$binding.parserSha256-or(Hash $PSCommandPath)-cne$toolSHA256){throw 'Profile/fixture receipt/parser/tool drift'}
$receipt=[ordered]@{schema=1;kind='CodeWalker-original-format-XML042-validation';passed=$true;sourceAuthority='original-authored-fixture';parserSourceCommit=$binding.sourceCommit;parserSha256=$binding.parserSha256;parserMvid=[CodeWalker.GameFiles.YmapFile].Assembly.ManifestModule.ModuleVersionId.ToString();profileSHA256=$profileHash;fixtureReceiptSHA256=$fixtureReceiptHash;toolSHA256=$toolSHA256;sources=$pins;inputs=$inputPins;security=$security;groups=$groups;actualXmlExports=18;actualSemanticRoundTrips=36;defaultWriterGen9=$false;explicitWriterModesTested=@($false,$true);parserSelectorRestored=$true;gameFilesRead=$false;keysRead=$false;endpointOpened=$false;nativeContainmentEstablished=$false;realXmlDecoderQualified=$false;enhancedInstallationCompatibilityVerified=$false;limits='Actual pinned exporter/parser/builder APIs on original fixtures, selected static DTO fields only; no complete format or byte-identity preservation assertion, installed resource provenance or runtime activation proof'}
WriteNew (Join-Path $output 'validation.json') ([Text.Encoding]::UTF8.GetBytes(($receipt|ConvertTo-Json -Depth 96)))
Write-Output 'PASS 18 actual CodeWalker XML exports, 36 semantic roundtrips and five secure-XML rejection controls on original fixtures, including rotated/nonuniform/composite/material challenges; default XML writers select gen9=false. No real/Enhanced compatibility or containment claim.'
