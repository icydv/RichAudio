# Original-authored DAT151 / DAT54 serialization experiment. No game inputs.
#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$CodeWalkerCore,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedCoreSHA256
)
$ErrorActionPreference='Stop'
$actual=(Get-FileHash -LiteralPath $CodeWalkerCore -Algorithm SHA256).Hash.ToLowerInvariant()
if($actual-cne$ExpectedCoreSHA256){throw 'Pinned CodeWalker Core identity required'}
Add-Type -Path (Resolve-Path -LiteralPath $CodeWalkerCore)
function ReadBack([xml]$Source){
 $bytes=[CodeWalker.GameFiles.XmlRel]::GetRel($Source).Save()
 $read=[CodeWalker.GameFiles.RelFile]::new()
 $read.Load($bytes,$null)
 $read
}
function Assert-Field($Item,[string]$Field,[string]$Expected){
 if($Item.$Field.Hash-ne[CodeWalker.GameFiles.JenkHash]::GenHash($Expected)){throw "Unexpected serialized $Field"}
}
function Find-Record($Rel,[string]$Name){
 $hash=[CodeWalker.GameFiles.JenkHash]::GenHash($Name)
 $records=@($Rel.RelDatas|Where-Object {$_.NameHash.Hash-eq$hash})
 if($records.Count-ne1){throw "Expected one authored record named $Name"}
 $records[0]
}
[xml]$baseline=@"
<Dat151><Version value="1"/><Items>
 <Item type="Vehicle" ntOffset="0"><Name>ra_fixture_vehicle</Name>
  <Engine>ra_fixture_engine_config</Engine><EngineGranular>ra_fixture_granular</EngineGranular>
  <Horns>ra_fixture_horn</Horns><Collision>ra_fixture_collision</Collision>
 </Item>
 <Item type="VehicleEngineGranular" ntOffset="0"><Name>ra_fixture_granular</Name>
  <EngineAccel>ra_fixture_engine</EngineAccel><EngineAccelNPC>ra_fixture_engine_npc</EngineAccelNPC>
  <ExhaustAccel>ra_fixture_exhaust</ExhaustAccel><ExhaustAccelNPC>ra_fixture_exhaust</ExhaustAccelNPC>
  <LimiterPops>ra_fixture_pop</LimiterPops>
 </Item>
</Items></Dat151>
"@
[xml]$sounds=@"
<Dat54><Version value="1"/><Items>
 <Item type="GranularSound"><Name>ra_fixture_engine</Name><Header><Flags value="0x0"/></Header></Item>
 <Item type="GranularSound"><Name>ra_fixture_engine_npc</Name><Header><Flags value="0x0"/></Header>
  <ParentSound>ra_fixture_engine</ParentSound>
 </Item>
 <Item type="EnvironmentSound"><Name>ra_fixture_exhaust</Name><Header><Flags value="0x0"/></Header></Item>
</Items></Dat54>
"@
$originalConfig=$baseline.OuterXml
$originalSounds=$sounds.OuterXml
[xml]$candidate=$originalConfig
[xml]$candidateSounds=$originalSounds
foreach($route in @(
 @{Document=$candidate;Name='ra_fixture_vehicle';Changes=@{Name='ra_private_vehicle';EngineGranular='ra_private_granular'}},
 @{Document=$candidate;Name='ra_fixture_granular';Changes=@{Name='ra_private_granular';EngineAccel='ra_private_engine';ExhaustAccel='ra_private_exhaust'}},
 @{Document=$candidateSounds;Name='ra_fixture_engine';Changes=@{Name='ra_private_engine'}},
 @{Document=$candidateSounds;Name='ra_fixture_exhaust';Changes=@{Name='ra_private_exhaust'}}
)){
 $item=$route.Document.DocumentElement.Items.SelectSingleNode("Item[Name='$($route.Name)']").CloneNode($true)
 foreach($field in $route.Changes.Keys){$item.SelectSingleNode($field).InnerText=$route.Changes[$field]}
 [void]$route.Document.DocumentElement.Items.AppendChild($item)
}
$gameRel=ReadBack $candidate
$soundRel=ReadBack $candidateSounds
$vehicle=Find-Record $gameRel 'ra_private_vehicle'
$granular=Find-Record $gameRel 'ra_private_granular'
Assert-Field $vehicle EngineGranular 'ra_private_granular'
Assert-Field $vehicle Engine 'ra_fixture_engine_config'
Assert-Field $vehicle Horns 'ra_fixture_horn'
Assert-Field $vehicle Collision 'ra_fixture_collision'
Assert-Field $granular EngineAccel 'ra_private_engine'
Assert-Field $granular ExhaustAccel 'ra_private_exhaust'
Assert-Field $granular EngineAccelNPC 'ra_fixture_engine_npc'
Assert-Field $granular ExhaustAccelNPC 'ra_fixture_exhaust'
Assert-Field $granular LimiterPops 'ra_fixture_pop'
Assert-Field (Find-Record $soundRel 'ra_fixture_engine_npc') ParentSound 'ra_fixture_engine'
if((Find-Record $soundRel 'ra_private_engine').GetType().Name-cne'Dat54GranularSound'-or
   (Find-Record $soundRel 'ra_private_exhaust').GetType().Name-cne'Dat54EnvironmentSound'){throw 'Redirect changed the typed sound contracts'}
foreach($pair in @(
 @{Before=(ReadBack $baseline);After=$gameRel;Names=@('ra_fixture_vehicle','ra_fixture_granular')},
 @{Before=(ReadBack $sounds);After=$soundRel;Names=@('ra_fixture_engine','ra_fixture_engine_npc','ra_fixture_exhaust')}
)){
 foreach($name in $pair.Names){
  $before=Find-Record $pair.Before $name
  $after=Find-Record $pair.After $name
  if([Convert]::ToHexString($before.Data)-cne[Convert]::ToHexString($after.Data)){throw "Original serialized record changed: $name"}
 }
}
[ordered]@{scope='original-authored REL codec round trip in memory';gameRecords=$gameRel.RelDatas.Count;soundRecords=$soundRel.RelDatas.Count;
 privateRecords=4;unchangedOriginalRecordBodies=5;codeWalkerCoreSHA256=$actual;
 registeredInGame=$false;effectiveProfileReadBack=$false;suppressionVerified=$false} | ConvertTo-Json
