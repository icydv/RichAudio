#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$BuildReceipt,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ReviewedBuildReceiptSha256,
 [Parameter(Mandatory)][string]$ValidationReceipt,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ReviewedValidationReceiptSha256,
 [string]$Output=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked input/output path refused.'}}}
function Check([string]$Path,[string]$Sha,[long]$Bytes=-1){Unlinked $Path;if((Hash $Path)-cne$Sha-or($Bytes-ge0-and(Get-Item -LiteralPath $Path).Length-ne$Bytes)){throw ('Input differs: '+[IO.Path]::GetFileName($Path))}}
function Local([string]$Path){$value=[IO.Path]::GetFullPath($(if([IO.Path]::IsPathRooted($Path)){$Path}else{Join-Path $repo $Path}));if(!$value.StartsWith(([IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Private local receipt required.'};Unlinked $value;return $value}
function WriteNew([string]$Path,$Value){$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 18));$file=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$file.Write($bytes,0,$bytes.Length);$file.Flush($true)}finally{$file.Dispose()}}
function CopyNew([string]$From,[string]$To,[string]$Expected,[long]$Length){
 Check $From $Expected $Length;$inputFile=[IO.File]::Open($From,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try{$sha=[Security.Cryptography.SHA256]::Create();try{$actual=[BitConverter]::ToString($sha.ComputeHash($inputFile)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()};if($actual-cne$Expected-or$inputFile.Length-ne$Length){throw 'Pinned source changed.'};$inputFile.Position=0
  $file=[IO.File]::Open($To,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$inputFile.CopyTo($file);$file.Flush($true)}finally{$file.Dispose()}
 }finally{$inputFile.Dispose()};Check $To $Expected $Length
}
$baselinePath=Join-Path $repo '.local/playable-14/baseline.json';Check $baselinePath '8fce329188b82f650f7885e40e54243f8c43bb3a0816ef994dc112d34763b642'
$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
if($baseline.profile-cne'PLAYABLE-14'-or@($baseline.protected).Count-ne11-or@($baseline.settings).Count-ne4){throw 'Protected13 baseline differs.'}
foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256 $pin.bytes}
$gamePin=@($baseline.protected|Where-Object name -ceq 'GTA5_Enhanced.exe');$original=@($baseline.protected|Where-Object name -ceq 'Plugins/RichAudio.dll')
if($gamePin.Count-ne1-or$original.Count-ne1){throw 'Game/plugin baseline missing.'};$game=Split-Path -Parent $gamePin[0].path
$settingsPin=@($baseline.settings|Where-Object name -ceq 'acoustic-settings.json');if($settingsPin.Count-ne1){throw 'Saved settings baseline missing.'}
$saved=Get-Content -LiteralPath $settingsPin[0].path -Raw|ConvertFrom-Json;$features=Get-Content -LiteralPath (Join-Path $repo 'config/production-features.json') -Raw|ConvertFrom-Json
if($saved.integrationMode-cne'stock-fallback'-or$features.modificationAwareLoudness-ne$false-or$features.synchronizedAudioRecording-ne$false){throw 'Stock fallback and disabled production flags must be preserved.'}
if(@(Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.ProcessName-match'^(GTA5_Enhanced|GTA5|RAGEPluginHook|RichAudio.*)$'}).Count){throw 'Game/RPH/RichAudio processes must be absent during preparation.'}
$absent=@('RichAudio.OperatingState.Shv.asi','RichAudio.OperatingState.ShvHandoff.asi','Plugins/RichAudio.ShvHandoff.json','Plugins/RichAudio.RuntimeProvenance.json','Plugins/RichAudio.Bati13.json')
foreach($number in @('09','10','12','13','14','15')){$absent+=@("RichAudio.OperatingState.ShvHandoff.asi.playable$number.pending","Plugins/RichAudio.ShvHandoff.json.playable$number.pending","Plugins/RichAudio.dll.playable$number.pending","Plugins/RichAudio.dll.playable$number.original")}
$absent+='Plugins/RichAudio.Bati13.json.playable15.pending'
foreach($relative in $absent){$path=Join-Path $game $relative;Unlinked $path;if(Test-Path -LiteralPath $path){throw ('Owned proposal path already exists: '+$relative)}}
$receiptPath=Local $BuildReceipt;$validationPath=Local $ValidationReceipt;Check $receiptPath $ReviewedBuildReceiptSha256;Check $validationPath $ReviewedValidationReceiptSha256
$build=Get-Content -LiteralPath $receiptPath -Raw|ConvertFrom-Json;$validation=Get-Content -LiteralPath $validationPath -Raw|ConvertFrom-Json
if($build.profile-cne'PLAYABLE-15'-or$build.runtimePolicy-cne'functional-compatibility'-or$build.gameLaunched-ne$false-or$build.endpointOpened-ne$false-or$build.playableInGame-ne$false){throw 'Expected offline-only13 build receipt.'}
if($validation.profile-cne'PLAYABLE-15'-or$validation.passed-ne$true-or$validation.buildReceiptSha256-cne$ReviewedBuildReceiptSha256-or$validation.passivePluginSha256-cne$build.passive.pluginSha256-or$validation.audiblePluginSha256-cne$build.audible.pluginSha256-or$validation.hostSha256-cne$build.host.sha256-or$validation.packageManifestSha256-cne$build.package.manifestSha256-or$validation.gameLaunched-ne$false-or$validation.endpointOpened-ne$false){throw 'Passing exact-artifact offline validation is required.'}
Check $build.producer.path '05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40' 129024
Check $build.producer.buildReceiptPath 'f9d28cf4040bc4aa449a3620cfc942a6ed9006e7110e2fc3d9d8876788dc5dda'
foreach($pin in $build.producer.sources){Check (Join-Path $repo ($pin.Name-creplace'^repo/','')) $pin.Sha256}
foreach($mode in @('passive','audible')){
 $artifact=$build.$mode;Check $artifact.pluginPath $artifact.pluginSha256 $artifact.pluginBytes;Check $artifact.sourceManifestPath $artifact.sourceManifestSha256;Check $artifact.leaseTemplatePath $artifact.leaseTemplateSha256
 foreach($pin in $artifact.sources){Check $pin.path $pin.sha256}
}
Check $build.host.path $build.host.sha256 $build.host.bytes;foreach($pin in $build.host.sources){Check $pin.path $pin.sha256}
$package=Local $build.package.root;Check $build.package.manifestPath $build.package.manifestSha256
$manifest=Get-Content -LiteralPath $build.package.manifestPath -Raw|ConvertFrom-Json
if($manifest.demoProfile-cne'PLAYABLE-13'-or$manifest.rphVersion-cne'functional-compatibility'-or@($manifest.eligible).Count-ne1-or$manifest.eligible[0].model-ne4180675781-or$manifest.eligible[0].context-cne'player'-or$manifest.calibration.exhaustToEngine-ne10-or$manifest.calibration.commonSourceHeadroomTrim-ne0.25){throw 'Expected unchanged-calibration Bati-player-only manifest.'}
foreach($binding in $manifest.bindings){$path=[IO.Path]::GetFullPath((Join-Path $package $binding.file));if(!$path.StartsWith($package+'\',[StringComparison]::OrdinalIgnoreCase)-or$binding.file-match'^plugin/'){throw 'Package binding escaped or includes a plugin.'};Check $path $binding.sha256}
if(!$Output){$Output=Join-Path $repo '.local/playable-15/candidate'};$out=Local $Output;$allowed=Join-Path $repo '.local/playable-15'
if(![IO.Path]::GetDirectoryName($out).Equals($allowed,[StringComparison]::OrdinalIgnoreCase)-or[IO.Path]::GetFileName($out)-notmatch'^candidate(?:-[a-z0-9-]+)?$'-or(Test-Path -LiteralPath $out)){throw 'New direct13 candidate(-suffix) directory required.'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$modes=[Collections.Generic.List[object]]::new()
foreach($mode in @('passive','audible')){
 $dir=Join-Path $out $mode;[IO.Directory]::CreateDirectory($dir)|Out-Null;$artifact=$build.$mode
 $native=Join-Path $dir 'RichAudio.OperatingState.ShvHandoff.asi';CopyNew $build.producer.path $native $build.producer.sha256 $build.producer.bytes
 $plugin=Join-Path $dir 'RichAudio.dll';CopyNew $artifact.pluginPath $plugin $artifact.pluginSha256 $artifact.pluginBytes
 $payload=@(
  [ordered]@{source=$native;destination=(Join-Path $game 'RichAudio.OperatingState.ShvHandoff.asi');pendingPath=(Join-Path $game 'RichAudio.OperatingState.ShvHandoff.asi.playable15.pending');sha256=$build.producer.sha256;bytes=$build.producer.bytes;operation='create-only';owner='PLAYABLE-15 unchanged native SHV producer'},
  [ordered]@{source=$plugin;destination=(Join-Path $game 'Plugins/RichAudio.dll');pendingPath=(Join-Path $game 'Plugins/RichAudio.dll.playable15.pending');backupPath=(Join-Path $game 'Plugins/RichAudio.dll.playable15.original');sha256=$artifact.pluginSha256;bytes=$artifact.pluginBytes;originalSha256=$original[0].sha256;originalBytes=$original[0].bytes;operation='temporary exact-owned replacement';owner=('PLAYABLE-15 '+$mode+' integration')}
 )
 $template=Get-Content -LiteralPath $artifact.leaseTemplatePath -Raw|ConvertFrom-Json
 if($template.profile-cne'PLAYABLE-15'-or$template.runtimePolicy-cne'functional-compatibility'-or$template.callerAssemblySha256-cne$artifact.pluginSha256-or$template.passiveOnly-ne($mode-ceq'passive')-or$template.audioPlaybackAllowed-ne($mode-ceq'audible')-or@($template.PSObject.Properties).Count-ne$(if($mode-ceq'passive'){21}else{24})){throw 'Compiled lease template differs.'}
 if($mode-ceq'audible'){
  if($template.recordingAllowed-ne$false-or$template.loopbackAllowed-ne$false-or$template.playablePointerSha256-cne''){throw 'Audible template must require a new pointer binding and have recording disabled.'}
  $pointer=Join-Path $dir 'RichAudio.Bati13.json';WriteNew $pointer ([ordered]@{schema=1;packageRoot=$package;manifestSha256=$build.package.manifestSha256})
  $pointerSha=Hash $pointer;$template.playablePointerSha256=$pointerSha
  $payload+=[ordered]@{source=$pointer;destination=(Join-Path $game 'Plugins/RichAudio.Bati13.json');pendingPath=(Join-Path $game 'Plugins/RichAudio.Bati13.json.playable15.pending');sha256=$pointerSha;bytes=(Get-Item -LiteralPath $pointer).Length;operation='create-only private package pointer';owner='PLAYABLE-15 separately authorized additive Bati playback'}
 }
 $templatePath=Join-Path $dir 'session-lease-template.json';WriteNew $templatePath $template
 $recordingTemplate=$null
 if($mode-ceq'audible'){
  # The compiled artifact is unchanged. This alternative permit remains
  # unselected until a separate approval explicitly includes PCM + loopback.
  $recordingLease=($template|ConvertTo-Json -Depth 5)|ConvertFrom-Json
  $recordingLease.recordingAllowed=$true;$recordingLease.loopbackAllowed=$true
  $recordingPath=Join-Path $dir 'session-lease-template-recording.json';WriteNew $recordingPath $recordingLease
  $recordingTemplate=[ordered]@{sourceTemplate=$recordingPath;templateSha256=(Hash $recordingPath);fieldCount=24;selectedByDefault=$false;requiresSeparateExplicitPcmAndLoopbackAuthorization=$true;globalProductionFeatureFlagsChanged=$false}
 }
 $protected=@($baseline.protected|ForEach-Object{[ordered]@{relativePath=$_.name;path=$_.path;sha256=$_.sha256;bytes=$_.bytes}})
 $install=[ordered]@{schema=1;profile='PLAYABLE-15';mode=$mode;runtimePolicy='functional-compatibility';executed=$false;requiresSeparateExplicitDeploymentAndLaunchApproval=$true;requiresAcceptedLivePassiveHandoff=($mode-ceq'audible');payload=$payload;
  lease=[ordered]@{destination=(Join-Path $game 'Plugins/RichAudio.ShvHandoff.json');pendingPath=(Join-Path $game 'Plugins/RichAudio.ShvHandoff.json.playable15.pending');maximumBytes=8192;fieldCount=@($template.PSObject.Properties).Count;sourceTemplate=$templatePath;templateSha256=(Hash $templatePath);creation='Only after separately approved launch and exact new process PID/kernel creation time; fresh session, caller hash and owned atomic lease receipt.'};
  packageRoot=$(if($mode-ceq'audible'){$package}else{$null});packageManifestSha256=$(if($mode-ceq'audible'){$build.package.manifestSha256}else{$null});optionalRecordingLease=$recordingTemplate;
  protectedInstallation=$protected;reviewedShortcutBaselines=$baseline.settings;settingsPath=$settingsPin[0].path;stockFallbackSelected=$true;productionFeatureFlagsDisabled=$true;audioAllowed=($mode-ceq'audible');recordingAllowed=$false;loopbackAllowed=$false;nativeAudioSuppressed=$false;
  preconditions=@('Fresh explicit approval for exact mode, native/managed hashes, pointer if audible, one deployment and one launch','Verify11 protected files/four settings, disabled production flags, expected original backup and all owned paths absent','For audible mode additionally require actual accepted passive handoff and separate audio approval','Verify actual Steam acceptance beyond ShowGameArgs and any ShowInterstitials; preserve current state on failure; no automatic retry');
  operations=@('Stage only exact owned artifacts as new pending files; flush/hash/receipt before atomic moves','Verify original plugin and move into absent same-volume backup; install exact own plugin and producer','Install package pointer only for separately approved audible mode; private PCM/source/runtime package stays outside the game','Invoke existing reviewed RPH route once; create session lease only for observed exact new Enhanced process lifetime','Passive mode opens no endpoint; audible mode requires explicit enable and accepted fresh real Bati frames','Exit normally, verify process lifetimes ended and execute exact owned rollback; retain evidence');
  forbiddenChanges=@('Third-party game/RPH/SHV/loader/DirectStorage binaries or configuration','Saved preferences, gold menu shortcuts, global feature flags or native GTA sound','Installing proprietary source material in the game or posting private assets','Recording/loopback without separate explicit authorization','Automatic restart/rebind/relaunch after failure')}
 $rollback=[ordered]@{schema=1;profile='PLAYABLE-15';mode=$mode;executed=$false;requiresGameAndRphProcessExit=$true;requiresOwnedAudioHostExit=($mode-ceq'audible');ownershipReceiptRequired=$true;recursiveDeletionAllowed=$false;capturesRemoved=$false;
  createdFiles=@($payload|Where-Object operation -match '^create-only'|ForEach-Object{[ordered]@{paths=@($_.destination,$_.pendingPath);sha256=$_.sha256;bytes=$_.bytes}});
  bridge=[ordered]@{path=$payload[1].destination;pendingPath=$payload[1].pendingPath;candidateSha256=$artifact.pluginSha256;candidateBytes=$artifact.pluginBytes;backupPath=$payload[1].backupPath;originalSha256=$original[0].sha256;originalBytes=$original[0].bytes};
  lease=[ordered]@{paths=@($install.lease.destination,$install.lease.pendingPath);sha256='Future exact session lease creation receipt; no wildcard';maximumBytes=8192};protectedInstallation=$protected;reviewedShortcutBaselines=$baseline.settings;
  operations=@('Require normal game/RPH and owned host process exit before removal; no hot unload','Remove only owned ASI/pointer/pending files with exact creation receipt, hash and length','Remove lease/pending only using future exact session creation receipt','Remove own candidate plugin only with exact owned hash/length; refuse unexpected bytes','Verify original backup and move to absent original path; reverify all11 protected/four settings','Leave private asset package, logs, recordings and evidence retained; no recursive delete, preference changes or retry')}
 $preflight=[ordered]@{schema=1;profile='PLAYABLE-15';mode=$mode;runtimePolicy='functional-compatibility';result='PASS';buildReceiptSha256=$ReviewedBuildReceiptSha256;validationReceiptSha256=$ReviewedValidationReceiptSha256;baselineSha256=(Hash $baselinePath);protectedCount=11;settingsCount=4;candidatePayload=$payload;leaseFieldCount=@($template.PSObject.Properties).Count;stockFallbackSelected=$true;productionFlagsDisabled=$true;ownedPathsAbsent=$true;ownedProcessesAbsent=$true;gameFilesWritten=$false;gameLaunched=$false;endpointOpened=$false;audioPlayed=$false;liveHandoffAccepted=$false;playableInGame=$false;approvalGranted=$false;preparerSha256=(Hash $PSCommandPath)}
 WriteNew (Join-Path $dir 'installation-manifest.json') $install;WriteNew (Join-Path $dir 'rollback-manifest.json') $rollback;WriteNew (Join-Path $dir 'preflight.json') $preflight
 $modes.Add([ordered]@{mode=$mode;directory=$dir;payload=$payload;installationManifestSha256=(Hash (Join-Path $dir 'installation-manifest.json'));rollbackManifestSha256=(Hash (Join-Path $dir 'rollback-manifest.json'));preflightSha256=(Hash (Join-Path $dir 'preflight.json'));leaseTemplateSha256=(Hash $templatePath);optionalRecordingLease=$recordingTemplate})
}
foreach($pin in @($baseline.protected)+@($baseline.settings)){Check $pin.path $pin.sha256 $pin.bytes}
$proposal=[ordered]@{schema=1;profile='PLAYABLE-15';preparedUtc=[DateTime]::UtcNow.ToString('o');modes=$modes.ToArray();buildReceiptSha256=$ReviewedBuildReceiptSha256;validationReceiptSha256=$ReviewedValidationReceiptSha256;protectedFiles=11;settings=4;separatePassiveThenAudioApprovalsRequired=$true;deployed=$false;gameLaunched=$false;endpointOpened=$false;audioPlayed=$false;recordingAllowedByDefault=$false;optionalRecordingTemplateRequiresSeparateApproval=$true;playableInGame=$false}
WriteNew (Join-Path $out 'candidate-receipt.json') $proposal
Write-Output ('PASS prepared separate passive and audible proposals only: '+$out)
