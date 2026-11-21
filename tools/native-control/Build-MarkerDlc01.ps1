# Builds a private OPEN RPF and verifies its extracted bytes. No installation IO.
#requires -Version 7.0
param([Parameter(Mandatory)][string]$MarkerReview,[Parameter(Mandatory)][string]$CodeWalkerCore,
 [Parameter(Mandatory)][string]$Output,[switch]$FunctionsOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
function Assert-MarkerPrivate01([string]$File){
 $full=[IO.Path]::GetFullPath($File)
 if(!$full.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Private marker preparation path required'}
 for($dir=$full;$dir;$dir=[IO.Path]::GetDirectoryName($dir)){
  if((Test-Path -LiteralPath $dir) -and ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked marker path'}
 }
 return $full
}
function Read-MarkerRpf01([string]$File){
 $p=Assert-MarkerPrivate01 $File
 $rpf=[CodeWalker.GameFiles.RpfFile]::new($p,[IO.Path]::GetFileName($p))
 $rpf.ScanStructure($null,$null)
 if($rpf.LastError -or $rpf.Encryption -ne [CodeWalker.GameFiles.RpfEncryption]::OPEN){throw 'Exact OPEN RPF required'}
 return $rpf
}
function Add-MarkerDlcListEntry01([string]$PrivateOpenUpdateRpf,[string]$Pack,[string]$OriginalDlclistSHA256){
 if($Pack -cnotmatch '^raprobe_[a-f0-9]{8}$' -or $OriginalDlclistSHA256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Exact marker list entry required'}
 $rpf=Read-MarkerRpf01 $PrivateOpenUpdateRpf
 $entry=@($rpf.AllEntries|Where-Object {$_.Path.EndsWith('\common\data\dlclist.xml')})
 if($entry.Count -ne 1){throw 'One effective DLC list entry required'}
 $bytes=$rpf.ExtractFile($entry[0])
 if(!$bytes -or $bytes.Length -gt 1MB -or [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant() -cne $OriginalDlclistSHA256){throw 'Bound DLC list bytes differ'}
 $xml=[xml][Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xfeff)
 $paths=$xml.SelectSingleNode('/SMandatoryPacksData/Paths')
 $mount="dlcpacks:/$Pack/"
 if(!$paths -or $paths.SelectNodes('Item').Count -gt 2048 -or @($paths.SelectNodes('Item')|Where-Object InnerText -IEQ $mount).Count){throw 'Duplicate or malformed DLC list'}
 $item=$xml.CreateElement('Item');$item.InnerText=$mount;[void]$paths.AppendChild($item)
 $changed=[Text.UTF8Encoding]::new($false).GetBytes($xml.OuterXml)
 [void][CodeWalker.GameFiles.RpfFile]::CreateFile($entry[0].Parent,'dlclist.xml',$changed,$true)
 $check=Read-MarkerRpf01 $PrivateOpenUpdateRpf
 $reopened=@($check.AllEntries|Where-Object {$_.Path.EndsWith('\common\data\dlclist.xml')})
 if($reopened.Count -ne 1 -or [Convert]::ToBase64String($check.ExtractFile($reopened[0])) -cne [Convert]::ToBase64String($changed)){throw 'DLC list round-trip differs'}
}
if($FunctionsOnly){return}
$review=Get-Content -LiteralPath (Assert-MarkerPrivate01 $MarkerReview) -Raw|ConvertFrom-Json
$device=$review.device
if($review.mode -cne 'resolve-a' -or $device -cnotmatch '^dlc_raprobe_[a-f0-9]{8}$' -or $review.expectedMarkerA -cne '022894e9'){throw 'A-only retained marker required'}
if((Get-FileHash -LiteralPath $CodeWalkerCore).Hash -cne '3D2BB91B35CF0D1888C12772A9AF25441ADEA3CCC8510A149FCF0D47C8E71CA8'){throw 'Reviewed CodeWalker Core required'}
Add-Type -Path $CodeWalkerCore
$rel=$review.reusedPayload|Where-Object {$_.path.EndsWith('.dat151.rel')}
if(@($rel).Count -ne 1){throw 'One private DAT151 required'}
$relPath=Assert-MarkerPrivate01 $rel.path
if($rel.bytes -ne 300 -or (Get-Item -LiteralPath $relPath).Length -ne $rel.bytes -or (Get-FileHash -LiteralPath $relPath).Hash -cne $rel.sha256){throw 'Retained DAT151 pin differs'}
$root=Assert-MarkerPrivate01 $Output
if(Test-Path -LiteralPath $root){throw 'Fresh marker output required'}
[IO.Directory]::CreateDirectory($root)|Out-Null
$pack=$device.Substring(4)
$entry="$($device):/x64/audio/config/richaudio_probe_game.dat151.rel"
$change=$pack+'_STARTUP'
$setup="<SSetupData><deviceName>$device</deviceName><datFile>content.xml</datFile><timeStamp>2026-11-07T00:00:00Z</timeStamp><nameHash>$pack</nameHash><contentChangeSets/><contentChangeSetGroups><Item><NameHash>GROUP_STARTUP</NameHash><ContentChangeSets><Item>$change</Item></ContentChangeSets></Item></contentChangeSetGroups><startupScript/><scriptCallstackSize value=`"0`"/><type>EXTRACONTENT_COMPAT_PACK</type><order value=`"50`"/><minorOrder value=`"0`"/><isLevelPack value=`"false`"/><dependencyPackHash/><requiredVersion/><subPackCount value=`"0`"/></SSetupData>"
$content="<CDataFileMgr__ContentsOfDataFileXml><disabledFiles/><includedXmlFiles/><includedDataFiles/><dataFiles><Item><filename>$entry</filename><fileType>AUDIO_GAMEDATA</fileType><overlay value=`"false`"/><disabled value=`"true`"/><persistent value=`"false`"/></Item></dataFiles><contentChangeSets><Item><changeSetName>$change</changeSetName><filesToEnable><Item>$entry</Item></filesToEnable><filesToDisable/><txdToLoad/><txdToUnload/><residentResources/><unregisterResources/></Item></contentChangeSets><patchFiles/></CDataFileMgr__ContentsOfDataFileXml>"
$utf8=[Text.UTF8Encoding]::new($false)
$rpf=[CodeWalker.GameFiles.RpfFile]::CreateNew($root,'dlc.rpf',[CodeWalker.GameFiles.RpfEncryption]::OPEN)
$x64=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($rpf.Root,'x64')
$audio=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($x64,'audio')
$config=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($audio,'config')
$payload=[ordered]@{'setup2.xml'=$utf8.GetBytes($setup);'content.xml'=$utf8.GetBytes($content);'richaudio_probe_game.dat151.rel'=[IO.File]::ReadAllBytes($relPath)}
foreach($name in $payload.Keys){$parent=if($name.EndsWith('.rel')){$config}else{$rpf.Root};[void][CodeWalker.GameFiles.RpfFile]::CreateFile($parent,$name,$payload[$name],$false)}
$file=Join-Path $root 'dlc.rpf';$read=Read-MarkerRpf01 $file
if(@($read.AllEntries|Where-Object {$_ -is [CodeWalker.GameFiles.RpfFileEntry]}).Count -ne 3){throw 'Unexpected marker pack payload'}
foreach($name in $payload.Keys){
 $row=@($read.AllEntries|Where-Object Name -CEQ $name)
 if($row.Count -ne 1 -or [Convert]::ToBase64String($read.ExtractFile($row[0])) -cne [Convert]::ToBase64String($payload[$name])){throw 'Marker pack readback differs'}
 if($name.EndsWith('.rel') -and !$row[0].Path.EndsWith('\x64\audio\config\'+$name)){throw 'Marker REL mount path differs'}
}
$setupDoc=[xml]$setup;$parsedSetup=[CodeWalker.GameFiles.DlcSetupFile]::new();$parsedSetup.Load($setupDoc)
$contentDoc=[xml]$content;$parsedContent=[CodeWalker.GameFiles.DlcContentFile]::new();$parsedContent.Load($contentDoc)
if($parsedSetup.deviceName -cne $device -or $parsedSetup.datFile -cne 'content.xml' -or
 $parsedSetup.contentChangeSetGroups[0].ContentChangeSets[0] -cne $change -or
 $parsedContent.dataFiles[0].fileType -cne 'AUDIO_GAMEDATA' -or $parsedContent.dataFiles[0].filename -cne $entry -or
 $parsedContent.contentChangeSets[0].filesToEnable[0] -cne $entry){throw 'DLC registration metadata did not round-trip'}
$setup,$content|ForEach-Object -Begin {$idx=0} -Process {[IO.File]::WriteAllText((Join-Path $root @('setup2.xml','content.xml')[$idx++]),$_,$utf8)}
[ordered]@{schema=1;approved=$false;pack=$pack;device=$device;dataFile=$entry;loadGroup='GROUP_STARTUP'
 listEntry="dlcpacks:/$pack/";proposedDestination="mods/update/x64/dlcpacks/$pack/dlc.rpf"
 proposedListArchive='mods/update/update.rpf';listMember='common/data/dlclist.xml'
 bytes=(Get-Item -LiteralPath $file).Length;sha256=(Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant();relSha256=$rel.sha256
 enhancedMountVerified=$false;onlyPrivateArchiveWritten=$true
}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'pack-receipt.json') -Encoding utf8NoBOM
