param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop';$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh private integration output required'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$candidate=Join-Path $out 'Candidate.cs';'namespace RichAudio.NativeSuppression01 {internal static class Candidate {internal const string SourceCommit="AUTOMATED-DISPOSABLE-FIXTURE";}}'|Set-Content -LiteralPath $candidate
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll';$exe=Join-Path $out 'DisposableBridge10.exe'
$sources=@('tools/native-control/native-suppression08/IdleExperiment.cs','tools/native-control/native-suppression08/AutomaticRun.cs','tools/native-control/native-suppression10/LocalBridge.cs','tools/native-control/native-suppression01/IdleDecoratorRegistration.cs','tests/host/TestAutomaticNative08.cs','tests/host/DisposableBridge10.cs')|ForEach-Object {Join-Path $repo $_}
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /target:exe /main:DisposableBridge10 /langversion:5 /unsafe+ /warnaserror+ /nowarn:0649 /define:AUTOMATION_FIXTURES /r:System.Core.dll /r:System.Web.Extensions.dll ('/r:'+$api) ('/out:'+$exe) @sources $candidate
if($LASTEXITCODE){throw 'Readiness integration fixture compilation failed'}
Copy-Item -LiteralPath $api -Destination $out
& 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\toolchains\private03f-01\python\python.exe' -I -S -B (Join-Path $PSScriptRoot 'Test-Readiness10.py') (Join-Path $out 'execution') $exe
if($LASTEXITCODE){throw 'Readiness integration failed'}
