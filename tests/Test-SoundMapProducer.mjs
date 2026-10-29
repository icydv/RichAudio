import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startSoundMap} from '../tools/soundmap/server.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
async function run(extra=[]){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['tools/Run-Acoustics07.mjs','--headless-clock','audio','--trace-blocks','yes','--acoustic-quality','performance','--acoustic-acceleration','cpu',...extra],{cwd:repo,windowsHide:true});
 let pending=Buffer.alloc(0),blocks=0,stderr='',pcm=[];const send=m=>child.stdin.write(JSON.stringify(m)+'\n');const deadline=setTimeout(()=>{child.kill();reject(Error('Producer fixture timeout'));},15000);
 child.stdin.on('error',()=>{});child.once('error',reject);child.stderr.on('data',b=>{stderr+=b;if(stderr.length>4194304){child.kill();reject(Error('Diagnostic bound'));}});
 child.stdout.on('data',b=>{pending=Buffer.concat([pending,b]);while(pending.length>=4112){assert.equal(pending.toString('ascii',0,4),'RA07');pcm.push(Buffer.from(pending.subarray(16,4112)));pending=pending.subarray(4112);blocks++;if(blocks<200)send({type:'credit',blocks:1});else send({type:'control',command:'stop'});}});
 child.once('exit',code=>{clearTimeout(deadline);if(code!==0){reject(Error(stderr));return;}const logs=stderr.split('\n').filter(Boolean).map(JSON.parse);resolve({pcm:Buffer.concat(pcm),final:logs.find(m=>m.type==='final'),blocks:logs.filter(m=>m.type==='block')});});send({type:'control',command:'start'});send({type:'credit',blocks:1});
});}
test('actual producer exports solver state and recording metrics without altering rendered PCM',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'RichAudioSoundMap-'));const service=await startSoundMap({root,port:0});
 try{const baseline=await run();const id=service.recorder.start().id;const withViewer=await run(['--soundmap-config',path.join(service.privateRoot,'service.json')]);service.recorder.stop();
 assert.deepEqual(withViewer.pcm,baseline.pcm,'visual telemetry does not alter actual rendered PCM');assert.equal(withViewer.final.error,null);assert.ok(service.status().accepted>=1);const replay=service.recorder.open(id);assert.ok(replay.frames.length>=1);assert.ok(replay.frames.some(r=>r.frame.paths.some(p=>p.status==='selected')));assert.ok(replay.frames.every(r=>Number.isFinite(r.frame.producer.unsampledBlocksSinceLastFrame)));assert.ok(replay.events.some(e=>e.type==='control'&&e.detail.command==='stop'));
 console.log(JSON.stringify({test:'actual-producer-soundmap-overhead',blocks:200,baselineCpuSeconds:baseline.final.cpuSeconds,soundMapCpuSeconds:withViewer.final.cpuSeconds,baselineDsp:baseline.final.statistics.dspMs,soundMapDsp:withViewer.final.statistics.dspMs,baselineSimulation:baseline.final.statistics.simulationMs,soundMapSimulation:withViewer.final.statistics.simulationMs,transport:withViewer.final.soundMap,frames:replay.frames.length,exactPcmEqual:true,scope:'Two sequential device-free process runs; wall scheduling noise, not realtime endpoint guarantee'}));
 }finally{await service.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('RichAudioSoundMap-'));fs.rmSync(root,{recursive:true});}
});
