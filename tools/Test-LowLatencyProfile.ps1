#requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$output=Join-Path $repo ('.local/low-latency-01/ring-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($output)|Out-Null
$sources=@('src/acoustics/host/Windows/PcmRing.cs','src/acoustics/host/Windows/GameplayLatencyProfile.cs','tests/host/TestLowLatencyProfile.cs')|ForEach-Object{Join-Path $repo $_}
$original=@(& git -C $repo show 'd9fdc90:src/acoustics/host/Windows/PcmRing.cs');if($LASTEXITCODE-ne0){throw 'Original baseline ring commit required.'}
$originalText=[string]::Join("`n",$original)+"`n";$originalFile=Join-Path $output 'OriginalPcmRing.cs';[IO.File]::WriteAllText($originalFile,$originalText.Replace('namespace RichAudio.Beacon.Windows','namespace OriginalRichAudio.Beacon.Windows'));$sources+=$originalFile
$pins=@($sources|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}})
$binary=Join-Path $output 'LowLatencyProfile.Tests.exe';$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /optimize+ /warnaserror+ /unsafe+ /platform:x64 /r:System.Web.Extensions.dll ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Low latency ring fixture compile failed.'}
$result=@(& $binary);if($LASTEXITCODE-ne0-or$result.Count-ne1){throw 'Low latency ring fixture failed.'}
$report=$result[0]|ConvertFrom-Json;if(!$report.passed-or$report.endpointOpened-or$report.gameStarted){throw 'Fixture scope failed.'}
$result[0]|Set-Content -LiteralPath (Join-Path $output 'ring-results.json') -Encoding utf8
foreach($pin in $pins){if((Get-FileHash -LiteralPath $pin.path).Hash.ToLowerInvariant()-cne$pin.sha256){throw 'Source changed during ring fixture.'}}
[ordered]@{schema=1;passed=$true;checks=$report.checks;scenarios=@($report.scenarios).Count;originalBaselineScenarios=16;originalRingCommit='d9fdc90';originalRingChange='Namespace only for side-by-side execution; original source from git object, never runtime substitution';sourcePins=$pins;resultSha256=(Get-FileHash -LiteralPath (Join-Path $output 'ring-results.json')).Hash.ToLowerInvariant();binarySha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant();endpointOpened=$false;gameLaunched=$false;clockDomain='authored-discrete-event-ms; not measured wall performance'}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $output 'validation.json') -Encoding utf8
Write-Output ('PASS actual production-ring authored low-latency scenarios; '+(Join-Path $output 'validation.json'))
