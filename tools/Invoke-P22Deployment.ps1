# Explicitly approved Phase 2.2 experiment only. No launch, executable-content or archive edits.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('Begin','Restore')][string]$Action,
    [Parameter(Mandatory=$true)][string]$PlanPath,
    [Parameter(Mandatory=$true)][string]$AttemptDirectory
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
$planPath=[IO.Path]::GetFullPath($PlanPath)
if((Get-FileHash -LiteralPath $planPath).Hash -ne '9A12B751A312549150B1484151F41898F5BCF8E5A7BEC29653EA629DBD976906'){throw 'Reviewed plan bytes changed.'}
$plan=Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json
$game=[IO.Path]::GetFullPath($plan.GameRoot).TrimEnd('\')
$local=[IO.Path]::GetFullPath($AttemptDirectory).TrimEnd('\')
if(!$local.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Attempt journal must stay in ignored development storage.'}
$evi=Join-Path $local 'journal'
function Parents([string]$Path){for($d=[IO.DirectoryInfo]::new($Path);$null -ne $d;$d=$d.Parent){if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse-point path rejected: '+$d.FullName}}}
foreach($p in @($game,$evi,$local)){Parents $p}
if(@(Get-Process -Name GTA5,GTA5_Enhanced,RAGEPluginHook,OpenIV,CodeWalker -ErrorAction SilentlyContinue).Count){throw 'Close all game/runtime/tool processes before changing the file state.'}
if($plan.GameRoot -ne $game -or $plan.FileAdditions.Count -ne 26 -or $plan.RenameSource -ne (Join-Path $game 'GTA5.exe') -or $plan.RenameDestination -ne (Join-Path $game '_GTA5.exe')){throw 'Unexpected reviewed scope.'}
foreach($f in $plan.FileAdditions){$dest=[IO.Path]::GetFullPath($f.Destination);if(!$dest.StartsWith($game+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($dest) -eq '.rpf'){throw 'Destination outside approved non-archive scope.'};Parents (Split-Path -Parent $dest)}
[IO.Directory]::CreateDirectory($evi) | Out-Null
[IO.Directory]::CreateDirectory($local) | Out-Null
$receiptPath=Join-Path $evi 'deployment-receipt.json'
function SaveReceipt {$script:receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding utf8}
if($Action -eq 'Begin'){
    if(Test-Path -LiteralPath $receiptPath){throw 'This single attempt already has a receipt; do not overwrite it.'}
    foreach($p in @($plan.RenameSource,$plan.VerifiedBackup)){if((Get-FileHash -LiteralPath $p).Hash -ne $plan.RenameSHA256){throw 'Original/backup fingerprint mismatch.'}}
    if((Get-FileHash -LiteralPath (Join-Path $game 'GTA5_Enhanced.exe')).Hash -ne $plan.ExpectedEnhancedSHA256){throw 'Enhanced binary changed.'}
    if(Test-Path -LiteralPath $plan.RenameDestination){throw 'Rename target occupied.'}
    foreach($f in $plan.FileAdditions){if(Test-Path -LiteralPath $f.Destination){throw 'Existing deployment destination.'};if((Get-FileHash -LiteralPath $f.Source).Hash -ne $f.SHA256){throw 'Deployment source changed.'}}
    $baseline=@(Get-ChildItem -LiteralPath $game -File | Where-Object Extension -ne '.rpf' | ForEach-Object {[pscustomobject]@{Path=$_.FullName;Bytes=$_.Length;SHA256=(Get-FileHash -LiteralPath $_.FullName).Hash}})
    $baseline | ConvertTo-Json | Set-Content (Join-Path $evi 'root-baseline.json') -Encoding utf8
    @(Get-ChildItem -LiteralPath $game -Directory | ForEach-Object FullName) | ConvertTo-Json | Set-Content (Join-Path $evi 'directory-baseline.json') -Encoding utf8
    @(Get-ChildItem -LiteralPath $game -Recurse -File -Filter '*.rpf' | ForEach-Object {[pscustomobject]@{Path=$_.FullName.Substring($game.Length+1);Bytes=$_.Length;LastWriteUtc=$_.LastWriteTimeUtc.ToString('o')}}) | ConvertTo-Json | Set-Content (Join-Path $evi 'archive-metadata-before.json') -Encoding utf8
    $known=@(foreach($p in (Get-Content (Join-Path $repo 'evidence\archive-integrity.json') -Raw | ConvertFrom-Json)){$h=(Get-FileHash -LiteralPath (Join-Path $game $p.Path)).Hash;if($h -ne $p.SHA256){throw 'Archive baseline drift.'};[pscustomobject]@{Path=$p.Path;SHA256=$h}})
    $known | ConvertTo-Json | Set-Content (Join-Path $evi 'archive-hashes-before.json') -Encoding utf8
    $receipt=[ordered]@{StartedUtc=[DateTime]::UtcNow.ToString('o');Approval='Explicit user approval for Phase 2.2 temporary rename, exact 26 additions and one controlled Enhanced Story Mode experiment';PlanSHA256=(Get-FileHash -LiteralPath $planPath).Hash;State='PREFLIGHT_VERIFIED';RenamePerformed=$false;CreatedDirectories=@();Files=@()}
    SaveReceipt
    try{
        [IO.File]::Move($plan.RenameSource,$plan.RenameDestination)
        $receipt.RenamePerformed=$true;$receipt.State='RENAMED';SaveReceipt
        if((Get-FileHash -LiteralPath $plan.RenameDestination).Hash -ne $plan.RenameSHA256 -or (Test-Path -LiteralPath $plan.RenameSource)){throw 'Rename integrity check failed.'}
        foreach($f in $plan.FileAdditions){
            $parent=Split-Path -Parent $f.Destination;Parents $parent
            if(!(Test-Path -LiteralPath $parent)){[IO.Directory]::CreateDirectory($parent) | Out-Null;$receipt.CreatedDirectories+=$parent}
            $inputStream=[IO.File]::OpenRead($f.Source)
            try{$outputStream=[IO.File]::Open($f.Destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);$receipt.Files+=[pscustomobject]@{Destination=$f.Destination;SHA256=$f.SHA256;Bytes=$f.Bytes};SaveReceipt;try{$inputStream.CopyTo($outputStream)}finally{$outputStream.Dispose()}}finally{$inputStream.Dispose()}
            if((Get-FileHash -LiteralPath $f.Destination).Hash -ne $f.SHA256){throw 'Copy integrity mismatch.'}
        }
        $receipt.State='RENAMED_AND_26_ADDITIONS_VERIFIED';$receipt.CompletedUtc=[DateTime]::UtcNow.ToString('o');SaveReceipt
        Write-Output $receipt.State
    }catch{$receipt.State='STOPPED';$receipt.Error=$_.Exception.Message;SaveReceipt;throw}
}else{
    $receipt=Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    $quarantine=Join-Path $local 'rollback-files';Parents $quarantine
    if(!$quarantine.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Rollback target outside workspace.'}
    # Restore the original name first, provided it cannot overwrite anything.
    if(Test-Path -LiteralPath $plan.RenameDestination){
        if(Test-Path -LiteralPath $plan.RenameSource){throw 'Original path occupied; preserve both executables and request review.'}
        if((Get-FileHash -LiteralPath $plan.RenameDestination).Hash -ne $plan.RenameSHA256){throw 'Renamed executable changed; preserve it for review.'}
        [IO.File]::Move($plan.RenameDestination,$plan.RenameSource)
    }
    if((Get-FileHash -LiteralPath $plan.RenameSource).Hash -ne $plan.RenameSHA256){throw 'Restored executable fingerprint mismatch.'}
    $moves=@();$conflicts=@()
    foreach($f in $receipt.Files){
        $approved=@($plan.FileAdditions | Where-Object Destination -eq $f.Destination)
        if($approved.Count -ne 1 -or $approved[0].SHA256 -ne $f.SHA256){throw 'Receipt scope mismatch.'}
        if(!(Test-Path -LiteralPath $f.Destination)){continue}
        if((Get-FileHash -LiteralPath $f.Destination).Hash -ne $f.SHA256){$conflicts+=$f.Destination;continue}
        $target=Join-Path $quarantine $f.Destination.Substring($game.Length+1);Parents (Split-Path -Parent $target)
        if(Test-Path -LiteralPath $target){throw 'Quarantine destination occupied.'}
        [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
        [IO.File]::Move($f.Destination,$target)
        $moves+=[pscustomobject]@{Source=$f.Destination;Destination=$target;SHA256=$f.SHA256}
    }
    foreach($dir in $receipt.CreatedDirectories){if($dir -ne (Join-Path $game 'Plugins')){throw 'Unexpected introduced directory.'};if((Test-Path -LiteralPath $dir) -and @(Get-ChildItem -LiteralPath $dir -Force).Count -eq 0){[IO.Directory]::Delete($dir,$false)}}
    [ordered]@{CompletedUtc=[DateTime]::UtcNow.ToString('o');OriginalNameRestored=$true;OriginalSHA256=(Get-FileHash -LiteralPath $plan.RenameSource).Hash;RemovedAdditions=$moves.Count;Moves=$moves;PreservedEditedFiles=$conflicts;GeneratedFiles='Preserve and review separately against the baseline';SharedVc2010Uninstalled=$false} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $evi 'restoration-receipt.json') -Encoding utf8
    if($conflicts.Count){throw 'Original name restored, but edited deployment files were preserved for review.'}
    Write-Output ('Original executable name/hash restored; '+$moves.Count+' unchanged additions removed.')
}
