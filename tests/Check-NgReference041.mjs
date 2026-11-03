import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {syntheticNgMaterial041,encryptSyntheticNg041} from './fixtures/NgMetadata041.mjs';
import {createNgProfile041,selectNgKey041,decryptNgBuffer041} from '../src/acoustics/world/ng-cipher041.mjs';
import {byteDigest} from '../src/acoustics/world/contracts.mjs';
const mode=process.argv[2],root=path.resolve(process.argv[3]??'');
const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assert(root.startsWith(path.join(repo,'.local')+path.sep),'Explicit private synthetic output');
if(mode==='prepare'){
 const material=syntheticNgMaterial041(),profile=createNgProfile041(material),cases=[],expected=[];
 for(const [i,size] of [0,1,15,16,17,31,32,257,1024,4096,16384].entries()){
  const archiveName=i%2?'Update.rpf':'update.rpf',archiveBytes=i%3===0?4294967296+8192:3000000073+i;
  const plain=Buffer.from(Array.from({length:size},(_,j)=>(j*73+i*41+(j>>>3)*17)&255)),cipher=encryptSyntheticNg041(plain,material,{archiveName,archiveBytes}),selected=selectNgKey041(profile,{archiveName,archiveBytes});
  assert.deepEqual(decryptNgBuffer041(cipher,profile,{archiveName,archiveBytes}),plain);
  cases.push({id:'original-'+i,archiveName,archiveBytes,cipher:cipher.toString('base64')});expected.push({id:'original-'+i,filenameHash:selected.filenameHash,keyIndex:selected.keyIndex,selectedKeySHA256:byteDigest(material.expandedKeys.subarray(selected.keyIndex*272,(selected.keyIndex+1)*272)),decodedSHA256:byteDigest(plain),decodedBytes:plain.length});
 }
 fs.writeFileSync(path.join(root,'input.json'),JSON.stringify({kind:'original-synthetic-ng-oracle041',material:{expandedKeys:material.expandedKeys.toString('base64'),tables:material.tables.toString('base64'),hashLut:material.hashLut.toString('base64')},cases}),{flag:'wx'});
 fs.writeFileSync(path.join(root,'expected.json'),JSON.stringify(expected),{flag:'wx'});
}else{
 assert.equal(mode,'check');const expected=JSON.parse(fs.readFileSync(path.join(root,'expected.json'))),actual=JSON.parse(fs.readFileSync(path.join(root,'actual.json'),'utf8').replace(/^\uFEFF/,''));
 assert.equal(actual.sourceCommit,'485d56bec00262ed7fa472261cce7bbc6202b96e');assert.deepEqual(actual.cases,expected);assert.equal(actual.realKeysLoaded,false);assert.equal(actual.gameFilesRead,false);
 console.log('PASS '+expected.length+' independent pinned CodeWalker NG synthetic vectors; no real keys or installed compatibility proof');
}
