#requires -Version 7.5
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$NodeExecutable = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source,
    [ValidateRange(256, 13440)][int]$Blocks = 13440,
    [ValidateRange(1, 25)][int]$Population = 25,
    [switch]$CaptureOutput,
    [switch]$CaptureSoundMap,
    [switch]$PcmWitness,
    [switch]$Legacy,
    [string]$RetainedSourceManifest,
    [string]$RetainedWorld,
    [string]$WallPose,
    [string]$TrafficRoute,
    [switch]$WarmWall,
    [switch]$RankedReflections,
    [switch]$NpcSynthesisWorker,
    [switch]$X80Bandlimited,
    [switch]$CpuOnly,
    [switch]$MultiWall
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$out = [IO.Path]::GetFullPath($OutputDirectory)
$private = [IO.Path]::GetFullPath((Join-Path $repo '.local/street01')) + '\'
if (!$out.StartsWith($private, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $out)) {
    throw 'Supply a fresh private output directory under .local/street01'
}
for ($parent = Split-Path -Parent $out; $parent; $parent = Split-Path -Parent $parent) {
    if ((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Linked benchmark output refused'
    }
}
if ($Legacy -and $Population -ne 1) { throw 'Legacy comparison uses one vehicle' }
$retained = @($RetainedSourceManifest, $RetainedWorld, $WallPose | Where-Object { $_ }).Count
if ($retained -and ($retained -ne 3 -or $Legacy -or $Population -gt 5)) {
    throw 'The retained case needs the source manifest, world binding, wall pose, and one to five vehicles'
}
if ($RankedReflections -and !$MultiWall) { throw 'Ranked reflections require the multi-wall fleet fixture' }
if ($X80Bandlimited -and (!$retained -or !$TrafficRoute)) {
    throw 'The X80 source comparison needs retained banks and a route with the X80 player'
}
if ($NpcSynthesisWorker -and (!$retained -or !$MultiWall -or $Population -ne 5)) {
    throw 'The NPC synthesis worker comparison needs five vehicles and the retained multi-wall sources'
}
if ($CpuOnly -and !$MultiWall) { throw 'The explicit CPU comparison needs the multi-wall fixture' }
if ($TrafficRoute -and !$MultiWall) { throw 'The traffic route needs the retained multi-wall fixture' }
if ($WarmWall -and (!$retained -or (!$TrafficRoute -and $Population -eq 1) -or $Blocks -lt 768)) {
    throw 'The wall warm-up needs a retained fleet with at least 768 blocks. A single vehicle needs a traffic route.'
}
if ($MultiWall -and (!$retained -or $Blocks -lt 768)) {
    throw 'Multi-wall measurement needs retained inputs and at least 768 blocks for the stationary and moving phases'
}
$node = (Get-Item -LiteralPath $NodeExecutable).FullName
[IO.Directory]::CreateDirectory($out) | Out-Null
$owner = & (Join-Path $PSScriptRoot 'Test-Gameplay.ps1') -CompileObservationOwner (Join-Path $out 'authored-owner')
$hostBuild = Join-Path $out 'host-build'
& (Join-Path $PSScriptRoot 'Build-AcousticsHost.ps1') -OutputDirectory $hostBuild | Out-Host
$audioHost = Join-Path $hostBuild 'RichAudio.Acoustics.Host.exe'
$rphSource = Join-Path $out 'AuthoredRuntimeVersion.cs'
'[assembly:System.Reflection.AssemblyFileVersion("1.132.1428.17748")]' | Set-Content -LiteralPath $rphSource
$identity = Join-Path $out 'AuthoredRuntimeVersion.dll'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:library ('/out:' + $identity) $rphSource
if ($LASTEXITCODE) { throw 'Authored runtime identity compilation failed' }
$mode = if ($Legacy) { 'legacy' } else { 'fleet' }
$prepareArguments = @($out, $owner, $node, $audioHost, $mode)
if ($retained) {
    $prepareArguments += @($RetainedSourceManifest, $RetainedWorld, $WallPose | ForEach-Object { (Resolve-Path -LiteralPath $_).Path })
    if ($WarmWall) { $prepareArguments += 'warm-wall' }
    if ($TrafficRoute) { $prepareArguments += ('traffic-route=' + (Resolve-Path -LiteralPath $TrafficRoute).Path) }
    if ($RankedReflections) { $prepareArguments += 'ranked-reflections' }
    if ($NpcSynthesisWorker) { $prepareArguments += 'npc-synthesis-worker' }
    if ($X80Bandlimited) { $prepareArguments += 'x80-bandlimited' }
    if ($CpuOnly) { $prepareArguments += 'cpu-only' }
    if ($MultiWall) {
        & (Join-Path $PSScriptRoot 'Build-AcousticGpu.ps1') -OutputDirectory (Join-Path $out 'gpu-build') | Out-Host
        $prepareArguments += 'multi-wall'
    }
}
$prepared = & $node (Join-Path $repo 'tests/fixtures/PrepareClockedFleet02.mjs') @prepareArguments
if ($LASTEXITCODE) { throw 'Benchmark package preparation failed' }
$package = $prepared | ConvertFrom-Json -DateKind String
$files = @('src/acoustics/host','src/acoustics/recording','src/acoustics/observation','src/acoustics/geometry') |
    ForEach-Object { Get-ChildItem -LiteralPath (Join-Path $repo $_) -File -Recurse -Filter '*.cs' }
$files += @('tests/host/TestGameplay.cs','tests/host/ClockedTrafficRoute.cs','tests/fixtures/PrepareClockedFleet02.mjs','tests/fixtures/InstalledStaticCache01.mjs',
    'tests/fixtures/StreetGameplayPackage01.mjs','tools/Test-ClockedFleet02.ps1','tools/Analyze-ClockedContributors.mjs','tools/Test-Gameplay.ps1','tools/Build-AcousticsHost.ps1') |
    ForEach-Object { Get-Item -LiteralPath (Join-Path $repo $_) }
if ($MultiWall) {
    $files += @('tools/Build-AcousticGpu.ps1','src/acoustics/gpu/AcousticGpu.cs','src/acoustics/gpu/FiniteCull.hlsl') |
        ForEach-Object { Get-Item -LiteralPath (Join-Path $repo $_) }
}
$witnessRequested = $CaptureSoundMap -or $PcmWitness -or $env:RICHAUDIO_CLOCKED_PCM_WITNESS -eq '1'
[ordered]@{
    sourceCommit = (& git -C $repo rev-parse HEAD)
    captureClockedOutput = [bool]($CaptureOutput -or $witnessRequested)
    sampleContributorPcm = $witnessRequested
    rankedReflections = [bool]$RankedReflections
    npcSynthesisWorker = [bool]$NpcSynthesisWorker
    x80Bandlimited = [bool]$X80Bandlimited
    requestedAcceleration = if ($MultiWall -and !$CpuOnly) { 'auto' } else { 'cpu' }
    captureSoundMap = [bool]$CaptureSoundMap
    mode = $mode; requestedBlocks = $Blocks; requestedPopulation = $Population; warmWall = [bool]$WarmWall; multiWall = [bool]$MultiWall
    package = $package; node = (& $node --version)
    compiledAndRuntime = @($owner,$identity,$audioHost,$node,$compiler) | ForEach-Object { Get-FileHash -LiteralPath $_ }
    sources = $files | Get-FileHash
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'benchmark-inputs.json')
$previous = $env:RICHAUDIO_CLOCKED_FLEET_EVIDENCE02
$previousEpoch = $env:RICHAUDIO_AUTHORED_WORLD_EPOCH01
$previousCapture = $env:RICHAUDIO_CLOCKED_CAPTURE_FRAMES
$previousWitness = $env:RICHAUDIO_CLOCKED_PCM_WITNESS
$previousMap = $env:RICHAUDIO_CLOCKED_SOUNDMAP
try {
    $env:RICHAUDIO_CLOCKED_SOUNDMAP = if ($CaptureSoundMap) { '1' } else { $null }
    if ($witnessRequested) { $env:RICHAUDIO_CLOCKED_PCM_WITNESS = '1' }
    if ($CaptureOutput -or $witnessRequested) {
        # Include the driver's startup and progress-timeout margins.
        $env:RICHAUDIO_CLOCKED_CAPTURE_FRAMES = [string]($Blocks * 512 + 24 * 48000)
    } else { $env:RICHAUDIO_CLOCKED_CAPTURE_FRAMES = $null }
    $env:RICHAUDIO_CLOCKED_FLEET_EVIDENCE02 = '1'
    $env:RICHAUDIO_AUTHORED_WORLD_EPOCH01 = $package.authoredWorldEpoch
    & $owner --own-fleet $package.root $identity $Blocks $Population
    $exitCode = $LASTEXITCODE
    [ordered]@{ exitCode = $exitCode; finishedUtc = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'benchmark-exit.json')
    if ($exitCode) { throw "Owned clocked benchmark exited with code $exitCode" }
    $driver = Get-Content -LiteralPath (Join-Path $package.root '.local/fleet-driver.json') -Raw | ConvertFrom-Json
    $producerFile = Join-Path $package.root ('.local/gameplay/' + $driver.session + '/clocked-fleet-producer.json')
    $producer = Get-Content -LiteralPath $producerFile -Raw | ConvertFrom-Json
    $witness = $null
    if ($witnessRequested) {
        $sessionDirectory = Split-Path -Parent $producerFile
        & $node (Join-Path $repo 'tools/Analyze-ClockedContributors.mjs') $sessionDirectory | Out-Host
        if ($LASTEXITCODE) { throw 'Clocked contributor receipt could not be verified' }
        $witness = Get-Content -LiteralPath (Join-Path $sessionDirectory 'clocked-contributor-result.json') -Raw | ConvertFrom-Json
    }
    $counters = $driver.final.worker.acousticWorld.environmentalReadiness01.counters
    $sustained = ($driver.final.receivedBlocks - $driver.startBlocks) -ge $Blocks -and $producer.nonzeroBlocks -ge $Blocks
    $populationQualified = $Legacy -or ($driver.samples | Where-Object {
        $_.population.discovered -eq $Population -and $_.active -eq [Math]::Min(5, $Population)
    } | Select-Object -First 1)
    $sceneQualified = $counters.firstActivations -gt 0 -and $counters.replacements -gt 0
    $reflected = if ($retained) { $producer.byActiveWithReflection."$Population" } else { $null }
    if ($retained -and !$TrafficRoute) { $sceneQualified = $sceneQualified -and $reflected.selectedWallBlocks -gt 0 }
    $phases = if ($MultiWall) { $producer.installedByActive."$Population" }
    if ($MultiWall) {
        $sceneQualified = $sceneQualified -and ($TrafficRoute -or $WarmWall -or $phases.stationary.multiBounceBlocks -gt 0) -and $phases.moving.multiBounceBlocks -gt 0
    }
    if ($TrafficRoute) {
        $expectedEnds = @($producer.routeEndpoints | Where-Object { $_.track -lt $Population })
        $missedEnds = @($expectedEnds | Where-Object { !$_.observedBlocks -or $_.nearestStartMeters -gt .3 -or $_.nearestEndMeters -gt .3 })
        $routeQualified = $driver.routeCompleted -and $expectedEnds.Count -ge $Population -and !$missedEnds.Count
        $trafficMotion = $producer.trafficMotionCoverage."$Population"
        $sceneQualified = $sceneQualified -and $routeQualified -and $trafficMotion.installedMultiBounceBlocks -gt 0
    }
    $passed = $driver.reason -eq 'workload-complete' -and $driver.closed -and !$driver.final.failure -and
        $sustained -and $populationQualified -and $sceneQualified -and $producer.hardMisses -eq 0 -and
        $producer.overflowBlocks -eq 0 -and $driver.final.underflowFrames -eq 0 -and $driver.final.discardCadence.deferredCallbacks -eq 0
    if ($MultiWall) { $passed = $passed -and $producer.allBlocks.throughPipeWriteMisses -eq 0 -and $producer.allBlocks.deliveredBlocks -eq $producer.blocks }
    if ($X80Bandlimited) {
        $passed = $passed -and $producer.preparation.sourceResamplingPreparation.quality -ceq 'bandlimited' -and
            ($driver.samples | Where-Object { $_.sourceStates | Where-Object { $_.sourceExcitation } } | Select-Object -First 1)
    }
    $workerQualified = $null
    if ($NpcSynthesisWorker) {
        $workerQualified = $producer.preparation.npcBlockReady.ready -and $producer.preparation.npcBlockReady.session -eq $driver.session -and $producer.npcSynthesisWorker.blocks -gt 0
        $passed = $passed -and $workerQualified
    }
    if ($witnessRequested) {
        $voices = [Math]::Min(5, $Population)
        $witnessQualified = $witness.exactPacketSamples -gt 0 -and !$witness.sinkPcmMismatches -and !$witness.unboundSamples -and $witness.maximum.active -eq $voices
        if ($TrafficRoute) { $witnessQualified = $witnessQualified -and $witness.fullyMovingMultiBounceSamplesByPopulation."$voices" -gt 0 }
        $passed = $passed -and $witnessQualified
    }
    [ordered]@{
        passed = $passed; reason = $driver.reason; closed = $driver.closed; producerReceipt = $producerFile
        blocks = $producer.blocks; nonzeroBlocks = $producer.nonzeroBlocks
        sustained = $sustained; populationQualified = [bool]$populationQualified; sceneQualified = $sceneQualified
        routeCompleted = $driver.routeCompleted; renderedRouteEndpoints = $producer.routeEndpoints
        hardMisses = $producer.hardMisses; underflowFrames = $driver.final.underflowFrames
        expiredSnapshots = $driver.final.expiredSnapshots; reflectedActivePopulation = $reflected
        throughPipeWriteMisses = $producer.allBlocks.throughPipeWriteMisses
        deferredCallbacks = $driver.final.discardCadence.deferredCallbacks; endpointOpened = $driver.final.endpointOpened
        installedAtRequestedPopulation = $phases
        trafficMotionCoverage = $trafficMotion
        npcSynthesisWorkerQualified = $workerQualified
        pcmWitnessQualified = $witnessQualified
    } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $out 'benchmark-result.json')
    if (!$passed) { throw 'Clocked benchmark failed its workload, render deadline, or ring delivery gate' }
} finally {
    $env:RICHAUDIO_CLOCKED_SOUNDMAP = $previousMap
    $env:RICHAUDIO_CLOCKED_PCM_WITNESS = $previousWitness
    $env:RICHAUDIO_CLOCKED_CAPTURE_FRAMES = $previousCapture
    $env:RICHAUDIO_CLOCKED_FLEET_EVIDENCE02 = $previous
    $env:RICHAUDIO_AUTHORED_WORLD_EPOCH01 = $previousEpoch
}
