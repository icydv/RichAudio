param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path $out)){throw 'Fresh private fixture output required'}
New-Item -ItemType Directory -Path $out|Out-Null
$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe';$sdk=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'
if((Get-FileHash $sdk).Hash.ToLowerInvariant()-cne'1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48'){throw 'Exact retained SDK required'}
$sources=@('IdleExperiment.cs','AutomaticRun.cs','IdleNativeApi.cs','SetupState.cs','SetupNativeApi.cs')|ForEach-Object{Join-Path $PSScriptRoot $_}
$sources+=@('tools/native-control/native-suppression01/IdleDecoratorRegistration.cs','tests/host/SetupGame11.cs','tests/host/TestAutomaticSetup11.cs')|ForEach-Object{Join-Path $repo $_}
$binary=Join-Path $out 'SetupFixtures11.exe'
$key=Join-Path $out 'test-only-public-key.bin';[IO.File]::WriteAllBytes($key,[Reflection.AssemblyName]::GetAssemblyName((Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet.asi')).GetPublicKey())
# Delay-signed test stand-in in this disposable fixture folder only; no private
# signing key, installation or runtime-authenticity claim. CLR4 full-trust test.
& $csc /nologo /target:library /langversion:5 /warnaserror+ /delaysign+ ('/keyfile:'+$key) ('/out:'+(Join-Path $out 'ScriptHookVDotNet.dll')) (Join-Path $repo 'tests/host/SdkStringPin11.cs')
if($LASTEXITCODE){throw 'Test-only SDK string lifetime service compile failed'}
& $csc /nologo /target:exe /platform:x64 /unsafe+ /langversion:5 /optimize+ /warnaserror+ /nowarn:0649 ('/r:'+$sdk) /r:System.Core.dll ('/out:'+$binary) @sources
if($LASTEXITCODE){throw 'Actual adapter fixture compilation failed'}
Copy-Item -LiteralPath $sdk -Destination $out
$runner=Join-Path $out 'run-fixtures.ps1'
[IO.File]::WriteAllText($runner,@'
param($directory)
$ErrorActionPreference='Stop'
# PowerShell 7 hosts the offline harness. The CLR4 mixed GTA core is never
# loaded, and no strong-name machine setting or verification policy is changed.
$null=[Reflection.Assembly]::LoadFrom((Join-Path $directory 'ScriptHookVDotNet.dll'))
$null=[Reflection.Assembly]::LoadFrom((Join-Path $directory 'ScriptHookVDotNet3.dll'))
$assembly=[Reflection.Assembly]::LoadFrom((Join-Path $directory 'SetupFixtures11.exe'))
exit ([int]$assembly.GetType('TestAutomaticSetup11').GetMethod('Main').Invoke($null,@()))
'@)
$text=& (Join-Path $PSHOME 'pwsh.exe') -NoProfile -File $runner $out 2>&1;$code=$LASTEXITCODE;$text|Set-Content (Join-Path $out 'result.txt');$text|Write-Output
$pins=@($sources)+@($sdk,$csc,$binary,$PSCommandPath,$runner,(Join-Path $PSHOME 'pwsh.exe'),(Join-Path $repo 'tests/host/SdkStringPin11.cs'),(Join-Path $out 'ScriptHookVDotNet.dll'))|ForEach-Object{@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}}
@{schema='NativeSuppression11ActualAdapterFixtures';passed=($code-eq0);gameLaunched=$false;runtimeQualified=$false;mixedGtaCoreExecuted=$false;testHost=[Runtime.InteropServices.RuntimeInformation]::FrameworkDescription;sdkStringLifetime='Disposable test-only stand-in for PinString, no native dispatcher or game/controller implementation; real retained SDK constructs all InputArgument objects; no machine verification setting changed';method='Authored delayed native responses; actual compiled runner/controller/adapter and retained SDK InputArgument conversions';artifacts=$pins;exitCode=$code}|ConvertTo-Json -Depth 6|Set-Content (Join-Path $out 'result.json')
if($code){throw 'Actual adapter fixtures failed'}
