#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ResourceRoot,
    [Parameter(Mandatory)][string]$ShadowReceipt,
    [Parameter(Mandatory)][string]$Output
)
$ErrorActionPreference = 'Stop'
$pack = 'ra_rc_9f6c2b57'
$repo = (Resolve-Path "$PSScriptRoot/../../..").Path
$private = (Join-Path $repo '.local/audio-switch').TrimEnd('\') + '\'

function PrivateFile([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (!$full.StartsWith($private, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Expected a private audio-switch input path'
    }
    for ($at = $full; $at; $at = [IO.Path]::GetDirectoryName($at)) {
        if ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Linked input path: $at"
        }
    }
    return $full
}

$ShadowReceipt = PrivateFile $ShadowReceipt
$shadow = Get-Content -LiteralPath $ShadowReceipt -Raw | ConvertFrom-Json
$shadowPath = PrivateFile $shadow.shadow
if ($shadow.pack -cne $pack -or $shadow.state -cne 'offline-complete-shadow-verified' -or
    !$shadow.sourceUnchanged -or $shadow.appendedMount -cne "dlcpacks:/$pack/" -or
    $shadow.proposedDestination -cne 'mods/update/update.rpf' -or
    (Get-Item -LiteralPath $shadowPath).Length -ne $shadow.shadowBytes -or
    (Get-FileHash -LiteralPath $shadowPath).Hash -ine $shadow.shadowSha256 -or
    (Get-FileHash -LiteralPath $shadow.source).Hash -ine $shadow.sourceSha256) {
    throw 'Private DLC-list shadow or stock source differs from its verification receipt'
}

& "$PSScriptRoot/../native-suppression01/Build-IdleDlc.ps1" -ResourceRoot $ResourceRoot -Pack $pack -Output $Output
$dlc = Get-Content -LiteralPath (Join-Path $Output 'dlc-receipt.json') -Raw | ConvertFrom-Json
$files = @(
    [ordered]@{ relative = "mods/update/x64/dlcpacks/$pack/dlc.rpf"; source = $dlc.archive; bytes = $dlc.bytes; sha256 = $dlc.sha256 }
    [ordered]@{ relative = 'mods/update/update.rpf'; source = $shadowPath; bytes = $shadow.shadowBytes; sha256 = $shadow.shadowSha256 }
)
foreach ($file in $files) {
    $file.originalExists = $false
    $file.originalBytes = $null
    $file.originalSha256 = $null
}
$plan = Join-Path $Output 'overlay-plan.json'
[IO.File]::WriteAllText($plan, (ConvertTo-Json -InputObject $files -Depth 4))
Write-Output "Verified offline overlay plan: $plan"
