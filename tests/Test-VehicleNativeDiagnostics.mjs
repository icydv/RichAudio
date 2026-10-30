// Genuine native receiver/publisher behavior; never a game or audio endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {startSoundMap} from '../tools/soundmap/server.mjs';
import {readVehicleNativeEvidence} from '../tools/vehicle-live-evidence.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function probe(mode){
  const directory=path.join(root,'.local','vehicle-native-'+randomUUID());fs.mkdirSync(directory,{recursive:true});
  const model=path.join(directory,'model.json');fs.writeFileSync(model,JSON.stringify({basis:'declared-demonstration-scale',metresPerNativeUnit:1,sourceOffsetNative:[0,0,0],reference:'authored-native-diagnostic-fixture'}));
  const service=await startSoundMap({root:directory,port:0});
  try{const exe=path.join(root,'build/vehicle-live/RichAudio.VehicleLive.Tests.exe');assert.ok(fs.existsSync(exe),'Build Test-VehicleLive.ps1 -BuildOnly first');
    const result=await new Promise((resolve,reject)=>{const child=spawn(exe,[root,directory,model,path.join(service.privateRoot,'service.json'),'v12',mode],{windowsHide:true});
      let stdout='',stderr='';child.stdout.on('data',b=>{stdout=(stdout+b).slice(-65536);});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536);});
      let timedOut=false;const timer=setTimeout(()=>{timedOut=true;spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});},8000);
      child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',value=>{clearTimeout(timer);fs.writeFileSync(path.join(directory,'stdout.txt'),stdout);fs.writeFileSync(path.join(directory,'stderr.txt'),stderr);resolve({code:value,timedOut});});});
    const evidence=readVehicleNativeEvidence(directory,{profile:'v12',childExit:result.code,timedOut:result.timedOut});console.log(JSON.stringify({type:'native-listener-probe',mode,...evidence}));
    assert.equal(result.timedOut,false,'owned native diagnostic process tree met the8second deadline');
    return evidence;
  }finally{await service.close();}
}
test('actual native fixture retains demonstrated manual ACK2 failure and correct single-connection sequence',{skip:process.platform!=='win32'},async()=>{
  const legacy=await probe('legacy-cold-listener-probe');assert.equal(legacy.childExit,1);assert.equal(legacy.fixture.senderStage,'listener-ack');
  assert.equal(legacy.fixture.senderErrorKind,'InvalidDataException');assert.equal(legacy.fixture.listenerWire.firstAck,2);
  assert.ok(legacy.fixture.listenerWire.firstAgeAtWriteMs>=350);assert.equal(legacy.host.listener.startupDiscarded,1);
  assert.equal(legacy.host.listener.accepted,0);assert.equal(legacy.host.listener.rejected,0);assert.equal(legacy.host.listener.connections,1);
  const sequence=await probe('cold-listener-sequence');assert.equal(sequence.childExit,0);assert.equal(sequence.fixture.listenerWire.firstAck,2);
  assert.equal(sequence.fixture.listenerWire.lastAck,1);assert.equal(sequence.host.listener.accepted,1);assert.equal(sequence.host.listener.startupDiscarded,1);
  assert.equal(sequence.host.listener.rejected,0);assert.equal(sequence.host.listener.connections,1);
  assert.equal(sequence.fixture.listenerWire.stopAck,3);assert.equal(sequence.host.listener.outcome,'deliberate-stop');
});
test('normal fixture uses actual strict publisher to discard an expired unsent first frame and stop deliberately',{skip:process.platform!=='win32'},async()=>{
  const e=await probe('publisher-cold-listener-probe');assert.equal(e.childExit,0);assert.equal(e.fixture.senderJoined,true);
  assert.equal(e.fixture.listenerPublisher.attempts,1);assert.ok(e.fixture.listenerPublisher.expiredAfterEncoding>=1);
  assert.ok(e.fixture.listenerPublisher.firstExpiredUnsent.AgeMs>=350);
  assert.ok(e.fixture.listenerPublisher.sent>=1);assert.equal(e.fixture.listenerPublisher.outcome,'deliberate-stop');
  assert.equal(e.host.listener.rejected,0);assert.equal(e.host.listener.connections,1);assert.equal(e.host.sink.underflowFrames,0);
});
