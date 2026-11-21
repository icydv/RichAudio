#requires -Version 7.0
[CmdletBinding()]
param([ValidateRange(20,90)][int]$DurationSeconds=90)
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
$out=Join-Path $repo ('.local/playable-15/runtime-health-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($out)|Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
# This authored executable is an identity fixture. It is never launched.
$gameSource=Join-Path $out 'OriginalIdentity.cs';$game=Join-Path $out 'GTA5_Enhanced.exe'
[IO.File]::WriteAllText($gameSource,'[assembly:System.Reflection.AssemblyFileVersion("1.0.1158.16")] class OriginalIdentity {static void Main(){}}')
& $compiler /nologo /target:exe ('/out:'+$game) $gameSource;if($LASTEXITCODE){throw 'Authored identity compilation failed'}
& (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1') -OutputDirectory (Join-Path $out 'host');if($LASTEXITCODE){throw 'Host compilation failed'}
$sources=@('src/acoustics/host/Transport','src/acoustics/host/Windows','src/acoustics/recording','src/acoustics/geometry')|ForEach-Object{Get-ChildItem (Join-Path $repo $_) -Filter '*.cs'|ForEach-Object FullName}
$sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $repo ('src/acoustics/observation/'+$_)}
$test=Join-Path $out 'RuntimeHealth.exe'
& $compiler /nologo /target:exe /optimize+ /warnaserror+ /unsafe+ /langversion:5 /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:TestBatiRuntimeHealth01 ('/out:'+$test) @sources (Join-Path $repo 'tests/host/TestBatiRuntimeHealth01.cs');if($LASTEXITCODE){throw 'Health fixture compilation failed'}
$contract=Join-Path $out 'StatusWatch.Tests.exe'
& $compiler /nologo /target:exe /optimize+ /warnaserror+ /unsafe+ /langversion:5 /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:TestBatiHostStatusWatch01 ('/out:'+$contract) @sources (Join-Path $repo 'tests/host/TestBatiHostStatusWatch01.cs');if($LASTEXITCODE){throw 'Status contract compilation failed'}
& $contract $out;if($LASTEXITCODE){throw 'Status lifetime/race contract failed'}
$cadence=Join-Path $out 'Cadence.Tests.exe'
& $compiler /nologo /target:exe /optimize+ /warnaserror+ /unsafe+ /langversion:5 /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:TestGameplayFixtureCadence01 ('/out:'+$cadence) @sources (Join-Path $repo 'tests/host/TestGameplayFixtureCadence01.cs');if($LASTEXITCODE){throw 'Cadence build failed'}
& $cadence;if($LASTEXITCODE){throw 'Cadence regression failed'}
# Reproduce the credit-return dependency with the same bounded 120ms main-loop
# publication stall used for before/after evidence. No production delay exists.
$slowSource=Join-Path $out 'GameplayHost.SlowStatus.cs';$productionHost=Join-Path $repo 'src/acoustics/host/Windows/GameplayHost.cs'
$slowText=[IO.File]::ReadAllText($productionHost);$publish='PublishStatus("running");';if(!$slowText.Contains($publish)){throw 'Status control point changed'}
[IO.File]::WriteAllText($slowSource,$slowText.Replace($publish,'if(clock.ElapsedMilliseconds>=2000&&clock.ElapsedMilliseconds<2500)Thread.Sleep(120);PublishStatus("running");'))
$slowHost=Join-Path $out 'Host.SlowStatus.exe';$slowSources=@($sources|Where-Object{[IO.Path]::GetFileName($_)-cne'GameplayHost.cs'})+@($slowSource)
& $compiler /nologo /target:exe /optimize+ /warnaserror+ /unsafe+ /langversion:5 /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:RichAudio.Beacon.Windows.HostProgram ('/out:'+$slowHost) @slowSources;if($LASTEXITCODE){throw 'Slow publication regression build failed'}
$slowPackage=Join-Path $out 'slow-status-package'
& node (Join-Path $repo 'tests/fixtures/BatiRuntimePackage01.mjs') $slowPackage $slowHost $game;if($LASTEXITCODE){throw 'Slow publication package failed'}
& $test $slowPackage (Join-Path $out 'slow-status.json') 20;if($LASTEXITCODE){throw 'Credit return during slow publication failed; no duration retry'}
$package=Join-Path $out 'package'
& node (Join-Path $repo 'tests/fixtures/BatiRuntimePackage01.mjs') $package (Join-Path $out 'host/RichAudio.Acoustics.Host.exe') $game;if($LASTEXITCODE){throw 'Authored package failed'}
& $test $package (Join-Path $out 'duration.json') $DurationSeconds;$durationExit=$LASTEXITCODE
# Keep a dead-producer control even when the duration criterion fails.
& $test $package (Join-Path $out 'dead-producer.json') 20 kill-producer;$deadExit=$LASTEXITCODE
# Only this private host source copy withholds publication. Production never does.
$original=Join-Path $repo 'src/acoustics/host/Windows/GameplayHost.cs';$controlled=Join-Path $out 'GameplayHost.Withheld.cs'
$text=[IO.File]::ReadAllText($original);$needle='PublishStatus("running");';if(!$text.Contains($needle)){throw 'Publication injection point changed'}
[IO.File]::WriteAllText($controlled,$text.Replace($needle,'if(!File.Exists(Path.Combine(directory,"fixture-withhold-status")))PublishStatus("running");'))
$controlHost=Join-Path $out 'Host.Withheld.exe';$controlSources=@($sources|Where-Object{[IO.Path]::GetFileName($_)-cne'GameplayHost.cs'})+@($controlled)
& $compiler /nologo /target:exe /optimize+ /warnaserror+ /unsafe+ /langversion:5 /platform:x64 /define:STATE_TRANSPORT,GEOMETRY_LIVE /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /main:RichAudio.Beacon.Windows.HostProgram ('/out:'+$controlHost) @controlSources;if($LASTEXITCODE){throw 'Publication control compilation failed'}
$controlPackage=Join-Path $out 'withheld-package'
& node (Join-Path $repo 'tests/fixtures/BatiRuntimePackage01.mjs') $controlPackage $controlHost $game;if($LASTEXITCODE){throw 'Control package failed'}
& $test $controlPackage (Join-Path $out 'withheld-status.json') 20 withhold-status;$statusExit=$LASTEXITCODE
[ordered]@{durationExit=$durationExit;deadProducerExit=$deadExit;withheldStatusExit=$statusExit;durationSeconds=$DurationSeconds;endpointOpened=$false;authoredPcmOnly=$true;installedReads=$false;output=$out}|ConvertTo-Json|Set-Content (Join-Path $out 'checks.json')
Write-Output ('Retained all health checks: '+$out)
if($durationExit-or$deadExit-or$statusExit){throw 'A required health check failed; evidence retained; no retry.'}
