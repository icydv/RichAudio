#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputRoot = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'menu02-recovery\Restoration.ps1')
if (!$OutputRoot) { $OutputRoot = Join-Path $repo '.local\menu02-recovery-fixtures-01' }
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$null = Assert-Menu02WithinRoot $OutputRoot (Join-Path $repo '.local')
if ([IO.Path]::GetFileName($OutputRoot) -cnotmatch '^menu02-recovery-fixtures-[a-zA-Z0-9-]+$') { throw 'Explicit disposable fixture root required.' }
if (Test-Path -LiteralPath $OutputRoot) { throw 'Fresh fixture root required; prior evidence is preserved.' }
[IO.Directory]::CreateDirectory($OutputRoot) | Out-Null
[IO.File]::WriteAllText((Join-Path $OutputRoot 'fixture-only.json'), '{"kind":"Menu02DisposableRestorationFixture","installedAccessAllowed":false}', [Text.UTF8Encoding]::new($false))
$tests = [Collections.Generic.List[object]]::new()
$legacy = [Collections.Generic.List[object]]::new()
$childObservations = [Collections.Generic.List[object]]::new()
$originalCulture = [Threading.Thread]::CurrentThread.CurrentCulture
$originalUiCulture = [Threading.Thread]::CurrentThread.CurrentUICulture
function Need([bool]$Condition, [string]$Message) { if (!$Condition) { throw $Message } }
function Hash([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function JsonNew([string]$Path, $Data) {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Data | ConvertTo-Json -Depth 12))
    $file = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $file.Write($bytes, 0, $bytes.Length); $file.Flush($true) } finally { $file.Dispose() }
}
function Test([string]$Name, [scriptblock]$Run) {
    $begin = [DateTime]::UtcNow
    try { & $Run; $tests.Add([ordered]@{ name = $Name; passed = $true; startedUtc = $begin.ToString('o'); finishedUtc = [DateTime]::UtcNow.ToString('o') }); Write-Output ('PASS ' + $Name) }
    catch { $tests.Add([ordered]@{ name = $Name; passed = $false; startedUtc = $begin.ToString('o'); error = $_.Exception.Message }); Write-Output ('FAIL ' + $Name + ': ' + $_.Exception.Message) }
}
function NewCase([string]$Name, [switch]$AbsentSecond, [switch]$ReadOnlyOriginal) {
    $root = Join-Path $OutputRoot $Name
    $game = Join-Path $root 'game'; $backups = Join-Path $root 'original'
    [IO.Directory]::CreateDirectory($game) | Out-Null
    [IO.Directory]::CreateDirectory($backups) | Out-Null
    $changes = @()
    foreach ($index in 0..1) {
        $target = Join-Path $game ('target-' + $index + '.fixture')
        $backup = Join-Path $backups ('target-' + $index + '.original')
        $exists = !($AbsentSecond -and $index -eq 1)
        $original = [Text.Encoding]::UTF8.GetBytes('Exact original bytes ' + $Name + ' ' + $index)
        $candidate = [Text.Encoding]::UTF8.GetBytes('Reviewed temporary candidate bytes ' + $Name + ' ' + $index)
        $metadata = $null; $originalSha = $null; $originalBytes = $null
        if ($exists) {
            [IO.File]::WriteAllBytes($target, $original)
            [IO.File]::SetCreationTimeUtc($target, [DateTime]::new(2026, 10, 30, 20, 56, 6, [DateTimeKind]::Utc).AddTicks(1234567))
            [IO.File]::SetLastWriteTimeUtc($target, [DateTime]::new(2026, 10, 31, 21, 18, 42, [DateTimeKind]::Utc).AddTicks(7258098))
            [IO.File]::SetLastAccessTimeUtc($target, [DateTime]::new(2026, 10, 30, 20, 57, 7, [DateTimeKind]::Utc).AddTicks(7654321))
            $attrs = [IO.FileAttributes]::Archive -bor [IO.FileAttributes]::Hidden
            if ($ReadOnlyOriginal) { $attrs = $attrs -bor [IO.FileAttributes]::ReadOnly }
            [IO.File]::SetAttributes($target, $attrs)
            $metadata = Get-Menu02FileMetadata $target
            $originalSha = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($original)).ToLowerInvariant()
            $originalBytes = $original.Length
            [IO.File]::WriteAllBytes($backup, $original)
            [IO.File]::SetAttributes($target, [IO.FileAttributes]::Archive)
        }
        [IO.File]::WriteAllBytes($target, $candidate)
        $proposedSha = Hash $target
        $deployed = Get-Menu02FileMetadata $target
        $changes += [pscustomobject][ordered]@{ target = $target; backup = $backup; expectedOriginalExists = $exists; expectedOriginalBytes = $originalBytes; expectedOriginalSha256 = $originalSha; proposedBytes = $candidate.Length; proposedSha256 = $proposedSha; originalMetadata = $metadata; expectedDeployedMetadata = $(if ($exists) { $deployed } else { $null }) }
    }
    return [pscustomobject]@{ root = $root; game = $game; backups = $backups; changes = $changes; receipt = (Join-Path $root 'restoration-result.json') }
}
function RunCase($Case, [scriptblock]$Closure = { $true }, [scriptblock]$Fault) {
    $args = @{ Changes = $Case.changes; AllowedRoot = $Case.game; AllowedTargets = @($Case.changes.target); BackupRoot = $Case.backups; ReceiptPath = $Case.receipt; AssertProcessClosure = $Closure }
    if ($Fault) { $args.FixtureRoot = $OutputRoot; $args.FixtureFault = $Fault }
    Invoke-Menu02Restoration @args
}
function FailedCase($Case, [scriptblock]$Closure = { $true }, [scriptblock]$Fault, [string]$Stage = '') {
    $threw = $false
    try { $null = RunCase $Case $Closure $Fault } catch { $threw = $true }
    Need $threw 'Expected restoration refusal was missing.'
    Need (Test-Path -LiteralPath $Case.receipt -PathType Leaf) 'Failure receipt must precede the thrown error.'
    $receipt = Get-Content -LiteralPath $Case.receipt -Raw | ConvertFrom-Json
    Need (!$receipt.succeeded -and !$receipt.automaticRetry) 'Failure or no-retry result was lost.'
    if ($Stage) { Need ($receipt.terminalStage -ceq $Stage) ('Unexpected failure stage: ' + $receipt.terminalStage) }
    return $receipt
}
function VerifyRestored($Case) {
    foreach ($c in $Case.changes) {
        if (!$c.expectedOriginalExists) { Need (!(Test-Path -LiteralPath $c.target)) 'Originally absent target was not removed.'; continue }
        Need ((Hash $c.target) -ceq $c.expectedOriginalSha256) 'Original contents differ.'
        $actual = Get-Menu02FileMetadata $c.target
        Need ($actual.sddl -ceq $c.originalMetadata.sddl) 'Original permissions differ.'
        Need ([int]$actual.attributes -eq [int]$c.originalMetadata.attributes) 'Original attributes differ.'
        foreach ($field in @('creationTimeUtc', 'lastWriteTimeUtc', 'lastAccessTimeUtc')) {
            Need ((ConvertTo-Menu02Utc $actual.$field).Ticks -eq (ConvertTo-Menu02Utc $c.originalMetadata.$field).Ticks) ('Original timestamp differs: ' + $field)
        }
    }
}
try {
    foreach ($locale in @('en-GB', 'en-US')) {
        $cultureName = $locale
        Test ('default ConvertFrom-Json DateTime and legacy failure retained under ' + $cultureName) {
            [Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo($cultureName)
            [Threading.Thread]::CurrentThread.CurrentUICulture = [Globalization.CultureInfo]::GetCultureInfo($cultureName)
            $decoded = '{"creationTimeUtc":"2026-10-30T20:56:06.1234567Z"}' | ConvertFrom-Json
            Need ($decoded.creationTimeUtc -is [DateTime]) 'The actual default JSON deserializer must produce DateTime.'
            $oldThrew = $false; $oldResult = $null; $oldMessage = $null
            try { $oldResult = [DateTime]::Parse($decoded.creationTimeUtc).ToUniversalTime() } catch { $oldThrew = $true; $oldMessage = $_.Exception.Message }
            $legacy.Add([ordered]@{ culture = $cultureName; deserializedType = $decoded.creationTimeUtc.GetType().FullName; originalUtc = $decoded.creationTimeUtc.ToUniversalTime().ToString('o'); legacyImplicitString = [string]$decoded.creationTimeUtc; oldThrew = $oldThrew; oldResult = $(if ($null -ne $oldResult) { $oldResult.ToString('o') } else { $null }); exception = $oldMessage })
            if ($cultureName -ceq 'en-GB') { Need $oldThrew 'The October 30 legacy bug must be reproduced independently.' }
            Need ((ConvertTo-Menu02Utc $decoded.creationTimeUtc).Ticks -eq $decoded.creationTimeUtc.ToUniversalTime().Ticks) 'Direct DateTime conversion changed ticks.'
        }
        Test ('actual helper restores JSON DateTime metadata under ' + $cultureName) {
            $case = NewCase ('success-' + $cultureName)
            $case.changes = @((($case.changes | ConvertTo-Json -Depth 8) | ConvertFrom-Json))
            Need ($case.changes[0].originalMetadata.creationTimeUtc -is [DateTime]) 'Original metadata was not tested after real JSON deserialization.'
            $receipt = RunCase $case
            Need ($receipt.succeeded -and $receipt.completedTargets.Count -eq 2) 'Successful restoration receipt incomplete.'
            VerifyRestored $case
        }
    }
    Test 'DateTimeOffset and strict invariant roundtrip timestamps retain exact UTC ticks' {
        $dto = [DateTimeOffset]::ParseExact('2026-10-30T21:56:06.1234567+01:00', 'o', [Globalization.CultureInfo]::InvariantCulture)
        Need ((ConvertTo-Menu02Utc $dto).Ticks -eq $dto.UtcDateTime.Ticks) 'DateTimeOffset conversion differs.'
        Need ((ConvertTo-Menu02Utc '2026-10-30T20:56:06.1234567Z').Ticks -eq $dto.UtcDateTime.Ticks) 'UTC string conversion differs.'
        Need ((ConvertTo-Menu02Utc '2026-10-30T21:56:06.1234567+01:00').Ticks -eq $dto.UtcDateTime.Ticks) 'Offset string conversion differs.'
        foreach ($bad in @('10/30/2026 20:56:06', '30/10/2026 20:56:06', '2026-10-30T20:56:06.1234567', '2026-10-30T20:56:06Z', '2026-02-30T20:56:06.1234567Z', 123, $null)) {
            $threw = $false; try { $null = ConvertTo-Menu02Utc $bad } catch { $threw = $true }; Need $threw 'Invalid or ambiguous timestamp accepted.'
        }
    }
    Test 'originally absent candidate is removed while existing original restores' {
        $case = NewCase 'absent-original' -AbsentSecond
        $receipt = RunCase $case; Need $receipt.succeeded 'Absent-original restoration failed.'; VerifyRestored $case
    }
    Test 'already absent original target remains absent' {
        $case = NewCase 'already-absent' -AbsentSecond
        [IO.File]::Delete($case.changes[1].target)
        $receipt = RunCase $case; Need $receipt.succeeded 'Already-absent restoration failed.'; VerifyRestored $case
    }
    Test 'original readonly hidden and archive attributes restore without replacing ACL' {
        $case = NewCase 'readonly-original' -ReadOnlyOriginal
        $receipt = RunCase $case; Need $receipt.succeeded 'Readonly metadata restoration failed.'; VerifyRestored $case
    }
    Test 'mixed already-original and still-candidate population restores successfully' {
        $case = NewCase 'mixed-original-candidate'
        $firstReceipt = Join-Path $case.root 'first-target-preparation-result.json'
        $first = Invoke-Menu02Restoration -Changes @($case.changes[0]) -AllowedRoot $case.game -AllowedTargets @($case.changes[0].target) -BackupRoot $case.backups -ReceiptPath $firstReceipt -AssertProcessClosure { $true }
        Need $first.succeeded 'Production helper failed to arrange the first original target.'
        Need ((Hash $case.changes[0].target) -ceq $case.changes[0].expectedOriginalSha256 -and (Hash $case.changes[1].target) -ceq $case.changes[1].proposedSha256) 'Fixture did not contain the mixed state.'
        $receipt = RunCase $case; Need $receipt.succeeded 'Mixed-state restoration failed.'; VerifyRestored $case
    }
    Test 'actual helper accepts DateTimeOffset metadata without culture parsing' {
        $case = NewCase 'datetimeoffset-metadata'
        foreach ($c in $case.changes) {
            foreach ($field in @('creationTimeUtc', 'lastWriteTimeUtc', 'lastAccessTimeUtc')) {
                $c.originalMetadata.$field = [DateTimeOffset]::new((ConvertTo-Menu02Utc $c.originalMetadata.$field)).ToOffset([TimeSpan]::FromHours(1))
            }
        }
        $receipt = RunCase $case; Need $receipt.succeeded 'DateTimeOffset metadata restoration failed.'; VerifyRestored $case
    }
    Test 'both backups validate before any target mutation' {
        $case = NewCase 'bad-second-backup'; [IO.File]::WriteAllText($case.changes[1].backup, 'corrupted backup')
        $receipt = FailedCase $case
        Need ($receipt.mutationOperationsStarted -eq 0) 'A target changed before all backups qualified.'
        foreach ($c in $case.changes) { Need ((Hash $c.target) -ceq $c.proposedSha256) 'Candidate changed after failed backup prevalidation.' }
    }
    Test 'all timestamp metadata validates before any target mutation' {
        $case = NewCase 'bad-second-timestamp'; $case.changes[1].originalMetadata.creationTimeUtc = '10/30/2026 20:56:06'
        $receipt = FailedCase $case
        Need ($receipt.mutationOperationsStarted -eq 0) 'Invalid later metadata was not rejected before writes.'
        Need ((Hash $case.changes[0].target) -ceq $case.changes[0].proposedSha256) 'First target changed before timestamp prevalidation completed.'
    }
    Test 'unknown attribute bits are refused before any target mutation' {
        $case = NewCase 'invalid-attribute-bits'; $case.changes[1].originalMetadata.attributes = 1073741824
        $receipt = FailedCase $case; Need ($receipt.mutationOperationsStarted -eq 0) 'Unknown metadata bits did not stop first write.'
    }
    Test 'unexpected original target contents stop all restoration writes' {
        $case = NewCase 'unexpected-original-drift'; [IO.File]::WriteAllText($case.changes[1].target, 'unexpected independent edit')
        $receipt = FailedCase $case
        Need ($receipt.mutationOperationsStarted -eq 0) 'Unexpected content drift did not stop first write.'
        Need ([IO.File]::ReadAllText($case.changes[1].target) -ceq 'unexpected independent edit') 'Unexpected bytes were overwritten.'
    }
    Test 'unexpected contents at originally absent target are never removed' {
        $case = NewCase 'unexpected-absent-drift' -AbsentSecond; [IO.File]::WriteAllText($case.changes[1].target, 'new independent file')
        $receipt = FailedCase $case; Need ($receipt.mutationOperationsStarted -eq 0) 'Absent-target drift did not stop first write.'
        Need ([IO.File]::ReadAllText($case.changes[1].target) -ceq 'new independent file') 'Independent new file was removed.'
    }
    Test 'unexpected file permissions are preserved and refused' {
        $case = NewCase 'permission-drift'
        # Deliberately change only this disposable fixture ACL; production helper never sets ACLs.
        $acl = Get-Acl -LiteralPath $case.changes[1].target
        $acl.SetAccessRuleProtection($true, $true)
        Set-Acl -LiteralPath $case.changes[1].target -AclObject $acl
        $changed = (Get-Acl -LiteralPath $case.changes[1].target).Sddl
        Need ($changed -cne $case.changes[1].originalMetadata.sddl) 'Fixture ACL perturbation did not take effect.'
        $receipt = FailedCase $case; Need ($receipt.mutationOperationsStarted -eq 0) 'ACL drift did not stop first write.'
        Need ((Get-Acl -LiteralPath $case.changes[1].target).Sddl -ceq $changed) 'Unexpected ACL was overwritten.'
    }
    Test 'unexpected file timestamp drift is refused' {
        $case = NewCase 'timestamp-drift'; [IO.File]::SetLastWriteTimeUtc($case.changes[1].target, [DateTime]::new(2025, 1, 1, 0, 0, 0, [DateTimeKind]::Utc))
        $receipt = FailedCase $case; Need ($receipt.mutationOperationsStarted -eq 0) 'Timestamp drift did not stop first write.'
    }
    Test 'unexpected directory is refused without recursive deletion' {
        $case = NewCase 'directory-drift'; [IO.File]::Delete($case.changes[1].target); [IO.Directory]::CreateDirectory($case.changes[1].target) | Out-Null
        $receipt = FailedCase $case; Need ($receipt.mutationOperationsStarted -eq 0) 'Directory target did not stop first write.'
        Need (Test-Path -LiteralPath $case.changes[1].target -PathType Container) 'Directory was deleted.'
    }
    Test 'reparse-point ancestor is refused before target reads or writes' {
        $case = NewCase 'junction-drift'; $other = Join-Path $case.root 'other'; [IO.Directory]::CreateDirectory($other) | Out-Null
        $junction = Join-Path $case.game 'linked'; New-Item -ItemType Junction -Path $junction -Target $other | Out-Null
        $case.changes[0].target = Join-Path $junction 'never-read.fixture'
        $receipt = FailedCase $case; Need ($receipt.mutationOperationsStarted -eq 0) 'Reparse target did not stop before writes.'
    }
    Test 'explicit target allowlist rejects an escaped target' {
        $case = NewCase 'escaped-target'; $case.changes[1].target = Join-Path $case.root 'outside.fixture'
        $receipt = FailedCase $case; Need ($receipt.mutationOperationsStarted -eq 0) 'Escaped target did not stop before writes.'
    }
    Test 'non-Boolean original-existence flag is refused' {
        $case = NewCase 'existence-not-bool'; $case.changes[1].expectedOriginalExists = 'true'
        $receipt = FailedCase $case; Need ($receipt.mutationOperationsStarted -eq 0) 'Ambiguous existence flag was accepted.'
    }
    foreach ($point in @('BeforeCopy', 'AfterCopy', 'BeforeMetadata', 'AfterMetadata')) {
        $faultPoint = $point
        Test ('injected ' + $faultPoint + ' failure retains a terminal failure without retry') {
            $case = NewCase ('injected-' + $faultPoint)
            $fault = { param($stage, $context) if ($context.index -eq 0 -and $stage -ceq $faultPoint) { throw ('Fixture injected ' + $faultPoint) } }.GetNewClosure()
            $receipt = FailedCase $case { $true } $fault
            Need ($receipt.fixtureFaultEnabled -and $receipt.completedTargets.Count -eq 0) 'Injected failure was not retained accurately.'
            Need ((Hash $case.changes[1].target) -ceq $case.changes[1].proposedSha256) 'Later target changed after injected failure.'
            if ($faultPoint -ceq 'BeforeCopy') { Need ($receipt.mutationOperationsStarted -eq 0) 'Before-copy failure wrote target bytes.' }
            else { Need ((Hash $case.changes[0].target) -ceq $case.changes[0].expectedOriginalSha256) 'Post-copy failure did not preserve its observed original-byte state.' }
        }
    }
    Test 'actual locked-file copy-open failure is retained without mutation' {
        $case = NewCase 'actual-locked-destination'; $holder = @{ stream = $null }
        $fault = { param($stage, $context) if ($context.index -eq 0 -and $stage -ceq 'BeforeCopy') { $holder.stream = [IO.File]::Open($context.target, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read) } }.GetNewClosure()
        try { $receipt = FailedCase $case { $true } $fault; Need ($receipt.mutationOperationsStarted -eq 0) 'Locked copy-open failure modified content.' }
        finally { if ($holder.stream) { $holder.stream.Dispose() } }
        Need ((Hash $case.changes[0].target) -ceq $case.changes[0].proposedSha256) 'Locked destination changed.'
    }
    Test 'injected metadata-write failure retains original bytes and a failed receipt' {
        $case = NewCase 'injected-metadata-call'
        # The retained fixtures-02 attempt demonstrated that a read-shared handle
        # does not block Windows timestamp setters. Use an explicitly labelled
        # fixture-only fault here instead of claiming a real OS metadata failure.
        $fault = { param($stage, $context) if ($context.index -eq 0 -and $stage -ceq 'BeforeMetadataWrite') { throw 'Fixture injected metadata system-call failure' } }
        $receipt = FailedCase $case { $true } $fault 'restore-metadata'
        Need ($receipt.mutationOperationsStarted -ge 2) 'Metadata-write intent was not counted before the failing call.'
        Need ((Hash $case.changes[0].target) -ceq $case.changes[0].expectedOriginalSha256) 'Original bytes were lost after metadata-write failure.'
        Need ((Hash $case.changes[1].target) -ceq $case.changes[1].proposedSha256) 'Later target changed after metadata-write failure.'
    }
    Test 'fresh per-target content gate catches drift after another target restored' {
        $case = NewCase 'between-target-drift'
        $fault = { param($stage, $context) if ($context.index -eq 1 -and $stage -ceq 'BeforeTarget') { [IO.File]::WriteAllText($context.target, 'changed after first restore') } }
        $receipt = FailedCase $case { $true } $fault
        Need ($receipt.completedTargets.Count -eq 1) 'First successful target result was lost.'
        Need ([IO.File]::ReadAllText($case.changes[1].target) -ceq 'changed after first restore') 'Fresh target drift was overwritten.'
    }
    Test 'fresh per-target backup gate catches drift after initial prevalidation' {
        $case = NewCase 'between-target-backup-drift'
        $fault = { param($stage, $context) if ($context.index -eq 1 -and $stage -ceq 'BeforeTarget') { [IO.File]::WriteAllText($context.backup, 'changed backup after first restore') } }
        $receipt = FailedCase $case { $true } $fault
        Need ($receipt.completedTargets.Count -eq 1) 'Completed first restore was lost.'
        Need ((Hash $case.changes[1].target) -ceq $case.changes[1].proposedSha256) 'Target changed despite fresh backup drift.'
    }
    Test 'fresh process guard refuses a process appearing before the second target' {
        $case = NewCase 'between-target-process'; $guard = @{ active = $false; calls = 0 }
        $fault = { param($stage, $context) if ($context.index -eq 1 -and $stage -ceq 'BeforeTarget') { $guard.active = $true } }.GetNewClosure()
        $closure = { $guard.calls++; if ($guard.active) { throw 'Fixture process guard became active' }; $true }.GetNewClosure()
        $receipt = FailedCase $case $closure $fault
        Need ($receipt.completedTargets.Count -eq 1 -and $guard.calls -gt 2) 'Per-target process closure was not rechecked.'
        Need ((Hash $case.changes[1].target) -ceq $case.changes[1].proposedSha256) 'Second target changed while guard active.'
    }
    Test 'active disposable pwsh PID and creation-time guard prevents any restoration' {
        $case = NewCase 'actual-child-process'; $child = [Diagnostics.Process]::new()
        $child.StartInfo = [Diagnostics.ProcessStartInfo]::new()
        $child.StartInfo.FileName = Join-Path $PSHOME 'pwsh.exe'
        $child.StartInfo.ArgumentList.Add('-NoProfile'); $child.StartInfo.ArgumentList.Add('-NonInteractive'); $child.StartInfo.ArgumentList.Add('-Command'); $child.StartInfo.ArgumentList.Add('Start-Sleep -Milliseconds 2500')
        $child.StartInfo.WorkingDirectory = $case.root; $child.StartInfo.UseShellExecute = $false; $child.StartInfo.CreateNoWindow = $true
        Need ($child.Start()) 'Disposable child did not start.'
        $childId = $child.Id; $creation = $child.StartTime.ToUniversalTime()
        $closure = { $live = [Diagnostics.Process]::GetProcessById($childId); try { if ($live.StartTime.ToUniversalTime().Ticks -eq $creation.Ticks) { throw 'Owned disposable child is still active' }; throw 'PID reused; closure identity unknown' } finally { $live.Dispose() } }.GetNewClosure()
        try {
            $receipt = FailedCase $case $closure
            Need ($receipt.mutationOperationsStarted -eq 0) 'Active child did not prevent all target writes.'
            foreach ($c in $case.changes) { Need ((Hash $c.target) -ceq $c.proposedSha256) 'Active-child guard permitted target modification.' }
        } finally {
            if (!$child.WaitForExit(10000)) {
                $child.Refresh()
                if ($child.StartTime.ToUniversalTime().Ticks -ne $creation.Ticks) { throw 'Disposable process identity drift; termination refused.' }
                $child.Kill(); if (!$child.WaitForExit(5000)) { throw 'Owned disposable child failed to close.' }
            }
            $childObservations.Add([ordered]@{ pid = $childId; creationTimeUtc = $creation.ToString('o'); executable = 'pwsh.exe'; purpose = 'Disposable process-closure fixture only'; exitCode = $child.ExitCode; closed = $child.HasExited; gameOrRph = $false })
            $child.Dispose()
        }
    }
    Test 'existing terminal receipt is never overwritten or reused' {
        $case = NewCase 'single-use-receipt'; $null = RunCase $case; $before = Hash $case.receipt
        $threw = $false; try { $null = RunCase $case } catch { $threw = $true }
        Need ($threw -and (Hash $case.receipt) -ceq $before) 'Consumed receipt was replaced or reused.'
    }
    Test 'false process-closure result refuses restoration before writes' {
        $case = NewCase 'false-closure'; $receipt = FailedCase $case { $false }
        Need ($receipt.mutationOperationsStarted -eq 0) 'False closure allowed writes.'
    }
} finally {
    [Threading.Thread]::CurrentThread.CurrentCulture = $originalCulture
    [Threading.Thread]::CurrentThread.CurrentUICulture = $originalUiCulture
    JsonNew (Join-Path $OutputRoot 'legacy-culture-observations.json') @($legacy.ToArray())
    JsonNew (Join-Path $OutputRoot 'owned-child-observations.json') @($childObservations.ToArray())
    $failures = @($tests | Where-Object { !$_.passed })
    $result = [ordered]@{ kind = 'Menu02RestorationDisposableFixtureResults'; schema = 1; completedUtc = [DateTime]::UtcNow.ToString('o'); powershell = $PSVersionTable.PSVersion.ToString(); tests = $tests.Count; pass = $tests.Count - $failures.Count; fail = $failures.Count; cases = @($tests.ToArray()); helper = [ordered]@{ path = 'tools/menu02-recovery/Restoration.ps1'; sha256 = Hash (Join-Path $PSScriptRoot 'menu02-recovery\Restoration.ps1') }; fixtureScriptSha256 = Hash $PSCommandPath; productionHelperUsedDirectly = $true; installedPathsAccessed = $false; gameOrRphLaunched = $false; audioEndpointOpened = $false; recorded = $false; oldEvidenceModified = $false; ownedDisposableChildren = $childObservations.Count }
    JsonNew (Join-Path $OutputRoot 'result.json') $result
    Write-Output ('RESULT ' + $result.pass + '/' + $result.tests + ' passing; failures=' + $result.fail)
}
if ($failures.Count) { exit 1 }
