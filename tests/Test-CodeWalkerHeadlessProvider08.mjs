import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {prepareProviderProcess08,runProviderProcess08,isProviderRun08} from '../src/acoustics/world/provider-supervisor08.mjs';
import {originalProviderRequest08,providerByteSHA08,originalEncryptedArchive08} from './fixtures/ProviderWorld08.mjs';
const packageRoot=process.env.RICHAUDIO_PROVIDER08_PACKAGE,fixtureRoot=process.env.RICHAUDIO_PROVIDER08_FIXTURES;
const native=process.platform==='win32'&&packageRoot&&fixtureRoot;
async function run(name='original.rpf',{phase='all-fixture',selection,discovery,capability=null,capInputs=[],ranges=false}={}){
 const bytes=await fs.readFile(path.join(fixtureRoot,name)),pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'provider-package08.json'),'utf8'));
 const request=originalProviderRequest08({parserSHA256:pkg.parserSHA256,bytes:bytes.length,sha256:ranges?null:providerByteSHA08(bytes),phase,selection,discovery,capability});
 const prepared=await prepareProviderProcess08({packageRoot,request,inputs:[{path:'input/original.rpf',bytes},...capInputs]});return runProviderProcess08(prepared);
}
function completed(r){assert.equal(r.state,'completed',JSON.stringify({receipt:r.receipt,stderr:r.supervisorStderr,worker:r.workerResult}));assert.equal(isProviderRun08(r),true);return r.workerResult;}
const dto=r=>r.resources.map(resource=>[resource.kind,resource.packet.decodedSHA256]);

test('original NG archive construction is deterministic and never acquires external material',()=>{
 const b=Buffer.alloc(64);b.writeUInt32LE(0x52504637);b.writeUInt32LE(1,4);b.writeUInt32LE(1,8);
 const a=originalEncryptedArchive08(b),c=originalEncryptedArchive08(b);assert.deepEqual(a.bytes,c.bytes);assert.deepEqual(a.state,c.state);assert.equal(a.state.length,306256);assert.equal(a.originalAuthority,'original-synthetic-key-material');assert.equal(a.capability.aes,null);
});

test('actual full CodeWalker archive resources/cache/YMF/DLC parse without a GUI or bootstrap',{skip:!native},async()=>{
 const r=completed(await run());assert.equal(r.phase,'all-fixture');assert.equal(r.resources.length,3);assert.equal(r.metadata.length,5);assert.deepEqual(r.unknown,[]);
 assert.deepEqual(r.metadata.map(m=>m.data.kind),['cache','ymf','dlc-setup','dlc-content','dlc-list']);assert.equal(r.metadata.find(m=>m.data.kind==='ymf').data.format,'PSO');
 assert.equal(r.metadata[0].data.bounds.length,1);assert.equal(r.metadata[0].data.trianglesProvided,false);assert.equal(r.bootstrap.automaticBootstrapAvailable,false);assert.equal(r.bootstrap.implicitExecutableReads,0);assert.equal(r.installedWorldVerified,false);
 const ytyp=JSON.parse(r.resources.find(v=>v.kind==='ytyp').packet.decodedJson);assert.equal(ytyp.data.archetypes[0].physicsDictionary,r.resources.find(v=>v.kind==='ybn').nameHash);
 const linked=completed(await run('metadata-links.rpf',{phase:'metadata',ranges:true})).metadata[0].data;
 assert.equal(linked.groups.length,1);assert.equal(linked.interiors[0].nameHash,11223344);assert.deepEqual(linked.groups[0].bounds,[r.resources.find(v=>v.kind==='ybn').nameHash]);assert.equal(linked.imapDependencies.length,1);assert.equal(linked.roomConnectivity,'not-qualified');
});

test('scrambled stored RPF resource headers rebuild actual RSC7 from entry flags without decrypting ordinary geometry',{skip:!native},async()=>{
 const normal=completed(await run()),scrambled=completed(await run('scrambled.rpf'));assert.deepEqual(dto(scrambled),dto(normal));assert.deepEqual(scrambled.unknown,[]);
 for(const resource of scrambled.resources){assert.equal(resource.source.representation,'reconstructed-RSC7-from-RPF-entry');assert.notEqual(resource.source.storedSHA256,resource.source.parserBufferSHA256);assert.equal(resource.packet.sourceSHA256,resource.source.parserBufferSHA256);assert.equal(providerByteSHA08(Buffer.from(resource.base64,'base64')),resource.source.parserBufferSHA256);}
});

