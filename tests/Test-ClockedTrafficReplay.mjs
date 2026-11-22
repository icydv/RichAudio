import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {ClockedMapRecorder} from '../tools/soundmap/clocked-map-recorder.mjs';
import {clockedFiles,openClockedTrafficReplay} from '../tools/soundmap/clocked-traffic-replay.mjs';
import {replayFrame} from '../tools/soundmap/recorder.mjs';

test('clocked traffic binds all 512 consumed samples and withholds missing frames and storage substitutions',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'RichAudio-clocked-replay-')),session='a'.repeat(32);
  const save=(name,data)=>fs.writeFile(path.join(dir,name),data);
  const digest=arg=>createHash('sha256').update(arg).digest('hex');
  const bind=async()=>{
    const files={};
    for(const name of clockedFiles)files[name]=digest(await fs.readFile(path.join(dir,name)));
    await save('clocked-replay.json',JSON.stringify({schema:1,session,files}));
  };
  try {
    const wav=Buffer.alloc(44+1920*8);
    wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
    wav.writeUInt16LE(3,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(384000,28);
    wav.writeUInt16LE(8,32);wav.writeUInt16LE(32,34);wav.write('data',36);wav.writeUInt32LE(1920*8,40);
    for(let i=44;i<44+1536*8;i+=4) wav.writeFloatLE(.25,i);
    await save('clocked-output.wav',wav);
    await save('host.json',JSON.stringify({session,fixture:true,hostState:'stopped',endpointOpened:false,outputSink:'environment-observation',
      consumedFrames:1920,underflowFrames:384,firstUnderflowFrame:1536}));
    await save('clocked-callbacks.csv','firstSinkFrame,firstProducerFrame,requested,supplied,startQpc,endQpc\n0,0,960,960,14,16\n960,960,960,576,26,30\n');
    await save('clocked-contributors.jsonl',Array.from({length:4},(_,i)=>JSON.stringify({block:i,frame:i*512,packetMatches:true,
      packetLeft:.25,packetRight:.25,unboundPaths:0,contributors:[]})).join('\n')+'\n');
    const recorder=new ClockedMapRecorder(dir,session);
    while(recorder.busy && !recorder.error)await wait(5);
    const frame={schemaVersion:1,sequence:1,sessionId:session,streamId:'original',audioFrame:0,geometryGeneration:null,paths:[],
      sources:[],listener:{position:[0,0,0],valid:true}};
    const engine={visual:{soundMapFrame:frame},telemetry:{},slots:[],pipeline:{renderer:{frame:512,slots:[]},lastControl:{paths:[]}}};
    recorder.offer(engine,0,Buffer.concat([Buffer.alloc(16),wav.subarray(44,44+512*8)]));
    await recorder.close();
    await bind();
    const replay=await openClockedTrafficReplay(dir);
    assert.equal(replay.mapPrefixFrames,1536);
    assert.equal(replayFrame(replay,511/48).frame.sequence,1);
    assert.equal(replayFrame(replay,512/48).frame.mapHeld,true);
    assert.equal(replayFrame(replay,1536/48).frame,null);
    assert.equal(replayFrame(replay,1536/48).pcmBlock,null);
    wav.writeFloatLE(.5,44+111*8);
    await save('clocked-output.wav',wav);
    await assert.rejects(()=>openClockedTrafficReplay(dir),/digest differs/);
    await bind();
    await assert.rejects(()=>openClockedTrafficReplay(dir),/differs from the consumed stereo packet/);
  }finally {await fs.rm(dir,{recursive:true,force:true});}
});
