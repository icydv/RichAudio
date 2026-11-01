#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='',[string]$SdkPath='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked build/input path refused.'}}}
function Check([string]$Path,[string]$Sha,[long]$Bytes=-1){Unlinked $Path;if((Hash $Path)-cne$Sha-or($Bytes-ge0-and(Get-Item -LiteralPath $Path).Length-ne$Bytes)){throw ('Input differs: '+[IO.Path]::GetFileName($Path))}}
function WriteNew([string]$Path,$Value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 18));$file=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}}
function CopyNew([string]$From,[string]$To,[string]$Expected){
 Unlinked $From;Unlinked $To;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($To))|Out-Null
 $inputFile=[IO.File]::Open($From,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try{$sha=[Security.Cryptography.SHA256]::Create();try{$actual=[BitConverter]::ToString($sha.ComputeHash($inputFile)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()};if($actual-cne$Expected){throw 'Copy source differs.'};$inputFile.Position=0
  $destination=[IO.File]::Open($To,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$inputFile.CopyTo($destination);$destination.Flush($true)}finally{$destination.Dispose()}
 }finally{$inputFile.Dispose()};Check $To $Expected
}
# Preserve the restored installation and the previously reviewed audible chain.
$baselinePath=Join-Path $repo '.local/playable-14/baseline.json';Check $baselinePath '8fce329188b82f650f7885e40e54243f8c43bb3a0816ef994dc112d34763b642'
$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
if($baseline.profile-cne'PLAYABLE-14'-or@($baseline.protected).Count-ne11-or@($baseline.settings).Count-ne4){throw 'Expected protected14 baseline.'}
foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256 $pin.bytes}
$gamePin=@($baseline.protected|Where-Object name -ceq 'GTA5_Enhanced.exe');if($gamePin.Count-ne1){throw 'Game baseline missing.'};$game=Split-Path -Parent $gamePin[0].path
$featuresPath=Join-Path $repo 'config/production-features.json';Check $featuresPath 'c2714e26e9e044534d91c11a2ce7abef5e591534c702f2c85c195817faa55132' 95
$retainedReceiptPath=Join-Path $repo '.local/playable-13/build-05/playable13-build-receipt.json';Check $retainedReceiptPath 'c3122cfd845b4bd96b549a006f1e6f5804a0d7f659c9bc0d1286564a009f6719'
$retained=Get-Content -LiteralPath $retainedReceiptPath -Raw|ConvertFrom-Json
Check $retained.audible.pluginPath '182903fbcc7ed6e87b5fa20de9f4c78a48d5e9fe796cad18cb8e9fc1875d7b4b' 349184
Check $retained.host.path '5c64559983b81a19b0c66c7f01fb19a3b584eef30a9980ed6ef2296b5b611f42' 306176
foreach($pin in $retained.host.sources){Check $pin.path $pin.sha256}
Check $retained.package.manifestPath 'c4406978e5f97384f4b3ddab26ebbecfd67529a9665d021419275b90c785f750'
$old=Get-Content -LiteralPath $retained.package.manifestPath -Raw|ConvertFrom-Json
if(@($old.bindings).Count-ne132-or$old.demoProfile-cne'PLAYABLE-13'-or$old.calibration.exhaustToEngine-ne10-or$old.calibration.commonSourceHeadroomTrim-ne0.25){throw 'Preserved13 package/calibration differs.'}
$names=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($pin in $old.bindings){$path=[IO.Path]::GetFullPath((Join-Path $retained.package.root $pin.file));if([IO.Path]::IsPathRooted($pin.file)-or!$names.Add($pin.file)-or!$path.StartsWith($retained.package.root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Retained binding escaped or duplicated.'};Check $path $pin.sha256}
$nativeReceiptPath=Join-Path $repo 'build/playable-09-shv-handoff-final/build-receipt.json';Check $nativeReceiptPath 'f9d28cf4040bc4aa449a3620cfc942a6ed9006e7110e2fc3d9d8876788dc5dda'
$native=Get-Content -LiteralPath $nativeReceiptPath -Raw|ConvertFrom-Json;$nativeSha='05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40';Check $native.Candidate.Path $nativeSha 129024
if(@($native.SourceInputs).Count-ne4){throw 'Expected unchanged native producer.'};foreach($pin in $native.SourceInputs){Check (Join-Path $repo ($pin.Name-creplace'^repo/','')) $pin.Sha256}
if(!$SdkPath){$SdkPath=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/sdk/RagePluginHookSDK.dll'};Check $SdkPath '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-15/build-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-15')).TrimEnd('\')+'\'
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'New private PLAYABLE-15 build directory required.'};Unlinked $output
$constants=[ordered]@{WorkspaceRoot=$repo;GamePath=(Join-Path $game 'GTA5_Enhanced.exe');GameVersion='1.0.1158.16';GameSha256=$gamePin[0].sha256;ShvPath=(Join-Path $game 'ScriptHookV.dll');ShvSha256='126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f';LoaderPath=(Join-Path $game 'dinput8.dll');LoaderSha256='9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d';ProducerPath=(Join-Path $game 'RichAudio.OperatingState.ShvHandoff.asi');ProducerSha256=$nativeSha;LeasePath=(Join-Path $game 'Plugins/RichAudio.ShvHandoff.json');GameplayPointerPath=(Join-Path $game 'Plugins/RichAudio.Bati13.json')}
$built=@{}
foreach($mode in @('passive','audible')){
 $dir=Join-Path $output $mode;[IO.Directory]::CreateDirectory($dir)|Out-Null
 $policy=Join-Path $dir 'ShvHandoffBuildPolicy.generated.cs';$lines=@('namespace RichAudio.Beacon.Handoff { internal static class ShvHandoffBuildPolicy {')
 foreach($name in $constants.Keys){$lines+='internal const string '+$name+' = @"'+$constants[$name].Replace('"','""')+'";'};$lines+='} }';[IO.File]::WriteAllLines($policy,$lines,[Text.UTF8Encoding]::new($false))
 $arguments=@{SdkPath=$SdkPath;Playable=$true;ShvHandoff=$true;ShvHandoff15=$true;ShvHandoffPolicySource=$policy;Output=$dir};if($mode-ceq'audible'){$arguments.BatiPlayback=$true}
 & (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1') @arguments
 if($LASTEXITCODE-ne0){throw ('Managed build failed: '+$mode)}
 $binary=Join-Path $dir 'RichAudio.Beacon.Rph.dll';$sourcePath=Join-Path $dir 'passive-build-source-manifest.json';$source=Get-Content -LiteralPath $sourcePath -Raw|ConvertFrom-Json
 if($source.profile-cne'PLAYABLE-15'-or$source.passiveOnly-ne($mode-ceq'passive')-or$source.audioPlaybackAllowed-ne($mode-ceq'audible')){throw 'Expected15 compiled profile.'};foreach($pin in $source.sources){Check $pin.path $pin.sha256}
 $built[$mode]=[ordered]@{pluginPath=$binary;pluginSha256=(Hash $binary);pluginBytes=(Get-Item -LiteralPath $binary).Length;sourceManifestPath=$sourcePath;sourceManifestSha256=(Hash $sourcePath);policySourceSha256=(Hash $policy);sources=$source.sources}
 $template=[ordered]@{schema=1;profile='PLAYABLE-15';runtimePolicy='functional-compatibility';sessionId=('0'*32);gameProcessId=0;gameProcessCreationFileTime='0';gamePath=$constants.GamePath;gameSha256=$constants.GameSha256;gameVersion=$constants.GameVersion;shvPath=$constants.ShvPath;shvSha256=$constants.ShvSha256;loaderPath=$constants.LoaderPath;loaderSha256=$constants.LoaderSha256;producerPath=$constants.ProducerPath;producerSha256=$nativeSha;callerAssemblySha256=$built[$mode].pluginSha256;passiveOnly=($mode-ceq'passive');audioPlaybackAllowed=($mode-ceq'audible');fixtureOnly=$false;identityMode='read-only-sdk-ordinary-reuse';counterWrapAddressAbaExcluded=$true}
 if($mode-ceq'audible'){$template.recordingAllowed=$false;$template.loopbackAllowed=$false;$template.playablePointerSha256=''}
 if($template.Count-ne$(if($mode-ceq'passive'){21}else{24})){throw 'Unexpected lease fields.'}
 $templatePath=Join-Path $dir 'session-lease-template.json';WriteNew $templatePath $template;$built[$mode]['leaseTemplatePath']=$templatePath;$built[$mode]['leaseTemplateSha256']=Hash $templatePath
}
# Reuse host, banks, Node, recorder and gains; update only existing JavaScript
# bindings from source so the listener generation integration fix is included.
$package=Join-Path $output 'package';[IO.Directory]::CreateDirectory($package)|Out-Null
$currentCode=[Collections.Generic.List[object]]::new();$preserved=[Collections.Generic.List[object]]::new()
foreach($binding in $old.bindings){
 $from=Join-Path $retained.package.root $binding.file;$digest=$binding.sha256
 if($binding.file.EndsWith('.mjs',[StringComparison]::Ordinal)){
  $from=Join-Path $repo $binding.file;$digest=Hash $from;$currentCode.Add([ordered]@{file=$binding.file;path=$from;sha256=$digest;previousSha256=$binding.sha256})
 }else{$preserved.Add([ordered]@{file=$binding.file;sha256=$digest})}
 CopyNew $from (Join-Path $package $binding.file) $digest
}
$manifest=[ordered]@{};foreach($property in $old.PSObject.Properties){if($property.Name-cne'bindings'){$manifest[$property.Name]=$property.Value}}
$manifest.bindings=@(Get-ChildItem -LiteralPath $package -Recurse -File|Sort-Object FullName|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($package,$_.FullName).Replace('\','/');sha256=(Hash $_.FullName)}})
# demoProfile remains PLAYABLE-13: it is the existing host protocol, not the new
# handoff lease profile. Changing it would bypass the preserved demo safeguards.
$manifestPath=Join-Path $package 'playable.json';WriteNew $manifestPath $manifest
$settingsPin=@($baseline.settings|Where-Object name -ceq 'acoustic-settings.json');if($settingsPin.Count-ne1){throw 'Saved settings missing.'}
$isolated=Get-Content -LiteralPath $settingsPin[0].path -Raw|ConvertFrom-Json
if($isolated.integrationMode-cne'stock-fallback'){throw 'Original stock fallback must remain selected.'}
$isolated.richAudioEnabled=$true;$isolated.integrationMode='experimental-additive';$isolated.soundMapVisible=$false;$isolated.revision=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$mutableRoot=Join-Path $package '.local';[IO.Directory]::CreateDirectory($mutableRoot)|Out-Null;$isolatedPath=Join-Path $mutableRoot 'acoustic-settings.json';WriteNew $isolatedPath $isolated
foreach($binding in $manifest.bindings){Check (Join-Path $package $binding.file) $binding.sha256}
foreach($mode in @('passive','audible')){foreach($pin in $built[$mode].sources){Check $pin.path $pin.sha256}}
foreach($pin in $currentCode){Check $pin.path $pin.sha256};foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256 $pin.bytes}
foreach($binding in $old.bindings){Check (Join-Path $retained.package.root $binding.file) $binding.sha256}
$receipt=[ordered]@{schema=1;profile='PLAYABLE-15';runtimePolicy='functional-compatibility';builtUtc=[DateTime]::UtcNow.ToString('o');baselinePath=$baselinePath;baselineSha256=(Hash $baselinePath);passive=$built.passive;audible=$built.audible;host=$retained.host;producer=[ordered]@{path=$native.Candidate.Path;sha256=$nativeSha;bytes=129024;buildReceiptPath=$nativeReceiptPath;buildReceiptSha256=(Hash $nativeReceiptPath);sources=$native.SourceInputs;modified=$false};
 package=[ordered]@{root=$package;manifestPath=$manifestPath;manifestSha256=(Hash $manifestPath);bindings=@($manifest.bindings).Count;eligible=$manifest.eligible;retainedManifestSha256=(Hash $retained.package.manifestPath);retainedPayloadBindingsVerified=132;retainedTotalDigestsVerified=133;preservedAssetBindings=$preserved.ToArray();currentCode=$currentCode.ToArray();isolatedSettingsPath=$isolatedPath;initialIsolatedSettingsSha256=(Hash $isolatedPath);mutableSettingsBoundInManifest=$false;originalUserSettingsChanged=$false;privatePackageOnly=$true};
 preserved13BuildReceiptSha256=(Hash $retainedReceiptPath);hostRebuilt=$false;rendererRebuilt=$false;sourceBanksRebuilt=$false;recorderRebuilt=$false;globalFeatureFlags=[ordered]@{modificationAwareLoudness=$false;synchronizedAudioRecording=$false};sdkSha256=(Hash $SdkPath);builderSha256=(Hash $PSCommandPath);bridgeBuilderSha256=(Hash (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1'));gameFilesWritten=$false;deployed=$false;gameLaunched=$false;endpointOpened=$false;audioPlayed=$false;recordingStarted=$false;liveHandoffAccepted=$false;playableInGame=$false;limits='Compiled15 passive/audible profiles and private Bati package only. Existing host/source/recorder/calibration retained. Actual corrected listener behaviour, endpoint output and human listening require separately approved live stages.'}
$receiptPath=Join-Path $output 'playable15-build-receipt.json';WriteNew $receiptPath $receipt
Write-Output ('PASS prepared corrected passive/audible15 profiles and private Bati package; no live execution: '+$receiptPath)
