#requires -Version 7.0
# Read-only audit of the candidate05 chain after its admitted D observation failed.
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$ExecutionDirectory,
 [Parameter(Mandatory)][string]$OutputDirectory,
 [string]$CodeWalkerCore='C:\Users\Libby\Desktop\CodeWalker30_dev46\CodeWalker.Core.dll'
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path -LiteralPath $out)){throw 'Fresh task-private output required'}
function HashFile($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Need($ok,$reason){if(!$ok){throw $reason}}
function NoLinks($p){for($at=[IO.Path]::GetFullPath($p);$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked path refused'}}}
foreach($p in @($out,$ExecutionDirectory,$CodeWalkerCore)){NoLinks $p}
Need (!(Get-Process -Name GTA5_Enhanced,PlayGTAV,obs64,RAGEPluginHook -ErrorAction SilentlyContinue)) 'Offline audit requires game and recorder closed'
$scopePath=Join-Path $ExecutionDirectory 'scope.json'
Need ((HashFile $scopePath)-ceq'f9d05b4ed18c7c9d8bb531ea5fb4c00e05542700d8bff27b027a18040544cbba') 'Exact candidate05 scope required'
$s=Get-Content -LiteralPath $scopePath -Raw|ConvertFrom-Json -DateKind String
$ledger=Get-Content -LiteralPath (Join-Path $ExecutionDirectory 'transaction.json') -Raw|ConvertFrom-Json -DateKind String
$cleanup=Get-Content -LiteralPath (Join-Path $ExecutionDirectory 'cleanup-verification.json') -Raw|ConvertFrom-Json
Need ($ledger.status-ceq'restored-independently-verified'-and$cleanup.passed-and$ledger.scopeSha256-ceq(HashFile $scopePath)) 'Restoration binding differs'
$dlc=@($ledger.files|Where-Object {$_.destination.EndsWith('\ra_ns01_8b7e24c1\dlc.rpf')})
$shadow=@($ledger.files|Where-Object {$_.destination.EndsWith('\mods\update\update.rpf')})
Need ($dlc.Count-eq1-and$shadow.Count-eq1) 'Exact installed sources required'
Need ((HashFile $CodeWalkerCore)-ceq'3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8') 'Codec drift'
foreach($f in @($dlc[0],$shadow[0])){NoLinks $f.source;Need ((HashFile $f.source)-ceq$f.sha256) 'Installed source changed'}
Add-Type -Path $CodeWalkerCore
Import-Module (Join-Path $repo 'src/acoustics/startup/CodeWalkerInitialization01.psm1') -Force
$init=Initialize-InstalledCodeWalker01 -GameRoot ([IO.Path]::GetDirectoryName($s.game.path))
function Archive($path,$name){$a=[CodeWalker.GameFiles.RpfFile]::new($path,$name);$a.ScanStructure($null,$null);Need (!$a.LastError) 'Archive read failed';return $a}
function Member($a,$name){$e=@($a.AllEntries|Where-Object {$_.Path.EndsWith($name,[StringComparison]::OrdinalIgnoreCase)-and$_-is[CodeWalker.GameFiles.RpfFileEntry]});Need ($e.Count-eq1) ('Unique member required: '+$name);return ,$a.ExtractFile($e[0])}
function Rel($bytes){$r=[CodeWalker.GameFiles.RelFile]::new();$r.Load($bytes,$null);return $r}
$a=Archive $dlc[0].source 'dlc.rpf'
$g=Rel (Member $a 'ra_ns05_game.dat151.rel')
$dHash=[CodeWalker.GameFiles.JenkHash]::GenHash('ra_ns05_bati_select')
$s1Hash=[CodeWalker.GameFiles.JenkHash]::GenHash('ra_ns05_bati_s1')
$d=@($g.RelDatas|Where-Object {$_.NameHash.Hash-eq$dHash})
$s1=@($g.RelDatas|Where-Object {$_.NameHash.Hash-eq$s1Hash})
Need ($d.Count-eq1-and$s1.Count-eq1-and$d[0].Data.Length-eq292-and$s1[0].Data.Length-eq292) 'Private roots differ'
$differences=@(for($i=0;$i-lt292;$i++){if($d[0].Data[$i]-ne$s1[0].Data[$i]){@{offset=$i;D=$d[0].Data[$i];S1=$s1[0].Data[$i]}}})
Need (($differences.offset-join',')-ceq'16,17,18,19') 'D/S1 differ beyond the intended horn reference'
[xml]$gx=[CodeWalker.GameFiles.RelXml]::GetXml($g)
$node=@($gx.SelectNodes('/Dat151/Items/Item')|Where-Object {([CodeWalker.GameFiles.JenkHash]::GenHash($_.Name.ToLowerInvariant()))-eq$dHash-or$_.Name-ceq'hash_60279D09'})
# Decoded XML can name hashes rather than preserving symbolic builder names.
if(!$node.Count){$node=@($gx.SelectNodes('/Dat151/Items/Item')|Where-Object Name -eq 'hash_60279d09')}
Need ($node.Count-eq1-and$node[0].Engine-ceq'hash_A46D1B50'-and$node[0].EngineGranular-ceq'hash_61F3BD06'-and$node[0].Horns-ceq'hash_98A97784') 'D references differ'
[xml]$content=[Text.Encoding]::UTF8.GetString((Member $a 'content.xml'))
[xml]$setup=[Text.Encoding]::UTF8.GetString((Member $a 'setup2.xml'))
$logical='dlc_ra_ns01_8b7e24c1:/x64/audio/config/ra_ns05_game.dat'
$registration=@($content.SelectNodes('//dataFiles/Item')|Where-Object filename -CEQ $logical)
$enabled=@($content.SelectNodes('//filesToEnable/Item')|Where-Object InnerText -CEQ $logical)
$changeSet=@($content.SelectNodes('//contentChangeSets/Item')|Where-Object {$_.filesToEnable.Item-contains$logical})
Need ($registration.Count-eq1-and$registration[0].fileType-ceq'AUDIO_GAMEDATA'-and$enabled.Count-eq1-and$changeSet.Count-eq1) 'D registration differs'
Need ($setup.SSetupData.deviceName-ceq'dlc_ra_ns01_8b7e24c1'-and$setup.SSetupData.contentChangeSetGroups.Item.NameHash-ceq'GROUP_STARTUP'-and$setup.SSetupData.contentChangeSetGroups.Item.ContentChangeSets.Item-ceq$changeSet[0].changeSetName) 'Startup group does not reach the declared change set'
$u=Archive $shadow[0].source 'update\update.rpf'
[xml]$list=[Text.Encoding]::UTF8.GetString((Member $u 'common\data\dlclist.xml'))
$entry=@($list.SelectNodes('//Item')|Where-Object InnerText -CEQ 'dlcpacks:/ra_ns01_8b7e24c1/')
Need ($entry.Count-eq1) 'Shadow does not contain one exact private pack entry'
$journal=Get-ChildItem -LiteralPath (Join-Path $ExecutionDirectory 'retained-runtime') -Filter 'session-*.log'
Need (@($journal).Count-eq1) 'Expected one retained journal'
$lines=Get-Content -LiteralPath $journal.FullName
$assignments=@($lines|Where-Object {$_-match ' assignment-intent '})
$returns=@($lines|Where-Object {$_-match ' REQUEST RETURNED ra_ns05_bati_select '})
$release=@($lines|Where-Object {$_-match ' BATI restore returned '})
Need ($assignments.Count-eq1-and$returns.Count-eq1-and$release.Count-eq1-and$assignments[0]-match'handle=1794 token=711195963 profile=ra_ns05_bati_select$') 'Observed dispatch sequence differs'
[IO.Directory]::CreateDirectory($out)|Out-Null
$r=[ordered]@{schema='NativeSuppression05SelectionPathAudit';passed=$true;offlineOnly=$true;runtimeResolutionEstablished=$false;scopeSha256=(HashFile $scopePath);sourceCommit=$s.sourceCommit;auditorSha256=(HashFile $PSCommandPath);installedDlcSource=$dlc[0];installedShadowSource=$shadow[0];diskCodecInitialization=$init;D=@{name='ra_ns05_bati_select';hash=('{0:x8}'-f$dHash);recordBytes=292;engine=$node[0].Engine;granular=$node[0].EngineGranular;horns=$node[0].Horns;bodyDifferencesFromS1=$differences;privateEngineGraphDependency=$false;relocatedBankDependency=$false};declaredChain=@{dlclistEntry=$entry[0].InnerText;device=$setup.SSetupData.deviceName;startupGroup='GROUP_STARTUP';changeSet=$changeSet[0].changeSetName;logicalRegistration=$logical;registrationType=$registration[0].fileType;packedMember='x64/audio/config/ra_ns05_game.dat151.rel'};observed=@{assignment=$assignments[0];return=$returns[0];release=$release[0]};conclusion='The declaration chain is connected on disk, and D excludes a private engine graph and relocated bank. No runtime mount/REL-selection witness passed. Unchanged horn readback alone does not prove which internal stage failed.';concreteConstructionDefectEstablished=$false;futureScopeAuthorized=$false}
$r|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $out 'result.json') -Encoding utf8
'PASS: installed-byte D path checked; runtime selection remains unresolved'
