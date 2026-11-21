// Independent hostile-metadata controls using original arithmetic fixtures only.
// No private key, installation, executable or filesystem resource is accessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {byteDigest} from '../src/acoustics/world/contracts.mjs';
import {createNgProfile041,selectNgKey041,decryptNgBuffer041} from '../src/acoustics/world/ng-cipher041.mjs';
import {decodeNgMetadata041,planNgMetadata041,diffNgMetadataCatalogs041,rpfTags041} from '../src/acoustics/world/ng-metadata041.mjs';
import {originalNgMetadata041,syntheticNgMaterial041,selectedSyntheticMaterial041} from './fixtures/NgMetadata041.mjs';
const packet=f=>({archive:f.archive,archiveName:f.archiveName,archiveBytes:f.archiveBytes,header:f.header,table:f.table,profile:f.profile,expected:f.expected});
function plain(mutate){const f=originalNgMetadata041({tag:rpfTags041.open});mutate(f);f.table=Buffer.concat([f.plainEntries,f.plainNames]);f.expected={headerSHA256:byteDigest(f.header),tableSHA256:byteDigest(f.table)};return packet(f);}

test('review: selected NG schedule is constrained by exact case-sensitive LUT identity and wrapping archive length',()=>{
 const material=syntheticNgMaterial041(),full=createNgProfile041(material),lower=selectNgKey041(full,{archiveName:'update.rpf',archiveBytes:8192}),upper=selectNgKey041(full,{archiveName:'UPDATE.RPF',archiveBytes:8192});assert.notEqual(lower.filenameHash,upper.filenameHash);assert.notEqual(lower.keyIndex,upper.keyIndex);
 const selected=createNgProfile041(selectedSyntheticMaterial041(material,lower.keyIndex));assert.throws(()=>selectNgKey041(selected,{archiveName:'UPDATE.RPF',archiveBytes:8192}),/unavailable/);assert.deepEqual(selectNgKey041(full,{archiveName:'update.rpf',archiveBytes:8192+4294967296}).keyIndex,lower.keyIndex);
 for(const archiveName of ['a/b.rpf','a\\b.rpf','..','a:rpf','\u0100.rpf'])assert.throws(()=>selectNgKey041(full,{archiveName,archiveBytes:8192}));
 for(const archiveBytes of [-1,NaN,Infinity,1.1,9007199254740992])assert.throws(()=>selectNgKey041(full,{archiveName:'update.rpf',archiveBytes}));
});

test('review: cipher input and caller-owned key material remain untouched and sub-block tails are exact',()=>{
 const material=syntheticNgMaterial041(),profile=createNgProfile041(material),input=Buffer.from(Array.from({length:47},(_,i)=>i+11)),before=Buffer.from(input),keyHash=byteDigest(material.expandedKeys),tableHash=byteDigest(material.tables),lutHash=byteDigest(material.hashLut);
 const result=decryptNgBuffer041(input,profile,{archiveName:'test.rpf',archiveBytes:8192});assert.deepEqual(input,before);assert.notEqual(result,input);assert.deepEqual(result.subarray(32),input.subarray(32));assert.equal(byteDigest(material.expandedKeys),keyHash);assert.equal(byteDigest(material.tables),tableHash);assert.equal(byteDigest(material.hashLut),lutHash);assert.equal(profile.installedCompatibilityVerified,false);
});

test('review: directory alias ownership and case-folded logical collisions reject even with matching recomputed input hashes',()=>{
 const ownership=plain(f=>{f.plainEntries.writeUInt32LE(2,1*16+12);});assert.throws(()=>decodeNgMetadata041(ownership),/ownership/);
 const collision=plain(f=>{const at=f.plainNames.indexOf(Buffer.from('collision.YBN'));f.plainNames.write('BUILDING.YMAP',at,'ascii');});assert.throws(()=>decodeNgMetadata041(collision),/ambiguous/);
 const emptyMember=plain(f=>f.plainEntries.writeUInt16LE(0,2*16));assert.throws(()=>decodeNgMetadata041(emptyMember),/unsafe/);
});

test('review: header-only planning cannot expand to keys, payloads, nested archives or unknown encryption fallback',()=>{
 const f=originalNgMetadata041(),plan=planNgMetadata041(packet(f));assert.deepEqual(plan.tableRange,{offset:16,bytes:f.table.length});assert.equal(plan.memberPayloadReadsAllowed,false);
 const output=decodeNgMetadata041(packet(f));assert.equal(output.nestedArchivesOpened,0);assert.equal(output.keysAcquired,0);assert.equal(output.memberPayloadsRead,0);assert.equal(output.completeArchiveSHA256,null);assert.equal(output.installedWorldVerified,false);assert.equal(output.enhancedCompatibilityVerified,false);assert.ok(output.rows.some(r=>r.logicalMember.endsWith('.rpf')),'nested archive is a row, never followed');
 const bad=Buffer.from(f.header);bad.writeUInt32LE(0x100,12);assert.equal(planNgMetadata041({...packet(f),header:bad}).tableRange,null);assert.throws(()=>decodeNgMetadata041({...packet(f),header:bad,expected:{...f.expected,headerSHA256:byteDigest(bad)}}),/cannot fall back/);
});

test('review: global archive length changes preserve local metadata identities without certifying unchanged payloads',()=>{
 const f=originalNgMetadata041({tag:rpfTags041.open}),before=decodeNgMetadata041(packet(f)),after=decodeNgMetadata041({...packet(f),archiveBytes:f.archiveBytes+512}),oldRows=new Map(before.rows.map(row=>[row.logicalMemberKey,row]));
 for(const row of after.rows){const old=oldRows.get(row.logicalMemberKey);assert.ok(old);assert.equal(row.decodedMemberMetadataDigest,old.decodedMemberMetadataDigest);assert.notEqual(row.memberIdentity,old.memberIdentity);assert.equal(row.resourceContentSHA256,null);}
 const diff=diffNgMetadataCatalogs041(before,after);assert.deepEqual(diff.contextChanges,['archiveBytes']);assert.equal(diff.counts.candidateInvalidations,0);assert.equal(diff.coverage,'selected-listed-member-metadata-only');assert.equal(diff.cacheReuseQualified,false);assert.equal(diff.resourceContentHashesKnown,0);assert.ok(diff.changes.every(row=>row.payloadContentStatus==='unknown-not-read'&&row.cacheReuseQualified===false));
});
