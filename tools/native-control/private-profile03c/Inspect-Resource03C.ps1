#requires -Version 7.0
# Read only the canonical resources; write a new minimal offline graph snapshot.
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$root=Join-Path $repo '.local/gate-a-shvdne-private-01/resource'
$registration=Join-Path $repo '.local/gate-a-shvdne-private-01/registration'
$out=Join-Path $repo '.local/gate-a-shvdne-private-03c/resource-probe/resource-graph-01'
if(Test-Path -LiteralPath $out){throw 'Fresh03C graph output required'}
for($at=$out;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked output refused'}}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Digest([byte[]]$b){[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant()}
function Save([string]$name,$value){[IO.File]::WriteAllText((Join-Path $out $name),($value|ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))}
$core='C:\Users\Libby\Desktop\CodeWalker30_dev46\CodeWalker.Core.dll'
if((Hash $core)-cne'3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8'){throw 'Unpinned codec'}
$manifest=Join-Path $root 'resource-manifest.json';$manifestHash='9243c912b1eafaf5fe862c7c16cf5fdbd27c210d6bccea039f9915f277aa2f48'
if((Hash $manifest)-cne$manifestHash){throw 'Canonical manifest drift'}
$m=Get-Content -LiteralPath $manifest -Raw|ConvertFrom-Json
$validation=& (Join-Path $repo 'tools/native-control/private-profile/ResourceValidate.ps1') -CodeWalkerCore $core -ResourceDirectory $root -ExpectedManifestSha256 $manifestHash
$parsedValidation=$validation|ConvertFrom-Json
if(!$parsedValidation.passed){throw 'Actual resource validation failed'}
New-Item -ItemType Directory -Path $out|Out-Null
Save 'actual-resource-validation.json' $parsedValidation
$xml=@{}
foreach($name in @('ra_private01_game.dat151.rel','ra_private01_sounds.dat54.rel')){
 $value=Get-Content -LiteralPath (Join-Path $root ($name+'.xml')) -Raw
 $encoded=[CodeWalker.GameFiles.XmlRel]::GetRel([xml]$value).Save()
 if((Digest $encoded)-cne(Hash (Join-Path $root $name))){throw 'Graph XML does not reproduce the actual REL bytes'}
 $xml[$name]=$value
}
$dlcRoot=Join-Path $registration 'dlc-01';$dlcPath=Join-Path $dlcRoot 'dlc.rpf'
if((Hash $dlcPath)-cne'ff7c1d818366df4571e9bb3c081c3199fca5709dfb8c74b0a44cb8017dc3cba1'){throw 'Private DLC drift'}
$rpf=[CodeWalker.GameFiles.RpfFile]::new($dlcPath,'dlc.rpf');$rpf.ScanStructure($null,$null)
if($rpf.LastError-or$rpf.Encryption-ne[CodeWalker.GameFiles.RpfEncryption]::OPEN){throw 'Private DLC structure failed'}
$members=@($rpf.AllEntries|Where-Object {$_-is[CodeWalker.GameFiles.RpfFileEntry]})
if($members.Count-ne5){throw 'Private DLC must have five files'}
$actualMembers=@();$packedXml=@{}
foreach($entry in $members){
 $bytes=$rpf.ExtractFile($entry);$actualMembers+=@{path=$entry.Path;name=$entry.Name;bytes=$bytes.Length;sha256=Digest $bytes}
 $source=if($entry.Name.EndsWith('.xml')){Join-Path $dlcRoot $entry.Name}else{Join-Path $root $entry.Name}
 if((Digest $bytes)-cne(Hash $source)){throw 'Packed private resource differs from canonical bytes'}
 if($entry.Name.EndsWith('.xml')){$packedXml[$entry.Name]=[Text.Encoding]::UTF8.GetString($bytes)}
}
$shadowRoot=Join-Path $registration 'shadow-01';$shadow=Get-Content -LiteralPath (Join-Path $shadowRoot 'shadow-receipt.json') -Raw|ConvertFrom-Json
if((Hash (Join-Path $shadowRoot 'update.rpf'))-cne'd9de412ed396f707a351dec90e521390df212566c41e5b34c6acb22194acec19'){throw 'Complete shadow drift'}
$oldMembers=Get-Content -LiteralPath (Join-Path $shadowRoot 'original-members.json') -Raw|ConvertFrom-Json
$newMembers=Get-Content -LiteralPath (Join-Path $shadowRoot 'candidate-members.json') -Raw|ConvertFrom-Json
if($oldMembers.Count-ne1790-or$newMembers.Count-ne1790){throw 'Complete shadow inventory count'}
$changed=@();for($i=0;$i-lt$oldMembers.Count;$i++){if(($oldMembers[$i]|ConvertTo-Json -Depth 8 -Compress)-cne($newMembers[$i]|ConvertTo-Json -Depth 8 -Compress)){$changed+=@{original=$oldMembers[$i];candidate=$newMembers[$i]}}}
if($changed.Count-ne1-or$changed[0].original.path-cne'update\update.rpf\common\data\dlclist.xml'){throw 'Undeclared shadow member change'}
$originalList=Get-Content -LiteralPath (Join-Path $shadowRoot 'dlclist.original.xml') -Raw
$candidateList=Get-Content -LiteralPath (Join-Path $shadowRoot 'dlclist.candidate.xml') -Raw
if((Hash (Join-Path $shadowRoot 'dlclist.original.xml'))-cne$shadow.originalDlclistSha256-or(Hash (Join-Path $shadowRoot 'dlclist.candidate.xml'))-cne$shadow.candidateDlclistSha256){throw 'DLC list receipt drift'}
$dependency=Get-Content -LiteralPath (Join-Path $root 'dependency-audit.json') -Raw|ConvertFrom-Json
$namespace=Get-Content -LiteralPath (Join-Path $root 'namespace-audit.json') -Raw|ConvertFrom-Json
Save 'graph-snapshot.json' @{schema=1;scope='Actual REL XML reserialized byte-identically; actual PCM validation and reopened OPEN DLC; retained complete-shadow inventories plus current full archive hash; no runtime registration claim';resourceManifest=$m;relXml=$xml;dependencyAudit=$dependency;namespaceAudit=$namespace;actualDlcMembers=$actualMembers;setupXml=$packedXml['setup2.xml'];contentXml=$packedXml['content.xml'];dlcReceipt=(Get-Content -LiteralPath (Join-Path $dlcRoot 'dlc-receipt.json') -Raw|ConvertFrom-Json);shadowReceipt=$shadow;shadowChangedMembers=$changed;originalDlcList=$originalList;candidateDlcList=$candidateList;runtimeMounted=$false;resourceBytesRebuilt=$false;gameWritten=$false}
Write-Output 'PASS actual canonical resources, byte-bound graph XML, exact PCM, packed DLC and complete-shadow preservation'
