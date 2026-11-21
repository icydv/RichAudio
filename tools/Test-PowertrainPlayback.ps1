#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Manifest,
    [Parameter(Mandatory)][string]$OutputRoot
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$private = [IO.Path]::GetFullPath((Join-Path $repo '.local/audio-switch')) + [IO.Path]::DirectorySeparatorChar
$manifestPath = [IO.Path]::GetFullPath($Manifest)
$output = [IO.Path]::GetFullPath($OutputRoot)
if (!$manifestPath.StartsWith($private, [StringComparison]::OrdinalIgnoreCase) -or
    !$output.StartsWith($private, [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath $output)) {
    throw 'Use a private audio-switch manifest and a fresh private fixture directory'
}
foreach ($path in @($manifestPath, $output)) {
    for ($parent = $path; $parent; $parent = [IO.Path]::GetDirectoryName($parent)) {
        if ((Test-Path -LiteralPath $parent) -and
            ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Linked fixture path refused'
        }
    }
}

[void][IO.Directory]::CreateDirectory($output)
$sources = @(Get-ChildItem -LiteralPath (Join-Path $repo 'src/acoustics/host/Transport') -Filter '*.cs' |
    ForEach-Object FullName)
$sources += @(
    'src/acoustics/bridge/Integration/GameObservations.cs',
    'src/acoustics/bridge/Integration/CameraListenerTracker.cs',
    'src/acoustics/bridge/Shvdne/ShvdneGameSource.cs',
    'tools/native-control/audio-switch/PowertrainFrames.cs',
    'tools/native-control/audio-switch/PowertrainLink.cs',
    'tools/native-control/audio-switch/PowertrainHandoff.cs',
    'tools/native-control/audio-switch/Switch.cs',
    'tests/host/TestPowertrainPlayback.cs'
) | ForEach-Object { Join-Path $repo $_ }
$binary = Join-Path $output 'RichAudio.Powertrain.Playback.Tests.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sdk = Join-Path $repo '.local/shvdne-reference/release/ScriptHookVDotNet3.dll'
if ((Get-FileHash -LiteralPath $sdk).Hash -ne '1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48') {
    throw 'The exact SHVDNE API3 fixture dependency is required'
}
[IO.File]::Copy($sdk, (Join-Path $output 'ScriptHookVDotNet3.dll'))
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /r:System.Web.Extensions.dll /r:System.Runtime.Serialization.dll /define:POWERTRAIN_FIXTURE "/r:$output\ScriptHookVDotNet3.dll" "/out:$binary" @sources
if ($LASTEXITCODE -ne 0) { throw 'Powertrain playback fixture compilation failed' }
& $binary $manifestPath (Join-Path $output 'result.json') 2>&1 | Tee-Object -FilePath (Join-Path $output 'fixture.log')
if ($LASTEXITCODE -ne 0) { throw 'Device-free powertrain playback fixture failed' }
