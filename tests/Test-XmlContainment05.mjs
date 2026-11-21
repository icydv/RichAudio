import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {prepareContainedXml05,runContainedXml05,xmlFixturePacket05} from '../tools/world05-contained.mjs';
import {originalCodeWalkerXml05} from './fixtures/CodeWalkerXml05.mjs';
const repo=path.resolve(new URL('../',import.meta.url).pathname.replace(/^\/(.:)/,'$1'));
const supervisor=process.env.RICHAUDIO_XML05_SUPERVISOR,runtimeExecutable=process.env.RICHAUDIO_XML05_RUNTIME;
assert.equal(process.platform,'win32','Explicit Windows containment runner');assert(supervisor&&runtimeExecutable,'Explicit freshly built XML supervisor and pinned public runtime required');
const packet=()=>xmlFixturePacket05(originalCodeWalkerXml05('gen9-corner'));
const prepare=options=>prepareContainedXml05({supervisor,runtimeExecutable,packet:packet(),...options});
const receipt=async run=>JSON.parse(await fs.readFile(path.join(run.root,'result/supervision.json'),'utf8'));
test('actual original XML decodes only inside the pinned AppContainer/permission/atomic Job profile',async()=>{
 const prepared=await prepare(),run=await runContainedXml05(prepared),native=await receipt(run);
 assert.equal(run.state,'completed');assert.equal(run.supervisorJoined,true);assert.equal(run.workerJoined,true);assert.equal(run.profileDeletionVerified,true);
 for(const key of ['appContainerVerified','zeroCapabilitiesVerified','atomicJobVerified','joined','nodePermissionRequested'])assert.equal(native[key],true);
 assert.equal(native.runtimeOnlyProfileRequested,false);assert.equal(native.osFilesystemNetworkSandboxQualified,false);assert.equal(native.profileScratchWritable,true);
 const output=JSON.parse(await fs.readFile(path.join(run.root,'result/stdout.bin'),'utf8'));
 assert.equal(output.passed,true);assert.equal(output.decoded.resources.length,3);assert.equal(output.decoded.genuineResourceVerified,false);assert.equal(output.decoded.installedResourceVerified,false);
 await assert.rejects(runContainedXml05(prepared),/already invoked/);
});
test('malformed XML rejection still joins and cleans the owned worker/profile without partial authority',async()=>{
 const p=packet(),malformed=Buffer.from('<!DOCTYPE CMapData><CMapData/>');p.request.resources[0].xml=malformed.toString('base64');p.request.resources[0].expectedSHA256=createHash('sha256').update(malformed).digest('hex');
 const prepared=await prepare({packet:p}),run=await runContainedXml05(prepared),native=await receipt(run);
 assert.equal(run.state,'failed');assert.equal(run.workerJoined,true);assert.equal(run.profileDeletionVerified,true);assert.equal(native.exitCode,1);
 assert.equal((await fs.readFile(path.join(run.root,'result/stdout.bin'))).length,0);
});
test('a drifted stage is rejected before resume and cannot be retried',async()=>{
 const p=await prepare();await fs.appendFile(path.join(p.stage,'codewalker-xml05.mjs'),'\n// original drift control\n');
 const run=await runContainedXml05(p);assert.equal(run.state,'failed');assert.equal(run.supervisorJoined,true);assert.equal(run.workerJoined,null);await assert.rejects(receipt(run),{code:'ENOENT'});
 await assert.rejects(runContainedXml05(p),/already invoked/);
});
test('prelaunch cancellation and unsupported weaker profiles do not start a parser',async()=>{
 const c=new AbortController();c.abort();const p=await prepare(),run=await runContainedXml05(p,{signal:c.signal});assert.equal(run.state,'cancelled-before-launch');assert.equal(run.workerJoined,null);
 await assert.rejects(prepare({containmentProfile:'node26-permission-job-only-xml-v1'}),/AppContainer/);
});
test('deadline termination retains a joined failed result, without a fallback profile',async()=>{
 const p=await prepare({probeSource:'while(true){}',timeoutMs:500}),run=await runContainedXml05(p),native=await receipt(run);
 assert.equal(run.state,'failed');assert.equal(run.workerJoined,true);assert.equal(native.passed,false);assert.match(native.error,/deadline/);assert.equal(native.profileDeletionHRESULT,0);
});
test('runtime permissions reject owned outside reads, writes, subprocesses, workers and owned loopback access',async()=>{
 const sentinel=path.join(repo,'.local','world05-owned-probe-'+Date.now()+'.txt');await fs.writeFile(sentinel,'original probe only',{flag:'wx'});
 let connections=0;const server=net.createServer(s=>{connections++;s.destroy();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
 const source=`import fs from 'node:fs/promises';import {spawn} from 'node:child_process';import {Worker} from 'node:worker_threads';import net from 'node:net';const r={};async function attempt(k,f){try{await f();r[k]='UNEXPECTED';}catch(e){r[k]=e.code;}}await attempt('read',()=>fs.readFile(${JSON.stringify(sentinel)}));await attempt('write',()=>fs.writeFile(new URL('./forbidden.txt',import.meta.url),'x'));await attempt('spawn',()=>spawn(process.execPath,['-e','']));await attempt('worker',()=>new Worker('0',{eval:true}));await attempt('network',()=>new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port:${server.address().port}});s.once('error',reject);s.once('connect',()=>{s.destroy();resolve();});}));process.stdout.write(JSON.stringify(r));`;
 const p=await prepare({probeSource:source}),run=await runContainedXml05(p);assert.equal(run.state,'completed');const output=JSON.parse(await fs.readFile(path.join(run.root,'result/stdout.bin'),'utf8'));
 assert.deepEqual(Object.values(output),Array(5).fill('ERR_ACCESS_DENIED'));assert.equal(connections,0);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
