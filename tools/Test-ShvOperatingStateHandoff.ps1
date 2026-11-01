[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/playable-08/handoff-validation-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path -LiteralPath $compiler -PathType Leaf)){throw 'Existing .NET Framework compiler is required; this tool installs nothing.'}
$relativeSources=@('src/acoustics/host/Handoff/ShvOperatingStateHandoff.cs','tests/host/TestShvOperatingStateHandoff.cs')
$sources=@($relativeSources|ForEach-Object{Join-Path $repo $_})
$binary=Join-Path $out 'RichAudio.ShvHandoff.Offline.Tests.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /main:TestShvOperatingStateHandoff ('/out:'+$binary) @sources
if($LASTEXITCODE -ne 0){throw 'Offline handoff fixture compilation failed'}
$raw=@(& $binary)
if($LASTEXITCODE -ne 0){throw 'Offline handoff validation failed'}
if($raw.Count -ne 1){throw 'Expected one bounded fixture result'}
$result=$raw[0]|ConvertFrom-Json
if($result.schema -ne 1 -or $result.suite -cne 'ShvOperatingStateHandoff' -or $result.passed -ne $true -or
    $result.liveHandoffReady -ne $false -or $result.gameLaunched -ne $false -or $result.endpointOpened -ne $false){throw 'Unexpected offline result contract'}
$pins=@($relativeSources|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_) -Algorithm SHA256).Hash.ToLowerInvariant()}})
$receipt=[ordered]@{
    schema=1;profile='PLAYABLE-08';kind='offline-handoff-preparation';provenance='device-free-fixture';passed=$true
    cases=[int]$result.cases;assertions=[int]$result.assertions;casesPassed=@($result.casesPassed)
    liveHandoffReady=$false;liveIdentityCorrelationProven=$false;authenticatedTransportImplemented=$false
    gameLaunched=$false;gameFilesWritten=$false;nativeCalls=$false;endpointOpened=$false;audioPlayback=$false
    productFilesWired=$false;productionAuthorizationGranted=$false
    compiler=[ordered]@{path=$compiler;sha256=(Get-FileHash -LiteralPath $compiler -Algorithm SHA256).Hash.ToLowerInvariant();fileVersion=(Get-Item -LiteralPath $compiler).VersionInfo.FileVersion}
    binary=[ordered]@{path=$binary;sha256=(Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()}
    sources=$pins;runnerSha256=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
$receiptPath=Join-Path $out 'validation.json'
$receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $receiptPath -Encoding utf8
Write-Output ('PASS '+$result.cases+' cases / '+$result.assertions+' assertions; private receipt: '+$receiptPath)
