import test from 'node:test';
import assert from 'node:assert/strict';
import {planMetadataRead04,decodeMetadataTable04,metadataInventoryLimits04} from '../tools/world04-metadata-inventory.mjs';

function fixture({encryption=0x4e45504f,name='example.ymap'}={}){
 const names=Buffer.from('\0common\0data\0dlclist.xml\0'+name+'\0nested.rpf\0'),count=6,table=Buffer.alloc(count*16+names.length),header=Buffer.alloc(16);
 names.copy(table,count*16);header.writeUInt32LE(0x52504637);header.writeUInt32LE(count,4);header.writeUInt32LE(names.length,8);header.writeUInt32LE(encryption,12);
 const offset=n=>names.indexOf(Buffer.from(n+'\0'));
 function dir(i,n,start,children){table.writeUInt32LE(n?offset(n):0,i*16);table.writeUInt32LE(0x7fffff00,i*16+4);table.writeUInt32LE(start,i*16+8);table.writeUInt32LE(children,i*16+12);}
 function file(i,n,resource=false){table.writeUInt16LE(offset(n),i*16);if(resource)table.writeUInt32LE(0x80000000,i*16+4);}
 dir(0,'',1,1);dir(1,'common',2,1);dir(2,'data',3,3);file(3,'dlclist.xml');file(4,name,true);file(5,'nested.rpf');
 return {archive:'update/update.rpf',header,archiveBytes:1048576,table};
}
test('metadata-only plan binds exact archive, header and contiguous bounded range',()=>{
 const input=fixture(),plan=planMetadataRead04(input);assert.deepEqual(plan.nextRead,{offset:16,bytes:input.table.length});assert.equal(plan.resourcesRead,0);assert.equal(plan.installationQualified,false);
 const result=decodeMetadataTable04(input);assert.deepEqual(result.rows.map(x=>x.logicalMember),['common/data/dlclist.xml','common/data/example.ymap','common/data/nested.rpf']);assert.equal(result.memberPayloadsRead,0);assert.equal(result.nestedArchivesOpened,0);assert.equal(result.installationQualified,false);
});
test('encrypted/unknown tables stop after the 16-byte header without key or table access',()=>{
 for(const encryption of [0x0ffffff9,0x0fefffff,0x12345678]){const input=fixture({encryption}),plan=planMetadataRead04(input);assert.equal(plan.nextRead,null);assert.equal(plan.maximumInstalledBytes,16);assert.throws(()=>decodeMetadataTable04(input),/exact approved plain metadata/);}
});
test('archive substitution, full-file buffers and malformed range counts reject',()=>{
 const input=fixture();assert.throws(()=>planMetadataRead04({...input,archive:'mods/update/update.rpf'}),/allowlist/);assert.throws(()=>planMetadataRead04({...input,header:Buffer.alloc(32)}),/exact header/);
 assert.throws(()=>decodeMetadataTable04({...input,table:Buffer.concat([input.table,Buffer.alloc(1)])}),/exact approved/);
 for(const [offset,value] of [[4,metadataInventoryLimits04.entries+1],[8,metadataInventoryLimits04.namesBytes+1],[8,0]]){const header=Buffer.from(input.header);header.writeUInt32LE(value,offset);assert.throws(()=>planMetadataRead04({...input,header}),/bounded metadata/);}
 assert.throws(()=>planMetadataRead04({...input,archiveBytes:16}),/wholly inside/);
});
test('metadata paths never become host paths, member reads, authority or fabricated tree links',()=>{
 for(const name of ['../escape.ymap','..','bad:asset.ymap','bad\\asset.ymap'])assert.throws(()=>decodeMetadataTable04(fixture({name})),/unsafe metadata/);
 const input=fixture(),cycle=Buffer.from(input.table);cycle.writeUInt32LE(0,8);assert.throws(()=>decodeMetadataTable04({...input,table:cycle}),/duplicate\/cyclic/);
 const unreachable=Buffer.from(input.table);unreachable.writeUInt32LE(2,2*16+12);assert.throws(()=>decodeMetadataTable04({...input,table:unreachable}),/unreachable/);
 const missingTerminator=Buffer.from(input.table);missingTerminator[missingTerminator.length-1]=65;assert.throws(()=>decodeMetadataTable04({...input,table:missingTerminator}),/terminated/);
});
