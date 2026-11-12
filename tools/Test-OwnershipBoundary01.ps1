#requires -Version 7.0
[CmdletBinding()]
param([string]$Output)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$allowed = [IO.Path]::GetFullPath((Join-Path $repo '.local/gate-a-ownership-01'))
if (-not $Output) { $Output = Join-Path $allowed ('boundary-build-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffff')) }
if (-not [IO.Path]::IsPathRooted($Output)) { $Output = Join-Path $repo $Output }
$out = [IO.Path]::GetFullPath($Output)
if (-not $out.StartsWith($allowed + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Output must be a fresh child of .local/gate-a-ownership-01' }
if (Test-Path -LiteralPath $out) { throw 'Fresh output required; prior receipts are immutable' }
for ($parent = $out; $parent; $parent = [IO.Path]::GetDirectoryName($parent)) {
    if ((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked output path refused' }
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sourceRoot = Join-Path $repo 'src/acoustics/ownership/Boundary01'
$sources = @('AssemblyInfo.cs', 'OwnershipBoundary.cs', 'ReplacementReadiness.cs') | ForEach-Object { Join-Path $sourceRoot $_ }
$tests = @('TestOwnershipBoundary01.cs', 'TestReplacementReadiness01.cs', 'TestOwnershipProduction01.cs') | ForEach-Object { Join-Path $repo ('tests/host/' + $_) }
foreach ($path in @($compiler) + $sources + $tests) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing input: $path" } }
New-Item -ItemType Directory -Path $out | Out-Null
$binary = Join-Path $out 'RichAudio.Ownership.Boundary01.dll'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:library /r:System.Core.dll ('/out:' + $binary) @sources
if ($LASTEXITCODE) { throw 'Production boundary compilation failed' }
foreach ($name in @('TestOwnershipBoundary01', 'TestReplacementReadiness01')) {
    $fixture = Join-Path $out ($name + '.exe')
    $test = Join-Path $repo ('tests/host/' + $name + '.cs')
    & $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:exe /define:OWNERSHIP_FIXTURES /r:System.Core.dll ('/main:' + $name) ('/out:' + $fixture) @sources $test
    if ($LASTEXITCODE) { throw "Fixture compilation failed: $name" }
    & $fixture 2>&1 | Tee-Object -FilePath (Join-Path $out ($name + '.log'))
    if ($LASTEXITCODE) { throw "Fixture failed: $name" }
}
$productionFixture = Join-Path $out 'TestOwnershipProduction01.exe'
& $compiler /nologo /optimize+ /warnaserror+ /langversion:5 /platform:x64 /target:exe /r:System.Core.dll ('/r:' + $binary) ('/out:' + $productionFixture) $tests[2]
if ($LASTEXITCODE) { throw 'Production surface fixture compilation failed' }
& $productionFixture 2>&1 | Tee-Object -FilePath (Join-Path $out 'TestOwnershipProduction01.log')
if ($LASTEXITCODE) { throw 'Production surface fixture failed' }
function Get-Pin([string]$Path) {
    [ordered]@{ path = $Path; bytes = (Get-Item -LiteralPath $Path).Length; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() }
}
[ordered]@{
    schema = 'RichAudioOwnershipBoundary01OfflineBuild'
    createdUtc = [DateTime]::UtcNow.ToString('o')
    gitHead = (& git -C $repo rev-parse HEAD)
    compiler = Get-Pin $compiler
    framework = '.NET Framework 4.8'
    architecture = 'x64'
    language = 'C# 5'
    passed = $true
    productionClaimsEnabled = $false
    nativeAdapters = 0
    evidence = 'Authored deterministic fixtures and separate production-assembly surface test only'
    gameLaunched = $false
    installed = $false
    endpointOpened = $false
    sources = @($sources + $tests + @($PSCommandPath) | ForEach-Object { Get-Pin $_ })
    outputs = @(Get-ChildItem -LiteralPath $out -File | ForEach-Object { Get-Pin $_.FullName })
} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $out 'build-receipt.json') -Encoding utf8
Write-Output ('PASS offline boundary build: ' + $out)
