#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='',[string]$SdkPath='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked build/input path refused.'}}}
function Check([string]$Path,[string]$Sha,[long]$Bytes=-1){Unlinked $Path;if((Hash $Path)-cne$Sha-or($Bytes-ge0-and(Get-Item -LiteralPath $Path).Length-ne$Bytes)){throw ('Input differs: '+[IO.Path]::GetFileName($Path))}}
function WriteNew([string]$Path,$Value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 12));$file=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}}
function Preserved13(){
 $path=Join-Path $repo '.local/playable-13/build-05/playable13-build-receipt.json';Check $path 'c3122cfd845b4bd96b549a006f1e6f5804a0d7f659c9bc0d1286564a009f6719'
 $old=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
 Check $old.audible.pluginPath '182903fbcc7ed6e87b5fa20de9f4c78a48d5e9fe796cad18cb8e9fc1875d7b4b' 349184
 Check $old.audible.sourceManifestPath $old.audible.sourceManifestSha256
 Check $old.host.path '5c64559983b81a19b0c66c7f01fb19a3b584eef30a9980ed6ef2296b5b611f42' 306176
 Check $old.package.manifestPath 'c4406978e5f97384f4b3ddab26ebbecfd67529a9665d021419275b90c785f750'
 $manifest=Get-Content -LiteralPath $old.package.manifestPath -Raw|ConvertFrom-Json
 if(@($manifest.bindings).Count-ne132-or$manifest.calibration.exhaustToEngine-ne10-or$manifest.calibration.commonSourceHeadroomTrim-ne0.25){throw 'Preserved13 package/calibration differs.'}
 foreach($pin in $manifest.bindings){$p=[IO.Path]::GetFullPath((Join-Path $old.package.root $pin.file));if(!$p.StartsWith($old.package.root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Preserved package path escaped.'};Check $p $pin.sha256}
 $candidatePath=Join-Path $repo '.local/playable-13/candidate-final/candidate-receipt.json';Check $candidatePath 'f3c4770a6b642f41fa83240331185f95e25ed05518f1b1bc8e5af00a7dae2fdd'
 $candidate=Get-Content -LiteralPath $candidatePath -Raw|ConvertFrom-Json;$audible=@($candidate.modes|Where-Object mode -CEQ 'audible')
 if($audible.Count-ne1){throw 'Preserved13 audible proposal missing.'}
 foreach($pin in $audible[0].payload){Check $pin.source $pin.sha256 $pin.bytes}
 foreach($pair in @(@('installation-manifest.json',$audible[0].installationManifestSha256),@('rollback-manifest.json',$audible[0].rollbackManifestSha256),@('preflight.json',$audible[0].preflightSha256),@('session-lease-template.json',$audible[0].leaseTemplateSha256))){Check (Join-Path $audible[0].directory $pair[0]) $pair[1]}
 Check $audible[0].optionalRecordingLease.sourceTemplate '1d7fa85958a3baae51195141edd6580f140d00288193b927672ba36b81f6f18c'
 # Historical13 compiled source hashes describe that preserved image. They are
 # not compared with the deliberately corrected current14 source tree.
 return [ordered]@{buildReceiptPath=$path;buildReceiptSha256=(Hash $path);audiblePluginPath=$old.audible.pluginPath;audiblePluginSha256=$old.audible.pluginSha256;audiblePluginBytes=$old.audible.pluginBytes;hostPath=$old.host.path;hostSha256=$old.host.sha256;hostBytes=$old.host.bytes;packageRoot=$old.package.root;packageManifestPath=$old.package.manifestPath;packageManifestSha256=$old.package.manifestSha256;packageBindingsVerified=132;candidateReceiptPath=$candidatePath;candidateReceiptSha256=(Hash $candidatePath);optionalRecordingTemplateSha256='1d7fa85958a3baae51195141edd6580f140d00288193b927672ba36b81f6f18c';rebuilt=$false;modified=$false;liveQualified=$false}
}
$baselinePath=Join-Path $repo '.local/playable-14/baseline.json';Check $baselinePath '8fce329188b82f650f7885e40e54243f8c43bb3a0816ef994dc112d34763b642'
$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
if($baseline.profile-cne'PLAYABLE-14'-or@($baseline.protected).Count-ne11-or@($baseline.settings).Count-ne4){throw 'Expected protected14 baseline.'}
foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256 $pin.bytes}
$gamePin=@($baseline.protected|Where-Object name -CEQ 'GTA5_Enhanced.exe');if($gamePin.Count-ne1){throw 'Game baseline missing.'};$game=Split-Path -Parent $gamePin[0].path
$featuresPath=Join-Path $repo 'config/production-features.json';Check $featuresPath 'c2714e26e9e044534d91c11a2ce7abef5e591534c702f2c85c195817faa55132' 95
$nativeReceiptPath=Join-Path $repo 'build/playable-09-shv-handoff-final/build-receipt.json';Check $nativeReceiptPath 'f9d28cf4040bc4aa449a3620cfc942a6ed9006e7110e2fc3d9d8876788dc5dda'
$native=Get-Content -LiteralPath $nativeReceiptPath -Raw|ConvertFrom-Json;$nativeSha='05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40';Check $native.Candidate.Path $nativeSha 129024
if(@($native.SourceInputs).Count-ne4){throw 'Expected unchanged four-source native producer.'};foreach($pin in $native.SourceInputs){Check (Join-Path $repo ($pin.Name-creplace'^repo/','')) $pin.Sha256}
$preserved13=Preserved13
if(!$SdkPath){$SdkPath=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/sdk/RagePluginHookSDK.dll'};Check $SdkPath '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-14/build-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-14')).TrimEnd('\')+'\'
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'New private PLAYABLE-14 build directory required.'};Unlinked $output
$dir=Join-Path $output 'passive';[IO.Directory]::CreateDirectory($dir)|Out-Null
$constants=[ordered]@{WorkspaceRoot=$repo;GamePath=(Join-Path $game 'GTA5_Enhanced.exe');GameVersion='1.0.1158.16';GameSha256=$gamePin[0].sha256;ShvPath=(Join-Path $game 'ScriptHookV.dll');ShvSha256='126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f';LoaderPath=(Join-Path $game 'dinput8.dll');LoaderSha256='9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d';ProducerPath=(Join-Path $game 'RichAudio.OperatingState.ShvHandoff.asi');ProducerSha256=$nativeSha;LeasePath=(Join-Path $game 'Plugins/RichAudio.ShvHandoff.json');GameplayPointerPath=(Join-Path $game 'Plugins/RichAudio.Bati13.json')}
$policy=Join-Path $dir 'ShvHandoffBuildPolicy.generated.cs';$lines=@('namespace RichAudio.Beacon.Handoff { internal static class ShvHandoffBuildPolicy {')
foreach($name in $constants.Keys){$lines+='internal const string '+$name+' = @"'+$constants[$name].Replace('"','""')+'";'};$lines+='} }';[IO.File]::WriteAllLines($policy,$lines,[Text.UTF8Encoding]::new($false))
& (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1') -SdkPath $SdkPath -Playable -ShvHandoff -ShvHandoff14 -ShvHandoffPolicySource $policy -Output $dir
if($LASTEXITCODE-ne0){throw 'Passive14 actual-SDK build failed.'}
$binary=Join-Path $dir 'RichAudio.Beacon.Rph.dll';$sourcePath=Join-Path $dir 'passive-build-source-manifest.json';$source=Get-Content -LiteralPath $sourcePath -Raw|ConvertFrom-Json
if($source.profile-cne'PLAYABLE-14'-or$source.passiveOnly-ne$true-or$source.audioPlaybackAllowed-ne$false-or@($source.sources).Count-lt47){throw 'Expected passive14 compiled source manifest.'};foreach($pin in $source.sources){Check $pin.path $pin.sha256}
$passive=[ordered]@{pluginPath=$binary;pluginSha256=(Hash $binary);pluginBytes=(Get-Item -LiteralPath $binary).Length;sourceManifestPath=$sourcePath;sourceManifestSha256=(Hash $sourcePath);policySourceSha256=(Hash $policy);sources=$source.sources}
$template=[ordered]@{schema=1;profile='PLAYABLE-14';runtimePolicy='functional-compatibility';sessionId=('0'*32);gameProcessId=0;gameProcessCreationFileTime='0';gamePath=$constants.GamePath;gameSha256=$constants.GameSha256;gameVersion=$constants.GameVersion;shvPath=$constants.ShvPath;shvSha256=$constants.ShvSha256;loaderPath=$constants.LoaderPath;loaderSha256=$constants.LoaderSha256;producerPath=$constants.ProducerPath;producerSha256=$nativeSha;callerAssemblySha256=$passive.pluginSha256;passiveOnly=$true;audioPlaybackAllowed=$false;fixtureOnly=$false;identityMode='read-only-sdk-ordinary-reuse';counterWrapAddressAbaExcluded=$true}
if($template.Count-ne21){throw 'Expected strict21-field passive lease.'};$templatePath=Join-Path $dir 'session-lease-template.json';WriteNew $templatePath $template;$passive.leaseTemplatePath=$templatePath;$passive.leaseTemplateSha256=Hash $templatePath
foreach($pin in $source.sources){Check $pin.path $pin.sha256};foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256 $pin.bytes};foreach($pin in $native.SourceInputs){Check (Join-Path $repo ($pin.Name-creplace'^repo/','')) $pin.Sha256};$null=Preserved13
Check $featuresPath 'c2714e26e9e044534d91c11a2ce7abef5e591534c702f2c85c195817faa55132' 95
$receipt=[ordered]@{schema=1;profile='PLAYABLE-14';mode='passive';passiveOnly=$true;audioPlaybackAllowed=$false;runtimePolicy='functional-compatibility';builtUtc=[DateTime]::UtcNow.ToString('o');baselineSha256=(Hash $baselinePath);passive=$passive;producer=[ordered]@{path=$native.Candidate.Path;sha256=$nativeSha;bytes=129024;buildReceiptPath=$nativeReceiptPath;buildReceiptSha256=(Hash $nativeReceiptPath);sources=$native.SourceInputs;modified=$false};preserved13=$preserved13;globalFeatureFlags=[ordered]@{modificationAwareLoudness=$false;synchronizedAudioRecording=$false};sdkSha256=(Hash $SdkPath);builderSha256=(Hash $PSCommandPath);bridgeBuilderSha256=(Hash (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1'));audibleRebuilt=$false;hostRebuilt=$false;recordingRebuilt=$false;packageRebuilt=$false;gameFilesWritten=$false;deployed=$false;gameLaunched=$false;endpointOpened=$false;audioPlayed=$false;recordingStarted=$false;liveHandoffAccepted=$false;playableInGame=$false;limits='Updated passive image only; unchanged native producer and preserved13 audible/host/package/recording are references, not newly qualified live artifacts. No deployment, game or endpoint execution.'}
$receiptPath=Join-Path $output 'playable14-build-receipt.json';WriteNew $receiptPath $receipt
Write-Output ('PASS built only updated passive14 candidate; preserved13 audio bytes; no live execution: '+$receiptPath)
