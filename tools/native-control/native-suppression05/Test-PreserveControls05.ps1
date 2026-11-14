#requires -Version 7.0
# Independent packed-resource checks. These are offline checks, not game resolution evidence.
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$Manifest,
 [Parameter(Mandatory)][string]$OutputDirectory,
 [string]$CodeWalkerCore='C:\Users\Libby\Desktop\CodeWalker30_dev46\CodeWalker.Core.dll'
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith(([IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'),[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh task-private output required'}
foreach($path in @($out,$Manifest,$CodeWalkerCore)){for($at=[IO.Path]::GetFullPath($path);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked path refused'}}}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Digest([byte[]]$bytes){[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
function Need([bool]$ok,[string]$reason){if(!$ok){throw $reason}}
$checks=[Collections.Generic.List[string]]::new()
function Check([bool]$ok,[string]$reason){Need $ok $reason;$checks.Add($reason)}
function Reject([string]$name,[scriptblock]$action){$rejected=$false;try{&$action}catch{$rejected=$true};Check $rejected $name}
Need ((Hash $CodeWalkerCore)-ceq'3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8') 'Codec drift'
$manifestHash=Hash $Manifest;$m=Get-Content -LiteralPath $Manifest -Raw|ConvertFrom-Json
Check ($m.schema-ceq'NativeSuppression05PreserveControls'-and!$m.runtimeQualified-and!$m.bankRebuilt-and!$m.shadowRebuildRequired) 'Bounded offline manifest'
foreach($input in $m.inputs){Check ((Hash $input.path)-ceq$input.sha256-and(Get-Item -LiteralPath $input.path).Length-eq$input.bytes) ('Pinned input '+[IO.Path]::GetFileName($input.path))}
Add-Type -Path $CodeWalkerCore
function Jenk([string]$name){[CodeWalker.GameFiles.JenkHash]::GenHash($name.ToLowerInvariant())}
function Rel([byte[]]$bytes){$r=[CodeWalker.GameFiles.RelFile]::new();$r.Load($bytes,$null);return $r}
function Rpf([string]$path){$a=[CodeWalker.GameFiles.RpfFile]::new($path,'dlc.rpf');$a.ScanStructure($null,$null);Need (!$a.LastError-and$a.Encryption-eq[CodeWalker.GameFiles.RpfEncryption]::OPEN) 'OPEN archive required';return $a}
function Member($a,[string]$name){$e=@($a.AllEntries|Where-Object {$_.Name-ceq$name-and$_-is[CodeWalker.GameFiles.RpfFileEntry]});Need ($e.Count-eq1) ('Unique member '+$name);return ,$a.ExtractFile($e[0])}
function One($r,[uint32]$hash){$x=@($r.RelDatas|Where-Object {$_.NameHash.Hash-eq$hash});Need ($x.Count-eq1) 'Exact record identity required';return $x[0]}
function EqualBody([byte[]]$a,[byte[]]$b){Need ($a.Length-eq$b.Length-and(Digest $a)-ceq(Digest $b)) 'Serialized body must have only permitted differences'}
function Expected([string]$kind,$source,[string]$name,$fields){
 $n=$source.CloneNode($true);$n.SelectSingleNode('Name').InnerText=$name
 if($n.HasAttribute('ntOffset')){$n.SetAttribute('ntOffset','0')}
 foreach($key in $fields.Keys){$n.SelectSingleNode($key).InnerText=$fields[$key]}
 $x=[xml]("<$kind><Version value='72079594'/><Items>"+$n.OuterXml+"</Items></$kind>")
 return (Rel ([CodeWalker.GameFiles.XmlRel]::GetRel($x).Save())).RelDatas[0]
}
Check ((Hash $m.dlc.path)-ceq$m.dlc.sha256-and(Get-Item -LiteralPath $m.dlc.path).Length-eq$m.dlc.bytes) 'Candidate packed archive identity'
$a=Rpf $m.dlc.path
$oldPin=@($m.inputs|Where-Object sha256 -ceq '24574c8364812861443d10e855235cbb51715a37ec7849a2dcbc38f68106be60')
Need ($oldPin.Count-eq1) 'Exact installed original DLC pin'
$old=Rpf $oldPin[0].path
$packed=@($a.AllEntries|Where-Object {$_-is[CodeWalker.GameFiles.RpfFileEntry]})
Check ($packed.Count-eq9) 'Only two REL members were added'
foreach($p in $m.packedMembers){$bytes=Member $a $p.name;Check ((Digest $bytes)-ceq$p.sha256-and$bytes.Length-eq$p.bytes-and@($packed|Where-Object Path -ceq $p.member).Count-eq1) ('Packed member '+$p.name)}
foreach($name in @('ra_ns01_game.dat151.rel','ra_ns01_sounds.dat54.rel','ra_ns01_idle_a.awc','ra_ns01_idle_b.awc','ra_ns01_idle_c.awc','setup2.xml')){Check ((Digest (Member $a $name))-ceq(Digest (Member $old $name))) ('Unchanged existing payload '+$name)}
$base=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Manifest))
$stock=@{}
foreach($p in $m.originalBinaryRels){$path=Join-Path $base ('original-rel-evidence/'+$p.name);Check ((Hash $path)-ceq$p.decodedSha256-and(Get-Item -LiteralPath $path).Length-eq$p.decodedBytes) ('Extracted original binary '+$p.name);$stock[$p.name]=Rel ([IO.File]::ReadAllBytes($path))}
$gameXmlPin=@($m.inputs|Where-Object sha256 -ceq '4c94c681996251253f49be45a3f3a4697dd833f057175f95aa197c158ffdc6c9')[0]
$soundXmlPin=@($m.inputs|Where-Object sha256 -ceq '2a1a61e8ccbd5e6d2d58c38783c1027d05ccc65583450d7e44a11ec5761b9e8f')[0]
[xml]$gx=Get-Content -LiteralPath $gameXmlPin.path -Raw;[xml]$sx=Get-Content -LiteralPath $soundXmlPin.path -Raw
$vehicle=$gx.SelectSingleNode('/Dat151/Items/Item[Name="hash_F9300CC5"]');$config=$gx.SelectSingleNode('/Dat151/Items/Item[Name="hash_61F3BD06"]');$sound=$sx.SelectSingleNode('/Dat54/Items/Item[Name="hash_0346A636"]')
$g=Rel (Member $a 'ra_ns05_game.dat151.rel');$s=Rel (Member $a 'ra_ns05_sounds.dat54.rel')
Check ($g.RelDatas.Count-eq4-and$s.RelDatas.Count-eq1) 'Minimal four configuration records and one sound record'
$specs=@(
 @{kind='Dat151';source=$vehicle;name='ra_ns05_bati_select';fields=@{Horns='hash_98A97784'};rel=$g},
 @{kind='Dat151';source=$vehicle;name='ra_ns05_bati_s1';fields=@{};rel=$g},
 @{kind='Dat151';source=$vehicle;name='ra_ns05_bati_s2';fields=@{EngineGranular='ra_ns05_granular_s2'};rel=$g},
 @{kind='Dat151';source=$config;name='ra_ns05_granular_s2';fields=@{EngineAccel='ra_ns05_sound_s2'};rel=$g},
 @{kind='Dat54';source=$sound;name='ra_ns05_sound_s2';fields=@{};rel=$s}
)
foreach($spec in $specs){$expected=Expected $spec.kind $spec.source $spec.name $spec.fields;$actual=One $spec.rel (Jenk $spec.name);EqualBody $actual.Data $expected.Data;Check ($actual.GetType()-eq$expected.GetType()) ('Exact typed body '+$spec.name)}
# S2's complete sound body is byte-identical to the actual original packed record.
EqualBody (One $s (Jenk 'ra_ns05_sound_s2')).Data (One $stock['sounds.dat54.rel'] ([uint32]0x0346a636)).Data
$checks.Add('S2 sound body exactly equals original packed stock body')
function Tables($r,[byte[]]$bytes,[string]$label){
 $previous=[uint64]0
 foreach($idx in $r.IndexHashes){$record=One $r $idx.Name.Hash;Need ($idx.Offset-eq$record.DataOffset-and$idx.Length-eq$record.DataLength-and$idx.Offset+$idx.Length-le$r.DataLength) 'Index does not match record extent';$h=[uint64]$idx.Name.Hash;$rot=($h-shr8)-bor(($h-band255)-shl24);Need ($rot-ge$previous) 'Rotated index ordering differs';$previous=$rot;Need ([int]$bytes[8+$idx.Offset]-eq$record.TypeID) 'Index type byte differs'}
 Check ($r.IndexCount-eq$r.RelDatas.Count) ($label+' exact record index and rotated ordering')
 $expectedHash=@();$expectedPack=@()
 foreach($record in @($r.RelDatas|Sort-Object DataOffset)){$start=[uint32]($record.DataOffset+8);if($record-is[CodeWalker.GameFiles.RelSound]){$start+=1+$record.Header.CalcHeaderLength()}else{$start+=4};$expectedHash+=@($record.GetHashTableOffsets()|Where-Object {$null-ne$_}|ForEach-Object{$start+$_});$expectedPack+=@($record.GetPackTableOffsets()|Where-Object {$null-ne$_}|ForEach-Object{$start+$_})}
 Check ((@($r.HashTableOffsets)-join',')-ceq($expectedHash-join',')-and(@($r.PackTableOffsets)-join',')-ceq($expectedPack-join',')) ($label+' exact reference table offsets')
 for($i=0;$i-lt$r.HashTableCount;$i++){Need ([BitConverter]::ToUInt32($bytes,$r.HashTableOffsets[$i])-eq$r.HashTable[$i].Hash) 'Hash reference bytes differ'}
 for($i=0;$i-lt$r.PackTableCount;$i++){Need ([BitConverter]::ToUInt32($bytes,$r.PackTableOffsets[$i])-eq$r.PackTable[$i].Hash) 'Pack reference bytes differ'}
 $checks.Add($label+' reference tables address actual serialized values')
}
Tables $g (Member $a 'ra_ns05_game.dat151.rel') 'New DAT151'
Tables $s (Member $a 'ra_ns05_sounds.dat54.rel') 'New DAT54'
Check ($g.NameTableCount-eq0-and$g.NameTableLength-eq4-and$s.NameTableCount-eq1-and$s.NameTable[0]-ceq'STREAMED_VEHICLES_GRANULAR\V_TWIN_2'-and$s.PackTableCount-eq6-and@($s.PackTable|Where-Object {$_.Hash-ne0x8b2bacbcL}).Count-eq0) 'S2 uses all six original stock container references and name table'
$oldContent=[Text.Encoding]::UTF8.GetString((Member $old 'content.xml'));$content=[Text.Encoding]::UTF8.GetString((Member $a 'content.xml'))
$logical=@('dlc_ra_ns01_8b7e24c1:/x64/audio/config/ra_ns05_game.dat','dlc_ra_ns01_8b7e24c1:/x64/audio/config/ra_ns05_sounds.dat')
[xml]$cx=$content
foreach($i in 0..1){$type=if($i-eq0){'AUDIO_GAMEDATA'}else{'AUDIO_SOUNDDATA'};$row=@($cx.SelectNodes('//dataFiles/Item')|Where-Object filename -ceq $logical[$i]);Check ($row.Count-eq1-and$row[0].fileType-ceq$type-and$row[0].overlay.value-ceq'false'-and$row[0].disabled.value-ceq'true'-and$row[0].persistent.value-ceq'false'-and@($cx.SelectNodes('//filesToEnable/Item')|Where-Object InnerText -ceq $logical[$i]).Count-eq1) ('Exact new registration '+$type)}
Check ($content.Replace($m.contentDelta.insertDataFiles,'').Replace($m.contentDelta.insertFilesToEnable,'')-ceq$oldContent) 'All other content.xml bytes are preserved'
# Horn control closes only over original stock references, with disjoint lists.
$bati=@($sx.SelectSingleNode('/Dat54/Items/Item[Name="hash_F0760D26"]').SoundHashes.Item)
$bus=@($sx.SelectSingleNode('/Dat54/Items/Item[Name="hash_98A97784"]').SoundHashes.Item)
Check (($bati-join',')-ceq'hash_35963676,hash_6ABC5E91'-and($bus-join',')-ceq'hash_694D5709,hash_1192FC24,hash_C41CA5D0,hash_F2127E37,hash_5966E97F,hash_4CE0745B'-and@($bus|Where-Object {$_-in$bati}).Count-eq0) 'Exact disjoint Bati and bus horn sets'
Check ($gx.SelectSingleNode('/Dat151/Items/Item[Name="hash_D577C962"]/Horns').InnerText-ceq'hash_98A97784') 'Verified bus donor root'
$pending=[Collections.Generic.Queue[string]]::new();$seen=[Collections.Generic.HashSet[string]]::new();$pending.Enqueue('hash_98A97784')
while($pending.Count){$name=$pending.Dequeue();if(!$seen.Add($name)){continue};$n=$sx.SelectSingleNode('/Dat54/Items/Item[Name="'+$name+'"]');Need ($null-ne$n) 'Unresolved donor child';if($n.type-ceq'SimpleSound'){Need ($n.ContainerName-ceq'hash_F205B596') 'Unexpected donor bank'};foreach($child in $n.SelectNodes('SoundHashes/Item|ChildSounds/Item|ChildSound|FallBackSound')){if($child.InnerText){$pending.Enqueue($child.InnerText)}}}
Check ($seen.Count-eq13) 'All donor children resolve in original stock graph'
function Awc([byte[]]$bytes){$w=[CodeWalker.GameFiles.AwcFile]::new();$e=[CodeWalker.GameFiles.RpfBinaryFileEntry]::new();$e.Name='retained.awc';$w.Load($bytes,$e);Need (!$w.ErrorMessage) 'AWC parse error';return $w}
$sourceBankPin=@($m.inputs|Where-Object sha256 -ceq '1a1a43aea31f3e4e4c1dd3355a0751c0a7031ee396ffa76353c174d808cc6c5e')[0]
$bank=Awc (Member $a 'ra_ns01_idle_a.awc');$originalBank=Awc ([IO.File]::ReadAllBytes($sourceBankPin.path));$idle=@($originalBank.Streams|Where-Object {$_.Hash.Hash-eq0x1d18b9a1L})
Check ($idle.Count-eq1-and$bank.Streams.Count-eq1-and(Digest $idle[0].GetPcmData())-ceq(Digest $bank.Streams[0].GetPcmData())-and(Digest $bank.Streams[0].GetPcmData())-ceq'7b0e711658549ac86ae3c25ccfe36c16d04e3192b62acea2acba7f0adadc0bee') 'Unchanged non-silent selected PCM in preserved S3'
# These adverse fixtures exercise the actual strict body and identity checks.
$s1=One $g (Jenk 'ra_ns05_bati_s1');$oldg=Rel (Member $old 'ra_ns01_game.dat151.rel');$olds=Rel (Member $old 'ra_ns01_sounds.dat54.rel')
Reject 'Previous private preserve root cannot pass S1 body check' {EqualBody (One $oldg ([uint32]0x7669511e)).Data $s1.Data}
Reject 'Previous relocated sound cannot pass S2 body check' {EqualBody (One $olds ([uint32]0x926de8a9L)).Data (One $s (Jenk 'ra_ns05_sound_s2')).Data}
$bad=[byte[]]$s1.Data.Clone();$bad[$bad.Length-1]=$bad[$bad.Length-1]-bxor1
Reject 'An undeclared S1 body mutation is rejected' {EqualBody $bad $s1.Data}
Reject 'An absent or wrong record identity is rejected' {[void](One $g ([uint32]0x12345678))}
$badAwc=[byte[]](Member $a 'ra_ns01_idle_a.awc');$badAwc[$badAwc.Length-1]=$badAwc[$badAwc.Length-1]-bxor1
Reject 'A changed preserved AWC is rejected' {EqualBody $badAwc (Member $old 'ra_ns01_idle_a.awc')}
Check ((Hash $Manifest)-ceq$manifestHash-and(Hash $m.dlc.path)-ceq$m.dlc.sha256) 'Evidence stayed unchanged during validation'
[IO.Directory]::CreateDirectory($out)|Out-Null
$result=[ordered]@{schema='NativeSuppression05PackedResourceValidation';passed=$true;runtimeQualified=$false;testSha256=(Hash $PSCommandPath);manifest=@{path=[IO.Path]::GetFullPath($Manifest);sha256=$manifestHash};archive=$m.dlc;checks=@($checks);limitations=@('Offline typed records and bytes do not establish game registration, selection, bank resolution, or equivalent runtime behaviour','D corroborates root selection only when future audible and readback observations agree','S1 or S2 sounding stock can still be ignored assignment or stock fallback')}
$result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8
Write-Output ('PASS: '+$checks.Count+' focused checks; runtime unqualified')