test('actual CodeWalker NG decrypts separately encrypted tables/names using only explicitly staged original synthetic state',{skip:!native},async()=>{
 const original=await fs.readFile(path.join(fixtureRoot,'original.rpf')),f=originalEncryptedArchive08(original),capInputs=[{path:f.capability.file,bytes:f.state}];
 const plain=completed(await run()),ng=completed(await run('ng.rpf',{capability:f.capability,capInputs}));assert.deepEqual(dto(ng),dto(plain));assert.equal(ng.resources.length,3);assert.deepEqual(ng.unknown,[]);assert.equal(ng.bootstrap.implicitExecutableReads,0);
 const rejected=await run('ng.rpf');assert.equal(rejected.state,'failed');assert.equal(rejected.workerJoined,true);assert.equal(isProviderRun08(rejected),false);
 const wrong=Buffer.from(f.state);for(let k=0;k<101;k++)wrong[k*272]^=1;const bad=await run('ng.rpf',{capability:{...f.capability,sha256:providerByteSHA08(wrong)},capInputs:[{path:f.capability.file,bytes:wrong}]});assert.equal(bad.state,'failed');assert.equal(bad.workerJoined,true);
 const aes=originalEncryptedArchive08(original,{aes:true}),aesResult=completed(await run('aes.rpf',{capability:aes.capability,capInputs:[{path:aes.capability.file,bytes:aes.state},{path:aes.capability.aes.file,bytes:aes.aesKey}]}));assert.deepEqual(dto(aesResult),dto(plain));assert.deepEqual(aesResult.unknown,[]);
});

test('metadata-first discovery pages actual entry identities without reading geometry payloads',{skip:!native},async()=>{
 const all=completed(await run('original.rpf',{ranges:true})),first=completed(await run('original.rpf',{phase:'metadata',ranges:true,discovery:{offset:0,maximum:2}})),last=completed(await run('original.rpf',{phase:'metadata',ranges:true,discovery:{offset:2,maximum:2}}));
 assert.equal(first.resources.length,0);assert.equal(first.metadata.length,5);assert.equal(first.candidates.length,2);assert.equal(first.discovery.total,3);assert.equal(first.discovery.nextOffset,2);assert.equal(last.candidates.length,1);assert.equal(last.discovery.nextOffset,null);assert.equal(first.discovery.sealedDomain,true);
 assert.deepEqual([...first.candidates,...last.candidates].map(c=>c.logicalMember),all.resources.map(c=>c.logicalPath));assert.ok(first.stats.sourceReadBytes<=all.stats.sourceReadBytes-all.resources.reduce((n,r)=>n+r.bytes,0));assert.ok(first.candidates.every(c=>c.metadataOnly&&!c.geometryOwnershipVerified));
 // Actual CodeWalker RpfResourceFileEntry.Read treats this packed size as a
 // request to read sixteen bytes from the member. Refuse before source IO,
 // including when the geometry member was never selected for decoding.
 const sentinel=Buffer.from(await fs.readFile(path.join(fixtureRoot,'original.rpf')));sentinel.writeUIntLE(0xffffff,16+16+2,3);
 const pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'provider-package08.json'),'utf8')),request=originalProviderRequest08({parserSHA256:pkg.parserSHA256,bytes:sentinel.length,phase:'metadata',hashMode:'ranges'}),prepared=await prepareProviderProcess08({packageRoot,request,inputs:[{path:'input/original.rpf',bytes:sentinel}]}),blocked=await runProviderProcess08(prepared);
 assert.equal(blocked.state,'failed');assert.equal(blocked.workerJoined,true);assert.equal(isProviderRun08(blocked),false);assert.equal(blocked.workerResult,null);
 const failureBytes=await fs.readFile(path.join(blocked.root,'result/stdout.bin'));assert.ok(failureBytes.length<=4096);const failure=JSON.parse(failureBytes);
 assert.equal(failure.passed,false);assert.equal(failure.state,'unsupported-unqualified');assert.match(failure.reason,/metadata-prefix-only/);
 assert.equal(failure.stats.sourceReadBytes,16+sentinel.readUInt32LE(4)*16+sentinel.readUInt32LE(8));assert.equal(failure.stats.resourcesDecoded,0);assert.equal(failure.stats.metadataDecoded,0);
});

