# Bind the offline registration artifacts. This never grants runtime admission.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$GameRoot,
 [Parameter(Mandatory=$true)][string]$ShadowReceipt,
 [Parameter(Mandatory=$true)][string]$DlcReceipt,
 [Parameter(Mandatory=$true)][string]$ResourceManifest,
 [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$task=[IO.Path]::GetFullPath((Join-Path $repo '.local\gate-a-shvdne-private-01')).TrimEnd('\')+'\'
function PrivatePath([string]$p){
 $full=[IO.Path]::GetFullPath($p)
 if(!$full.StartsWith($task,[StringComparison]::OrdinalIgnoreCase)){throw 'Artifact path must remain task-local'}
 for($part=$full;$part;$part=[IO.Path]::GetDirectoryName($part)){if((Test-Path -LiteralPath $part)-and((Get-Item -LiteralPath $part -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked artifact path refused'}}
 return $full
}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function BoundFile([string]$p,[string]$expected,[long]$bytes){
 if(!(Test-Path -LiteralPath $p -PathType Leaf)){throw ('Missing bound file: '+$p)}
 if($expected-notmatch'^[a-f0-9]{64}$'-or(Hash $p)-cne$expected-or(Get-Item -LiteralPath $p).Length-ne$bytes){throw ('Bound file integrity mismatch: '+$p)}
}
$out=PrivatePath $Output
if(Test-Path -LiteralPath $out){throw 'Fresh receipt path required'}
$ShadowReceipt=PrivatePath $ShadowReceipt;$DlcReceipt=PrivatePath $DlcReceipt;$ResourceManifest=PrivatePath $ResourceManifest
$shadow=Get-Content -LiteralPath $ShadowReceipt -Raw|ConvertFrom-Json
$dlc=Get-Content -LiteralPath $DlcReceipt -Raw|ConvertFrom-Json
$resource=Get-Content -LiteralPath $ResourceManifest -Raw|ConvertFrom-Json
$pack='ra_private01_6a13f902'
if($shadow.pack-cne$pack-or$dlc.pack-cne$pack-or$shadow.state-cne'offline-complete-shadow-verified'-or$dlc.state-cne'offline-layout-verified'){throw 'Wrong private registration receipt'}
if(!$shadow.sourceUnchanged-or$shadow.gameFilesWritten-or$shadow.runtimeMountVerified-or$shadow.approvedForInstallation-or$dlc.gameFilesWritten-or$dlc.runtimeMounted-or$dlc.approvedForInstallation-or$dlc.offlineRegistrationAdmitted){throw 'Offline-only evidence state required'}
if(!$dlc.sourceManifest-or$dlc.sourceManifest.path-cne$ResourceManifest-or$dlc.sourceManifest.sha256-cne(Hash $ResourceManifest)){throw 'Resource manifest is not bound to DLC receipt'}
$game=[IO.Path]::GetFullPath($GameRoot).TrimEnd('\')
$original=Join-Path $game 'update\update.rpf'
if([IO.Path]::GetFullPath($shadow.source)-cne$original){throw 'Unexpected original update archive source'}
BoundFile $original $shadow.sourceSha256 $shadow.sourceBytes
BoundFile (PrivatePath $shadow.shadow) $shadow.shadowSha256 $shadow.shadowBytes
BoundFile (PrivatePath $dlc.archive) $dlc.sha256 $dlc.bytes
if($shadow.sourceSha256-cne$shadow.sourceAfterSha256-or$shadow.entries-ne1790-or$shadow.untouchedEntriesVerified-ne1789-or$shadow.originalDlcItems-ne103-or$shadow.appendedMount-cne('dlcpacks:/'+$pack+'/')){throw 'Complete-shadow inventory contract differs'}
if($shadow.proposedDestination-cne'mods/update/update.rpf'-or$dlc.proposedDestination-cne('mods/update/x64/dlcpacks/'+$pack+'/dlc.rpf')){throw 'Proposed installation destination differs'}
$types=@('AUDIO_GAMEDATA','AUDIO_SOUNDDATA','AUDIO_WAVEPACK')
$logical=@(('dlc_'+$pack+':/x64/audio/config/ra_private01_game.dat'),('dlc_'+$pack+':/x64/audio/config/ra_private01_sounds.dat'),('dlc_'+$pack+':/x64/audio/sfx/dlc_'+$pack))
if($dlc.sourceInputs.Count-ne3-or$dlc.members.Count-ne5-or$dlc.registrationTypes.Count-ne3-or$dlc.logicalNames.Count-ne3){throw 'Unexpected resource scope'}
for($i=0;$i-lt3;$i++){if($dlc.registrationTypes[$i]-cne$types[$i]-or$dlc.logicalNames[$i]-cne$logical[$i]){throw 'Registration names/types differ'}}
foreach($input in $dlc.sourceInputs){BoundFile (PrivatePath $input.path) $input.sha256 $input.bytes}
$loader=Join-Path $game 'OpenRPF.asi'
$loaderHash='57d6cc782d8608c32b5b43b74882a3ad162796e0215c58b8fcb2f7c7d9e9d3a8'
BoundFile $loader $loaderHash 1173504
if((Get-Item -LiteralPath $loader).VersionInfo.FileVersion-cne'0.1.0'){throw 'Expected installed OpenRPF 0.1.0 identity'}
$receipt=[ordered]@{
 schema=1;kind='private-registration-admission';state='offline-artifacts-verified-registration-blocked';profile='ra_gapriv01_bati';pack=$pack
 completeShadowOfflineVerified=$true;dlcLayoutOfflineVerified=$true;resourceManifestBound=$true
 offlineRegistrationAdmitted=$false;runtimeMounted=$false;runtimeSelectionVerified=$false;gameFilesWritten=$false;approvedForInstallation=$false
 blocker='Installed OpenRPF 0.1.0 has no matched exact-build 1.0.1158.16 archive-redirection and Gen9 cache-handling qualification. Current author claims include later 0.2/0.3 changes and cannot qualify this binary. This does not establish incompatibility.'
 installedLoader=[ordered]@{source=$loader;relativeDestination='OpenRPF.asi';bytes=1173504;sha256=$loaderHash;fileVersion='0.1.0';role='existing dependency; no replacement packaged';compatibilityAdmitted=$false}
 proposedFiles=@(
  [ordered]@{source=$shadow.shadow;relativeDestination='mods/update/update.rpf';bytes=$shadow.shadowBytes;sha256=$shadow.shadowSha256;role='complete private shadow, only DLC list changed'},
  [ordered]@{source=$dlc.archive;relativeDestination=('mods/update/x64/dlcpacks/'+$pack+'/dlc.rpf');bytes=$dlc.bytes;sha256=$dlc.sha256;role='private audio resource DLC'}
 )
 originalArchive=[ordered]@{path=$original;sha256=$shadow.sourceSha256;bytes=$shadow.sourceBytes;unchanged=$true}
 evidence=@([ordered]@{path=$ShadowReceipt;sha256=(Hash $ShadowReceipt)},[ordered]@{path=$DlcReceipt;sha256=(Hash $DlcReceipt)},[ordered]@{path=$ResourceManifest;sha256=(Hash $ResourceManifest)})
 loadContract=[ordered]@{listEntry=('dlcpacks:/'+$pack+'/');setup='setup2.xml';content='content.xml';group='GROUP_STARTUP';types=$types;logicalNames=$logical;runtimePrecedenceVerified=$false}
 recovery='After a separately authorized normal game exit, remove only newly created identical private files or restore previously snapshotted files byte-for-byte. Vehicle retirement, resource unload, installation restoration, and prior-profile restoration are distinct; none is implied by this receipt.'
}
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($out))|Out-Null
$receipt|ConvertTo-Json -Depth 7|Set-Content -LiteralPath $out -Encoding UTF8
Write-Output ('PASS bound offline artifacts; registration remains BLOCKED: '+$out)
