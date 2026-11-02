#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Candidate)
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$candidateRoot=[IO.Path]::GetFullPath($Candidate);$private=[IO.Path]::GetFullPath((Join-Path $repo '.local/playable-15')).TrimEnd('\')+'\'
if(!$candidateRoot.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'Private PLAYABLE-15 fixture package required.'}
for($cursor=$candidateRoot;$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)){if((Test-Path -LiteralPath $cursor)-and((Get-Item -LiteralPath $cursor -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked candidate refused.'}}
$out=Join-Path $repo ('.local/playable-15/latency-fixture-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
$sources=@('src/acoustics/host/Transport','src/acoustics/host/Windows','src/acoustics/recording','src/acoustics/geometry')|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $repo $_) -File -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$sources+=Join-Path $repo 'tests/host/TestGameplayLatency.cs';$pins=@($sources|Sort-Object -Unique|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$binary=Join-Path $out 'RichAudio.GameplayLatency.Fixture.exe'
& $compiler /nologo /target:exe /optimize+ /warnaserror+ /unsafe+ /langversion:5 /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:TestGameplayLatency ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Actual latency recording fixture compilation failed.'}
$report=Join-Path $out 'actual-latency-result.json';& $binary $candidateRoot $report
if($LASTEXITCODE-ne0){throw ('Actual latency recording fixture failed; retained '+$out)}
$result=Get-Content -LiteralPath $report -Raw|ConvertFrom-Json
if(!$result.passed-or!$result.fixtureOnly-or$result.endpointOpened-or$result.microphoneOpened-or$result.gameLaunched){throw 'Fixture scope mismatch.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Fixture source changed during execution.'}}
[ordered]@{schema=1;passed=$true;fixtureOnly=$true;sources=$pins;binarySha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();resultSha256=(Get-FileHash -LiteralPath $report).Hash.ToLowerInvariant();candidateRoot=$candidateRoot;manifestSha256=(Get-FileHash -LiteralPath (Join-Path $candidateRoot 'playable.json')).Hash.ToLowerInvariant();endpointOpened=$false;gameLaunched=$false;physicalLatencyMeasured=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding utf8
Write-Output ('PASS actual gameplay latency recording fixture; '+(Join-Path $out 'validation.json'))
