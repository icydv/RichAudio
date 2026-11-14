#requires -Version 7.5
# One new private root; old candidate files and every waveform stay unchanged.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local/native-suppression-01')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh private candidate output required'}
function Need($ok,$why){if(!$ok){throw $why}}
function Sha($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Digest([byte[]]$b){[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant()}
function Pin($p){[ordered]@{path=$p;bytes=(Get-Item -LiteralPath $p).Length;sha256=(Sha $p)}}
function Jenk($n){[CodeWalker.GameFiles.JenkHash]::GenHash($n.ToLowerInvariant())}
foreach($p in @($out,$repo)){for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked path refused'}}}
Need (!(Get-Process -Name GTA5_Enhanced,PlayGTAV,obs64,RAGEPluginHook -ErrorAction SilentlyContinue)) 'Offline preparation only'
$core='C:\Users\Libby\Desktop\CodeWalker30_dev46\CodeWalker.Core.dll'
Need ((Sha $core)-ceq'3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8') 'Disk codec drift'
Add-Type -Path $core
$game='D:\Games\steamapps\common\Grand Theft Auto V Enhanced'
Import-Module (Join-Path $repo 'src/acoustics/startup/CodeWalkerInitialization01.psm1') -Force
$init=Initialize-InstalledCodeWalker01 -GameRoot $game
$old=Join-Path $repo '.local/native-suppression-01/candidate-05/dlc-02/dlc.rpf'
$shadow='C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\candidate-01\shadow\update.rpf'
Need ((Sha $old)-ceq'762ea39028579a9412aa995db275112bd536f0728645ae75018695037027490c') 'Candidate05 DLC drift'
Need ((Sha $shadow)-ceq'4ad49ed8379b202fd49b314fb5bd5662fcb5eaaec64f552fafa13b4894977af5') 'Retained installed shadow drift'
function Rpf($p,$n){$a=[CodeWalker.GameFiles.RpfFile]::new($p,$n);$a.ScanStructure($null,$null);Need (!$a.LastError) 'Archive scan failed';return $a}
function Member($a,$suffix){$e=@($a.AllEntries|Where-Object {$_.Path.EndsWith($suffix,[StringComparison]::OrdinalIgnoreCase)-and$_-is[CodeWalker.GameFiles.RpfFileEntry]});Need ($e.Count-eq1) ('Unique member '+$suffix);return ,$a.ExtractFile($e[0])}
function Rel($bytes){$r=[CodeWalker.GameFiles.RelFile]::new();$r.Load($bytes,$null);return $r}
$u=Rpf $shadow 'update\update.rpf'
$gb=Member $u 'x64\audio\config\game.dat151.rel';$sb=Member $u 'x64\audio\config\sounds.dat54.rel'
[xml]$g=[CodeWalker.GameFiles.RelXml]::GetXml((Rel $gb));[xml]$s=[CodeWalker.GameFiles.RelXml]::GetXml((Rel $sb))
$vehicleBytes=Member $u 'update.rpf\common\data\levels\gta5\vehicles.meta'
[xml]$vehicles=[Text.Encoding]::UTF8.GetString($vehicleBytes)
$meta=@();foreach($model in @('adder','bati')){
 $v=@($vehicles.SelectNodes('//Item[modelName="'+$model+'"]'));Need ($v.Count-eq1-and$v[0].SelectSingleNode('audioNameHash').InnerText-ceq'') 'Exact stock model has empty audio-name override'
 $meta+=@{modelName=$model;audioNameHashOverride=$v[0].SelectSingleNode('audioNameHash').InnerText;audioObjectRoot=('{0:x8}'-f(Jenk $model));rootBasis='Existing typed audio root, not display text or an invented nonempty vehicles.meta override'}
}
$adder=$g.SelectSingleNode('/Dat151/Items/Item[Name="hash_B779A091"]');$bati=$g.SelectSingleNode('/Dat151/Items/Item[Name="hash_F9300CC5"]')
Need ((Jenk 'ADDER')-eq0xb779a091L-and$adder.type-ceq'Vehicle'-and$adder.Engine-ceq'hash_EF1B6A52'-and$adder.EngineGranular-ceq'hash_FE2C005B'-and$adder.Horns-ceq'hash_F7725613') 'Verified ADDER audio root required'
$granular=$g.SelectSingleNode('/Dat151/Items/Item[Name="hash_FE2C005B"]');Need ($granular.EngineAccel-ceq'hash_F57247B7') 'ADDER player graph differs'
$sound=$s.SelectSingleNode('/Dat54/Items/Item[Name="hash_F57247B7"]');Need ($sound.Channel4.ContainerName-ceq'hash_EC965264'-and$sound.Channel4.FileName-ceq'engine_idle') 'ADDER stock idle references differ'
$bankName=@($s.Dat54.ContainerPaths.Item|Where-Object {(Jenk $_.Replace('\','/'))-eq0xec965264L});Need ($bankName.Count-eq1) 'ADDER bank name required'
$bus=$g.SelectSingleNode('/Dat151/Items/Item[Name="hash_D577C962"]');Need ($bus.Horns-ceq'hash_98A97784') 'Bus donor root differs'
$horns=@();$sets=@{}
foreach($list in @('F0760D26','F7725613','98A97784')){
 $root=$s.SelectSingleNode('/Dat54/Items/Item[Name="hash_'+$list+'"]');Need ($root.type-ceq'SoundHashList') 'Horn list required'
 $sets[$list]=@($root.SoundHashes.Item)
 $todo=[Collections.Generic.Queue[string]]::new();$seen=[Collections.Generic.HashSet[string]]::new();$todo.Enqueue('hash_'+$list)
 while($todo.Count){$name=$todo.Dequeue();if(!$name-or!$seen.Add($name)){continue};$n=$s.SelectSingleNode('/Dat54/Items/Item[Name="'+$name+'"]');Need ($null-ne$n) ('Horn child missing '+$name)
  if($n.type-ceq'SimpleSound'){Need ($n.ContainerName-ceq'hash_F205B596') 'Expected RESIDENT/VEHICLES horn bank';$horns+=@{list=$list;record=$name;stream=$n.FileName;container=$n.ContainerName;pitch=$n.Header.Pitch.value;category=$n.Header.Category;xml=$n.OuterXml}}
  foreach($link in $n.SelectNodes('SoundHashes/Item|ChildSounds/Item|ChildSound|FallBackSound')){if($link.InnerText){$todo.Enqueue($link.InnerText)}}
 }
}
Need (@($sets['98A97784']|Where-Object {$_-in$sets['F0760D26']-or$_-in$sets['F7725613']}).Count-eq0) 'Donor sound identities must be disjoint'
$batiStreams=@($horns|Where-Object list -eq 'F0760D26'|ForEach-Object stream)
Need (@($horns|Where-Object {$_.list-ceq'98A97784'-and$_.stream-in$batiStreams}).Count-eq0) 'Donor leaves must differ from Bati horn waves'
$resident=Join-Path $game 'x64/audio/sfx/RESIDENT.rpf';$rp=Pin $resident;$r=Rpf $resident 'resident.rpf'
$entry=@($r.AllEntries|Where-Object Name -CEQ 'vehicles.awc');Need ($entry.Count-eq1) 'Unique stock horn AWC'
$raw=$r.ExtractFile($entry[0]);$rawPin=Digest $raw;$awc=[CodeWalker.GameFiles.AwcFile]::new();$awc.Load($raw,$entry[0]);Need (!$awc.ErrorMessage) 'Stock horn AWC read failed'
$leaves=@();foreach($stream in @($horns.stream|Sort-Object -Unique)){
 $hash=[Convert]::ToUInt32($stream.Substring(5),16)-band0x1fffffffL;$wave=@($awc.Streams|Where-Object {$_.Hash.Hash-eq$hash});Need ($wave.Count-eq1) ('Stock horn stream absent '+$stream)
 $pcm=$wave[0].GetPcmData();Need ($pcm.Length-gt0-and@($pcm|Where-Object {$_-ne0}|Select-Object -First 1).Count-eq1) 'Horn PCM is nonzero'
 $leaves+=@{stream=$stream;storedHash=('{0:x8}'-f$hash);samples=$wave[0].SampleCount;rate=$wave[0].SamplesPerSecond;pcmSha256=(Digest $pcm)}
}
$root=$adder.CloneNode($true);$root.SelectSingleNode('Name').InnerText='ra_ns06_adder_select';$root.SetAttribute('ntOffset','0');$root.Horns='hash_98A97784'
[xml]$doc='<Dat151><Version value="72079594"/><Items>'+ $root.OuterXml +'</Items></Dat151>'
$newRel=[CodeWalker.GameFiles.XmlRel]::GetRel($doc).Save();$round=Rel $newRel
Need ($round.RelDatas.Count-eq1-and$round.RelDatas[0].NameHash.Hash-eq(Jenk 'ra_ns06_adder_select')) 'Private identity serialization differs'
$a=Rpf $old 'dlc.rpf';$payload=@{};foreach($e in $a.AllEntries|Where-Object {$_-is[CodeWalker.GameFiles.RpfFileEntry]}){$payload[$e.Name]=$a.ExtractFile($e)}
Need ($payload.Count-eq9) 'Exact previous DLC member set'
$logical='dlc_ra_ns01_8b7e24c1:/x64/audio/config/ra_ns06_game.dat'
$insert='<Item><filename>'+ $logical +'</filename><fileType>AUDIO_GAMEDATA</fileType><overlay value="false"/><disabled value="true"/><persistent value="false"/></Item>'
$enable='<Item>'+ $logical +'</Item>'
$content=[Text.Encoding]::UTF8.GetString($payload['content.xml']);Need (([regex]::Matches($content,'</dataFiles>')).Count-eq1-and([regex]::Matches($content,'</filesToEnable>')).Count-eq1) 'Unique registration anchors'
$newContent=$content.Replace('</dataFiles>',$insert+'</dataFiles>').Replace('</filesToEnable>',$enable+'</filesToEnable>')
$payload['content.xml']=[Text.UTF8Encoding]::new($false).GetBytes($newContent);$payload['ra_ns06_game.dat151.rel']=$newRel
[IO.Directory]::CreateDirectory($out)|Out-Null
$dlcDir=Join-Path $out 'dlc';[IO.Directory]::CreateDirectory($dlcDir)|Out-Null
$pack=[CodeWalker.GameFiles.RpfFile]::CreateNew($dlcDir,'dlc.rpf',[CodeWalker.GameFiles.RpfEncryption]::OPEN)
$x64=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($pack.Root,'x64');$audio=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($x64,'audio');$config=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($audio,'config');$sfx=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($audio,'sfx');$waves=[CodeWalker.GameFiles.RpfFile]::CreateDirectory($sfx,'dlc_ra_ns01_8b7e24c1')
foreach($name in $payload.Keys){$parent=if($name.EndsWith('.rel')){$config}elseif($name.EndsWith('.awc')){$waves}else{$pack.Root};[void][CodeWalker.GameFiles.RpfFile]::CreateFile($parent,$name,$payload[$name],$false)}
$path=Join-Path $dlcDir 'dlc.rpf';$packed=Rpf $path 'dlc.rpf';$members=@()
foreach($name in $payload.Keys){$b=Member $packed $name;Need ((Digest $b)-ceq(Digest $payload[$name])) 'Packed payload differs';if($name-notin@('content.xml','ra_ns06_game.dat151.rel')){Need ((Digest $b)-ceq(Digest (Member $a $name))) 'Old payload changed'};$members+=@{name=$name;sha256=(Digest $b);bytes=$b.Length}}
Need ((Sha $old)-ceq'762ea39028579a9412aa995db275112bd536f0728645ae75018695037027490c'-and(Sha $resident)-ceq$rp.sha256) 'Inputs changed during inspection'
[IO.File]::WriteAllBytes((Join-Path $out 'ra_ns06_game.dat151.rel'),$newRel)
$doc.Save((Join-Path $out 'ra_ns06_game.dat151.rel.xml'))
$receipt=[ordered]@{schema='NativeSuppression06SelectionResources';passed=$true;runtimeQualified=$false;builder=(Pin $PSCommandPath);codec=(Pin $core);oldDlc=(Pin $old);shadow=(Pin $shadow);resident=$rp;diskInitialization=$init;stockVehicleMetadata=@{member='update\update.rpf\common\data\levels\gta5\vehicles.meta';sha256=(Digest $vehicleBytes);records=$meta};stockRels=@{gameSha256=(Digest $gb);soundsSha256=(Digest $sb)};stockPositive=@{name='ADDER';root='B779A091';engine=$adder.Engine;granular=$adder.EngineGranular;playerSound=$granular.EngineAccel;idleBank=$bankName[0];idleContainer='EC965264';idleStream='engine_idle';hornList=$adder.Horns};private=@{name='ra_ns06_adder_select';hash=('{0:x8}'-f(Jenk 'ra_ns06_adder_select'));basis='Stock ADDER body, only private identity bookkeeping and bus horn child changed';hornList='98A97784';privateChildGraph=$false;privateBankDependency=$false;predictedSignature='Previously admitted ADDER engine/exhaust signature, or attributable bus horn. Ordinary horn routing itself requires runtime observation.'};hornSets=$sets;hornLeaves=$horns;stockHornBank=@{member='vehicles.awc';rawSha256=$rawPin;leaves=$leaves};dlc=(Pin $path);members=$members;contentDelta=@{logical=$logical;insertData=$insert;insertEnable=$enable;otherContentBytesPreserved=$true};oldResourcesPreserved=$true;newRecords=1;newRelFiles=1;newWaveforms=0;limits=@('Audio-name metadata override is empty; ADDER is verified as an actual typed audio root','Static closure and distinct PCM do not prove effective forced routing','Horn mods, bike-specific flags, audio-object lifetime and player/AI routing can affect the physical horn','A failed signature is unresolved lookup/registration/switching, not a proven missing file')}
$receipt|ConvertTo-Json -Depth 16|Set-Content -LiteralPath (Join-Path $out 'resources.json') -Encoding utf8
'PASS: one new stock-reference root, unchanged old payloads and verified stock horn streams'
