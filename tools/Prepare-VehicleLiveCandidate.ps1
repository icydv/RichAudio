# Reuses the reviewed filesystem-only attempt helpers; prepares outside GTA only.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BaselineManifest,
 [Parameter(Mandatory=$true)][string]$HelperDirectory,
 [string]$Output='.local/vehicle-live-01-review',
 [string]$UpstreamCorrectionCommit='pending')
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$sourceHead=(git -C $repo rev-parse HEAD).Trim()
if($LASTEXITCODE-ne0-or$sourceHead-notmatch'^[a-f0-9]{40}$'){throw 'Exact committed source identity required'}
$dirty=@(git -C $repo status --porcelain --untracked-files=all -- src tools tests config .github docs README.md)
if($LASTEXITCODE-ne0-or$dirty.Count){throw 'Commit all relevant source, tests, configuration and documentation before preparing the exact candidate'}
if($UpstreamCorrectionCommit-ne'pending'-and$UpstreamCorrectionCommit-notmatch'^[a-f0-9]{40}$'){throw 'Upstream correction must be pending or an exact commit'}
$package=[IO.Path]::GetFullPath((Join-Path $repo $Output))
$privateRoot=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+[IO.Path]::DirectorySeparatorChar
if(!$package.StartsWith($privateRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Fresh private workspace package required'}
for($parent=[IO.DirectoryInfo]::new($package);$null-ne$parent;$parent=$parent.Parent){if($parent.Exists-and($parent.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked package path rejected'}}
if(Test-Path -LiteralPath $package){throw 'Fresh package directory required'}
$oldManifest=[IO.Path]::GetFullPath($BaselineManifest)
$old=Get-Content -LiteralPath $oldManifest -Raw|ConvertFrom-Json
# The preserved deployment manifest has SchemaVersion; Schema belongs to the
# separate attempt/journal format consumed by the filesystem-only helpers.
if($old.SchemaVersion-ne1-or$old.GameVersion-ne'1.0.1158.16'-or$old.RphVersion-ne'1.132.1428.17748'-or!([IO.Path]::IsPathRooted($old.GameRoot))-or@($old.Files).Count-ne26){throw 'Reviewed exact-build 26-file SchemaVersion baseline manifest required before the new menu addition'}
$gameRoot=[IO.Path]::GetFullPath($old.GameRoot)
if($package-eq$gameRoot-or$package.StartsWith($gameRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or$gameRoot.StartsWith($package+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Package/game overlap rejected'}
$destinations=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($file in $old.Files){
 $relative=$file.RelativeDestination
 if(!$relative-or[IO.Path]::IsPathRooted($relative)-or$relative-match'(^|[\\/])\.{1,2}([\\/]|$)|[:\x00]'-or!$destinations.Add($relative.Replace('/','\'))){throw 'Unsafe or duplicate baseline destination'}
 $destination=[IO.Path]::GetFullPath((Join-Path $gameRoot $relative))
 if(!$destination.StartsWith($gameRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or$destination-ne([IO.Path]::GetFullPath($file.Destination))-or$file.SHA256-notmatch'^[A-Fa-f0-9]{64}$'){throw 'Baseline destination/hash scope differs'}
}
if(!$destinations.Contains('Plugins\RichAudio.Beacon.Rph.dll')-or$destinations.Contains('Plugins\RichAudio.Menu.json')){throw 'Baseline must contain one bridge and no prior menu sidecar'}
$renameSource=Join-Path $gameRoot 'GTA5.exe';$renameDestination=Join-Path $gameRoot '_GTA5.exe'
# Node/Windows temporary paths may use a short-name spelling (for example the
# runner's profile directory). Compare both sides under the same normalization.
if(![IO.Path]::IsPathRooted($old.RenameSource)-or![IO.Path]::IsPathRooted($old.RenameDestination)-or[IO.Path]::GetFullPath($old.RenameSource)-ne$renameSource-or[IO.Path]::GetFullPath($old.RenameDestination)-ne$renameDestination){throw 'Original executable rename scope differs'}
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash}
function Json([string]$Path,$Value){[IO.File]::WriteAllText($Path,($Value|ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))}
$reviewedHelpers=@{
 'Invoke-Session.ps1'='6C1E2787F48D91508F4555633121CD8FE3091862DF3CFCF4E43F360F13F281AD'
 'Verify-Original.ps1'='C4D79FDE7484512866A028577C7E8A5C67469ACE8F8B80347AFADE260A1630FC'
 'LaunchOnly.Common.ps1'='55BF89CC8517F0D8538227DAD9B7F0F1E1B80851EBDB97CEEBC068FF2B1FE7AA'
}
foreach($name in $reviewedHelpers.Keys){if((Hash (Join-Path $HelperDirectory $name))-ne$reviewedHelpers[$name]){throw 'Unreviewed filesystem-only attempt helper'}}
function Copy-New([string]$Source,[string]$Target){
 $resolvedTarget=[IO.Path]::GetFullPath($Target)
 if(!$resolvedTarget.StartsWith($package+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Copy target escaped new private package'}
 for($taskItem=[IO.FileInfo]::new([IO.Path]::GetFullPath($Source));$null-ne$taskItem;){if((Test-Path -LiteralPath $taskItem.FullName)-and((Get-Item -LiteralPath $taskItem.FullName -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked source'};$taskParent=Split-Path $taskItem.FullName -Parent;if(!$taskParent-or$taskParent-eq$taskItem.FullName){break};$taskItem=[IO.FileInfo]::new($taskParent)}
 [IO.Directory]::CreateDirectory((Split-Path $Target))|Out-Null
 [IO.File]::Copy($Source,$Target,$false)
 if((Hash $Source)-ne(Hash $Target)){throw 'Copied artifact differs'}
}
# Preserved baseline hashes are bound below; Verify-Original checks the current
# installation read-only after package creation, without claiming a prior check.
$historical=@($oldManifest)+@($old.Files.Source)+@(Get-ChildItem -LiteralPath $old.BaselineDirectory -File|ForEach-Object FullName)+@(Get-ChildItem -LiteralPath $old.ExecutableBackupDirectory -File|ForEach-Object FullName)
$historicalHashes=@($historical|ForEach-Object{[ordered]@{Path=$_;SHA256=Hash $_}})
[IO.Directory]::CreateDirectory($package)|Out-Null
$app=Join-Path $package 'app';[IO.Directory]::CreateDirectory($app)|Out-Null
foreach($area in @('src','tools','tests\fixtures')){
 foreach($f in Get-ChildItem -LiteralPath (Join-Path $repo $area) -File -Recurse){
  if($f.Extension-in@('.mjs','.js','.html','.css')-or$f.Name-eq'Open-SoundMap.ps1'){
   $relative=$f.FullName.Substring($repo.Length+1);Copy-New $f.FullName (Join-Path $app $relative)
  }
 }
}
foreach($relative in @('build\acoustics-host\RichAudio.Acoustics.Host.exe','build\acoustic-gpu\RichAudio.AcousticGpu.exe')){Copy-New (Join-Path $repo $relative) (Join-Path $app $relative)}
[IO.Directory]::CreateDirectory((Join-Path $app '.local'))|Out-Null
Json (Join-Path $app '.local\geometry-model.json') ([ordered]@{basis='declared-demonstration-scale';metresPerNativeUnit=1;sourceOffsetNative=@(0,0,0);reference='vehicle-live-01-unit-scale-assumption-not-physical-calibration'})
Json (Join-Path $app '.local\acoustic-settings.json') ([ordered]@{schemaVersion=1;revision=1;acousticQuality='balanced';acousticAcceleration='auto';richAudioEnabled=$true;outputLevel=1;earlyReflections=$true;diagnosticsOverlay=$true})
$files=@(foreach($f in $old.Files){
 $source=if($f.RelativeDestination-eq'Plugins\RichAudio.Beacon.Rph.dll'){Join-Path $repo 'build\acoustics07\transport\RichAudio.Beacon.Rph.dll'}else{$f.Source}
 if($f.RelativeDestination-ne'Plugins\RichAudio.Beacon.Rph.dll'-and(Hash $source)-ne$f.SHA256){throw 'Historical runtime drift'}
 $copy=Join-Path $package ('runtime\'+$f.RelativeDestination);Copy-New $source $copy
 [ordered]@{RelativeDestination=$f.RelativeDestination;Source=$copy;Destination=Join-Path $gameRoot $f.RelativeDestination;SHA256=Hash $copy}
})
$menu=Join-Path $package 'runtime\Plugins\RichAudio.Menu.json'
Json $menu ([ordered]@{schemaVersion=1;workspaceRoot=$app;settingsPath='.local/acoustic-settings.json';toggleKey='F10';controllerEnabled=$true;soundMap=[ordered]@{enabled=$true;autoStartService=$true;openWindow=$true;sampleHz=20;port=17833;nodeExecutable=(Get-Command node.exe).Source}})
$files+=[ordered]@{RelativeDestination='Plugins\RichAudio.Menu.json';Source=$menu;Destination=Join-Path $gameRoot 'Plugins\RichAudio.Menu.json';SHA256=Hash $menu}
$baseline=Join-Path $package 'baseline';$backups=Join-Path $package 'original-executables'
foreach($f in Get-ChildItem -LiteralPath $old.BaselineDirectory -File){Copy-New $f.FullName (Join-Path $baseline $f.Name)}
foreach($f in Get-ChildItem -LiteralPath $old.ExecutableBackupDirectory -File){Copy-New $f.FullName (Join-Path $backups $f.Name)}
$manifest=[ordered]@{SchemaVersion=1;GameRoot=$gameRoot;GameVersion=$old.GameVersion;RphVersion=$old.RphVersion;Files=$files;BaselineDirectory=$baseline;ExecutableBackupDirectory=$backups;RenameSource=$renameSource;RenameDestination=$renameDestination;RenameSHA256=$old.RenameSHA256;GeneratedFiles=$old.GeneratedFiles}
$manifestPath=Join-Path $package 'deployment-manifest.json';Json $manifestPath $manifest
foreach($name in @('Invoke-Session.ps1','Verify-Original.ps1','LaunchOnly.Common.ps1')){Copy-New (Join-Path $HelperDirectory $name) (Join-Path $package $name)}
# Narrow scope adaptation in this new copy only. Earlier sealed helpers are untouched.
$commonPath=Join-Path $package 'LaunchOnly.Common.ps1'
$common=(Get-Content -LiteralPath $commonPath -Raw).Replace('RICHAUDIO_083_COMBINED','RICHAUDIO_VEHICLE_LIVE01')
if(!$common.Contains('if($Context.Fixture){return} # Only explicit temp-root fixtures can reach this bypass.')-or!$common.Contains('RICHAUDIO_VEHICLE_LIVE01')){throw 'Reviewed attempt-helper scope/approval guard required'}
$common=$common.Replace('if($Context.Fixture){return} # Only explicit temp-root fixtures can reach this bypass.', 'if($Context.Fixture){return} # Only explicit temp-root fixtures can reach this bypass.'+"`n"+' if($Context.Candidate.liveReady-ne$true){throw ''Vehicle candidate awaits reconciled upstream correction and new exact-build readiness review''}')
[IO.File]::WriteAllText($commonPath,$common,[Text.UTF8Encoding]::new($false))
$initialSettings=Join-Path $app '.local\acoustic-settings.json'
$selectedBrowser=@((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),(Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'))|Where-Object{Test-Path -LiteralPath $_ -PathType Leaf}|Select-Object -First 1
if(!$selectedBrowser){throw 'Reviewed automatic SoundMap window requires an installed supported browser'}
$boundFiles=@(Get-ChildItem -LiteralPath $app -File -Recurse|Where-Object FullName -ne $initialSettings|ForEach-Object FullName)+@($files.Source)+@((Get-Command node.exe).Source,$selectedBrowser)
$candidate=[ordered]@{schema=1;state='REVIEW_ONLY';scope='RICHAUDIO_VEHICLE_LIVE01';liveAuthorised=$false;maximumAttempts=1;baseCommit='247e7ff2af8f1670ba454ae303ba56cb4f16fb19';vehiclePhysicsCommit='eef0cbc2e96e09754d87b375975eb1053422121e';upstreamCorrectionCommit=$UpstreamCorrectionCommit;liveReady=$false;readinessBlockers=@('Published and tested upstream trim/spatial/latency correction must be reconciled and revalidated','Fresh explicit exact-build supervised listening authorization required');sourceHead=$sourceHead;cwd=$app;
 targetGta='1.0.1158.16';targetRph='1.132.1428.17748';pluginSha256=Hash (Join-Path $package 'runtime\Plugins\RichAudio.Beacon.Rph.dll');hostSha256=Hash (Join-Path $app 'build\acoustics-host\RichAudio.Acoustics.Host.exe');
 executable=Join-Path $app 'build\acoustics-host\RichAudio.Acoustics.Host.exe';
 args=@('--root',$app,'--scene','open-road','--vehicle-profile','v12','--beacon-output-trim-db','0','--sources','8','--gain','0.20','--seconds','60','--device','default','--listener-pipe','--geometry-model',(Join-Path $app '.local\geometry-model.json'),'--acoustic-settings',(Join-Path $app '.local\acoustic-settings.json'),'--soundmap-config',(Join-Path $app '.local\soundmap\service.json'),'--output',(Join-Path $app '.local\host-live-01'));
 listeningOperator=[ordered]@{executable=(Get-Command node.exe).Source;script=Join-Path $app 'tools\listening\run.mjs';clock='node:perf_hooks.performance.now';protocol='begin then await spawned+host-ready, permit-listener, UI Return, listener-issued, confirm-listener (transport/context/conditional-renderer; geometry optional), record-and-emit';readinessSecondsMaximum=15;stopSecondsTarget=45;hostSecondsMaximum=60;cleanupBackstopSeconds=65;noPipeProbe=$true};
 soundMap=@('node.exe',(Join-Path $app 'tools\soundmap\server.mjs'),'--root',$app,'--port','17833');
 recordings=Join-Path $app '.local\soundmap';
 passiveSoundMap=[ordered]@{enabled=$true;sampleHzMaximum=20;leaseMs=500;autoStartService=$true;autoOpenWindow=$true;dedicatedPerOwnerProfile=$true;browser=$selectedBrowser;browserSHA256=Hash $selectedBrowser;opensAudio=$false;startsSensing=$false};
 phases=[ordered]@{loading='One RPH launch; no host/audio endpoint until Story Mode stable; supervised loading limit 10 minutes';passive='Enabled passive camera at <=20 Hz automatically starts owned SoundMap service/window after Story readiness; verify actual camera following and recorder connection before host; no audio or sensing auto-start';listening='Start host only after stable Story Mode and verified passive following; RichAudioVehicleDemoStart v12 once in selected player-driven car before host+15s; nominal Stop at host+45s, hard host duration 60s';geometry='At most two existing <=12s sensing sessions, <=72 queries each; unchanged stationary/on-foot guards';shutdown='Use listening operator: stop recording/emission at45s, RichAudioVehicleDemoStop and geometry normal Stop, hoststop50s hard60s; quit game; explicitly close owned SoundMap window and owner-stop service; confirm selected processes absent, restore and independently verify'};
 audio=[ordered]@{source='original-generated V12 eight component physics';profile='v12';stockAudio='additive-experimental-playback';rpmProvenance='bounded speed/gear estimate; normalized getter logged but untrusted';rendererMasterGain=.35;hostGain=.20;outputTrimDb=0;preHostPeakLimit=.5;microphone=$false;loopback=$false;gtaMix=$false};
 privateMutableInputs=@('.local/acoustic-settings.json','.local/soundmap/service.json');
 initialSettings=[ordered]@{Path=$initialSettings;SHA256=Hash $initialSettings};
 bindings=@($boundFiles|ForEach-Object{[ordered]@{Path=$_;SHA256=Hash $_}})}
$candidatePath=Join-Path $package 'candidate.json';Json $candidatePath $candidate
$baselinePaths=@(Get-ChildItem -LiteralPath $baseline -File|ForEach-Object FullName)+@(Get-ChildItem -LiteralPath $backups -File|ForEach-Object FullName)
$plan=[ordered]@{Schema=1;State='REVIEW_ONLY';Scope='RICHAUDIO_VEHICLE_LIVE01';FixtureOnly=$false;PackageDirectory=$package;OriginalCandidatePath=$candidatePath;OriginalCandidateSHA256=Hash $candidatePath;ManifestPath=$manifestPath;ManifestSHA256=Hash $manifestPath;
 Paths=[ordered]@{Journal=Join-Path $package 'state\deployment-journal.json';Quarantine=Join-Path $package 'quarantine';Observations=Join-Path $package 'observations';RestorationResult=Join-Path $package 'restoration\independent.json';FreshApproval=Join-Path $package 'fresh-approval.json';ShellEvidence=Join-Path $package 'observations\shell-check.txt'};
 HelperBindings=@(@('Invoke-Session.ps1','Verify-Original.ps1','LaunchOnly.Common.ps1')|ForEach-Object{$p=Join-Path $package $_;[ordered]@{Path=$p;SHA256=Hash $p}});
 BaselineBindings=@($baselinePaths|ForEach-Object{[ordered]@{Path=$_;SHA256=Hash $_}})}
Json (Join-Path $package 'attempt.json') $plan
foreach($h in $historicalHashes){if((Hash $h.Path)-ne$h.SHA256){throw 'Historical evidence changed'}}
Json (Join-Path $package 'preservation.json') ([ordered]@{checked=$historicalHashes.Count;unchanged=$true;bindings=$historicalHashes})
# These hash-pinned existing helpers have no launch code. Verify is read-only and no fresh
# approval, journal, game write, endpoint or process launch is performed here.
& (Join-Path $package 'Invoke-Session.ps1') -Action Verify
& (Join-Path $package 'Verify-Original.ps1') -BaselineOnly
Write-Output ('REVIEW ONLY candidate: '+$package)
Write-Output ('Candidate SHA256: '+(Hash $candidatePath))
Write-Output ('Attempt SHA256: '+(Hash (Join-Path $package 'attempt.json')))
