#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;$output=[IO.Path]::GetFullPath($OutputRoot)
if(!$output.StartsWith([IO.Path]::GetFullPath((Join-Path $repo '.local/migration-shvdne-01'))+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private fixture output required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output refused'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$original=Join-Path $repo '.local/migration-shvdne-01/smoke-02b-preparation/original-source/src/acoustics/bridge/Integration/SharedFrameSampler.cs'
$baseline=Join-Path $output 'BaselineSharedFrameSampler.generated.cs'
[IO.File]::WriteAllText($baseline,[IO.File]::ReadAllText($original).Replace('SharedFrameSampler','BaselineSharedFrameSampler'))
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('src/acoustics/bridge/Integration/ShvdneConfiguration.cs','src/acoustics/bridge/Integration/GameObservations.cs','src/acoustics/bridge/Integration/CameraListenerTracker.cs','src/acoustics/bridge/Integration/SharedFrameSampler.cs','src/acoustics/bridge/Shvdne/ShvdneGameSource.cs','tests/host/TestShvdneGameSource.cs','tests/host/ShvdneObservationNativeHashes.cs','tests/host/TestShvdneTrace02B.cs')|ForEach-Object{Join-Path $repo $_}
$sources+=$baseline;$exe=Join-Path $output 'RichAudio.Trace02B.Tests.exe'
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /optimize+ /warnaserror+ /platform:x64 /langversion:5 /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:TestShvdneTrace02B ('/out:'+$exe) @sources 2>&1|Tee-Object -FilePath (Join-Path $output 'build.log')
if($LASTEXITCODE-ne0){throw 'Trace fixtures compilation failed'}
& $exe 2>&1|Tee-Object -FilePath (Join-Path $output 'tests.log')
if($LASTEXITCODE-ne0){throw 'Trace semantics fixtures failed'}
& $exe overhead (Join-Path $output 'overhead.json') 2>&1|Tee-Object -FilePath (Join-Path $output 'overhead.log')
if($LASTEXITCODE-ne0){throw 'Instrumentation overhead admission failed; candidate not admitted'}
[ordered]@{schema=1;passed=$true;baselineSha256=(Get-FileHash -LiteralPath $original).Hash;gameLaunched=$false;candidateExecuted=$false;endpointOpened=$false;sources=@($sources|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash}})}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $output 'validation.json') -Encoding utf8
