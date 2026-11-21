#requires -Version 7.0
# Loading this file defines functions only. The caller owns the single-use
# transaction latch, fresh approval, and its process-closure policy.

function ConvertTo-Menu02Utc {
    [CmdletBinding()]
    param([Parameter(Mandatory)][AllowNull()]$Value)
    if ($Value -is [DateTime]) { return $Value.ToUniversalTime() }
    if ($Value -is [DateTimeOffset]) { return $Value.UtcDateTime }
    if ($Value -isnot [string] -or $Value -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}(?:Z|[+-]\d{2}:\d{2})$') {
        throw 'Timestamp must be DateTime, DateTimeOffset, or an explicit-zone invariant round-trip string.'
    }
    $parsed = [DateTime]::MinValue
    if (![DateTime]::TryParseExact($Value, 'o', [Globalization.CultureInfo]::InvariantCulture,
            [Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)) {
        throw 'Invalid invariant round-trip timestamp.'
    }
    return $parsed.ToUniversalTime()
}

function Assert-Menu02UnlinkedPath {
    param([Parameter(Mandatory)][string]$Path)
    if (![IO.Path]::IsPathFullyQualified($Path) -or $Path.StartsWith('\\')) { throw 'A fully qualified local path is required.' }
    for ($at = [IO.Path]::GetFullPath($Path); $at; $at = [IO.Path]::GetDirectoryName($at)) {
        $item = $null
        try { $item = Get-Item -LiteralPath $at -Force -ErrorAction Stop }
        catch { if ($_.CategoryInfo.Category -ne [Management.Automation.ErrorCategory]::ObjectNotFound) { throw } }
        # Get-Item also exposes dangling links that Test-Path can report absent.
        if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Reparse-point restoration path refused.'
        }
    }
}

function Assert-Menu02WithinRoot {
    param([string]$Path, [string]$Root)
    $full = [IO.Path]::GetFullPath($Path)
    $parent = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (!$full.StartsWith($parent, [StringComparison]::OrdinalIgnoreCase)) { throw 'Restoration path escaped its explicit root.' }
    Assert-Menu02UnlinkedPath $full
    return $full
}

function Get-Menu02FileMetadata {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    Assert-Menu02UnlinkedPath $Path
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.PSIsContainer) { throw 'Restoration target is a directory.' }
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    return [pscustomobject][ordered]@{
        creationTimeUtc = $item.CreationTimeUtc.ToString('o')
        lastWriteTimeUtc = $item.LastWriteTimeUtc.ToString('o')
        lastAccessTimeUtc = $item.LastAccessTimeUtc.ToString('o')
        attributes = [int]$item.Attributes
        sddl = $acl.Sddl
    }
}

function ConvertTo-Menu02Metadata {
    param([Parameter(Mandatory)]$Metadata)
    foreach ($key in @('creationTimeUtc', 'lastWriteTimeUtc', 'lastAccessTimeUtc', 'attributes', 'sddl')) {
        if ($null -eq $Metadata.$key) { throw ('Missing original metadata field: ' + $key) }
    }
    if ($Metadata.attributes -is [string] -or $Metadata.attributes -is [bool]) { throw 'File attributes must be a captured integer.' }
    $attributes = [IO.FileAttributes][int]$Metadata.attributes
    $knownBits = 0
    foreach ($flag in [Enum]::GetValues([IO.FileAttributes])) { $knownBits = $knownBits -bor [int]$flag }
    if ([int]$attributes -lt 0 -or ($attributes -band ([IO.FileAttributes]::Directory -bor [IO.FileAttributes]::ReparsePoint -bor [IO.FileAttributes]::Device))) {
        throw 'Directory, device, reparse-point, or negative attributes refused.'
    }
    if (([int]$attributes -band (-bnot $knownBits)) -ne 0) { throw 'Unknown file-attribute bits refused.' }
    if ($Metadata.sddl -isnot [string] -or !$Metadata.sddl) { throw 'Captured access permissions are required.' }
    $null = [Security.AccessControl.RawSecurityDescriptor]::new($Metadata.sddl)
    return [pscustomobject][ordered]@{
        creationTimeUtc = ConvertTo-Menu02Utc $Metadata.creationTimeUtc
        lastWriteTimeUtc = ConvertTo-Menu02Utc $Metadata.lastWriteTimeUtc
        lastAccessTimeUtc = ConvertTo-Menu02Utc $Metadata.lastAccessTimeUtc
        attributes = $attributes
        sddl = $Metadata.sddl
    }
}

