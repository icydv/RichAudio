$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
Import-Module (Join-Path $repo 'src/acoustics/startup/CodeWalkerPlacementCompletion01.psm1') -Force
function V($x,$y,$z){[pscustomobject]@{X=$x;Y=$y;Z=$z}}
function Assert($value,$reason){if(!$value){throw $reason}}
$hash='a'*64
$room=[pscustomobject]@{RoomName='original-room';Data=[pscustomobject]@{bbMin=(V 0 0 0);bbMax=(V 4 4 3);flags=0;portalCount=1};AttachedObjects=@()}
$portal=[pscustomobject]@{Data=[pscustomobject]@{roomFrom=0;roomTo=1;flags=0;audioOcclusion=3;opacity=0};Corners=@((V 0 0 0),(V 0 1 0),(V 0 1 2),(V 0 0 2));AttachedObjects=@()}
$arch=[pscustomobject]@{Hash=[pscustomobject]@{Hash=7};Name='original-mlo';BaseArchetypeDef=[pscustomobject]@{physicsDictionary=[pscustomobject]@{Hash=8}};BBMin=(V 0 0 0);BBMax=(V 4 4 3);rooms=@($room,$room);portals=@($portal);entitySets=@()}
$a=Get-MloArchetypeProjection01 $arch 'original.rpf/original.ytyp' $hash
Assert ($a.ArchetypeHash-eq'0x00000007'-and$a.Rooms.Count-eq2-and$a.Portals.Count-eq1) 'Metadata roles/counts preserved'
Assert ($a.Portals[0].OpeningState-eq'unobserved-not-an-acoustic-opening'-and$a.RuntimeActivationObserved-eq$false) 'Declared portal cannot become an opening'
Assert ($a.Portals[0].Corners.Count-eq4-and$a.Portals[0].Corners[0].Count-eq3) 'Corners retain nested vector arrays'
$entity=[pscustomobject]@{IsMlo=$true;MloParent=$null;Index=3;CEntityDef=[pscustomobject]@{archetypeName=[pscustomobject]@{Hash=7}};Position=(V 100 200 10);Scale=(V 1 1 1);Orientation=[pscustomobject]@{X=0;Y=0;Z=0;W=1};MloInstance=[pscustomobject]@{defaultEntitySets=@(1,3)}}
$matrix=@(1,0,0,0,0,1,0,0,0,0,1,0,100,200,10,1)
$i=Get-MloInstanceProjection01 $entity $matrix 'original.rpf/original.ymap' $hash
Assert ($i.Matrix.Count-eq16-and$i.Matrix[12]-eq100-and$i.ArchetypeHash-eq$a.ArchetypeHash) 'Exact public resolved transform retained'
Assert ($i.RuntimeActivationObserved-eq$false-and$i.PortalStateObserved-eq$false) 'Instance remains inactive metadata'
$entity.MloParent=[pscustomobject]@{};$failed=$false;try{Get-MloInstanceProjection01 $entity $matrix 'original.rpf/original.ymap' $hash}catch{$failed=$true};Assert $failed 'Nested MLO cannot silently acquire root matrix'
$arch.rooms=$null;$arch.portals=$null;$empty=Get-MloArchetypeProjection01 $arch 'original.rpf/original.ytyp' $hash
Assert ($empty.Rooms.Count-eq0-and$empty.Portals.Count-eq0) 'Absent arrays retain zero declared metadata'
$room.Data.bbMin=(V 3.4e38 3.4e38 3.4e38);$room.Data.bbMax=(V -3.4e38 -3.4e38 -3.4e38);$arch.rooms=@($room);$sentinel=Get-MloArchetypeProjection01 $arch 'original.rpf/original.ytyp' $hash
Assert ($sentinel.Rooms.Count-eq1-and$sentinel.Rooms[0].Min-eq$null-and$sentinel.Rooms[0].BoundsState-eq'unbounded-or-invalid-declared-room-bounds') 'Sentinel room remains unknown without dropping the complete archetype or inventing physical bounds'
'MLO placement metadata projection completion controls passed8; authored objects only, no parser/archive/initialization.'
