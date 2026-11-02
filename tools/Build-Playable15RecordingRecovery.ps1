#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked recovery build/input refused.'}}}
function Check([string]$Path,[string]$Sha,[long]$Bytes=-1){Unlinked $Path;if((Hash $Path)-cne$Sha-or($Bytes-ge0-and(Get-Item -LiteralPath $Path).Length-ne$Bytes)){throw ('Input differs: '+[IO.Path]::GetFileName($Path))}}
function WriteNew([string]$Path,$Value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 24));$f=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$f.Write($bytes,0,$bytes.Length);$f.Flush($true)}finally{$f.Dispose()}}
function CopyNew([string]$From,[string]$To,[string]$Sha){Check $From $Sha;Unlinked $To;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($To))|Out-Null;$inputFile=[IO.File]::Open($From,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{$outputFile=[IO.File]::Open($To,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$inputFile.CopyTo($outputFile);$outputFile.Flush($true)}finally{$outputFile.Dispose()}}finally{$inputFile.Dispose()};Check $To $Sha}
# This builder never executes a product binary or writes into the game. Retain
# sealed historical builds; rebuild only the host and current bound JavaScript.
$retainedPath=Join-Path $repo '.local/playable-15/build-journal-fix/playable15-build-receipt.json'
Check $retainedPath 'e7b448b35d577544c64cb030562b4ce0db83490340ae9552af73d7fa9f36d535'
$old=Get-Content -LiteralPath $retainedPath -Raw|ConvertFrom-Json
Check $old.baselinePath $old.baselineSha256
$baseline=Get-Content -LiteralPath $old.baselinePath -Raw|ConvertFrom-Json
if(@($baseline.protected).Count-ne11-or@($baseline.settings).Count-ne4){throw 'Expected 11-file/four-setting restored baseline.'}
foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256 $pin.bytes}
Check (Join-Path $repo 'config/production-features.json') 'c2714e26e9e044534d91c11a2ce7abef5e591534c702f2c85c195817faa55132' 95
foreach($mode in @('passive','audible')){$artifact=$old.$mode;Check $artifact.pluginPath $artifact.pluginSha256 $artifact.pluginBytes;Check $artifact.sourceManifestPath $artifact.sourceManifestSha256;Check $artifact.leaseTemplatePath $artifact.leaseTemplateSha256;foreach($pin in $artifact.sources){Check $pin.path $pin.sha256}}
Check $old.producer.path $old.producer.sha256 $old.producer.bytes
foreach($pin in $old.producer.sources){Check (Join-Path $repo ($pin.Name-creplace'^repo/','')) $pin.Sha256}
Check $old.package.manifestPath $old.package.manifestSha256
$previous=Get-Content -LiteralPath $old.package.manifestPath -Raw|ConvertFrom-Json
foreach($pin in $previous.bindings){Check (Join-Path $old.package.root $pin.file) $pin.sha256}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-15/build-recording-recovery-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-15')).TrimEnd('\')+'\'
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'New private PLAYABLE-15 recovery build directory required.'};Unlinked $output
[IO.Directory]::CreateDirectory($output)|Out-Null
$sourceFiles=@('src/acoustics/host/Windows','src/acoustics/host/Transport','src/acoustics/recording','src/acoustics/geometry')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -Filter '*.cs'|ForEach-Object FullName}
$sourceFiles+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$sourcePins=@($sourceFiles|Sort-Object|ForEach-Object{[ordered]@{path=$_;sha256=(Hash $_)}})
$hostDirectory=Join-Path $output 'host'
& (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1') -OutputDirectory $hostDirectory
if($LASTEXITCODE-ne0){throw 'Recovery host compilation failed.'}
foreach($pin in $sourcePins){Check $pin.path $pin.sha256}
$hostBinary=Join-Path $hostDirectory 'RichAudio.Acoustics.Host.exe'
$package=Join-Path $output 'package';[IO.Directory]::CreateDirectory($package)|Out-Null
$current=[Collections.Generic.List[object]]::new();$preserved=[Collections.Generic.List[object]]::new()
foreach($pin in $previous.bindings){
 $from=Join-Path $old.package.root $pin.file;$sha=$pin.sha256
 if($pin.file-ceq'runtime/RichAudio.Acoustics.Host.exe'){$from=$hostBinary;$sha=Hash $hostBinary}
 elseif($pin.file.EndsWith('.mjs',[StringComparison]::Ordinal)){$from=Join-Path $repo $pin.file;$sha=Hash $from;$current.Add([ordered]@{file=$pin.file;path=$from;sha256=$sha;previousSha256=$pin.sha256})}
 else{$preserved.Add([ordered]@{file=$pin.file;sha256=$pin.sha256})}
 CopyNew $from (Join-Path $package $pin.file) $sha
}
foreach($file in @('src/acoustics/recording/latency-analysis.mjs')){
 if($file-in$previous.bindings.file){throw 'Recovery addition already in retained manifest.'}
 $from=Join-Path $repo $file;$sha=Hash $from;CopyNew $from (Join-Path $package $file) $sha
 $current.Add([ordered]@{file=$file;path=$from;sha256=$sha;previousSha256=$null})
}
$manifest=[ordered]@{};foreach($property in $previous.PSObject.Properties){if($property.Name-cne'bindings'){$manifest[$property.Name]=$property.Value}}
$manifest.bindings=@(Get-ChildItem -LiteralPath $package -Recurse -File|Sort-Object FullName|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($package,$_.FullName).Replace('\','/');sha256=(Hash $_.FullName)}})
$manifestPath=Join-Path $package 'playable.json';WriteNew $manifestPath $manifest
# Exact prior isolated settings, including their revision; no new tuning.
Check $old.package.isolatedSettingsPath $old.package.initialIsolatedSettingsSha256
$isolated=Join-Path $package '.local/acoustic-settings.json';CopyNew $old.package.isolatedSettingsPath $isolated $old.package.initialIsolatedSettingsSha256
$receipt=[ordered]@{schema=1;profile='PLAYABLE-15';kind='recording-recovery-and-latency-diagnostics';runtimePolicy='functional-compatibility';builtUtc=[DateTime]::UtcNow.ToString('o');baselinePath=$old.baselinePath;baselineSha256=$old.baselineSha256;
 passive=$old.passive;audible=$old.audible;producer=$old.producer;host=[ordered]@{path=$hostBinary;sha256=(Hash $hostBinary);bytes=(Get-Item -LiteralPath $hostBinary).Length;sources=$sourcePins};
 package=[ordered]@{root=$package;manifestPath=$manifestPath;manifestSha256=(Hash $manifestPath);bindings=$manifest.bindings.Count;eligible=$manifest.eligible;retainedManifestSha256=$old.package.manifestSha256;preservedAssetBindings=$preserved.ToArray();currentCode=$current.ToArray();isolatedSettingsPath=$isolated;initialIsolatedSettingsSha256=(Hash $isolated);mutableSettingsBoundInManifest=$false;originalUserSettingsChanged=$false;privatePackageOnly=$true};
 retained15BuildReceiptPath=$retainedPath;retained15BuildReceiptSha256=(Hash $retainedPath);retainedHostSha256=$old.host.sha256;hostRebuilt=$true;recorderRebuilt=$true;rendererRebuilt=$false;sourceBanksRebuilt=$false;managedPluginRebuilt=$false;nativeProducerRebuilt=$false;globalFeatureFlags=$old.globalFeatureFlags;sdkSha256=$old.sdkSha256;builderSha256=(Hash $PSCommandPath);hostBuilderSha256=(Hash (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1'));
 gameFilesWritten=$false;deployed=$false;gameLaunched=$false;endpointOpened=$false;audioPlayed=$false;recordingStarted=$false;liveHandoffAccepted=$false;playableInGame=$false;liveAuthorized=$false;
 limits='Fresh host/recorder and bounded timing diagnostics only. Existing native/RPH artifacts, package non-code assets, all calibration/settings/buffer limits retained. Offline build proves no live capture or physical output timing.'}
foreach($pin in $sourcePins){Check $pin.path $pin.sha256};foreach($pin in $current){Check $pin.path $pin.sha256};foreach($pin in $manifest.bindings){Check (Join-Path $package $pin.file) $pin.sha256}
foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256 $pin.bytes}
$receiptPath=Join-Path $output 'playable15-build-receipt.json';WriteNew $receiptPath $receipt
Write-Output ('PASS offline recording recovery build: '+$receiptPath)
