// Original normalized schema fixtures for portable regressions. These do not
// claim that CI loaded CodeWalker; the separate private RSC7 roundtrip does so.
import {identity} from '../../src/acoustics/world/collision-mesh.mjs';
export function originalResourceFixture02(){
 const wrap=(kind,data)=>({schema:1,kind:'CodeWalkerExplicitStaticResource02',resourceKind:kind,sourceAuthority:'original-authored-fixture',sourceSHA256:({ymap:'a',ytyp:'b',ybn:'c'})[kind].repeat(64),worldPlacementVerified:false,data});
 const map=wrap('ymap',{entities:[{id:'entity-0',kind:'CEntityDef',archetypeName:123456789,position:[2,4,1],rotation:[0,0,0,1],scaleXY:1,scaleZ:1,isMlo:false,hasMloParent:false}],unsupportedEntities:0,scripted:false});
 const type=wrap('ytyp',{archetypes:[{nameHash:123456789,physicsDictionary:987654321}],unsupportedArchetypes:0});
 const collision=wrap('ybn',{schema:1,kind:'CodeWalkerYbnMesh',source:{archive:'original-fixture.rpf',entry:'original.ybn',sha256:'c'.repeat(64),coordinateSpace:'resource-root',placement:'unresolved-static-vs-archetype-local'},
  nodes:[{id:'n0',parent:null,type:'BoundGeometry',transform:identity,center:[0,0,0],vertices:[[-1,0,-1],[1,0,-1],[0,0,1]],polygons:[{family:'Triangle',indices:[0,1,2],materialSlot:0}],materials:[{type:7,data1:7,data2:0}]}]});
 return {resources:[map,type,collision].map(normalized=>({id:normalized.resourceKind==='ybn'?'mesh':normalized.resourceKind,path:'original.'+normalized.resourceKind,order:0,kind:normalized.resourceKind,sha256:normalized.sourceSHA256,deleted:false,normalized})),
  bindings:[{archetypeHash:123456789,resourceId:'mesh',basis:'authored-fixture'}],materialTable:{7:{reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'original-material02'}},
  session:'d'.repeat(32),region:{min:[-16,-16,-8],max:[16,16,16]},listenerAnchor:[0,0,1]};
}
