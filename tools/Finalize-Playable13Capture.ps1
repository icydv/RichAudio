#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$PackageRoot,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{32}$')][string]$Session,
 [string]$OutputRoot=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Unlinked([string]$Path){for($at=[IO.Path]::GetFullPath($Path);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked capture/finalization path refused.'}}}
function Private([string]$Path){$full=[IO.Path]::GetFullPath($Path);$prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-13')).TrimEnd('\')+'\';if(!$full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'PLAYABLE-13 private path required.'};Unlinked $full;return $full}
$package=Private $PackageRoot
$statusPath=Join-Path $package ('.local/gameplay/'+$Session+'/host.json');Unlinked $statusPath
if((Get-Item -LiteralPath $statusPath).Length-gt65536){throw 'Host result exceeds bound.'}
$hostResult=Get-Content -LiteralPath $statusPath -Raw|ConvertFrom-Json
if($hostResult.demoProfile-cne'PLAYABLE-13'-or$hostResult.hostState-cne'stopped'){throw 'Final stopped scoped host result required; no processing on an active audio host.'}
if($hostResult.hostPid-gt0-and(Get-Process -Id ([int]$hostResult.hostPid) -ErrorAction SilentlyContinue)){throw 'The recorded host PID is still active; capture finalization is post-session only.'}
if($hostResult.recordingRequested-ne$true){Write-Output '{"profile":"PLAYABLE-13","analysisSkipped":true,"reason":"recording-not-requested","endpointOpenedByFinalizer":false}';exit}
if(!$hostResult.recordingDirectory){throw ('No finalized recording was produced: '+$hostResult.recordingFailure)}
$capture=Private ([string]$hostResult.recordingDirectory)
$captureParent=[IO.Path]::GetFullPath((Join-Path $package '.local/recordings/audio-tests')).TrimEnd('\')
if(![IO.Path]::GetDirectoryName($capture).Equals($captureParent,[StringComparison]::OrdinalIgnoreCase)-or[IO.Path]::GetFileName($capture)-notmatch'^capture-[a-f0-9]{32}$'){throw 'Recording directory is outside the owned package capture tree.'}
$requestPath=Join-Path $capture 'demo-analysis-request.json';$manifestPath=Join-Path $capture 'session.json'
Unlinked $requestPath;Unlinked $manifestPath
if((Get-Item -LiteralPath $requestPath).Length-gt8192-or(Get-Item -LiteralPath $manifestPath).Length-gt65536){throw 'Capture result exceeds bound.'}
$request=Get-Content -LiteralPath $requestPath -Raw|ConvertFrom-Json
$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
if($request.profile-cne'PLAYABLE-13'-or$request.hostSession-cne$Session-or$request.recordingId-cne[IO.Path]::GetFileName($capture)-or$manifest.recordingId-cne$request.recordingId){throw 'Recording session ownership differs from the stopped host.'}
$before=@(foreach($entry in $manifest.files){if([IO.Path]::GetFileName($entry.file)-cne$entry.file){throw 'Invalid finalized recording name.'};$p=Join-Path $capture $entry.file;Unlinked $p;if((Get-Item -LiteralPath $p).Length-ne$entry.bytes-or(Hash $p)-cne$entry.sha256){throw 'Recorded source differs from finalized manifest.'};[ordered]@{file=$entry.file;path=$p;bytes=$entry.bytes;sha256=$entry.sha256}})
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/playable-13/recording-analysis/'+$Session+'-'+[guid]::NewGuid().ToString('N'))}
$output=Private $OutputRoot
if(Test-Path -LiteralPath $output){throw 'Analysis output must be new; no capture or report is overwritten.'}
$node=Join-Path $package 'runtime/node.exe';if(!(Test-Path -LiteralPath $node)){$node=(Get-Command node -ErrorAction Stop).Source}
$analyzer=Join-Path $PSScriptRoot 'Analyze-Playable13Recording.mjs'
& $node $analyzer --session $capture --output $output
if($LASTEXITCODE-ne0){throw 'Recorded-file analysis failed; original lossless capture remains retained.'}
foreach($entry in $before){if((Hash $entry.path)-cne$entry.sha256-or(Get-Item -LiteralPath $entry.path).Length-ne$entry.bytes){throw 'Analysis changed an original recording.'}}
$analysis=Get-Content -LiteralPath (Join-Path $output 'analysis.json') -Raw|ConvertFrom-Json
$files=@(Get-ChildItem -LiteralPath $output -File|ForEach-Object{[ordered]@{name=$_.Name;bytes=$_.Length;sha256=(Hash $_.FullName)}})
$receipt=[ordered]@{schema=1;profile='PLAYABLE-13';kind='automatic-post-session-recorded-audio-analysis';session=$Session;recordingId=$request.recordingId;captureDirectory=$capture;hostResultSha256=(Hash $statusPath);captureManifestSha256=(Hash $manifestPath);requestSha256=(Hash $requestPath);analysisRunnerSha256=(Hash $analyzer);finalizerSha256=(Hash $PSCommandPath);recordingComplete=$analysis.recordingComplete;capturedFilesPreserved=$true;capturedFiles=$before;analysisFiles=$files;ownedWaveRetained=$true;loopbackWaveRetained=(Test-Path -LiteralPath (Join-Path $capture 'loopback.wav'));endpointOpened=$false;microphoneOpened=$false;audioPlaybackStarted=$false;subjectiveQualityEstablished=$false;humanListeningApproved=$false;limits='Post-session analysis of actual retained files only. Automated candidates do not replace human listening; missing clocks/stems/loopback remain explicit unavailable evidence.'}
$receiptPath=Join-Path $output 'finalization.json';$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $receiptPath -Encoding utf8
Write-Output ('PASS recording finalization; '+$receiptPath)
