#requires -Version 7.0
[CmdletBinding()]param(
 [Parameter(Mandatory)][string]$RetainedBatiPcm,
 [Parameter(Mandatory)][string]$RetainedSessionMetadata
)
# Offline preparation only. Never reads or repairs a previous candidate.
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$p){for($at=[IO.Path]::GetFullPath($p);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked input/output refused'}}}
$treeStatus=@(& git -C $repo status --porcelain);if($LASTEXITCODE-ne0-or$treeStatus.Count-ne0){throw 'Commit and independently review the complete source before preparing a new candidate'}
$sourceCommit=& git -C $repo rev-parse HEAD;if($LASTEXITCODE-ne0){throw 'Committed source identity unavailable'}
$nodeCommand=Get-Command node;if(@($nodeCommand).Count-ne1-or$nodeCommand.CommandType-ne'Application'){throw 'One direct primary Node application is required; no alias or alternate executable substitution'}
$node=$nodeCommand.Source;$nodeSha=Hash $node
if($nodeSha-cne'3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'){throw 'Exact existing Node executable required; no runtime upgrade or substitution'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$compilerSha=Hash $compiler
Unlinked $RetainedBatiPcm;Unlinked $RetainedSessionMetadata
$bedSha=Hash $RetainedBatiPcm;$metadataSha=Hash $RetainedSessionMetadata
if($bedSha-cne'e86d54d9f305b24dd86264d456f3f8786e741c0aaaaeab42a82bd70016a021fe'){throw 'Exact original retained Bati reference required; no alternative or trimming'}
if($metadataSha-cne'b49c75b8b67f8a0cb89e92c1c9abbbe7ecb0d721d9ae1764b01cc88964804e47'){throw 'Exact original approved recording metadata required; no endpoint identity substitution'}
$original=Get-Content -LiteralPath $RetainedSessionMetadata -Raw|ConvertFrom-Json
if(!$original.complete-or!$original.selectedEndpointId-or$original.ownedFrames-ne1594176){throw 'Exact completed retained recording metadata required; no endpoint discovery'}
$out=Join-Path $repo ('.local/latency-03-1/candidate-'+[guid]::NewGuid().ToString('N'));Unlinked $out
[IO.Directory]::CreateDirectory($out)|Out-Null;$bank=Join-Path $out 'assets/transients'
& $node (Join-Path $repo 'tools/Prepare-Latency03Kernels.mjs') --output $bank
if($LASTEXITCODE-ne0){throw 'Original unchanged kernel preparation failed; preserve this new failed output'}
if((Hash (Join-Path $bank 'kernels.f32le'))-cne'833a27460efc3a9f2774859b7a097cf2c7ea881f0095f7b4091dc9a0a6c4868c'){throw 'Original synthetic kernel PCM changed; stop without substitution'}
$prep=Get-Content -LiteralPath (Join-Path $bank 'preparation.json') -Raw|ConvertFrom-Json
$sources=@('src/acoustics/host/Windows','src/acoustics/host/Transport','src/acoustics/recording','src/acoustics/geometry','src/acoustics/experiments')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -File -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$allCode=@($sources|ForEach-Object{[IO.Path]::GetRelativePath($repo,$_).Replace('\','/')})+@($prep.sourcePins.file)+@('tools/Prepare-Latency031Candidate.ps1','tools/Invoke-Latency031Experiment.ps1')|Sort-Object -Unique
$pins=@($allCode|ForEach-Object{[ordered]@{file=$_;sha256=(Hash (Join-Path $repo $_))}})
foreach($pin in $pins){$target=Join-Path $out $pin.file;[IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null;[IO.File]::Copy((Join-Path $repo $pin.file),$target,$false)}
$runtime=Join-Path $out 'runtime';[IO.Directory]::CreateDirectory($runtime)|Out-Null
$binary=Join-Path $runtime 'Latency03.Experiment.exe'
& $compiler /nologo /optimize+ /warnaserror+ /unsafe+ /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:RichAudio.Experiments.Latency03Experiment ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'New isolated candidate compilation failed; no endpoint is opened'}
[IO.File]::Copy($node,(Join-Path $runtime 'node.exe'),$false)
[IO.File]::Copy([IO.Path]::GetFullPath($RetainedBatiPcm),(Join-Path $out 'assets/bati-reference.wav'),$false)
foreach($pin in $pins){if((Hash (Join-Path $repo $pin.file))-cne$pin.sha256-or(Hash (Join-Path $out $pin.file))-cne$pin.sha256){throw 'Source changed during preparation; no repair or approval claim'}}
if((Hash $RetainedBatiPcm)-cne$bedSha-or(Hash $RetainedSessionMetadata)-cne$metadataSha-or(Hash $node)-cne$nodeSha-or(Hash $compiler)-cne$compilerSha){throw 'Original input, Node or compiler drift'}
$afterStatus=@(& git -C $repo status --porcelain);if($LASTEXITCODE-ne0){throw 'Final git status unavailable'}
$afterCommit=& git -C $repo rev-parse HEAD;if($LASTEXITCODE-ne0){throw 'Final committed source identity unavailable'}
if($afterStatus.Count-ne0-or$afterCommit-cne$sourceCommit){throw 'Committed source changed during preparation'}
$manifest=[ordered]@{schema=2;kind='latency-03-1-original-synthetic-endpoint-proposal';session=[guid]::NewGuid().ToString('N');endpointId=$original.selectedEndpointId;endpointIdentityBasis='Original approved retained recording metadata; no current endpoint discovery or capability query';nodeFile='runtime/node.exe';workerFile='tools/Run-Latency03EventWorker.mjs';preparationFile='assets/transients/preparation.json';bedFile='assets/bati-reference.wav';requestedPeriodFrames=0;maximumOutputSeconds=28;outputGain=1;burstPolicy='ProtectActiveTails03';clockPolicy='ArrivedPositionInterval031';maximumClockBracketFrames=512;maximumClockAnchorGapMilliseconds=20;maximumClockRateResidualFrames=512;minimumAdvancingClockSamples=3;sourceCommit=$sourceCommit;sourceTreeClean=$true;sourcePins=$pins;compilerSha256=$compilerSha;nodeSha256=$nodeSha;retainedRecordingMetadataSha256=$metadataSha;supersedesConsumedManifestSha256='58f92cdc399a86e86e70587f6124cb837eaa82d604e86c7ec327b05296640432';retainedFailedResultSha256='3585fc93e5dcff4984046cde5fa13815cc7d72e0c7c406d3392c7292845b8a32';recordingAllowed=$false;gameLaunchAllowed=$false;nativeAcquisitionAllowed=$false;nativeSuppressionAllowed=$false;normalPreferencesChanged=$false;bindings=@(Get-ChildItem -LiteralPath $out -Recurse -File|Sort-Object FullName|ForEach-Object{[ordered]@{file=[IO.Path]::GetRelativePath($out,$_.FullName).Replace('\','/');bytes=$_.Length;sha256=(Hash $_.FullName)}})}
$manifestPath=Join-Path $out 'candidate.json';$manifest|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $manifestPath -Encoding utf8
# This mode only loads files and unsealed queues; no child/COM/claim/start.
$raw=@(& $binary --validate $out);if($LASTEXITCODE-ne0){throw 'New device-free candidate validation failed'}
$validation=$raw|ConvertFrom-Json
if(!$validation.passed-or$validation.clockPolicy-cne'ArrivedPositionInterval031'-or$validation.plannedEvents-ne526-or$validation.endpointOpened-or$validation.endpointPeriodQueried-or$validation.recordingStarted-or$validation.gameLaunched){throw 'Offline validation scope or fixed sequence mismatch'}
$raw|Set-Content -LiteralPath (Join-Path $out 'offline-validation.json') -Encoding utf8
[ordered]@{schema=2;passed=$true;candidateRoot=$out;manifestSha256=(Hash $manifestPath);binarySha256=(Hash $binary);nodeSha256=$nodeSha;sourceCommit=$sourceCommit;sourcePins=$pins;originalBedChanged=$false;endpointOpened=$false;endpointQueried=$false;gameLaunched=$false;recordingStarted=$false;liveAuthorized=$false;proposalMissing=$true;scope='New offline candidate only; independent exact proposal/review and fresh approval are required; previous candidate remains consumed'}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $out 'preparation-receipt.json') -Encoding utf8
Write-Output ('PASS new offline LATENCY03.1 candidate; '+$out)
