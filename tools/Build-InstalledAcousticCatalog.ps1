# Read-only CodeWalker archive inventory. Outputs are private data, never an acoustic world mesh.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$GameRoot,
    [Parameter(Mandatory=$true)][string]$CodeWalkerRoot,
    [string]$OutputRoot='.local/installed-acoustic-catalog',
    [ValidateRange(5,3600)][int]$MaximumSeconds=600,
    [ValidateRange(1,600)][int]$MaximumArchiveSeconds=180,
    [ValidateRange(1,512)][int]$MaximumArchives=256,
    [switch]$HashArchives,
    [string]$CatalogScriptPath='',
    [string]$RunId='',
    [switch]$Worker
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$scriptPath=if($CatalogScriptPath){[IO.Path]::GetFullPath($CatalogScriptPath)}else{$PSCommandPath}
$repo=[IO.Path]::GetFullPath((Split-Path (Split-Path $scriptPath -Parent) -Parent))
$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\')
$cw=[IO.Path]::GetFullPath($CodeWalkerRoot).TrimEnd('\')
$output=if([IO.Path]::IsPathRooted($OutputRoot)){[IO.Path]::GetFullPath($OutputRoot)}else{[IO.Path]::GetFullPath((Join-Path $repo $OutputRoot))}
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'
if(!$output.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'Catalogue output must stay under this workspace .local directory'}
foreach($inputRoot in @($game,$cw)){if($output -eq $inputRoot -or $output.StartsWith($inputRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Output/input overlap'}}
for($part=[IO.DirectoryInfo]::new($output);$null -ne $part;$part=$part.Parent){if($part.Exists -and ($part.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked catalogue output unsupported'}}
[IO.Directory]::CreateDirectory($output)|Out-Null
$lifecyclePath=Join-Path $repo 'src\acoustics\startup\CatalogLifecycle.psm1'
Import-Module (New-Module -Name RichAudioCatalogLifecycle -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($lifecyclePath)))) -Force
$cancel=Join-Path $output 'cancel.request'
$statusFile=Join-Path $output 'status.json'
function Write-Json([string]$Path,$Value,[int]$Depth=14){
    if($Path -eq $statusFile -and $Value -is [Collections.IDictionary]){$Value['RunId']=$RunId}
    [void](Write-CatalogAtomicJson -PrivateRoot $output -Path $Path -Value $Value -Depth $Depth)
}
if(!$Worker){
    $lease=[IO.File]::Open((Join-Path $output 'worker.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try {
    # One owned worker keeps vendor parsing outside a plugin/game/audio callback.
    # The independent parent can terminate that exact process during a blocked scan.
    $framework=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if(!(Test-Path -LiteralPath $framework)){throw 'Installed Windows PowerShell 5.1 required for supplied CodeWalker'}
    if(Test-Path -LiteralPath $cancel){throw 'Cancellation request exists; remove that private request explicitly before resuming'}
    $launch=New-CatalogRunStatus;$RunId=$launch.RunId;Write-Json $statusFile $launch
    function Ps-Literal([string]$Value){return "'"+$Value.Replace("'","''")+"'"}
    # Same trusted ScriptBlock loading as Trace-StockVehicles; execution policy is unchanged.
    $command='$catalogPath='+(Ps-Literal $scriptPath)+'; & ([ScriptBlock]::Create([IO.File]::ReadAllText($catalogPath))) -CatalogScriptPath $catalogPath -Worker -RunId '+(Ps-Literal $RunId)+' -GameRoot '+(Ps-Literal $game)+' -CodeWalkerRoot '+(Ps-Literal $cw)+' -OutputRoot '+(Ps-Literal $output)+' -MaximumSeconds '+$MaximumSeconds+' -MaximumArchiveSeconds '+$MaximumArchiveSeconds+' -MaximumArchives '+$MaximumArchives
    if($HashArchives){$command+=' -HashArchives'}
    $arguments=@('-NoProfile','-NonInteractive','-EncodedCommand',[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command)))
    $process=Start-Process -FilePath $framework -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'worker.stdout.log') -RedirectStandardError (Join-Path $output 'worker.stderr.log')
    $watch=[Diagnostics.Stopwatch]::StartNew();$stopped=$null
    try {
        while(!$process.HasExited){
            if(Test-Path -LiteralPath $cancel){$stopped='cancelled';break}
            if($watch.Elapsed.TotalSeconds -gt $MaximumSeconds){$stopped='deadline';break}
            if(Test-Path -LiteralPath $statusFile){
                try{$state=Get-Content -LiteralPath $statusFile -Raw|ConvertFrom-Json
                    if(Test-CatalogArchiveDeadline -Status $state -RunId $RunId -MaximumArchiveSeconds $MaximumArchiveSeconds){$stopped='archive-deadline';break}
                }catch{}
            }
            Start-Sleep -Milliseconds 200;$process.Refresh()
        }
    } finally {
        if(!$process.HasExited){$process.Kill();$process.WaitForExit();if(!$stopped){$stopped='parent-interrupted'}}
    }
    $process.WaitForExit()
    if($stopped){Write-Json $statusFile ([ordered]@{State=$stopped;Resumable=$true;Completed=$false;AcousticWorldImported=$false});throw ('Catalogue worker '+$stopped+'; completed archive caches retained')}
    if($process.ExitCode -ne 0){throw ('Catalogue worker failed; inspect private worker.stderr.log. Exit '+$process.ExitCode)}
    $summary=Get-Content -LiteralPath (Join-Path $output 'summary.json') -Raw|ConvertFrom-Json
    $summary|ConvertTo-Json -Depth 5
    return
    } finally {$lease.Dispose()}
}

$helperPath=Join-Path $repo 'src\acoustics\startup\InstalledCatalog.psm1'
Import-Module (New-Module -Name RichAudioInstalledCatalog -ScriptBlock ([ScriptBlock]::Create([IO.File]::ReadAllText($helperPath)))) -Force
$clock=[Diagnostics.Stopwatch]::StartNew()
function Check-Cancel {
    if((Test-Path -LiteralPath $cancel) -or $clock.Elapsed.TotalSeconds -gt $MaximumSeconds){throw 'Cancelled or catalogue deadline exceeded'}
}
function File-Hash([string]$Path){
    $stream=[IO.File]::OpenRead($Path);$sha=[Security.Cryptography.SHA256]::Create()
    try{return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
    finally{$stream.Dispose();$sha.Dispose()}
}
$core=Join-Path $cw 'CodeWalker.Core.dll';$exe=Join-Path $game 'GTA5_Enhanced.exe'
foreach($path in @($core,$exe)){if(!(Test-Path -LiteralPath $path -PathType Leaf)){throw 'Required installed executable or supplied CodeWalker missing'}}
$codeHash=File-Hash $core
$binding=[ordered]@{GameExecutable='GTA5_Enhanced.exe';GameVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($exe).FileVersion;GameExecutableSHA256=File-Hash $exe;CodeWalkerCoreSHA256=$codeHash;ScriptSHA256=File-Hash $scriptPath;HelperSHA256=File-Hash (Join-Path $repo 'src\acoustics\startup\InstalledCatalog.psm1');LifecycleSHA256=File-Hash $lifecyclePath}
Write-Json (Join-Path $output 'current-input-binding.json') $binding
foreach($dll in Get-ChildItem -LiteralPath $cw -Filter '*.dll'){[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($dll.FullName))|Out-Null}
[CodeWalker.GameFiles.GTA5Keys]::LoadFromPath($game,$null)
$cache=Join-Path $output 'archive-cache';[IO.Directory]::CreateDirectory($cache)|Out-Null
$all=New-Object Collections.Generic.List[object]
$issues=New-Object Collections.Generic.List[object]
$seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$script:entriesExamined=0;$script:cacheHits=0

function Read-ArchiveCatalog([string]$Relative,[string]$Layer,[int]$DeclaredOrder) {
    Check-Cancel
    if(!$seen.Add($Relative)){return}
    if($seen.Count -gt $MaximumArchives){throw 'Archive count exceeds explicit bound; resume with reviewed larger bound'}
    $path=Resolve-CatalogArchivePath $game $Relative
    if(!(Test-Path -LiteralPath $path -PathType Leaf)){$issues.Add([pscustomobject]@{Kind='archive-missing';Archive=$Relative});return}
    $info=Get-Item -LiteralPath $path
    $stamp=[ordered]@{Archive=$Relative;Layer=$Layer;DeclaredDlcIndex=$DeclaredOrder;Bytes=$info.Length;LastWriteUtc=$info.LastWriteTimeUtc.ToString('o');GameExecutable=$binding.GameExecutableSHA256;CodeWalker=$codeHash;Script=$binding.ScriptSHA256;Helper=$binding.HelperSHA256;HashArchives=[bool]$HashArchives}
    $key=Get-CatalogArchiveFingerprint $stamp
    $cached=Join-Path $cache ($key+'.json')
    Write-Json $statusFile ([ordered]@{State='scanning';Archive=$Relative;ArchiveStartedUtc=[DateTime]::UtcNow.ToString('o');CompletedArchives=$all.Count})
    $row=Read-CatalogCacheJson -PrivateRoot $output -Path $cached -ExpectedFingerprint $key
    if($null -ne $row){
        if(!$HashArchives -or (File-Hash $path) -eq $row.ArchiveSHA256){
            $script:entriesExamined=Add-CatalogEntryWork $script:entriesExamined $row.EntryCount
            $row|Add-Member -NotePropertyName CacheValidation -NotePropertyValue $(if($HashArchives){'content-sha256-reverified'}else{'size-and-write-time-only-not-content-proof'}) -Force;$all.Add($row);$script:cacheHits++;return
        }
    }
    $beforeHash=if($HashArchives){File-Hash $path}else{$null}
    $rpf=New-Object CodeWalker.GameFiles.RpfFile($path,$Relative)
    $errors=New-Object Collections.Generic.List[string]
    $rpf.ScanStructure($null,[Action[string]]{param($message)$errors.Add($message)})
    if($rpf.LastError -or $errors.Count){throw ('Archive scan failed: '+$Relative)}
    $files=New-Object Collections.Generic.List[object]
    function Collect-Entries($archive){foreach($entry in $archive.AllEntries){$files.Add([pscustomobject]@{Owner=$archive;Entry=$entry})};foreach($child in $archive.Children){Collect-Entries $child}}
    Collect-Entries $rpf
    if($files.Count -gt 400000){throw 'Archive entry work bound exceeded'}
    $script:entriesExamined=Add-CatalogEntryWork $script:entriesExamined $files.Count
    $resources=New-Object Collections.Generic.List[object];$manifests=New-Object Collections.Generic.List[object];$vehicles=New-Object Collections.Generic.List[object];$declarations=New-Object Collections.Generic.List[object]
    $xmlByPath=@{};$localIssues=New-Object Collections.Generic.List[object]
    foreach($record in $files){
        Check-Cancel;$entry=$record.Entry;$name=$entry.Name.ToLowerInvariant();$entryPath=$entry.Path.Replace('\','/')
        if($name -match '\.(ybn|ymap|ytyp)$'){$resources.Add([pscustomobject]@{Name=$entry.Name;Kind=$Matches[1];Path=$entryPath;Archive=$Relative;Layer=$Layer;DeclaredDlcIndex=$DeclaredOrder;GeometryImported=$false})}
        if($name -in @('content.xml','setup2.xml','dlclist.xml')){
            try {
                $bytes=$record.Owner.ExtractFile($entry);$doc=Read-CatalogXml $bytes
                $item=[pscustomobject]@{Path=$entryPath;SHA256=Get-CatalogByteHash $bytes;Bytes=$bytes.Length;Kind=$name;DlcDeclarations=@();DeviceName=$null;DeclaredSetupOrder=$null}
                if($name -eq 'dlclist.xml'){$item.DlcDeclarations=@(Get-CatalogDlcDeclarations $doc)}
                if($name -eq 'setup2.xml'){$node=$doc.SelectSingleNode('/*/deviceName');if($node){$item.DeviceName=$node.InnerText};$node=$doc.SelectSingleNode('/*/order');if($node){$item.DeclaredSetupOrder=$node.GetAttribute('value')}}
                foreach($decl in @(Get-CatalogManifestDeclarations $doc $entryPath)){$declarations.Add($decl)}
                $manifests.Add($item);$xmlByPath[$entryPath]=$doc
            }catch{$localIssues.Add([pscustomobject]@{Kind='manifest-parse-failed';Path=$entryPath})}
        }
    }
    $extraVehiclePaths=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach($decl in $declarations){if($decl.FileType -eq 'VEHICLE_METADATA_FILE'){
        $virtual=($decl.Filename -replace '^[^:]+:/','').Replace('\','/').TrimStart('/')
        $matching=@($files|Where-Object{$_.Entry.Path.Replace('\','/').EndsWith('/'+$virtual,[StringComparison]::OrdinalIgnoreCase)})
        if($matching.Count -eq 1){[void]$extraVehiclePaths.Add($matching[0].Entry.Path)}else{$localIssues.Add([pscustomobject]@{Kind='vehicle-manifest-target-unresolved';Filename=$decl.Filename;Candidates=$matching.Count})}
    }}
    foreach($record in $files){
        $entry=$record.Entry
        if($entry.Name -notmatch '^vehicles(?:_[A-Za-z0-9_-]+)?\.meta$' -and !$extraVehiclePaths.Contains($entry.Path)){continue}
        Check-Cancel
        try{$bytes=$record.Owner.ExtractFile($entry);$doc=Read-CatalogXml $bytes;$source=$entry.Path.Replace('\','/');$hash=Get-CatalogByteHash $bytes
            foreach($vehicle in @(Get-CatalogVehicleDeclarations $doc $source)){$vehicle|Add-Member -NotePropertyName MetadataSHA256 -NotePropertyValue $hash;$vehicles.Add($vehicle)}
        }catch{$localIssues.Add([pscustomobject]@{Kind='vehicle-meta-parse-failed';Path=$entry.Path.Replace('\','/')})}
    }
    $after=Get-Item -LiteralPath $path
    if($after.Length -ne $info.Length -or $after.LastWriteTimeUtc -ne $info.LastWriteTimeUtc){throw 'Archive changed while cataloguing'}
    if($HashArchives -and (File-Hash $path) -ne $beforeHash){throw 'Archive content changed while cataloguing'}
    $row=[pscustomobject]@{Schema=1;Fingerprint=$key;Archive=$Relative;Layer=$Layer;DeclaredDlcIndex=$DeclaredOrder;Bytes=$info.Length;LastWriteUtc=$info.LastWriteTimeUtc.ToString('o');ArchiveSHA256=$beforeHash;CacheValidation='fresh-read';EntryCount=$files.Count;Resources=$resources.ToArray();Manifests=$manifests.ToArray();DataDeclarations=$declarations.ToArray();Vehicles=$vehicles.ToArray();Issues=$localIssues.ToArray()}
    Write-Json $cached $row 15;$all.Add($row)
    Write-Json $statusFile ([ordered]@{State='checkpoint';CompletedArchives=$all.Count;EntriesExamined=$script:entriesExamined;Resumable=$true})
}

try {
    # update.rpf supplies the actual declared dlclist, before ordered DLC work.
    Read-ArchiveCatalog 'update\update.rpf' 'update' -1
    $dlcLists=@($all[0].Manifests|Where-Object{$_.Path -match '(?i)/common/data/dlclist\.xml$'})
    if($dlcLists.Count -ne 1){throw 'Unique update dlclist not established'}
    $orderedDlc=@($dlcLists[0].DlcDeclarations)
    foreach($file in Get-ChildItem -LiteralPath $game -File -Filter '*.rpf'|Sort-Object Name){Read-ArchiveCatalog $file.Name 'base' -1}
    $baseDirectory=Join-Path $game 'x64'
    if(Test-Path -LiteralPath $baseDirectory){foreach($file in Get-ChildItem -LiteralPath $baseDirectory -File -Filter '*.rpf' -Recurse|Sort-Object FullName){Read-ArchiveCatalog $file.FullName.Substring($game.Length+1) 'base' -1}}
    foreach($file in Get-ChildItem -LiteralPath (Join-Path $game 'update') -File -Filter '*.rpf'|Sort-Object Name){Read-ArchiveCatalog $file.FullName.Substring($game.Length+1) 'update' -1}
    foreach($dlc in $orderedDlc){
        if(!$dlc.SupportedPath){$issues.Add([pscustomobject]@{Kind='unsupported-dlc-route';Index=$dlc.Index;Route=$dlc.Route});continue}
        Read-ArchiveCatalog ('update\x64\dlcpacks\'+$dlc.Pack+'\dlc.rpf') 'declared-dlc' $dlc.Index
    }
    $vehicles=@($all|ForEach-Object Vehicles);$resources=@($all|ForEach-Object Resources)
    $modelSummary=@(Get-CatalogModelSummary $vehicles)
    $conflicts=@($resources|Group-Object { $_.Name.ToLowerInvariant() }|Where-Object Count -GT 1|ForEach-Object{[pscustomobject]@{Name=$_.Name;CandidateCount=$_.Count;Paths=@($_.Group|ForEach-Object Path);EffectiveSelection='unresolved-mount-precedence-and-changesets'}})
    $allIssues=@($issues.ToArray())+@($all|ForEach-Object Issues)
    $catalog=[ordered]@{Schema=1;Stage='installed-resource-reference-catalog';GeneratedUtc=[DateTime]::UtcNow.ToString('o');InputBinding=$binding;DeclaredDlcList=$orderedDlc;Archives=$all.ToArray();Models=$modelSummary;ResourceConflicts=$conflicts;Issues=$allIssues;EffectiveMountSelectionComplete=$false;AcousticWorldImported=$false;RuntimeReplacementImplemented=$false;Limitations=@('Directory and declared dlclist order are not proof of runtime activation or override priority','Changesets, platform overrides, mods-folder and plugin mounts are not evaluated','YBN/YMAP/YTYP references only: no world transforms, triangles, portals or acoustic materials imported','Model audioNameHash links are declarations; blank fallback is inferred; sound graphs and PCM are not decoded','No game launch, native audio suppression or endpoint access')}
    Write-Json (Join-Path $output 'catalog.json') $catalog 17
    $summary=[ordered]@{Schema=1;State='reference-catalog-complete-with-explicit-gaps';GameVersion=$binding.GameVersion;GameExecutableSHA256=$binding.GameExecutableSHA256;CodeWalkerCoreSHA256=$codeHash;ArchiveCount=$all.Count;DeclaredDlcCount=$orderedDlc.Count;VehicleDeclarations=$vehicles.Count;UniqueModels=$modelSummary.Count;ConflictingModelAudioDeclarations=@($modelSummary|Where-Object ConflictingAudioDeclarations).Count;YbnReferences=@($resources|Where-Object Kind -EQ 'ybn').Count;YmapReferences=@($resources|Where-Object Kind -EQ 'ymap').Count;YtypReferences=@($resources|Where-Object Kind -EQ 'ytyp').Count;ResourceNameConflicts=$conflicts.Count;UnresolvedIssueCount=$allIssues.Count;ArchiveContentHashesRequired=[bool]$HashArchives;CacheHits=$script:cacheHits;ElapsedSeconds=[Math]::Round($clock.Elapsed.TotalSeconds,3);EffectiveMountSelectionComplete=$false;AcousticWorldImported=$false;RuntimeReplacementImplemented=$false;GameWrites=$false;AudioDecoded=$false;EndpointOpened=$false}
    Write-Json (Join-Path $output 'summary.json') $summary
    Write-Json $statusFile ([ordered]@{State='complete';Completed=$true;Resumable=$true;AcousticWorldImported=$false;CompletedArchives=$all.Count})
} catch {
    Write-Json $statusFile ([ordered]@{State='failed';Completed=$false;Resumable=$true;CompletedArchives=$all.Count;AcousticWorldImported=$false})
    throw
}
