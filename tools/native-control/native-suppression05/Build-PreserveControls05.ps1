#requires -Version 7.0
# Native-only diagnostic controls. All assets and evidence stay in fresh .local outputs.
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$InstalledScope,
 [Parameter(Mandatory)][string]$InstalledLedger,
 [Parameter(Mandatory)][string]$RestorationReceipt,
 [Parameter(Mandatory)][string]$RetainedRelDirectory,
 [Parameter(Mandatory)][string]$DecodedBatiAwc,
 [Parameter(Mandatory)][string]$PreviousResourceManifest,
 [Parameter(Mandatory)][string]$OutputDirectory,
 [Parameter(Mandatory)][string]$DlcOutputDirectory,
 [string]$CodeWalkerCore='C:\Users\Libby\Desktop\CodeWalker30_dev46\CodeWalker.Core.dll'
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$private=[IO.Path]::GetFullPath((Join-Path $repo '.local'))+'\'
function NoLinks([string]$path){for($at=[IO.Path]::GetFullPath($path);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked path refused'}}}
foreach($path in @($OutputDirectory,$DlcOutputDirectory)){
 $full=[IO.Path]::GetFullPath($path);NoLinks $full
 if(!$full.StartsWith($private,[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $full)){throw 'Fresh task-private output required'}
}
$out=[IO.Path]::GetFullPath($OutputDirectory);$dlcOut=[IO.Path]::GetFullPath($DlcOutputDirectory)
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Digest([byte[]]$bytes){[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
function Require([bool]$value,[string]$message){if(!$value){throw $message}}
$inputs=[ordered]@{}
function Pin([string]$path,[string]$expected=''){
 $path=[IO.Path]::GetFullPath($path);NoLinks $path;$hash=Hash $path
 if($expected-and$hash-cne$expected){throw "Input drift: $path"}
 $inputs[$path]=[ordered]@{path=$path;bytes=(Get-Item -LiteralPath $path).Length;sha256=$hash}
}
Pin $InstalledScope '64efcd039abaf99250445489e69173186cbc6d8154c17524a480c379a6bbf4bb'
Pin $InstalledLedger;Pin $RestorationReceipt '68e5f3de7dd80f544def95f971929e2ea90f38df119493aaaaf57e375e141e04'
Pin $CodeWalkerCore '3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'
$gameXml=Join-Path $RetainedRelDirectory 'game.dat151.rel.xml';$soundsXml=Join-Path $RetainedRelDirectory 'sounds.dat54.rel.xml'
Pin $gameXml '4c94c681996251253f49be45a3f3a4697dd833f057175f95aa197c158ffdc6c9'
Pin $soundsXml '2a1a61e8ccbd5e6d2d58c38783c1027d05ccc65583450d7e44a11ec5761b9e8f'
Pin $DecodedBatiAwc '1a1a43aea31f3e4e4c1dd3355a0751c0a7031ee396ffa76353c174d808cc6c5e'
Pin $PreviousResourceManifest '1d007ca993b3c672c372313d6e1f669a0f9e99fe3144ad18132d372767603d2d'
$scope=Get-Content -LiteralPath $InstalledScope -Raw|ConvertFrom-Json
$ledger=Get-Content -LiteralPath $InstalledLedger -Raw|ConvertFrom-Json
$cleanup=Get-Content -LiteralPath $RestorationReceipt -Raw|ConvertFrom-Json
Require ($scope.candidateName-ceq'candidate-04'-and$ledger.candidate-ceq'candidate-04'-and$ledger.scopeSha256-ceq$inputs[[IO.Path]::GetFullPath($InstalledScope)].sha256-and$ledger.status-ceq'restored-independently-verified'-and$cleanup.passed-eq$true-and$cleanup.scopeSha256-ceq$ledger.scopeSha256-and$cleanup.sourceCommit-ceq$ledger.sourceCommit) 'Candidate04 installation/restoration binding differs'
$oldDlc=@($ledger.files|Where-Object {$_.destination.EndsWith('\ra_ns01_8b7e24c1\dlc.rpf')})
Require ($oldDlc.Count-eq1-and$oldDlc[0].state-ceq'removed-verified'-and$oldDlc[0].sha256-ceq'24574c8364812861443d10e855235cbb51715a37ec7849a2dcbc38f68106be60') 'Exact installed DLC receipt required'
Pin $oldDlc[0].source $oldDlc[0].sha256
Add-Type -Path $CodeWalkerCore
function Jenk([string]$name){[CodeWalker.GameFiles.JenkHash]::GenHash($name.ToLowerInvariant())}
function RefHash([string]$name){if($name-match'^hash_([0-9a-fA-F]{8})$'){[Convert]::ToUInt32($Matches[1],16)}elseif(!$name){[uint32]0}else{Jenk $name}}
function ReadRel([byte[]]$bytes){$r=[CodeWalker.GameFiles.RelFile]::new();$r.Load($bytes,$null);return $r}
function ReadAwc([byte[]]$bytes){$r=[CodeWalker.GameFiles.AwcFile]::new();$e=[CodeWalker.GameFiles.RpfBinaryFileEntry]::new();$e.Name='retained.awc';$r.Load($bytes,$e);Require (!$r.ErrorMessage) 'AWC read error';return $r}
function ChunkBytes($chunk){$m=[IO.MemoryStream]::new();$chunk.Write([CodeWalker.GameFiles.DataWriter]::new($m));$bytes=$m.ToArray();$m.Dispose();return ,$bytes}
function RelXml([string]$kind,$records,[string[]]$containers=@()){
 $table=if($containers.Count){'<ContainerPaths>'+(($containers|ForEach-Object{'<Item>'+$_+'</Item>'})-join'')+'</ContainerPaths>'}else{''}
 return [xml]("<$kind><Version value='72079594'/>$table<Items>"+(($records|ForEach-Object{$_.OuterXml})-join'')+"</Items></$kind>")
}
function Flatten($node,[string]$path=''){
 $map=[ordered]@{};foreach($a in $node.Attributes){$map[$path+'/@'+$a.Name]=$a.Value}
 $children=@($node.ChildNodes|Where-Object NodeType -eq Element)
 if(!$children.Count){$map[$path+'/text()']=$node.InnerText}
 $counts=@{};foreach($child in $children){$n=$child.Name;if(!$counts.ContainsKey($n)){$counts[$n]=0};$counts[$n]++;$suffix=if(@($children|Where-Object Name -eq $n).Count-gt1){'['+$counts[$n]+']'}else{''};$part=Flatten $child ($path+'/'+$n+$suffix);foreach($key in $part.Keys){$map[$key]=$part[$key]}}
 return $map
}
function Changes($original,$modified){$a=Flatten $original;$b=Flatten $modified;return @(foreach($key in @(@($a.Keys)+@($b.Keys)|Sort-Object -Unique)){if($a[$key]-cne$b[$key]){[ordered]@{field=$key;original=$a[$key];modified=$b[$key]}}})}
function RelTables($r){return [ordered]@{type=[int]$r.RelType;version=$r.DataUnkVal;dataLength=$r.DataLength;nameTableLength=$r.NameTableLength;nameTableCount=$r.NameTableCount;nameTable=@($r.NameTable);nameOffsets=@($r.NameTableOffsets);indexCount=$r.IndexCount;index=@($r.IndexHashes|ForEach-Object{[ordered]@{hash=('{0:x8}'-f$_.Name.Hash);offset=$_.Offset;length=$_.Length}});hashOffsets=@($r.HashTableOffsets);hashes=@($r.HashTable|ForEach-Object{'{0:x8}'-f$_.Hash});packOffsets=@($r.PackTableOffsets);packs=@($r.PackTable|ForEach-Object{'{0:x8}'-f$_.Hash});records=@($r.RelDatas|ForEach-Object{[ordered]@{hash=('{0:x8}'-f$_.NameHash.Hash);type=$_.GetType().Name;offset=$_.DataOffset;length=$_.DataLength;bodySha256=(Digest $_.Data)}})}}
function StockTables($r,[uint32[]]$selected){return [ordered]@{type=[int]$r.RelType;version=$r.DataUnkVal;dataLength=$r.DataLength;nameTableLength=$r.NameTableLength;nameTableCount=$r.NameTableCount;indexCount=$r.IndexCount;hashTableCount=$r.HashTableCount;packTableCount=$r.PackTableCount;selectedRecords=@($r.RelDatas|Where-Object {$_.NameHash.Hash-in$selected}|ForEach-Object{$record=$_;$first=$record.DataOffset+8;$last=$first+$record.DataLength;[ordered]@{hash=('{0:x8}'-f$record.NameHash.Hash);type=$record.GetType().Name;offset=$record.DataOffset;length=$record.DataLength;nameTableOffset=if($record-is[CodeWalker.GameFiles.Dat151RelData]){$record.NameTableOffset}else{$null};bodySha256=(Digest $record.Data);hashTableOffsets=@($r.HashTableOffsets|Where-Object {$_-ge$first-and$_-lt$last});packTableOffsets=@($r.PackTableOffsets|Where-Object {$_-ge$first-and$_-lt$last})}});selectedIndex=@($r.IndexHashes|Where-Object {$_.Name.Hash-in$selected}|ForEach-Object{[ordered]@{hash=('{0:x8}'-f$_.Name.Hash);offset=$_.Offset;length=$_.Length}})}}
function ByteChanges([byte[]]$a,[byte[]]$b){Require ($a.Length-eq$b.Length) 'Record lengths differ';return @(for($i=0;$i-lt$a.Length;$i++){if($a[$i]-ne$b[$i]){[ordered]@{offset=$i;original=$a[$i];modified=$b[$i]}}})}
function BankContext($a){return [ordered]@{magic=$a.Magic;version=$a.Version;flags=$a.Flags;streamCount=$a.StreamCount;dataOffset=$a.DataOffset;chunkIndices=@($a.ChunkIndices);wholeFileEncrypted=$a.WholeFileEncrypted;multiChannel=$a.MultiChannelFlag;multiChannelEncrypted=$a.MultiChannelEncryptFlag;streams=@($a.Streams|ForEach-Object{[ordered]@{id=('{0:x8}'-f$_.Hash.Hash);rawStreamInfo=$_.StreamInfo.RawVal;frames=$_.SampleCount;rate=$_.SamplesPerSecond;chunks=@($_.Chunks|ForEach-Object{[ordered]@{type=$_.ChunkInfo.Type.ToString();offset=$_.ChunkInfo.Offset;size=$_.ChunkInfo.Size;alignment=$_.ChunkInfo.Align;rawChunkInfo=$_.ChunkInfo.RawVal;payloadSha256=(Digest (ChunkBytes $_))}})}})}}
# Read the two original binary RELs from the exact previously installed shadow.
# The existing public disk initializer is used; no process access or key output.
$shadow=@($ledger.files|Where-Object {$_.destination.EndsWith('\mods\update\update.rpf')})
Require ($shadow.Count-eq1-and$shadow[0].sha256-ceq'4ad49ed8379b202fd49b314fb5bd5662fcb5eaaec64f552fafa13b4894977af5') 'Exact previous shadow required'
Pin $shadow[0].source $shadow[0].sha256;Pin $scope.game.path $scope.game.sha256
$initializationModule=Join-Path $repo 'src/acoustics/startup/CodeWalkerInitialization01.psm1';Pin $initializationModule
Import-Module $initializationModule -Force
$initialization=Initialize-InstalledCodeWalker01 -GameRoot ([IO.Path]::GetDirectoryName($scope.game.path))
$stockArchive=[CodeWalker.GameFiles.RpfFile]::new($shadow[0].source,'update\update.rpf');$stockArchive.ScanStructure($null,$null)
Require (!$stockArchive.LastError) 'Retained original REL archive read failed'
$rawExpected=@{'game.dat151.rel'='d431b12eccfcb069547fbd864d0c8bad39769dc68b0267e78f79cb9f25b53506';'sounds.dat54.rel'='bc62e311dd6b8a8160b4c619b0fd7e9bfcb8233f3a06871db1e176044c98bcc3'}
$inventoryPath=Join-Path ([IO.Path]::GetDirectoryName($shadow[0].source)) 'candidate-members.json';Pin $inventoryPath
$inventory=Get-Content -LiteralPath $inventoryPath -Raw|ConvertFrom-Json
$originalRel=[ordered]@{};$stockRelProvenance=@()
foreach($name in $rawExpected.Keys){
 $entry=@($stockArchive.AllEntries|Where-Object {$_.Path-ceq('update\update.rpf\x64\audio\config\'+$name)})
 $sealed=@($inventory|Where-Object {$_.path-ceq('update\update.rpf\x64\audio\config\'+$name)})
 Require ($entry.Count-eq1-and$sealed.Count-eq1-and$sealed[0].rawSha256-ceq$rawExpected[$name]) 'Sealed stock REL member differs'
 $stream=[IO.File]::OpenRead($shadow[0].source)
 try{$stream.Position=$stockArchive.StartPos+[long]$entry[0].FileOffset*512;$raw=[byte[]]::new($entry[0].GetFileSize());$readCount=0;while($readCount-lt$raw.Length){$n=$stream.Read($raw,$readCount,$raw.Length-$readCount);if(!$n){throw 'Truncated stock member'};$readCount+=$n}}finally{$stream.Dispose()}
 Require ((Digest $raw)-ceq$rawExpected[$name]) 'Raw stock REL hash differs from sealed inventory'
 $decoded=$stockArchive.ExtractFile($entry[0]);$originalRel[$name]=$decoded
 $stockRelProvenance+=@{name=$name;member=$entry[0].Path;rawBytes=$raw.Length;rawSha256=(Digest $raw);decodedBytes=$decoded.Length;decodedSha256=(Digest $decoded)}
}
$archive=[CodeWalker.GameFiles.RpfFile]::new($oldDlc[0].source,'dlc.rpf');$archive.ScanStructure($null,$null)
Require (!$archive.LastError-and$archive.Encryption-eq[CodeWalker.GameFiles.RpfEncryption]::OPEN) 'Installed DLC cannot be decoded'
$payload=[ordered]@{};$originalMembers=@()
foreach($entry in $archive.AllEntries|Where-Object {$_-is[CodeWalker.GameFiles.RpfFileEntry]}){$bytes=$archive.ExtractFile($entry);$payload[$entry.Name]=$bytes;$originalMembers+=@{name=$entry.Name;path=$entry.Path;bytes=$bytes.Length;sha256=(Digest $bytes)}}
Require ($payload.Count-eq7) 'Original payload set differs'
[xml]$game=Get-Content -LiteralPath $gameXml -Raw;[xml]$sounds=Get-Content -LiteralPath $soundsXml -Raw
$stockVehicle=$game.SelectSingleNode('/Dat151/Items/Item[Name="hash_F9300CC5"]')
$stockConfig=$game.SelectSingleNode('/Dat151/Items/Item[Name="hash_61F3BD06"]')
$stockSound=$sounds.SelectSingleNode('/Dat54/Items/Item[Name="hash_0346A636"]')
Require ($stockVehicle.type-ceq'Vehicle'-and$stockConfig.type-ceq'VehicleEngineGranular'-and$stockSound.type-ceq'GranularSound') 'Stock typed roots differ'
$stockGameBinary=ReadRel $originalRel['game.dat151.rel'];$stockSoundBinary=ReadRel $originalRel['sounds.dat54.rel']
foreach($source in @(@{kind='Dat151';xml=$stockVehicle;rel=$stockGameBinary;hash=0xf9300cc5L},@{kind='Dat151';xml=$stockConfig;rel=$stockGameBinary;hash=0x61f3bd06L},@{kind='Dat54';xml=$stockSound;rel=$stockSoundBinary;hash=0x0346a636L})){
 $actual=@($source.rel.RelDatas|Where-Object {$_.NameHash.Hash-eq$source.hash})
 $encoded=ReadRel ([CodeWalker.GameFiles.XmlRel]::GetRel((RelXml $source.kind @($source.xml))).Save())
 Require ($actual.Count-eq1-and(Digest $actual[0].Data)-ceq(Digest $encoded.RelDatas[0].Data)) 'Retained stock XML does not reproduce original packed record bytes'
}
Require ($stockVehicle.Horns-ceq'hash_F0760D26'-and$game.SelectSingleNode('/Dat151/Items/Item[Name="hash_D577C962"]/Horns').InnerText-ceq'hash_98A97784') 'Bati/bus horn donor differs'
$hornClosure=@();$hornSets=[ordered]@{}
foreach($root in @('F0760D26','98A97784')){
 $list=$sounds.SelectSingleNode('/Dat54/Items/Item[Name="hash_'+$root+'"]');Require ($list.type-ceq'SoundHashList') 'Stock horn root must be a list'
 $hornSets[$root]=@($list.SoundHashes.Item|ForEach-Object{('{0:x8}'-f(RefHash $_))})
 $todo=[Collections.Generic.Queue[string]]::new();$todo.Enqueue('hash_'+$root);$seen=[Collections.Generic.HashSet[string]]::new()
 while($todo.Count){$name=$todo.Dequeue();if(!$seen.Add($name)){continue};$node=$sounds.SelectSingleNode('/Dat54/Items/Item[Name="'+$name+'"]');Require ($null-ne$node) ('Unresolved horn child '+$name)
  $hornClosure+=@{root=$root;name=$name;type=$node.type;xml=$node.OuterXml}
  if($node.type-ceq'SimpleSound'){Require ($node.ContainerName-ceq'hash_F205B596') 'Horn leaf is not in verified stock container'}
  foreach($link in $node.SelectNodes('SoundHashes/Item|ChildSounds/Item|ChildSound|FallBackSound')){if($link.InnerText){$todo.Enqueue($link.InnerText)}}
 }
}
Require (@($hornSets['F0760D26']|Where-Object {$_-in$hornSets['98A97784']}).Count-eq0) 'Stock horn lists overlap'
$specs=@(
 @{kind='Dat151';name='ra_ns05_bati_select';source=$stockVehicle;fields=@{Horns='hash_98A97784'}},
 @{kind='Dat151';name='ra_ns05_bati_s1';source=$stockVehicle;fields=@{}},
 @{kind='Dat151';name='ra_ns05_bati_s2';source=$stockVehicle;fields=@{EngineGranular='ra_ns05_granular_s2'}},
 @{kind='Dat151';name='ra_ns05_granular_s2';source=$stockConfig;fields=@{EngineAccel='ra_ns05_sound_s2'}},
 @{kind='Dat54';name='ra_ns05_sound_s2';source=$stockSound;fields=@{}}
)
$deltas=@();foreach($spec in $specs){$copy=$spec.source.CloneNode($true);$copy.SelectSingleNode('Name').InnerText=$spec.name;if($copy.HasAttribute('ntOffset')){$copy.SetAttribute('ntOffset','0')};foreach($field in $spec.fields.Keys){$copy.SelectSingleNode($field).InnerText=$spec.fields[$field]};$spec.copy=$copy;$deltas+=@{name=$spec.name;hash=('{0:x8}'-f(Jenk $spec.name));fields=(Changes $spec.source $copy)}}
# The collision check is limited to the retained corpus and the previous private graph.
$previous=Get-Content -LiteralPath $PreviousResourceManifest -Raw|ConvertFrom-Json
$newHashes=@($specs|ForEach-Object{Jenk $_.name});Require (($newHashes|Sort-Object -Unique).Count-eq5) 'New record hash collision'
$namespaceInputs=@($previous.namespaceAudit.inputs|Group-Object path|ForEach-Object{$_.Group[0]})
foreach($input in $namespaceInputs){Pin $input.path $input.sha256;[xml]$xml=Get-Content -LiteralPath $input.path -Raw;foreach($node in $xml.SelectNodes('/*/Items/Item/Name')){Require ((RefHash $node.InnerText)-notin$newHashes) ('Retained record collision '+$node.InnerText)}}
foreach($record in $previous.records){Require ([Convert]::ToUInt32($record.hash,16)-notin$newHashes) 'Previous private record collision'}
$stockContainer=@($sounds.Dat54.ContainerPaths.Item|Where-Object {$_-ceq'STREAMED_VEHICLES_GRANULAR\V_TWIN_2'})
Require ($stockContainer.Count-eq1-and(Jenk $stockContainer[0].Replace('\','/'))-eq0x8b2bacbcL) 'Exact original bank container name differs'
$newRel=[ordered]@{};$newXml=[ordered]@{}
$bodyComparisons=@()
foreach($kind in @('Dat151','Dat54')){
 $rows=@($specs|Where-Object kind -eq $kind|ForEach-Object copy);$containers=if($kind-ceq'Dat54'){$stockContainer}else{@()}
 $xml=RelXml $kind $rows $containers;$bytes=[CodeWalker.GameFiles.XmlRel]::GetRel($xml).Save();$read=ReadRel $bytes
 Require ((Digest $read.Save())-ceq(Digest $bytes)-and$read.RelDatas.Count-eq$rows.Count) 'New REL roundtrip differs'
 $file=if($kind-ceq'Dat151'){'ra_ns05_game.dat151.rel'}else{'ra_ns05_sounds.dat54.rel'};$newRel[$file]=$bytes;$newXml[$file]=$xml.OuterXml
 foreach($spec in $specs|Where-Object kind -eq $kind){$actual=@($read.RelDatas|Where-Object {$_.NameHash.Hash-eq(Jenk $spec.name)});Require ($actual.Count-eq1) 'New unique typed record missing';$single=ReadRel ([CodeWalker.GameFiles.XmlRel]::GetRel((RelXml $kind @($spec.copy))).Save());Require ((Digest $actual[0].Data)-ceq(Digest $single.RelDatas[0].Data)) 'Unaccounted serialized record change';$original=ReadRel ([CodeWalker.GameFiles.XmlRel]::GetRel((RelXml $kind @($spec.source))).Save());$bodyComparisons+=@{name=$spec.name;originalBodySha256=(Digest $original.RelDatas[0].Data);newBodySha256=(Digest $actual[0].Data);length=$actual[0].Data.Length;changedBytes=(ByteChanges $original.RelDatas[0].Data $actual[0].Data)}}
}
$gameLogical='dlc_ra_ns01_8b7e24c1:/x64/audio/config/ra_ns05_game.dat';$soundLogical='dlc_ra_ns01_8b7e24c1:/x64/audio/config/ra_ns05_sounds.dat'
$insertData="<Item><filename>$gameLogical</filename><fileType>AUDIO_GAMEDATA</fileType><overlay value=`"false`"/><disabled value=`"true`"/><persistent value=`"false`"/></Item><Item><filename>$soundLogical</filename><fileType>AUDIO_SOUNDDATA</fileType><overlay value=`"false`"/><disabled value=`"true`"/><persistent value=`"false`"/></Item>"
$insertEnable="<Item>$gameLogical</Item><Item>$soundLogical</Item>"
$oldContent=[Text.Encoding]::UTF8.GetString($payload['content.xml'])
Require (([regex]::Matches($oldContent,'</dataFiles>')).Count-eq1-and([regex]::Matches($oldContent,'</filesToEnable>')).Count-eq1) 'Unique existing registration anchors required'
$content=$oldContent.Replace('</dataFiles>',$insertData+'</dataFiles>').Replace('</filesToEnable>',$insertEnable+'</filesToEnable>')
Require ($content.Replace($insertData,'').Replace($insertEnable,'')-ceq$oldContent) 'Content has an undeclared change'
$utf8=[Text.UTF8Encoding]::new($false);$payload['content.xml']=$utf8.GetBytes($content);foreach($name in $newRel.Keys){$payload[$name]=$newRel[$name]}
[IO.Directory]::CreateDirectory($out)|Out-Null;[IO.Directory]::CreateDirectory($dlcOut)|Out-Null
foreach($name in $payload.Keys){[IO.File]::WriteAllBytes((Join-Path $out $name),$payload[$name])}
foreach($name in $newXml.Keys){[IO.File]::WriteAllText((Join-Path $out ($name+'.xml')),$newXml[$name],$utf8)}
[IO.Directory]::CreateDirectory((Join-Path $out 'original-rel-evidence'))|Out-Null
foreach($name in $originalRel.Keys){[IO.File]::WriteAllBytes((Join-Path $out ('original-rel-evidence/'+$name)),$originalRel[$name])}
$rpf=[CodeWalker.GameFiles.RpfFile]::CreateNew($dlcOut,'dlc.rpf',[CodeWalker.GameFiles.RpfEncryption]::OPEN)
$x64=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($rpf.Root,'x64');$audio=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($x64,'audio');$config=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($audio,'config');$sfx=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($audio,'sfx');$waves=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($sfx,'dlc_ra_ns01_8b7e24c1')
foreach($name in $payload.Keys){$parent=if($name.EndsWith('.rel')){$config}elseif($name.EndsWith('.awc')){$waves}else{$rpf.Root};[void][CodeWalker.GameFiles.RpfFile]::CreateFile($parent,$name,$payload[$name],$false)}
$dlc=Join-Path $dlcOut 'dlc.rpf';$read=[CodeWalker.GameFiles.RpfFile]::new($dlc,'dlc.rpf');$read.ScanStructure($null,$null);Require (!$read.LastError) 'New DLC readback failed'
$members=@($read.AllEntries|Where-Object {$_-is[CodeWalker.GameFiles.RpfFileEntry]});Require ($members.Count-eq9) 'Unexpected packed member count'
$packed=@();foreach($name in $payload.Keys){$member=@($members|Where-Object Name -ceq $name);Require ($member.Count-eq1-and(Digest $read.ExtractFile($member[0]))-ceq(Digest $payload[$name])) 'Packed bytes differ';$packed+=@{name=$name;member=$member[0].Path;sha256=(Digest $payload[$name]);bytes=$payload[$name].Length;offsetSectors=$member[0].FileOffset}}
$originalGame=ReadRel $archive.ExtractFile(@($archive.AllEntries|Where-Object Name -ceq 'ra_ns01_game.dat151.rel')[0]);$originalSound=ReadRel $archive.ExtractFile(@($archive.AllEntries|Where-Object Name -ceq 'ra_ns01_sounds.dat54.rel')[0])
$s3Deltas=@();foreach($item in @(@{kind='Dat151';source=$stockVehicle;hash=0x7669511eL;rel=$originalGame},@{kind='Dat151';source=$stockConfig;hash=0x34b05488L;rel=$originalGame},@{kind='Dat54';source=$stockSound;hash=0x926de8a9L;rel=$originalSound})){
 [xml]$xml=[CodeWalker.GameFiles.RelXml]::GetXml($item.rel);$node=@($xml.SelectNodes('/*/Items/Item')|Where-Object {(RefHash $_.Name)-eq$item.hash})[0]
 $stockRecord=ReadRel ([CodeWalker.GameFiles.XmlRel]::GetRel((RelXml $item.kind @($item.source))).Save())
 $privateRecord=@($item.rel.RelDatas|Where-Object {$_.NameHash.Hash-eq$item.hash})[0]
 $s3Deltas+=@{stockName=$item.source.Name;privateHash=('{0:x8}'-f$item.hash);xmlFieldDifferences=(Changes $item.source $node);originalBodySha256=(Digest $stockRecord.RelDatas[0].Data);privateBodySha256=(Digest $privateRecord.Data);bodyLength=$privateRecord.Data.Length;changedBodyBytes=(ByteChanges $stockRecord.RelDatas[0].Data $privateRecord.Data);note='Field labels come from retained XML; byte differences use original packed stock records reproduced exactly above and the exact candidate04 packed private records'}
}
$bank=ReadAwc $payload['ra_ns01_idle_a.awc'];$sourceBank=ReadAwc ([IO.File]::ReadAllBytes($DecodedBatiAwc))
foreach($input in $stockRelProvenance){$r=ReadRel $originalRel[$input.name];$selection=if($input.name-ceq'game.dat151.rel'){@([uint32]0xf9300cc5L,[uint32]0x61f3bd06L)}else{@([uint32]0x0346a636L)};$input.tables=StockTables $r $selection}
foreach($input in $inputs.Values){Require ((Hash $input.path)-ceq$input.sha256) 'Source changed during preparation'}
$receipt=[ordered]@{schema='NativeSuppression05PreserveControls';sourceHead=(& git -C $repo rev-parse HEAD).Trim();builderSha256=(Hash $PSCommandPath);runtimeQualified=$false;concreteDefectClaimed=$false;profiles=@('ra_ns05_bati_select','ra_ns05_bati_s1','ra_ns05_bati_s2','ra_ns01_bati_a','BATI');inputs=@($inputs.Values);diskCodecInitialization=$initialization;originalBinaryRels=$stockRelProvenance;sourceInstalledMembers=$originalMembers;newRecordDeltas=$deltas;newBodyByteComparisons=$bodyComparisons;sourceS3FieldComparison=$s3Deltas;newRelTables=@($newRel.Keys|ForEach-Object{@{file=$_;tables=(RelTables (ReadRel $newRel[$_]))}});sourceS3RelTables=@((RelTables $originalGame),(RelTables $originalSound));originalBank=(BankContext $sourceBank);preservedPrivateBank=(BankContext $bank);preservePcmSha256=(Digest $bank.Streams[0].GetPcmData());stockHornSets=$hornSets;stockHornClosure=$hornClosure;namespaceAudit=@{corpusFiles=$namespaceInputs.Count;newRecordHashes=@($newHashes|ForEach-Object{'{0:x8}'-f$_});collisions=0;coverage='Retained base/DLC XML corpus and previous private records; not all future custom/live registrations'};contentDelta=@{originalSha256=(Digest $archive.ExtractFile(@($archive.AllEntries|Where-Object Name -ceq 'content.xml')[0]));insertDataFiles=$insertData;insertFilesToEnable=$insertEnable;otherBytesPreserved=$true};unchangedS3Payloads=@($originalMembers|Where-Object {$_.name-ne'content.xml'});dlc=@{path=$dlc;bytes=(Get-Item -LiteralPath $dlc).Length;sha256=(Hash $dlc)};packedMembers=$packed;shadowRebuildRequired=$false;bankRebuilt=$false;sourceHashesUnchanged=$true;limitations=@('Private equivalent sound can be a no-op/fallback; no effective-profile getter','Stock donor horn evidence corroborates root selection only','S2 and S3 differ in private graph identities as well as relocation; semantic intent is not runtime identity','No deliberate silent phase is admitted by this resource preparation')}
$receipt|ConvertTo-Json -Depth 18|Set-Content -LiteralPath (Join-Path $out 'control-manifest.json') -Encoding utf8
Write-Output ('Prepared: '+$dlc+' SHA256 '+(Hash $dlc))
