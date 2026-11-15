param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop';$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path $out)){throw 'Fresh private SDK fixture output required'}
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll';if((Get-FileHash $api -Algorithm SHA256).Hash.ToLowerInvariant()-cne'1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48'){throw 'SDK drift'}
New-Item -ItemType Directory -Path $out|Out-Null
$sources=@('tools/native-control/native-suppression07/IdleExperiment.cs','tools/native-control/native-suppression07/AutomaticRun.cs','tools/native-control/native-suppression07/IdleNativeApi.cs','tools/native-control/native-suppression01/IdleDecoratorRegistration.cs','tests/host/TestAutomaticSdk07.cs')|ForEach-Object {Join-Path $repo $_}
$exe=Join-Path $out 'TestAutomaticSdk07.exe';$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:exe /langversion:5 /optimize+ /unsafe+ /warnaserror+ /nowarn:0649 ('/r:'+$api) ('/out:'+$exe) @sources
if($LASTEXITCODE){throw 'SDK fixture compile failed'}
Copy-Item -LiteralPath $api -Destination $out
$result=& $exe 2>&1;$code=$LASTEXITCODE;$result|Set-Content (Join-Path $out 'result.txt');$result|Write-Output
$pins=@($sources)+@($api,$csc,$exe,$PSCommandPath)|ForEach-Object {@{path=$_;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}}
@{passed=($code-eq0);schema='NativeSuppression07RetainedSdkArguments';artifacts=$pins;nativeCalls=0;gameLaunched=$false;coreLoaded=$false}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $out 'result.json');if($code){throw 'SDK argument tests failed'}
