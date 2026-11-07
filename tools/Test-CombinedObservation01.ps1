#requires -Version 7.0
param([Parameter(Mandatory)][string]$SdkPath,[Parameter(Mandatory)][string]$BuildPath)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/combined-observation-rehearsal-'+[Guid]::NewGuid().ToString('N'))
$sdk=(Resolve-Path -LiteralPath $SdkPath).Path
if((Get-FileHash -LiteralPath $sdk).Hash-ne'5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Exact retained private SDK required'}
$dll=Join-Path $BuildPath 'RichAudio.CombinedObservation.dll'
$receiver=Join-Path $BuildPath 'RichAudio.ObservationReceiver.exe'
$pins=Get-FileHash -LiteralPath @($dll,$receiver,$sdk)
$approved=(Get-Content -LiteralPath (Join-Path $BuildPath 'build-pins.json') -Raw|ConvertFrom-Json).payloads
foreach($p in $approved){if(@($pins|Where-Object {$_.Path-eq$p.Path-and$_.Hash-ceq$p.Hash}).Count-ne1){throw 'Payload does not match the original build'}}
[IO.Directory]::CreateDirectory($out)|Out-Null
Write-Output $out
$csc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$fake=Join-Path $out 'RagePluginHook.dll'
$loader=Join-Path $out 'Rehearsal.exe'
& $csc /nologo /target:library /platform:x64 /warnaserror+ ('/out:'+$fake) (Join-Path $repo 'tests/host/CombinedObservationFixtureRph.cs')
if($LASTEXITCODE){throw 'Authored runtime ABI build failed'}
if([Reflection.AssemblyName]::GetAssemblyName($fake).FullName-cne[Reflection.AssemblyName]::GetAssemblyName($sdk).FullName){throw 'RPH ABI fixture binding differs'}
& $csc /nologo /platform:x64 /warnaserror+ ('/r:'+$fake) ('/out:'+$loader) (Join-Path $repo 'tests/host/TestCombinedObservationLoad01.cs')
if($LASTEXITCODE){throw 'Loading harness build failed'}
& $loader discover $dll $sdk
if($LASTEXITCODE){throw 'Candidate type discovery failed'}
& $loader exercise $dll $receiver (Join-Path $out 'capture.jsonl')
if($LASTEXITCODE){throw 'Candidate entry point rehearsal failed'}
& $loader cutoff $dll $receiver (Join-Path $out 'cutoff.jsonl')
if($LASTEXITCODE){throw 'Candidate observation cutoff rehearsal failed'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath $pin.Path).Hash-cne$pin.Hash){throw 'Rehearsal inputs changed'}}
[ordered]@{authoredRuntime=$true;gameLaunched=$false;payloads=$pins;frames=Get-FileHash -LiteralPath (Join-Path $out 'capture.jsonl');cutoffFrames=Get-FileHash -LiteralPath (Join-Path $out 'cutoff.jsonl')}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8NoBOM
