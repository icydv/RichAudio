// Explicit offline staging/control process. Never reads an installation or keys.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {canonical,byteDigest,fields,requireWorld} from '../src/acoustics/world/contracts.mjs';
const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const abortGetter=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
const files=Object.freeze({'ng-worker041.mjs':'tools/world041-ng-worker.mjs','ng-cipher041.mjs':'src/acoustics/world/ng-cipher041.mjs','ng-metadata041.mjs':'src/acoustics/world/ng-metadata041.mjs','contracts.mjs':'src/acoustics/world/contracts.mjs'});
const preparations=new WeakSet(),invocations=new WeakSet();
async function noLinks(file){for(let at=path.resolve(file);;at=path.dirname(at)){const info=await fs.lstat(at);requireWorld(!info.isSymbolicLink(),'no linked contained-process path');if(at===path.dirname(at))break;}}
// Trusted control-process preparation only. The native worker boundary repeats
// closure checks using held no-follow Windows handles before resume.
async function boundedRead(file,maximum){
 await noLinks(file);const handle=await fs.open(file,'r');try{
  const before=await handle.stat();requireWorld(before.isFile()&&before.nlink===1&&before.size>0&&before.size<=maximum,'bounded single-link control artifact');
  const bytes=Buffer.alloc(before.size),read=await handle.read(bytes,0,bytes.length,0),after=await handle.stat(),current=await fs.lstat(file);
  requireWorld(read.bytesRead===bytes.length&&!current.isSymbolicLink()&&current.ino===before.ino&&current.dev===before.dev&&current.size===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs,'control artifact changed during bounded read');await noLinks(file);return bytes;
 }finally{await handle.close();}
}
async function noConfiguration(supervisor){try{await fs.lstat(supervisor+'.config');}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error('Unreviewed supervisor executable configuration refused');}
export function ngFixturePacket041(fixture){
 const {material}=fixture;requireWorld(material?.authority==='original-synthetic-key-material','original synthetic material only');
 return {schema:1,kind:'original-synthetic-ng-process041',request:{archive:fixture.archive,archiveName:fixture.archiveName,archiveBytes:fixture.archiveBytes,header:fixture.header.toString('base64'),table:fixture.table.toString('base64'),expected:fixture.expected,material:{...material,expandedKeys:material.expandedKeys.toString('base64'),tables:material.tables.toString('base64'),hashLut:material.hashLut.toString('base64')}}};
}
export async function prepareContainedNg041({supervisor,runtimeExecutable,packet,timeoutMs=5000,maximumOutputBytes=1048576,probeSource=null,nodePermissions=true,containmentProfile='appcontainer-zero-capabilities-node-permission-scratch-v1',probeArguments=[]}={}){
 requireWorld(typeof supervisor==='string'&&Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=5000&&Number.isInteger(maximumOutputBytes)&&maximumOutputBytes>=1024&&maximumOutputBytes<=1048576,'explicit bounded supervisor configuration');
 requireWorld(probeSource===null||typeof probeSource==='string'&&Buffer.byteLength(probeSource)<=8192,'bounded original containment probe');
 requireWorld(typeof runtimeExecutable==='string'&&probeArguments.length===0&&['appcontainer-zero-capabilities-node-permission-scratch-v1','lpac-zero-capabilities-v1','node26-permission-job-only-synthetic-v1'].includes(containmentProfile),'explicit pinned runtime and containment profile required');
 requireWorld(nodePermissions===true||probeSource!==null&&containmentProfile!=='node26-permission-job-only-synthetic-v1','parser runtime permissions required; OS-only probes are explicit');
 fields(packet,['schema','kind','request']);requireWorld(packet.schema===1&&packet.kind==='original-synthetic-ng-process041','synthetic-only process input');
 const input=Buffer.from(canonical(packet));requireWorld(input.length<=8388608,'bounded contained stdin');
 const local=path.join(repo,'.local');await fs.mkdir(local,{recursive:true});await noLinks(local);
 await noConfiguration(supervisor);const helperBytes=await boundedRead(supervisor,134217728),buildPath=path.join(path.dirname(supervisor),'build.json'),buildBytes=await boundedRead(buildPath,4096),build=JSON.parse(buildBytes.toString('utf8'));
 requireWorld(build.kind==='World041SyntheticContainedSupervisorBuild'&&build.syntheticOnly===true&&build.exeSHA256===byteDigest(helperBytes)&&build.sourceSHA256===byteDigest(await boundedRead(path.join(repo,'tools/world041-contained-process.cs'),131072)),'reviewed synthetic supervisor source/build/executable binding required');
 const root=await fs.mkdtemp(path.join(local,'world041-contained-')),stage=path.join(root,'stage');await fs.mkdir(stage);
 const pins=[];for(const [target,source]of Object.entries(files)){const data=await boundedRead(path.join(repo,source),131072);await fs.writeFile(path.join(stage,target),data,{flag:'wx'});pins.push({path:target,sha256:byteDigest(data)});}
 const runtimeReceiptPath=path.join(path.dirname(runtimeExecutable),'runtime.json'),runtimeReceiptBytes=await boundedRead(runtimeReceiptPath,4096),runtimeReceipt=JSON.parse(runtimeReceiptBytes.toString('utf8'));
 const executable=await boundedRead(runtimeExecutable,134217728);requireWorld(runtimeReceipt.kind==='World041PublicNodeRuntime'&&runtimeReceipt.version==='v26.13.0'&&runtimeReceipt.archiveSHA256==='dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a'&&runtimeReceipt.runtimeSHA256===byteDigest(executable),'hash-pinned public Node26 runtime');await fs.writeFile(path.join(stage,'node.exe'),executable,{flag:'wx'});pins.push({path:'node.exe',sha256:byteDigest(executable)});
 let script=path.join(stage,'ng-worker041.mjs');if(probeSource!==null){script=path.join(stage,'ng-probe041.mjs');await fs.writeFile(script,probeSource,{flag:'wx'});pins.push({path:'ng-probe041.mjs',sha256:byteDigest(Buffer.from(probeSource))});}
 const stdinFile=path.join(root,'input.bin');await fs.writeFile(stdinFile,input,{flag:'wx'});
 const args=['--max-old-space-size=64','--preserve-symlinks','--preserve-symlinks-main',...(nodePermissions?['--permission','--allow-fs-read='+stage]:[]),'--no-addons','--disable-proto=throw',script];
 const manifest={kind:'World041SyntheticContainedProcess',profile:containmentProfile,nodeMajor:26,mode:probeSource===null?'synthetic-parser':nodePermissions?'synthetic-runtime-probe':'synthetic-os-probe',stage,executable:'node.exe',arguments:args,files:pins,stdinFile,stdinSHA256:byteDigest(input),stdinBytes:input.length,outputDirectory:path.join(root,'result'),memoryBytes:268435456,timeoutMs,maximumOutputBytes};
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),manifestPath=path.join(root,'manifest.json');await fs.writeFile(manifestPath,bytes,{flag:'wx'});
 const prepared=Object.freeze({root,stage,manifestPath,manifestSHA256:byteDigest(bytes),supervisor:path.resolve(supervisor),supervisorSHA256:byteDigest(helperBytes),buildPath,buildSHA256:byteDigest(buildBytes),runtimeReceiptPath,runtimeReceiptSHA256:byteDigest(runtimeReceiptBytes),nodeSHA256:byteDigest(executable),timeoutMs});preparations.add(prepared);return prepared;
}
export async function runContainedNg041(prepared,{signal}={}){
 if(signal!==undefined){try{abortGetter.call(signal);}catch{throw Error('Native AbortSignal required');}}
 requireWorld(preparations.has(prepared),'branded prepared synthetic process');
 requireWorld(!invocations.has(prepared),'synthetic preparation already invoked');invocations.add(prepared);
 requireWorld(byteDigest(await boundedRead(prepared.manifestPath,65536))===prepared.manifestSHA256,'contained manifest drift');
 requireWorld(byteDigest(await boundedRead(prepared.supervisor,134217728))===prepared.supervisorSHA256&&byteDigest(await boundedRead(prepared.buildPath,4096))===prepared.buildSHA256&&byteDigest(await boundedRead(prepared.runtimeReceiptPath,4096))===prepared.runtimeReceiptSHA256,'contained supervisor/build/runtime receipt drift');
 await noConfiguration(prepared.supervisor);
 if(signal&&abortGetter.call(signal))return {state:'cancelled-before-launch',supervisorJoined:true,workerJoined:null,profileDeletionVerified:false,root:prepared.root};
 const child=spawn(prepared.supervisor,[prepared.manifestPath,prepared.manifestSHA256],{stdio:['ignore','pipe','pipe'],windowsHide:true,env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,LOCALAPPDATA:process.env.LOCALAPPDATA}});
 let stdout='',stderr='',cancelled=false,timedOut=false,overflow=false;
 const stop=()=>{cancelled=true;void fs.writeFile(path.join(prepared.root,'cancel.request'),'cancel',{flag:'wx'}).catch(()=>{});};if(signal)signal.addEventListener('abort',stop,{once:true});
 const timer=setTimeout(()=>{timedOut=true;child.kill();},prepared.timeoutMs+10000);
 child.stdout.on('data',b=>{if(Buffer.byteLength(stdout)+b.length>16384){overflow=true;child.kill();}else stdout+=b.toString('utf8');});
 child.stderr.on('data',b=>{if(Buffer.byteLength(stderr)+b.length>16384){overflow=true;child.kill();}else stderr+=b.toString('utf8');});
 if(signal&&abortGetter.call(signal))stop();
 const outcome=await new Promise(resolve=>{let error;child.once('error',e=>{error=e.message;});child.once('close',(code,killedSignal)=>resolve({code,killedSignal,error}));});
 clearTimeout(timer);if(signal)signal.removeEventListener('abort',stop);
 let nativeReceipt=null;try{nativeReceipt=JSON.parse((await boundedRead(path.join(prepared.root,'result/supervision.json'),65536)).toString('utf8'));requireWorld(nativeReceipt.kind==='World041SyntheticContainedProcessResult'&&nativeReceipt.manifestSHA256===prepared.manifestSHA256&&nativeReceipt.supervisorProcessId===child.pid,'exact native supervision receipt');}catch{nativeReceipt=null;}
 const completed=outcome.code===0&&nativeReceipt?.passed===true&&nativeReceipt.joined===true;
 return {state:cancelled?'cancelled':timedOut?'outer-timeout':overflow?'supervisor-output-limit':completed?'completed':'failed',supervisorJoined:true,workerJoined:nativeReceipt?.joined??null,profileDeletionVerified:nativeReceipt?.profileDeletionHRESULT===0,root:prepared.root,pid:child.pid,stdout,stderr,...outcome};
}
