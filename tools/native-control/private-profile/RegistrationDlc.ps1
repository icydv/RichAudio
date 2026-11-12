# Pack only the prepared private audio graph. No installer and no game writes.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ResourceRoot,
 [Parameter(Mandatory=$true)][string]$Output,
 [string]$CodeWalkerCore='C:\Users\Libby\Desktop\CodeWalker30_dev46\CodeWalker.Core.dll'
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local\gate-a-shvdne-private-01')).TrimEnd('\')+'\'
foreach($path in @($ResourceRoot,$Output)){
 $full=[IO.Path]::GetFullPath($path)
 if(!$full.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'Only private task-local inputs/outputs permitted'}
 for($p=$full;$p;$p=[IO.Path]::GetDirectoryName($p)){if((Test-Path -LiteralPath $p)-and((Get-Item -LiteralPath $p -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked private package path refused'}}
}
$out=[IO.Path]::GetFullPath($Output)
if(Test-Path -LiteralPath $out){throw 'Fresh output required'}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
if((Hash $CodeWalkerCore)-cne'3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'){throw 'Pinned CodeWalker required'}
$pack='ra_private01_6a13f902';$device='dlc_'+$pack;$waveFolder=$device
$names=@('ra_private01_game.dat151.rel','ra_private01_sounds.dat54.rel','ra_private01_marker.awc')
$inputs=@(foreach($name in $names){$path=Join-Path $ResourceRoot $name;if(!(Test-Path -LiteralPath $path -PathType Leaf)){throw ('Missing resource: '+$name)};[pscustomobject]@{name=$name;path=$path;bytes=(Get-Item $path).Length;sha256=(Hash $path)}})
if(@($inputs|Where-Object {$_.bytes-le0-or$_.bytes-gt16MB}).Count){throw 'Bounded nonempty resource payload required'}
$manifestPath=Join-Path $ResourceRoot 'resource-manifest.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
$manifestHash=Hash $manifestPath
if($manifest.schema-cne'RichAudioPrivateVehicleResource01'-or$manifest.packName-cne$pack-or$manifest.deviceName-cne$device-or$manifest.profileName-cne'ra_gapriv01_bati'-or!$manifest.experimentalOnly-or!$manifest.disabledByDefault-or$manifest.publicRedistributionAllowed){throw 'Expected private experimental resource manifest'}
if($manifest.files.Count-ne3-or!$manifest.validation.bodyReversalEqual-or!$manifest.validation.relReadback-or!$manifest.validation.awcReadback-or!$manifest.validation.pcmRoundtripExact){throw 'Offline resource checks required'}
foreach($input in $inputs){$bound=@($manifest.files|Where-Object path -CEQ $input.name);if($bound.Count-ne1-or$bound[0].sha256-cne$input.sha256-or$bound[0].bytes-ne$input.bytes){throw ('Resource manifest integrity differs: '+$input.name)}}
[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($CodeWalkerCore))|Out-Null
[IO.Directory]::CreateDirectory($out)|Out-Null
$gameLogical=$device+':/x64/audio/config/ra_private01_game.dat'
$soundLogical=$device+':/x64/audio/config/ra_private01_sounds.dat'
$waveLogical=$device+':/x64/audio/sfx/'+$waveFolder
$change=$pack+'_STARTUP'
$setup=@"
<?xml version="1.0" encoding="UTF-8"?>
<SSetupData>
 <deviceName>$device</deviceName><datFile>content.xml</datFile><timeStamp>2026-11-12T00:00:00Z</timeStamp><nameHash>$pack</nameHash>
 <contentChangeSets/><contentChangeSetGroups><Item><NameHash>GROUP_STARTUP</NameHash><ContentChangeSets><Item>$change</Item></ContentChangeSets></Item></contentChangeSetGroups>
 <startupScript/><scriptCallstackSize value="0"/><type>EXTRACONTENT_COMPAT_PACK</type><order value="50"/><minorOrder value="0"/><isLevelPack value="false"/><dependencyPackHash/><requiredVersion/><subPackCount value="0"/>
</SSetupData>
"@
$content=@"
<?xml version="1.0" encoding="UTF-8"?>
<CDataFileMgr__ContentsOfDataFileXml>
 <disabledFiles/><includedXmlFiles/><includedDataFiles/>
 <dataFiles>
  <Item><filename>$gameLogical</filename><fileType>AUDIO_GAMEDATA</fileType><overlay value="false"/><disabled value="true"/><persistent value="false"/></Item>
  <Item><filename>$soundLogical</filename><fileType>AUDIO_SOUNDDATA</fileType><overlay value="false"/><disabled value="true"/><persistent value="false"/></Item>
  <Item><filename>$waveLogical</filename><fileType>AUDIO_WAVEPACK</fileType><overlay value="false"/><disabled value="true"/><persistent value="false"/></Item>
 </dataFiles>
 <contentChangeSets><Item><changeSetName>$change</changeSetName><filesToEnable><Item>$gameLogical</Item><Item>$soundLogical</Item><Item>$waveLogical</Item></filesToEnable><filesToDisable/><txdToLoad/><txdToUnload/><residentResources/><unregisterResources/></Item></contentChangeSets>
 <patchFiles/>
</CDataFileMgr__ContentsOfDataFileXml>
"@
$utf8=New-Object Text.UTF8Encoding($false)
$rpf=[CodeWalker.GameFiles.RpfFile]::CreateNew($out,'dlc.rpf',[CodeWalker.GameFiles.RpfEncryption]::OPEN)
$x64=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($rpf.Root,'x64')
$audio=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($x64,'audio')
$config=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($audio,'config')
$sfx=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($audio,'sfx')
$waves=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($sfx,$waveFolder)
$payload=[ordered]@{'setup2.xml'=$utf8.GetBytes($setup);'content.xml'=$utf8.GetBytes($content)}
foreach($i in $inputs){$payload[$i.name]=[IO.File]::ReadAllBytes($i.path)}
foreach($name in $payload.Keys){$parent=if($name.EndsWith('.rel')){$config}elseif($name.EndsWith('.awc')){$waves}else{$rpf.Root};[void][CodeWalker.GameFiles.RpfFile]::CreateFile($parent,$name,$payload[$name],$false)}
$file=Join-Path $out 'dlc.rpf'
$read=New-Object CodeWalker.GameFiles.RpfFile($file,'dlc.rpf');$read.ScanStructure($null,$null)
if($read.LastError-or$read.Encryption-ne[CodeWalker.GameFiles.RpfEncryption]::OPEN){throw 'Private DLC archive failed reopening'}
$files=@($read.AllEntries|Where-Object {$_-is[CodeWalker.GameFiles.RpfFileEntry]})
if($files.Count-ne5){throw 'Expected only two manifests and three private resources'}
$verified=@()
foreach($name in $payload.Keys){
 $member=@($files|Where-Object Name -CEQ $name)
 if($member.Count-ne1){throw ('Missing/ambiguous resource '+$name)}
 if([Convert]::ToBase64String($read.ExtractFile($member[0]))-cne[Convert]::ToBase64String($payload[$name])){throw 'Packed payload differs'}
 $expected='dlc.rpf\'+$(if($name.EndsWith('.rel')){'x64\audio\config\'}elseif($name.EndsWith('.awc')){'x64\audio\sfx\'+$waveFolder+'\'}else{''})+$name
 if($member[0].Path-cne$expected){throw 'Member mount path differs'}
 $verified+=[ordered]@{name=$name;member=$member[0].Path;bytes=$payload[$name].Length}
}
$setupParsed=New-Object CodeWalker.GameFiles.DlcSetupFile;$setupParsed.Load([xml]$setup)
$contentParsed=New-Object CodeWalker.GameFiles.DlcContentFile;$contentParsed.Load([xml]$content)
if($setupParsed.deviceName-cne$device-or$setupParsed.datFile-cne'content.xml'-or$setupParsed.contentChangeSetGroups[0].ContentChangeSets[0]-cne$change){throw 'Startup/device setup differs'}
$types=@('AUDIO_GAMEDATA','AUDIO_SOUNDDATA','AUDIO_WAVEPACK');$paths=@($gameLogical,$soundLogical,$waveLogical)
if($contentParsed.dataFiles.Count-ne3-or$contentParsed.contentChangeSets[0].filesToEnable.Count-ne3){throw 'Registration item count differs'}
for($i=0;$i-lt3;$i++){if($contentParsed.dataFiles[$i].fileType-cne$types[$i]-or$contentParsed.dataFiles[$i].filename-cne$paths[$i]-or$contentParsed.contentChangeSets[0].filesToEnable[$i]-cne$paths[$i]){throw 'Registration metadata readback differs'}}
[IO.File]::WriteAllText((Join-Path $out 'setup2.xml'),$setup,$utf8);[IO.File]::WriteAllText((Join-Path $out 'content.xml'),$content,$utf8)
foreach($input in $inputs){if((Hash $input.path)-cne$input.sha256){throw 'Resource input changed during packaging'}}
if((Hash $manifestPath)-cne$manifestHash){throw 'Resource manifest changed during packaging'}
$receipt=[ordered]@{schema=1;kind='private-audio-DLC-layout';state='offline-layout-verified';pack=$pack;device=$device;profile='ra_gapriv01_bati';sourceInputs=$inputs;sourceManifest=[ordered]@{path=$manifestPath;sha256=$manifestHash};archive=$file;bytes=(Get-Item $file).Length;sha256=(Hash $file);members=$verified;resourceLayoutOfflineVerified=$true;offlineRegistrationAdmitted=$false;runtimeMounted=$false;proposedDestination=('mods/update/x64/dlcpacks/'+$pack+'/dlc.rpf');listEntry=('dlcpacks:/'+$pack+'/');registrationTypes=$types;logicalNames=$paths;gameFilesWritten=$false;approvedForInstallation=$false;remainingPrerequisites=@('Qualified Enhanced mods-loader identity/cache behavior','Bound complete private update archive shadow','Resource graph and positive marker identification admission','Separately authorized exact-build runtime mounting and selection')}
$receipt|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $out 'dlc-receipt.json') -Encoding UTF8
Write-Output ('PASS private DLC layout: '+(Join-Path $out 'dlc-receipt.json'))