function Get-Menu02RestoreFileState {
    param([string]$Path)
    Assert-Menu02UnlinkedPath $Path
    if (!(Test-Path -LiteralPath $Path)) { return [pscustomobject]@{ exists = $false; path = $Path } }
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.PSIsContainer) { throw 'A file was expected; directory refused.' }
    # Deny concurrent writers/deletion while hashing this observation.
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $bytes = $stream.Length
        $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant()
    } finally { $stream.Dispose() }
    return [pscustomobject]@{ exists = $true; path = $Path; bytes = $bytes; sha256 = $hash; metadata = Get-Menu02FileMetadata $Path }
}

function Assert-Menu02Closure {
    param([scriptblock]$Check)
    $answer = @(& $Check)
    if ($answer.Count -ne 1 -or $answer[0] -isnot [bool] -or !$answer[0]) {
        throw 'Process closure was not affirmatively verified.'
    }
}

function Assert-Menu02CurrentRestoreState {
    param($Prepared, $State)
    if (!$Prepared.originalExists) {
        if ($State.exists -and ($State.sha256 -cne $Prepared.change.proposedSha256 -or $State.bytes -ne $Prepared.change.proposedBytes)) {
            throw 'Unexpected contents at an originally absent target; no removal permitted.'
        }
        return
    }
    if (!$State.exists) { throw 'Originally existing target is unexpectedly absent.' }
    $original = $State.sha256 -ceq $Prepared.change.expectedOriginalSha256 -and $State.bytes -eq $Prepared.change.expectedOriginalBytes
    $proposed = $State.sha256 -ceq $Prepared.change.proposedSha256 -and $State.bytes -eq $Prepared.change.proposedBytes
    if (!$original -and !$proposed) { throw 'Unexpected target-content drift; restoration refused.' }
    if ($State.metadata.sddl -cne $Prepared.original.sddl) { throw 'Destination access-permission drift; no ACL overwrite permitted.' }
    $allowedAttributes = @([int]$Prepared.original.attributes)
    if ($Prepared.deployed) { $allowedAttributes += [int]$Prepared.deployed.attributes }
    if ([int]$State.metadata.attributes -notin $allowedAttributes) { throw 'Unexpected file-attribute drift.' }
    if ($Prepared.deployed) {
        foreach ($field in @('creationTimeUtc', 'lastWriteTimeUtc')) {
            $actual = (ConvertTo-Menu02Utc $State.metadata.$field).Ticks
            if ($actual -ne $Prepared.original.$field.Ticks -and $actual -ne $Prepared.deployed.$field.Ticks) {
                throw ('Unexpected timestamp drift: ' + $field)
            }
        }
    }
}

