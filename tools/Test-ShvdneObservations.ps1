#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/shvdne-observations-'+[Guid]::NewGuid().ToString('N'))}
$output=[IO.Path]::GetFullPath($OutputRoot)
$privatePrefix=[IO.Path]::GetFullPath((Join-Path $repo '.local')).TrimEnd('\')+'\'
if(!$output.StartsWith($privatePrefix,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'New output directory within this worktree .local required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$rphPath=Join-Path $repo 'src/acoustics/bridge/Rph/CameraSampler.Rph.cs'
$rph=[IO.File]::ReadAllText($rphPath)
$begin=$rph.IndexOf('    internal sealed class CameraObservation')
$end=$rph.IndexOf('    internal static class CameraSampler')
if($begin-lt0-or$end-le$begin){throw 'RPH pure listener reference boundaries changed'}
# Compile the unchanged RPH observation/tracker classes under their original
# namespace against the very same authored samples as the independent boundary.
$reference=Join-Path $output 'RphListenerReference.generated.cs'
[IO.File]::WriteAllText($reference,'using System;using System.Diagnostics;using RichAudio.Beacon.Transport;namespace RichAudio.Beacon.Rph {'+$rph.Substring($begin,$end-$begin)+'}')
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('src/acoustics/bridge/Integration/GameObservations.cs','src/acoustics/bridge/Integration/CameraListenerTracker.cs','src/acoustics/bridge/Integration/SharedFrameSampler.cs','tests/host/TestShvdneObservations.cs'|ForEach-Object{Join-Path $repo $_})
$sources+=$reference
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$binary=Join-Path $output 'RichAudio.Shvdne.Observation.Tests.exe'
$build=@(& $compiler /nologo /target:exe /platform:x64 /optimize+ /warnaserror+ /langversion:5 /r:System.Runtime.Serialization.dll /r:System.Core.dll ('/out:'+$binary) @sources 2>&1)
$build|Set-Content -LiteralPath (Join-Path $output 'build.log')
if($LASTEXITCODE-ne0){throw ($build-join[Environment]::NewLine)}
$result=@(& $binary 2>&1)
$result|Set-Content -LiteralPath (Join-Path $output 'tests.log')
if($LASTEXITCODE-ne0){throw ($result-join[Environment]::NewLine)}
$last=$result[-1].ToString()
if($last-notmatch'^RESULT cases=(\d+) assertions=(\d+) gameLaunched=false endpointOpened=false$'){throw 'Missing fixture completion receipt'}
$boundaryCases=[int]$Matches[1];$boundaryAssertions=[int]$Matches[2]
$providerSources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs'|ForEach-Object FullName)
$providerSources+=@('src/acoustics/bridge/Integration/GameObservations.cs','src/acoustics/bridge/Shvdne/ShvdneGameSource.cs','tests/host/ShvdneObservationNativeHashes.cs','tests/host/TestShvdneGameSource.cs'|ForEach-Object{Join-Path $repo $_})
$providerBinary=Join-Path $output 'RichAudio.Shvdne.Provider.Tests.exe'
$providerBuild=@(& $compiler /nologo /target:exe /platform:x64 /optimize+ /warnaserror+ /langversion:5 /r:System.Runtime.Serialization.dll /r:System.Core.dll ('/out:'+$providerBinary) @providerSources 2>&1)
$providerBuild|Set-Content -LiteralPath (Join-Path $output 'provider-build.log')
if($LASTEXITCODE-ne0){throw ($providerBuild-join[Environment]::NewLine)}
$providerResult=@(& $providerBinary 2>&1)
$providerResult|Set-Content -LiteralPath (Join-Path $output 'provider-tests.log')
if($LASTEXITCODE-ne0){throw ($providerResult-join[Environment]::NewLine)}
$providerLast=$providerResult[-1].ToString()
if($providerLast-notmatch'^RESULT cases=(\d+) assertions=(\d+) gameLaunched=false endpointOpened=false$'){throw 'Missing provider fixture completion receipt'}
$providerCases=[int]$Matches[1];$providerAssertions=[int]$Matches[2]
$receipt=[ordered]@{schema=1;passed=$true;cases=($boundaryCases+$providerCases);assertions=($boundaryAssertions+$providerAssertions);boundaryCases=$boundaryCases;boundaryAssertions=$boundaryAssertions;providerCases=$providerCases;providerAssertions=$providerAssertions;gameLaunched=$false;endpointOpened=$false;fixtureScope='Authored observations, actual boundary code, verbatim pure RPH listener algorithm, actual SHVDNE provider with fake API responses; not GTA runtime qualification';rphReferenceSha256=(Get-FileHash -LiteralPath $rphPath).Hash;sources=@(($sources+$providerSources|Sort-Object -Unique)|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash}});binarySha256=(Get-FileHash -LiteralPath $binary).Hash;providerBinarySha256=(Get-FileHash -LiteralPath $providerBinary).Hash}
$receipt|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $output 'validation.json') -Encoding utf8
Write-Output ('RESULT cases='+$receipt.cases+' assertions='+$receipt.assertions+' gameLaunched=false endpointOpened=false; '+(Join-Path $output 'validation.json'))
