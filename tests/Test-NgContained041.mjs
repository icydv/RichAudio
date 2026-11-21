// Trusted original JS/data in a separately supervised process. No game input.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import net from 'node:net';import {setTimeout as delay} from 'node:timers/promises';
import {originalNgMetadata041} from './fixtures/NgMetadata041.mjs';
import {decodeNgMetadata041} from '../src/acoustics/world/ng-metadata041.mjs';
import {ngFixturePacket041,prepareContainedNg041,runContainedNg041} from '../tools/world041-contained.mjs';
import {createRuntimeCleanup13} from '../tools/runtime-cleanup13.mjs';
const supervisor=process.env.RICHAUDIO_NG041_SUPERVISOR,runtimeExecutable=process.env.RICHAUDIO_NG041_RUNTIME;
if(!supervisor||!runtimeExecutable)throw Error('Run tools/Test-NgContainment041.ps1 with fresh synthetic build/runtime');
const cleanup=await createRuntimeCleanup13({helper:process.env.RICHAUDIO_CLEANUP13_HELPER});
const fixture=()=>originalNgMetadata041();
const prepare=async options=>cleanup.registerPreparedCopy(await prepareContainedNg041({supervisor,runtimeExecutable,packet:ngFixturePacket041(fixture()),...options}));
async function receipt(p){return JSON.parse(await fs.readFile(path.join(p.root,'result/supervision.json'),'utf8'));}
async function output(p){return JSON.parse(await fs.readFile(path.join(p.root,'result/stdout.bin'),'utf8'));}
function joined(r){assert.equal(r.joined,true);assert.equal(r.installedArchiveRead,false);assert.equal(r.realKeyMaterialRead,false);assert.equal(r.audioEndpointOpened,false);assert.equal(r.atomicJobVerified,true);assert.equal(r.appContainerVerified,true);assert.equal(r.zeroCapabilitiesVerified,true);assert.equal(r.runtimeOnlyProfileRequested,false);assert.equal(typeof r.nodePermissionRequested,'boolean');assert.equal(r.profileDeletionHRESULT,0);}
async function discardRuntimeCopy(p,result=null){
 let execution;if(result){const r=await receipt(p);assert.equal(r.manifestSHA256,p.manifestSHA256);assert.equal(r.supervisorProcessId,result.pid);execution={supervisorJoined:result.supervisorJoined,workerJoined:result.workerJoined===true&&r.joined===true,profileDeletionVerified:result.profileDeletionVerified===true&&r.profileDeletionHRESULT===0};}
 const cleanupResult=await cleanup(p,{execution});assert.equal(cleanupResult.absenceVerified,true);assert.notEqual(cleanupResult.outcome,'failed');
}

test('contained NG table/name decoder matches in-process fixtures under actual zero-capability AppContainer and atomic Job',async()=>{
 const p=await prepare(),result=await runContainedNg041(p),r=await receipt(p);joined(r);assert.equal(result.supervisorJoined,true);assert.equal(result.workerJoined,true);assert.equal(result.profileDeletionVerified,true);assert.equal(result.state,'completed',result.stderr);assert.equal(r.exitCode,0);const actual=await output(p),f=fixture();assert.equal(actual.passed,true);assert.deepEqual(actual.result,decodeNgMetadata041({archive:f.archive,archiveName:f.archiveName,archiveBytes:f.archiveBytes,header:f.header,table:f.table,profile:f.profile,expected:f.expected}));assert.equal(actual.result.enhancedCompatibilityVerified,false);await discardRuntimeCopy(p,result);
});

test('control preparation binds the native helper and refuses forged records, changed helpers and oversized manifests before launch',async()=>{
 const helperRoot=await fs.mkdtemp(path.resolve('.local/world041-helper-binding-')),helper=path.join(helperRoot,'world041-contained.exe');
 await fs.copyFile(supervisor,helper);await fs.copyFile(path.join(path.dirname(supervisor),'build.json'),path.join(helperRoot,'build.json'));
 const p=await prepare({supervisor:helper});await assert.rejects(runContainedNg041({...p}),/branded/);
 await fs.appendFile(helper,Buffer.from([0]));await assert.rejects(runContainedNg041(p),/drift/);await assert.rejects(fs.access(path.join(p.root,'result')));await discardRuntimeCopy(p);
 const large=await prepare();await fs.appendFile(large.manifestPath,Buffer.alloc(65537));await assert.rejects(runContainedNg041(large),/bounded single-link/);await assert.rejects(fs.access(path.join(large.root,'result')));await discardRuntimeCopy(large);
});