function Invoke-Menu02Restoration {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][object[]]$Changes,
        [Parameter(Mandatory)][string]$AllowedRoot,
        [Parameter(Mandatory)][string[]]$AllowedTargets,
        [Parameter(Mandatory)][string]$BackupRoot,
        [Parameter(Mandatory)][string]$ReceiptPath,
        [Parameter(Mandatory)][scriptblock]$AssertProcessClosure,
        [string]$FixtureRoot = '',
        [scriptblock]$FixtureFault
    )
    $ErrorActionPreference = 'Stop'
    $stage = 'receipt-preflight'
    $outcomes = [Collections.Generic.List[object]]::new()
    $prepared = [Collections.Generic.List[object]]::new()
    $writes = 0
    $terminalError = $null
    $started = [DateTime]::UtcNow
    Assert-Menu02UnlinkedPath $ReceiptPath
    if (Test-Path -LiteralPath $ReceiptPath) { throw 'Existing restoration receipt; no retry.' }
    if (!(Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($ReceiptPath)) -PathType Container)) { throw 'Existing receipt directory required.' }
    try {
        $stage = 'scope-prevalidation'
        Assert-Menu02UnlinkedPath $AllowedRoot
        Assert-Menu02UnlinkedPath $BackupRoot
        if (!(Test-Path -LiteralPath $AllowedRoot -PathType Container) -or !(Test-Path -LiteralPath $BackupRoot -PathType Container)) {
            throw 'Existing target and backup roots required.'
        }
        if (!$Changes.Count -or $Changes.Count -gt 16 -or $AllowedTargets.Count -ne $Changes.Count) { throw 'Exact bounded restoration target set required.' }
        $allowed = @($AllowedTargets | ForEach-Object { Assert-Menu02WithinRoot $_ $AllowedRoot })
        if (@($allowed | Sort-Object -Unique).Count -ne $allowed.Count) { throw 'Duplicate allowed targets refused.' }
        $targets = @($Changes | ForEach-Object { Assert-Menu02WithinRoot $_.target $AllowedRoot })
        if (@($targets | Sort-Object -Unique).Count -ne $targets.Count -or @($targets | Where-Object { $_ -notin $allowed }).Count) {
            throw 'Changed targets do not equal the explicit allowed target set.'
        }
        if ($ReceiptPath -in $targets) { throw 'Receipt cannot be a restoration target.' }
        if ($FixtureFault) {
            $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
            $fixture = Assert-Menu02WithinRoot $FixtureRoot (Join-Path $repo '.local')
            if ([IO.Path]::GetFileName($fixture) -cnotmatch '^menu02-recovery-fixtures-[a-zA-Z0-9-]+$') { throw 'Fault injection is restricted to explicit disposable fixture roots.' }
            foreach ($p in @($AllowedRoot, $BackupRoot, $ReceiptPath)) { $null = Assert-Menu02WithinRoot $p $fixture }
            $marker = Join-Path $fixture 'fixture-only.json'
            Assert-Menu02UnlinkedPath $marker
            $mark = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
            if ($mark.kind -cne 'Menu02DisposableRestorationFixture' -or $mark.installedAccessAllowed -ne $false) { throw 'Disposable fixture marker required for fault injection.' }
        }
        $stage = 'initial-process-closure'
        Assert-Menu02Closure $AssertProcessClosure
        $stage = 'all-inputs-prevalidation'
        foreach ($change in $Changes) {
            if ($change.expectedOriginalExists -isnot [bool]) { throw 'Expected-original existence must be an explicit Boolean.' }
            foreach ($key in @('proposedSha256')) { if ($change.$key -isnot [string] -or $change.$key -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid proposed SHA-256.' } }
            if ($null -eq $change.proposedBytes -or [long]$change.proposedBytes -lt 0) { throw 'Expected proposed size required.' }
            $target = Assert-Menu02WithinRoot $change.target $AllowedRoot
            $backup = Assert-Menu02WithinRoot $change.backup $BackupRoot
            if ($backup -in $targets -or $backup -ceq [IO.Path]::GetFullPath($ReceiptPath)) { throw 'Backup overlaps target or receipt.' }
            if (@($prepared | Where-Object backup -eq $backup).Count) { throw 'Duplicate backup path refused.' }
            $original = $null
            $deployed = $null
            if ($change.expectedOriginalExists) {
                if ($change.expectedOriginalSha256 -isnot [string] -or $change.expectedOriginalSha256 -cnotmatch '^[a-f0-9]{64}$' -or $null -eq $change.expectedOriginalBytes -or [long]$change.expectedOriginalBytes -lt 0) {
                    throw 'Original SHA-256 and size required.'
                }
                $original = ConvertTo-Menu02Metadata $change.originalMetadata
                if ($change.expectedDeployedMetadata) {
                    $deployed = ConvertTo-Menu02Metadata $change.expectedDeployedMetadata
                    if ($deployed.sddl -cne $original.sddl) { throw 'Deployment must preserve original access permissions.' }
                }
                $backupState = Get-Menu02RestoreFileState $backup
                if (!$backupState.exists -or $backupState.sha256 -cne $change.expectedOriginalSha256 -or $backupState.bytes -ne $change.expectedOriginalBytes) { throw 'Original backup identity differs.' }
            } else {
                if ($null -ne $change.originalMetadata -or $change.expectedOriginalSha256 -or $null -ne $change.expectedOriginalBytes) { throw 'Originally absent target cannot have original content or metadata.' }
                if (Test-Path -LiteralPath $backup) { throw 'Originally absent target must not have a backup file.' }
            }
            $p = [pscustomobject]@{ change = $change; target = $target; backup = $backup; originalExists = $change.expectedOriginalExists; original = $original; deployed = $deployed }
            $current = Get-Menu02RestoreFileState $target
            Assert-Menu02CurrentRestoreState $p $current
            $prepared.Add($p)
        }
        # No target write has occurred before the whole input population qualifies.
        foreach ($p in $prepared) {
            $context = [pscustomobject]@{ target = $p.target; backup = $p.backup; index = $outcomes.Count }
            $stage = 'before-target'
            if ($FixtureFault) { & $FixtureFault 'BeforeTarget' $context | Out-Null }
            Assert-Menu02Closure $AssertProcessClosure
            $fresh = Get-Menu02RestoreFileState $p.target
            Assert-Menu02CurrentRestoreState $p $fresh
            if (!$p.originalExists) {
                if ($fresh.exists) {
                    $stage = 'remove-originally-absent-target'
                    Assert-Menu02Closure $AssertProcessClosure
                    $again = Get-Menu02RestoreFileState $p.target
                    Assert-Menu02CurrentRestoreState $p $again
                    if ($again.exists) { $writes++; [IO.File]::Delete($p.target) }
                }
                Assert-Menu02UnlinkedPath $p.target
                if (Test-Path -LiteralPath $p.target) { throw 'Originally absent target remains present.' }
                $outcomes.Add([ordered]@{ target = $p.target; originalExists = $false; restoredAbsent = $true })
                continue
            }
            # Rehash each backup just before use as well as before the first write.
            $stage = 'fresh-backup-identity'
            $backupState = Get-Menu02RestoreFileState $p.backup
            if (!$backupState.exists -or $backupState.sha256 -cne $p.change.expectedOriginalSha256 -or $backupState.bytes -ne $p.change.expectedOriginalBytes) { throw 'Backup drift before restoration.' }
            if ($fresh.sha256 -cne $p.change.expectedOriginalSha256) {
                $stage = 'before-copy'
                if ($FixtureFault) { & $FixtureFault 'BeforeCopy' $context | Out-Null }
                Assert-Menu02Closure $AssertProcessClosure
                $fresh = Get-Menu02RestoreFileState $p.target
                Assert-Menu02CurrentRestoreState $p $fresh
                if ($fresh.metadata.attributes -band [IO.FileAttributes]::ReadOnly) { throw 'Read-only destination refused before content modification.' }
                $source = [IO.File]::Open($p.backup, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
                try {
                    if ($source.Length -ne $p.change.expectedOriginalBytes -or [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($source)).ToLowerInvariant() -cne $p.change.expectedOriginalSha256) { throw 'Locked backup identity differs.' }
                    $source.Position = 0
                    $destination = [IO.File]::Open($p.target, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
                    try {
                        $lockedHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($destination)).ToLowerInvariant()
                        if ($lockedHash -cne $p.change.proposedSha256 -and $lockedHash -cne $p.change.expectedOriginalSha256) { throw 'Exclusive target identity differs.' }
                        Assert-Menu02Closure $AssertProcessClosure
                        $stage = 'copy-original-bytes'
                        $destination.Position = 0
                        $writes++
                        $source.CopyTo($destination)
                        $destination.SetLength($source.Length)
                        $destination.Flush($true)
                    } finally { $destination.Dispose() }
                } finally { $source.Dispose() }
                $stage = 'after-copy'
                if ($FixtureFault) { & $FixtureFault 'AfterCopy' $context | Out-Null }
            }
            $restored = Get-Menu02RestoreFileState $p.target
            if ($restored.sha256 -cne $p.change.expectedOriginalSha256 -or $restored.bytes -ne $p.change.expectedOriginalBytes -or $restored.metadata.sddl -cne $p.original.sddl) { throw 'Restored content or permissions differ.' }
            $stage = 'before-metadata'
            if ($FixtureFault) { & $FixtureFault 'BeforeMetadata' $context | Out-Null }
            Assert-Menu02Closure $AssertProcessClosure
            $restored = Get-Menu02RestoreFileState $p.target
            if (!$restored.exists -or $restored.sha256 -cne $p.change.expectedOriginalSha256 -or $restored.bytes -ne $p.change.expectedOriginalBytes -or $restored.metadata.sddl -cne $p.original.sddl) { throw 'Fresh original identity differs before metadata.' }
            $stage = 'restore-metadata'
            # ACLs are deliberately verified, never replaced with Set-Acl.
            Assert-Menu02UnlinkedPath $p.target
            $writes++
            if ($FixtureFault) { & $FixtureFault 'BeforeMetadataWrite' $context | Out-Null }
            [IO.File]::SetCreationTimeUtc($p.target, $p.original.creationTimeUtc)
            Assert-Menu02Closure $AssertProcessClosure
            Assert-Menu02UnlinkedPath $p.target
            $writes++
            [IO.File]::SetLastWriteTimeUtc($p.target, $p.original.lastWriteTimeUtc)
            Assert-Menu02Closure $AssertProcessClosure
            Assert-Menu02UnlinkedPath $p.target
            $writes++
            [IO.File]::SetAttributes($p.target, $p.original.attributes)
            $stage = 'after-metadata'
            if ($FixtureFault) { & $FixtureFault 'AfterMetadata' $context | Out-Null }
            $verified = Get-Menu02RestoreFileState $p.target
            if ($verified.sha256 -cne $p.change.expectedOriginalSha256 -or $verified.bytes -ne $p.change.expectedOriginalBytes -or
                $verified.metadata.sddl -cne $p.original.sddl -or [int]$verified.metadata.attributes -ne [int]$p.original.attributes -or
                (ConvertTo-Menu02Utc $verified.metadata.creationTimeUtc).Ticks -ne $p.original.creationTimeUtc.Ticks -or
                (ConvertTo-Menu02Utc $verified.metadata.lastWriteTimeUtc).Ticks -ne $p.original.lastWriteTimeUtc.Ticks) { throw 'Restored metadata verification failed.' }
            $stage = 'restore-final-access-time'
            Assert-Menu02Closure $AssertProcessClosure
            Assert-Menu02UnlinkedPath $p.target
            $writes++
            [IO.File]::SetLastAccessTimeUtc($p.target, $p.original.lastAccessTimeUtc)
            $final = Get-Menu02FileMetadata $p.target
            if ((ConvertTo-Menu02Utc $final.lastAccessTimeUtc).Ticks -ne $p.original.lastAccessTimeUtc.Ticks -or $final.sddl -cne $p.original.sddl) { throw 'Restored access time or permissions verification failed.' }
            $outcomes.Add([ordered]@{ target = $p.target; originalExists = $true; sha256 = $verified.sha256; bytes = $verified.bytes; originalBytes = $true; timestamps = $true; attributes = $true; accessPermissions = $true })
        }
        $stage = 'final-process-closure'
        Assert-Menu02Closure $AssertProcessClosure
    } catch {
        $terminalError = $_
    }
    $receipt = [ordered]@{
        kind = 'Menu02RestorationReceipt'; schema = 1; startedUtc = $started.ToString('o'); completedUtc = [DateTime]::UtcNow.ToString('o')
        succeeded = ($null -eq $terminalError); terminalStage = $stage; mutationOperationsStarted = $writes
        completedTargets = @($outcomes.ToArray()); expectedTargets = $Changes.Count
        automaticRetry = $false; fixtureFaultEnabled = [bool]$FixtureFault
        error = $(if ($terminalError) { [ordered]@{ type = $terminalError.Exception.GetType().FullName; message = $terminalError.Exception.Message } } else { $null })
    }
    $json = [Text.UTF8Encoding]::new($false).GetBytes(($receipt | ConvertTo-Json -Depth 10))
    Assert-Menu02UnlinkedPath $ReceiptPath
    $file = [IO.File]::Open($ReceiptPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $file.Write($json, 0, $json.Length); $file.Flush($true) } finally { $file.Dispose() }
    if ($terminalError) { throw $terminalError }
    return [pscustomobject]$receipt
}
