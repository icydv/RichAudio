#requires -Version 7.0
# Private offline experiment: one Bati player idle-wave branch, not engine-family suppression.
param(
 [Parameter(Mandatory)][string]$CodeWalkerCore,
 [Parameter(Mandatory)][string]$RetainedRelDirectory,
 [Parameter(Mandatory)][string]$RetainedNamespaceDirectory,
 [Parameter(Mandatory)][string]$DecodedBatiAwc,
 [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $out)){throw 'Fresh private output required'}
for($p=$out;$p;$p=[IO.Path]::GetDirectoryName($p)){if((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
function Pin([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Digest([byte[]]$b){[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant()}
function Require([bool]$condition,[string]$message){if(!$condition){throw $message}}
$gamePath=Join-Path $RetainedRelDirectory 'game.dat151.rel.xml'
$soundPath=Join-Path $RetainedRelDirectory 'sounds.dat54.rel.xml'
$pins=[ordered]@{}
$expected=@{
 $CodeWalkerCore='3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'
 $gamePath='4c94c681996251253f49be45a3f3a4697dd833f057175f95aa197c158ffdc6c9'
 $soundPath='2a1a61e8ccbd5e6d2d58c38783c1027d05ccc65583450d7e44a11ec5761b9e8f'
 $DecodedBatiAwc='1a1a43aea31f3e4e4c1dd3355a0751c0a7031ee396ffa76353c174d808cc6c5e'
}
foreach($p in $expected.Keys){Require ((Pin $p) -ceq $expected[$p]) "Source identity differs: $p"; $pins[$p]=$expected[$p]}
Add-Type -Path $CodeWalkerCore
function HashName([string]$s){'{0:x8}' -f [CodeWalker.GameFiles.JenkHash]::GenHash($s.ToLowerInvariant())}
function HashRef([string]$s){if($s -match '^hash_([0-9a-fA-F]{8})$'){$Matches[1].ToLowerInvariant()}else{HashName $s}}
function ReadAwc([byte[]]$bytes){$e=[CodeWalker.GameFiles.RpfBinaryFileEntry]::new();$e.Name='private.awc';$a=[CodeWalker.GameFiles.AwcFile]::new();$a.Load($bytes,$e);Require (!$a.ErrorMessage) 'AWC read failed';return $a}
function ReadRel([byte[]]$bytes){$r=[CodeWalker.GameFiles.RelFile]::new();$r.Load($bytes,$null);return $r}
function RelDocument([string]$kind,[object[]]$records,[string[]]$containers=@()){
 $paths=if($containers.Count){'<ContainerPaths>'+ (($containers|ForEach-Object {'<Item>'+$_+'</Item>'}) -join '')+'</ContainerPaths>'}else{''}
 return [xml]("<$kind><Version value='72079594'/>$paths<Items>"+(($records|ForEach-Object {$_.OuterXml}) -join '')+"</Items></$kind>")
}
function EncodeRel([xml]$xml){return ,([CodeWalker.GameFiles.XmlRel]::GetRel($xml).Save())}
function ChunkBytes($chunk){$m=[IO.MemoryStream]::new();$w=[CodeWalker.GameFiles.DataWriter]::new($m);$chunk.Write($w);$b=$m.ToArray();$m.Dispose();return ,$b}
function ChunkMap($stream){$v=[ordered]@{};foreach($c in $stream.Chunks){$v[$c.ChunkInfo.Type.ToString()]=Digest (ChunkBytes $c)};return $v}
$utf8=[Text.UTF8Encoding]::new($false)
[xml]$game=Get-Content -LiteralPath $gamePath -Raw
[xml]$sound=Get-Content -LiteralPath $soundPath -Raw
$sourceBytes=[IO.File]::ReadAllBytes($DecodedBatiAwc)
$originalAwc=ReadAwc $sourceBytes
$selected=@($originalAwc.Streams|Where-Object {$_.Hash.Hash -eq 0x1d18b9a1})
Require ($selected.Count -eq 1) 'Unique retained engine_idle required'
$originalStream=$selected[0]
Require ($originalStream.SampleCount -eq 40350 -and $originalStream.SamplesPerSecond -eq 48000 -and [int]$originalStream.FormatChunk.Codec -eq 0) 'Unexpected idle codec or dimensions'
Require ((Digest $originalStream.GetPcmData()) -ceq '7b0e711658549ac86ae3c25ccfe36c16d04e3192b62acea2acba7f0adadc0bee') 'Retained PCM differs'
Require ($originalStream.GranularGrainsChunk.GranularGrains.Count -eq 9 -and $originalStream.GranularLoopsChunk.GranularLoops.Count -eq 0) 'Retained grain shape differs'
$originalChunks=ChunkMap $originalStream
Require (($originalChunks.Keys|Sort-Object) -join ',' -ceq 'data,format,granulargrains,granularloops,peak') 'Unreviewed AWC chunk type'
$variants=@();$records=@();$relocations=@();$allNames=@()
foreach($v in @('a','b','c')){
 $names=[ordered]@{profile="ra_ns01_bati_$v";granular="ra_ns01_granular_$v";sound="ra_ns01_sound_$v";container="dlc_ra_ns01_8b7e24c1/ra_ns01_idle_$v";stream="ra_ns01_idle_$v"}
 $hashes=[ordered]@{};foreach($key in $names.Keys){$hashes[$key]=HashName $names[$key];$allNames+=$names[$key]}
 $variants+=@{variant=$v;names=$names;hashes=$hashes;maskedStream=('{0:x8}' -f ([Convert]::ToUInt32($hashes.stream,16) -band 0x1fffffff))}
 $definitions=@(
  @{kind='Dat151';type='Vehicle';stock='F9300CC5';key='profile';source=$game;changes=@(@{field='EngineGranular';old='hash_61F3BD06';new=$names.granular})},
  @{kind='Dat151';type='VehicleEngineGranular';stock='61F3BD06';key='granular';source=$game;changes=@(@{field='EngineAccel';old='hash_0346A636';new=$names.sound})},
  @{kind='Dat54';type='GranularSound';stock='0346A636';key='sound';source=$sound;changes=@(@{field='Channel4/ContainerName';old='hash_8B2BACBC';new=$names.container},@{field='Channel4/FileName';old='engine_idle';new=$names.stream})}
 )
 foreach($d in $definitions){
  $found=@($d.source.SelectNodes('/'+$d.kind+'/Items/Item[Name="hash_'+$d.stock+'"]'))
  Require ($found.Count -eq 1 -and $found[0].GetAttribute('type') -ceq $d.type) 'Unique typed source required'
  $original=$found[0].CloneNode($true);if($original.HasAttribute('ntOffset')){$original.SetAttribute('ntOffset','0')}
  $copy=$original.CloneNode($true);$copy.SelectSingleNode('Name').InnerText=$names[$d.key]
  foreach($c in $d.changes){$node=$copy.SelectSingleNode($c.field);Require ($node.InnerText -ceq $c.old) 'Relocation source differs';$node.InnerText=$c.new;$relocations+=@{record=$names[$d.key];field=$c.field;old=$c.old;new=$c.new}}
  $reversed=$copy.CloneNode($true);$reversed.SelectSingleNode('Name').InnerText=$original.SelectSingleNode('Name').InnerText
  foreach($c in $d.changes){$reversed.SelectSingleNode($c.field).InnerText=$c.old}
  Require ($reversed.OuterXml -ceq $original.OuterXml) 'Undeclared metadata mutation'
  $body=(ReadRel (EncodeRel (RelDocument $d.kind @($original)))).RelDatas[0].Data
  $back=(ReadRel (EncodeRel (RelDocument $d.kind @($reversed)))).RelDatas[0].Data
  Require ((Digest $body) -ceq (Digest $back)) 'Relocation reversal changed encoded body'
  $records+=@{variant=$v;kind=$d.kind;type=$d.type;stock=$d.stock;name=$names[$d.key];hash=$hashes[$d.key];copy=$copy;sourceBodySha256=Digest $body}
 }
}
# A stock NPC's ParentSound continues to name the untouched stock player record.
Require ($sound.SelectSingleNode('/Dat54/Items/Item[Name="hash_D7852424"]/ParentSound').InnerText -ceq 'hash_0346A636') 'NPC parent assumption differs'
$hashSet=@($allNames|ForEach-Object {HashName $_})
Require (($hashSet|Sort-Object -Unique).Count -eq 15) 'Private full-hash collision'
Require (($variants.maskedStream|Sort-Object -Unique).Count -eq 3) 'Private masked-stream collision'
$namespaceFiles=@(Get-ChildItem -LiteralPath $RetainedNamespaceDirectory -File -Filter '*rel.xml')
Require ($namespaceFiles.Count -ge 54) 'Retained namespace corpus missing'
$recordNames=0;$containerNames=0;$streamNames=0;$namespaceInputs=@()
foreach($f in @($namespaceFiles)+@(Get-Item $gamePath)+@(Get-Item $soundPath)){
 $namespaceBytes=[IO.File]::ReadAllBytes($f.FullName)
 [xml]$xml=[Text.Encoding]::UTF8.GetString($namespaceBytes).TrimStart([char]0xfeff)
 $namespaceInputs+=@{path=$f.FullName;sha256=Digest $namespaceBytes;bytes=$namespaceBytes.Length}
 foreach($n in $xml.SelectNodes('/*/Items/Item/Name')){Require ((HashRef $n.InnerText) -notin $hashSet) 'Retained record collision';$recordNames++}
 foreach($n in $xml.SelectNodes('//ContainerName')){if($n.InnerText){Require ((HashRef $n.InnerText) -notin $variants.hashes.container) 'Retained container collision';$containerNames++}}
 if($xml.DocumentElement.Name -ceq 'Dat54'){foreach($n in $xml.SelectNodes('//FileName')){if($n.InnerText){$mask='{0:x8}' -f ([Convert]::ToUInt32((HashRef $n.InnerText),16) -band 0x1fffffff);Require ($mask -notin $variants.maskedStream) 'Retained stream29 collision';$streamNames++}}}
}
[void][IO.Directory]::CreateDirectory($out)
$files=@();$containerPaths=@($variants|ForEach-Object {$_.names.container.Replace('/','\').ToUpperInvariant()})
foreach($kind in @('Dat151','Dat54')){
 $rows=@($records|Where-Object kind -CEQ $kind)
 $xml=RelDocument $kind @($rows.copy) $(if($kind -ceq 'Dat54'){$containerPaths}else{@()})
 $bytes=EncodeRel $xml;$read=ReadRel $bytes
 Require ($read.RelDatas.Count -eq $rows.Count -and (Digest $read.Save()) -ceq (Digest $bytes)) 'REL roundtrip differs'
 $name=if($kind -ceq 'Dat151'){'ra_ns01_game.dat151.rel'}else{'ra_ns01_sounds.dat54.rel'}
 [IO.File]::WriteAllBytes((Join-Path $out $name),$bytes);[IO.File]::WriteAllText((Join-Path $out ($name+'.xml')),$xml.OuterXml,$utf8)
 $files+=@{path=$name;sha256=Digest $bytes;bytes=$bytes.Length}
}
foreach($variant in $variants){
 $awc=ReadAwc ([byte[]]$sourceBytes.Clone());$stream=@($awc.Streams|Where-Object {$_.Hash.Hash -eq 0x1d18b9a1})[0]
 $awc.Streams=[CodeWalker.GameFiles.AwcStream[]]@($stream);$awc.WholeFileEncrypted=$false;$awc.SingleChannelEncryptFlag=$false;$awc.MultiChannelEncryptFlag=$false
 $stream.StreamInfo.Id=[Convert]::ToUInt32($variant.maskedStream,16)
 $pcm=[byte[]]$originalStream.GetPcmData().Clone()
 if($variant.variant -ne 'a'){
  [Array]::Clear($pcm)
  if($variant.variant -eq 'b'){for($i=0;$i -lt 40350;$i++){
   # Both tones are original. A short envelope avoids artificial file-edge clicks.
   $fade=[Math]::Min(1.0,[Math]::Min($i/240.0,(40349-$i)/240.0))
   $value=[int16][Math]::Round(32767*0.045*$fade*([Math]::Sin(2*[Math]::PI*997*$i/48000)+[Math]::Sin(2*[Math]::PI*1499*$i/48000)))
   $sample=[BitConverter]::GetBytes($value);$pcm[2*$i]=$sample[0];$pcm[2*$i+1]=$sample[1]
  }}
  $stream.DataChunk.Data=$pcm
  # Only source-derived peak data is regenerated, never grain settings or gain fields.
  $awc.BuildPeakChunks()
 }
 $awc.BuildChunkIndices();$awc.BuildStreamInfos();$awc.BuildStreamDict()
 $bytes=$awc.Save();$decoded=ReadAwc $bytes;$s=$decoded.Streams[0]
 Require ($decoded.Streams.Count -eq 1 -and $s.Hash.Hash -eq [Convert]::ToUInt32($variant.maskedStream,16)) 'AWC stream identity differs'
 Require ((Digest $s.GetPcmData()) -ceq (Digest $pcm) -and (Digest $decoded.Save()) -ceq (Digest $bytes)) 'AWC PCM or container roundtrip differs'
 $chunks=ChunkMap $s
 foreach($key in @('granulargrains','granularloops')){Require ($chunks[$key] -ceq $originalChunks[$key]) 'Grain/loop bytes changed'}
 $format=ChunkBytes $s.FormatChunk;$originalFormat=ChunkBytes $originalStream.FormatChunk
 # PeakVal occupies bytes 20..21; unknown high word and all other format bytes survive.
 $format[20]=$originalFormat[20];$format[21]=$originalFormat[21]
 Require ((Digest $format) -ceq (Digest $originalFormat)) 'Nonpeak format bytes changed'
 if($variant.variant -eq 'a'){foreach($key in $originalChunks.Keys){Require ($chunks[$key] -ceq $originalChunks[$key]) 'Preserved variant chunk changed'}}
 $name='ra_ns01_idle_'+$variant.variant+'.awc';[IO.File]::WriteAllBytes((Join-Path $out $name),$bytes)
 [IO.File]::WriteAllBytes((Join-Path $out ('idle_'+$variant.variant+'.wav')),$s.GetWavFile())
 $files+=@{path=$name;sha256=Digest $bytes;bytes=$bytes.Length}
 $variant.pcmSha256=Digest $pcm;$variant.chunkHashes=$chunks;$variant.frames=40350;$variant.sampleRate=48000;$variant.grains=9;$variant.loops=0
}
foreach($p in $pins.Keys){Require ((Pin $p) -ceq $pins[$p]) 'Input changed during build'}
foreach($input in $namespaceInputs){Require ((Pin $input.path) -ceq $input.sha256) 'Namespace input changed during build'}
$manifest=[ordered]@{
 schema='RichAudioNativeIdleResources01';experimentalOnly=$true;publicRedistributionAllowed=$false;pack='ra_ns01_8b7e24c1';device='dlc_ra_ns01_8b7e24c1'
 contribution='Bati player GranularSound Channel4 engine_idle waveform only';variants=$variants;files=$files;relocations=$relocations
 records=@($records|ForEach-Object {@{variant=$_.variant;kind=$_.kind;type=$_.type;stock=$_.stock;name=$_.name;hash=$_.hash;sourceBodySha256=$_.sourceBodySha256}})
 inputSha256=$pins;builderSha256=Pin $PSCommandPath;namespaceAudit=@{records=$recordNames;containers=$containerNames;streams=$streamNames;collisions=0;inputs=$namespaceInputs;scope='Retained REL corpus only; not exhaustive live/custom names or AWC streams absent from that corpus'}
 verified=@{relocationReversal=$true;relRoundtrip=$true;awcRoundtrip=$true;pcmRoundtrip=$true;grainBytesPreserved=$true;nonpeakFormatBytesPreserved=$true;untargetedAliasesPreserved=$true}
 runtime=@{registration=$false;branchActivation=$false;suppression=$false;restoration=$false;recovery=$false}
 unknown=@('Grain playback semantics and native pitch remain unknown','Modular idle synthesis, exhaust, five other player channels, conventional paths and NPC parent remain stock','A/B/C select private profiles; no prior override getter','Source-derived peaks use CodeWalker rules; no native gain meaning is assumed')
}
[IO.File]::WriteAllText((Join-Path $out 'resource-manifest.json'),($manifest|ConvertTo-Json -Depth 15)+"`n",$utf8)
Write-Output ((@{profiles=$variants.names.profile;resourceManifest=(Join-Path $out 'resource-manifest.json');sha256=Pin (Join-Path $out 'resource-manifest.json');files=$files})|ConvertTo-Json -Depth 5)
