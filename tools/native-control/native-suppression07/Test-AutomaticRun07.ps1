param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path $out)){throw 'Fresh private fixture output required'}
New-Item -ItemType Directory -Path $out|Out-Null
$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$sources=@('tools/native-control/native-suppression07/IdleExperiment.cs','tools/native-control/native-suppression07/AutomaticRun.cs','tests/host/TestAutomaticNative07.cs')|ForEach-Object {Join-Path $repo $_}
$binary=Join-Path $out 'AutomaticFixtures.exe'
& $csc /nologo /target:exe /langversion:5 /optimize+ /warnaserror+ /nowarn:0649 ('/out:'+$binary) @sources
if($LASTEXITCODE){throw 'Automatic fixture compilation failed'}
$text=& $binary 2>&1;$code=$LASTEXITCODE;$text|Set-Content (Join-Path $out 'result.txt');$text|Write-Output
$pins=@($sources)+@($csc,$binary,$PSCommandPath)|ForEach-Object {@{path=$_;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}}
@{schema='NativeSuppression07AutomaticFixtures';passed=($code-eq0);gameLaunched=$false;runtimeQualified=$false;artifacts=$pins;exitCode=$code}|ConvertTo-Json -Depth 6|Set-Content (Join-Path $out 'result.json')
if($code){throw 'Automatic fixtures failed'}
