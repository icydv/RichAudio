import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createCacheResidencyLog01} from '../tools/cache-residency-log01.mjs';
const root=path.resolve('.local/street01-cache-pressure01');fs.mkdirSync(root,{recursive:true});
const snapshot=(events,bindingEpoch=1)=>({schema:1,historyLimit:128,bindingEpoch,catalogSHA256:'a'.repeat(64),events});
test('private residency log preserves binding-separated sequences, avoids duplicate snapshots and reports gaps',()=>{
 const folder=fs.mkdtempSync(path.join(root,'log-original-')),file=path.join(folder,'events.jsonl'),log=createCacheResidencyLog01(file);
 log.append(snapshot([{sequence:1,action:'admit'},{sequence:2,action:'hit'}]));log.append(snapshot([{sequence:1},{sequence:2},{sequence:4,action:'evict'}]));log.append(snapshot([{sequence:1,action:'invalidate'}],2));
 const final=log.close(),rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);assert.equal(rows.length,4);assert.equal(final.snapshotGaps,1);assert.equal(rows.at(-1).sourceBindingEpoch,2);assert.equal(final.truncated,false);assert.throws(()=>log.append(snapshot([])),/Closed/);assert.throws(()=>createCacheResidencyLog01(file),/EEXIST/);
});
test('component and query sequences persist separately with adaptive witnesses under one byte bound',()=>{
 const folder=fs.mkdtempSync(path.join(root,'log-original-')),file=path.join(folder,'events.jsonl'),log=createCacheResidencyLog01(file);
 const value={...snapshot([{sequence:1,action:'hit'}]),components:{events:[{sequence:1,action:'admit'},{sequence:2,action:'remove'}]},adaptivePasses:[{radius:32,capacity:true}]};log.append(value);log.append(value);log.append({...value,components:{events:[{sequence:4,action:'hit'}]}});
 const final=log.close(),rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);assert.deepEqual(final.streams,{queries:1,components:3,adaptive:2});assert.equal(final.snapshotGaps,1);assert.equal(rows.length,6);assert.equal(rows[1].stream,'components');assert.deepEqual(rows[3].passes,value.adaptivePasses);
});
test('residency event and byte limits retain exact drop counts without overwriting earlier evidence',()=>{
 const folder=fs.mkdtempSync(path.join(root,'log-original-')),file=path.join(folder,'events.jsonl'),log=createCacheResidencyLog01(file,{maximumBytes:256,maximumEvents:1});log.append(snapshot([{sequence:1,action:'hit'},{sequence:2,action:'evict'}]));log.append(snapshot([{sequence:3,action:'miss'}]));const final=log.close();assert.equal(final.events,1);assert.equal(final.droppedEvents,2);assert(final.truncated);assert(final.bytes<=256);assert.equal(fs.statSync(file).size,final.bytes);
});
