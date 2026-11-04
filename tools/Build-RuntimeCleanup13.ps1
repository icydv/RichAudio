# Original Windows file lifetime controls; no installed/game/private input.
[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputRoot)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$output=[IO.Path]::GetFullPath($OutputRoot)
$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
if(!$output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $output)){throw 'Fresh private original fixture build required'}
for($at=[IO.Path]::GetDirectoryName($output);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture build refused'}}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$source=Join-Path $repo 'tests/fixtures/RuntimeCleanup13.cs'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sourceHash=Hash $source;$compilerHash=Hash $compiler
[IO.Directory]::CreateDirectory($output)|Out-Null
$exe=Join-Path $output 'runtime-cleanup13.exe'
& $compiler /nologo /target:exe /optimize+ /platform:x64 ('/out:'+$exe) $source *> (Join-Path $output 'compile.log')
if($LASTEXITCODE-ne0){throw 'Original cleanup fixture compile failed; retained without retry'}
if((Hash $source)-cne$sourceHash-or(Hash $compiler)-cne$compilerHash){throw 'Original fixture source/compiler drift'}
[ordered]@{kind='World13OriginalRuntimeCleanupFixtureBuild';sourceSHA256=$sourceHash;compilerSHA256=$compilerHash;exeSHA256=(Hash $exe);syntheticOnly=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $output 'build.json') -Encoding utf8NoBOM
Write-Output ('PASS compiled original cleanup fixture '+(Hash $exe))
