param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop';$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path $out)){throw 'Fresh private fixture output required'}
New-Item -ItemType Directory -Path $out|Out-Null
$api=Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll';$candidate=Join-Path $out 'Candidate.cs'
'namespace RichAudio.NativeSuppression01 { internal static class Candidate {internal const string SourceCommit="AUTOMATED-DISPOSABLE-FIXTURE";} }'|Set-Content $candidate
$sources=@('tools/native-control/native-suppression08/IdleExperiment.cs','tools/native-control/native-suppression08/AutomaticRun.cs','tools/native-control/native-suppression09/LocalBridge.cs','tools/native-control/native-suppression01/IdleDecoratorRegistration.cs','tests/host/TestAutomaticNative08.cs','tests/host/DisposableBridge09.cs')|ForEach-Object {Join-Path $repo $_}
$exe=Join-Path $out 'DisposableBridge09.exe';$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:exe /main:DisposableBridge09 /langversion:5 /optimize+ /unsafe+ /warnaserror+ /nowarn:0649 /define:AUTOMATION_FIXTURES /r:System.Core.dll /r:System.Web.Extensions.dll ('/r:'+$api) ('/out:'+$exe) @sources $candidate
if($LASTEXITCODE){throw 'Disposable bridge compilation failed'}
Copy-Item -LiteralPath $api -Destination $out
$py='C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\toolchains\private03f-01\python\python.exe'
& $py -I -S -B (Join-Path $PSScriptRoot 'Test-External09.py') (Join-Path $out 'execution') $exe $py
if($LASTEXITCODE){throw 'External process tests failed'}
