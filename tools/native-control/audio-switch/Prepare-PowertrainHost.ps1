#requires -Version 7.0
[CmdletBinding()]
param(
    [string]$HostExecutable,
    [string]$OutputRoot,
    [string]$RetainedManifest = 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\migration-shvdne-01\final-private-package-02\scripts\RichAudio\payload\playable.json'
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$privateRoot = Join-Path $repo '.local/audio-switch'
if (!$HostExecutable) { $HostExecutable = Join-Path $repo 'build/acoustics-host/RichAudio.Acoustics.Host.exe' }
if (!$OutputRoot) { $OutputRoot = Join-Path $privateRoot 'powertrain-host' }
$output = [IO.Path]::GetFullPath($OutputRoot)
if (!$output.StartsWith($privateRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath $output)) { throw 'A fresh private audio-switch output directory is required.' }

function Hash([string]$Path) { (Get-FileHash -LiteralPath $Path).Hash.ToLowerInvariant() }
function Unlinked([string]$Path) {
    for ($at = [IO.Path]::GetFullPath($Path); $at; $at = [IO.Path]::GetDirectoryName($at)) {
        if ((Test-Path -LiteralPath $at) -and ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Linked package path: $at"
        }
    }
}
function CopyPayload([string]$Source, [string]$Relative) {
    $target = [IO.Path]::GetFullPath((Join-Path $output $Relative))
    if ([IO.Path]::IsPathRooted($Relative) -or !$target.StartsWith($output + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Package path escaped: $Relative"
    }
    Unlinked $Source
    Unlinked $target
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
    [IO.File]::Copy($Source, $target, $false)
}
function WriteJson([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 40), [Text.UTF8Encoding]::new($false))
}

Unlinked $RetainedManifest
Unlinked $output
Unlinked $HostExecutable
$expectedManifest = '4d27d6fcc47556532efe4011891bb7feeee2c3d298c348377a64ddbd835f9289'
if ((Hash $RetainedManifest) -cne $expectedManifest) { throw 'Retained SHVDNE playable manifest identity differs.' }
if (![IO.File]::Exists($HostExecutable)) { throw 'Build the current external acoustics host first.' }
$oldRoot = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($RetainedManifest))
$old = Get-Content -LiteralPath $RetainedManifest -Raw | ConvertFrom-Json -AsHashtable
if ((Hash $old.gameExecutable) -cne $old.gameSha256) { throw 'The installed Enhanced executable differs.' }
function VerifiedRetained([string]$Relative) {
    $pins = @($old.bindings | Where-Object file -CEQ $Relative)
    $source = [IO.Path]::GetFullPath((Join-Path $oldRoot $Relative))
    if ($pins.Count -ne 1 -or !$source.StartsWith($oldRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "No exact retained binding: $Relative"
    }
    Unlinked $source
    if ((Hash $source) -cne $pins[0].sha256) { throw "Retained asset differs: $Relative" }
    return $source
}

$player = Get-Content -LiteralPath (VerifiedRetained $old.playerManifest) -Raw | ConvertFrom-Json -AsHashtable
$bati = @($player.vehicles | Where-Object model -CEQ 'bati')
if ($bati.Count -ne 1 -or $bati[0].provenance.awcSha256 -ine '1a1a43aea31f3e4e4c1dd3355a0751c0a7031ee396ffa76353c174d808cc6c5e') {
    throw 'Exact retained six-layer Bati player bank required.'
}
$player.vehicles = $bati
$retained = @(
    'runtime/node.exe', 'runtime/NODE-LICENSE.txt', $old.npcManifest,
    $old.catalog, $old.profiles, $old.atlas, 'sources/player/analysis-intervals.json'
)
foreach ($role in 'engine','exhaust') {
    foreach ($mode in 'idle','accel','decel') {
        $retained += 'sources/player/' + $bati[0].layers[$role][$mode].file
    }
}
foreach ($relative in $retained) { CopyPayload (VerifiedRetained $relative) $relative }
WriteJson (Join-Path $output $old.playerManifest) $player
CopyPayload $HostExecutable 'runtime/RichAudio.Acoustics.Host.exe'
$modules = @(Get-ChildItem (Join-Path $repo 'src/acoustics') -Recurse -File -Filter '*.mjs') +
    @(Get-ChildItem (Join-Path $repo 'tools/soundmap') -Recurse -File) +
    @('tools/Run-Gameplay.mjs','config/vehicle-loudness-policy.json','tools/acoustics-06-scenes.mjs',
      'tools/acoustics-08-2-scenes.mjs','tests/fixtures/acoustics-scenes.mjs' | ForEach-Object { Get-Item (Join-Path $repo $_) })
foreach ($module in $modules) {
    CopyPayload $module.FullName ([IO.Path]::GetRelativePath($repo,$module.FullName))
}
$manifest = $old
$manifest.powertrainVoice = 'bati-player-on-adder'
$manifest.acousticWorld = $false
$manifest.eligible = @(@{model = [uint32]0xb779a091L; context = 'player'; name = 'adder'})
$manifest.sourcePolicy = 'Bati development voice on ADDER telemetry'
$manifest.bindings = @(Get-ChildItem -LiteralPath $output -Recurse -File | Sort-Object FullName | ForEach-Object {
    @{file = [IO.Path]::GetRelativePath($output,$_.FullName).Replace('\','/'); sha256 = Hash $_.FullName}
})
if ($manifest.bindings.Count -gt 512) { throw 'Private payload exceeds the playable manifest binding limit.' }
$path = Join-Path $output 'playable.json'
WriteJson $path $manifest
$manifestHash = Hash $path
$hostHash = Hash (Join-Path $output 'runtime/RichAudio.Acoustics.Host.exe')
# Only this pointer travels with the switch DLL to scripts in an approved run.
# The external payload and its source samples stay in the private workspace.
$pointer = Join-Path $output 'RichAudio.Powertrain.json'
WriteJson $pointer @{Schema = 1; Manifest = $path; ManifestSha256 = $manifestHash; HostSha256 = $hostHash}
[pscustomobject]@{
    manifest = $path; manifestSha256 = $manifestHash; retainedManifestSha256 = $expectedManifest
    hostSha256 = $hostHash; optIn = $pointer; optInSha256 = Hash $pointer
    donor = $manifest.sourcePolicy; voiceAwcSha256 = $bati[0].provenance.awcSha256
    bindings = $manifest.bindings.Count
}
