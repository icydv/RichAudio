[CmdletBinding()]
param([Parameter(Mandatory)][string]$BridgeBuild,[Parameter(Mandatory)][string]$NativeBuild,[string]$Output='',[string]$PipelineValidation='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$baselinePath=Join-Path $repo '.local/playable-09/baseline.json'
$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
if((Get-FileHash -LiteralPath $baselinePath).Hash.ToLowerInvariant()-ne'024d16b24305df1b7e52975f41989e78e5d9b284b0ee8580a515fe8763d72074'){throw 'Initial preservation baseline changed.'}
$prior=Get-Content -LiteralPath (Join-Path $repo '.local/playable-08/candidate-guided/installation-manifest.json') -Raw|ConvertFrom-Json
$game=[IO.Path]::GetDirectoryName($prior.payload[0].destination)
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){
 for($cursor=[IO.Path]::GetFullPath($Path);$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){
  if((Test-Path -LiteralPath $cursor)-and((Get-Item -LiteralPath $cursor -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked candidate/installation paths are forbidden.'}
 }
}
function WithinRepo([string]$Path){
 $full=[IO.Path]::GetFullPath($Path);Unlinked $full
 $allowed=@('build','.local')|ForEach-Object{[IO.Path]::GetFullPath((Join-Path $repo $_)).TrimEnd('\')+'\'}
 if(!@($allowed|Where-Object{$full.StartsWith($_,[StringComparison]::OrdinalIgnoreCase)}).Count){throw 'Candidate inputs/outputs must be inside repository build or .local.'}
 return $full
}
$bridge=WithinRepo $BridgeBuild;$native=WithinRepo $NativeBuild
if(!$Output){$Output=Join-Path $repo '.local/playable-09/candidate'}
$out=WithinRepo $Output
$proposalRoot=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-09')).TrimEnd('\')
if(![IO.Path]::GetDirectoryName($out).Equals($proposalRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($out) -notmatch '^candidate(?:-[a-z0-9-]+)?$'){throw 'Proposal output must be a new direct candidate(-suffix) directory under .local/playable-09; earlier profiles and snapshots are immutable.'}
if(Test-Path -LiteralPath $out){throw 'Candidate directory must be new; no overwrite.'}
$protected=@($baseline.protectedFiles|ForEach-Object{
 $path=Join-Path $game $_.name;Unlinked $path
 if((Hash $path)-ne$_.sha256-or(Get-Item -LiteralPath $path).Length-ne$_.bytes){throw ('Protected installation mismatch: '+$_.name)}
 [ordered]@{relativePath=$_.name;sha256=$_.sha256;bytes=$_.bytes}
})
foreach($pin in $prior.reviewedShortcutBaselines){if((Hash $pin.path)-ne$pin.sha256){throw 'Protected saved settings mismatch.'}}
$preserved=@($baseline.historicalPins)+@($baseline.foundationPins)+@($baseline.diagnosticSources)+@($baseline.acceptedDiagnosticArtifacts)+@($baseline.primaryAnalyzer)
foreach($pin in $preserved){
 $path=Join-Path $repo ($pin.name-creplace'^repo/','')
 # This requested build-profile extension changes the tool. Preserve the
 # reviewed original rather than pretending its current bytes are unchanged.
 if($pin.name-eq'tools/Build-BeaconBridge.ps1'){$path=Join-Path $repo '.local/playable-09/preserved-product-inputs/Build-BeaconBridge.ps1'}
 if((Hash $path)-ne$pin.sha256){throw ('Preserved source/evidence mismatch: '+$pin.name)}
}
$settings=Get-Content -LiteralPath $prior.settingsPath -Raw|ConvertFrom-Json
if($settings.integrationMode-ne'stock-fallback'){throw 'Stock fallback is required.'}
$features=Get-Content -LiteralPath (Join-Path $repo 'config/production-features.json') -Raw|ConvertFrom-Json
if($features.modificationAwareLoudness-ne$false-or$features.synchronizedAudioRecording-ne$false){throw 'Production feature flags must remain false.'}
$processes=@(Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.ProcessName-match'^(GTA5_Enhanced|GTA5|RAGEPluginHook|RichAudio.*)$'})
if($processes.Count){throw 'Game/RPH/RichAudio processes must be absent.'}
foreach($scope in @('Process','User','Machine')){if(![string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('RICHAUDIO_SHV_PROBE_TIMEOUT_MS',$scope))){throw 'Deadline override must be absent in Process/User/Machine scopes.'}}
$absent=@('RichAudio.OperatingState.Shv.asi','RichAudio.OperatingState.ShvHandoff.asi','RichAudio.OperatingState.ShvHandoff.asi.playable09.pending','Plugins/RichAudio.ShvHandoff.json','Plugins/RichAudio.ShvHandoff.json.playable09.pending','Plugins/RichAudio.dll.playable09.pending','Plugins/RichAudio.dll.playable09.original')
foreach($relative in $absent){$path=Join-Path $game $relative;Unlinked $path;if(Test-Path -LiteralPath $path){throw ('Owned proposal path is occupied: '+$relative)}}
$nativeArtifact=Join-Path $native 'RichAudio.OperatingState.ShvHandoff.asi'
$bridgeArtifact=Join-Path $bridge 'RichAudio.Beacon.Rph.dll'
Unlinked $nativeArtifact;Unlinked $bridgeArtifact
# Frozen after the actual final bridge/source/static review. Until that review
# supplies its digest, staging fails closed; an adjacent self-asserted receipt
# cannot qualify an arbitrary DLL as the reviewed passive candidate.
$reviewedBridgeSha256='c97acbcb6af255a0497c28f8349d8be3447f53c6dc5e31a0d567a7ebbc76743d'
$reviewedReceiptSha256='2dc03eb013e1067fb946bbfd13a899f3b6193bf1332eaf4ed33447407dcdfd74'
$reviewedPipelineReceiptSha256='48d362c7b89366bdec17f66323028b93089f395834d03fbf51311116d0211a6b'
if((Hash $bridgeArtifact)-ne$reviewedBridgeSha256){throw 'Bridge bytes are not the independently reviewed final candidate.'}
if((Hash $nativeArtifact)-ne'05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40'-or(Get-Item -LiteralPath $nativeArtifact).Length-ne129024){throw 'Wrong frozen native candidate.'}
$bridgeReceiptPath=Join-Path $bridge 'passive-handoff-build-receipt.json'
if((Hash $bridgeReceiptPath)-ne$reviewedReceiptSha256){throw 'Bridge receipt is not the independently reviewed final receipt.'}
$bridgeReceipt=Get-Content -LiteralPath $bridgeReceiptPath -Raw|ConvertFrom-Json
if($bridgeReceipt.passiveOnly-ne$true-or$bridgeReceipt.audioPlaybackAllowed-ne$false-or$bridgeReceipt.pluginSha256-ne(Hash $bridgeArtifact)){throw 'Passive bridge build receipt mismatch.'}
if(@($bridgeReceipt.sources).Count-ne44){throw 'Expected the exact44 compiled source/policy pins.'}
foreach($pin in $bridgeReceipt.sources){
 $path=[IO.Path]::GetFullPath($pin.path);Unlinked $path
 if(!$path.StartsWith($repo.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Hash $path)-ne$pin.sha256){throw 'A final compiled source/policy pin differs.'}
}
$nativeReceiptPath=Join-Path $native 'build-receipt.json'
if((Hash $nativeReceiptPath)-ne'f9d28cf4040bc4aa449a3620cfc942a6ed9006e7110e2fc3d9d8876788dc5dda'){throw 'Wrong final native build receipt.'}
$nativeReceipt=Get-Content -LiteralPath $nativeReceiptPath -Raw|ConvertFrom-Json
if(@($nativeReceipt.SourceInputs).Count-ne4){throw 'Expected four frozen native source inputs.'}
foreach($pin in $nativeReceipt.SourceInputs){$path=Join-Path $repo ($pin.Name-creplace'^repo/','');Unlinked $path;if((Hash $path)-ne$pin.Sha256){throw 'Frozen native source changed.'}}
if(!$PipelineValidation){throw 'Supply the reviewed full32-case actual-component pipeline receipt.'}
$pipelinePath=WithinRepo $PipelineValidation
if((Hash $pipelinePath)-ne$reviewedPipelineReceiptSha256){throw 'Pipeline receipt is not the independently reviewed final full-matrix receipt.'}
$pipeline=Get-Content -LiteralPath $pipelinePath -Raw|ConvertFrom-Json
if($pipeline.profile -ne 'PLAYABLE-09' -or $pipeline.passed -ne 32 -or $pipeline.fullMatrix -ne $true -or @($pipeline.cases).Count -ne 32 -or
 $pipeline.candidateSha256 -ne '05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40' -or
 $pipeline.buildReceiptSha256 -ne (Hash $nativeReceiptPath) -or $pipeline.actualShvExecuted -ne $false -or $pipeline.actualRphWitnessExecuted -ne $false -or
 $pipeline.gameStarted -ne $false -or $pipeline.endpointOpened -ne $false -or $pipeline.audioPlayback -ne $false -or $pipeline.providerQualified -ne $false -or
 $pipeline.liveHandoffReady -ne $false -or @($pipeline.cases|Where-Object{$_.passed -ne $true}).Count){throw 'Expected the complete offline-only actual-component matrix.'}
foreach($pin in $pipeline.sources){$path=[IO.Path]::GetFullPath((Join-Path $repo $pin.name));Unlinked $path;if(!$path.StartsWith($repo.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Hash $path)-ne$pin.sha256){throw 'A pipeline-tested source pin differs.'}}
[IO.Directory]::CreateDirectory($out)|Out-Null
function CopyNew([string]$Source,[string]$Destination,[string]$ExpectedSha,[long]$ExpectedLength){
 $sourceStream=[IO.File]::Open($Source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try{
  if($sourceStream.Length-ne$ExpectedLength){throw 'Pinned candidate source length mismatch.'}
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$actual=[BitConverter]::ToString($sha.ComputeHash($sourceStream)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  if($actual-ne$ExpectedSha){throw 'Pinned candidate source hash mismatch.'}
  $sourceStream.Position=0
  $outputStream=[IO.File]::Open($Destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$sourceStream.CopyTo($outputStream);$outputStream.Flush($true)}finally{$outputStream.Dispose()}
 }finally{$sourceStream.Dispose()}
 if((Hash $Destination)-ne$ExpectedSha-or(Get-Item -LiteralPath $Destination).Length-ne$ExpectedLength){throw 'Staged candidate differs from the reviewed hash or length.'}
}
$stagedNative=Join-Path $out 'RichAudio.OperatingState.ShvHandoff.asi';CopyNew $nativeArtifact $stagedNative '05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40' 129024
$stagedBridge=Join-Path $out 'RichAudio.dll';CopyNew $bridgeArtifact $stagedBridge $reviewedBridgeSha256 $bridgeReceipt.pluginBytes
$original=$baseline.protectedFiles|Where-Object name -eq 'Plugins/RichAudio.dll'
$payload=@(
 [ordered]@{source=$stagedNative;destination=(Join-Path $game 'RichAudio.OperatingState.ShvHandoff.asi');pendingPath=(Join-Path $game 'RichAudio.OperatingState.ShvHandoff.asi.playable09.pending');sha256=(Hash $stagedNative);bytes=(Get-Item $stagedNative).Length;operation='create-only';owner='PLAYABLE-09 reviewed passive SHV producer'},
 [ordered]@{source=$stagedBridge;destination=(Join-Path $game 'Plugins/RichAudio.dll');pendingPath=(Join-Path $game 'Plugins/RichAudio.dll.playable09.pending');backupPath=(Join-Path $game 'Plugins/RichAudio.dll.playable09.original');sha256=(Hash $stagedBridge);bytes=(Get-Item $stagedBridge).Length;originalSha256=$original.sha256;originalBytes=$original.bytes;operation='temporary exact-owned replacement with original backup';owner='PLAYABLE-09 reviewed passive RPH bridge'}
)
$install=[ordered]@{schema=1;profile='PLAYABLE-09';executed=$false;requiresSeparateExplicitDeploymentAndLaunchApproval=$true;payload=$payload
 lease=[ordered]@{destination=(Join-Path $game 'Plugins/RichAudio.ShvHandoff.json');pendingPath=(Join-Path $game 'Plugins/RichAudio.ShvHandoff.json.playable09.pending');maximumBytes=8192;creation='After the one authorised GTA process exists: exact process ID+kernel creation time, fresh session, exact23-field compiled policy; hash/length/ownership receipt before atomic creation';sourceTemplate=(Join-Path $bridge 'session-lease-template.json');templateSha256=(Hash (Join-Path $bridge 'session-lease-template.json'))}
 protectedInstallation=$protected;reviewedShortcutBaselines=$prior.reviewedShortcutBaselines;stockFallbackSelected=$true;productionFeatureFlagsDisabled=$true
 preconditions=@('Fresh approval for these exact two artifact hashes, one deployment and one RPH-route launch','Recheck every protected/settings/artifact hash and no game/RPH/audio host processes','All owned pending/new/backup paths absent and unlinked','No diagnostic ASI or timeout override','Pin candidate input files against writes while copying')
 operations=@('Create each pending file with CreateNew/FileShare.None; flush, hash+length verify; record ownership','For the plugin only: verify exact original, move original to same-volume absent backup, then pending to RichAudio.dll; preserve original bytes','Move new ASI pending into absent destination; verify both installed candidates before launch','Launch once through existing route; no launch-route/startup/runtime/settings changes','Create process-bound lease pending only after actual PID+kernelcreation; record exact final hash/length, atomically move to absent destination','If any step fails: no launch/retry; rollback only verified owned changes')
 forbiddenChanges=@('Game/RPH/SHV/loader/DirectStorage binaries','startup.rphs and launch shortcuts','RichAudio.Playable.json and RichAudio.Menu.json','Saved settings, sources, recordings, renderer, gains, loudness/recording activation')}
$rollback=[ordered]@{schema=1;profile='PLAYABLE-09';executed=$false;requiresGameAndRphProcessExit=$true;noHotUnload=$true;ownershipReceiptRequired=$true;recursiveDeletionAllowed=$false;capturesRemoved=$false
 producer=[ordered]@{paths=@($payload[0].destination,$payload[0].pendingPath);sha256=$payload[0].sha256;bytes=$payload[0].bytes}
 bridge=[ordered]@{path=$payload[1].destination;pendingPath=$payload[1].pendingPath;candidateSha256=$payload[1].sha256;candidateBytes=$payload[1].bytes;backupPath=$payload[1].backupPath;originalSha256=$original.sha256;originalBytes=$original.bytes}
 lease=[ordered]@{paths=@($install.lease.destination,$install.lease.pendingPath);sha256='exact generated lease digest from creation receipt, never a wildcard';maximumBytes=8192}
 operations=@('Confirm normal game exit and all owned process lifetimes ended; no hot unload or automatic relaunch','Remove new ASI/pending only if creation receipt+hash+length prove ownership','Remove lease/pending only if exact session creation receipt+hash+length prove ownership','Remove candidate plugin/pending only if exact owned candidate hash+length; refuse if changed','Verify original backup SHA+length then move to now-absent original plugin path without overwrite; reverify','If original path already contains exact original, leave it; do not delete unknown files or a changed backup','Verify all11 protected installation and four saved settings hashes, fallback, flagsfalse; retain private captures/logs; no recursive deletion')}
$preflight=[ordered]@{schema=1;profile='PLAYABLE-09';result='PASS';baselineSha256=(Hash $baselinePath);protectedFiles=$protected;protectedCount=$protected.Count;settingsCount=$prior.reviewedShortcutBaselines.Count;preservedSourceAndEvidencePins=$preserved.Count;candidatePayload=$payload;stockFallbackSelected=$true;productionFlagsDisabled=$true;ownedPathsAbsent=$true;ownedProcessesAbsent=$true;gameFilesWritten=$false;gameLaunched=$false;endpointOpened=$false;audioPlayback=$false;approvalGranted=$false}
$preflight.reviewedBridgeReceiptSha256=$reviewedReceiptSha256
$preflight.pipelineReceiptSha256=$reviewedPipelineReceiptSha256
$preflight.pipelineCases=32
$preflight.compiledBridgeSourcePinsVerified=44
$preflight.compiledNativeSourcePinsVerified=4
foreach($entry in @(@('installation-manifest.json',$install),@('rollback-manifest.json',$rollback),@('preflight.json',$preflight))){$entry[1]|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $out $entry[0]) -Encoding utf8}
Write-Output ('PASS prepared exact passive proposal only: '+$out)
