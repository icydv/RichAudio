#requires -Version 7.5
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$NodeExecutable = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source,
    [ValidateRange(256, 13440)][int]$Blocks = 13440,
    [ValidateRange(1, 25)][int]$Population = 25,
    [switch]$Legacy
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
$prepared = & $node (Join-Path $repo 'tests/fixtures/PrepareClockedFleet02.mjs') $out $owner $node $audioHost $mode
if ($LASTEXITCODE) { throw 'Benchmark package preparation failed' }
$package = $prepared | ConvertFrom-Json -DateKind String
$files = @('src/acoustics/host','src/acoustics/recording','src/acoustics/observation','src/acoustics/geometry') |
    ForEach-Object { Get-ChildItem -LiteralPath (Join-Path $repo $_) -File -Recurse -Filter '*.cs' }
$files += @('tests/host/TestGameplay.cs','tests/fixtures/PrepareClockedFleet02.mjs','tests/fixtures/InstalledStaticCache01.mjs',
    'tests/fixtures/StreetGameplayPackage01.mjs','tools/Test-ClockedFleet02.ps1','tools/Test-Gameplay.ps1','tools/Build-AcousticsHost.ps1') |
    ForEach-Object { Get-Item -LiteralPath (Join-Path $repo $_) }
[ordered]@{
    sourceCommit = (& git -C $repo rev-parse HEAD)
    mode = $mode; requestedBlocks = $Blocks; requestedPopulation = $Population
    package = $package; node = (& $node --version)
    compiledAndRuntime = @($owner,$identity,$audioHost,$node,$compiler) | ForEach-Object { Get-FileHash -LiteralPath $_ }
    sources = $files | Get-FileHash
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'benchmark-inputs.json')
$previous = $env:RICHAUDIO_CLOCKED_FLEET_EVIDENCE02
$previousEpoch = $env:RICHAUDIO_AUTHORED_WORLD_EPOCH01
try {
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
    $counters = $driver.final.worker.acousticWorld.environmentalReadiness01.counters
    $sustained = ($driver.final.receivedBlocks - $driver.startBlocks) -ge $Blocks -and $producer.nonzeroBlocks -ge $Blocks
    $populationQualified = $Legacy -or ($driver.samples | Where-Object {
        $_.population.discovered -eq $Population -and $_.active -eq [Math]::Min(5, $Population)
    } | Select-Object -First 1)
    $sceneQualified = $counters.firstActivations -gt 0 -and $counters.replacements -gt 0
    $passed = $driver.reason -eq 'workload-complete' -and $driver.closed -and !$driver.final.failure -and
        $sustained -and $populationQualified -and $sceneQualified -and $producer.hardMisses -eq 0 -and
        $producer.overflowBlocks -eq 0 -and $driver.final.underflowFrames -eq 0 -and $driver.final.discardCadence.deferredCallbacks -eq 0
    [ordered]@{
        passed = $passed; reason = $driver.reason; closed = $driver.closed; producerReceipt = $producerFile
        blocks = $producer.blocks; nonzeroBlocks = $producer.nonzeroBlocks
        sustained = $sustained; populationQualified = [bool]$populationQualified; sceneQualified = $sceneQualified
        hardMisses = $producer.hardMisses; underflowFrames = $driver.final.underflowFrames
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'benchmark-result.json')
    if (!$passed) { throw 'Clocked benchmark failed its workload, render deadline, or ring delivery gate' }
} finally {
    $env:RICHAUDIO_CLOCKED_FLEET_EVIDENCE02 = $previous
    $env:RICHAUDIO_AUTHORED_WORLD_EPOCH01 = $previousEpoch
}
