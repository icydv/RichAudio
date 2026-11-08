#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot='')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(!$OutputRoot){$OutputRoot=Join-Path $repo ('.local/street01/functional-'+[Guid]::NewGuid().ToString('N'))}
$out=[IO.Path]::GetFullPath($OutputRoot)
$prefix=[IO.Path]::GetFullPath((Join-Path $repo '.local/street01')).TrimEnd('\')+'\'
if(!$out.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'New isolated .local/street01 output required'}
for($at=$out;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked original-fixture output refused'}}
[IO.Directory]::CreateDirectory((Join-Path $out 'logs'))|Out-Null
$node=(Get-Command node -ErrorAction Stop).Source
$pwsh=(Get-Process -Id $PID).Path
$nodeFiles=@(
 'tests/Test-AirflowStreet01.mjs','tests/Test-AirflowStreet01Review.mjs',
 'tests/Test-StreetGameplayWorker01.mjs','tests/Test-StreetLatencyProfile01.mjs','tests/Test-LowLatency01.mjs',
 'tests/Test-StartupServiceStreet01.mjs','tests/Test-StartupService01Review.mjs',
 'tests/Test-IndexedWorldGeometry01.mjs','tests/Test-InstalledStaticSceneStreet01.mjs',
 'tests/Test-InstalledSceneService01.mjs','tests/Test-InstalledSceneAdmission01.mjs',
 'tests/Test-InstalledSceneLifecycle01.mjs','tests/Test-SceneWorkerProgress01.mjs','tests/Test-PreparedWorldMetadata01.mjs','tests/Test-InstalledStaticReuse01.mjs','tests/Test-ResponsiveScene01.mjs',
 'tests/Test-SceneReadinessPolicy01.mjs','tests/Test-SceneReadinessService01.mjs','tests/Test-ConsumerReadiness01.mjs',
 'tests/Test-SoundMapSceneDemand01.mjs','tests/Test-GameplaySoundMapDemand01.mjs',
 'tests/Test-NormalReadinessCacheFailure01.mjs','tests/Test-CacheResidencyTimeline01.mjs','tests/Test-CacheResidencyLog01.mjs','tests/Test-DeepFreezeReuse01.mjs',
 'tests/Test-CachePressure01.mjs','tests/Test-CachePressureConsumer01.mjs','tests/Test-StaticPreparationLifecycle01.mjs',
 'tests/Test-PreparedInstalledTransfer01.mjs','tests/Test-AnalyticPrimitives01.mjs',
 'tests/Test-AnalyticCollisionCache01.mjs','tests/Test-InstalledCollision.mjs',
 'tests/Test-AnalyticCollisionProgress01.mjs',
 'tests/Test-WorldResourceIdentity01.mjs',
 'tests/Test-SoundMapInstalledWorkset01.mjs','tests/Test-SoundMapTelemetry.mjs',
 'tests/Test-SoundMapService.mjs','tests/Test-SoundMapViewer.mjs','tests/Test-SoundMapProducer.mjs',
 'tests/Test-AcousticWorld01Continuity.mjs','tests/Test-SourcePressureCalibration.mjs',
 'tests/Test-StockPressureSelection.mjs','tests/Test-VehiclePipeline.mjs',
 'tests/Test-ProcessingRolesStreet01.mjs','tests/Test-ProcessingRoleIntegrationStreet01.mjs',
 'tests/Test-InitialWorldPriority01.mjs','tests/Test-AcousticGpuPages01.mjs',
 'tests/Test-AtomicPublication01.mjs',
 'tests/Test-ColdNpcHistory01.mjs','tests/Test-ColdNpcFailureRetention01.mjs',
 'tests/Test-Synthesis12.mjs',
 'tests/Test-WorldCompletion01.mjs','tests/Test-WorldStartupCompletion01.mjs','tests/Test-WorldValidationEpochOrderingCompletion01.mjs',
 'tests/Test-NormalReadinessReader01.mjs','tests/Test-NormalWorldReadiness01.mjs','tests/Test-NormalReadinessVerdict01.mjs',
 'tests/Test-NormalStartupPublication01.mjs',
 'tests/Test-NativeSupportBoundsCompletion01.mjs','tests/Test-InteriorPlacementCompletion01.mjs'
)
$scripts=@(
 @{name='production-pipe-completion-lifetime';file='tools/Test-PipeDeadlineLifetime01.ps1';arguments=@()},
 @{name='product-capture-continuity';file='tools/Test-StreetContinuity01.ps1';arguments=@()},
 @{name='preparation-only-initial-pose';file='tools/Test-InitialPreparationOffer01.ps1';arguments=@()},
 @{name='persisted-settings-handoff';file='tools/Test-AcousticSettingsHandoff.ps1';arguments=@()},
 @{name='sidebar-input-status-animation';file='tools/Test-InGameMenu.ps1';arguments=@('-Output',(Join-Path $out 'original-menu-previews'))},
 @{name='recording-menu-bridge';file='tools/Test-SoundMapMenu.ps1';arguments=@()},
 @{name='passive-map-bridge';file='tools/Test-PassiveSoundMap.ps1';arguments=@()},
 @{name='production-capture-fake-backend';file='tools/Test-GameplayRecording13.ps1';arguments=@()},
 @{name='supported-initializer-original-api';file='tests/Test-CodeWalkerInitialization01.ps1';arguments=@()},
 @{name='normal-generated-sidecar-supervisor';file='tests/Test-WorldWarmupStartup.ps1';arguments=@()},
 @{name='street-source-installation';file='tests/Test-StreetInstaller01.ps1';arguments=@()},
 @{name='street-owned-continuation';file='tests/Test-StreetWarmupContinuation01.ps1';arguments=@()},
 @{name='production-continuation-checkpoint';file='tests/Test-WorldContinuationCheckpoint01.ps1';arguments=@()},
 @{name='retained-bati-graph';file='tests/Test-BatiMetadataGraph01.ps1';arguments=@()},
 @{name='mlo-placement-projection';file='tests/Test-MloPlacementProjectionCompletion01.ps1';arguments=@()},
 @{name='disabled-native-diagnostic-fixture';file='tools/Test-StreetTrackedDiagnostic01.ps1';arguments=@('-FixtureOnly')},
 @{name='passive-candidate-transaction';file='tests/Test-StreetTrackedCandidate01.ps1';arguments=@()},
 @{name='normal-qualification-entrypoints';file='tests/Test-NormalReadinessLauncher01.ps1';arguments=@()},
 @{name='catalogue-publication-lifecycle';file='tests/Test-CatalogPublication01.ps1';arguments=@()},
 @{name='catalogue-publication-legacy';file='tests/Test-CatalogPublicationLegacy01.ps1';arguments=@()},
 @{name='resolver-publication';file='tests/Test-ResolverPublication01.ps1';arguments=@()},
 @{name='passive-session-supervision';file='tests/Test-StreetTrackedSupervision01.ps1';arguments=@()}
)
$requiredSteps=1+$scripts.Count
$inputFiles=@($PSCommandPath)+@($nodeFiles|ForEach-Object{Join-Path $repo $_})+@($scripts|ForEach-Object{Join-Path $repo $_.file})
$pins=@($inputFiles|Select-Object -Unique|ForEach-Object{[ordered]@{path=$_.Substring($repo.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}})
$started=[DateTime]::UtcNow.ToString('o');$steps=[Collections.Generic.List[object]]::new();$sourcePinsUnchanged=$false
function SaveReceipt {
 $value=[ordered]@{schema=1;kind='STREET-01-original-only-functional';startedUtc=$started;updatedUtc=[DateTime]::UtcNow.ToString('o');nodeVersion=(& $node --version);head=(& git -C $repo rev-parse HEAD);passed=($sourcePinsUnchanged-and$steps.Count-eq$requiredSteps-and@($steps|Where-Object exitCode -ne 0).Count-eq0);sourcePinsUnchanged=$sourcePinsUnchanged;steps=@($steps.ToArray());testRunnerPins=$pins;installedGameResourcesRead=$false;vendorBinaryRequired=$false;gameLaunched=$false;endpointOpened=$false;realPlaybackOrCapture=$false;gpuHardwareQualified=$false;functionalChecksOnly=$true;completePerformanceAcceptance=$false;inheritedPerformanceGates='Existing offline.yml and 8ms/10.6667ms checks remain separate and unchanged; this receipt cannot override them';populationAccounting='Node TAP tests and individual C# fixture cases remain separate; assertion counts are not combined'}
 $value|ConvertTo-Json -Depth 9|Set-Content -LiteralPath (Join-Path $out 'receipt.json') -Encoding utf8
}
function RunOriginal([string]$Name,[string]$Command,[string[]]$Arguments){
 $log=Join-Path $out ('logs/'+$Name+'.log');$clock=[Diagnostics.Stopwatch]::StartNew();$code=-1;$failure=$null
 try{& $Command @Arguments 2>&1|Tee-Object -FilePath $log;$code=$LASTEXITCODE}catch{$failure=$_.Exception.Message;$_|Out-String|Add-Content -LiteralPath $log -Encoding utf8}
 $steps.Add([ordered]@{name=$Name;exitCode=$code;elapsedMilliseconds=$clock.Elapsed.TotalMilliseconds;failure=$failure;log=('logs/'+$Name+'.log');sha256=(Get-FileHash -LiteralPath $log -Algorithm SHA256).Hash.ToLowerInvariant()});SaveReceipt
}
Push-Location $repo
try{
 SaveReceipt
 RunOriginal 'node-functional' $node (@('--test','--test-reporter=tap','--test-concurrency=1')+$nodeFiles)
 foreach($script in $scripts){RunOriginal $script.name $pwsh (@('-NoProfile','-NonInteractive','-File',(Join-Path $repo $script.file))+$script.arguments)}
 foreach($pin in $pins){if((Get-FileHash -LiteralPath (Join-Path $repo $pin.path) -Algorithm SHA256).Hash.ToLowerInvariant()-cne$pin.sha256){throw ('Functional runner source changed while executing: '+$pin.path)}}
 $sourcePinsUnchanged=$true
 SaveReceipt
 if(@($steps|Where-Object exitCode -ne 0).Count){throw ('STREET-01 functional failure retained in '+(Join-Path $out 'receipt.json'))}
 Write-Output ('PASS separate STREET-01 original-only functional populations; '+(Join-Path $out 'receipt.json'))
}finally{Pop-Location;SaveReceipt}
