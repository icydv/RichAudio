#requires -Version 7.0
[CmdletBinding()]
param(
 [ValidateSet('PLAYABLE-07','PLAYABLE-08')][string]$ProposalProfile='PLAYABLE-08',
 [string]$BuildReceipt='',
 [Parameter(Mandatory=$true)][string]$FixtureReceipt,
 [Parameter(Mandatory=$true)][string]$AnalysisReceipt,
 [string]$GameRoot='D:\Games\steamapps\common\Grand Theft Auto V Enhanced',
 [string]$OutputRoot='',
 [string]$SettingsPath='',
 [string]$ShortcutBaselinePath=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Inspect-ShvProbe.ps1')
if(!$BuildReceipt){$BuildReceipt=Join-Path $repo 'build/playable-07-shv-probe/build-receipt.json'}
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/'+$ProposalProfile.ToLowerInvariant()+'/candidate')}
$output=Assert-ShvBuildOutputPath $OutputRoot $repo $GameRoot
foreach($name in @('build/playable-04-shv-probe','build/playable-06-shv-probe','build/playable-07-shv-probe','.local/playable-04','.local/playable-05','.local/playable-06','.local/playable-07')){
 $oldRoot=[IO.Path]::GetFullPath((Join-Path $repo $name)).TrimEnd('\','/')
 if($output.Equals($oldRoot,[StringComparison]::OrdinalIgnoreCase) -or $output.StartsWith($oldRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Earlier artifacts and evidence are preserved; choose a new proposal output directory.'}
}
if(Test-Path -LiteralPath $output){throw 'Manifest output must be new; nothing is overwritten.'}
$build=Get-Content -LiteralPath $BuildReceipt -Raw | ConvertFrom-Json
$fixture=Get-Content -LiteralPath $FixtureReceipt -Raw | ConvertFrom-Json
if($build.Profile -ne 'playable-07'){throw 'The PLAYABLE-07 build receipt is required.'}
function Get-Digest([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
$candidate=(Get-Item -LiteralPath $build.Candidate.Path).FullName
$hash=Get-Digest $candidate
if($hash -ne $build.Candidate.Sha256 -or $hash -ne $fixture.candidateSha256){throw 'Build, fixture and actual ASI hashes must agree.'}
if($hash -ne '21302b4c5c5fb99f63b7b25dce2fa973117bfb0246f16745d0782f062fe1a69e' -or (Get-Item -LiteralPath $candidate).Length -ne 378880){throw 'Only the unchanged, validated PLAYABLE-07 candidate may be reused by this proposal.'}
if($fixture.checks -lt 1 -or @($fixture.cases).Count -lt 1 -or $fixture.passed -ne @($fixture.cases).Count -or
 $fixture.actualShvExecuted -ne $false -or $fixture.gameStarted -ne $false -or $fixture.endpointOpened -ne $false){throw 'A successful device-free-only fixture receipt is required.'}
if($fixture.profile -ne 'PLAYABLE-07' -or $fixture.fullMatrix -ne $true -or
 $fixture.boundedMultiStateValidated -ne $true -or $fixture.phaseMarkersValidated -ne $true -or
 $fixture.fullDurationFixtureValidated -ne $true -or $fixture.maximumCaptureSeconds -ne 120 -or
 $fixture.maximumObservations -ne 2400 -or $fixture.maximumHz -ne 20){throw 'Full bounded multi-state binary fixture evidence is required.'}
$analysis=Get-Content -LiteralPath $AnalysisReceipt -Raw|ConvertFrom-Json
if($analysis.profile -ne 'PLAYABLE-07' -or $analysis.candidateSha256 -ne $hash -or $analysis.fixtureReceiptSha256 -ne (Get-Digest $FixtureReceipt) -or
 $analysis.analysisSourceSha256 -ne (Get-Digest (Join-Path $PSScriptRoot 'Analyze-ShvTelemetry.mjs')) -or
 $analysis.currentTestSourceSha256 -ne (Get-Digest (Join-Path $repo 'tests/Test-ShvTelemetryAnalysis.mjs')) -or
 $analysis.passed -lt 1 -or $analysis.failed -ne 0 -or $analysis.negativeControlsValidated -ne $true -or
 $analysis.actualShvExecuted -ne $false -or $analysis.gameStarted -ne $false -or $analysis.endpointOpened -ne $false -or
 $analysis.providerQualified -ne $false){throw 'Matching independently tested timeline analysis and negative controls are required.'}
foreach($inputFile in $build.SourceInputs){
 if(!$inputFile.Name.StartsWith('repo/')){throw 'Unexpected source receipt path.'}
 $source=Join-Path $repo $inputFile.Name.Substring(5)
 if((Get-Digest $source) -ne $inputFile.Sha256){throw 'Probe source changed after compilation.'}
}
$null=Assert-ShvProductImage (Get-ShvPeImage $candidate) -Profile playable-07
$priorPins=@(foreach($pin in $build.PreservedPriorFiles){
 $path=Join-Path $repo $pin.Name
 if((Get-Digest $path) -ne $pin.Sha256 -or (Get-Item -LiteralPath $path).Length -ne $pin.Bytes){throw 'A preserved prior artifact or evidence pin changed.'}
 [ordered]@{name=$pin.Name;bytes=$pin.Bytes;sha256=$pin.Sha256}
})
if($priorPins.Count -ne 37){throw 'The 37 preserved prior pins are required.'}
$game=(Get-Item -LiteralPath $GameRoot).FullName.TrimEnd('\')
$baseline=Get-Content -LiteralPath (Join-Path $repo '.local/playable-02/authorised-measurement-01/baseline.json') -Raw|ConvertFrom-Json
$protected=@(foreach($entry in $baseline){
 $path=Join-Path $game $entry.file
 if((Get-Digest $path) -ne $entry.sha256){throw ('Protected installation file differs: '+$entry.file)}
 [ordered]@{relativePath=$entry.file;sha256=$entry.sha256}
})
if(!$SettingsPath){
 $old=Get-Content -LiteralPath (Join-Path $repo '.local/playable-02/authorised-measurement-01/installation.json') -Raw|ConvertFrom-Json
 $SettingsPath=$old.settingsPath
 if((Get-Digest $SettingsPath) -ne $old.settingsSha256){throw 'Saved settings differ from the protected baseline.'}
}
$settings=Get-Content -LiteralPath $SettingsPath -Raw|ConvertFrom-Json
if($settings.integrationMode -ne 'stock-fallback'){throw 'Current saved integration mode must be stock-fallback.'}
$settingsHash=Get-Digest $SettingsPath
if(!$ShortcutBaselinePath){$ShortcutBaselinePath=Join-Path $repo ('.local/'+$ProposalProfile.ToLowerInvariant()+'/shortcut-baseline.json')}
$shortcuts=@(Get-Content -LiteralPath $ShortcutBaselinePath -Raw|ConvertFrom-Json)
if($shortcuts.Count -ne 4){throw 'The reviewed RPH/trainer/game/RichAudio shortcut baseline is required.'}
foreach($binding in $shortcuts){if((Get-Digest $binding.path) -ne $binding.sha256){throw 'Reviewed shortcut settings changed.'}}
foreach($scope in @('Process','User','Machine')){
 if(![string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('RICHAUDIO_SHV_PROBE_TIMEOUT_MS',$scope))){throw 'Live proposal requires the deadline-shortening override absent in launcher Process/User/Machine environments.'}
}
$destination=Join-Path $game 'RichAudio.OperatingState.Shv.asi'
$pending=$destination+'.'+$ProposalProfile.ToLowerInvariant().Replace('-','')+'.pending'
if((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $pending)){throw 'Proposed probe destination or pending path already exists.'}
$processes=@(Get-Process -Name GTA5,GTA5_Enhanced,RAGEPluginHook,RichAudioHost,RichAudioHostGpu,'RichAudio.Acoustics.Host','RichAudio.AcousticGpu' -ErrorAction SilentlyContinue)
if($processes.Count){throw 'Game, RPH and RichAudio hosts must be stopped while preparing the installation baseline.'}
$payload=[ordered]@{source=$candidate;destination=$destination;pendingPath=$pending;sha256=$hash;bytes=(Get-Item -LiteralPath $candidate).Length;owner=($ProposalProfile+' reuse of unchanged PLAYABLE-07 SHV diagnostic');overwriteAllowed=$false}
$install=[ordered]@{
 schema=1;profile=$ProposalProfile;reusedBuildProfile=$build.Profile;purpose='Proposal only: operator-armed bounded multi-state qualification using the unchanged PLAYABLE-07 artifact';executed=$false;requiresSeparateDeploymentAndLaunchApproval=$true
 payload=@($payload);protectedInstallation=$protected;settingsPath=$SettingsPath;settingsSha256=$settingsHash;integrationMode='stock-fallback';reviewedShortcutBaselines=$shortcuts
 preconditions=@('Specific authorisation for this exact candidate and one launch','Game/RPH/RichAudio hosts stopped','Recheck every protected hash, settings hash and reviewed shortcut hash','Deadline-shortening environment override absent in launcher Process/User/Machine environments','Destination and pending path both absent','No framework/runtime/asset/settings replacement')
 operations=@('Open pendingPath with FileMode.CreateNew and FileShare.None; copy only source bytes; flush to disk and close','Verify pendingPath SHA256 and length equal payload receipt; if mismatch stop','Move pendingPath to destination atomically on the same volume, without overwrite','Verify destination SHA256 and record an installation receipt before any launch')
 forbiddenChanges=@('ScriptHookV.dll','dinput8.dll','RAGEPluginHook.exe','startup.rphs','DirectStorage files','RichAudio DLL/package/settings','source recordings','original game assets')
}
$rollback=[ordered]@{
 schema=1;profile=$ProposalProfile;reusedBuildProfile=$build.Profile;executed=$false;requiresGameProcessExit=$true;ownershipReceiptRequired=$true
 allowedFiles=@([ordered]@{path=$destination;sha256=$hash},[ordered]@{path=$pending;sha256=$hash})
 operations=@('Confirm the game/RPH/hosts exited; no hot unload: module is process-pinned','For each allowed path, remove only when the installation/creation receipt establishes ownership and its SHA256 matches exactly','Refuse deletion on mismatch or unknown ownership; never overwrite or delete another file','Recheck protected installation and settings hashes; preserve all captures')
 recursiveDeletionAllowed=$false;capturesRemoved=$false;systemBuildToolsRemoved=$false
}
$test=[ordered]@{
 schema=1;profile=$ProposalProfile;reusedBuildProfile=$build.Profile;executed=$false;candidateSha256=$hash;maximumTargetCalls=2400;automaticRetry=$false
 waitingDeadlineMs=300000;waitingDeadlineStarts='First registered ScriptMain callback, including operator wait and durable arm acknowledgement';activeCaptureDeadlineMs=120000;activeDeadlineStarts='CaptureTimeline start after durable arm acknowledgement, recorded activeStartQpc';maximumAcquisitionHz=20;minimumAfterToBeforeIntervalMs=50;catchUpBurstsAllowed=$false;maximumAcquisitionGapMs=250;writerGraceMs=500
 startAction='Release chord keys, then press Ctrl+Shift+Backslash once when HUD says ready';advanceAction='During capture, plain Backslash advances requested phase';stopAction='Ctrl+Shift+Backslash stops early; Backslash at return-idle ends capture';terminalKeyVariants=@('VK_OEM_5','VK_OEM_102');inputMustBeFresh=$true;foregroundMustBeOwnProcess=$true
 firstAdvanceConfirmation=[ordered]@{requiredBeforeManualDriving=$true;operatorInstruction='Stay stationary. Release chord keys, then tap plain Backslash. Keep idling until the HUD says IDLE and the supervisor confirms the recorded ADVANCE.';expectedTransition='START OFF(0) -> ADVANCE IDLE(1)';readOnlyObserver='tools/Observe-ShvFirstAdvance.mjs';observerMustUseNewCurrentLaunchSession=$true;requiredObservedContext='A subsequent valid same-Bati identity bracket, both running queries true, both independent speeds within 0..0.10 m/s';motionBeforeConfirmationIsProtocolFailure=$true;probeProvidesDrivingInterlock=$false;observerProvidesDrivingInterlock=$false;noFirstAdvanceRetryOrSecondLaunch=$true}
 requestedPhases=@('engine-off','idle','stationary-rev','acceleration','gear-transitions','deceleration','return-idle');phaseMarkersAreAchievementProof=$false;unavailablePhasesMarkedUnobserved=$true
 contextValidation='Same valid living player/ped/Bati/driver, offline/unpaused/foreground, finite nonnegative speed before and after each target. Engine-running may change; no running-true startup prerequisite.'
 independentVehicleGearAvailable=$false;independentVehicleThrottleAvailable=$false;keyboardIntentIsVehicleThrottle=$false;speedUsedAsRpm=$false
 terminalHudMaximumMs=5000;terminalHudMayContinueAfterAcquisitionDeadline=$true;postTerminalNatives='Only bounded diagnostic HUD; none after detectable invocation SEH'
 maximumCaptureBytes=12582912;maximumTimelineRowBytes=2047;maximumTimelineRows=7209;recordRingCapacity=128;captureFiles=@('journal.ndjson','timeline.ndjson','capture.json');captureRoot='%LOCALAPPDATA%\RichAudio\ShvProbe\<PID>-<process-creation-FILETIME>'
 intendedContext='One player-driven Bati in offline Story Mode, operator uses ordinary controls only; no spawn, driving, physics or sound changes by probe'
 watchdogCanPreemptNative=$false;nativeFaultContainmentGuaranteed=$false;filesystemDeadlineGuaranteed=$false
 measuredRPM=$false;providerValid=$false
 successBoundary='Assess real ordered ratio changes, independently observed speed/engine context, stable idle and return-to-idle, missing states and discontinuities. Analyzer verdict is review evidence only; provider qualification requires human review and an accurately limited operating-state contract.'
 stopOn=@('Invalid identity/driver, unsupported offline/game/focus context or stale acquisition','Native null/SEH/nonfinite/outside0..1 review-band outcome; retain raw failure without clamping','Capture deadline, observation cap, queue/operator-event overflow, output or writer failure','Explicit operator stop; no restart or second launch')
 zeroWhileRunning='Retain raw zero with a warning flag; analysis cannot promote unexplained running zeros'
}
[IO.Directory]::CreateDirectory($output)|Out-Null
foreach($item in @(@('installation-manifest.json',$install),@('rollback-manifest.json',$rollback),@('multi-state-proposal.json',$test))){
 $item[1]|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $output $item[0]) -Encoding utf8
}
$receipt=[ordered]@{schema=1;profile=$ProposalProfile;reusedBuildProfile=$build.Profile;unchangedCandidateReused=$true;candidateSha256=$hash;candidateBytes=378880;buildReceiptSha256=(Get-Digest $BuildReceipt);fixtureReceiptSha256=(Get-Digest $FixtureReceipt);analysisReceiptSha256=(Get-Digest $AnalysisReceipt);preservedPriorPinCount=$priorPins.Count;preservedPriorPins=$priorPins;earlierOutputDirectoriesProtected=$true;protectedFiles=$protected.Count;protectedHashesMatch=$true;settingsSha256=$settingsHash;reviewedShortcutFilesMatch=$true;timeoutOverridesAbsent=$true;stockFallback=$true;gameProcesses=0;probeDestinationAbsent=$true;gameFilesWritten=$false;deployed=$false;launched=$false;manifests=@(Get-ChildItem -LiteralPath $output -File|ForEach-Object{[ordered]@{name=$_.Name;sha256=(Get-Digest $_.FullName)}})}
$receipt|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $output 'preparation-receipt.json') -Encoding utf8
Write-Output ('PASS proposal manifests only; '+$protected.Count+' protected hashes and stock fallback unchanged. Candidate '+$hash)
