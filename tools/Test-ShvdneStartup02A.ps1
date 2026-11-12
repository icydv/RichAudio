#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot;$output=[IO.Path]::GetFullPath($OutputRoot)
if(!$output.StartsWith([IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private offline output required'}
for($at=$output;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$upstream=Join-Path $repo '.local/shvdne-reference/source/source/scripting_v3/GTA.Native/Native.cs'
$native=[IO.File]::ReadAllText($upstream);$start=$native.IndexOf('    internal static class InstanceCreator<T1, T2, T3, TInstance>');$end=$native.IndexOf('    #region Functions',$start)
if($start-lt0-or$end-le$start){throw 'Retained pure factory extraction boundaries changed'}
$pure=$native.Substring($start,$end-$start).TrimEnd()
# Remove only the enclosing namespace close; the factory class body is verbatim.
if(!$pure.EndsWith('}')){throw 'Factory extraction closing brace missing'}
$factory=Join-Path $output 'RetainedInstanceCreator.generated.cs'
[IO.File]::WriteAllText($factory,'using System;using System.Reflection;using System.Linq.Expressions;namespace GTA.Native {'+$pure+'}')
$sources=@(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs'|ForEach-Object FullName)
$sources+=@('src/acoustics/bridge/Integration/GameObservations.cs','src/acoustics/bridge/Integration/CameraListenerTracker.cs','src/acoustics/bridge/Integration/SharedFrameSampler.cs','tests/host/TestShvdneStartup02A.cs')|ForEach-Object{Join-Path $repo $_}
$sources+=$factory
$exe=Join-Path $output 'RichAudio.Startup02A.Tests.exe'
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /optimize+ /warnaserror+ /platform:x64 /langversion:5 /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll ('/out:'+$exe) @sources 2>&1|Tee-Object -FilePath (Join-Path $output 'build.log')
if($LASTEXITCODE-ne0){throw 'Startup fixture compile failed'}
& $exe 2>&1|Tee-Object -FilePath (Join-Path $output 'tests.log')
if($LASTEXITCODE-ne0){throw 'Startup semantics fixture failed'}
1..5|ForEach-Object{& $exe factory;if($LASTEXITCODE-ne0){throw 'Pure factory fixture failed'}}|Tee-Object -FilePath (Join-Path $output 'factory-measurements.jsonl')
$receipt=[ordered]@{schema=1;passed=$true;gameLaunched=$false;endpointOpened=$false;candidateExecuted=$false;upstreamSource=$upstream;upstreamSha256=(Get-FileHash -LiteralPath $upstream).Hash;extractedFactorySha256=(Get-FileHash -LiteralPath $factory).Hash;scope='Actual sampler/tracker/transport with authored observations; verbatim retained managed factory and authored vector, no live SHVDNE/native runtime';sources=@($sources|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash}})}
$receipt|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $output 'validation.json') -Encoding utf8
