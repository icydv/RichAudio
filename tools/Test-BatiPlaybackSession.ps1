#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Candidate)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$candidateRoot=[IO.Path]::GetFullPath($(if([IO.Path]::IsPathRooted($Candidate)){$Candidate}else{Join-Path $repo $Candidate}))
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-13')).TrimEnd('\')+'\'
if(!$candidateRoot.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'New private PLAYABLE-13 candidate required.'}
for($cursor=$candidateRoot;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){if((Test-Path -LiteralPath $cursor)-and((Get-Item -LiteralPath $cursor -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked candidate refused.'}}
$out=Join-Path $repo ('.local/playable-13/bati-session-fixture-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
$sources=@('src/acoustics/host/Transport','src/acoustics/host/Windows','src/acoustics/recording','src/acoustics/geometry')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -File -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$sources+=Join-Path $repo 'tests/host/TestBatiPlaybackSession.cs'
$pins=@($sources|Sort-Object -Unique|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$binary=Join-Path $out 'RichAudio.BatiPlaybackSession.Fixture.exe'
& $compiler /nologo /target:exe /optimize+ /warnaserror+ /unsafe+ /langversion:5 /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:TestBatiPlaybackSession ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Bati actual-component fixture compilation failed.'}
$report=Join-Path $out 'actual-component-result.json'
$raw=@(& $binary $candidateRoot $report 2>&1);$fixtureExit=$LASTEXITCODE
$raw|Set-Content -LiteralPath (Join-Path $out 'fixture.log') -Encoding utf8
if($fixtureExit-ne0){throw ('Bati actual-component fixture failed; retained '+$out+'; '+($raw-join [Environment]::NewLine))}
$raw|ForEach-Object{Write-Output $_}
$result=Get-Content -LiteralPath $report -Raw|ConvertFrom-Json
if($result.passed-ne$true-or$result.fixtureOnly-ne$true-or$result.endpointOpened-ne$false-or$result.gameStarted-ne$false-or$result.audioPlayed-ne$false){throw 'Unexpected fixture boundary.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Fixture source changed during execution.'}}
[ordered]@{schema=1;profile='PLAYABLE-13';passed=$true;kind='gated-Bati-actual-production-components-fixture';checks=$result.checks;sources=$pins;binarySha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();resultSha256=(Get-FileHash -LiteralPath $report).Hash.ToLowerInvariant();candidateRoot=$candidateRoot;manifestSha256=(Get-FileHash -LiteralPath (Join-Path $candidateRoot 'playable.json')).Hash.ToLowerInvariant();endpointOpened=$false;gameStarted=$false;audioPlayed=$false;authoredObservationsOnly=$true;independentExpiryDelayMs=$result.independentExpiryDelayMs;savedPreferencesUnchanged=$true;runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding utf8
Write-Output ('PASS actual Bati runtime/pipe/source/renderer/ring fixture; '+(Join-Path $out 'validation.json'))
