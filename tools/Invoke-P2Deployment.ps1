# Explicit operator action required. This tool never launches GTA or changes system/security settings.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('Install','Rollback')][string]$Action)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
$root='__GAME_ROOT__'
$manifestPath=Join-Path $repo 'evidence\phase2.1\deployment-manifest.json'
if((Get-FileHash -LiteralPath $manifestPath).Hash -ne 'A53A9B4FBB039E91F805ED2F7CA2A637E80D79309D456BF8700123245AA7F051'){throw 'Approved manifest bytes changed; review a new manifest before deployment.'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$receiptPath=Join-Path $repo 'evidence\phase2.1\live-attempt-20261024\deployment-receipt.json'
function Parents([string]$Path){for($d=[IO.DirectoryInfo]::new($Path);$null -ne $d;$d=$d.Parent){if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse-point path rejected: '+$d.FullName}}}
Parents $root;Parents (Split-Path -Parent $receiptPath)
if(@(Get-Process -Name 'GTA5_Enhanced','GTA5','RAGEPluginHook' -ErrorAction SilentlyContinue).Count){throw 'Exit GTA and RPH before changing deployed files.'}
if($manifest.Files.Count -ne 26 -or $manifest.GameRoot -ne $root){throw 'Unexpected approved manifest scope.'}
foreach($file in $manifest.Files){
    $dest=[IO.Path]::GetFullPath($file.Destination)
    if(!$dest.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($dest) -eq '.rpf'){throw 'Destination outside approved non-archive scope.'}
    Parents (Split-Path -Parent $dest)
}
if($Action -eq 'Install'){
    $attemptResult=Join-Path (Split-Path -Parent $receiptPath) 'result.json'
    if((Test-Path -LiteralPath $attemptResult) -and (Get-Content -LiteralPath $attemptResult -Raw | ConvertFrom-Json).Outcome -eq 'STOPPED_RUNTIME_TARGET_MISMATCH'){
        throw 'This attempt stopped on a runtime target mismatch. Review an author-supported targeting plan before a new installation attempt.'
    }
    if(Test-Path -LiteralPath $receiptPath){throw 'A deployment receipt already exists; do not overwrite history.'}
    if((Get-FileHash -LiteralPath (Join-Path $root 'GTA5_Enhanced.exe')).Hash -ne $manifest.ExpectedGameSHA256){throw 'Game executable changed.'}
    foreach($file in $manifest.Files){
        if(Test-Path -LiteralPath $file.Destination){throw 'Existing destination conflict: '+$file.Destination}
        if((Get-FileHash -LiteralPath $file.Source).Hash -ne $file.SHA256){throw 'Source hash mismatch: '+$file.Source}
    }
    foreach($name in @('MSVCR100.dll','MSVCP100.dll')){if(!(Test-Path -LiteralPath (Join-Path "$env:WINDIR\System32" $name))){throw 'Approved system prerequisite is not present.'}}
    $receipt=[ordered]@{SchemaVersion=1;StartedUtc=[DateTime]::UtcNow.ToString('o');Approval='Explicit current-chat user approval for the verified 26-file proposal and controlled Story Mode test';ManifestSHA256=(Get-FileHash -LiteralPath $manifestPath).Hash;State='INSTALLING';CreatedDirectories=@();Files=@()}
    try{
        foreach($file in $manifest.Files){
            $parent=Split-Path -Parent $file.Destination;Parents $parent
            if(!(Test-Path -LiteralPath $parent)){[IO.Directory]::CreateDirectory($parent) | Out-Null;$receipt.CreatedDirectories+= $parent}
            $inputStream=[IO.File]::OpenRead($file.Source)
            try{
                # CreateNew atomically refuses a destination introduced since preflight.
                $outputStream=[IO.File]::Open($file.Destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
                try{$inputStream.CopyTo($outputStream)}finally{$outputStream.Dispose()}
            }finally{$inputStream.Dispose()}
            $receipt.Files+=[pscustomobject]@{Source=$file.Source;Destination=$file.Destination;SHA256=$file.SHA256;Bytes=$file.Bytes}
            $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $receiptPath -Encoding utf8
            if((Get-FileHash -LiteralPath $file.Destination).Hash -ne $file.SHA256){throw 'Post-copy fingerprint mismatch.'}
        }
        $receipt.State='INSTALLED_VERIFIED';$receipt.CompletedUtc=[DateTime]::UtcNow.ToString('o')
    }catch{$receipt.State='PARTIAL_INSTALL_STOPPED';$receipt.Error=$_.Exception.Message;throw}
    finally{$receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $receiptPath -Encoding utf8}
    Write-Output 'Installed and verified 26 additions; no pre-existing destination overwritten.'
}else{
    $receipt=Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    $quarantine=Join-Path $repo '.local\deployment-P2-01-20261024\rollback-files'
    Parents $quarantine
    if(!$quarantine.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Rollback output escapes development workspace.'}
    $moves=@()
    foreach($file in $receipt.Files){
        $approved=@($manifest.Files | Where-Object Destination -eq $file.Destination)
        if($approved.Count -ne 1 -or $approved[0].SHA256 -ne $file.SHA256){throw 'Receipt path is not in approved manifest.'}
        if(!(Test-Path -LiteralPath $file.Destination)){continue}
        if((Get-FileHash -LiteralPath $file.Destination).Hash -ne $file.SHA256){throw 'Preserve edited deployed file; manual review needed: '+$file.Destination}
        $target=Join-Path $quarantine $file.Destination.Substring($root.Length+1)
        if(Test-Path -LiteralPath $target){throw 'Rollback quarantine target already exists.'}
        $moves+=[pscustomobject]@{Source=$file.Destination;Destination=$target;SHA256=$file.SHA256}
    }
    foreach($move in $moves){
        Parents (Split-Path -Parent $move.Source);Parents (Split-Path -Parent $move.Destination)
        [IO.Directory]::CreateDirectory((Split-Path -Parent $move.Destination)) | Out-Null
        Move-Item -LiteralPath $move.Source -Destination $move.Destination
    }
    foreach($dir in $receipt.CreatedDirectories){
        if($dir -ne (Join-Path $root 'Plugins')){throw 'Unexpected directory in receipt.'}
        if((Test-Path -LiteralPath $dir) -and @(Get-ChildItem -LiteralPath $dir -Force).Count -eq 0){[IO.Directory]::Delete($dir,$false)}
    }
    [ordered]@{CompletedUtc=[DateTime]::UtcNow.ToString('o');State='APPROVED_ADDITIONS_REMOVED';Files=@($moves);SharedVcRuntimeUninstalled=$false;GeneratedRuntimeFiles='Preserved separately pending ownership review'} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path (Split-Path -Parent $receiptPath) 'rollback-receipt.json') -Encoding utf8
    Write-Output ('Moved '+$moves.Count+' unchanged introduced files back to the separate workspace; originals untouched.')
}