test('resource phase opens only exact selected logical members and retains missing selections as unknown',{skip:!native},async()=>{
 const selection=[{logicalArchive:'original/base.rpf',logicalMember:'original_collision08.ybn'}],r=completed(await run('original.rpf',{phase:'resources',selection,ranges:true}));assert.equal(r.resources.length,1);assert.equal(r.resources[0].kind,'ybn');assert.equal(r.metadata.length,0);
 const absent=completed(await run('original.rpf',{phase:'resources',selection:[{logicalArchive:'original/base.rpf',logicalMember:'missing.ybn'}],ranges:true}));assert.equal(absent.resources.length,0);assert.equal(absent.unknown.length,1);assert.equal(absent.unknown[0].fallbackUsed,false);
});

test('nested OPEN archives preserve physical source ranges and metadata phase avoids whole child copies',{skip:!native},async()=>{
 const r=completed(await run('nested.rpf',{ranges:true}));assert.equal(r.stats.archivesRead,2);assert.equal(r.resources.length,3);assert.deepEqual(r.unknown,[]);assert.ok(r.resources.every(v=>v.logicalArchive==='original/base.rpf/child.rpf'&&v.source.chain.length===1&&v.source.physicalOffset>v.source.offset));
 const meta=completed(await run('nested.rpf',{phase:'metadata',ranges:true}));assert.equal(meta.resources.length,0);assert.equal(meta.candidates.length,3);assert.ok(meta.stats.sourceReadBytes<r.stats.sourceReadBytes);
 // The original compressed child would decode correctly, but a uint32 size
 // above Int32.MaxValue must never turn into Inflate's negative sentinel.
 const declared=Buffer.from(await fs.readFile(path.join(fixtureRoot,'nested.rpf'))),entry=16+16,body=declared.readUIntLE(entry+5,3)*512,childBytes=declared.readUInt32LE(entry+8),packed=deflateRawSync(declared.subarray(body,body+childBytes));assert.ok(packed.length<childBytes);
 declared.fill(0,body,body+childBytes);packed.copy(declared,body);declared.writeUIntLE(packed.length,entry+2,3);declared.writeUInt32LE(0x80000000,entry+8);
 const pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'provider-package08.json'),'utf8')),request=originalProviderRequest08({parserSHA256:pkg.parserSHA256,bytes:declared.length,hashMode:'ranges'}),prepared=await prepareProviderProcess08({packageRoot,request,inputs:[{path:'input/original.rpf',bytes:declared}]}),blocked=completed(await runProviderProcess08(prepared));
 assert.equal(blocked.resources.length,0);assert.equal(blocked.metadata.length,0);assert.equal(blocked.unknown.length,1);assert.match(blocked.unknown[0].reason,/declared binary unpacked size exceeds 16MiB/);assert.equal(blocked.unknown[0].fallbackUsed,false);
 assert.equal(blocked.stats.sourceReadBytes,16+declared.readUInt32LE(4)*16+declared.readUInt32LE(8));
});

test('unknown encryption tags, absent NG capability, malformed ownership trees and out-of-range entries fail closed',{skip:!native},async()=>{
 for(const file of ['unknown-tag.rpf','missing-ng.rpf','bad-tree.rpf','bad-range.rpf']){const result=await run(file);assert.equal(result.state,'failed',file);assert.equal(result.workerJoined,true,file);assert.equal(isProviderRun08(result),false,file);assert.equal(result.workerResult,null,file);}
});

test('production-sized original sparse source is range decoded with no whole-source allocation/hash',{skip:!native},async()=>{
 const pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'provider-package08.json'),'utf8')),proof=JSON.parse(await fs.readFile(path.join(fixtureRoot,'proof.json'),'utf8')),file=path.join(fixtureRoot,'sparse-original.rpf'),stat=await fs.stat(file);
 assert.equal(stat.size,3000000073);const request=originalProviderRequest08({parserSHA256:pkg.parserSHA256,bytes:stat.size,handleId:'original',hashMode:'ranges'});
 const prepared=await prepareProviderProcess08({packageRoot,request,directSources:[{id:'original',path:file,bytes:stat.size,headerSHA256:proof.headerSHA256,identity:null}]}),result=await runProviderProcess08(prepared),r=completed(result);
 assert.equal(r.resources.length,3);assert.equal(r.sources[0].bytes,3000000073);assert.equal(r.sources[0].wholeArchiveSHA256,null);assert.equal(r.sources[0].allSourceContentKnown,false);assert.ok(r.stats.sourceReadBytes<65536);assert.equal(result.receipt.sourceBindings[0].identityUnchanged,true);
});
