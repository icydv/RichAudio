[CmdletBinding()]
param([string]$Output='',[switch]$BuildOnly,[switch]$SkipBaseline)
$ErrorActionPreference='Stop'
$proofClock=[Diagnostics.Stopwatch]::StartNew()
$repo=Split-Path -Parent $PSScriptRoot
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$build=Join-Path $repo 'build\spatial-stability'
[IO.Directory]::CreateDirectory($build)|Out-Null
function Build-SpatialFixture([string]$Source,[string]$Executable){
 $sources=@(Get-ChildItem (Join-Path $Source 'src\acoustics\host\Windows') -Filter '*.cs'|ForEach-Object FullName)
 $sources+=@(Get-ChildItem (Join-Path $Source 'src\acoustics\host\Transport') -Filter '*.cs'|ForEach-Object FullName)
 $sources+=@(Get-ChildItem (Join-Path $Source 'src\acoustics\geometry') -Filter '*.cs'|ForEach-Object FullName)
 $sources+=@('GeometryObservation.cs','SurfaceAcquisition.cs','DiagnosticTile.cs')|ForEach-Object{Join-Path $Source ('src\acoustics\observation\'+$_)}
 $sources+=Join-Path $repo 'tests\geometry-live\GeometryIntegration.cs'
 $sources+=Join-Path $repo 'tests\geometry-live\SpatialStabilityIntegration.cs'
 & $compiler /nologo /optimize+ /warnaserror+ /unsafe+ /platform:x64 /langversion:5 /define:STATE_TRANSPORT,GEOMETRY_LIVE,GEOMETRY_FIXTURE /r:System.Runtime.Serialization.dll /r:System.Web.Extensions.dll /main:RichAudio.Beacon.Windows.SpatialStabilityIntegration ('/out:'+$Executable) @sources
 if($LASTEXITCODE-ne0){throw 'Actual spatial integration compilation failed'}
}
$exe=Join-Path $build 'RichAudio.Spatial.Tests.exe'
Build-SpatialFixture $repo $exe
if($BuildOnly){return}
if(!$Output){$Output=Join-Path $repo ('.local\spatial-stability-'+[guid]::NewGuid().ToString('N'))}
$Output=[IO.Path]::GetFullPath($Output);$prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'
if(!$Output.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Private repository .local output required'}
for($dir=[IO.DirectoryInfo]::new($Output);$null-ne$dir;$dir=$dir.Parent){if($dir.Exists-and($dir.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked fixture output rejected'}}
if(Test-Path -LiteralPath $Output){throw 'Fresh fixture output required'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$baseline='';$baselineExe=''
if(!$SkipBaseline){
 $baseline=Join-Path $Output 'original-source';$archive=Join-Path $Output 'original-source.zip'
 & git -C $repo archive --format=zip ('--output='+$archive) 247e7ff2af8f1670ba454ae303ba56cb4f16fb19
 if($LASTEXITCODE-ne0){throw 'Exact original baseline extraction failed'}
 Expand-Archive -LiteralPath $archive -DestinationPath $baseline
 $baselineFixture=Join-Path $baseline 'src\acoustics\host\Windows\HostListeningFixture.cs'
 $fixtureBefore=(Get-FileHash -LiteralPath $baselineFixture -Algorithm SHA256).Hash
 $fixtureText=[IO.File]::ReadAllText($baselineFixture)
 $oldDuration='Run(root,"open-road","harmonic",1,12,.20f'
 $newDuration='Run(root,"open-road","harmonic",1,60,.20f'
 if(([regex]::Matches($fixtureText,[regex]::Escape($oldDuration))).Count-ne1){throw 'Original test-only duration seam differs'}
 [IO.File]::WriteAllText($baselineFixture,$fixtureText.Replace($oldDuration,$newDuration),[Text.UTF8Encoding]::new($false))
 # Test transport seam only: the old worker already accepts this real context
 # via the native relay. Do not change original acoustics, guard or PCM framing.
 $baselineProducer=Join-Path $baseline 'tools\Run-Acoustics07.mjs'
 $before=(Get-FileHash -LiteralPath $baselineProducer -Algorithm SHA256).Hash
 $text=[IO.File]::ReadAllText($baselineProducer)
 $old="options.geometry && ['geometry-config','geometry','owned-sources'].includes(m.type)"
 $new="options.geometry && (['geometry-config','geometry','owned-sources'].includes(m.type)||(options.headless&&m.type==='listener-context-config'))"
 if(([regex]::Matches($text,[regex]::Escape($old))).Count-ne1){throw 'Original producer test transport seam differs'}
 $oldDelivery='      audioTime: renderer.frame / FS,'
 $newDelivery="      audioTime: renderer.frame / FS, delivery:options.headless?{maximumMs:0,basis:'controlled-fixture',reference:'deterministic-audio-frame-delivery'}:undefined,"
 if(([regex]::Matches($text,[regex]::Escape($oldDelivery))).Count-ne1){throw 'Original fixture delivery seam differs'}
 [IO.File]::WriteAllText($baselineProducer,$text.Replace($old,$new).Replace($oldDelivery,$newDelivery),[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText((Join-Path $Output 'baseline-transport-adapter.json'),(@{SourceCommit='247e7ff2af8f1670ba454ae303ba56cb4f16fb19';OriginalProducerSHA256=$before;HarnessProducerSHA256=(Get-FileHash -LiteralPath $baselineProducer -Algorithm SHA256).Hash;OriginalNativeFixtureSHA256=$fixtureBefore;HarnessNativeFixtureSHA256=(Get-FileHash -LiteralPath $baselineFixture -Algorithm SHA256).Hash;OnlyChanges='headless-only existing listener context/delivery evidence and test-only native maximum12s to60s for identical planned50s fixture; original worker/acoustics/guard/live60s unchanged';RemovedText=@($old,$oldDelivery,$oldDuration);AddedText=@($new,$newDelivery,$newDuration)}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
 $baselineExe=Join-Path $build 'RichAudio.Spatial.Baseline.Tests.exe'
 Build-SpatialFixture $baseline $baselineExe
}
$boundPaths=@('src/acoustics/engine/paths.mjs','src/acoustics/streaming/beacon-frequency.mjs','src/acoustics/streaming/beacon-output-trim.mjs','src/acoustics/streaming/causal.mjs','src/acoustics/streaming/listener-playout.mjs','src/acoustics/streaming/observed-live.mjs','src/acoustics/host/Windows/HostProgram.cs','src/acoustics/host/Windows/HostListeningFixture.cs','src/acoustics/host/Windows/GeometryRelayHost.cs','src/acoustics/host/Windows/HostShutdown.cs','tools/Run-Acoustics07.mjs','tools/Run-SpatialStabilityProof.mjs','tools/Run-SpatialNativeProof.mjs','tools/Test-SpatialStability.ps1','tests/fixtures/SpatialTrajectories.mjs','tests/geometry-live/SpatialStabilityIntegration.cs','tests/Test-SpatialMotionMetrics.mjs','tools/Check-ListenerStartup.mjs','tools/Check-GeometryRelay.mjs')
$moduleHashes=[ordered]@{}
foreach($path in $boundPaths){$moduleHashes[$path]=(Get-FileHash -LiteralPath (Join-Path $repo $path) -Algorithm SHA256).Hash}
$bindings=[ordered]@{SchemaVersion=1;OriginalCommit='247e7ff2af8f1670ba454ae303ba56cb4f16fb19';CurrentModuleSHA256=$moduleHashes;CurrentNativeFixtureSHA256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash;OriginalNativeFixtureSHA256=$(if($baselineExe){(Get-FileHash -LiteralPath $baselineExe -Algorithm SHA256).Hash}else{$null});Scope='Read-only source and fixture binding before actual-component proofs; no game or endpoint'}
[IO.File]::WriteAllText((Join-Path $Output 'source-bindings.json'),($bindings|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
& node --test (Join-Path $repo 'tests/Test-SpatialMotionMetrics.mjs')
if($LASTEXITCODE-ne0){throw 'Analytic continuity metric validation failed'}
& node (Join-Path $repo 'tools\Run-SpatialStabilityProof.mjs') (Join-Path $Output 'deterministic') $baseline
if($LASTEXITCODE-ne0){throw ('Actual deterministic spatial proof failed; evidence retained: '+$Output)}
& node (Join-Path $repo 'tools\Run-SpatialNativeProof.mjs') $repo (Join-Path $Output 'native') $exe $baseline $baselineExe
if($LASTEXITCODE-ne0){throw ('Actual native spatial proof failed; evidence retained: '+$Output)}
foreach($path in $boundPaths){if((Get-FileHash -LiteralPath (Join-Path $repo $path) -Algorithm SHA256).Hash-ne$moduleHashes[$path]){throw ('Proof source changed during run: '+$path)}}
if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash-ne$bindings.CurrentNativeFixtureSHA256){throw 'Compiled actual native fixture changed during proof'}
if($baselineExe-and(Get-FileHash -LiteralPath $baselineExe -Algorithm SHA256).Hash-ne$bindings.OriginalNativeFixtureSHA256){throw 'Compiled original native fixture changed during proof'}
[IO.File]::WriteAllText((Join-Path $Output 'proof-completion.json'),(@{SchemaVersion=1;ElapsedWallSeconds=$proofClock.Elapsed.TotalSeconds;CurrentModuleHashesIndependentlyReverified=$true;CompiledFixtureHashesIndependentlyReverified=$true;GameLaunched=$false;AudioEndpointOpened=$false}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Write-Output ('DEVICE-FREE spatial stability proof: '+$Output+'; elapsedWallSeconds='+$proofClock.Elapsed.TotalSeconds.ToString('F3',[Globalization.CultureInfo]::InvariantCulture))
