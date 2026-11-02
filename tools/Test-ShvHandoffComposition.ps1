[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/playable-09/composition-core-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path -LiteralPath $compiler -PathType Leaf)){throw 'Existing .NET Framework x64 compiler required; no installation is performed.'}
$relative=@('src/acoustics/host/Handoff/ShvOperatingStateHandoff.cs','src/acoustics/host/Handoff/TrustedShvComposition.cs',
 'src/acoustics/host/Handoff/ShvProducerModule.cs','src/acoustics/host/Handoff/ShvClockCalibration.cs',
 'src/acoustics/host/Handoff/ShvHandoffConsumer.cs','tests/host/TestShvHandoffComposition.cs')
$sources=@($relative|ForEach-Object{Join-Path $repo $_})
$pins=@($relative|ForEach-Object{[ordered]@{name=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_)).Hash.ToLowerInvariant()}})
$binary=Join-Path $out 'RichAudio.ShvHandoff.Composition.Core.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /main:TestShvHandoffComposition ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Composition core compilation failed.'}
$raw=@(& $binary)
if($LASTEXITCODE-ne0-or$raw.Count-ne1){throw 'Composition core fixture failed.'}
$result=$raw[0]|ConvertFrom-Json
if($result.passed-ne$true-or$result.liveHandoffReady-ne$false-or$result.actualProducerExecuted-ne$false-or$result.endpointOpened-ne$false-or$result.gameLaunched-ne$false){throw 'Unexpected core fixture boundary.'}
$legacyBinary=Join-Path $out 'RichAudio.ShvHandoff.Playable08.Regression.Tests.exe'
$legacySources=@((Join-Path $repo 'src/acoustics/host/Handoff/ShvOperatingStateHandoff.cs'),(Join-Path $repo 'tests/host/TestShvOperatingStateHandoff.cs'))
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /main:TestShvOperatingStateHandoff ('/out:'+$legacyBinary) @legacySources
if($LASTEXITCODE-ne0){throw 'Revised shared validator regression compilation failed.'}
$legacyRaw=@(& $legacyBinary)
if($LASTEXITCODE-ne0-or$legacyRaw.Count-ne1){throw 'Revised shared validator regression failed.'}
$legacy=$legacyRaw[0]|ConvertFrom-Json
if(!$legacy.passed-or$legacy.cases-ne69-or$legacy.assertions-ne255-or$legacy.liveHandoffReady-or$legacy.gameLaunched-or$legacy.endpointOpened){throw 'Unexpected revised validator regression boundary.'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.name)).Hash.ToLowerInvariant()-ne$pin.sha256){throw 'Source changed during core validation.'}}
$receipt=[ordered]@{schema=1;profile='PLAYABLE-09';kind='composition-core-offline-controls';provenance='explicit-device-free-fixtures';passed=$true
 cases=$result.cases;assertions=$result.assertions;casesPassed=$result.casesPassed;sources=$pins
 binary=[ordered]@{path=$binary;sha256=(Get-FileHash -LiteralPath $binary).Hash.ToLowerInvariant()}
 legacyValidatorRegression=[ordered]@{cases=$legacy.cases;assertions=$legacy.assertions;testSourceSha256=(Get-FileHash -LiteralPath $legacySources[1]).Hash.ToLowerInvariant();extendedValidatorSourceSha256=(Get-FileHash -LiteralPath $legacySources[0]).Hash.ToLowerInvariant();binarySha256=(Get-FileHash -LiteralPath $legacyBinary).Hash.ToLowerInvariant();casesPassed=$legacy.casesPassed;runtimePolicy='functional-compatibility'}
 compilerSha256=(Get-FileHash -LiteralPath $compiler).Hash.ToLowerInvariant();runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()
 liveHandoffReady=$false;actualProducerExecuted=$false;actualRphWitnessExecuted=$false;gameLaunched=$false;gameFilesWritten=$false;endpointOpened=$false;audioPlayback=$false
 limits='Core clock/silence and revised shared validator fixtures only. RPH metadata scope expectations intentionally changed for PLAYABLE-12; prior68-case evidence remains historical. Native/module/RPH correspondence needs separate compiled-component tests and an approved passive live test.'}
$path=Join-Path $out 'validation.json';$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $path -Encoding utf8
Write-Output ('PASS '+$result.cases+' core cases / '+$result.assertions+' assertions; '+$path)
