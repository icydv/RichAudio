import test from 'node:test';
import assert from 'node:assert/strict';
import {byteDigest} from '../src/acoustics/world/contracts.mjs';
import {createNgProfile041,selectNgKey041,decryptNgBuffer041,ngCipherLimits041} from '../src/acoustics/world/ng-cipher041.mjs';
import {planNgMetadata041,decodeNgMetadata041,diffNgMetadataCatalogs041,rpfTags041} from '../src/acoustics/world/ng-metadata041.mjs';
import {syntheticNgMaterial041,selectedSyntheticMaterial041,encryptSyntheticNg041,originalNgMetadata041} from './fixtures/NgMetadata041.mjs';
const packet=f=>({archive:f.archive,archiveName:f.archiveName,archiveBytes:f.archiveBytes,header:f.header,table:f.table,profile:f.profile,expected:f.expected});
function changedPlain(mutate){const f=originalNgMetadata041({tag:rpfTags041.open});mutate(f.plainEntries,f.plainNames,f);f.table=Buffer.concat([f.plainEntries,f.plainNames]);f.expected={headerSHA256:byteDigest(f.header),tableSHA256:byteDigest(f.table)};return packet(f);}
// An independent scalar oracle uses arbitrary-precision modular arithmetic for
// hash/key selection and explicitly byte-expands four XOR table words per round.
// It never invokes production selection/decryption helpers.
function referenceSelect(name,length,lut){let h=0n;for(const c of name){let t=1025n*(BigInt(lut[c.charCodeAt(0)])+h)&0xffffffffn;h=(t>>6n)^t;}const nine=9n*h&0xffffffffn;h=32769n*((nine>>11n)^nine)&0xffffffffn;return {filenameHash:Number(h),archiveLengthUint32:Number(BigInt(length)&0xffffffffn),keyIndex:Number((h+(BigInt(length)&0xffffffffn)+61n&0xffffffffn)%101n)};}
function referenceDecrypt(data,material,name,length){const selected=referenceSelect(name,length,material.hashLut),base=material.selectedKeyIndex===null?selected.keyIndex*272:0,out=Buffer.from(data);for(let at=0;at+16<=data.length;at+=16){let state=Array.from(data.subarray(at,at+16));for(let round=0;round<17;round++){const positions=round===0||round===1||round===16?[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]]:[[0,7,10,13],[1,4,11,14],[2,5,8,15],[3,6,9,12]],next=[];for(let word=0;word<4;word++){let n=BigInt(material.expandedKeys.readUInt32LE(base+round*16+word*4));for(const slot of positions[word])n^=BigInt(material.tables.readUInt32LE(((round*16+slot)*256+state[slot])*4));for(let lane=0;lane<4;lane++)next.push(Number(n>>BigInt(lane*8)&255n));}state=next;}Buffer.from(state).copy(out,at);}return out;}
test('actual17-roundNG behavior agrees with independent scalar oracle for arbitrary synthetic tables, keys and tails',()=>{
 const material=syntheticNgMaterial041();for(let i=0;i<material.tables.length;i+=4)material.tables.writeUInt32LE((Math.imul(i+17,0x9e3779b1)^(i>>>2))>>>0,i);material.expected.tablesSHA256=byteDigest(material.tables);const profile=createNgProfile041(material);
 for(const length of [0,1,15,16,17,31,32,79]){const data=Buffer.from(Array.from({length},(_,i)=>(i*37+19)&255));assert.deepEqual(decryptNgBuffer041(data,profile,{archiveName:'update.rpf',archiveBytes:3000000073}),referenceDecrypt(data,material,'update.rpf',3000000073));assert.deepEqual(decryptNgBuffer041(data,profile,{archiveName:'update.rpf',archiveBytes:3000000073}).subarray(length-length%16),data.subarray(length-length%16));}
});
test('filename LUT selection preserves case, uint32 wrap and independently constrained selected schedule',()=>{
 const m=syntheticNgMaterial041(),p=createNgProfile041(m);for(const name of ['update.rpf','UPDATE.RPF','custom-map.rpf'])for(const size of [0,8192,3000000073,4294967295,4294967301]){const result=selectNgKey041(p,{archiveName:name,archiveBytes:size}),reference=referenceSelect(name,size,m.hashLut);for(const key of ['filenameHash','archiveLengthUint32','keyIndex'])assert.equal(result[key],reference[key]);}
 const selected=selectNgKey041(p,{archiveName:'update.rpf',archiveBytes:8192}).keyIndex,single=createNgProfile041(selectedSyntheticMaterial041(m,selected));assert.equal(single.materialBytes,279056);assert.equal(p.materialBytes,306256);const data=Buffer.alloc(32,37);assert.deepEqual(decryptNgBuffer041(data,single,{archiveName:'update.rpf',archiveBytes:8192}),decryptNgBuffer041(data,p,{archiveName:'update.rpf',archiveBytes:8192}));assert.throws(()=>decryptNgBuffer041(data,single,{archiveName:'update.rpf',archiveBytes:8193}),/schedule unavailable/);assert.throws(()=>selectNgKey041(p,{archiveName:'../update.rpf',archiveBytes:8192}),/filename/);
});
test('profile shape, expected hashes, source authority and input caps fail before decoding',()=>{
 const m=syntheticNgMaterial041();assert.throws(()=>createNgProfile041({...m,authority:'installed-game-key'}),/synthetic/);assert.throws(()=>createNgProfile041({...m,expandedKeys:Buffer.alloc(271)}),/shape/);assert.throws(()=>createNgProfile041({...m,tables:Buffer.alloc(1)}),/shape/);assert.throws(()=>createNgProfile041({...m,expected:{...m.expected,hashLutSHA256:'0'.repeat(64)}}),/digest/);const p=createNgProfile041(m);assert.throws(()=>decryptNgBuffer041(Buffer.alloc(ngCipherLimits041.inputBytes+1),p,{archiveName:'x.rpf',archiveBytes:16}),/bounded/);assert.throws(()=>decryptNgBuffer041(Buffer.alloc(16),{...p},{archiveName:'x.rpf',archiveBytes:16}),/branded/);
 const before=decryptNgBuffer041(Buffer.alloc(16),p,{archiveName:'x.rpf',archiveBytes:16});m.tables.fill(0);m.hashLut.fill(0);m.expandedKeys.fill(0);assert.deepEqual(decryptNgBuffer041(Buffer.alloc(16),p,{archiveName:'x.rpf',archiveBytes:16}),before);
});
test('encrypted entry and names buffers decode separately to strict packed member metadata without payload reads',()=>{
 const f=originalNgMetadata041(),out=decodeNgMetadata041(packet(f));assert.equal(out.decodedEntriesSHA256,byteDigest(f.plainEntries));assert.equal(out.decodedNamesSHA256,byteDigest(f.plainNames));assert.equal(out.rows.length,5);assert.equal(out.decryption.independentEntryAndNamesBuffers,true);assert.equal(out.decryption.namesUnchangedTailBytes,f.plainNames.length%16);assert.equal(out.memberPayloadsRead,0);assert.equal(out.keysAcquired,0);assert.equal(out.installedWorldVerified,false);assert.equal(out.enhancedCompatibilityVerified,false);assert.equal(out.completeArchiveSHA256,null);
 const map=out.rows.find(r=>r.logicalMember==='building.ymap');assert.equal(map.originalMemberPath,'building.YMAP');assert.equal(map.storedRange.offset,2048);assert.equal(map.storedRange.bytes,120);assert.equal(map.resourceVersion,2);assert.deepEqual(map.entryMetadataRange,{offset:48,bytes:16});assert.equal(map.encryptedEntrySHA256,byteDigest(f.table.subarray(32,48)));const nested=out.rows.find(r=>r.logicalMember.endsWith('nested.rpf'));assert.equal(nested.compressed,true);assert.equal(nested.encryptionType,1);assert.equal(nested.storedRange.bytes,48);assert.equal(nested.unpackedBytes,500);
});
test('plain and NG tags remain distinct; AES and unknown tags never silently fall back',()=>{
 for(const tag of [rpfTags041.none,rpfTags041.open]){const f=originalNgMetadata041({tag}),out=decodeNgMetadata041(packet(f));assert.equal(out.encryptionTag,tag);assert.equal(out.selection,null);assert.equal(out.decryption.entryBlocks,0);}
 for(const [tag,state]of [[rpfTags041.aes,'unsupported-aes-metadata'],[0x12345678,'unsupported-unknown-encryption-tag']]){const f=originalNgMetadata041({tag}),plan=planNgMetadata041(f);assert.equal(plan.state,state);assert.equal(plan.tableRange,null);assert.throws(()=>decodeNgMetadata041(packet(f)),/cannot fall back/);}
});
test('required input identities, exact ranges, filename length selection and wrong synthetic material reject',()=>{
 const f=originalNgMetadata041(),input=packet(f);assert.throws(()=>decodeNgMetadata041({...input,profile:null}),/branded/);assert.throws(()=>decodeNgMetadata041({...input,expected:{...input.expected,tableSHA256:'0'.repeat(64)}}),/digests/);assert.throws(()=>decodeNgMetadata041({...input,table:Buffer.concat([f.table,Buffer.alloc(1)])}),/digests/);
 const m=syntheticNgMaterial041(),index=selectNgKey041(createNgProfile041(m),f).keyIndex;m.expandedKeys[index*272]^=1;m.expected.expandedKeysSHA256=byteDigest(m.expandedKeys);assert.throws(()=>decodeNgMetadata041({...input,profile:createNgProfile041(m)}));assert.throws(()=>decodeNgMetadata041({...input,archiveName:'other.rpf'}),/filename/);assert.throws(()=>planNgMetadata041({...f,archiveBytes:16}),/ranges/);
});
test('malformed packed extents, metadata aliases, overlaps and binary flags fail closed',()=>{
 for(const mutate of [e=>e.writeUIntLE(1000,2*16+2,3),e=>e.writeUIntLE(0x800000,2*16+5,3),e=>e.writeUIntLE(0x800004,3*16+5,3),e=>e.writeUInt32LE(2,7*16+12),e=>e.writeUIntLE(0xffffff,7*16+2,3),e=>e.writeUInt32LE(0x0fffffff,2*16+8)]){
  const input=changedPlain(mutate);if(input.table.readUIntLE(2*16+2,3)===1000){input.archiveBytes=2500;}assert.throws(()=>decodeNgMetadata041(input));
 }
});
test('extended resource sizes stay explicitly unknown and never cause payload header access',()=>{
 const input=changedPlain(e=>e.writeUIntLE(0xffffff,2*16+2,3));input.archiveBytes=33554432;
 // The minimum extended interval would overlap the other fixture members:
 assert.throws(()=>decodeNgMetadata041(input),/overlapping/);
 const isolated=changedPlain(e=>{e.writeUIntLE(0xffffff,2*16+2,3);for(const index of [3,5,6,7])e.writeUIntLE((index+40000)|(index===3||index===6?0x800000:0),index*16+5,3);});isolated.archiveBytes=33554432;const out=decodeNgMetadata041(isolated),member=out.rows.find(r=>r.logicalMember==='building.ymap');assert.equal(member.storedRange.bytes,null);assert.equal(member.storedRange.end,null);assert.equal(member.boundsQualified,false);assert.equal(member.extentState,'unqualified-extended-resource-size-needs-payload-header');assert.equal(out.counts.unknownMemberExtents,1);assert.equal(out.memberPayloadsRead,0);
});
test('tree ownership, traversal, duplicate names, string bounds and resource budgets are strict',()=>{
 for(const mutate of [e=>e.writeUInt32LE(0,8),e=>e.writeUInt32LE(2,4*16+12),e=>e.writeUInt32LE(0xffffffff,12),(e,n)=>n.write('../bad',n.indexOf(Buffer.from('common'))),(e,n)=>n[n.length-1]=65,(e,n)=>e.writeUInt16LE(n.length+1,2*16),(e,n)=>e.writeUInt16LE(n.indexOf(Buffer.from('building.YMAP')),3*16)])assert.throws(()=>decodeNgMetadata041(changedPlain(mutate)));
 const f=originalNgMetadata041();for(const [offset,value]of [[4,32769],[8,1048577]]){const header=Buffer.from(f.header);header.writeUInt32LE(value,offset);assert.throws(()=>planNgMetadata041({...f,header}),/bounded/);}
});
test('declared zero-size fallback distinguishes resource page allocation from binary unpacked bytes',()=>{
 const input=changedPlain(e=>{e.writeUIntLE(0,2*16+2,3);e.writeUIntLE(0,7*16+2,3);}),out=decodeNgMetadata041(input);
 assert.equal(out.rows.find(r=>r.logicalMember==='building.ymap').storedRange.bytes,512);
 assert.equal(out.rows.find(r=>r.logicalMember.endsWith('nested.rpf')).storedRange.bytes,500);
 assert.equal(out.memberPayloadsRead,0);
});
function originalPlainTree({directoryNames=[],fileCount=1}={}){
 const labels=['',...directoryNames,...Array.from({length:fileCount},(_,i)=>'f'+String(i).padStart(4,'0')+'.ymap')],names=Buffer.from(labels.join('\0')+'\0'),entries=Buffer.alloc(labels.length*16),header=Buffer.alloc(16);let nameAt=0;
 for(let i=0;i<labels.length;i++){
  const at=i*16;if(i<=directoryNames.length){entries.writeUInt32LE(nameAt,at);entries.writeUInt32LE(0x7fffff00,at+4);entries.writeUInt32LE(i+1,at+8);entries.writeUInt32LE(i===directoryNames.length?fileCount:1,at+12);}
  else{entries.writeUInt16LE(nameAt,at);entries.writeUIntLE(1,at+2,3);entries.writeUIntLE(128+i,at+5,3);entries.writeUInt32LE(1,at+8);}
  nameAt+=Buffer.byteLength(labels[i])+1;
 }
 header.writeUInt32LE(0x52504637);header.writeUInt32LE(labels.length,4);header.writeUInt32LE(names.length,8);header.writeUInt32LE(rpfTags041.open,12);const table=Buffer.concat([entries,names]);return {archive:'original.rpf',archiveName:'original.rpf',archiveBytes:2097152,header,table,expected:{headerSHA256:byteDigest(header),tableSHA256:byteDigest(table)}};
}
test('name, path, depth and selected-output limits bound otherwise valid authored metadata trees',()=>{
 assert.throws(()=>decodeNgMetadata041(originalPlainTree({directoryNames:['a'.repeat(129)]})),/terminated/);
 assert.throws(()=>decodeNgMetadata041(originalPlainTree({directoryNames:['a'.repeat(128),'b'.repeat(128),'c'.repeat(128)]})),/oversized/);
 assert.throws(()=>decodeNgMetadata041(originalPlainTree({directoryNames:Array.from({length:17},(_,i)=>'d'+i)})),/depth/);
 assert.throws(()=>decodeNgMetadata041(originalPlainTree({fileCount:2049})),/output row/);
});
test('unrelated encrypted table changes retain stable logical keys and unchanged member metadata digests',()=>{
 const f=originalNgMetadata041(),before=decodeNgMetadata041(packet(f)),changedEntries=Buffer.from(f.plainEntries);changedEntries.writeUIntLE(49,7*16+2,3);
 const table=Buffer.concat([encryptSyntheticNg041(changedEntries,f.material,f),encryptSyntheticNg041(f.plainNames,f.material,f)]),after=decodeNgMetadata041({...packet(f),table,expected:{...f.expected,tableSHA256:byteDigest(table)}}),oldRows=new Map(before.rows.map(row=>[row.logicalMember,row]));
 for(const row of after.rows){const old=oldRows.get(row.logicalMember);assert.equal(row.logicalMemberKey,old.logicalMemberKey);assert.notEqual(row.memberIdentity,old.memberIdentity);assert.equal(row.resourceContentSHA256,null);if(row.logicalMember.endsWith('nested.rpf'))assert.notEqual(row.decodedMemberMetadataDigest,old.decodedMemberMetadataDigest);else assert.equal(row.decodedMemberMetadataDigest,old.decodedMemberMetadataDigest);}
 const diff=diffNgMetadataCatalogs041(before,after);assert.deepEqual(diff.counts,{unchanged:4,candidateInvalidations:1});assert.deepEqual(diff.changes.filter(row=>row.candidateInvalidation).map(row=>row.logicalMember),['common/data/nested.rpf']);assert.deepEqual(diff.contextChanges,['tableSHA256']);assert.equal(diff.cacheReuseQualified,false);assert.equal(diff.resourceContentHashesKnown,0);
 assert(diff.changes.every(row=>row.resourceContentSHA256===null&&row.payloadContentStatus==='unknown-not-read'&&row.cacheReuseQualified===false));
});
test('metadata-only diffs distinguish additions/removals while unchanged declarations never certify payload content',()=>{
 const f=originalNgMetadata041({tag:rpfTags041.open}),before=decodeNgMetadata041(packet(f));const renamedNames=Buffer.from(f.plainNames);renamedNames.write('nested.bin',renamedNames.indexOf(Buffer.from('nested.rpf')));const table=Buffer.concat([f.plainEntries,renamedNames]),after=decodeNgMetadata041({...packet(f),table,expected:{...f.expected,tableSHA256:byteDigest(table)}});
 const removed=diffNgMetadataCatalogs041(before,after),added=diffNgMetadataCatalogs041(after,before);assert.equal(removed.changes.find(row=>row.candidateInvalidation).change,'member-metadata-removed');assert.equal(added.changes.find(row=>row.candidateInvalidation).change,'member-metadata-added');
 const unchanged=diffNgMetadataCatalogs041(before,before);assert.equal(unchanged.counts.candidateInvalidations,0);assert.equal(unchanged.cacheReuseQualified,false);assert(unchanged.changes.every(row=>row.resourceContentSHA256===null));
 assert.throws(()=>diffNgMetadataCatalogs041(structuredClone(before),after),/branded/);assert.throws(()=>diffNgMetadataCatalogs041({...before},after),/branded/);
});
