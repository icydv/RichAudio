#requires -Version 7.0
[CmdletBinding()]
param(
 [string]$BuildReceipt='',
 [Parameter(Mandatory=$true)][string]$FixtureReceipt,
 [string]$GameRoot='D:\Games\steamapps\common\Grand Theft Auto V Enhanced',
 [string]$OutputRoot='',
 [string]$SettingsPath='',
 [string]$ShortcutBaselinePath=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Inspect-ShvProbe.ps1')
if(!$BuildReceipt){$BuildReceipt=Join-Path $repo 'build/playable-06-shv-probe/build-receipt.json'}
if(!$OutputRoot){$OutputRoot=Join-Path $repo '.local/playable-06/candidate'}
$output=Assert-ShvBuildOutputPath $OutputRoot $repo $GameRoot
if(Test-Path -LiteralPath $output){throw 'Manifest output must be new; nothing is overwritten.'}
$build=Get-Content -LiteralPath $BuildReceipt -Raw | ConvertFrom-Json
$fixture=Get-Content -LiteralPath $FixtureReceipt -Raw | ConvertFrom-Json
function Get-Digest([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
$candidate=(Get-Item -LiteralPath $build.Candidate.Path).FullName
$hash=Get-Digest $candidate
if($hash -ne $build.Candidate.Sha256 -or $hash -ne $fixture.candidateSha256){throw 'Build, fixture and actual ASI hashes must agree.'}
if($fixture.checks -lt 1 -or @($fixture.cases).Count -lt 1 -or $fixture.passed -ne @($fixture.cases).Count -or
 $fixture.actualShvExecuted -ne $false -or $fixture.gameStarted -ne $false -or $fixture.endpointOpened -ne $false){throw 'A successful device-free-only fixture receipt is required.'}
if($fixture.profile -ne 'PLAYABLE-06' -or $fixture.operatorArmingValidated -ne $true -or
 $fixture.stableIdleGateValidated -ne $true -or $fixture.stableIdleMs -ne 2000){throw 'Operator-armed stable-idle binary fixture evidence is required.'}
foreach($inputFile in $build.SourceInputs){
 if(!$inputFile.Name.StartsWith('repo/')){throw 'Unexpected source receipt path.'}
 $source=Join-Path $repo $inputFile.Name.Substring(5)
 if((Get-Digest $source) -ne $inputFile.Sha256){throw 'Probe source changed after compilation.'}
}
$null=Assert-ShvProductImage (Get-ShvPeImage $candidate)
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
if(!$ShortcutBaselinePath){$ShortcutBaselinePath=Join-Path $repo '.local/playable-06/shortcut-baseline.json'}
$shortcuts=@(Get-Content -LiteralPath $ShortcutBaselinePath -Raw|ConvertFrom-Json)
if($shortcuts.Count -ne 4){throw 'The reviewed RPH/trainer/game/RichAudio shortcut baseline is required.'}
foreach($binding in $shortcuts){if((Get-Digest $binding.path) -ne $binding.sha256){throw 'Reviewed shortcut settings changed.'}}
foreach($scope in @('Process','User','Machine')){
 if(![string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('RICHAUDIO_SHV_PROBE_TIMEOUT_MS',$scope))){throw 'Live proposal requires the deadline-shortening override absent in launcher Process/User/Machine environments.'}
}
$destination=Join-Path $game 'RichAudio.OperatingState.Shv.asi'
$pending=$destination+'.playable06.pending'
if((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $pending)){throw 'Proposed probe destination or pending path already exists.'}
$processes=@(Get-Process -Name GTA5,GTA5_Enhanced,RAGEPluginHook,RichAudioHost,RichAudioHostGpu,'RichAudio.Acoustics.Host','RichAudio.AcousticGpu' -ErrorAction SilentlyContinue)
if($processes.Count){throw 'Game, RPH and RichAudio hosts must be stopped while preparing the installation baseline.'}
$payload=[ordered]@{source=$candidate;destination=$destination;pendingPath=$pending;sha256=$hash;bytes=(Get-Item -LiteralPath $candidate).Length;owner='PLAYABLE-06 operator-armed SHV diagnostic';overwriteAllowed=$false}
$install=[ordered]@{
 schema=1;purpose='Proposal only: operator-armed stable-idle one-call qualification';executed=$false;requiresSeparateDeploymentAndLaunchApproval=$true
 payload=@($payload);protectedInstallation=$protected;settingsPath=$SettingsPath;settingsSha256=$settingsHash;integrationMode='stock-fallback';reviewedShortcutBaselines=$shortcuts
 preconditions=@('Specific authorisation for this exact candidate and one launch','Game/RPH/RichAudio hosts stopped','Recheck every protected hash, settings hash and reviewed shortcut hash','Deadline-shortening environment override absent in launcher Process/User/Machine environments','Destination and pending path both absent','No framework/runtime/asset/settings replacement')
 operations=@('Open pendingPath with FileMode.CreateNew and FileShare.None; copy only source bytes; flush to disk and close','Verify pendingPath SHA256 and length equal payload receipt; if mismatch stop','Move pendingPath to destination atomically on the same volume, without overwrite','Verify destination SHA256 and record an installation receipt before any launch')
 forbiddenChanges=@('ScriptHookV.dll','dinput8.dll','RAGEPluginHook.exe','startup.rphs','DirectStorage files','RichAudio DLL/package/settings','source recordings','original game assets')
}
$rollback=[ordered]@{
 schema=1;executed=$false;requiresGameProcessExit=$true;ownershipReceiptRequired=$true
 allowedFiles=@([ordered]@{path=$destination;sha256=$hash},[ordered]@{path=$pending;sha256=$hash})
 operations=@('Confirm the game/RPH/hosts exited; no hot unload: module is process-pinned','For each allowed path, remove only when the installation/creation receipt establishes ownership and its SHA256 matches exactly','Refuse deletion on mismatch or unknown ownership; never overwrite or delete another file','Recheck protected installation and settings hashes; preserve all captures')
 recursiveDeletionAllowed=$false;capturesRemoved=$false;systemBuildToolsRemoved=$false
}
$test=[ordered]@{
 schema=1;executed=$false;candidateSha256=$hash;maximumTargetCalls=1;automaticRetry=$false
 sessionDeadlineMs=300000;deadlineStarts='First registered ScriptMain callback, including loading/operator wait';waitingPollIntervalMs=250;writerGraceMs=500
 operatorAction='Release Ctrl/Shift/Backslash, then press and release Ctrl+Shift+Backslash when HUD says ready';terminalKeyVariants=@('VK_OEM_5','VK_OEM_102');inputMustBeFresh=$true;foregroundMustBeOwnProcess=$true
 stableIdleGate=[ordered]@{requiredMilliseconds=2000;sampleIntervalMs=100;maximumSampleGapMs=250;postArmDeadlineMs=3000;maximumSamples=25;requireEngineRunningTrueEverySample=$true;minimumSpeedMetresPerSecond=0.0;maximumSpeedMetresPerSecond=0.10;speedIsRpmProxy=$false;humanOverrideAllowed=$false;contextFailureCallsTarget=$false;finalImmediateRevalidation=$true;maximumFinalContextAgeMs=250}
 terminalHudMaximumMs=5000;terminalHudMayContinueAfterAcquisitionDeadline=$true;postTargetNatives='Only bounded diagnostic HUD, no vehicle/context/target queries; none after detectable invocation SEH'
 maximumCaptureBytes=16383;captureFiles=@('journal.ndjson','capture.json');captureRoot='%LOCALAPPDATA%\RichAudio\ShvProbe\<PID>-<process-creation-FILETIME>'
 intendedContext='Offline Story Mode, local player driving Bati; stationary idle; explicit operator arm followed by >=2 seconds of true engine-running and stable same-identity stationary context'
 watchdogCanPreemptNative=$false;nativeFaultContainmentGuaranteed=$false;filesystemDeadlineGuaranteed=$false
 measuredRPM=$false;providerValid=$false
 successBoundary='A nonzero plausible observation after verified idle gates is candidate evidence only. Review before proposing a separately authorised multi-state test; never declare qualified RPM or audible RichAudio.'
 stopOn=@('Any failed running/stationary/identity/offline/focus gate after arm: context failure, zero target calls','Missing operator input, stale/held/repeat input, timeout or journal failure','Any null, SEH, nonfinite, out-of-range or unobserved target outcome','Zero despite stable running evidence: inconclusive; seek framework clarification rather than invent a correction','No automatic retry or second launch')
}
[IO.Directory]::CreateDirectory($output)|Out-Null
foreach($item in @(@('installation-manifest.json',$install),@('rollback-manifest.json',$rollback),@('one-call-proposal.json',$test))){
 $item[1]|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $output $item[0]) -Encoding utf8
}
$receipt=[ordered]@{schema=1;candidateSha256=$hash;buildReceiptSha256=(Get-Digest $BuildReceipt);fixtureReceiptSha256=(Get-Digest $FixtureReceipt);protectedFiles=$protected.Count;protectedHashesMatch=$true;settingsSha256=$settingsHash;reviewedShortcutFilesMatch=$true;timeoutOverridesAbsent=$true;stockFallback=$true;gameProcesses=0;probeDestinationAbsent=$true;gameFilesWritten=$false;deployed=$false;launched=$false;manifests=@(Get-ChildItem -LiteralPath $output -File|ForEach-Object{[ordered]@{name=$_.Name;sha256=(Get-Digest $_.FullName)}})}
$receipt|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $output 'preparation-receipt.json') -Encoding utf8
Write-Output ('PASS proposal manifests only; '+$protected.Count+' protected hashes and stock fallback unchanged. Candidate '+$hash)
