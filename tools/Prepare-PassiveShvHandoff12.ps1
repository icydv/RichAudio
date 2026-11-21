#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$BridgeBuild,
 [Parameter(Mandatory)][string]$NativeBuild,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ReviewedBridgeSha256,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ReviewedBuildReceiptSha256,
 [Parameter(Mandatory)][string]$ProfileValidation,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ReviewedProfileReceiptSha256,
 [Parameter(Mandatory)][string]$PipelineValidation,
 [string]$Output=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){
 for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){
  if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked candidate/input/installation paths are forbidden.'}
 }
}
function WithinRepo([string]$Path){
 $full=[IO.Path]::GetFullPath($(if([IO.Path]::IsPathRooted($Path)){$Path}else{Join-Path $repo $Path}));Unlinked $full
 $allowed=@('build','.local')|ForEach-Object{[IO.Path]::GetFullPath((Join-Path $repo $_)).TrimEnd('\')+'\'}
 if(!@($allowed|Where-Object{$full.StartsWith($_,[StringComparison]::OrdinalIgnoreCase)}).Count){throw 'Candidate inputs and outputs must be inside repository build or .local.'}
 return $full
}
function CheckPins($Pins){foreach($pin in $Pins){Unlinked $pin.path;if((Hash $pin.path)-cne$pin.sha256-or(Get-Item -LiteralPath $pin.path).Length-ne$pin.bytes){throw ('Preserved input differs: '+$pin.name)}}}
$baselinePath=Join-Path $repo '.local/playable-12/baseline.json'
if((Hash $baselinePath)-cne'15ad58db0e0c811498ea436a49874a14f93980bbe7712d8fbc831d2984df3b79'){throw 'PLAYABLE-12 preservation baseline differs.'}
$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
if($baseline.profile-cne'PLAYABLE-12'-or@($baseline.protected).Count-ne11-or@($baseline.settings).Count-ne4){throw 'Incomplete preservation baseline.'}
$immutableTracked=@($baseline.tracked|Where-Object {$_.name-match'^(docs/|evidence/|config/)'})
$preserved=@($baseline.private)+@($baseline.local11)+@($immutableTracked)
CheckPins (@($preserved)+@($baseline.protected)+@($baseline.settings))
$gamePin=@($baseline.protected|Where-Object name -ceq 'GTA5_Enhanced.exe');if($gamePin.Count-ne1){throw 'Missing game baseline.'}
$game=Split-Path -Parent $gamePin[0].path
$bridge=WithinRepo $BridgeBuild;$native=WithinRepo $NativeBuild;$profilePath=WithinRepo $ProfileValidation;$pipelinePath=WithinRepo $PipelineValidation
if(!$Output){$Output=Join-Path $repo '.local/playable-12/candidate'}
$out=WithinRepo $Output
$proposalRoot=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-12')).TrimEnd('\')
if(![IO.Path]::GetDirectoryName($out).Equals($proposalRoot,[StringComparison]::OrdinalIgnoreCase)-or[IO.Path]::GetFileName($out)-notmatch'^candidate(?:-[a-z0-9-]+)?$'){throw 'Output must be a new direct candidate(-suffix) directory under .local/playable-12.'}
if(Test-Path -LiteralPath $out){throw 'Candidate output must be new; historical receipts are never overwritten.'}
$settingsPin=@($baseline.settings|Where-Object name -ceq 'acoustic-settings.json');if($settingsPin.Count-ne1){throw 'Missing product settings baseline.'}
$settings=Get-Content -LiteralPath $settingsPin[0].path -Raw|ConvertFrom-Json
if($settings.integrationMode-cne'stock-fallback'){throw 'Stock fallback must remain selected.'}
$features=Get-Content -LiteralPath (Join-Path $repo 'config/production-features.json') -Raw|ConvertFrom-Json
if($features.modificationAwareLoudness-ne$false-or$features.synchronizedAudioRecording-ne$false){throw 'Both product feature flags must remain false.'}
$processes=@(Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.ProcessName-match'^(GTA5_Enhanced|GTA5|RAGEPluginHook|RichAudio.*)$'})
if($processes.Count){throw 'Game/RPH/RichAudio processes must be absent.'}
foreach($scope in @('Process','User','Machine')){if(![string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('RICHAUDIO_SHV_PROBE_TIMEOUT_MS',$scope))){throw 'Deadline override must be absent.'}}
$absent=@('RichAudio.OperatingState.Shv.asi','RichAudio.OperatingState.ShvHandoff.asi','Plugins/RichAudio.ShvHandoff.json','Plugins/RichAudio.RuntimeProvenance.json','Plugins/RichAudio.RuntimeProvenance.json.playable10.pending')
foreach($profileNumber in @('09','10','12')){$absent+=@("RichAudio.OperatingState.ShvHandoff.asi.playable$profileNumber.pending","Plugins/RichAudio.ShvHandoff.json.playable$profileNumber.pending","Plugins/RichAudio.dll.playable$profileNumber.pending","Plugins/RichAudio.dll.playable$profileNumber.original")}
foreach($relative in $absent){$path=Join-Path $game $relative;Unlinked $path;if(Test-Path -LiteralPath $path){throw ('Owned proposal path is occupied: '+$relative)}}
$nativeSha='05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40'
$nativeArtifact=Join-Path $native 'RichAudio.OperatingState.ShvHandoff.asi'
$bridgeArtifact=Join-Path $bridge 'RichAudio.Beacon.Rph.dll'
Unlinked $nativeArtifact;Unlinked $bridgeArtifact
if((Hash $nativeArtifact)-cne$nativeSha-or(Get-Item -LiteralPath $nativeArtifact).Length-ne129024){throw 'Wrong frozen native producer.'}
if((Hash $bridgeArtifact)-cne$ReviewedBridgeSha256){throw 'Bridge bytes differ from the explicit independently reviewed digest.'}
$bridgeReceiptPath=Join-Path $bridge 'passive-handoff-build-receipt.json'
if((Hash $bridgeReceiptPath)-cne$ReviewedBuildReceiptSha256){throw 'Bridge receipt differs from the explicit independently reviewed digest.'}
$bridgeReceipt=Get-Content -LiteralPath $bridgeReceiptPath -Raw|ConvertFrom-Json
if($bridgeReceipt.profile-cne'PLAYABLE-12'-or$bridgeReceipt.runtimePolicy-cne'functional-compatibility'-or$bridgeReceipt.passiveOnly-ne$true-or$bridgeReceipt.audioPlaybackAllowed-ne$false-or$bridgeReceipt.runtimeDistributionAuthenticated-ne$false-or$bridgeReceipt.apiHashWhitelistUsed-ne$false-or$bridgeReceipt.liveHandoffReady-ne$false-or$bridgeReceipt.pluginSha256-cne$ReviewedBridgeSha256-or$bridgeReceipt.pluginBytes-ne(Get-Item -LiteralPath $bridgeArtifact).Length){throw 'Functional passive bridge receipt mismatch.'}
$sourceRoot=$repo.TrimEnd('\')+'\'
foreach($pin in $bridgeReceipt.sources){$path=[IO.Path]::GetFullPath($pin.path);Unlinked $path;if(!$path.StartsWith($sourceRoot,[StringComparison]::OrdinalIgnoreCase)-or(Hash $path)-cne$pin.sha256){throw 'A compiled source/policy pin differs.'}}
if(@($bridgeReceipt.sources).Count-lt40){throw 'Incomplete passive compiled source manifest.'}
$sourceManifestPath=Join-Path $bridge 'passive-build-source-manifest.json'
if((Hash $sourceManifestPath)-cne$bridgeReceipt.sourceManifestSha256){throw 'Compiled source manifest differs.'}
$nativeReceiptPath=Join-Path $native 'build-receipt.json'
if((Hash $nativeReceiptPath)-cne'f9d28cf4040bc4aa449a3620cfc942a6ed9006e7110e2fc3d9d8876788dc5dda'){throw 'Wrong frozen native receipt.'}
$nativeReceipt=Get-Content -LiteralPath $nativeReceiptPath -Raw|ConvertFrom-Json
if(@($nativeReceipt.SourceInputs).Count-ne4){throw 'Expected four frozen native inputs.'}
foreach($pin in $nativeReceipt.SourceInputs){$path=Join-Path $repo ($pin.Name-creplace'^repo/','');Unlinked $path;if((Hash $path)-cne$pin.Sha256){throw 'Frozen native source differs.'}}
if((Hash $profilePath)-cne$ReviewedProfileReceiptSha256){throw 'Profile receipt differs from the explicit independently reviewed digest.'}
$profile=Get-Content -LiteralPath $profilePath -Raw|ConvertFrom-Json
if($profile.profile-cne'PLAYABLE-12'-or$profile.passed-ne$true-or$profile.runtimePolicy-cne'functional-compatibility'-or$profile.buildReceiptSha256-cne$ReviewedBuildReceiptSha256-or$profile.pluginSha256-cne$ReviewedBridgeSha256-or$profile.pluginBytes-ne$bridgeReceipt.pluginBytes-or$profile.liveHandoffReady-ne$false-or$profile.gameLaunched-ne$false-or$profile.endpointOpened-ne$false){throw 'Expected exact-artifact passing offline-only functional profile receipt.'}
$pipelineSha='48d362c7b89366bdec17f66323028b93089f395834d03fbf51311116d0211a6b'
if((Hash $pipelinePath)-cne$pipelineSha){throw 'Wrong preserved32-case native pipeline receipt.'}
$pipeline=Get-Content -LiteralPath $pipelinePath -Raw|ConvertFrom-Json
if($pipeline.profile-cne'PLAYABLE-09'-or$pipeline.passed-ne32-or$pipeline.fullMatrix-ne$true-or@($pipeline.cases).Count-ne32-or$pipeline.candidateSha256-cne$nativeSha-or$pipeline.actualShvExecuted-ne$false-or$pipeline.actualRphWitnessExecuted-ne$false-or$pipeline.gameStarted-ne$false-or$pipeline.endpointOpened-ne$false-or$pipeline.audioPlayback-ne$false-or$pipeline.providerQualified-ne$false-or$pipeline.liveHandoffReady-ne$false-or@($pipeline.cases|Where-Object{$_.passed-ne$true}).Count){throw 'Expected preserved complete offline-only native matrix.'}
# This preserved receipt predates authorized managed changes. Its original tested
# source bytes are checked against preserved originals when current bytes differ.
foreach($pin in $pipeline.sources){
 $relative=$pin.name-creplace'^repo/','';$path=[IO.Path]::GetFullPath((Join-Path $repo $relative));Unlinked $path
 if(!$path.StartsWith($sourceRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Pipeline source escapes repository.'}
 if((Hash $path)-cne$pin.sha256){$path=Join-Path $repo ('.local/playable-12/preserved-source/'+$relative);Unlinked $path;if((Hash $path)-cne$pin.sha256){throw 'Historical pipeline source bytes are not preserved.'}}
}
$templatePath=Join-Path $bridge 'session-lease-template.json';Unlinked $templatePath
$template=Get-Content -LiteralPath $templatePath -Raw|ConvertFrom-Json
if(@($template.PSObject.Properties).Count-ne21-or$template.profile-cne'PLAYABLE-12'-or$template.runtimePolicy-cne'functional-compatibility'-or$template.callerAssemblySha256-cne$ReviewedBridgeSha256-or$template.audioPlaybackAllowed-ne$false-or$template.passiveOnly-ne$true){throw 'Expected exact21-field functional lease template.'}
CheckPins (@($preserved)+@($baseline.protected)+@($baseline.settings))
[IO.Directory]::CreateDirectory($out)|Out-Null
function CopyNew([string]$Source,[string]$Destination,[string]$ExpectedSha,[long]$ExpectedLength){
 $inputStream=[IO.File]::Open($Source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try{
  if($inputStream.Length-ne$ExpectedLength){throw 'Pinned source length mismatch.'}
  $sha=[Security.Cryptography.SHA256]::Create();try{$actual=[BitConverter]::ToString($sha.ComputeHash($inputStream)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  if($actual-cne$ExpectedSha){throw 'Pinned source hash mismatch.'}
  $inputStream.Position=0;$dest=[IO.File]::Open($Destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$inputStream.CopyTo($dest);$dest.Flush($true)}finally{$dest.Dispose()}
 }finally{$inputStream.Dispose()}
 if((Hash $Destination)-cne$ExpectedSha-or(Get-Item -LiteralPath $Destination).Length-ne$ExpectedLength){throw 'Staged candidate differs.'}
}
$stagedNative=Join-Path $out 'RichAudio.OperatingState.ShvHandoff.asi';CopyNew $nativeArtifact $stagedNative $nativeSha 129024
$stagedBridge=Join-Path $out 'RichAudio.dll';CopyNew $bridgeArtifact $stagedBridge $ReviewedBridgeSha256 $bridgeReceipt.pluginBytes
$original=@($baseline.protected|Where-Object name -ceq 'Plugins/RichAudio.dll');if($original.Count-ne1){throw 'Missing original plugin restoration pin.'}
$payload=@(
 [ordered]@{source=$stagedNative;destination=(Join-Path $game 'RichAudio.OperatingState.ShvHandoff.asi');pendingPath=(Join-Path $game 'RichAudio.OperatingState.ShvHandoff.asi.playable12.pending');sha256=$nativeSha;bytes=129024;operation='create-only';owner='PLAYABLE-12 passive SHV producer'},
 [ordered]@{source=$stagedBridge;destination=(Join-Path $game 'Plugins/RichAudio.dll');pendingPath=(Join-Path $game 'Plugins/RichAudio.dll.playable12.pending');backupPath=(Join-Path $game 'Plugins/RichAudio.dll.playable12.original');sha256=$ReviewedBridgeSha256;bytes=$bridgeReceipt.pluginBytes;originalSha256=$original[0].sha256;originalBytes=$original[0].bytes;operation='temporary exact-owned replacement with original backup';owner='PLAYABLE-12 functional passive RPH bridge'}
)
$protected=@($baseline.protected|ForEach-Object{[ordered]@{relativePath=$_.name;path=$_.path;sha256=$_.sha256;bytes=$_.bytes}})
$install=[ordered]@{schema=1;profile='PLAYABLE-12';runtimePolicy='functional-compatibility';executed=$false;requiresSeparateExplicitDeploymentAndLaunchApproval=$true;payload=$payload
 lease=[ordered]@{destination=(Join-Path $game 'Plugins/RichAudio.ShvHandoff.json');pendingPath=(Join-Path $game 'Plugins/RichAudio.ShvHandoff.json.playable12.pending');maximumBytes=8192;creation='Only after separate launch approval and actual game process: fresh session, exact PID+kernel creation time, exact21-field compiled policy; hash/length/ownership receipt before atomic creation';sourceTemplate=$templatePath;templateSha256=(Hash $templatePath)}
 protectedInstallation=$protected;reviewedShortcutBaselines=$baseline.settings;settingsPath=$settingsPin[0].path;stockFallbackSelected=$true;productionFeatureFlagsDisabled=$true;runtimeDistributionAuthenticated=$false;launcherPinsPurpose='Reviewed test environment reproducibility and rollback only; not API authenticity or an API/launcher equality contract.'
 preconditions=@('Separate fresh approval for exact ASI+managed artifact hashes, one deployment and one RPH-route launch','Recheck protected/settings/artifact/source hashes, disabled flags and absent game/RPH/audio processes','All owned pending/new/backup paths absent and unlinked; no diagnostic ASI or timeout override','Pin candidate inputs against writes while copying')
 operations=@('Create pending files with CreateNew/FileShare.None; flush and verify exact hash+length; retain ownership receipt','Verify original plugin, move to absent same-volume backup, then pending candidate to plugin path; retain original bytes','Move new ASI pending into absent destination and verify both artifacts','Launch once through existing reviewed route, without editing framework/startup/settings','Create process-bound lease only after observed actual PID+kernel creation time; record exact digest+length and atomic creation','On failure stop without retry; rollback only verified owned changes')
 forbiddenChanges=@('Game/RPH/SHV/loader/DirectStorage binaries','startup.rphs and launch shortcuts','Playable/menu sidecars or saved settings','Audio sources, renderer, gains, loudness/recording activation')}
$rollback=[ordered]@{schema=1;profile='PLAYABLE-12';executed=$false;requiresGameAndRphProcessExit=$true;noHotUnload=$true;ownershipReceiptRequired=$true;recursiveDeletionAllowed=$false;capturesRemoved=$false
 producer=[ordered]@{paths=@($payload[0].destination,$payload[0].pendingPath);sha256=$nativeSha;bytes=129024}
 bridge=[ordered]@{path=$payload[1].destination;pendingPath=$payload[1].pendingPath;candidateSha256=$ReviewedBridgeSha256;candidateBytes=$bridgeReceipt.pluginBytes;backupPath=$payload[1].backupPath;originalSha256=$original[0].sha256;originalBytes=$original[0].bytes}
 lease=[ordered]@{paths=@($install.lease.destination,$install.lease.pendingPath);sha256='Exact digest in future generated lease creation receipt; no wildcard';maximumBytes=8192}
 operations=@('Confirm normal game exit and all owned process lifetimes ended; no hot unload/relaunch','Remove producer/pending only when ownership receipt and exact hash+length prove ownership','Remove lease/pending only using exact session creation receipt and digest+length','Remove candidate plugin/pending only with exact owned candidate hash+length; refuse changed files','Verify original backup hash+length, move to absent original path without overwrite, reverify','If exact original already exists, leave it; do not delete changed backups or unknown files','Verify all11 protected files and four settings, stock fallback, disabled flags; retain captures/logs; no recursive deletion')}
$preflight=[ordered]@{schema=1;profile='PLAYABLE-12';runtimePolicy='functional-compatibility';result='PASS';baselineSha256=(Hash $baselinePath);protectedFiles=$protected;protectedCount=11;settingsCount=4;preservedPrivateAnd11AndImmutableTrackedPins=$preserved.Count;candidatePayload=$payload;reviewedBridgeReceiptSha256=$ReviewedBuildReceiptSha256;profileReceiptSha256=$ReviewedProfileReceiptSha256;pipelineReceiptSha256=$pipelineSha;pipelineCases=32;pipelineEvidence='Preserved PLAYABLE-09 native evidence, not a new PLAYABLE-12 execution';compiledBridgeSourcePinsVerified=@($bridgeReceipt.sources).Count;compiledNativeSourcePinsVerified=4;stockFallbackSelected=$true;productionFlagsDisabled=$true;ownedPathsAbsent=$true;ownedProcessesAbsent=$true;runtimeDistributionAuthenticated=$false;liveHandoffReady=$false;gameFilesWritten=$false;gameLaunched=$false;endpointOpened=$false;audioPlayback=$false;approvalGranted=$false;preparerSha256=(Hash $PSCommandPath)}
foreach($item in @(@('installation-manifest.json',$install),@('rollback-manifest.json',$rollback),@('preflight.json',$preflight))){$item[1]|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $out $item[0]) -Encoding utf8}
Write-Output ('PASS prepared exact functional passive proposal only: '+$out)
