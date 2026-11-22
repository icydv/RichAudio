#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$RetainedPackageRoot,[ValidateSet('baseline','low-latency-01')][string]$Profile='baseline',[ValidateSet('baseline','camera-source-01')][string]$ContinuityPolicy='baseline')
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$retained=[IO.Path]::GetFullPath($RetainedPackageRoot);$oldManifestPath=Join-Path $retained 'playable.json'
function Hash([string]$p){(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}
function Unlinked([string]$p){for($at=[IO.Path]::GetFullPath($p);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked input/output refused.'}}}
Unlinked $retained;$oldHash=Hash $oldManifestPath;$old=Get-Content -LiteralPath $oldManifestPath -Raw|ConvertFrom-Json
if($old.demoProfile-cne'PLAYABLE-13'-or@($old.eligible).Count-ne1){throw 'Retained Bati-only private package required.'}
foreach($p in $old.bindings){Unlinked (Join-Path $retained $p.file);if((Hash (Join-Path $retained $p.file))-cne$p.sha256){throw 'Retained immutable package mismatch.'}}
$out=Join-Path $repo ('.local/playable-15/low-latency-fixture-'+[Guid]::NewGuid().ToString('N'));Unlinked $out
[IO.Directory]::CreateDirectory($out)|Out-Null;$hostOutput=Join-Path $out 'host';$package=Join-Path $out 'package'
$hostSources=@('src/acoustics/host/Windows','src/acoustics/host/Transport','src/acoustics/recording','src/acoustics/geometry')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -File -Filter '*.cs'|ForEach-Object FullName}
$hostSources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$hostSourcePins=@($hostSources|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($repo,$_).Replace('\','/');sha256=(Hash $_)}})
$buildToolSha=Hash (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1');$prepareToolSha=Hash $PSCommandPath;$currentCodePins=@()
& (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1') -OutputDirectory $hostOutput
if($LASTEXITCODE-ne0){throw 'Private host build failed.'}
[IO.Directory]::CreateDirectory($package)|Out-Null;$preserved=0;$replaced=@()
foreach($p in $old.bindings){
 $from=Join-Path $retained $p.file
 if($p.file-ceq'runtime/RichAudio.Acoustics.Host.exe'){$from=Join-Path $hostOutput 'RichAudio.Acoustics.Host.exe';$replaced+=$p.file}
 elseif($p.file.EndsWith('.mjs',[StringComparison]::Ordinal)){$from=Join-Path $repo $p.file;$replaced+=$p.file;$currentCodePins+=@([ordered]@{file=$p.file;sha256=(Hash $from)})}else{$preserved++}
 Unlinked $from;$target=Join-Path $package $p.file;[IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null;[IO.File]::Copy($from,$target,$false)
}
$newModules=@('src/acoustics/vehicle/latency-profile.mjs')
# StockGameplay's independently reviewed static-scene qualification imports are
# code dependencies even when geometry is disabled. Bind them in this NEW copy.
$world=Join-Path $repo 'src/acoustics/world';if(Test-Path -LiteralPath $world){$newModules+=@(Get-ChildItem -LiteralPath $world -Filter '*.mjs' -File|ForEach-Object{[IO.Path]::GetRelativePath($repo,$_.FullName).Replace('\','/')})}
foreach($newModule in $newModules){$target=Join-Path $package $newModule;if(!(Test-Path -LiteralPath $target)){[IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null;[IO.File]::Copy((Join-Path $repo $newModule),$target,$false);$currentCodePins+=@([ordered]@{file=$newModule;sha256=(Hash (Join-Path $repo $newModule))})}}
$manifest=[ordered]@{};foreach($p in $old.PSObject.Properties){if($p.Name-cne'bindings'){$manifest[$p.Name]=$p.Value}}
if($Profile-cne'baseline'){$manifest.latencyProfile=$Profile};if($ContinuityPolicy-cne'baseline'){$manifest.continuityPolicy=$ContinuityPolicy}
$manifest.bindings=@(Get-ChildItem -LiteralPath $package -File -Recurse|Sort-Object FullName|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($package,$_.FullName).Replace('\','/');sha256=(Hash $_.FullName)}})
$manifestPath=Join-Path $package 'playable.json';$manifest|ConvertTo-Json -Depth 14|Set-Content -LiteralPath $manifestPath -Encoding utf8
$settings=Join-Path $package '.local/acoustic-settings.json';[IO.Directory]::CreateDirectory((Split-Path -Parent $settings))|Out-Null;[IO.File]::Copy((Join-Path $retained '.local/acoustic-settings.json'),$settings,$false)
foreach($p in $old.bindings){if((Hash (Join-Path $retained $p.file))-cne$p.sha256){throw 'Original package changed during preparation.'}};if((Hash $oldManifestPath)-cne$oldHash){throw 'Original manifest changed.'}
foreach($pin in @($hostSourcePins)+@($currentCodePins)){if((Hash (Join-Path $repo $pin.file))-cne$pin.sha256){throw 'Current compilation/copied code changed during preparation.'}}
if((Hash (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1'))-cne$buildToolSha-or(Hash $PSCommandPath)-cne$prepareToolSha){throw 'Preparation/build tool drift.'}
$receipt=[ordered]@{schema=1;kind='low-latency-01-new-private-device-free-fixture-package';passed=$true;profile=$Profile;continuityPolicy=$ContinuityPolicy;packageRoot=$package;manifestSha256=(Hash $manifestPath);retainedManifestSha256=$oldHash;preservedAssetBindings=$preserved;currentCodeBindings=@($replaced);currentCodeSourcePins=$currentCodePins;hostSourcePins=$hostSourcePins;hostBuildToolSha256=$buildToolSha;preparationToolSha256=$prepareToolSha;bindings=$manifest.bindings;hostSha256=(Hash (Join-Path $hostOutput 'RichAudio.Acoustics.Host.exe'));originalPackageChanged=$false;gameFilesWritten=$false;gameLaunched=$false;endpointOpened=$false;recordingStarted=$false;deploymentCandidate=$false;liveAuthorised=$false;scope='Private compiled fixture only, no game/endpoint/stem/recording. Existing banks copied without installation or publication; old immutable payload rehashed.'}
$receipt|ConvertTo-Json -Depth 14|Set-Content -LiteralPath (Join-Path $out 'preparation.json') -Encoding utf8
Write-Output ('PASS new private low-latency fixture package: '+$package)
