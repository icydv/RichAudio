#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$run = $PSScriptRoot
if ($run -cne 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-08') { throw 'Run only the retained execution08 rollback copy' }
$ledgerPath = Join-Path $run 'transaction.json'
$t = Get-Content -LiteralPath $ledgerPath -Raw | ConvertFrom-Json
$s = Get-Content -LiteralPath (Join-Path $run 'scope.json') -Raw | ConvertFrom-Json
$game = 'D:\Games\steamapps\common\Grand Theft Auto V Enhanced'
$obs = 'C:\Users\Libby\AppData\Roaming\obs-studio'
$settingsRoot=$s.focusConfiguration.root
if (Get-Process -Name GTA5_Enhanced,PlayGTAV,obs64,RAGEPluginHook -ErrorAction SilentlyContinue) { throw 'GTA or OBS still running' }
function HashFile([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() }
function Checked([string]$p, [string]$root) {
    $full = [IO.Path]::GetFullPath($p)
    $prefix = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
    if (!$full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Outside expected root: $full" }
    for ($at = $full; $at; $at = [IO.Path]::GetDirectoryName($at)) {
        if ((Test-Path -LiteralPath $at) -and ((Get-Item -LiteralPath $at -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Reparse path: $full" }
    }
    return $full
}
# This is the previously used completed-install restoration procedure. Partial
# installs require the explicit ledger procedure retained beside the template.
$null = Checked $ledgerPath $run
$null = Checked (Join-Path $run 'scope.json') $run
$null = Checked (Join-Path $run 'approval.json') $run
$null = Checked $PSCommandPath $run
if ($t.schema -cne 'NativeSuppression01Execution' -or $t.candidate -cne 'candidate-08' -or $t.status -cne 'installed-verified') { throw 'Full-install restore requires installed-verified; complete authorized partial rollback from the ledger instead' }
if ($s.candidateName -cne 'candidate-08' -or $s.sourceCommit -cne $t.sourceCommit -or (HashFile (Join-Path $run 'scope.json')) -cne $t.scopeSha256 -or (HashFile $PSCommandPath) -cne $s.installation.rollbackScript.sha256 -or (HashFile (Join-Path $run 'approval.json')) -cne $t.authorizationSha256) { throw 'Execution scope, authorization, or rollback identity differs' }
$expectedGame = @('ScriptHookVDotNet.asi','ScriptHookVDotNet2.dll','ScriptHookVDotNet3.dll','MinHook.x64.dll','ScriptHookVDotNet.ini','scripts\RichAudio.NativeSuppression08.dll','scripts\RichAudio.NativeSuppression08.ini','mods\update\x64\dlcpacks\ra_ns01_8b7e24c1\dlc.rpf','mods\update\update.rpf') | ForEach-Object { Join-Path $game $_ }
$expectedObs = @((Join-Path $obs 'basic\profiles\NativeSuppression01Live08\basic.ini'),(Join-Path $obs 'basic\scenes\NativeSuppression01Live08.json'))
if (@($t.files).Count -ne 11 -or @(Compare-Object ($expectedGame + $expectedObs | Sort-Object) (@($t.files.destination) | Sort-Object)).Count) { throw 'Ledger installation paths differ' }
foreach ($f in $t.files) {
    $root = if ($f.destination -in $expectedGame) { $game } else { $obs }
    $null = Checked $f.destination $root
    $match = @(@($s.gameInstall) + @($s.capture.install) | Where-Object { $_.destination -ceq $f.destination -and $_.source.sha256 -ceq $f.sha256 })
    if ($match.Count -ne 1 -or $f.state -cne 'installed-verified') { throw 'Ledger file identity differs' }
}
$allowedOriginals = @((Join-Path $obs 'user.ini'),(Join-Path $obs 'global.ini')) + @($s.gameSettingsBackups.path) + @($s.logBackupsRequired | Where-Object exists | ForEach-Object path)
if (@(Compare-Object ($allowedOriginals | Sort-Object) (@($t.backups.path) | Sort-Object)).Count) { throw 'Ledger original backup set differs' }
foreach ($b in $t.backups) {
    $root = if ($b.path.StartsWith($game + '\', [StringComparison]::OrdinalIgnoreCase)) { $game } elseif($b.path -in $s.gameSettingsBackups.path) { $settingsRoot } else { $obs }
    $null = Checked $b.path $root
    $null = Checked $b.backup (Join-Path $run 'backups')
}
if ($t.trainer.original -cne (Join-Path $game 'TrainerV.asi') -or $t.trainer.parked -cne (Join-Path $run 'backups\TrainerV.asi') -or $t.trainer.sha256 -cne $s.parkAndRestore.sha256) { throw 'Trainer ledger paths or identity differ' }
$null = Checked $t.trainer.original $game
$null = Checked $t.trainer.parked (Join-Path $run 'backups')
$allowedDirectories = @()
foreach ($destination in @($expectedGame) + @($expectedObs)) {
    $root = if ($destination -in $expectedGame) { $game } else { $obs }
    for ($dir = [IO.Path]::GetDirectoryName($destination); $dir -cne $root; $dir = [IO.Path]::GetDirectoryName($dir)) { $allowedDirectories += $dir }
}
foreach ($dir in $t.createdDirectories) { if ($dir -notin $allowedDirectories) { throw 'Created directory outside the fixed plan' } }
# This path also handles a startup refusal before OBS, using actual absence
# evidence. It never needs an unrelated historical OBS log to permit rollback.
$obsLog = Get-ChildItem -LiteralPath (Join-Path $obs 'logs') -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if(!$obsLog -or $obsLog.CreationTimeUtc -lt [DateTime]$t.startedUtc){
 $obsLog=$null
 if(Test-Path -LiteralPath (Join-Path $run 'record-start-reserved.json')){throw 'Recorder attempted without a retained current OBS log'}
 if(@(Get-ChildItem -LiteralPath (Join-Path $run 'capture') -Force).Count){throw 'Unexpected pre-OBS capture'}
 $statePath=Join-Path $run 'operator\state.json'
 if(Test-Path -LiteralPath $statePath){$state=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json;if($state.Generation-cne'unspawned'-or$state.ActiveStart-ne0){throw 'Pair existed without OBS evidence'}}
 foreach($f in $t.files|Where-Object {$_.destination-in$expectedObs}){if((HashFile $f.destination)-cne$f.sha256){throw 'Pre-OBS candidate changed'}}
}else{$null=Checked $obsLog.FullName $obs}
if((HashFile $s.focusConfiguration.helper.path)-cne$s.focusConfiguration.helper.sha256){throw 'Configuration helper changed'}
Import-Module $s.focusConfiguration.helper.path -Force
$observedFocus=Read-FocusBytes08 ([IO.File]::ReadAllBytes($s.focusConfiguration.path))
$focusHash=[Security.Cryptography.SHA256]::Create()
try{$normalizedFocus=[Convert]::ToHexString($focusHash.ComputeHash($observedFocus.bytes)).ToLowerInvariant()}finally{$focusHash.Dispose()}
if($normalizedFocus-cne$s.focusConfiguration.preparedSha256){throw 'Unexpected unrelated configuration edits; retain state for reviewed recovery'}
$configurationBeforeRestore=HashFile $s.focusConfiguration.path
@{schema='NativeSuppression08ClosureConfiguration';utc=[DateTime]::UtcNow.ToString('o');path=$s.focusConfiguration.path;observedSha256=$configurationBeforeRestore;observedPauseValue=$observedFocus.value;preparedSha256=$s.focusConfiguration.preparedSha256;gameRewroteSetting=($configurationBeforeRestore-cne$s.focusConfiguration.preparedSha256);attribution='Post-closure bytes, not proof of which writer changed them';processesConfirmedClosed=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $run 'closure-configuration.json') -Encoding utf8
$saved = Join-Path $run 'retained-runtime'
$null = Checked $saved $run
if (Test-Path -LiteralPath $saved) { throw 'Retained-runtime already exists; inspect the previous restoration attempt before continuing' }
[IO.Directory]::CreateDirectory($saved) | Out-Null
$receipts = [Collections.Generic.List[object]]::new()
function Preserve([string]$p, [string]$name) {
    $dest = Join-Path $saved $name
    $before = HashFile $p
    [IO.File]::Copy($p, $dest, $false)
    if ((HashFile $dest) -ne $before -or (HashFile $p) -ne $before) { throw "Preservation mismatch: $p" }
    $receipts.Add([pscustomobject]@{source=$p;retained=$dest;sha256=$before;bytes=(Get-Item -LiteralPath $dest).Length})
    return $before
}
# Validate every immutable installed file and every original before mutation.
foreach ($f in $t.files) {
    if ($f.destination.StartsWith($game, [StringComparison]::OrdinalIgnoreCase)) {
        $null = Checked $f.destination $game
        if ((HashFile $f.destination) -ne $f.sha256) { throw "Installed file changed: $($f.destination)" }
    }
}
foreach ($b in $t.backups) { if ((HashFile $b.backup) -ne $b.sha256) { throw "Original backup changed: $($b.backup)" } }
if ((HashFile $t.trainer.parked) -ne $t.trainer.sha256 -or (Test-Path -LiteralPath $t.trainer.original)) { throw 'Trainer restoration conflict' }
$i=0
foreach ($b in $t.backups) { $null = Preserve $b.path ('previously-existing-{0}-{1}' -f $i, [IO.Path]::GetFileName($b.path)); $i++ }
foreach ($l in $s.logBackupsRequired) {
    if (!$l.exists -and (Test-Path -LiteralPath $l.path)) {
        $p = Checked $l.path $game
        $hash = Preserve $p ([IO.Path]::GetFileName($p))
        if ((HashFile $p) -ne $hash) { throw 'New log changed before removal' }
        Remove-Item -LiteralPath $p
    }
}
$journalDir = Join-Path $game 'scripts\RichAudio.NativeSuppression08.Evidence'
if (Test-Path -LiteralPath $journalDir) {
    $null = Checked $journalDir $game
    foreach ($j in Get-ChildItem -LiteralPath $journalDir -Force) {
        if ($j.PSIsContainer -or $j.Name -notmatch '^session-[0-9a-f]{32}\.log$') { throw "Unexpected evidence path $($j.FullName)" }
        $p = Checked $j.FullName $journalDir
        $hash = Preserve $p $j.Name
        if ((HashFile $p) -ne $hash) { throw 'Journal changed before removal' }
        Remove-Item -LiteralPath $p
    }
    if (@(Get-ChildItem -LiteralPath $journalDir -Force).Count -ne 0) { throw 'Evidence directory not empty' }
    Remove-Item -LiteralPath $journalDir
}
# OBS rewrites serialization of its owned temporary collection and creates a backup.
# The actual profile and collection were reviewed before this removal and are retained.
foreach ($f in $t.files) {
    if ($f.destination.StartsWith($obs, [StringComparison]::OrdinalIgnoreCase)) {
        $p = Checked $f.destination $obs
        $hash = Preserve $p ('obs-temporary-' + [IO.Path]::GetFileName($p))
        if ((HashFile $p) -ne $hash) { throw 'OBS file changed before removal' }
        Remove-Item -LiteralPath $p
        $f.state = 'removed-after-retaining-obs-serialization'
    } else {
        if ((HashFile $f.destination) -ne $f.sha256) { throw 'Candidate changed before removal' }
        Remove-Item -LiteralPath $f.destination
        $f.state = 'removed-verified'
    }
}
$sceneBak = Join-Path $obs 'basic\scenes\NativeSuppression01Live08.json.bak'
if (Test-Path -LiteralPath $sceneBak) {
    $null = Checked $sceneBak $obs
    $hash = Preserve $sceneBak 'obs-temporary-NativeSuppression01Live08.json.bak'
    if ((HashFile $sceneBak) -ne $hash) { throw 'OBS backup changed' }
    Remove-Item -LiteralPath $sceneBak
}
if($obsLog){$null = Preserve $obsLog.FullName ('obs-' + $obsLog.Name)}
foreach ($b in $t.backups) {
    if($b.path-ceq$s.focusConfiguration.path){
        # Recheck inside an exclusive handle after retention, before writing.
        # Concurrent changes after the closure snapshot cannot be overwritten.
        $f=[IO.File]::Open($b.path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
        try{$h=[Security.Cryptography.SHA256]::Create();try{$actual=[Convert]::ToHexString($h.ComputeHash($f)).ToLowerInvariant()}finally{$h.Dispose()}
            if($actual-cne$configurationBeforeRestore){throw 'Concurrent configuration edit during restoration'}
            $original=[IO.File]::ReadAllBytes($b.backup);$f.Position=0;$f.Write($original,0,$original.Length);$f.SetLength($original.Length);$f.Flush($true)
        }finally{$f.Dispose()}
    }else{[IO.File]::Copy($b.backup, $b.path, $true)}
    $item = Get-Item -LiteralPath $b.path
    $item.CreationTimeUtc = [DateTime]$b.creationUtc
    $item.LastWriteTimeUtc = [DateTime]$b.lastWriteUtc
    $item.Attributes = [IO.FileAttributes]$b.attributes
    if ((HashFile $b.path) -ne $b.sha256) { throw 'Original restoration mismatch' }
}
Move-Item -LiteralPath $t.trainer.parked -Destination $t.trainer.original
$trainer = Get-Item -LiteralPath $t.trainer.original
$trainer.CreationTimeUtc = [DateTime]$t.trainer.creationUtc
$trainer.LastWriteTimeUtc = [DateTime]$t.trainer.lastWriteUtc
$trainer.Attributes = [IO.FileAttributes]$t.trainer.attributes
if ((HashFile $t.trainer.original) -ne $t.trainer.sha256) { throw 'Trainer restore mismatch' }
$t.trainer.state = 'restored-verified'
foreach ($d in ($t.createdDirectories | Sort-Object Length -Descending)) {
    if (Test-Path -LiteralPath $d) {
        $root = if ($d.StartsWith($game, [StringComparison]::OrdinalIgnoreCase)) { $game } else { $obs }
        $null = Checked $d $root
        if (@(Get-ChildItem -LiteralPath $d -Force).Count -ne 0) { throw "Created directory not empty: $d" }
        Remove-Item -LiteralPath $d
    }
}
$receipts | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $run 'runtime-retention.json') -Encoding utf8
$t.status='restored-awaiting-independent-verification'
$t | Add-Member -NotePropertyName restoredUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$t | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $ledgerPath -Encoding utf8
Write-Output 'All enumerated temporary files removed, originals restored, runtime evidence retained.'
