[CmdletBinding()]
param([string]$InspectionRoot='', [string]$Model='bati', [string]$OutputPath='')
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (!$InspectionRoot) { $InspectionRoot=Join-Path $repo '.local\inspection' }
if (!$OutputPath) { $OutputPath=Join-Path $repo 'evidence\vehicle-trace.json' }
if ($Model -notmatch '^[a-z0-9_]+$') { throw 'Expected a lowercase model identifier.' }
if (!(Test-Path -LiteralPath $InspectionRoot)) { throw 'Run Inspect-GameAudio first.' }
Add-Type -TypeDefinition @'
public static class RichAudioJenk {
 public static string Hash(string text) {
  uint h=0;
  unchecked { foreach(byte b in System.Text.Encoding.UTF8.GetBytes(text.ToLowerInvariant())) { h+=b; h+=(h<<10); h^=(h>>6); } h+=(h<<3); h^=(h>>11); h+=(h<<15); }
  return "hash_"+h.ToString("X8");
 }
}
'@
[xml]$vehicles=Get-Content -LiteralPath (Join-Path $InspectionRoot 'update_update.rpf_common_data_levels_gta5_vehicles.meta.xml') -Raw
[xml]$game=Get-Content -LiteralPath (Join-Path $InspectionRoot 'update_update.rpf_x64_audio_config_game.dat151.rel.xml') -Raw
[xml]$sounds=Get-Content -LiteralPath (Join-Path $InspectionRoot 'update_update.rpf_x64_audio_config_sounds.dat54.rel.xml') -Raw
$v=$vehicles.SelectSingleNode("//InitDatas/Item[modelName='$Model']")
if (!$v) { throw 'Model not found in update vehicles.meta.' }
$identifier=if($v.audioNameHash.InnerText){$v.audioNameHash.InnerText}else{$Model}
$hash=[RichAudioJenk]::Hash($identifier)
$gmap=@{};foreach($n in $game.Dat151.Items.Item){$gmap[$n.Name]=$n}
$smap=@{};foreach($n in $sounds.Dat54.Items.Item){$smap[$n.Name]=$n}
$vehicle=$gmap[$hash]
if (!$vehicle -or $vehicle.type -ne 'Vehicle') { throw 'No matching dat151 Vehicle.' }
$granular=$gmap[$vehicle.EngineGranular]
if (!$granular) { throw 'No granular settings record.' }
$awcMap=@{}
foreach($item in Import-Csv -LiteralPath (Join-Path $InspectionRoot 'inventory.csv')) {
 if($item.Name -notlike '*.awc') { continue }
 $stem=[IO.Path]::GetFileNameWithoutExtension($item.Name)
 $bank=[IO.Path]::GetFileNameWithoutExtension($item.Archive)
 foreach($candidate in @($stem,($bank+'/'+$stem),($bank+'\'+$stem))) {
  $k=[RichAudioJenk]::Hash($candidate)
  $awcMap[$k]=[pscustomobject]@{Path=$item.Path;HashInput=$candidate}
 }
}
$paths=New-Object System.Collections.Generic.List[object]
function Visit-Sound([string]$key,[object[]]$route,[string]$layer,[int]$depth) {
 if($depth -gt 24 -or !$smap.ContainsKey($key) -or $route.Hash -contains $key) { return }
 $n=$smap[$key];$next=@($route)+@([pscustomobject]@{Hash=$key;Type=$n.type})
 if($n.type -eq 'GranularSound') {
  $channels=@(foreach($c in $n.ChildNodes | Where-Object Name -match '^Channel[0-5]$') {
   [pscustomobject]@{Channel=$c.Name;ContainerHash=$c.ContainerName;Stream=$c.FileName;ContainerMatch=$awcMap[$c.ContainerName]}
  })
  $paths.Add([pscustomobject]@{Layer=$layer;Route=$next;Channels=$channels})
  return
 }
 foreach($leaf in $n.SelectNodes('.//*[not(*)]')) {
  if($smap.ContainsKey($leaf.InnerText)) { Visit-Sound $leaf.InnerText $next $layer ($depth+1) }
 }
}
foreach($field in @('EngineAccel','ExhaustAccel','EngineAccelNPC','ExhaustAccelNPC')) {
 Visit-Sound ([string]$granular.$field) @() $field 0
}
if($paths.Count -eq 0) { throw 'No path reached a granular sound.' }
$terminals=@(foreach($f in @('ExhaustAccel','ExhaustAccelNPC')) { $t=$smap[[string]$granular.$f]; if($t.type -eq 'EnvironmentSound') { [pscustomobject]@{Layer=$f;Hash=[string]$granular.$f;Type=$t.type;ChannelID=$t.ChannelID.value;Interpretation='Channel binding inferred; no container pointer in this record.'} } })
$result=[ordered]@{Model=$Model;VehicleMeta='update/update.rpf/common/data/levels/gta5/vehicles.meta';AudioNameHash=[string]$v.audioNameHash;IdentifierUsed=$identifier;BlankIdentifierFallback='INFERRED runtime default; matching model-hash record VERIFIED';VehicleRecord=$hash;EngineRecord=$vehicle.Engine;GranularRecord=$vehicle.EngineGranular;Paths=$paths.ToArray();ChannelBindings=$terminals;Scope='Update game.dat151 + sounds.dat54, base AWC inventory; not proof of runtime mount precedence'}
$result | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
[pscustomobject]@{Model=$Model;Vehicle=$hash;Granular=$vehicle.EngineGranular;Paths=$paths.Count;Output=$OutputPath} | Format-List
