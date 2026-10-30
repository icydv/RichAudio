// Actual credit-paced RA07 producer/worker, with no audio device or game process.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {audioMetrics} from '../../src/acoustics/engine/signals.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export async function replayAcousticAcceleration({quality='quality',acceleration='cpu',scenario='demanding',sources=1,
  blocks=160,changes=[],paceInitialBlocks=32,paceMs=11,soundMapConfig=null}={}){
  assert.ok(Number.isInteger(blocks)&&blocks>=96&&blocks<=512);assert.ok(sources>=1&&sources<=4);
  assert.ok(Number.isInteger(paceInitialBlocks)&&paceInitialBlocks>=0&&paceInitialBlocks<=blocks&&Number.isFinite(paceMs)&&paceMs>=0&&paceMs<=50);
  const child=spawn(process.execPath,['tools/Run-Acoustics07.mjs','--headless-clock','audio','--trace-blocks','yes',
    '--history-diagnostics','yes','--sources',String(sources),'--acoustic-quality',quality,'--acoustic-acceleration',acceleration,
    '--acoustic-benchmark',scenario,...(soundMapConfig?['--soundmap-config',soundMapConfig]:[])],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const packets=[],traces=[],statuses=[];let pending=Buffer.alloc(0),text='',failure=null,final=null,exitCode=null,closed=false;
  const waiters=new Set(),notify=()=>{for(const f of [...waiters])f();};
  const fail=error=>{failure??=error;notify();};
  child.stdin.on('error',fail);child.on('error',fail);child.on('close',code=>{closed=true;exitCode=code;notify();});
  child.stdout.on('data',chunk=>{try{
    assert.ok(pending.length+chunk.length<=2*1024*1024);pending=Buffer.concat([pending,chunk]);
    while(pending.length>=4112){const h=pending;assert.equal(h.toString('ascii',0,4),'RA07');assert.equal(h.readUInt32LE(4),packets.length);
      assert.equal(h.readUInt32LE(8),512);assert.equal(h.readUInt32LE(12),0);assert.ok(packets.length<blocks);
      packets.push(Buffer.from(h.subarray(16,4112)));pending=h.subarray(4112);}
    notify();
  }catch(e){fail(e);}});
  child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{try{
    assert.ok(text.length+chunk.length<=512*1024);text+=chunk;let end;
    while((end=text.indexOf('\n'))>=0){const line=text.slice(0,end);text=text.slice(end+1);if(!line.trim())continue;
      const m=JSON.parse(line);if(m.type==='block'){assert.ok(traces.length<blocks);traces.push(m);}
      else if(m.type==='acoustic-settings-status'){assert.ok(statuses.length<=blocks+4);statuses.push(m);}
      else if(m.type==='final')final=m;
    }notify();
  }catch(e){fail(e);}});
  const send=m=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(m)+'\n');};
  const until=predicate=>new Promise((resolve,reject)=>{
    const done=()=>{if(failure){finish();reject(failure);}else if(predicate()){finish();resolve();}else if(closed){finish();reject(Error('Actual acoustic producer exited early'));}};
    const timer=setTimeout(()=>{finish();reject(Error('Actual acoustic producer fixture deadline'));},10000);
    const finish=()=>{clearTimeout(timer);waiters.delete(done);};waiters.add(done);done();
  });
  try{
    for(let b=0;b<blocks;b++){
      for(const change of changes.filter(c=>c.block===b)){const {block,...settings}=change;send({type:'acoustic-settings',...settings});}
      if(b===24)send({type:'control',command:'start'});
      if(b===blocks-24)send({type:'control',command:'emit-stop'});
      send({type:'credit',blocks:1});await until(()=>packets.length>b&&traces.length>b);
      // First credits represent a bounded, muted startup at normal block cadence;
      // later accelerated replay is not evidence of real-time scheduling.
      if(b<paceInitialBlocks)await new Promise(resolve=>setTimeout(resolve,paceMs));
    }
    send({type:'control',command:'stop'});await until(()=>closed);
    assert.equal(exitCode,0,final?.error??'Clean producer shutdown');assert.equal(final?.error,null);assert.equal(pending.length,0);
    assert.equal(final.frames,blocks*512);assert.equal(final.dsp.limited,0);assert.equal(final.dsp.pathOverflow,0);
    assert.equal(final.dsp.cursorResets,0);assert.equal(final.historyDiagnostics.affectedFrames,0);assert.equal(final.simulation.resets,1);
    const raw=Buffer.concat(packets),channels=[new Float32Array(blocks*512),new Float32Array(blocks*512)],identities=new Set();
    for(let b=0;b<blocks;b++){
      assert.equal(traces[b].frame,b*512);
      for(const [id,g]of Object.entries(traces[b].sourceGenerations))identities.add(id+':'+g);
      for(let j=0;j<512;j++){channels[0][b*512+j]=packets[b].readFloatLE(j*8);channels[1][b*512+j]=packets[b].readFloatLE(j*8+4);}
      if(b>40&&b<blocks-28&&traces[b].acoustic?.richAudioEnabled!==false&&traces[b].acoustic?.outputLevel!==0){let energy=0;for(let j=0;j<512;j++)energy+=channels[0][b*512+j]**2+channels[1][b*512+j]**2;assert.ok(energy>1e-12);}
    }
    assert.equal(identities.size,sources);const metrics=audioMetrics(channels);
    assert.equal(metrics.nonfiniteSamples,0);assert.equal(metrics.clippedSamples,0);assert.ok(metrics.maximumAdjacentStep<.02);
    return {raw,channels,traces,statuses,final,metrics,sha256:createHash('sha256').update(raw).digest('hex')};
  }finally{
    if(!closed){send({type:'control',command:'stop'});await new Promise(resolve=>{const t=setTimeout(resolve,1000);child.once('close',()=>{clearTimeout(t);resolve();});});}
    if(!closed)child.kill();
  }
}
