#requires -Version 7.0
# Offline, private-only copies of four structural records plus original audio.
# No archive access, game process, endpoint, installation or live invocation.
param(
 [Parameter(Mandatory)][string]$CodeWalkerCore,
 [Parameter(Mandatory)][string]$RetainedRelDirectory,
 [Parameter(Mandatory)][string]$RetainedNamespaceDirectory,
 [Parameter(Mandatory)][string]$ResolvedCatalog,
 [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $out)){throw 'Fresh project-private output required'}
for($dir=$out;$dir;$dir=[IO.Path]::GetDirectoryName($dir)){
 if((Test-Path -LiteralPath $dir) -and ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}
}
function Pin([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Digest([byte[]]$b){return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant()}
function AssertPin([string]$p,[string]$hash){if((Pin $p) -cne $hash){throw "Input binding mismatch: $p"}}
$corePin='3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'
AssertPin $CodeWalkerCore $corePin
$gamePath=Join-Path $RetainedRelDirectory 'game.dat151.rel.xml'
$soundsPath=Join-Path $RetainedRelDirectory 'sounds.dat54.rel.xml'
$gamePin='4c94c681996251253f49be45a3f3a4697dd833f057175f95aa197c158ffdc6c9'
$soundsPin='2a1a61e8ccbd5e6d2d58c38783c1027d05ccc65583450d7e44a11ec5761b9e8f'
AssertPin $gamePath $gamePin; AssertPin $soundsPath $soundsPin
AssertPin $ResolvedCatalog 'c4250395be8638b9d44df2a43da966caec99841a83f26e3131be51edca57c018'
$catalog=Get-Content -LiteralPath $ResolvedCatalog -Raw | ConvertFrom-Json
$bati=@($catalog.Vehicles | Where-Object Model -CEQ 'bati')
if($bati.Count -ne 1 -or $bati[0].VehicleAudioRecord.Hash -cne 'F9300CC5' -or $bati[0].EngineRecord.Hash -cne 'A46D1B50' -or $bati[0].GranularRecord.Hash -cne '61F3BD06'){throw 'Pinned real Bati identity changed'}
Add-Type -Path (Resolve-Path -LiteralPath $CodeWalkerCore)
function NamedHash([string]$name){return ('{0:x8}' -f [CodeWalker.GameFiles.JenkHash]::GenHash($name.ToLowerInvariant()))}
function RefHash([string]$name){if($name -match '^hash_([a-fA-F0-9]{8})$'){return $Matches[1].ToLowerInvariant()}; return NamedHash $name}
function ReadRel([byte[]]$bytes){$r=[CodeWalker.GameFiles.RelFile]::new();$r.Load($bytes,$null);return $r}
function Encode([xml]$xml){return ,([CodeWalker.GameFiles.XmlRel]::GetRel($xml).Save())}
function Document([string]$kind,[object[]]$records,[string]$container=''){
 $paths=if($container){'<ContainerPaths><Item>'+[Security.SecurityElement]::Escape($container)+'</Item></ContainerPaths>'}else{''}
 return [xml]("<$kind><Version value='72079594'/>$paths<Items>"+(($records|ForEach-Object {$_.OuterXml}) -join '')+"</Items></$kind>")
}
$utf8=[Text.UTF8Encoding]::new($false)
function WriteJson([string]$name,$value){[IO.File]::WriteAllText((Join-Path $out $name),($value|ConvertTo-Json -Depth 30)+"`n",$utf8)}
[xml]$game=Get-Content -LiteralPath $gamePath -Raw
[xml]$sounds=Get-Content -LiteralPath $soundsPath -Raw
$names=[ordered]@{profile='ra_gapriv01_bati';list='ra_gapriv01_horns';multitrack='ra_gapriv01_horn';simple='ra_gapriv01_marker_sound';container='dlc_ra_private01_6a13f902/ra_private01_marker';stream='ra_gapriv01_code31'}
$hashes=[ordered]@{};foreach($key in $names.Keys){$hashes[$key]=NamedHash $names[$key]}
if($hashes.profile -cne 'dd89929d' -or (@($hashes.Values|Sort-Object -Unique)).Count -ne 6){throw 'Private identity collision'}
$definitions=@(
 @{key='profile';kind='Dat151';stock='f9300cc5';type='Vehicle';xml=$game;changes=@(@{xpath='Horns';old='hash_F0760D26';new=$names.list})},
 @{key='list';kind='Dat54';stock='f0760d26';type='SoundHashList';xml=$sounds;changes=@(@{xpath='SoundHashes/Item[1]';old='hash_35963676';new=$names.multitrack},@{xpath='SoundHashes/Item[2]';old='hash_6ABC5E91';new=$names.simple})},
 @{key='multitrack';kind='Dat54';stock='35963676';type='MultitrackSound';xml=$sounds;changes=@(@{xpath='ChildSounds/Item[1]';old='hash_6ABC5E91';new=$names.simple})},
 @{key='simple';kind='Dat54';stock='6abc5e91';type='SimpleSound';xml=$sounds;changes=@(@{xpath='ContainerName';old='hash_F205B596';new=$names.container},@{xpath='FileName';old='hash_89135D42';new=$names.stream})}
)
$records=@();$relocations=@()
foreach($d in $definitions){
 $found=@($d.xml.SelectNodes('/'+$d.kind+'/Items/Item[Name="hash_'+$d.stock.ToUpperInvariant()+'"]'))
 if($found.Count -ne 1 -or $found[0].GetAttribute('type') -cne $d.type){throw 'Stock record not uniquely typed'}
 $original=$found[0].CloneNode($true)
 if($original.HasAttribute('ntOffset')){$original.SetAttribute('ntOffset','0')}
 $copy=$original.CloneNode($true);$copy.SelectSingleNode('Name').InnerText=$names[$d.key]
 foreach($change in $d.changes){
  $node=$copy.SelectSingleNode($change.xpath)
  if(!$node -or $node.InnerText -cne $change.old){throw 'Stock relocation source mismatch'}
  $node.InnerText=$change.new
  $relocations+=@{record=$names[$d.key];field=$change.xpath;originalHash=RefHash $change.old;privateHash=RefHash $change.new}
 }
 # Reverse only the six declared relocations and identity changes. Every other
 # field must survive exactly, then the codec body must survive exactly too.
 $reversed=$copy.CloneNode($true);$reversed.SelectSingleNode('Name').InnerText=$original.SelectSingleNode('Name').InnerText
 foreach($change in $d.changes){$reversed.SelectSingleNode($change.xpath).InnerText=$change.old}
 if($reversed.OuterXml -cne $original.OuterXml){throw 'Undeclared copied-field mutation'}
 $originalBody=(ReadRel (Encode (Document $d.kind @($original)))).RelDatas[0].Data
 $reversedBody=(ReadRel (Encode (Document $d.kind @($reversed)))).RelDatas[0].Data
 if((Digest $originalBody) -cne (Digest $reversedBody)){throw 'Relocation reversal changed a body'}
 $records+=@{key=$d.key;kind=$d.kind;stockHash=$d.stock;privateName=$names[$d.key];privateHash=$hashes[$d.key];type=$d.type;source=$original;copy=$copy;sourceBodySha256=Digest $originalBody;reversedBodySha256=Digest $reversedBody}
}
if($relocations.Count -ne 6){throw 'Expected six private links'}

# Check all retained record names, separately from whether they are currently
# loaded. The receipt states this bounded namespace explicitly.
$namespaceFiles=@(Get-ChildItem -LiteralPath $RetainedNamespaceDirectory -Filter '*rel.xml' -File | Sort-Object FullName)
if($namespaceFiles.Count -lt 54){throw 'Expected retained stock namespace corpus'}
$namespaceInputs=@();$stockIndex=@{};$recordCount=0;$containerReferencesChecked=0;$streamReferencesChecked=0
$maskedStream=('{0:x8}' -f ([Convert]::ToUInt32($hashes.stream,16) -band 0x1fffffff))
foreach($f in @($namespaceFiles)+@(Get-Item -LiteralPath $gamePath)+@(Get-Item -LiteralPath $soundsPath)){
 $pin=Pin $f.FullName;[xml]$doc=Get-Content -LiteralPath $f.FullName -Raw
 $items=@($doc.SelectNodes('/*/Items/Item'))
 foreach($item in $items){
  $name=$item.SelectSingleNode('Name');if(!$name -or !$name.InnerText){continue}
  $hash=RefHash $name.InnerText;$recordCount++
  if($hash -in @($hashes.Values)){throw "Namespace collision: $hash in $($f.Name)"}
  if(!$stockIndex.ContainsKey($hash)){$stockIndex[$hash]=@()}
  $stockIndex[$hash]+=@{kind=$doc.DocumentElement.Name;type=$item.GetAttribute('type');sourceFile=$f.Name;sourceSha256=$pin}
 }
 foreach($container in $doc.SelectNodes('//ContainerName')){
  if(!$container.InnerText){continue};$containerReferencesChecked++
  if((RefHash $container.InnerText) -ceq $hashes.container){throw 'Retained container JOAAT collision'}
 }
 if($doc.DocumentElement.Name -ceq 'Dat54'){foreach($wave in $doc.SelectNodes('//FileName')){
  if(!$wave.InnerText){continue};$streamReferencesChecked++
  if(('{0:x8}' -f ([Convert]::ToUInt32((RefHash $wave.InnerText),16) -band 0x1fffffff)) -ceq $maskedStream){throw 'Retained DAT54 stream29 collision'}
 }}
 $namespaceInputs+=@{path=$f.FullName;sha256=$pin;records=$items.Count}
}
foreach($bank in $catalog.AudioBankTables){
 if($bank.Path -match 'dlc_ra_private01_6a13f902|ra_private01_marker'){throw 'Container namespace collision'}
 if($bank.Path -match '(?:^|/)audio/sfx/([^/]+)/([^/]+)\.awc$'){
  $candidateContainer=($Matches[1] -replace '\.rpf$','')+'/'+$Matches[2]
  if((NamedHash $candidateContainer) -ceq $hashes.container){throw 'Retained AWC container JOAAT collision'}
 }
 foreach($stream in $bank.Streams){if($stream.StreamId.ToLowerInvariant() -ceq ('0x'+$maskedStream)){throw 'Retained AWC stream hash collision'}}
}

[void][IO.Directory]::CreateDirectory($out)
$markerDir=Join-Path $out 'original-marker'
& node (Join-Path $PSScriptRoot 'ResourceMarker.mjs') generate $markerDir | Out-Null
if($LASTEXITCODE){throw 'Original marker generation failed'}
$marker=Get-Content -LiteralPath (Join-Path $markerDir 'marker.json') -Raw | ConvertFrom-Json
if($marker.frames -ne 134400 -or $marker.sampleRate -ne 48000 -or $marker.peak -gt 0.101 -or $marker.peak -lt 0.09){throw 'Original marker format/level mismatch'}
$containerPath='DLC_RA_PRIVATE01_6A13F902\RA_PRIVATE01_MARKER'
$files=@()
foreach($kind in @('Dat151','Dat54')){
 $selected=@($records|Where-Object kind -CEQ $kind)
 $xml=Document $kind @($selected|ForEach-Object {$_.copy}) $(if($kind -ceq 'Dat54'){$containerPath}else{''})
 $stem=if($kind -ceq 'Dat151'){'ra_private01_game.dat151.rel'}else{'ra_private01_sounds.dat54.rel'}
 $bytes=Encode $xml;$read=ReadRel $bytes
 if($read.RelDatas.Count -ne $selected.Count){throw 'Unexpected serialized record count'}
 if((Digest $read.Save()) -cne (Digest $bytes)){throw 'REL save/load/save differs'}
 foreach($record in $selected){
  $row=@($read.RelDatas|Where-Object {('{0:x8}' -f $_.NameHash.Hash) -ceq $record.privateHash})
  if($row.Count -ne 1 -or $row[0].GetType().Name -cne ($kind+$record.type)){throw 'Private record identity/type mismatch'}
  $record.privateBodySha256=Digest $row[0].Data
 }
 if($kind -ceq 'Dat54' -and ($read.NameTable.Count -ne 1 -or $read.NameTable[0] -cne $containerPath)){throw 'ContainerPaths failed readback'}
 [IO.File]::WriteAllBytes((Join-Path $out $stem),$bytes)
 [IO.File]::WriteAllText((Join-Path $out ($stem+'.xml')),$xml.OuterXml,$utf8)
 $files+=@{role=if($kind -ceq 'Dat151'){'AUDIO_GAMEDATA'}else{'AUDIO_SOUNDDATA'};path=$stem;sha256=Digest $bytes;bytes=$bytes.Length;records=$read.RelDatas.Count}
}

# PCM is imported through the codec and decoded again. The importer catches WAV
# errors internally, so explicit sample count/PCM equality is mandatory.
[xml]$awcXml=@"
<AudioWaveContainer><Version value="1"/><ChunkIndices value="True"/>
<Streams><Item><Name>$($names.stream)</Name><FileName>marker.wav</FileName><Chunks>
<Item><Type>format</Type><Codec>PCM</Codec><Samples value="$($marker.frames)"/><SampleRate value="48000"/>
<Headroom value="0"/><PlayBegin value="0"/><PlayEnd value="0"/><LoopBegin value="0"/><LoopEnd value="0"/><LoopPoint value="-1"/></Item>
<Item><Type>data</Type></Item></Chunks></Item></Streams></AudioWaveContainer>
"@
$awc=[CodeWalker.GameFiles.AwcFile]::ReadXmlNode($awcXml.DocumentElement,$markerDir)
$awcBytes=$awc.Save()
$entry=[CodeWalker.GameFiles.RpfBinaryFileEntry]::new();$entry.Name='ra_private01_marker.awc'
$decoded=[CodeWalker.GameFiles.AwcFile]::new();$decoded.Load($awcBytes,$entry)
if($decoded.Streams.Count -ne 1 -or ('{0:x8}' -f $decoded.Streams[0].Hash.Hash) -cne $maskedStream){throw 'AWC stream identity mismatch'}
$stream=$decoded.Streams[0];$format=$stream.FormatChunk
if($format.Samples -ne $marker.frames -or $format.SamplesPerSecond -ne 48000 -or [int]$format.Codec -ne 0 -or $format.LoopPoint -ne -1){throw 'AWC format readback mismatch'}
$pcm=$stream.GetPcmData()
if($pcm.Length -ne $marker.frames*2 -or (Digest $pcm) -cne $marker.pcmSha256){throw 'AWC original PCM roundtrip mismatch'}
if((Digest $decoded.Save()) -cne (Digest $awcBytes)){throw 'AWC save/load/save differs'}
[IO.File]::WriteAllBytes((Join-Path $out 'ra_private01_marker.awc'),$awcBytes)
[IO.File]::WriteAllBytes((Join-Path $out 'original-marker/decoded-from-awc.wav'),$stream.GetWavFile())
[IO.File]::WriteAllText((Join-Path $out 'ra_private01_marker.awc.xml'),$awcXml.OuterXml,$utf8)
$files+=@{role='AUDIO_WAVEPACK';path='ra_private01_marker.awc';sha256=Digest $awcBytes;bytes=$awcBytes.Length;streams=1}

$external=@()
foreach($record in $records){foreach($leaf in $record.copy.SelectNodes('.//*[not(*) and not(@value)]')){
 if($leaf.Name -ceq 'Name' -or !$leaf.InnerText){continue};$hash=RefHash $leaf.InnerText
 if($hash -in @($hashes.Values)){continue}
 $external+=@{record=$record.privateName;field=$leaf.Name;hash=$hash;name=$leaf.InnerText;preserved=$true;retainedMetadataMatches=@($stockIndex[$hash]);resolution=if($stockIndex.ContainsKey($hash)){'retained-stock-metadata'}else{'external-stock-dependency-not-in-retained-corpus'}}
}}
WriteJson 'namespace-audit.json' @{recordNamesChecked=$recordCount;containerReferencesChecked=$containerReferencesChecked;streamReferencesChecked=$streamReferencesChecked;files=$namespaceInputs;catalog= @{path=$ResolvedCatalog;sha256=Pin $ResolvedCatalog};privateHashes=$hashes;maskedAwcStream=$maskedStream;collisions=0;scope='Retained base/update/mpheist/mpapartment/mpexecutive REL XML and selected vehicle AWC table corpus; not exhaustive live loaded namespaces.'}
WriteJson 'dependency-audit.json' @{relocations=$relocations;externalDependencies=$external;preservedBati=$bati[0];privateClosureComplete=$true;wholeStockDependencyClosureRequalified=$false;notes='The new four-record branch closes to one original AWC. All other vehicle fields, engine/player/NPC/granular paths and the other horn wrapper are unchanged external stock dependencies. No private engine or DAT10 is emitted.'}
$manifest=[ordered]@{
 schema='RichAudioPrivateVehicleResource01';experimentalOnly=$true;disabledByDefault=$true;publicRedistributionAllowed=$false
 profileName=$names.profile;profileHash=$hashes.profile;packName='ra_private01_6a13f902';deviceName='dlc_ra_private01_6a13f902';waveFolder='dlc_ra_private01_6a13f902'
 containerName=$names.container;containerHash=$hashes.container;streamName=$names.stream;streamHash=$hashes.stream;maskedAwcStream=$maskedStream
 files=$files;marker=$marker;markerManifest=@{path='original-marker/marker.json';sha256=Pin (Join-Path $markerDir 'marker.json')}
 records=@($records|ForEach-Object {@{kind=$_.kind;type=$_.type;privateName=$_.privateName;privateHash=$_.privateHash;stockHash=$_.stockHash;sourceBodySha256=$_.sourceBodySha256;reversedBodySha256=$_.reversedBodySha256;privateBodySha256=$_.privateBodySha256}})
 validation=@{recordCount=4;declaredLinkRelocations=6;bodyReversalEqual=$true;relReadback=$true;awcReadback=$true;pcmRoundtripExact=$true;namespaceAuditSha256=Pin (Join-Path $out 'namespace-audit.json');dependencyAuditSha256=Pin (Join-Path $out 'dependency-audit.json')}
 inputs=@{gameXml=@{path=$gamePath;sha256=$gamePin};soundsXml=@{path=$soundsPath;sha256=$soundsPin};catalog=@{path=$ResolvedCatalog;sha256=Pin $ResolvedCatalog};codec=@{path=$CodeWalkerCore;sha256=$corePin};builder=@{path=$PSCommandPath;sha256=Pin $PSCommandPath};markerTool=@{path=(Join-Path $PSScriptRoot 'ResourceMarker.mjs');sha256=Pin (Join-Path $PSScriptRoot 'ResourceMarker.mjs')}}
 runtime=@{registrationVerified=$false;selectionVerified=$false;finiteHornPlaybackVerified=$false;nativeOwnershipQualified=$false;observation10msGate='failed';scope='One authored private horn contribution only. Copied metadata remains private. Codec roundtrip does not prove loading or playback.'}
}
AssertPin $gamePath $gamePin; AssertPin $soundsPath $soundsPin
WriteJson 'resource-manifest.json' $manifest
Write-Output ([ordered]@{profileName=$manifest.profileName;profileHash=$manifest.profileHash;files=$files;manifest=(Join-Path $out 'resource-manifest.json');manifestSha256=Pin (Join-Path $out 'resource-manifest.json')}|ConvertTo-Json -Depth 8)
