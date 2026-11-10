# Execute only the production metadata projection functions against authored
# public-API shapes. No CodeWalker assembly, initializer, RPF or PCM is used.
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
Add-Type -TypeDefinition @'
using System;
namespace CodeWalker.GameFiles {
 public struct MetaHash {public uint Hash;public MetaHash(uint value){Hash=value;}public string Hex{get{return "0x"+Hash.ToString("x8");}}public override int GetHashCode(){return (int)Hash;}public override bool Equals(object value){return value is MetaHash&&((MetaHash)value).Hash==Hash;}}
 public sealed class OriginalMetadataOwner01 {public string Path="authored.rpf";public int Reads;public byte[] ExtractFile(object entry){Reads++;return System.Text.Encoding.UTF8.GetBytes("original metadata bytes only");}public void DecodePcm(){throw new Exception("PCM must never execute");}}
 public sealed class OriginalMetadataEntry01 {public string Path="authored.rpf/audio/original.dat151.rel";public OriginalMetadataOwner01 File;}
 public sealed class OriginalMetadataRel01 {public OriginalMetadataEntry01 RpfFileEntry;}
 public sealed class OriginalHeader01 {public MetaHash Category;public float Gain=0.25f;}
 public class RelSound {public MetaHash[] AudioContainers{get;set;}}
 public sealed class OriginalAudioRecord01 : RelSound {public MetaHash NameHash;public OriginalMetadataRel01 Rel;public MetaHash Engine;public MetaHash[] Links;public OriginalHeader01 Header;public byte[] Opaque;public bool ThrowOnRead;public float Volume{get{return 0.75f;}}public uint Broken{get{if(ThrowOnRead)throw new Exception("original getter refusal");return 17;}}}
}
'@
$module=Join-Path $repo 'src/acoustics/startup/InstalledCatalog.psm1';Import-Module $module -Force
$scriptPath=Join-Path $repo 'tools/Resolve-InstalledGameCache.ps1';$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($scriptPath,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Production resolver must parse'}
$names=@('Rel-Origin','Find-Audio','Audio-Summary','Hash-Value','Audio-SourceBinding01','Audio-ProjectValue01','Audio-RecordProjection01','Audio-DependencyGraph01')
foreach($name in $names){$found=$ast.Find({param($node)$node-is[Management.Automation.Language.FunctionDefinitionAst]-and$node.Name-eq$name},$true);if(!$found){throw ('Missing actual function '+$name)};. ([ScriptBlock]::Create($found.Extent.Text))}
function Entry-Path($entry){if($entry){return $entry.Path};return $null}
function Relative-Path($entry){return $entry}
$script:soundProjections=@{};$script:bankTables=@{};$VerifyBankStreams=$false;$checks=0
function Check([bool]$value,[string]$message){$script:checks++;if(!$value){throw $message}}
$owner=New-Object CodeWalker.GameFiles.OriginalMetadataOwner01;$entry=New-Object CodeWalker.GameFiles.OriginalMetadataEntry01;$entry.File=$owner;$rel=New-Object CodeWalker.GameFiles.OriginalMetadataRel01;$rel.RpfFileEntry=$entry
function Record([uint32]$hash,[uint32]$child=0){$r=New-Object CodeWalker.GameFiles.OriginalAudioRecord01;$r.NameHash=New-Object CodeWalker.GameFiles.MetaHash($hash);$r.Engine=New-Object CodeWalker.GameFiles.MetaHash($child);$r.Rel=$rel;return $r}
function Dictionary {return New-Object 'Collections.Generic.Dictionary[CodeWalker.GameFiles.MetaHash,object]'}
function Root($record){return [pscustomobject]@{Label='VehicleAudioRecord';Domain='AudioGameDict';Record=$record}}
$game=Dictionary;$sounds=Dictionary;$categories=Dictionary
$one=Record 1 2;$two=Record 2 1;$three=Record 3;$otherThree=Record 3;$four=Record 4
$one.Header=New-Object CodeWalker.GameFiles.OriginalHeader01;$one.Header.Category=New-Object CodeWalker.GameFiles.MetaHash(3)
$one.AudioContainers=[CodeWalker.GameFiles.MetaHash[]]@((New-Object CodeWalker.GameFiles.MetaHash(3)))
$one.Links=[CodeWalker.GameFiles.MetaHash[]]@((New-Object CodeWalker.GameFiles.MetaHash(4)),(New-Object CodeWalker.GameFiles.MetaHash(0)),(New-Object CodeWalker.GameFiles.MetaHash(99)))
$one.Opaque=[byte[]]@(1,2,3);$two.ThrowOnRead=$true
foreach($record in @($one,$two,$four)){$game.Add($record.NameHash,$record)};$sounds.Add($three.NameHash,$three);$categories.Add($otherThree.NameHash,$otherThree)
$cache=[pscustomobject]@{AudioGameDict=$game;AudioSoundsDict=$sounds;AudioCategoriesDict=$categories}
$graph=Audio-DependencyGraph01 $cache @((Root $one))
Check ($graph.Nodes.Count-eq5) 'Transitive cycle and multiple public dictionaries must retain each distinct record once'
Check (@($graph.Edges|Where-Object{$_.Field-eq'Header.Category'-and$_.Targets.Count-eq2}).Count-eq1) 'Nested typed MetaHash property retains ambiguity instead of picking a dictionary'
Check (@($graph.Edges|Where-Object{$_.Field-eq'AudioContainers[0]'-and$_.Hash-eq'0x00000003'-and$_.Resolution-eq'container-or-stream-not-audio-record-lookup'-and$_.Targets.Count-eq0}).Count-eq1) 'An AWC path hash that collides with REL records must stay an external dependency'
Check (@($graph.Edges|Where-Object{$_.Field-eq'Links[0]'-and$_.Hash-eq'0x00000004'}).Count-eq1) 'Typed native hash arrays retain element identity'
Check (@($graph.Edges|Where-Object Resolution -EQ 'zero-reference-not-proof-of-silence').Count-gt0) 'Zero reference is not silently interpreted as missing audio'
Check (@($graph.Edges|Where-Object{$_.Hash-eq'0x00000063'-and$_.Resolution-eq'unresolved-public-audio-reference'}).Count-eq1) 'Unknown nonzero dependencies stay unresolved'
Check (!$graph.ReferenceClosureComplete-and$graph.UnresolvedNonzeroReferences-eq1) 'Unresolved reference prevents a completed dependency closure claim'
Check (!$graph.TraversalCompleteWithinPublicProjection-and$graph.ProjectionGapCount-ge2) 'Opaque metadata and unavailable getters remain explicit projection gaps'
Check ($owner.Reads-eq1-and$graph.SourceBindingsComplete-and$graph.SourceMetadataFiles-eq1) 'All records share one exact metadata source hash read'
Check (@($graph.Nodes[0].TypedScalars|Where-Object{$_.Field-eq'Volume'-and$_.DeclaredType-eq'System.Single'-and$_.RawValue-eq'0.75'}).Count-eq1) 'Scalar getter is read on its record and retains native type and uninterpreted value'
Check (!$graph.PcmDecoded-and!$graph.NativeProfileAssignmentObserved-and!$graph.RuntimeSelectionObserved) 'Metadata never acquires native selection or playback authority'
$one.Links=$null;$one.Opaque=$null;$two.ThrowOnRead=$false
$ambiguity=Audio-DependencyGraph01 $cache @((Root $one))
Check ($ambiguity.TraversalCompleteWithinPublicProjection-and$ambiguity.UnresolvedNonzeroReferences-eq0-and$ambiguity.AmbiguousNonzeroReferences-eq1-and!$ambiguity.ReferenceClosureComplete) 'Dictionary ambiguity alone prevents a complete REL dependency closure'
$missing=Audio-DependencyGraph01 $cache @((Root $null))
Check ($missing.UnresolvedRoots-eq1-and!$missing.ReferenceClosureComplete) 'An unresolved root prevents a complete REL dependency closure'
$chain=Dictionary;for($i=1;$i-le12;$i++){$r=Record $i ($i+1);$chain.Add($r.NameHash,$r)}
$bounded=Audio-DependencyGraph01 ([pscustomobject]@{AudioGameDict=$chain}) @((Root $chain[(New-Object CodeWalker.GameFiles.MetaHash(1))]))
Check ($bounded.Nodes.Count-eq9-and$bounded.DepthOmitted-gt0-and!$bounded.ReferenceClosureComplete) 'Graph depth eight is a real bound with retained omitted dependencies'
$many=Dictionary;$hub=Record 1000;$hub.Links=[CodeWalker.GameFiles.MetaHash[]]@(for($i=1;$i-le256;$i++){New-Object CodeWalker.GameFiles.MetaHash($i)});$many.Add($hub.NameHash,$hub);for($i=1;$i-le256;$i++){$r=Record $i;$many.Add($r.NameHash,$r)}
$limited=Audio-DependencyGraph01 ([pscustomobject]@{AudioGameDict=$many}) @((Root $hub))
Check ($limited.Nodes.Count-eq256-and$limited.RecordsOmitted-gt0-and!$limited.ReferenceClosureComplete) 'Record bound cannot turn omitted nodes into an empty complete graph'
$tooMany=Record 2000;$tooMany.Links=New-Object 'CodeWalker.GameFiles.MetaHash[]' 257;$projection=Audio-RecordProjection01 $tooMany
Check ($projection.ProjectionGaps-contains'array-budget:Links') 'Oversized nested arrays remain explicitly unknown'
Write-Output ('PASS '+$checks+' original Bati public metadata graph checks; no installed input, vendor binary, initializer or PCM')
