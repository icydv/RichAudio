#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$ApiPath,
 [string]$OutputDirectory
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$api=[IO.Path]::GetFullPath($ApiPath)
$expected='1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48'
if((Get-FileHash -LiteralPath $api -Algorithm SHA256).Hash.ToLowerInvariant()-cne$expected){throw 'Exact retained SHVDNE API identity required'}
if(!$OutputDirectory){$OutputDirectory=Join-Path $repo ('.local/native-suppression-fixes/deletion-argument-'+[Guid]::NewGuid().ToString('N'))}
$out=[IO.Path]::GetFullPath($OutputDirectory)
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
if(!$out.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Use a fresh task-private output directory'}
for($at=$out;$at;$at=[IO.Path]::GetDirectoryName($at)){
 if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output path refused'}
}
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources=@('tools/native-control/native-suppression06/IdleExperiment.cs','tools/native-control/native-suppression06/IdleNativeApi.cs','tools/native-control/native-suppression01/IdleDecoratorRegistration.cs','tests/host/TestNativeIdleDeletionArgument01.cs')|ForEach-Object {Join-Path $repo $_}
$binary=Join-Path $out 'TestNativeIdleDeletionArgument01.exe'
# Only the managed API is copied. The mixed-mode core and ScriptHookV are absent;
# unexpected dependency resolution is also refused by the test executable.
$copiedApi=Join-Path $out 'ScriptHookVDotNet3.dll'
Copy-Item -LiteralPath $api -Destination $copiedApi
& $compiler /nologo /optimize+ /unsafe+ /warnaserror+ /langversion:5 /platform:x64 /target:exe /r:System.Core.dll ('/r:'+$copiedApi) ('/out:'+$binary) @sources
if($LASTEXITCODE-ne0){throw 'Real API deletion argument regression compilation failed'}
$result=& $binary 2>&1
$testExit=$LASTEXITCODE
$result|ForEach-Object {Write-Output $_}
[IO.File]::WriteAllText((Join-Path $out 'result.txt'),($result -join "`n"),[Text.UTF8Encoding]::new($false))
$pins=@($sources)+@($api,$copiedApi,$compiler,$binary,$PSCommandPath)|ForEach-Object {@{path=$_;bytes=(Get-Item -LiteralPath $_).Length;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}}
[IO.File]::WriteAllText((Join-Path $out 'result.json'),(@{passed=($testExit-eq0);exitCode=$testExit;kind='exact-retained-api-owned-stack-argument-only';nativeDispatches=0;gameLaunched=$false;liveDeletionQualified=$false;artifacts=$pins}|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output ('Evidence: '+$out)
if($testExit-ne0){throw 'Real API deletion argument regression failed'}
