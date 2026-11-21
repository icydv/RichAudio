import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {deflateRawSync} from 'node:zlib';
import {effectiveMapSelection01} from '../tools/world-map-requalification01.mjs';

const [reader, core, rootArg]=process.argv.slice(2);
assert(reader&&core&&rootArg);
const root=path.resolve(rootArg), archive='fixture.rpf';
assert(root.split(path.sep).includes('.local'));
fs.mkdirSync(root);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const parserSHA256=sha(fs.readFileSync(core));
const metadata=Buffer.from('authored map metadata');
const resource=Buffer.concat([Buffer.alloc(16),deflateRawSync(metadata)]);
const extendedSize=0x1000001;

function rpf(members){
 const records=Buffer.alloc(16*(members.length+1)),names=[Buffer.from([0])],payloads=[];
 records.writeUInt32LE(0x7fffff00,4);
 records.writeUInt32LE(1,8);
 records.writeUInt32LE(members.length,12);
 let block=1;
 for(const [i,m] of members.entries()){
  const record=records.subarray(16*(i+1),16*(i+2));
  record.writeUInt16LE(names.reduce((n,b)=>n+b.length,0));
  names.push(Buffer.from(m.name+'\0'));
  const stored=m.extended?0xffffff:m.resource?m.payload.length:0;
  record.writeUIntLE(stored,2,3);
  record.writeUIntLE((m.offset??block)+(m.resource?0x800000:0),5,3);
  record.writeUInt32LE(m.resource?0:m.payload.length,8);
  payloads.push([block*512,m.payload]);
  block+=Math.max(1,Math.ceil(m.payload.length/512));
 }
 const out=Buffer.alloc(block*512),strings=Buffer.concat(names);
 assert(16+records.length+strings.length<=512);
 out.writeUInt32LE(0x52504637);
 out.writeUInt32LE(members.length+1,4);
 out.writeUInt32LE(strings.length,8);
 out.writeUInt32LE(0x4e45504f,12);
 records.copy(out,16);strings.copy(out,16+records.length);
 for(const [offset,payload] of payloads)payload.copy(out,offset);
 return out;
}
const original=name=>({name,payload:resource,resource:true});
const extended=(name,length,valid=true)=>{
 const payload=Buffer.alloc(length);
 if(valid){payload[7]=extendedSize&255;payload[14]=(extendedSize>>>8)&255;payload[5]=(extendedSize>>>16)&255;payload[2]=extendedSize>>>24;}
 return {name,payload,resource:true,extended:true};
};
function test(name,bytes,selected,branches,expectedExit){
 const folder=path.join(root,name),out=path.join(folder,'results');
 fs.mkdirSync(folder);fs.mkdirSync(out);
 fs.writeFileSync(path.join(folder,archive),bytes);
 const qualified=names=>names.map(n=>archive+'/'+n);
 const plan=Buffer.from(JSON.stringify({archives:[archive],selected:qualified(selected),branches:qualified(branches),parserSHA256}));
 const planPath=path.join(folder,'plan.json');fs.writeFileSync(planPath,plan);
 const run=spawnSync(reader,['--fixture',folder,out,planPath,sha(plan)],{encoding:'utf8',timeout:15000,windowsHide:true});
 assert.equal(run.status,expectedExit,run.error?.message??run.stderr);
 return fs.readFileSync(path.join(out,'metadata.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
}
const ordinary=test('ordinary',rpf([original('chosen.ymap')]),['chosen.ymap'],[],0);
assert.equal(ordinary.find(r=>r.kind==='metadata').sha256,sha(metadata));
assert.deepEqual(fs.readFileSync(path.join(root,'ordinary/results',ordinary.find(r=>r.kind==='metadata').payloadFile)),metadata);
const siblings=test('siblings',rpf([extended('large.ytd',extendedSize),original('after.ymap'),
 {name:'branch.rpf',payload:rpf([original('within.ytyp'),original('within.ymap')])}]),
 ['after.ymap','branch.rpf/within.ytyp','branch.rpf/within.ymap'],['branch.rpf'],0);
assert.equal(siblings.filter(r=>r.kind==='metadata').length,3);
assert.equal(siblings.filter(r=>r.kind==='unselected-extended-resource').length,1);
const extent=test('selected-extended-ybn',rpf([extended('large.ybn',extendedSize)]),['large.ybn'],[],0);
assert.equal(extent.find(r=>r.kind==='selected-ybn-entry').storedBytes,extendedSize);
assert.equal(extent.find(r=>r.kind==='archive-result').payloadBytes,0);
const invalid=test('invalid-extents',rpf([{...original('past.ymap'),offset:0x7fffff},{...original('table.ytyp'),offset:0},
 extended('bad.ybn',512),extended('small.ybn',512,false)]),['past.ymap','table.ytyp','bad.ybn','small.ybn'],[],2);
assert.equal(invalid.filter(r=>r.kind==='blocked').length,4);
assert.equal(invalid.find(r=>r.kind==='archive-result').selectedTraversalComplete,false);
const truncated=rpf([original('inside.ymap')]).subarray(0,19);
const short=test('truncated',rpf([{name:'truncated.rpf',payload:truncated}]),['truncated.rpf/inside.ymap'],['truncated.rpf'],2);
assert(short.some(r=>r.kind==='blocked'&&r.path.endsWith('/truncated.rpf')));
assert(!short.some(r=>r.reason==='entry absent from verified table'));
const cyclic=rpf([original('inside.ymap')]);cyclic.writeUInt32LE(0,24);
assert(test('cyclic',cyclic,['inside.ymap'],[],2).some(r=>r.reason.includes('cycle')));
const duplicate=test('duplicate-identity',rpf([original('same.ymap'),original('SAME.YMAP')]),['same.ymap'],[],2);
assert(duplicate.some(r=>r.reason==='duplicate archive member identity'));
assert(!duplicate.some(r=>r.kind==='metadata'));
const unplanned=test('unplanned-candidate',rpf([original('chosen.ymap'),extended('possible-override.ymap',512)]),['chosen.ymap'],[],0);
assert(unplanned.some(r=>r.kind==='unplanned-map-member'&&r.extendedSize));
assert(!unplanned.some(r=>r.kind==='metadata'&&r.path.endsWith('/possible-override.ymap')));
const contender=unplanned.find(r=>r.kind==='unplanned-map-member'),verified=unplanned.find(r=>r.kind==='metadata');
assert.match(contender.shortNameHash,/^0x[0-9a-f]{8}$/);
const choices=[{path:verified.path,rank:2,state:'verified'},{path:contender.path,rank:2,state:'unread'}];
assert.equal(effectiveMapSelection01(choices).state,'ambiguous-effective-override');
assert.deepEqual(effectiveMapSelection01([choices[0],{...choices[1],rank:3}]),{state:'winning-source-unverified',path:contender.path});
assert.deepEqual(effectiveMapSelection01([choices[0],{...choices[1],rank:1}]),{state:'effective-verified',path:verified.path});
assert.equal(effectiveMapSelection01([choices[0],{...choices[1],rank:null}]).state,'effective-precedence-unresolved');
const badManifest=test('unprojectable-manifest',rpf([{name:'bad.ymf',payload:Buffer.alloc(32,7)}]),['bad.ymf'],[],2);
assert(badManifest.some(r=>r.kind==='metadata')&&badManifest.some(r=>r.kind==='blocked'));
assert(!badManifest.some(r=>r.kind==='ymf-projection'));
console.log(JSON.stringify({fixtureCases:9,loadedCodeWalkerSHA256:parserSHA256,protectedReads:0}));
