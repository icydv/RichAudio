// Original portable fixture packets. This constructs bounded compressed RSC7
// envelopes and authored normalized parser DTOs; it does not execute CodeWalker
// or prove real game-resource compatibility. The existing separate parser suite
// remains responsible for genuine parser roundtrip evidence.
import {deflateRawSync} from 'node:zlib';
import {originalResourceFixture02} from './WorldResources02.mjs';
import {byteDigest,digest} from '../../src/acoustics/world/contracts.mjs';
import {codeWalkerSource03} from '../../src/acoustics/world/resource-import03.mjs';
export function worldResources04(){
 const inventory={schema:1,kind:'RichAudioResourceInventory04',origin:'original-authored-fixture',build:'original-world04',layout:'gen9',parser:{sourceCommit:codeWalkerSource03,sha256:'e'.repeat(64)},mountPolicy:'explicit-reviewed-order-v1',precedenceEvidence:digest('original-explicit-order'),mounts:[{id:'base',family:'base',order:0,enabled:true},{id:'dlc',family:'dlc',order:1,enabled:true},{id:'custom',family:'custom',order:2,enabled:true}],resources:[],tiles:[]};
 const inputs={resourceBytes:{},decodedResources:{}},fixture=originalResourceFixture02();
 function group(tileId,x,mount='base',suffix=''){
  const names={ymap:tileId+'-map'+suffix,ytyp:tileId+'-type'+suffix,ybn:tileId+'-collision'+suffix};
  for(const kind of ['ymap','ytyp','ybn']){
   const id=names[kind],path=tileId+'.'+kind,payload=Buffer.alloc(512);payload.write('original fixture '+id);const head=Buffer.alloc(16);head.write('RSC7');head.writeUInt32LE(kind==='ybn'?43:2,4);head.writeUInt32LE(kind==='ybn'?0x28000000:0x08000000,8);head.writeUInt32LE(kind==='ybn'?0xb0000000:0x20000000,12);const bytes=Buffer.concat([head,deflateRawSync(payload)]),sha256=byteDigest(bytes);
   const normalized=structuredClone(fixture.resources.find(r=>r.kind===kind).normalized);normalized.sourceSHA256=sha256;normalized.bytes=bytes.length;normalized.parserMvid='original-portable-dto';if(kind==='ymap')normalized.data.entities[0].position=[x,4,1];if(kind==='ybn'){normalized.data.source.sha256=sha256;normalized.data.source.entry=path;}
   const decodedJson=JSON.stringify(normalized);inputs.resourceBytes[id]=bytes;inputs.decodedResources[id]={schema:1,kind:'CodeWalkerBoundedResource03',resourceKind:kind,sourceSHA256:sha256,bytes:bytes.length,sourceAuthority:'original-authored-fixture',parserSourceCommit:codeWalkerSource03,parserSHA256:inventory.parser.sha256,gen9ReaderSelected:true,installedResourceVerified:false,runtimeActivationVerified:false,gameFilesRead:false,boundary:{version:kind==='ybn'?43:2,systemBytes:512,graphicsBytes:0,inflatedBytes:512,versionNibblesAgree:true,compressedPayload:true},decodedJson,decodedSHA256:byteDigest(Buffer.from(decodedJson)),parserMvid:'original-portable-dto'};
   inventory.resources.push({id,path,kind,mount,sha256,bytes:bytes.length,deleted:false,supported:true,scopeTiles:[tileId],dependencies:kind==='ymap'?[tileId+'.ytyp',tileId+'.ybn']:[]});
  }
  return names;
 }
 const west=group('west',-4),east=group('east',4);
 inventory.tiles=[{tileId:'west',bounds:{min:[-8,-8,-4],max:[0,8,8]},bindings:[{archetypeHash:123456789,resourceId:west.ybn,basis:'authored-fixture'}],materialTable:fixture.materialTable},{tileId:'east',bounds:{min:[0,-8,-4],max:[8,8,8]},bindings:[{archetypeHash:123456789,resourceId:east.ybn,basis:'authored-fixture'}],materialTable:fixture.materialTable}];
 return {inventory,inputs,session:'4'.repeat(32),group};
}
