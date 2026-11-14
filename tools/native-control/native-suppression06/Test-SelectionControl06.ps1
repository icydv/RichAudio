#requires -Version 7.5
param([Parameter(Mandatory)][string]$Manifest,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
function Need($ok,$why){if(!$ok){throw $why}}
function Sha($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Digest([byte[]]$b){[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant()}
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
Need ($out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-and!(Test-Path -LiteralPath $out)) 'Fresh task-private result required'
$m=Get-Content -LiteralPath $Manifest -Raw|ConvertFrom-Json
Need ($m.schema-ceq'NativeSuppression06SelectionResources'-and$m.passed-and!$m.runtimeQualified-and$m.newRecords-eq1-and$m.newWaveforms-eq0) 'Bounded manifest'
$checks=[Collections.Generic.List[string]]::new()
function Check($ok,$why){Need $ok $why;$checks.Add($why)}
foreach($pin in @($m.builder,$m.codec,$m.oldDlc,$m.shadow,$m.resident,$m.dlc)){Check ((Sha $pin.path)-ceq$pin.sha256-and(Get-Item -LiteralPath $pin.path).Length-eq$pin.bytes) ('Pinned '+[IO.Path]::GetFileName($pin.path))}
Add-Type -Path $m.codec.path
Import-Module (Join-Path $repo 'src/acoustics/startup/CodeWalkerInitialization01.psm1') -Force
$null=Initialize-InstalledCodeWalker01 -GameRoot 'D:\Games\steamapps\common\Grand Theft Auto V Enhanced'
function Rpf($p,$name){$a=[CodeWalker.GameFiles.RpfFile]::new($p,$name);$a.ScanStructure($null,$null);Need (!$a.LastError) 'Archive scan';return $a}
function Member($a,$name){$e=@($a.AllEntries|Where-Object {$_.Path.EndsWith($name,[StringComparison]::OrdinalIgnoreCase)-and$_-is[CodeWalker.GameFiles.RpfFileEntry]});Need ($e.Count-eq1) ('Unique '+$name);return ,$a.ExtractFile($e[0])}
function Rel($b){$r=[CodeWalker.GameFiles.RelFile]::new();$r.Load($b,$null);return $r}
$a=Rpf $m.dlc.path 'dlc.rpf';$old=Rpf $m.oldDlc.path 'dlc.rpf';$u=Rpf $m.shadow.path 'update\update.rpf'
Check (@($a.AllEntries|Where-Object {$_-is[CodeWalker.GameFiles.RpfFileEntry]}).Count-eq10) 'Exactly one new REL member'
foreach($p in $m.members){Check ((Digest (Member $a $p.name))-ceq$p.sha256) ('Packed '+$p.name);if($p.name-notin@('content.xml','ra_ns06_game.dat151.rel')){Check ((Digest (Member $a $p.name))-ceq(Digest (Member $old $p.name))) ('Unchanged '+$p.name)}}
$bytes=Member $a 'ra_ns06_game.dat151.rel';$r=Rel $bytes
$g=Rel (Member $u 'x64\audio\config\game.dat151.rel');$stock=@($g.RelDatas|Where-Object {$_.NameHash.Hash-eq0xb779a091L})
Check ($stock.Count-eq1-and$r.RelDatas.Count-eq1-and$r.IndexCount-eq1-and$r.IndexHashes[0].Name.Hash-eq[CodeWalker.GameFiles.JenkHash]::GenHash('ra_ns06_adder_select')) 'Actual private root identity and one-entry index'
$body=$r.RelDatas[0].Data;$original=$stock[0].Data
Check ($body.Length-eq292-and$original.Length-eq292) 'Exact Vehicle body size'
$differences=@(for($i=0;$i-lt292;$i++){if($body[$i]-ne$original[$i]){$i}})
Check (($differences-join',')-ceq'1,2,3,16,17,18,19') 'Only identity bookkeeping and donor Horns bytes differ from stock ADDER'
Check ([BitConverter]::ToUInt32($body,16)-eq0x98a97784L) 'Exact bus horn reference in packed bytes'
[xml]$x=[CodeWalker.GameFiles.RelXml]::GetXml($r);$node=$x.SelectSingleNode('/Dat151/Items/Item')
Check ($node.Engine-ceq'hash_EF1B6A52'-and$node.EngineGranular-ceq'hash_FE2C005B') 'Private powertrain references are the verified stock positive-control references'
$oldContent=[Text.Encoding]::UTF8.GetString((Member $old 'content.xml'));$content=[Text.Encoding]::UTF8.GetString((Member $a 'content.xml'))
Check ($content.Replace($m.contentDelta.insertData,'').Replace($m.contentDelta.insertEnable,'')-ceq$oldContent) 'All old content bytes preserved outside one registration/enable insertion'
[xml]$cx=$content
Check (@($cx.SelectNodes('//dataFiles/Item')|Where-Object filename -CEQ $m.contentDelta.logical).Count-eq1-and@($cx.SelectNodes('//filesToEnable/Item')|Where-Object InnerText -CEQ $m.contentDelta.logical).Count-eq1) 'One declaration and startup enable for new logical path'
Check ($m.stockPositive.root-ceq'B779A091'-and$m.stockPositive.playerSound-ceq'hash_F57247B7'-and$m.stockPositive.idleContainer-ceq'EC965264') 'Actual stock ADDER graph identity'
Check (@($m.stockHornBank.leaves|Where-Object {$_.samples-le0-or$_.rate-le0}).Count-eq0-and@($m.stockHornBank.leaves).Count-gt2) 'Every selected stock horn leaf has decoded nonzero sample evidence'
$bad=[byte[]]$body.Clone();$bad[4]=$bad[4]-bxor1
Check ((Digest $bad)-cne(Digest $body)) 'Undeclared powertrain-body mutation differs from accepted root'
Check ((Sha $m.oldDlc.path)-ceq$m.oldDlc.sha256-and(Sha $m.dlc.path)-ceq$m.dlc.sha256) 'Inputs unchanged after validation'
[IO.Directory]::CreateDirectory($out)|Out-Null
@{schema='NativeSuppression06PackedControlTests';passed=$true;runtimeQualified=$false;manifest=@{path=[IO.Path]::GetFullPath($Manifest);sha256=(Sha $Manifest)};testSha256=(Sha $PSCommandPath);checks=@($checks);scope='Actual packed bytes and static stock-resource closure, no runtime routing or selection qualification'}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8
'PASS checks='+$checks.Count+'; actual packed root and preserved resources'
