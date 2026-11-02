#requires -Version 7.0
[CmdletBinding()]param(
 [Parameter(Mandatory)][string]$RetainedBatiPcm,
 [Parameter(Mandatory)][string]$RetainedSessionMetadata
)
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$p){(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}
function Unlinked([string]$p){for($at=[IO.Path]::GetFullPath($p);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked input/output refused.'}}}
Unlinked $RetainedBatiPcm;Unlinked $RetainedSessionMetadata;$bedSha=Hash $RetainedBatiPcm;$metadataSha=Hash $RetainedSessionMetadata
if($bedSha-cne'e86d54d9f305b24dd86264d456f3f8786e741c0aaaaeab42a82bd70016a021fe'){throw 'Exact retained original Bati PCM required; no alternative material.'}
$old=Get-Content -LiteralPath $RetainedSessionMetadata -Raw|ConvertFrom-Json
if(!$old.complete-or!$old.selectedEndpointId-or$old.ownedFrames-ne1594176){throw 'Historical approved final recording metadata required; no endpoint query allowed.'}
$out=Join-Path $repo ('.local/latency-03/candidate-'+[guid]::NewGuid().ToString('N'));Unlinked $out
[IO.Directory]::CreateDirectory($out)|Out-Null;$bank=Join-Path $out 'assets/transients'
& node (Join-Path $repo 'tools/Prepare-Latency03Kernels.mjs') --output $bank
if($LASTEXITCODE-ne0){throw 'Original waveform preparation failed.'}
$prep=Get-Content -LiteralPath (Join-Path $bank 'preparation.json') -Raw|ConvertFrom-Json
$sources=@('src/acoustics/host/Windows','src/acoustics/host/Transport','src/acoustics/recording','src/acoustics/geometry','src/acoustics/experiments')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -File -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$allCode=@($sources|ForEach-Object{[IO.Path]::GetRelativePath($repo,$_).Replace('\','/')})+@($prep.sourcePins.file)+@('tools/Prepare-Latency03Candidate.ps1','tools/Invoke-Latency03Experiment.ps1')|Sort-Object -Unique
$pins=@($allCode|ForEach-Object{[ordered]@{file=$_;sha256=(Hash (Join-Path $repo $_))}})
foreach($pin in $pins){$target=Join-Path $out $pin.file;[IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null;[IO.File]::Copy((Join-Path $repo $pin.file),$target,$false)}
$runtime=Join-Path $out 'runtime';[IO.Directory]::CreateDirectory($runtime)|Out-Null;$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$binary=Join-Path $runtime 'Latency03.Experiment.exe'
& $compiler /nologo /optimize+ /warnaserror+ /unsafe+ /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:RichAudio.Experiments.Latency03Experiment ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Isolated experiment compilation failed.'}
$node=(Get-Command node).Source;$nodeSha=Hash $node;[IO.File]::Copy($node,(Join-Path $runtime 'node.exe'),$false)
$bedTarget=Join-Path $out 'assets/bati-reference.wav';[IO.File]::Copy([IO.Path]::GetFullPath($RetainedBatiPcm),$bedTarget,$false)
foreach($pin in $pins){if((Hash (Join-Path $repo $pin.file))-cne$pin.sha256-or(Hash (Join-Path $out $pin.file))-cne$pin.sha256){throw 'Source changed during preparation; preserve failed output and make no approval claim.'}}
if((Hash $RetainedBatiPcm)-cne$bedSha-or(Hash $RetainedSessionMetadata)-cne$metadataSha-or(Hash $node)-cne$nodeSha){throw 'Original input/runtime drift.'}
$treeStatus=@(& git -C $repo status --porcelain)
$manifest=[ordered]@{schema=1;kind='latency-03-original-synthetic-endpoint-proposal';session=[guid]::NewGuid().ToString('N');endpointId=$old.selectedEndpointId;endpointIdentityBasis='Privately retained previous approved selected output identity; current availability/capabilities unqueried';nodeFile='runtime/node.exe';workerFile='tools/Run-Latency03EventWorker.mjs';preparationFile='assets/transients/preparation.json';bedFile='assets/bati-reference.wav';requestedPeriodFrames=0;maximumOutputSeconds=28;outputGain=1;burstPolicy='ProtectActiveTails03';sourceCommit=(& git -C $repo rev-parse HEAD);sourceTreeClean=($treeStatus.Count-eq0);sourcePins=$pins;compilerSha256=(Hash $compiler);nodeSha256=$nodeSha;retainedRecordingMetadataSha256=$metadataSha;recordingAllowed=$false;gameLaunchAllowed=$false;nativeAcquisitionAllowed=$false;nativeSuppressionAllowed=$false;normalPreferencesChanged=$false;bindings=@(Get-ChildItem -LiteralPath $out -Recurse -File|Sort-Object FullName|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($out,$_.FullName).Replace('\','/');bytes=$_.Length;sha256=(Hash $_.FullName)}})}
$manifestPath=Join-Path $out 'candidate.json';$manifest|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $manifestPath -Encoding utf8
# Validation loads files and constructs unsealed queues. It cannot activate COM,
# create an endpoint session, claim an attempt or launch the event worker.
$raw=@(& $binary --validate $out);if($LASTEXITCODE-ne0){throw 'Offline-only candidate validation failed.'};$validation=$raw|ConvertFrom-Json
if(!$validation.passed-or$validation.endpointOpened-or$validation.endpointPeriodQueried-or$validation.recordingStarted-or$validation.gameLaunched){throw 'Validation scope mismatch.'}
$raw|Set-Content -LiteralPath (Join-Path $out 'offline-validation.json') -Encoding utf8
[ordered]@{schema=1;passed=$true;candidateRoot=$out;manifestSha256=(Hash $manifestPath);binarySha256=(Hash $binary);nodeSha256=$nodeSha;sourcePins=$pins;originalBedChanged=$false;endpointOpened=$false;endpointQueried=$false;gameLaunched=$false;recordingStarted=$false;deploymentCandidate=$false;liveAuthorized=$false;proposalMissing=$true;scope='Offline build only. Exact future proposal and independent review are still required; no endpoint has been opened.'}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $out 'preparation-receipt.json') -Encoding utf8
Write-Output ('PASS offline-only device candidate preparation; '+$out)
