// Original native process/protocol fixtures only. No Direct3D device, GPU kernel,
// audio endpoint, installed asset or game process is created by this suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {AcousticGpuClient} from '../src/acoustics/gpu/client.mjs';
import {AcousticAcceleration} from '../src/acoustics/streaming/acoustic-backend.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const source=`using System;using System.IO;using System.Diagnostics;
public static class ReadinessFixture13 {
 public static int Main(){
  string executable=Environment.GetCommandLineArgs()[0],mode=Path.GetFileNameWithoutExtension(executable),directory=Path.GetDirectoryName(executable);
  File.WriteAllText(Path.Combine(directory,mode+".entered"),Process.GetCurrentProcess().Id.ToString());
  var input=Console.OpenStandardInput();
  if(mode.StartsWith("hold-capability")){while(input.ReadByte()!=-1){}return 0;}
  bool dispatch=mode.StartsWith("hold-dispatch");
  string capability=dispatch?"{'schemaVersion':1,'supported':true,'hardware':true,'api':'Direct3D11-ComputeShader5','device':'ORIGINAL PROTOCOL FIXTURE NO GPU','maximumSegments':4096,'maximumSurfaces':128}":"{'schemaVersion':1,'supported':false,'hardware':false,'reason':'original readiness process fixture, no GPU'}";
  capability=capability.Replace((char)39,(char)34);
  byte[] bytes=System.Text.Encoding.UTF8.GetBytes(capability);var output=Console.OpenStandardOutput();output.Write(BitConverter.GetBytes(bytes.Length),0,4);output.Write(bytes,0,bytes.Length);output.Flush();
  if(dispatch){var header=new byte[32];int at=0;while(at<header.Length){int n=input.Read(header,at,header.Length-at);if(n==0)return 0;at+=n;}File.WriteAllText(Path.Combine(directory,mode+".request"),"original bounded request received");}
  while(input.ReadByte()!=-1){}return mode.StartsWith("natural-exit")?7:0;
 }
}`;
let fixtureRoot;
async function helper(mode){
 if(!fixtureRoot){
  fixtureRoot=await fs.mkdtemp(path.join(repo,'.local/gpu-readiness13-'));const sourceFile=path.join(fixtureRoot,'ReadinessFixture13.cs'),executable=path.join(fixtureRoot,'readiness-fixture.exe');await fs.writeFile(sourceFile,source,{flag:'wx'});
  const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  try{const log=execFileSync(compiler,['/nologo','/optimize+','/platform:x64','/target:exe','/out:'+executable,sourceFile],{windowsHide:true,timeout:10000,maxBuffer:65536});await fs.writeFile(path.join(fixtureRoot,'compile.log'),log,{flag:'wx'});}catch(error){await fs.writeFile(path.join(fixtureRoot,'compile-failed.log'),Buffer.concat([error.stdout??Buffer.alloc(0),error.stderr??Buffer.alloc(0)]),{flag:'wx'});throw error;}
 }
 const executable=path.join(fixtureRoot,mode+'.exe');await fs.copyFile(path.join(fixtureRoot,'readiness-fixture.exe'),executable);return executable;
}
async function observedMarker(executable,suffix='entered'){
 const file=executable.replace(/\.exe$/,'.'+suffix),deadline=performance.now()+3000;
 while(performance.now()<deadline){try{return await fs.readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}await delay(5);}
 throw Error('Original readiness fixture marker not observed: '+suffix);
}
function actualClose(child){return new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));}
async function retainObservation(mode,value){const bytes=Buffer.from(JSON.stringify({kind:'World13OriginalGpuReadinessObservation',controller:process.version,fixtureMode:mode,graphicsApiCalledByFixture:false,hardwareExecutionProved:false,...value})+'\n');assert(bytes.length<=8192);await fs.writeFile(path.join(fixtureRoot,mode+'.json'),bytes,{flag:'wx'});}
const windows={skip:process.platform!=='win32',timeout:10000};
test('closing during pending capability settles it once and retains actual helper close',windows,async()=>{
 const executable=await helper('hold-capability-close'),client=new AcousticGpuClient({executable}),pending=client.capability(),child=client.child,closed=actualClose(child);let settlements=0;pending.then(()=>settlements++);
 try{
  assert.equal(Number(await observedMarker(executable)),child.pid);client.close();client.close();
  const outcome=await Promise.race([pending.then(value=>({settled:true,value})),delay(250).then(()=>({settled:false}))]);assert.equal(outcome.settled,true,'close left the capability promise unresolved');assert.equal(outcome.value.supported,false);assert.equal(outcome.value.hardware,false);assert.match(outcome.value.reason,/closed/);assert.equal(settlements,1);assert.equal(client.resolveCapability,null);assert.equal(client.stats.completed,0);assert.equal(client.pending,null);
  const late=Buffer.from(JSON.stringify({schemaVersion:1,supported:true,hardware:true})),frame=Buffer.alloc(late.length+4);frame.writeUInt32LE(late.length);late.copy(frame,4);client.receive(frame);client.receive(Buffer.alloc(32,255));await Promise.resolve();assert.equal(client.cap,outcome.value);assert.equal(settlements,1);assert.equal(client.stats.completed,0);
  const native=await closed,joined=await client.waitForClose({timeoutMs:1000});assert.equal(joined.state,'closed');assert.equal(joined.processStarted,true);assert.equal(joined.exitObserved,true);assert.equal(joined.closeObserved,true);assert.equal(joined.joined,true);assert.equal(joined.closeCode,native.code);assert.equal(joined.closeSignal,native.signal);assert.equal(joined.helperCpuMs,null);await retainObservation('hold-capability-close',{capabilitySettlements:settlements,protocolCapability:outcome.value,independentChildClose:native,closeObservation:joined});
 }finally{client.close();await closed;}
});
test('backend ready settles after closure while its real original helper capability is pending',windows,async()=>{
 const executable=await helper('hold-capability-backend'),client=new AcousticGpuClient({executable}),backend=new AcousticAcceleration({mode:'gpu',clientFactory:()=>client}),closed=actualClose(client.child);
 try{await observedMarker(executable);const ready=backend.ready();backend.close();const cap=await Promise.race([ready,delay(250).then(()=>{throw Error('Closed backend.ready did not settle');})]);assert.equal(cap.supported,false);assert.equal(backend.initializing,null);assert.equal(backend.diagnostics().gpuResultsApplied,0);const observed=await client.waitForClose({timeoutMs:1000});assert.equal(observed.joined,true);await retainObservation('hold-capability-backend',{protocolCapability:cap,independentChildClose:await closed,closeObservation:observed,gpuResultsApplied:backend.diagnostics().gpuResultsApplied});}finally{backend.close();client.close();await closed;}
});
test('closure rejects a real pending protocol request without claiming a GPU completion',windows,async()=>{
 const executable=await helper('hold-dispatch-close'),client=new AcousticGpuClient({executable});await client.capability();const closed=actualClose(client.child);
 try{const pending=client.dispatch({segments:[{a:[-1,0,0],b:[1,0,0]}],surfaces:[{center:[0,0,0],normal:[1,0,0],min:[0,-1,-1],max:[0,1,1]}],generation:13,deadlineMs:100}),rejected=assert.rejects(pending,/closed/);await Promise.resolve();assert(client.pending);assert.equal(client.stats.submitted,1);client.close();await rejected;client.receive(Buffer.alloc(32,255));assert.equal(client.stats.completed,0);assert.equal(client.pending,null);const observed=await client.waitForClose({timeoutMs:1000});assert.equal(observed.joined,true);await retainObservation('hold-dispatch-close',{independentChildClose:await closed,closeObservation:observed,submittedProtocolRequests:client.stats.submitted,completedProtocolRequests:client.stats.completed});}finally{client.close();await closed;}
});
test('a missing helper is distinguished from actual process exit and close',windows,async()=>{
 const executable=path.join(path.dirname(await helper('hold-capability-unused')),'deliberately-absent.exe'),client=new AcousticGpuClient({executable});const cap=await client.capability();assert.equal(cap.supported,false);client.close();const joined=await client.waitForClose({timeoutMs:100});assert.equal(joined.state,'not-started');assert.equal(joined.launchAttempted,false);assert.equal(joined.processStarted,false);assert.equal(joined.exitObserved,false);assert.equal(joined.closeObserved,false);assert.equal(joined.joined,null);assert.equal(joined.helperCpuMs,null);for(const timeoutMs of [0,5001,NaN,1.5])assert.throws(()=>client.waitForClose({timeoutMs}),/observation bound/);await retainObservation('deliberately-absent',{protocolCapability:cap,closeObservation:joined});
});
test('an invalid original executable preserves failed launch separately from a started helper',windows,async()=>{
 const executable=path.join(path.dirname(await helper('hold-capability-unused-launch')),'invalid-original-fixture.exe');await fs.writeFile(executable,'original authored non-executable bytes',{flag:'wx'});const client=new AcousticGpuClient({executable}),cap=await client.capability();assert.equal(cap.supported,false);const observed=await client.waitForClose({timeoutMs:1000});assert.equal(observed.launchAttempted,true);assert.equal(observed.processStarted,false);assert.equal(observed.exitObserved,false);assert.equal(typeof observed.spawnErrorCode,'string');assert.equal(observed.helperCpuMs,null);assert(['closed','launch-failed'].includes(observed.state));assert.equal(observed.joined,observed.closeObserved?true:null);client.close();await retainObservation('invalid-original-fixture',{protocolCapability:cap,closeObservation:observed});
});
test('natural helper exit records the real exit code and distinct close observation',windows,async()=>{
 const executable=await helper('natural-exit-observed'),client=new AcousticGpuClient({executable});const cap=await client.capability();assert.equal(cap.supported,false);const closed=actualClose(client.child);client.child.stdin.end();const native=await closed,joined=await client.waitForClose({timeoutMs:1000});assert.equal(native.code,7);assert.equal(joined.state,'closed');assert.equal(joined.processStarted,true);assert.equal(joined.exitObserved,true);assert.equal(joined.exitCode,7);assert.equal(joined.closeCode,7);assert.equal(joined.closeObserved,true);assert.equal(joined.joined,true);assert.equal(joined.helperCpuMs,null);await retainObservation('natural-exit-observed',{independentChildClose:native,closeObservation:joined});
});
test('join timeout preserves an unknown failed observation and does not silently close or retry a helper',windows,async()=>{
 const executable=await helper('hold-capability-join-timeout'),client=new AcousticGpuClient({executable}),pending=client.capability(),closed=actualClose(client.child);
 try{await observedMarker(executable);const first=await client.waitForClose({timeoutMs:10});assert.equal(first.state,'join-timeout');assert.equal(first.joined,false);assert.equal(first.closeObserved,false);assert.equal(first.helperCpuMs,null);assert.equal(client.closed,false);client.close();await pending;const later=await client.waitForClose({timeoutMs:1000});assert.equal(later.joined,true);assert.equal(first.state,'join-timeout');assert.equal(first.joined,false);assert.equal(first.closeObserved,false);await retainObservation('hold-capability-join-timeout',{firstFailedObservation:first,laterExplicitObservation:later,independentChildClose:await closed});}finally{client.close();await closed;}
});
