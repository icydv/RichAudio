#requires -Version 7.0
# Readback of real private REL/AWC payloads against retained source, independent of manifest claims.
param(
 [Parameter(Mandatory)][string]$ResourceDirectory,
 [Parameter(Mandatory)][string]$RetainedRelDirectory,
 [Parameter(Mandatory)][string]$DecodedBatiAwc,
 [string]$CodeWalkerCore='C:\Users\Libby\Desktop\CodeWalker30_dev46\CodeWalker.Core.dll'
)
$ErrorActionPreference='Stop'
function Digest([byte[]]$b){[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant()}
function FileHash([string]$p){(Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant()}
$checks=0
function Check([bool]$value,[string]$message){$script:checks++;if(!$value){throw $message}}
Check ((FileHash $CodeWalkerCore) -ceq '3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8') 'Pinned codec required'
Check ((FileHash $DecodedBatiAwc) -ceq '1a1a43aea31f3e4e4c1dd3355a0751c0a7031ee396ffa76353c174d808cc6c5e') 'Pinned decoded source required'
Add-Type -Path $CodeWalkerCore
function Jenk([string]$name){[CodeWalker.GameFiles.JenkHash]::GenHash($name)}
function ReadRel([byte[]]$bytes){$r=[CodeWalker.GameFiles.RelFile]::new();$r.Load($bytes,$null);return $r}
function ReadAwc([byte[]]$bytes){$e=[CodeWalker.GameFiles.RpfBinaryFileEntry]::new();$e.Name='test.awc';$a=[CodeWalker.GameFiles.AwcFile]::new();$a.Load($bytes,$e);return $a}
function Chunk($c){$m=[IO.MemoryStream]::new();$c.Write([CodeWalker.GameFiles.DataWriter]::new($m));$b=$m.ToArray();$m.Dispose();return ,$b}
$gameXmlPath=Join-Path $RetainedRelDirectory 'game.dat151.rel.xml';$soundsXmlPath=Join-Path $RetainedRelDirectory 'sounds.dat54.rel.xml'
Check ((FileHash $gameXmlPath) -ceq '4c94c681996251253f49be45a3f3a4697dd833f057175f95aa197c158ffdc6c9') 'Game source pin'
Check ((FileHash $soundsXmlPath) -ceq '2a1a61e8ccbd5e6d2d58c38783c1027d05ccc65583450d7e44a11ec5761b9e8f') 'Sound source pin'
[xml]$gameSource=Get-Content -LiteralPath $gameXmlPath -Raw
[xml]$soundSource=Get-Content -LiteralPath $soundsXmlPath -Raw
$g=ReadRel ([IO.File]::ReadAllBytes((Join-Path $ResourceDirectory 'ra_ns01_game.dat151.rel')))
$s=ReadRel ([IO.File]::ReadAllBytes((Join-Path $ResourceDirectory 'ra_ns01_sounds.dat54.rel')))
Check ($g.RelDatas.Count -eq 6 -and $s.RelDatas.Count -eq 3) 'Exactly nine private records'
Check ($s.NameTable.Count -eq 3) 'Three private container entries'
$sourceAwc=ReadAwc ([IO.File]::ReadAllBytes($DecodedBatiAwc));$sourceStream=@($sourceAwc.Streams|Where-Object {$_.Hash.Hash -eq 0x1d18b9a1L})[0]
$metrics=@()
foreach($v in @('a','b','c')){
 $profile=@($g.RelDatas|Where-Object {$_.NameHash.Hash -eq (Jenk "ra_ns01_bati_$v")})
 $config=@($g.RelDatas|Where-Object {$_.NameHash.Hash -eq (Jenk "ra_ns01_granular_$v")})
 $sound=@($s.RelDatas|Where-Object {$_.NameHash.Hash -eq (Jenk "ra_ns01_sound_$v")})
 Check ($profile.Count -eq 1 -and $config.Count -eq 1 -and $sound.Count -eq 1) 'Unique private identities'
 Check ($profile[0].Engine.Hash -eq 0xa46d1b50L -and $profile[0].Horns.Hash -eq 0xf0760d26L -and $profile[0].EngineGranular.Hash -eq (Jenk "ra_ns01_granular_$v")) 'Conventional engine/horn and private config links'
 Check ($config[0].EngineAccel.Hash -eq (Jenk "ra_ns01_sound_$v") -and $config[0].EngineAccelNPC.Hash -eq 0xd7852424L -and $config[0].ExhaustAccel.Hash -eq 0x411a8c83L -and $config[0].ExhaustAccelNPC.Hash -eq 0x411a8c83L) 'Player relocation and untouched NPC/exhaust aliases'
 Check ($sound[0].Channel4.ContainerName.Hash -eq (Jenk "dlc_ra_ns01_8b7e24c1/ra_ns01_idle_$v") -and $sound[0].Channel4.FileName.Hash -eq (Jenk "ra_ns01_idle_$v")) 'Channel4 private wave reference'
 foreach($channel in @(0,1,2,3,5)){Check ($sound[0].("Channel$channel").ContainerName.Hash -eq 0x8b2bacbcL) 'Untargeted channel retains stock bank'}
 Check ($sound[0].ParentSound.Hash -eq 0 -and $sound[0].ChannelVolume4 -eq -800) 'Parent and uninterpreted gain unchanged'
 # Compare complete codec bodies, including every unknown field, against independently
 # reconstructed expected records. Only the four explicitly reviewed links may differ.
 $specs=@(
  @{kind='Dat151';source=$gameSource;stock='F9300CC5';name="ra_ns01_bati_$v";actual=$profile[0];fields=@{'EngineGranular'="ra_ns01_granular_$v"}},
  @{kind='Dat151';source=$gameSource;stock='61F3BD06';name="ra_ns01_granular_$v";actual=$config[0];fields=@{'EngineAccel'="ra_ns01_sound_$v"}},
  @{kind='Dat54';source=$soundSource;stock='0346A636';name="ra_ns01_sound_$v";actual=$sound[0];fields=@{'Channel4/ContainerName'="dlc_ra_ns01_8b7e24c1/ra_ns01_idle_$v";'Channel4/FileName'="ra_ns01_idle_$v"}}
 )
 foreach($spec in $specs){
  $record=$spec.source.SelectSingleNode('/'+$spec.kind+'/Items/Item[Name="hash_'+$spec.stock+'"]').CloneNode($true)
  if($record.HasAttribute('ntOffset')){$record.SetAttribute('ntOffset','0')};$record.SelectSingleNode('Name').InnerText=$spec.name
  foreach($field in $spec.fields.Keys){$record.SelectSingleNode($field).InnerText=$spec.fields[$field]}
  $xml=[xml]("<$($spec.kind)><Version value='72079594'/><Items>"+$record.OuterXml+"</Items></$($spec.kind)>")
  $expected=ReadRel ([CodeWalker.GameFiles.XmlRel]::GetRel($xml).Save())
  Check ((Digest $expected.RelDatas[0].Data) -ceq (Digest $spec.actual.Data)) 'Complete record body contains an undeclared change'
 }
 $bank=ReadAwc ([IO.File]::ReadAllBytes((Join-Path $ResourceDirectory "ra_ns01_idle_$v.awc")));$wave=$bank.Streams[0]
 Check ($bank.Streams.Count -eq 1 -and !$bank.WholeFileEncrypted -and !$bank.MultiChannelFlag -and !$bank.SingleChannelEncryptFlag -and !$bank.MultiChannelEncryptFlag) 'One plain PCM stream'
 Check ($wave.Hash.Hash -eq ((Jenk "ra_ns01_idle_$v") -band 0x1fffffffL)) 'Masked wave identity'
 Check ($wave.SampleCount -eq 40350 -and $wave.SamplesPerSecond -eq 48000 -and [int]$wave.FormatChunk.Codec -eq 0) 'PCM frame/rate/codec contract'
 Check ($wave.Chunks.Count -eq 5 -and $wave.GranularGrainsChunk.GranularGrains.Count -eq 9 -and $wave.GranularLoopsChunk.GranularLoops.Count -eq 0) 'Chunk/grain structure'
 Check ((Digest (Chunk $wave.GranularGrainsChunk)) -ceq (Digest (Chunk $sourceStream.GranularGrainsChunk))) 'Every grain byte and trailer preserved'
 Check ((Digest (Chunk $wave.GranularLoopsChunk)) -ceq (Digest (Chunk $sourceStream.GranularLoopsChunk))) 'Every loop byte preserved'
 $format=Chunk $wave.FormatChunk;$sourceFormat=Chunk $sourceStream.FormatChunk;$format[20]=$sourceFormat[20];$format[21]=$sourceFormat[21]
 Check ((Digest $format) -ceq (Digest $sourceFormat)) 'Nonpeak format bytes preserved'
 $pcm=$wave.GetPcmData();$peak=0;$nonzero=0;[double]$sum=0
 for($i=0;$i -lt $pcm.Length;$i+=2){$value=[int][BitConverter]::ToInt16($pcm,$i);$peak=[Math]::Max($peak,[Math]::Abs($value));if($value){$nonzero++};$sum+=[double]$value*$value}
 if($v -eq 'a'){Check ((Digest $pcm) -ceq (Digest $sourceStream.GetPcmData())) 'A PCM exactly retained';Check ((Digest (Chunk $wave.PeakChunk)) -ceq (Digest (Chunk $sourceStream.PeakChunk))) 'A peak bytes retained'}
 if($v -eq 'b'){Check ($peak -ge 2800 -and $peak -le 2950 -and $nonzero -gt 40000) 'Original marker nonzero and bounded';Check ((Digest $pcm) -cne (Digest $sourceStream.GetPcmData())) 'Marker differs from native PCM'}
 if($v -eq 'c'){Check ($nonzero -eq 0 -and $peak -eq 0 -and $wave.FormatChunk.PeakVal -eq 0 -and @($wave.PeakChunk.Data|Where-Object {$_ -ne 0}).Count -eq 0) 'C PCM and derived peaks exactly zero'}
 $metrics+=@{variant=$v;peakInt16=$peak;rms=[Math]::Sqrt($sum/40350)/32768;nonzeroSamples=$nonzero;pcmSha256=Digest $pcm}
}
@{checks=$checks;passed=$true;metrics=$metrics;scope='Offline resource bytes only; no registration, activation, audible suppression or restoration evidence'}|ConvertTo-Json -Depth 5
