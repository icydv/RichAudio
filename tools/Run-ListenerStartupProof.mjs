// Runs only disposable, device-free actual native-host fixtures. This script
// never launches GTA/RPH, accesses an audio endpoint or plays preserved PCM.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {finished} from 'node:stream/promises';
import {startSoundMap} from './soundmap/server.mjs';
import {checkListenerStartup} from './Check-ListenerStartup.mjs';

const [root,output,exe,legacyRoot='',legacyExe='']=process.argv.slice(2);
const model={basis:'declared-demonstration-scale',metresPerNativeUnit:10,sourceOffsetNative:[-.6,0,.1],reference:'original-analytic-native-source'};
async function runCase(sourceRoot,nativeExe,mode,destination){
  fs.mkdirSync(destination,{recursive:true});
  const modelFile=path.join(destination,'geometry-model.json');fs.writeFileSync(modelFile,JSON.stringify(model),{flag:'wx'});
  const service=await startSoundMap({root:destination,port:0});
  const request=async(route,value)=>{
    const response=await fetch(service.descriptor.url+route,{method:value===undefined?'GET':'POST',headers:{'X-RichAudio-Token':service.descriptor.token,...(value===undefined?{}:{'Content-Type':'application/json'})},body:value===undefined?undefined:JSON.stringify(value)});
    const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
  };
  let code,recording,opened;
  try{
    recording=(await request('/api/record/start',{maxDurationSeconds:30,maxBytes:32*1024*1024})).recording;
    const child=spawn(nativeExe,[sourceRoot,destination,modelFile,path.join(service.privateRoot,'service.json'),mode],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const stdout=fs.createWriteStream(path.join(destination,'fixture-stdout.txt'),{flags:'wx'}),stderr=fs.createWriteStream(path.join(destination,'fixture-stderr.txt'),{flags:'wx'});
    child.stdout.pipe(stdout);child.stderr.pipe(stderr);
    let timedOut=false;
    const deadline=setTimeout(()=>{timedOut=true;spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});},20000);
    try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}
    finally{clearTimeout(deadline);}
    await Promise.all([finished(stdout),finished(stderr)]);
    assert.equal(timedOut,false,'disposable actual-host fixture exceeded20s; only its owned process tree was terminated');
    await request('/api/record/stop',{id:recording.id});
    const until=performance.now()+2000;
    while(service.recorder.active&&performance.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(service.recorder.active,null,'actual owned recording flushed and sealed');
    opened=service.recorder.open(recording.id);
    fs.writeFileSync(path.join(destination,'recording-result.json'),JSON.stringify({id:recording.id,directory:opened.dir,audioPlayable:opened.audioPlayable,manifest:opened.manifest,status:service.status()},null,2),{flag:'wx'});
    assert.equal(code,0,'native fixture lifecycle must pass; inspect preserved stderr');
  }finally{await service.close();}
  return checkListenerStartup(destination,{baseline:mode==='baseline',invalid:!['normal','baseline'].includes(mode)});
}
try{
 const report={schemaVersion:1,gameLaunched:false,audioEndpointOpened:false,sourceCommitBaseline:'9e159f8a33a7e428593ac1f34c466560dd7bb623',baseline:null,corrected:null,invalidListeners:[]};
 if(legacyRoot){report.baseline=await runCase(legacyRoot,legacyExe,'baseline',path.join(legacyRoot,'.local','startup-proof'));}
 report.corrected=await runCase(root,exe,'normal',path.join(output,'corrected'));
 for(const mode of ['stale','future','wrong-session','reordered','interrupted'])report.invalidListeners.push(await runCase(root,exe,mode,path.join(output,'invalid-'+mode)));
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report,null,2));
}catch(error){fs.writeFileSync(path.join(output,'proof-failure.json'),JSON.stringify({error:error.stack,gameLaunched:false,audioEndpointOpened:false},null,2),{flag:'wx'});console.error(error);process.exitCode=1;}
