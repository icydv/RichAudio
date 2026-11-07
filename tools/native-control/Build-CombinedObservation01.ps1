#requires -Version 7.0
param([Parameter(Mandatory)][string]$SdkPath,[Parameter(Mandatory)][string]$Output,[switch]$AuthoredFocus)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$private=Join-Path $repo '.local'
$out=[IO.Path]::GetFullPath($Output)
if(!$out.StartsWith($private+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Use a fresh private repository output directory'}
for($part=[IO.DirectoryInfo]::new($out);$null-ne$part;$part=$part.Parent){if($part.Exists-and($part.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
$sdk=(Resolve-Path -LiteralPath $SdkPath).Path
if((Get-FileHash -LiteralPath $sdk).Hash-ne'5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0'){throw 'Exact retained private RPH SDK required'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$transport=@('CameraBasis.cs','ListenerProtocol.cs','StatePipe.cs','PipeDeadline.cs','GameplayProtocol.cs')|ForEach-Object{Join-Path $repo "src/acoustics/host/Transport/$_"}
$sessionDir=Split-Path -Parent $out
$buildConfig=Join-Path $out 'ObservationBuild.cs'
$literal=$sessionDir.Replace('"','""')
[IO.File]::WriteAllText($buildConfig,('namespace RichAudio { internal static class ObservationBuild { internal const string SessionDirectory = @"'+$literal+'"; } }'))
$plugin=@((Join-Path $repo 'src/acoustics/bridge/Rph/CameraSampler.Rph.cs'),(Join-Path $PSScriptRoot 'CombinedObservation.Rph.cs'),(Join-Path $PSScriptRoot 'ReadVehicleHorn.Rph.cs'),(Join-Path $PSScriptRoot 'ObservationKeys.Rph.cs'),(Join-Path $PSScriptRoot 'ObservationSession.cs'),$buildConfig)
$receiver=Join-Path $PSScriptRoot 'CombinedObservationReceiver.cs'
$dll=Join-Path $out 'RichAudio.CombinedObservation.dll'
$exe=Join-Path $out 'RichAudio.ObservationReceiver.exe'
$pins=Get-FileHash -LiteralPath ($transport+$plugin+@($receiver,$PSCommandPath,$sdk,$compiler))
$common=@('/nologo','/platform:x64','/langversion:5','/warnaserror+','/optimize+','/r:System.Runtime.Serialization.dll')
$defines=if($AuthoredFocus){'/define:COMBINED_OBSERVATION,OBSERVATION_AUTHORED_FOCUS'}else{'/define:COMBINED_OBSERVATION'}
& $compiler @common /target:library $defines /r:Microsoft.CSharp.dll /r:System.Windows.Forms.dll ('/r:'+$sdk) ('/out:'+$dll) @transport @plugin
if($LASTEXITCODE){throw 'Observation plugin compile failed'}
& $compiler @common /target:exe ('/out:'+$exe) @transport $receiver
if($LASTEXITCODE){throw 'Observation receiver compile failed'}
foreach($pin in $pins){if((Get-FileHash -LiteralPath $pin.Path).Hash-cne$pin.Hash){throw 'Build inputs changed'}}
[ordered]@{sessionDirectory=$sessionDir;authoredFocus=[bool]$AuthoredFocus;sources=$pins;payloads=@(Get-FileHash -LiteralPath @($dll,$exe))}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $out 'build-pins.json') -Encoding utf8NoBOM
Write-Output $out
