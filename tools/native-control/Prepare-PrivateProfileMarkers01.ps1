# Produces private inputs for the standalone capability probe. Does not pack,
# register, deploy, load, or invoke a game profile.
#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$BaselineXml,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$BaselineSHA256,
 [Parameter(Mandatory)][string]$BaselineRecord,
 [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{8}$')][string]$HornListA,
 [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{8}$')][string]$HornListB,
 [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{8}$')][string]$MarkerA,
 [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{8}$')][string]$MarkerB,
 [Parameter(Mandatory)][string]$CodeWalkerCore,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$CoreSHA256,
 [Parameter(Mandatory)][string]$Output
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$private=Join-Path $repo '.local'
function Assert-PrivatePath([string]$Value){
 $full=[IO.Path]::GetFullPath($Value)
 if(!$full.StartsWith($private+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Use a private repository path'}
 for($part=[IO.DirectoryInfo]::new($full);$null-ne$part;$part=$part.Parent){
  if((Test-Path -LiteralPath $part.FullName)-and((Get-Item -LiteralPath $part.FullName -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked input or output refused'}
 }
 $full
}
$inputFile=Assert-PrivatePath $BaselineXml
$out=Assert-PrivatePath $Output
if(Test-Path -LiteralPath $out){throw 'Use a fresh private output directory'}
$baseline=Get-Item -LiteralPath $inputFile
if($baseline.PSIsContainer-or$baseline.Length-gt64MB-or
 (Get-FileHash -LiteralPath $inputFile).Hash.ToLowerInvariant()-cne$BaselineSHA256-or
 (Get-FileHash -LiteralPath $CodeWalkerCore).Hash.ToLowerInvariant()-cne$CoreSHA256){throw 'Exact bounded base XML and CodeWalker Core pins required'}
if($HornListA-ieq$HornListB-or$HornListA-eq'00000000'-or$HornListB-eq'00000000'-or
   $MarkerA-ieq$MarkerB-or$MarkerA-eq'00000000'-or$MarkerB-eq'00000000'){
 throw 'Two distinct sound-list links and two distinct expected horn readbacks required'
}
$settings=[Xml.XmlReaderSettings]::new();$settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit;$settings.MaxCharactersInDocument=64MB
$reader=[Xml.XmlReader]::Create($inputFile,$settings)
try{$doc=[Xml.XmlDocument]::new();$doc.Load($reader)}finally{$reader.Dispose()}
$originals=@($doc.SelectNodes('/Dat151/Items/Item[@type="Vehicle"]')|Where-Object {$_.SelectSingleNode('Name').InnerText-ceq$BaselineRecord})
if($originals.Count-ne1){throw 'One exact DAT151 Vehicle record required'}
$original=$originals[0];$horn=$original.SelectSingleNode('Horns')
if(!$horn-or$horn.InnerText-ieq('hash_'+$HornListA)-or$horn.InnerText-ieq('hash_'+$HornListB)){throw 'Baseline and marker horn links must be distinguishable'}
$nonce=[Guid]::NewGuid().ToString('N');$profiles=@('ra_probe_'+$nonce+'_a','ra_probe_'+$nonce+'_b')
[xml]$variant=$doc.OuterXml
$items=$variant.SelectSingleNode('/Dat151/Items')
$items.RemoveAll()
$markers=@($MarkerA.ToLowerInvariant(),$MarkerB.ToLowerInvariant())
$lists=@($HornListA.ToLowerInvariant(),$HornListB.ToLowerInvariant())
for($i=0;$i-lt2;$i++){
 $copy=$variant.ImportNode($original,$true)
 $copy.SelectSingleNode('Name').InnerText=$profiles[$i]
 $copy.SelectSingleNode('Horns').InnerText='hash_'+$lists[$i]
 [void]$items.AppendChild($copy)
}
Add-Type -Path (Resolve-Path -LiteralPath $CodeWalkerCore)
$bytes=[CodeWalker.GameFiles.XmlRel]::GetRel($variant).Save()
if(!$bytes-or$bytes.Length-gt4MB){throw 'Marker REL output outside expected size'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$file=Join-Path $out 'richaudio_probe_game.dat151.rel'
[IO.File]::WriteAllBytes($file,$bytes)
$device='dlc_raprobe_'+$nonce.Substring(0,8)
@"
<Item>
  <filename>${device}:/x64/audio/config/richaudio_probe_game.dat151.rel</filename>
  <fileType>AUDIO_GAMEDATA</fileType>
</Item>
"@ | Set-Content -LiteralPath (Join-Path $out 'content-datafile-fragment.xml') -Encoding utf8
[ordered]@{
 schema=1;kind='RichAudioPrivateProfileMarkerExperiment01';baseXmlSha256=$BaselineSHA256;coreSha256=$CoreSHA256
 profileA=$profiles[0];hornListA=$lists[0];expectedMarkerA=$markers[0]
 profileB=$profiles[1];hornListB=$lists[1];expectedMarkerB=$markers[1]
 relSHA256=(Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant();device=$device
 registrationVerified=$false;requiresMatchingMountedSoundReferences=$true;existingVehicleMutationAllowed=$false
 enabled=$false;scope='Disposable Bati marker capability only. No suppression or playback.'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'probe-manifest.json') -Encoding utf8
