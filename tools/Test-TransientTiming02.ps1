#requires -Version 7.0
[CmdletBinding()]param([Parameter(Mandatory)][string]$Prepared,[string]$RetainedPcm='synthetic')
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/latency-02/timing-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
$preparedPath=[IO.Path]::GetFullPath($Prepared);$r=Get-Content -LiteralPath $preparedPath -Raw|ConvertFrom-Json
if(!$r.passed-or$r.productionEnabled-or$r.nativeEventAcquired-or$r.endpointOpened){throw 'Pinned original synthetic preparation only.'}
foreach($pin in $r.sourcePins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.file)).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Preparation source changed: retain prior receipt and make a separately named offline fixture.'}}
$files=@('src/acoustics/host/Windows/PcmRing.cs','src/acoustics/host/Windows/PreparedTransientBus.cs','src/acoustics/host/Windows/TransientEventProtocol.cs','tests/host/TestTransientTiming02.cs','tools/Test-TransientTiming02.ps1','tools/Run-TransientEventFixture.mjs','src/acoustics/events/contracts.mjs','src/acoustics/events/wire.mjs','src/acoustics/events/acquisition-capability.mjs')
$pins=@($files|ForEach-Object{[ordered]@{file=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe';$exe=Join-Path $out 'TransientTiming.Tests.exe'
& $compiler /nologo /optimize+ /unsafe+ /warnaserror+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+$exe) @($files|Where-Object{$_-like'*.cs'}|ForEach-Object{Join-Path $repo $_})
if($LASTEXITCODE-ne0){throw 'Transient timing fixture compilation failed.'}
$node=(Get-Command node).Source;$nodeSha=(Get-FileHash -LiteralPath $node).Hash.ToLowerInvariant();$nodeVersion=(& $node --version);$result=Join-Path $out 'timing.json'
$raw=@(& $exe $preparedPath $RetainedPcm $node (Join-Path $repo 'tools/Run-TransientEventFixture.mjs'))
if($LASTEXITCODE-ne0){throw 'Transient timing fixture failed.'}
$raw|Set-Content -LiteralPath $result -Encoding utf8
foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.file)).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Source changed during timing fixture.'}}
foreach($pin in $r.sourcePins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.file)).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Kernel source changed during timing fixture.'}}
if((Get-FileHash -LiteralPath $node).Hash.ToLowerInvariant()-cne$nodeSha){throw 'Executed Node binary changed during timing fixture.'}
$continuous=if($RetainedPcm-eq'synthetic'){[ordered]@{kind='original-authored-continuous-sine'}}else{[ordered]@{kind='privately-retained-final-RichAudio-PCM';sha256=(Get-FileHash -LiteralPath $RetainedPcm).Hash.ToLowerInvariant()}}
[ordered]@{schema=1;passed=$true;sourcePins=$pins;node=[ordered]@{version=$nodeVersion;sha256=$nodeSha};preparationSha256=(Get-FileHash -LiteralPath $preparedPath).Hash.ToLowerInvariant();continuous=$continuous;resultSha256=(Get-FileHash -LiteralPath $result).Hash.ToLowerInvariant();endpointOpened=$false;gameLaunched=$false;recordingStarted=$false;wasapiSubmissionMeasured=$false;physicalLatencyMeasured=$false}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $out 'validation.json') -Encoding utf8
Write-Output ('PASS synthetic native timing fixture; '+(Join-Path $out 'validation.json'))