test('OS-only probes deny private reads/writes, reject child creation and observe no bounded loopback connection',async()=>{
 const outside=path.resolve('.local/world041-outside-original-sentinel.txt');await fs.writeFile(outside,'original nonsecret denial sentinel',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 let connections=0;const server=net.createServer(socket=>{connections++;socket.destroy();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const source=`import fs from 'node:fs';import net from 'node:net';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
 const errors={};try{fs.readFileSync(${JSON.stringify(outside)});errors.read='ALLOWED';}catch(e){errors.read=e.code;}
 try{fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'forbidden.txt'),'original');errors.write='ALLOWED';}catch(e){errors.write=e.code;}
 errors.spawn=await new Promise(resolve=>{try{const child=spawn(process.execPath,['--version'],{windowsHide:true,stdio:'ignore'});child.once('error',e=>resolve({spawned:false,code:e.code,errno:e.errno}));child.once('spawn',()=>{child.kill();resolve({spawned:true})});setTimeout(()=>{child.kill();resolve({timedOut:true})},500).unref()}catch(e){resolve({spawned:false,code:e.code,errno:e.errno})}});
 const socket=net.createConnection({host:'127.0.0.1',port:${server.address().port}});errors.net=await new Promise(resolve=>{socket.once('error',e=>resolve(e.code));socket.once('connect',()=>{socket.destroy();resolve('ALLOWED')});setTimeout(()=>{socket.destroy();resolve('TIMEOUT')},500).unref()});console.log(JSON.stringify(errors));`;
 try{const p=await prepare({probeSource:source,nodePermissions:false}),result=await runContainedNg041(p),r=await receipt(p);joined(r);assert.equal(result.state,'completed',result.stderr);const actual=await output(p);for(const operation of ['read','write'])assert(['EPERM','EACCES'].includes(actual[operation]),operation+': '+actual[operation]);assert.equal(actual.spawn.spawned,false);assert.equal(typeof actual.spawn.code,'string');assert.equal(actual.spawn.timedOut,undefined);assert(['EPERM','EACCES','ETIMEDOUT','TIMEOUT'].includes(actual.net),'bounded network outcome: '+actual.net);assert.equal(connections,0);await discardRuntimeCopy(p,result);}
 finally{await new Promise(resolve=>server.close(resolve));}
});

test('runtime permissions independently deny API reads/writes/network/spawn/workers',async()=>{
 const outside=path.resolve('.local/world041-outside-original-sentinel.txt');
 const source=`import fs from 'node:fs';import net from 'node:net';import {spawnSync} from 'node:child_process';import {Worker} from 'node:worker_threads';const errors={};
 for(const [name,fn]of Object.entries({read:()=>fs.readFileSync(${JSON.stringify(outside)}),write:()=>fs.writeFileSync('forbidden.txt','original'),spawn:()=>spawnSync(process.execPath,['--version']),worker:()=>new Worker('0',{eval:true})})){try{const result=fn();errors[name]=result?.error?.code??'ALLOWED'}catch(e){errors[name]=e.code}}
 errors.net=await new Promise(resolve=>{try{const socket=net.createConnection({host:'127.0.0.1',port:9});socket.once('error',e=>resolve(e.code));socket.once('connect',()=>{socket.destroy();resolve('ALLOWED')});setTimeout(()=>{socket.destroy();resolve('TIMEOUT')},500).unref()}catch(e){resolve(e.code)}});console.log(JSON.stringify(errors));`;
 const p=await prepare({probeSource:source}),result=await runContainedNg041(p),r=await receipt(p);joined(r);assert.equal(result.state,'completed',result.stderr);for(const [operation,code]of Object.entries(await output(p)))assert.equal(code,'ERR_ACCESS_DENIED',operation);await discardRuntimeCopy(p,result);
});

test('independent deadline kills and joins a busy contained worker',async()=>{
 const p=await prepare({probeSource:'for(;;){}',timeoutMs:500}),result=await runContainedNg041(p),r=await receipt(p);joined(r);assert.equal(result.state,'failed');assert.match(r.error,/deadline/);assert.notEqual(r.exitCode,0);await discardRuntimeCopy(p,result);
});

test('output limits terminate a noisy worker and retain supervision',async()=>{
 const p=await prepare({probeSource:"for(;;)process.stdout.write('x'.repeat(4096));",maximumOutputBytes:1024}),result=await runContainedNg041(p),r=await receipt(p);joined(r);assert.equal(result.state,'failed');assert.match(r.error,/output|pipe/);await discardRuntimeCopy(p,result);
});

test('cancellation after exact suspended-child publication joins cleanup and preserves profile deletion',async()=>{
 const p=await prepare({probeSource:'setInterval(()=>{},50);'}),aborter=new AbortController(),pending=runContainedNg041(p,{signal:aborter.signal});
 const deadline=performance.now()+5000;while(performance.now()<deadline){try{await fs.access(path.join(p.root,'result/launch.json'));break;}catch{await delay(10);}}
 await fs.access(path.join(p.root,'result/launch.json'));aborter.abort();const result=await pending,r=await receipt(p);joined(r);assert.equal(result.state,'cancelled');assert.equal(r.cancelled,true);await discardRuntimeCopy(p,result);
});
