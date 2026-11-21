# Original bounded projection of public CodeWalker objects. This does not load
# an archive, initialise the parser, infer activation or construct an opening.
function ConvertTo-PlacementVector01($Value,[string]$Label='vector') { if($null -eq $Value){throw 'Placement vector missing'}; $v=@([double]$Value.X,[double]$Value.Y,[double]$Value.Z);foreach($n in $v){if([double]::IsNaN($n)-or[double]::IsInfinity($n)-or[Math]::Abs($n)-gt100000){throw ('Placement vector bound: '+$Label)}};return ,$v }
function Get-MloArchetypeProjection01 {
 param([Parameter(Mandatory=$true)]$Archetype,[Parameter(Mandatory=$true)][string]$SourcePath,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$SourceSHA256)
 $rooms=if($null-eq$Archetype.rooms){@()}else{@($Archetype.rooms)};$portals=if($null-eq$Archetype.portals){@()}else{@($Archetype.portals)};if($rooms.Count-gt4096-or$portals.Count-gt16384){throw 'MLO room/portal bound'}
 $roomRows=@(for($i=0;$i-lt$rooms.Count;$i++){
  $r=$rooms[$i];$min=$null;$max=$null;$boundsIssue=$null
  try{$min=ConvertTo-PlacementVector01 $r.Data.bbMin 'room-min';$max=ConvertTo-PlacementVector01 $r.Data.bbMax 'room-max';for($axis=0;$axis-lt3;$axis++){if($min[$axis]-gt$max[$axis]){throw 'Room minimum exceeds maximum'}}}
  catch{$boundsIssue=$_.Exception.Message;$min=$null;$max=$null}
  [ordered]@{Index=$i;Name=[string]$r.RoomName;Min=$min;Max=$max;BoundsState=if($boundsIssue){'unbounded-or-invalid-declared-room-bounds'}else{'finite-declared-local-room-bounds'};BoundsIssue=$boundsIssue;Flags=[uint32]$r.Data.flags;DeclaredPortalCount=[uint32]$r.Data.portalCount;AttachedObjects=@($r.AttachedObjects);RuntimeRoomStateObserved=$false}
 })
 $portalRows=@(for($i=0;$i-lt$portals.Count;$i++){$p=$portals[$i];$corners=@($p.Corners);if($corners.Count-lt3-or$corners.Count-gt16){throw 'MLO portal corner bound'};[ordered]@{Index=$i;RoomFrom=[uint32]$p.Data.roomFrom;RoomTo=[uint32]$p.Data.roomTo;Flags=[uint32]$p.Data.flags;AudioOcclusion=[uint32]$p.Data.audioOcclusion;Opacity=[uint32]$p.Data.opacity;Corners=@($corners|ForEach-Object{ConvertTo-PlacementVector01 $_ 'portal-corner'});AttachedObjects=@($p.AttachedObjects);OpeningState='unobserved-not-an-acoustic-opening'}})
 [ordered]@{ArchetypeHash=('0x{0:x8}'-f[uint32]$Archetype.Hash.Hash);Name=[string]$Archetype.Name;PhysicsDictionaryHash=('0x{0:x8}'-f[uint32]$Archetype.BaseArchetypeDef.physicsDictionary.Hash);SourceYtyp=$SourcePath;SourceSHA256=$SourceSHA256;LocalMin=ConvertTo-PlacementVector01 $Archetype.BBMin 'archetype-min';LocalMax=ConvertTo-PlacementVector01 $Archetype.BBMax 'archetype-max';Rooms=$roomRows;Portals=$portalRows;EntitySetCount=@($Archetype.entitySets).Count;RuntimeActivationObserved=$false;CoordinateBasis='public-CodeWalker-MloArchetype-local'}
}
function Get-MloInstanceProjection01 {
 param([Parameter(Mandatory=$true)]$Entity,[Parameter(Mandatory=$true)][double[]]$Matrix,[Parameter(Mandatory=$true)][string]$SourcePath,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$SourceSHA256)
 if(!$Entity.IsMlo-or$Entity.MloParent-or$Matrix.Count-ne16){throw 'Explicit root MLO entity required'};foreach($n in $Matrix){if([double]::IsNaN($n)-or[double]::IsInfinity($n)-or[Math]::Abs($n)-gt100000){throw 'MLO matrix bound'}}
 [ordered]@{InstanceId=$SourcePath+'#mlo:'+([int]$Entity.Index);ArchetypeHash=('0x{0:x8}'-f[uint32]$Entity.CEntityDef.archetypeName.Hash);SourceYmap=$SourcePath;SourceSHA256=$SourceSHA256;Position=ConvertTo-PlacementVector01 $Entity.Position;Scale=ConvertTo-PlacementVector01 $Entity.Scale;Orientation=@([double]$Entity.Orientation.X,[double]$Entity.Orientation.Y,[double]$Entity.Orientation.Z,[double]$Entity.Orientation.W);Matrix=$Matrix;DefaultEntitySets=@($Entity.MloInstance.defaultEntitySets);CoordinateBasis='public-YmapEntityDef-resolved-Position-Orientation-Scale; SharpDX-row-vector';RuntimeActivationObserved=$false;PortalStateObserved=$false}
}
Export-ModuleMember -Function Get-MloArchetypeProjection01,Get-MloInstanceProjection01
