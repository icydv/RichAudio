import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {byteDigest} from '../src/acoustics/world/contracts.mjs';
import {prepareProviderProcess08,runProviderProcess08,verifyProviderRun08,isProviderRun08} from '../src/acoustics/world/provider-supervisor08.mjs';

// Explicit fresh original-only build/fixture inputs from the offline test runner.
// No installation discovery, archive search or implicit executable fallback.
const packageRoot=process.env.RICHAUDIO_PROVIDER08_PACKAGE,fixtureRoot=process.env.RICHAUDIO_PROVIDER08_FIXTURES;
const native=process.platform==='win32'&&packageRoot&&fixtureRoot;
const repo=fileURLToPath(new URL('../',import.meta.url));
async function originalRoots(){for(const root of [packageRoot,fixtureRoot]){assert.ok(path.resolve(root).startsWith(path.join(repo,'.local')+path.sep),'Explicit current-checkout original-only test roots required');for(let at=path.resolve(root);;at=path.dirname(at)){assert.equal((await fs.lstat(at)).isSymbolicLink(),false);if(at===path.dirname(at))break;}}}
async function fixture(name='original.rpf'){
 await originalRoots();
 const bytes=await fs.readFile(path.join(fixtureRoot,name)),p=JSON.parse(await fs.readFile(path.join(packageRoot,'provider-package08.json'),'utf8'));
 return {bytes,request:{schema:1,kind:'RichAudioCodeWalkerRequest08',gen9:true,parserSHA256:p.parserSHA256,sourceAuthority:'original-authored-fixture',archives:[{id:'original',file:'input/original.rpf',logicalArchive:'original/base.rpf',archiveName:'base.rpf',mount:'base',order:0,bytes:bytes.length,sha256:byteDigest(bytes),hashMode:'full-fixture'}],maximumResources:128,capability:null}};
}
const prepare=async(options={})=>{const f=await fixture(options.fixture);return prepareProviderProcess08({packageRoot,request:f.request,inputs:[{path:'input/original.rpf',bytes:f.bytes}],...options});};
function stopped(pid){if(!pid)return;assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');}

test('provider run authority requires a successful joined in-process brand',()=>{
 assert.equal(isProviderRun08({state:'completed',workerJoined:true}),false);
 assert.throws(()=>verifyProviderRun08({state:'completed'}),/branded successful joined/);
});

test('actual Core worker decodes original archive under fixed AppContainer/Job and source closure',{skip:!native},async()=>{
 const prepared=await prepare(),progress=[],result=await runProviderProcess08(prepared,{onProgress:p=>progress.push(p)});
 assert.equal(result.state,'completed',JSON.stringify(result.receipt??result.supervisorStderr));assert.equal(result.workerResult.resources.length,3);
 assert.equal(result.receipt.atomicJobVerified,true);assert.equal(result.receipt.zeroCapabilitiesVerified,true);assert.equal(result.receipt.profileScratchWritesDenied,true);assert.equal(result.receipt.profileDeletionHRESULT,0);
 assert.equal(result.receipt.sourceBindings.length,1);assert.equal(result.receipt.sourceBindings[0].identityUnchanged,true);assert.ok(progress.length>0);assert.ok(progress.every(p=>p.total===null||p.completed<=p.total));
 assert.equal(result.workerResult.sources[0].identity.kind,'inherited-readonly-handle','staged originals use the same pinned handle route as direct sources');
 const trusted=verifyProviderRun08(result);assert.equal(trusted.request.sourceAuthority,'original-authored-fixture');assert.equal(trusted.request.archives[0].sha256,result.receipt.sourceBindings[0].fullSHA256);assert.equal(trusted.installationAccessAuthenticated,false);
 stopped(result.pid);stopped(result.receipt.processId);await assert.rejects(runProviderProcess08(prepared),/single-use/);
});

test('inherited read-only source is range decoded without a full source hash and preserves source identity',{skip:!native},async()=>{
 const f=await fixture(),file=path.join(fixtureRoot,'original.rpf'),before=await fs.stat(file);delete f.request.archives[0].file;Object.assign(f.request.archives[0],{handleId:'original',sha256:null,hashMode:'ranges'});
 const prepared=await prepareProviderProcess08({packageRoot,request:f.request,directSources:[{id:'original',path:file,bytes:f.bytes.length,headerSHA256:byteDigest(f.bytes.subarray(0,16)),identity:null}]}),result=await runProviderProcess08(prepared);
 assert.equal(result.state,'completed',JSON.stringify(result.receipt));assert.equal(result.receipt.sourceBindings[0].mode,'direct-readonly');assert.equal(result.receipt.sourceBindings[0].fullSHA256,null);assert.equal(result.receipt.preflightSourceHeaderBytes,16);
 assert.equal(result.workerResult.resources.length,3);assert.ok(result.workerResult.resources.every(r=>r.source.archiveSHA256===null));assert.ok(result.workerResult.stats.sourceReadBytes<65536);
 const after=await fs.stat(file);assert.equal(after.ino,before.ino);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(after.mode,before.mode);stopped(result.receipt.processId);
 // A separately supplied wrong identity fails before any decoder process.
 const own=result.receipt.sourceBindings[0],identity={volumeSerial:own.volumeSerial,fileIndexHigh:own.fileIndexHigh,fileIndexLow:(own.fileIndexLow+1)>>>0,lastWriteHigh:own.lastWriteHigh,lastWriteLow:own.lastWriteLow};
 const rejected=await prepareProviderProcess08({packageRoot,request:f.request,directSources:[{id:'original',path:file,bytes:f.bytes.length,headerSHA256:byteDigest(f.bytes.subarray(0,16)),identity}]}),bad=await runProviderProcess08(rejected);assert.equal(bad.state,'failed');assert.equal(isProviderRun08(bad),false);assert.match(bad.supervisorStderr,/source identity mismatch/);
});

test('large sparse original archive stays range-bound and needs no whole-archive staging or hash',{skip:!native},async()=>{
 const f=await fixture(),file=path.join(fixtureRoot,'sparse-original.rpf'),stat=await fs.stat(file);assert.equal(stat.size,3000000073);delete f.request.archives[0].file;Object.assign(f.request.archives[0],{handleId:'original',bytes:stat.size,sha256:null,hashMode:'ranges'});
 const prepared=await prepareProviderProcess08({packageRoot,request:f.request,directSources:[{id:'original',path:file,bytes:stat.size,headerSHA256:byteDigest(f.bytes.subarray(0,16)),identity:null}]}),result=await runProviderProcess08(prepared);
 assert.equal(result.state,'completed',JSON.stringify(result.receipt));assert.equal(result.workerResult.resources.length,3);assert.equal(result.receipt.sourceBindings[0].bytes,3000000073);assert.equal(result.receipt.sourceBindings[0].fullSHA256,null);assert.ok(result.workerResult.stats.sourceReadBytes<65536);assert.equal(result.receipt.preflightSourceHeaderBytes,16);stopped(result.receipt.processId);
});

test('pre-abort consumes preparation without starting a worker and rejects reuse',{skip:!native},async()=>{
 const prepared=await prepare(),controller=new AbortController();controller.abort();const result=await runProviderProcess08(prepared,{signal:controller.signal});assert.equal(result.state,'cancelled-before-launch');assert.equal(result.workerJoined,null);assert.equal(isProviderRun08(result),false);await assert.rejects(fs.stat(path.join(prepared.root,'consumed')),error=>error.code==='ENOENT');await assert.rejects(runProviderProcess08(prepared),/single-use/);
});

test('manifest/runtime/configuration drift cannot publish a qualified worker result',{skip:!native},async()=>{
 const config=await prepare();await fs.writeFile(path.join(config.stage,'provider-worker08.exe.config'),'<configuration/>',{flag:'wx'});const a=await runProviderProcess08(config);assert.equal(a.state,'failed');assert.equal(isProviderRun08(a),false);assert.match(a.supervisorStderr,/configuration refused/);
 const runtime=await prepare(),dll=path.join(runtime.stage,'SharpDX.dll'),bytes=await fs.readFile(dll);bytes[bytes.length-1]^=1;await fs.writeFile(dll,bytes);const b=await runProviderProcess08(runtime);assert.equal(b.state,'failed');assert.match(b.supervisorStderr,/digest mismatch/);assert.equal(isProviderRun08(b),false);
 const manifest=await prepare();await fs.appendFile(manifest.manifestPath,' ');await assert.rejects(runProviderProcess08(manifest),/manifest drift/);
});

test('post-worker output and receipt substitutions fail the native pipe bindings',{skip:!native},async()=>{
 for(const name of ['stdout.bin','supervision.json']){
  const prepared=await prepare(),target=path.join(prepared.root,'result',name),original=fs.lstat;let replaced=false,workerPid;
  // Inject a valid JSON replacement exactly when the parent begins its read.
  // This is an adversarial filesystem control, never a production decoder hook.
  fs.lstat=async function(file,...args){if(path.resolve(file)===target&&!replaced){replaced=true;const value=JSON.parse(await fs.readFile(target,'utf8'));if(name==='supervision.json'){workerPid=value.processId;value.elapsedMs=0;}else value.state='substituted-control-output';await fs.writeFile(target,JSON.stringify(value));}return original.call(this,file,...args);};
  let result;try{result=await runProviderProcess08(prepared);}finally{fs.lstat=original;}
  assert.equal(replaced,true);assert.equal(result.state,'failed');assert.equal(result.workerResult,null);assert.equal(isProviderRun08(result),false);stopped(workerPid??result.receipt?.processId);
 }
});

test('native deadline/output limits preserve bounded failure output and join worker',{skip:!native},async()=>{
 for(const options of [{timeoutMs:1},{maximumOutputBytes:1024}]){const result=await runProviderProcess08(await prepare(options));assert.equal(result.state,'failed');assert.equal(result.supervisorJoined,true);assert.equal(result.workerJoined,true);assert.equal(result.workerResult,null);assert.equal(isProviderRun08(result),false);assert.ok(result.receipt);assert.ok((await fs.stat(path.join(result.root,'result/stdout.bin'))).size<=options.maximumOutputBytes||options.maximumOutputBytes===undefined);stopped(result.receipt.processId);}
});

test('live progress cancellation withdraws publication and joins the contained worker',{skip:!native},async()=>{
 const controller=new AbortController(),result=await runProviderProcess08(await prepare(),{signal:controller.signal,onProgress:()=>controller.abort()});assert.equal(result.state,'cancelled');assert.equal(result.supervisorJoined,true);assert.equal(result.workerJoined,true);assert.equal(isProviderRun08(result),false);stopped(result.receipt.processId);
});

test('explicit source input closure rejects extra buffers and accessors before reading them',{skip:!native},async()=>{
 const f=await fixture();let reads=0;const extra={path:'input/undeclared.rpf',get bytes(){reads++;throw Error('accessed');}};
 await assert.rejects(prepareProviderProcess08({packageRoot,request:f.request,inputs:[{path:'input/original.rpf',bytes:f.bytes},extra]}),/data properties/);assert.equal(reads,0);
 await assert.rejects(prepareProviderProcess08({packageRoot,request:f.request,inputs:[{path:'input/original.rpf',bytes:f.bytes},{path:'input/undeclared.rpf',bytes:f.bytes}]}),/input closure/);
});
