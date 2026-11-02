// Input composition for ORIGINAL actual-format parser fixtures. This does not
// decode a resource, attest an installation or discover any local file.
import {codeWalkerSource03} from '../../src/acoustics/world/resource-import03.mjs';
export function originalResourceOptions03(group,resourceBytes,{session='d'.repeat(32),tiles=[{tileId:'west',bounds:{min:[-16,-16,-8],max:[16,16,16]}},{tileId:'east',bounds:{min:[16,-16,-8],max:[48,16,16]}}]}={}){
 const parserSha=group.resources[0].normalized.parserSHA256;
 return {manifest:{schema:1,kind:'RichAudioExplicitResourceManifest03',authority:'original-authored-fixture',layout:group.gen9?'gen9':'legacy',parser:{sourceCommit:codeWalkerSource03,sha256:parserSha},
  mounts:[{id:'fixture-base',order:0,enabled:true}],resources:group.resources.map(e=>({id:e.kind,path:'original.'+e.kind,kind:e.kind,mount:'fixture-base',sha256:e.sha256,bytes:e.bytes,deleted:false,supported:true})),
  tiles,coverage:{bounds:{min:[-16,-16,-8],max:[48,16,16]},outside:'unknown',basis:'original-authored-bounded-subset'},placementEvidence:'original-authored-world-metres',activationEvidence:'original-authored-static-subset'},
 decodedResources:Object.fromEntries(group.resources.map(e=>[e.kind,e.normalized])),resourceBytes,
 bindings:[{archetypeHash:123456789,resourceId:'ybn',basis:'authored-fixture'}],materialTable:{7:{reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'original-resource03-material'}},session,listenerAnchor:[2,2,1]};
}
