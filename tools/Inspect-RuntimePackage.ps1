# Inspect the user-supplied official archive. Never install or execute its contents.
[CmdletBinding()]
param([string]$PackagePath='__USER_HOME__\Downloads\lspdfr_049_9695_Manual_Install_Enhanced_1158_16.zip')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$stage=Join-Path $repo '.local\rph\runtime-9695-1158.16'
$reports=Join-Path $repo 'evidence\phase2.1'
$expected='8524E534F219C7F33634ED45CED055F3C7B0B461FA8302FF2F0AC46470C7ED34'
foreach($path in @($stage,$reports)){
    for($d=[IO.DirectoryInfo]::new($path);$null -ne $d;$d=$d.Parent){
        if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse-point output paths are unsupported.'}
    }
}
if((Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash -ne $expected){throw 'Package does not match the publisher checksum reviewed on 24 October 2026.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($PackagePath)
$inventory=@();$selected=@()
try {
    if($zip.Entries.Count -gt 4096){throw 'Archive entry bound exceeded.'}
    $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach($entry in $zip.Entries){
        $name=$entry.FullName.Replace('\','/')
        if($name -match '(^/|:|(^|/)\.\.(/|$))' -or !$seen.Add($name)){throw 'Unsafe/duplicate archive name.'}
        $take=($entry.Length -gt 0 -and ($name -notmatch '/' -or $name -match '^licenses/[^/]+$'))
        $inventory+= [pscustomobject]@{Name=$name;Bytes=$entry.Length;CompressedBytes=$entry.CompressedLength;StagedForInspection=$take}
        if(!$take){continue}
        if($entry.Length -gt 64MB){throw 'Inspection file size bound exceeded.'}
        $destination=Join-Path $stage $name
        for($d=[IO.DirectoryInfo]::new((Split-Path -Parent $destination));$null -ne $d;$d=$d.Parent){
            if($d.Exists -and ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse-point extraction parent.'}
        }
        [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
        if(Test-Path -LiteralPath $destination){
            if((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse-point destination.'}
            # Repeated inspection verifies bytes, never overwrites previously staged files.
            $inputStream=$entry.Open();$sha=[Security.Cryptography.SHA256]::Create()
            try {$entryHash=([BitConverter]::ToString($sha.ComputeHash($inputStream))).Replace('-','')}finally{$sha.Dispose();$inputStream.Dispose()}
            if((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $entryHash){throw 'Staged file drift; preserve and review it before restaging.'}
        } else {
            $inputStream=$entry.Open();$outputStream=[IO.File]::Open($destination,[IO.FileMode]::CreateNew)
            try {$inputStream.CopyTo($outputStream)}finally{$inputStream.Dispose();$outputStream.Dispose()}
        }
        $selected+=$name
    }
} finally {$zip.Dispose()}
[IO.Directory]::CreateDirectory($reports) | Out-Null
[ordered]@{
    SchemaVersion=1;InspectedUtc=[DateTime]::UtcNow.ToString('o');SourcePath=[IO.Path]::GetFullPath($PackagePath)
    SHA256=$expected;PublisherChecksumMatched=$true
    SourcePage='https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/'
    Acquisition='Authentic package supplied by the user; no automated terms acceptance or access-control workaround.'
    StageDirectory=$stage;StagedFiles=$selected;Entries=$inventory
    StagedArtifacts=@($selected | ForEach-Object {$p=Join-Path $stage $_;[pscustomobject]@{Name=$_;SHA256=(Get-FileHash -LiteralPath $p).Hash;Bytes=(Get-Item -LiteralPath $p).Length}})
    Scope='ZIP directory and root/runtime/license extraction for local inspection only. LSPDFR assets/plugins are not extracted. No package code executed or redistributed.'
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $reports 'package-inspection.json') -Encoding utf8
[pscustomobject]@{ChecksumMatched=$true;Entries=$inventory.Count;StagedFiles=$selected.Count;Stage=$stage} | ConvertTo-Json
