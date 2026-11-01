#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BuildReceipt,[Parameter(Mandatory)][string]$ValidationReceipt,[string]$Output='')
$ErrorActionPreference='Stop';$repo=Split-Path -Parent $PSScriptRoot
function Hash([string]$p){(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}
function Unlinked([string]$p){for($at=[IO.Path]::GetFullPath($p);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked preparation path.'}}}
function PrivateInput([string]$p){$full=[IO.Path]::GetFullPath($(if([IO.Path]::IsPathRooted($p)){$p}else{Join-Path $repo $p}));Unlinked $full;if(!$full.StartsWith((Join-Path $repo '.local/playable-10').TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Reviewed new10 private input required.'};return $full}
$buildPath=PrivateInput $BuildReceipt;$validationPath=PrivateInput $ValidationReceipt
if((Hash $buildPath)-cne'0b8f884941ef4b9efa84ad2d19a19aeaf863702f3994142a100bd9705c363ea3'){throw 'Unreviewed diagnostic build receipt.'}
if((Hash $validationPath)-cne'66381837ed41890aef9a645c25961b4820f277e1e48efc2951528e3d195ab8a7'){throw 'Unreviewed compiled-profile validation receipt.'}
$build=Get-Content -LiteralPath $buildPath -Raw|ConvertFrom-Json;$validation=Get-Content -LiteralPath $validationPath -Raw|ConvertFrom-Json
if($build.pluginSha256-cne'cb2555ba00169af86d2728ba545c808a825df0ab04ba08026f1268e02d3caf3a'-or$build.pluginBytes-ne66560-or$build.diagnosticOnly-ne$true-or$build.fixturePolicy-ne$false-or$build.sourceAttachmentAllowed-ne$false-or$build.audioPlaybackAllowed-ne$false){throw 'Wrong exact diagnostic artifact/profile.'}
if($validation.passed-ne$true-or$validation.cases-ne25-or$validation.pluginSha256-cne$build.pluginSha256-or$validation.buildReceiptSha256-cne(Hash $buildPath)){throw 'Compiled profile validation does not bind this candidate.'}
function Checked([string]$p,[string]$sha,[long]$bytes=-1){Unlinked $p;if((Hash $p)-cne$sha-or($bytes-ge0-and(Get-Item -LiteralPath $p).Length-ne$bytes)){throw ('Preservation/artifact mismatch: '+[IO.Path]::GetFileName($p))}}
function PrivateInputOrSource([string]$p){$full=[IO.Path]::GetFullPath($p);Unlinked $full;if(!$full.StartsWith($repo.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Source outside workspace.'};return $full}
foreach($pin in $build.sources){$p=PrivateInputOrSource $pin.path;Checked $p $pin.sha256}
Checked $build.pluginPath $build.pluginSha256 $build.pluginBytes
Checked $build.sessionTemplatePath $build.sessionTemplateSha256
$baselinePath=Join-Path $repo '.local/playable-10/baseline.json';Checked $baselinePath '773b947526b5b83e8bfa6cdbaabd0b20ce2802ec2b2d523b53dac20fd95bbe28'
$b=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json
foreach($pin in @($b.trackedPins)+@($b.preserved09PrivatePins)){Checked (Join-Path $repo $pin.name) $pin.sha256 $pin.bytes}
foreach($pin in @($b.protected)+@($b.settings)){Checked $pin.path $pin.sha256}
$gameEntry=@($b.protected|Where-Object name -eq 'GTA5_Enhanced.exe')[0]
$game=Split-Path -Parent $gameEntry.path
$original=@($b.protected|Where-Object name -eq 'Plugins/RichAudio.dll')[0]
$newPaths=@('Plugins/RichAudio.RuntimeProvenance.json','Plugins/RichAudio.RuntimeProvenance.json.playable10.pending','Plugins/RichAudio.dll.playable10.pending','Plugins/RichAudio.dll.playable10.original',
 'Plugins/RichAudio.ShvHandoff.json','Plugins/RichAudio.dll.playable09.pending','Plugins/RichAudio.dll.playable09.original','RichAudio.OperatingState.Shv.asi','RichAudio.OperatingState.ShvHandoff.asi')
foreach($relative in $newPaths){$path=Join-Path $game $relative;Unlinked $path;if(Test-Path -LiteralPath $path){throw 'Owned diagnostic/probe path occupied.'}}
if(@(Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.ProcessName-match'^(GTA5|GTA5_Enhanced|RAGEPluginHook|RichAudio.*)$'}).Count){throw 'Relevant process is present.'}
$oldManifest=Get-Content -LiteralPath (Join-Path $repo '.local/playable-09/candidate/installation-manifest.json') -Raw|ConvertFrom-Json
$settings=Get-Content -LiteralPath $oldManifest.reviewedShortcutBaselines[3].path -Raw|ConvertFrom-Json
if($settings.integrationMode-cne'stock-fallback'){throw 'Stock fallback must remain selected.'}
$features=Get-Content -LiteralPath (Join-Path $repo 'config/production-features.json') -Raw|ConvertFrom-Json
if($features.modificationAwareLoudness-ne$false-or$features.synchronizedAudioRecording-ne$false){throw 'Production foundations must remain disabled.'}
if(!$Output){$Output=Join-Path $repo '.local/playable-10/candidate'}
$out=[IO.Path]::GetFullPath($Output);Unlinked $out
if((Split-Path -Parent $out)-cne(Join-Path $repo '.local/playable-10')-or(Split-Path -Leaf $out)-notmatch'^candidate(?:-[a-z0-9-]+)?$'){throw 'A new direct10 candidate directory is required.'}
if(Test-Path -LiteralPath $out){throw 'Candidate already exists; no overwrite.'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$target=Join-Path $out 'RichAudio.dll'
$source=[IO.File]::Open($build.pluginPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
try{
 $sha=[Security.Cryptography.SHA256]::Create();try{$pinned=[Convert]::ToHexString($sha.ComputeHash($source)).ToLowerInvariant()}finally{$sha.Dispose()}
 if($pinned-cne$build.pluginSha256-or$source.Length-ne$build.pluginBytes){throw 'Pinned diagnostic input changed.'};$source.Position=0
 $dest=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$source.CopyTo($dest);$dest.Flush($true)}finally{$dest.Dispose()}
}finally{$source.Dispose()}
Checked $target $build.pluginSha256 $build.pluginBytes
$payload=[ordered]@{source=$target;destination=(Join-Path $game 'Plugins/RichAudio.dll');pendingPath=(Join-Path $game 'Plugins/RichAudio.dll.playable10.pending');backupPath=(Join-Path $game 'Plugins/RichAudio.dll.playable10.original');sha256=$build.pluginSha256;bytes=$build.pluginBytes;originalSha256=$original.sha256;originalBytes=$original.bytes;owner='PLAYABLE-10 strict runtime-provenance-only diagnostic'}
$lease=[ordered]@{sourceTemplate=$build.sessionTemplatePath;templateSha256=$build.sessionTemplateSha256;destination=(Join-Path $game 'Plugins/RichAudio.RuntimeProvenance.json');pendingPath=(Join-Path $game 'Plugins/RichAudio.RuntimeProvenance.json.playable10.pending');maximumBytes=8192;creation='Only after separately authorised one-launch actual PID/kernel creation is known; record exact bytes/hash/ownership, then create-only pending/verify/atomic rename';expectedRuntimeState='UNREVIEWED'}
$install=[ordered]@{schema=1;profile='PLAYABLE-10';purpose='rph-runtime-provenance-only';executed=$false;requiresFreshExplicitApproval=$true;payload=@($payload);lease=$lease;asiPayload=@();nativeProducerPreservedButNotDeployed=$true;diagnosticOnly=$true;sourceAttachmentAllowed=$false;audioAllowed=$false
 protectedInstallation=$b.protected;settings=$b.settings
 operations=@('Recheck exact reviewed artifact/receipt/validation and all11protected/foursettings; no relevant processes; paths unlinked/absent','After exact approval only: CreateNew pending copy while input pinned; flush and verify hash/length','Verify original plugin then move it to absent same-volume owned backup; pending to plugin; verify both','Launch once through existing reviewed RPH route; no retry/second launch or ASI deployment','Create strict process-bound diagnostic-only lease from template after actual PID/kernel creation; receipt exact hash and length; no runtime identity can be supplied as reviewed','Wait for one bounded private report/terminal failure; no driving, vehicle native, handoff, gameplay or audio','Exit normally before any rollback; retain private report/logs; publish sanitized facts only')}
$rollback=[ordered]@{schema=1;profile='PLAYABLE-10';executed=$false;requiresProcessExit=$true;noHotUnload=$true;ownershipReceiptRequired=$true;payload=$payload;leasePaths=@($lease.destination,$lease.pendingPath);leaseSha256='Exact generated lease digest in creation receipt; never wildcard';asiDeletionAllowed=$false;recursiveDeletionAllowed=$false;capturesDeleted=$false
 operations=@('Confirm game/RPH/owned processes ended; no forced interruption guarantee','Verify ownership+exact candidate hash/length before removing only temporary plugin/pending','Verify original backup hash/length; move to absent original plugin path without overwrite; verify exactoriginal','Remove only owned lease/pending matching creation receipt/hash/length','Refuse changed or unknown files; never delete another ASI or recursive tree','Recheck11protected/foursettings, stockfallback, falseflags and owned-path/process absence; retain reports/logs')}
$preflight=[ordered]@{schema=1;profile='PLAYABLE-10';result='PASS';artifactSha256=$build.pluginSha256;artifactBytes=$build.pluginBytes;buildReceiptSha256=(Hash $buildPath);validationReceiptSha256=(Hash $validationPath);baselineSha256=(Hash $baselinePath);protectedFilesVerified=11;settingsVerified=4;trackedFilesPreserved=$b.trackedPinCount;prior09PrivateFilesPreserved=$b.preserved09PrivatePinCount;stockFallback=$true;productionFeaturesDisabled=$true;ownedPathsAbsent=$true;relevantProcessesAbsent=$true;asiPayloadCount=0;gameFilesWritten=$false;gameLaunched=$false;approvalGranted=$false}
foreach($pair in @(@('installation-manifest.json',$install),@('rollback-manifest.json',$rollback),@('preflight.json',$preflight))){$pair[1]|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $out $pair[0]) -Encoding utf8}
Write-Output ('PASS exact diagnostic-only proposal prepared privately; no game writes or launch: '+$out)
