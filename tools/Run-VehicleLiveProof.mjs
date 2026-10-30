// Actual device-free host integration. Nothing here starts GTA/RPH, WASAPI,
// loopback, or playback. Captured PCM is generated continuously from evidence.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {finished} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {startSoundMap} from './soundmap/server.mjs';
import {checkVehicleLive,compareVehicleProfiles} from './Check-VehicleLiveProof.mjs';
import {createVehicleCiEvidence} from './vehicle-live-evidence.mjs';

const [root,output,exe]=process.argv.slice(2);
const model={basis:'declared-demonstration-scale',metresPerNativeUnit:1,sourceOffsetNative:[0,0,0],reference:'authored-vehicle-fixture-native-unit-assumed-metre'};
function sourceManifest(){
  const paths=[];const walk=relative=>{for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const child=relative+'/'+entry.name;if(entry.isDirectory())walk(child);else if(entry.isFile())paths.push(child);}};
  walk('src/acoustics');walk('tools/soundmap');
  paths.push('tools/Run-Acoustics07.mjs','tools/acoustics-06-scenes.mjs','tools/acoustics-08-2-scenes.mjs',
    'tools/Test-VehicleLive.ps1','tools/Run-VehicleLiveProof.mjs','tools/Check-VehicleLiveProof.mjs','tools/vehicle-live-evidence.mjs','tests/geometry-live/VehicleIntegration.cs');
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  const files=paths.sort().map(relative=>{const bytes=fs.readFileSync(path.join(root,relative));return {path:relative,bytes:bytes.length,sha256:digest(bytes)};});
  return {schemaVersion:1,files,nativeFixtureSha256:digest(fs.readFileSync(exe)),sourceDigest:digest(JSON.stringify(files))};
}
async function run(profile){
  const destination=path.join(output,profile);fs.mkdirSync(destination,{recursive:true});
  const modelFile=path.join(destination,'geometry-model.json');fs.writeFileSync(modelFile,JSON.stringify(model),{flag:'wx'});
  const service=await startSoundMap({root:destination,port:0});
  const request=async(route,value)=>{const response=await fetch(service.descriptor.url+route,{method:'POST',
    headers:{'X-RichAudio-Token':service.descriptor.token,'Content-Type':'application/json'},body:JSON.stringify(value)});
    const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
  try{
    const recording=(await request('/api/record/start',{maxDurationSeconds:30,maxBytes:32*1024*1024})).recording;
    const child=spawn(exe,[root,destination,modelFile,path.join(service.privateRoot,'service.json'),profile],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const stdout=fs.createWriteStream(path.join(destination,'fixture-stdout.txt'),{flags:'wx'}),stderr=fs.createWriteStream(path.join(destination,'fixture-stderr.txt'),{flags:'wx'});
    child.stdout.pipe(stdout);child.stderr.pipe(stderr);let timedOut=false;
    const deadline=setTimeout(()=>{timedOut=true;spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});},25000);
    let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}finally{clearTimeout(deadline);}
    await Promise.all([finished(stdout),finished(stderr)]);
    assert.equal(timedOut,false,'owned device-free fixture exceeded25s; only its process tree was terminated');
    await request('/api/record/stop',{id:recording.id});
    const until=performance.now()+2000;while(service.recorder.active&&performance.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(service.recorder.active,null,'actual recorder flushed and sealed');
    const opened=service.recorder.open(recording.id);
    fs.writeFileSync(path.join(destination,'recording-result.json'),JSON.stringify({id:recording.id,directory:opened.dir,audioPlayable:opened.audioPlayable,manifest:opened.manifest,status:service.status()},null,2),{flag:'wx'});
    assert.equal(code,0,'actual native vehicle fixture lifecycle failed; retained stderr explains failure');
  }finally{await service.close();}
  return checkVehicleLive(destination);
}
let stage='source-manifest',report={schemaVersion:1,milestone:'VEHICLE-LIVE-01',gameLaunched:false,audioEndpointOpened:false,
  subjectiveListening:'not performed',fixtures:'authored RPH-format observations; no gameplay measurement'};
function retainCi(error=null){const directory=path.join(root,'.local','vehicle-ci-evidence');fs.mkdirSync(directory,{recursive:true});
  const evidence=createVehicleCiEvidence(report,{stage,error}),text=JSON.stringify(evidence,null,2);assert.ok(Buffer.byteLength(text)<65536,'bounded CI scalar record');
  fs.writeFileSync(path.join(directory,'result.json'),text);}
try{
  const sources=sourceManifest();fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify(sources,null,2),{flag:'wx'});
  report.sourceDigest=sources.sourceDigest;report.nativeFixtureSha256=sources.nativeFixtureSha256;
  stage='v12';report.v12=await run('v12');stage='v8';report.v8=await run('v8');stage='source-verification';
  assert.deepEqual(sourceManifest(),sources,'actual proof sources must not change during measurement');
  stage='comparison';report.comparison=compareVehicleProfiles(report.v12,report.v8);stage='complete';retainCi();
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report,null,2));
}catch(error){retainCi(error);fs.writeFileSync(path.join(output,'proof-failure.json'),JSON.stringify({error:error.stack,gameLaunched:false,audioEndpointOpened:false},null,2),{flag:'wx'});console.error(error);process.exitCode=1;}
