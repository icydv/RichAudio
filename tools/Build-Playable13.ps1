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
 try{$sha=[Security.Cryptography.SHA256]::Create();try{$actual=[BitConverter]::ToString($sha.ComputeHash($inputFile)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()};if($actual-cne$Expected){throw 'Copy source hash differs.'};$inputFile.Position=0
  $destination=[IO.File]::Open($To,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$inputFile.CopyTo($destination);$destination.Flush($true)}finally{$destination.Dispose()}
 }finally{$inputFile.Dispose()}
 Check $To $Expected
}
$baselinePath=Join-Path $repo '.local/playable-13/baseline.json'
Check $baselinePath '828a5003df7eed899b00f04e0777c079bc276829340800dbc58c2f0393502698'
$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
if($baseline.profile-cne'PLAYABLE-13'-or@($baseline.protected).Count-ne11-or@($baseline.settings).Count-ne4){throw 'Expected protected13 baseline.'}
foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256 $pin.bytes}
$gamePin=@($baseline.protected|Where-Object name -ceq 'GTA5_Enhanced.exe');if($gamePin.Count-ne1){throw 'Game baseline missing.'};$game=Split-Path -Parent $gamePin[0].path
$featuresPath=Join-Path $repo 'config/production-features.json';$features=Get-Content -LiteralPath $featuresPath -Raw|ConvertFrom-Json
if($features.modificationAwareLoudness-ne$false-or$features.synchronizedAudioRecording-ne$false){throw 'Both production feature flags must stay false.'}
$retained=Join-Path $repo '.local/playable-01/RichAudio-PLAYABLE-01-r7';$retainedManifestPath=Join-Path $retained 'playable.json'
Check $retainedManifestPath '3dd074b700681e13ff397418692d91c28c55edfa5d347adbff6b95329b357ee7'
$old=Get-Content -LiteralPath $retainedManifestPath -Raw|ConvertFrom-Json
if(@($old.bindings).Count-ne132){throw 'Expected132 retained payload bindings plus manifest:133 digests.'}
$oldNames=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($binding in $old.bindings){
 if([IO.Path]::IsPathRooted($binding.file)-or!$oldNames.Add($binding.file)){throw 'Retained binding path or duplicate.'}
 $from=[IO.Path]::GetFullPath((Join-Path $retained $binding.file));if(!$from.StartsWith($retained+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Retained binding escaped.'};Check $from $binding.sha256
}
$nativeReceiptPath=Join-Path $repo 'build/playable-09-shv-handoff-final/build-receipt.json'
Check $nativeReceiptPath 'f9d28cf4040bc4aa449a3620cfc942a6ed9006e7110e2fc3d9d8876788dc5dda'
$nativeReceipt=Get-Content -LiteralPath $nativeReceiptPath -Raw|ConvertFrom-Json
$nativeSha='05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40'
Check $nativeReceipt.Candidate.Path $nativeSha 129024
if(@($nativeReceipt.SourceInputs).Count-ne4){throw 'Expected unchanged four-source native producer.'}
foreach($pin in $nativeReceipt.SourceInputs){Check (Join-Path $repo ($pin.Name-creplace'^repo/','')) $pin.Sha256}
if(!$SdkPath){$SdkPath=Join-Path (Split-Path -Parent $repo) 'RichAudio/.local/rph/sdk/RagePluginHookSDK.dll'}
Check $SdkPath '5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0'
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-13/build-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-13')).TrimEnd('\')+'\'
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'New private PLAYABLE-13 build directory required.'};Unlinked $output
[IO.Directory]::CreateDirectory($output)|Out-Null
$constants=[ordered]@{WorkspaceRoot=$repo;GamePath=(Join-Path $game 'GTA5_Enhanced.exe');GameVersion='1.0.1158.16';GameSha256=$gamePin[0].sha256;
 ShvPath=(Join-Path $game 'ScriptHookV.dll');ShvSha256='126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f';
 LoaderPath=(Join-Path $game 'dinput8.dll');LoaderSha256='9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d';
 ProducerPath=(Join-Path $game 'RichAudio.OperatingState.ShvHandoff.asi');ProducerSha256=$nativeSha;
 LeasePath=(Join-Path $game 'Plugins/RichAudio.ShvHandoff.json');GameplayPointerPath=(Join-Path $game 'Plugins/RichAudio.Bati13.json')}
$built=@{}
foreach($mode in @('passive','audible')){
 $dir=Join-Path $output $mode;[IO.Directory]::CreateDirectory($dir)|Out-Null
 $policy=Join-Path $dir 'ShvHandoffBuildPolicy.generated.cs';$lines=@('namespace RichAudio.Beacon.Handoff { internal static class ShvHandoffBuildPolicy {')
 foreach($name in $constants.Keys){$lines+='internal const string '+$name+' = @"'+$constants[$name].Replace('"','""')+'";'};$lines+='} }'
 [IO.File]::WriteAllLines($policy,$lines,[Text.UTF8Encoding]::new($false))
 $arguments=@{SdkPath=$SdkPath;Playable=$true;ShvHandoff=$true;ShvHandoff13=$true;ShvHandoffPolicySource=$policy;Output=$dir}
 if($mode-ceq'audible'){$arguments.BatiPlayback=$true}
 & (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1') @arguments
 if($LASTEXITCODE-ne0){throw ('Managed build failed: '+$mode)}
 $binary=Join-Path $dir 'RichAudio.Beacon.Rph.dll';$sourceManifest=@(Get-ChildItem -LiteralPath $dir -File -Filter '*source-manifest.json')
 if($sourceManifest.Count-ne1){throw 'Expected one exact compiled source manifest.'}
 $source=Get-Content -LiteralPath $sourceManifest[0].FullName -Raw|ConvertFrom-Json
 if($source.profile-cne'PLAYABLE-13'){throw 'Expected PLAYABLE-13 compiled profile.'}
 foreach($pin in $source.sources){Check $pin.path $pin.sha256}
 $built[$mode]=[ordered]@{pluginPath=$binary;pluginSha256=(Hash $binary);pluginBytes=(Get-Item -LiteralPath $binary).Length;
  sourceManifestPath=$sourceManifest[0].FullName;sourceManifestSha256=(Hash $sourceManifest[0].FullName);policySourceSha256=(Hash $policy);sources=$source.sources}
 $template=[ordered]@{schema=1;profile='PLAYABLE-13';runtimePolicy='functional-compatibility';sessionId=('0'*32);gameProcessId=0;gameProcessCreationFileTime='0';
  gamePath=$constants.GamePath;gameSha256=$constants.GameSha256;gameVersion=$constants.GameVersion;shvPath=$constants.ShvPath;shvSha256=$constants.ShvSha256;
  loaderPath=$constants.LoaderPath;loaderSha256=$constants.LoaderSha256;producerPath=$constants.ProducerPath;producerSha256=$nativeSha;callerAssemblySha256=$built[$mode].pluginSha256;
  passiveOnly=($mode-ceq'passive');audioPlaybackAllowed=($mode-ceq'audible');fixtureOnly=$false;identityMode='read-only-sdk-ordinary-reuse';counterWrapAddressAbaExcluded=$true}
 if($mode-ceq'audible'){$template.recordingAllowed=$false;$template.loopbackAllowed=$false;$template.playablePointerSha256=''}
 if($template.Count-ne$(if($mode-ceq'passive'){21}else{24})){throw 'Unexpected lease field count.'}
 $templatePath=Join-Path $dir 'session-lease-template.json';WriteNew $templatePath $template
 $built[$mode]['leaseTemplatePath']=$templatePath;$built[$mode]['leaseTemplateSha256']=Hash $templatePath
}
$hostSources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Windows') -Filter '*.cs' -File)+@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs' -File)+@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/recording') -Filter '*.cs' -File)+@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/geometry') -Filter '*.cs' -File)
$hostSources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Get-Item -LiteralPath (Join-Path $repo ('src/acoustics/observation/'+$_))}
$hostPins=@($hostSources|Sort-Object FullName -Unique|ForEach-Object{[ordered]@{path=$_.FullName;sha256=(Hash $_.FullName)}})
$hostDir=Join-Path $output 'host'; & (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1') -OutputDirectory $hostDir
if($LASTEXITCODE-ne0){throw 'Current Windows host compilation failed.'}
foreach($pin in $hostPins){Check $pin.path $pin.sha256}
$hostBinaryPath=Join-Path $hostDir 'RichAudio.Acoustics.Host.exe'
$package=Join-Path $output 'package';[IO.Directory]::CreateDirectory($package)|Out-Null
$preservedAssets=[Collections.Generic.List[object]]::new();$currentCode=[Collections.Generic.List[object]]::new()
foreach($binding in $old.bindings){
 if($binding.file.StartsWith('sources/',[StringComparison]::Ordinal)-or$binding.file-in@('runtime/node.exe','runtime/NODE-LICENSE.txt','build/acoustic-gpu/RichAudio.AcousticGpu.exe')){
  CopyNew (Join-Path $retained $binding.file) (Join-Path $package $binding.file) $binding.sha256;$preservedAssets.Add([ordered]@{file=$binding.file;sha256=$binding.sha256})
 }
}
# The renderer/source implementations are current repository code. Private PCM,
# Node and the GPU helper above are copied only from verified original bindings.
$codeFiles=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics') -Recurse -File -Filter '*.mjs')+@(Get-ChildItem -LiteralPath (Join-Path $repo 'tools/soundmap') -Recurse -File)+@(Get-Item -LiteralPath (Join-Path $repo 'tools/Run-Gameplay.mjs'))+@(Get-Item -LiteralPath (Join-Path $repo 'tools/Analyze-Playable13Recording.mjs'))
foreach($file in $codeFiles|Sort-Object FullName -Unique){$relative=[IO.Path]::GetRelativePath($repo,$file.FullName).Replace('\','/');$digest=Hash $file.FullName;CopyNew $file.FullName (Join-Path $package $relative) $digest;$currentCode.Add([ordered]@{file=$relative;path=$file.FullName;sha256=$digest})}
CopyNew $hostBinaryPath (Join-Path $package 'runtime/RichAudio.Acoustics.Host.exe') (Hash $hostBinaryPath)
CopyNew $featuresPath (Join-Path $package 'config/production-features.json') (Hash $featuresPath)
$readme=@('RichAudio PLAYABLE-13 private Bati candidate','Offline preparation only. No deployment, game launch, audio endpoint or recording is authorized by this package.','Eligibility: player-driven engine-running Bati, offline Story Mode, exact reviewed Enhanced/SHV stack.','Stock GTA audio remains intact; playback is limited additive audio with the existing10x exhaust-pressure reference and0.25 common trim.','The separately prepared passive test must pass before a separately approved audible test.','The managed plugin and ASI are staged separately from this asset package; no legacy installer/plugin or third-party framework is included.','Use the exact installation/rollback proposal and compiled artifact hashes for each approval. Do not run old PLAYABLE-01 Setup scripts.')
[IO.File]::WriteAllLines((Join-Path $package 'README.txt'),$readme,[Text.UTF8Encoding]::new($false))
$manifest=[ordered]@{}
foreach($property in $old.PSObject.Properties){if($property.Name-cne'bindings'){$manifest[$property.Name]=$property.Value}}
$manifest.rphVersion='functional-compatibility';$manifest.demoProfile='PLAYABLE-13';$manifest.eligible=@([ordered]@{model=[uint32]4180675781;context='player'})
$manifest.sourcePolicy='Genuine SHV normalised Bati engine operating-state with independently observed RPH pose/listener; no physical RPM or stock suppression.'
$manifest.modificationAwareLoudnessEnabled=$false;$manifest.synchronizedAudioRecordingEnabled=$false
$manifest.bindings=@(Get-ChildItem -LiteralPath $package -Recurse -File|Sort-Object FullName|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($package,$_.FullName).Replace('\','/');sha256=(Hash $_.FullName)}})
if(@($manifest.bindings|Where-Object{$_.file-match'^(plugin/|Setup|Uninstall|rph-prerequisite)'}).Count){throw 'Legacy plugin/installers must not enter the new asset package.'}
if($manifest.calibration.exhaustToEngine-ne10-or$manifest.calibration.commonSourceHeadroomTrim-ne0.25){throw 'Existing pressure/headroom calibration changed.'}
$manifestPath=Join-Path $package 'playable.json';WriteNew $manifestPath $manifest
# These are private demonstration preferences, never installed over the user's
# stock-fallback settings and deliberately outside immutable package bindings.
# The runtime still requires the explicit Enable command and fresh owned data.
$savedSettings=@($baseline.settings|Where-Object name -ceq 'acoustic-settings.json');if($savedSettings.Count-ne1){throw 'Saved settings baseline missing.'}
$isolated=Get-Content -LiteralPath $savedSettings[0].path -Raw|ConvertFrom-Json
$isolated.richAudioEnabled=$true;$isolated.integrationMode='experimental-additive';$isolated.soundMapVisible=$false
$isolated.revision=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$mutableRoot=Join-Path $package '.local';[IO.Directory]::CreateDirectory($mutableRoot)|Out-Null
$isolatedSettingsPath=Join-Path $mutableRoot 'acoustic-settings.json';WriteNew $isolatedSettingsPath $isolated
foreach($binding in $manifest.bindings){Check (Join-Path $package $binding.file) $binding.sha256}
foreach($mode in @('passive','audible')){foreach($pin in $built[$mode].sources){Check $pin.path $pin.sha256}}
foreach($pin in $currentCode){Check $pin.path $pin.sha256};foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256 $pin.bytes}
foreach($binding in $old.bindings){Check (Join-Path $retained $binding.file) $binding.sha256}
Check $retainedManifestPath '3dd074b700681e13ff397418692d91c28c55edfa5d347adbff6b95329b357ee7'
$receipt=[ordered]@{schema=1;profile='PLAYABLE-13';runtimePolicy='functional-compatibility';builtUtc=[DateTime]::UtcNow.ToString('o');baselineSha256=(Hash $baselinePath);
 passive=$built.passive;audible=$built.audible;host=[ordered]@{path=$hostBinaryPath;sha256=(Hash $hostBinaryPath);bytes=(Get-Item -LiteralPath $hostBinaryPath).Length;sources=$hostPins};
 producer=[ordered]@{path=$nativeReceipt.Candidate.Path;sha256=$nativeSha;bytes=129024;buildReceiptPath=$nativeReceiptPath;buildReceiptSha256=(Hash $nativeReceiptPath);sources=$nativeReceipt.SourceInputs;modified=$false};
 package=[ordered]@{root=$package;manifestPath=$manifestPath;manifestSha256=(Hash $manifestPath);bindings=@($manifest.bindings).Count;eligible=$manifest.eligible;retainedManifestSha256=(Hash $retainedManifestPath);retainedPayloadBindingsVerified=132;retainedTotalDigestsVerified=133;preservedAssetBindings=$preservedAssets.ToArray();currentCode=$currentCode.ToArray();oldPluginOrInstallerCopied=$false;pluginBoundInManifest=$false;privatePackageOnly=$true;isolatedSettingsPath=$isolatedSettingsPath;initialIsolatedSettingsSha256=(Hash $isolatedSettingsPath);mutableSettingsBoundInManifest=$false;originalUserSettingsChanged=$false};
 globalFeatureFlags=[ordered]@{modificationAwareLoudness=$false;synchronizedAudioRecording=$false};sdkSha256=(Hash $SdkPath);builderSha256=(Hash $PSCommandPath);bridgeBuilderSha256=(Hash (Join-Path $PSScriptRoot 'Build-BeaconBridge.ps1'));hostBuilderSha256=(Hash (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1'));
 gameFilesWritten=$false;deployed=$false;gameLaunched=$false;endpointOpened=$false;audioPlayed=$false;recordingStarted=$false;liveHandoffAccepted=$false;playableInGame=$false;
 limits='Compiled candidates and verified private asset package only. Actual passive handoff, Windows output and human listening remain separate explicitly approved live gates. RPH metadata is diagnostic; no distribution authentication is required.'}
$receiptPath=Join-Path $output 'playable13-build-receipt.json';WriteNew $receiptPath $receipt
Write-Output ('PASS prepared two compiled profiles and private Bati package; no live execution: '+$receiptPath)
