// Independent original-only lifecycle/OS probes for the new XML process profile.
// No game resources, installed files, keys, endpoints or proprietary inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {prepareContainedXml05,runContainedXml05,xmlFixturePacket05} from '../tools/world05-contained.mjs';
import {originalCodeWalkerXml05} from './fixtures/CodeWalkerXml05.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const supervisor=process.env.RICHAUDIO_XML05_SUPERVISOR,runtimeExecutable=process.env.RICHAUDIO_XML05_RUNTIME;
assert.equal(process.platform,'win32');assert(supervisor&&runtimeExecutable,'Explicit fresh XML supervisor and public runtime are required');
const prepare=options=>prepareContainedXml05({supervisor,runtimeExecutable,packet:xmlFixturePacket05(originalCodeWalkerXml05('gen9-corner')),...options});
const receipt=run=>fs.readFile(path.join(run.root,'result/supervision.json'),'utf8').then(JSON.parse);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('cancellation after owned child publication terminates and joins its already resumed Job and profile',async()=>{
  const p=await prepare({probeSource:'setInterval(()=>{},50);'}),abort=new AbortController(),pending=runContainedXml05(p,{signal:abort.signal});
  const deadline=performance.now()+3000;
  while(true){try{await fs.access(path.join(p.root,'result/launch.json'));break;}catch(error){assert.equal(error.code,'ENOENT');assert(performance.now()<deadline,'Owned suspended-child publication deadline');await sleep(10);}}
  // Receipt.resumed below, rather than this scheduling delay, establishes that
  // cancellation actually reached a child after ResumeThread in this control.
  await sleep(200);abort.abort();const run=await pending,native=await receipt(run);
  assert.equal(run.state,'cancelled');assert.equal(run.supervisorJoined,true);assert.equal(run.workerJoined,true);assert.equal(native.resumed,true);
  assert.equal(native.cancelled,true);assert.equal(native.passed,false);assert.equal(native.atomicJobVerified,true);assert.equal(native.profileDeletionHRESULT,0);assert.equal(native.profileStorageAbsenceProven,false);
  console.log(JSON.stringify({kind:'OriginalXmlContainmentReview05',case:'post-resume-cancellation',root:p.root,workerJoined:true,profileDeletionHRESULT:native.profileDeletionHRESULT,storageAbsenceProven:false}));
});

test('independent native output cap terminates a noisy owned worker and preserves only bounded partial output',async()=>{
  const p=await prepare({probeSource:"for(;;)process.stdout.write('x'.repeat(4096));",maximumOutputBytes:1024}),run=await runContainedXml05(p),native=await receipt(run);
  assert.equal(run.state,'failed');assert.equal(run.supervisorJoined,true);assert.equal(run.workerJoined,true);assert.equal(native.passed,false);assert.match(native.error,/output|pipe/);assert.equal(native.profileDeletionHRESULT,0);
  const partial=await fs.readFile(path.join(p.root,'result/stdout.bin'));assert(partial.length<=1024);
  console.log(JSON.stringify({kind:'OriginalXmlContainmentReview05',case:'native-output-cap',root:p.root,workerJoined:true,partialBytes:partial.length,selectedCap:1024,profileDeletionHRESULT:native.profileDeletionHRESULT}));
});

test('OS-only original probe observes denied outside read/write and bounded owned loopback without Node permission flags',async()=>{
  const outside=await fs.mkdtemp(path.join(repo,'.local/world05-os-review-')),sentinel=path.join(outside,'original.txt'),writeTarget=path.join(outside,'must-not-create.txt');
  await fs.writeFile(sentinel,'wholly original OS containment probe',{flag:'wx'});
  let connections=0;const server=net.createServer(socket=>{connections++;socket.destroy();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const source=`import fs from 'node:fs/promises';import net from 'node:net';const r={};for(const [k,f]of[['read',()=>fs.readFile(${JSON.stringify(sentinel)})],['write',()=>fs.writeFile(${JSON.stringify(writeTarget)},'original',{flag:'wx'})]]){try{await f();r[k]='UNEXPECTED';}catch(e){r[k]=e.code;}}r.loopback=await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port:${server.address().port}});let settled=false;const done=v=>{if(!settled){settled=true;s.destroy();resolve(v);}};s.once('error',e=>done(e.code));s.once('connect',()=>done('UNEXPECTED'));s.setTimeout(400,()=>done('TIMEOUT'));});process.stdout.write(JSON.stringify(r));`;
    const p=await prepare({probeSource:source,nodePermissions:false}),run=await runContainedXml05(p),native=await receipt(run),output=JSON.parse(await fs.readFile(path.join(run.root,'result/stdout.bin'),'utf8'));
    assert.equal(run.state,'completed');assert.equal(run.workerJoined,true);assert.equal(native.nodePermissionRequested,false);assert.equal(native.appContainerVerified,true);assert.equal(native.zeroCapabilitiesVerified,true);assert.equal(native.atomicJobVerified,true);
    assert(['EPERM','EACCES'].includes(output.read));assert(['EPERM','EACCES'].includes(output.write));assert(['EPERM','EACCES','ETIMEDOUT','TIMEOUT'].includes(output.loopback));assert.equal(connections,0);await assert.rejects(fs.access(writeTarget),{code:'ENOENT'});
    assert.equal(await fs.readFile(sentinel,'utf8'),'wholly original OS containment probe');assert.equal(native.profileDeletionHRESULT,0);assert.equal(native.osFilesystemNetworkSandboxQualified,false);
    console.log(JSON.stringify({kind:'OriginalXmlContainmentReview05',case:'selected-os-only-probes',root:p.root,read:output.read,write:output.write,loopback:output.loopback,connections,profileDeletionHRESULT:native.profileDeletionHRESULT,blanketOsIsolationClaim:false}));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
