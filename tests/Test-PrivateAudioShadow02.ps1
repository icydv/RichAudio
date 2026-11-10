#requires -Version 7.0
# Original-authored records only. This fixture emits standalone private RELs,
# never a DLC, stock replacement archive or live suppression candidate.
param([Parameter(Mandatory)][string]$CodeWalkerCore,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $out)){throw 'Fresh project-private output required'}
for($dir=$out;$dir;$dir=[IO.Path]::GetDirectoryName($dir)){
 if((Test-Path -LiteralPath $dir) -and ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}
}
$coreHash=(Get-FileHash -LiteralPath $CodeWalkerCore).Hash.ToLowerInvariant()
if($coreHash -cne '3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'){throw 'Pinned CodeWalker Core required'}
Add-Type -Path (Resolve-Path -LiteralPath $CodeWalkerCore)
[void][IO.Directory]::CreateDirectory($out)
$utf8=[Text.UTF8Encoding]::new($false)
function ReadRel([byte[]]$bytes){
 $rel=[CodeWalker.GameFiles.RelFile]::new()
 $rel.Load($bytes,$null)
 return $rel
}
function EncodeRel([xml]$xml){return ,([CodeWalker.GameFiles.XmlRel]::GetRel($xml).Save())}
function Digest([byte[]]$bytes){return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
function Word($value){return ('{0:x8}' -f [uint32]$value.Hash)}
function MakeRecord([string]$type,[string]$name,[string]$body=''){
 return "<Item type='$type' ntOffset='0'><Name>$name</Name>$body</Item>"
}
function MakeRel([string]$kind,[string[]]$items){return [xml]("<$kind><Version value='1'/><Items>"+($items -join '')+"</Items></$kind>")}

$conventional=@('EngineIdleLoop','ExhaustIdleLoop','EngineLow','EngineHigh','ExhaustLow','ExhaustHigh','RevsOff')
$conventionalFields=($conventional | ForEach-Object {"<$_>ra_stock_$($_.ToLowerInvariant())</$_>"}) -join ''
$fixtureGame=MakeRel Dat151 @(
 (MakeRecord Vehicle ra_stock_vehicle '<Engine>ra_stock_conventional</Engine><EngineGranular>ra_stock_granular</EngineGranular><Horns>ra_stock_horn</Horns><Collision>ra_stock_collision</Collision><Unk29>ra_stock_pop</Unk29>'),
 (MakeRecord VehicleEngine ra_stock_conventional ($conventionalFields+'<Transmission>ra_stock_transmission</Transmission><AirIntakeUpgraded>ra_stock_pop</AirIntakeUpgraded>')),
 (MakeRecord VehicleEngineGranular ra_stock_granular '<EngineAccel>ra_stock_engine</EngineAccel><EngineAccelNPC>ra_stock_npc</EngineAccelNPC><ExhaustAccel>ra_stock_exhaust</ExhaustAccel><ExhaustAccelNPC>ra_stock_exhaust</ExhaustAccelNPC><IdleSub>ra_stock_idle</IdleSub><LimiterPops>ra_stock_pop</LimiterPops><EngineSubmix>ra_stock_synth</EngineSubmix><EngineSubmixPreset>ra_stock_preset</EngineSubmixPreset><ExhaustSubmix>ra_stock_synth</ExhaustSubmix><ExhaustSubmixPreset>ra_stock_preset</ExhaustSubmixPreset>')
)
$header='<Header><Flags value="0x0"/></Header>'
$fixtureSounds=MakeRel Dat54 @(
 (MakeRecord GranularSound ra_stock_engine $header),
 (MakeRecord GranularSound ra_stock_npc ($header+'<ParentSound>ra_stock_engine</ParentSound>')),
 (MakeRecord EnvironmentSound ra_stock_exhaust $header),
 (MakeRecord ModularSynthSound ra_stock_idle ($header+'<SynthSound>ra_stock_synth</SynthSound><EnvironmentSounds><Item>ra_stock_pop</Item><Item>hash_00000000</Item><Item>hash_00000000</Item><Item>hash_00000000</Item></EnvironmentSounds>')),
 ($conventional | ForEach-Object {MakeRecord SimpleSound ('ra_stock_'+$_.ToLowerInvariant()) $header}),
 (@('horn','collision','pop','transmission') | ForEach-Object {MakeRecord SimpleSound ('ra_stock_'+$_) $header})
)
# These DAT10 records are structural fixtures for preserved references. They
# are never emitted in the private DAT151/DAT54s or evaluated as synth code.
$fixtureSynth=MakeRel Dat10 @(
 (MakeRecord Synth ra_stock_synth '<Assembly></Assembly>'),
 (MakeRecord SynthPreset ra_stock_preset)
)
$fixtures=[ordered]@{Dat151=$fixtureGame;Dat54=$fixtureSounds;Dat10=$fixtureSynth}
$stock=@{}
foreach($kind in $fixtures.Keys){
 $bytes=EncodeRel $fixtures[$kind]
 $pin=Digest $bytes
 foreach($record in (ReadRel $bytes).RelDatas){
  $hash=Word $record.NameHash
  if($stock.ContainsKey($hash)){throw 'Fixture stock hash collision'}
  $stock[$hash]=@{record=$record;kind=$kind;pin=$pin}
 }
}
$roots=[ordered]@{VehicleAudioRecord='ra_stock_vehicle';EngineRecord='ra_stock_conventional';GranularRecord='ra_stock_granular';'Sounds.EngineAccel'='ra_stock_engine';'Sounds.ExhaustAccel'='ra_stock_exhaust'}
function NamedHash([string]$name){return ('{0:x8}' -f [CodeWalker.GameFiles.JenkHash]::GenHash($name))}
$graph=[ordered]@{
 Kind='RichAudioBatiAudioDependencyGraph01'
 Roots=@($roots.Keys|ForEach-Object {@{Label=$_;NodeId=(NamedHash $roots[$_]);State='resolved-metadata-root'}})
 Nodes=@($stock.Keys|Sort-Object|ForEach-Object {@{Id=$_;Record=@{ParserType=$stock[$_].record.GetType().Name;Hash=$_};SourceBinding=@{State='exact-rel-metadata-bytes-sha256';SHA256=$stock[$_].pin}}})
 Edges=@(foreach($id in ($stock.Keys|Sort-Object)){
  $record=$stock[$id].record
  foreach($property in ($record.GetType().GetProperties()|Where-Object {$_.PropertyType.FullName -ceq 'CodeWalker.GameFiles.MetaHash' -and $_.Name -cne 'NameHash'}|Sort-Object Name)){
   $hash=Word ($property.GetValue($record))
   $targets=@(if($hash -cne '00000000' -and $stock.ContainsKey($hash)){$hash})
   $state=if($targets.Count){'unique-public-audio-record'}elseif($hash -ceq '00000000'){'zero-reference-not-proof-of-silence'}else{'unresolved-public-audio-reference'}
   @{From=$id;Field=$property.Name;Hash=$hash;Targets=$targets;Resolution=$state;DeclaredType=$property.PropertyType.FullName;Namespace='audio-record-candidate'}
  }
 })
}
$catalogue=Join-Path $out 'authored-catalogue.json'
[IO.File]::WriteAllText($catalogue,(@{Vehicles=@(@{Model='bati';AudioDependencyGraph01=$graph})}|ConvertTo-Json -Depth 12),$utf8)
$audit=& node (Join-Path $repo 'tools/Compare-BatiAccelerationRedirect01.mjs') $catalogue --continuous --shadow ra_shadow_2222444466668888
if($LASTEXITCODE){throw 'Actual private topology planner rejected the authored graph'}
$planPath=Join-Path $out 'authored-plan.json'
[IO.File]::WriteAllText($planPath,($audit -join "`n"),$utf8)
$shadow=($audit|ConvertFrom-Json).shadow
if($shadow.records.Count -ne 13 -or !$shadow.disabled -or $shadow.bodiesSerialized){throw 'Unexpected authored plan scope'}
$stockBefore=@{};foreach($id in $stock.Keys){$stockBefore[$id]=Digest $stock[$id].record.Data}
$privateHashes=@{};foreach($row in $shadow.records){$privateHashes[$row.hash]=$row}
$verifiedBodies=0
$outputPins=@(foreach($kind in @('Dat151','Dat54')){
 $rows=@($shadow.records|Where-Object {$stock[$_.stock.hash].kind -ceq $kind})
 $candidate=MakeRel $kind @()
 foreach($row in $rows){
  $origin=$stock[$row.stock.hash]
  if(!$origin -or $origin.pin -cne $row.stock.sourceSha256 -or $origin.record.GetType().Name -cne $row.stock.type -or
     (NamedHash $row.name) -cne $row.hash -or $stock.ContainsKey($row.hash)){throw 'Private identity or provenance differs'}
  $original=@($fixtures[$kind].DocumentElement.Items.SelectNodes('Item')|Where-Object {(NamedHash $_.Name) -ceq $row.stock.hash})
  if($original.Count -ne 1){throw 'Missing exact original authored body'}
  $item=$candidate.ImportNode($original[0],$true)
  $item.SelectSingleNode('Name').InnerText=$row.name
  foreach($relocation in $row.relocations){
   if((Word $origin.record.($relocation.field)) -cne $relocation.from -or $privateHashes[$relocation.to].name -cne $relocation.privateTarget){throw 'Unbound relocation'}
   $field=$item.SelectSingleNode($relocation.field)
   if(!$field){throw 'Missing explicit authored reference field'}
   $field.InnerText=$relocation.privateTarget
  }
  [void]$candidate.DocumentElement.SelectSingleNode('Items').AppendChild($item)
 }
 $bytes=EncodeRel $candidate
 $readback=ReadRel $bytes
 if($readback.RelDatas.Count -ne $rows.Count){throw 'Unexpected private record population'}
 foreach($record in $readback.RelDatas){
  $row=$privateHashes[(Word $record.NameHash)]
  if(!$row -or $record.GetType().Name -cne $row.stock.type){throw 'Private type or hash failed round trip'}
  foreach($relocation in $row.relocations){
   if((Word $record.($relocation.field)) -cne $relocation.to){throw 'Relocation failed round trip'}
   $record.($relocation.field)=$stock[$row.stock.hash].record.($relocation.field)
  }
  # Reverse exactly the declared fields in the decoded copy, then compare
  # the entire typed serialized body, including unclassified fields.
  $restored=ReadRel ($readback.Save())
  $body=@($restored.RelDatas|Where-Object {(Word $_.NameHash) -ceq $row.hash})
  if($body.Count -ne 1 -or (Digest $body[0].Data) -cne $stockBefore[$row.stock.hash]){throw "Preserved serialized body differs: $($row.role)"}
  $verifiedBodies++
 }
 $file=Join-Path $out ("authored-private."+ $kind.ToLowerInvariant()+'.rel')
 [IO.File]::WriteAllBytes($file,$bytes)
 @{file=[IO.Path]::GetFileName($file);sha256=(Digest $bytes);records=$rows.Count}
})
foreach($id in $stock.Keys){if((Digest $stock[$id].record.Data) -cne $stockBefore[$id]){throw 'Stock record body changed'}}
. (Join-Path $repo 'tools/native-control/Build-MarkerDlc01.ps1') -MarkerReview unused -CodeWalkerCore $CodeWalkerCore -Output $out -FunctionsOnly
$open=Join-Path $out 'authored-open.rpf'
[void][CodeWalker.GameFiles.RpfFile]::CreateNew($out,'authored-open.rpf',[CodeWalker.GameFiles.RpfEncryption]::OPEN)
if((Read-MarkerRpf01 $open).Encryption -ne [CodeWalker.GameFiles.RpfEncryption]::OPEN){throw 'Authored OPEN control failed'}
# Exact 16-byte value from the retained qualification receipt. This fixture
# contains only the header and deliberately has no archive table or payload.
$ng=Join-Path $out 'retained-ng-header-fixture.rpf'
[IO.File]::WriteAllBytes($ng,[Convert]::FromHexString('37465052FE06000050440000FFFFEF0F'))
$ngRejected=$false
try{[void](Read-MarkerRpf01 $ng)}catch{
 if($_.Exception.Message -cne 'Exact OPEN RPF required before archive scan'){throw}
 $ngRejected=$true
}
if(!$ngRejected){throw 'Marker writer accepted the retained NG header'}
$receipt=[ordered]@{scope='original-authored byte-level codec fixture';stockRecordsPreserved=$stock.Count;privateRecords=$verifiedBodies;
 relocations=@($shadow.records.relocations).Count;codecSha256=$coreHash;outputs=$outputPins;
 authoredOpenAccepted=$true;retainedNgHeaderRejectedBeforeScan=$ngRejected;
 runtimeRegistrationVerified=$false;suppressionVerified=$false}
$json=$receipt|ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $out 'receipt.json'),$json,$utf8)
Write-Output $json
