import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAcousticSettings,acousticDefaults} from '../src/acoustics/streaming/acoustic-quality.mjs';
import {CausalSimulation,StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import {scenario} from '../tools/acoustics-08-2-scenes.mjs';
import {replayAcousticAcceleration} from '../tools/audio/acoustic-acceleration-replay.mjs';

test('owned audio preferences validate without inventing unsupported effect controls',()=>{
  assert.deepEqual(validateAcousticSettings({acousticQuality:'balanced',acousticAcceleration:'cpu'}),
    {...acousticDefaults,acousticQuality:'balanced',acousticAcceleration:'cpu'});
  for(const v of [{richAudioEnabled:0},{earlyReflections:'false'},{diagnosticsOverlay:null},
    {outputLevel:-.01},{outputLevel:1.01},{outputLevel:NaN},{doppler:false},{reverberation:true}])assert.throws(()=>validateAcousticSettings(v));
  assert.equal(validateAcousticSettings({outputLevel:0,richAudioEnabled:false}).outputLevel,0);
});

test('early-reflection bypass skips actual candidate work and preserves direct geometry and source identity',()=>{
  const f=scenario('enclosure'),s=new CausalSimulation(f.scene);
  s.observe(f.snapshot(0));s.observe(f.snapshot(.1));
  s.setProcessingSettings({pathBudget:32,maxReflectors:12});
  const normal=s.update(.1),identity=normal.sourceGenerations;
  assert.ok(normal.paths.some(p=>p.order===2));
  s.setProcessingSettings({pathBudget:32,maxReflectors:12,earlyReflections:false});
  const prepared=s.prepareUpdate(.1);assert.equal(prepared.sources[0].plans.length,1);
  const bypass=s.completeUpdate(prepared);assert.equal(bypass.paths.length,1);assert.equal(bypass.paths[0].order,0);
  assert.deepEqual(bypass.paths[0],normal.paths.find(p=>p.order===0));assert.deepEqual(bypass.sourceGenerations,identity);
  s.setProcessingSettings({pathBudget:32,maxReflectors:12,earlyReflections:true});
  assert.ok(s.update(.1).paths.length>12);assert.equal(s.stats.resets,1);
});

function control(frame){return {frame,sourceGenerations:{s:1},paths:frame<2048?[]:[{id:'s:direct',sourceId:'s',generation:1,
  emissionFrame:frame-1024,rate:1,bands:[.3,.2,.1],pan:.2,order:0}]};}
test('output attenuation and mute ramp preserve rings, timing and headroom during continuous PCM',()=>{
  const a=new StreamingRenderer({sourceIds:['s'],historyDiagnostics:true}),b=new StreamingRenderer({sourceIds:['s'],historyDiagnostics:true});
  const ring=b.sources.get('s').bands[0],energies=[];let maximumStep=0,previous=0;
  for(let n=0;n<180;n++){
    if(n===40)b.setOutputPreferences({outputLevel:.3});
    if(n===75)b.setOutputPreferences({richAudioEnabled:false,outputLevel:.3});
    if(n===110)b.setOutputPreferences({richAudioEnabled:true,outputLevel:.7});
    if(n===145)b.setOutputPreferences({outputLevel:1});
    const frame=a.frame,input=Float32Array.from({length:512},(_,j)=>.03*Math.sin(2*Math.PI*600*(frame+j)/48000));
    const out=[];for(const r of[a,b]){r.accept(control(frame));const l=new Float32Array(512),rr=new Float32Array(512);r.process({s:input},l,rr);out.push(l);}
    let reference=0,actual=0;for(let j=0;j<512;j++){reference+=out[0][j]**2;actual+=out[1][j]**2;
      maximumStep=Math.max(maximumStep,Math.abs(out[1][j]-previous));previous=out[1][j];assert.ok(Number.isFinite(previous)&&Math.abs(previous)<.98);}
    energies.push(reference?Math.sqrt(actual/reference):0);
    if(n<40)assert.deepEqual(out[1],out[0]);
  }
  assert.ok(Math.abs(energies[65]-.3)<1e-5);assert.ok(energies[105]<1e-6);
  assert.ok(Math.abs(energies[140]-.7)<1e-6);assert.ok(Math.abs(energies[179]-1)<1e-6);
  assert.ok(maximumStep<.002);assert.equal(b.sources.get('s').bands[0],ring);assert.equal(b.frame,a.frame);
  assert.equal(b.stats.cursorResets,0);assert.equal(b.stats.limited,0);assert.equal(b.historyDiagnostics.affectedFrames,0);
  assert.throws(()=>b.setOutputPreferences({outputLevel:1.1}));
});

test('actual settings messages reach solver and smoothed PCM without starting or resetting owned sources',async()=>{
  const changes=[
    {block:48,revision:1,quality:'quality',acceleration:'cpu',earlyReflections:false,outputLevel:.4},
    {block:80,revision:2,quality:'quality',acceleration:'cpu',richAudioEnabled:false},
    {block:120,revision:3,quality:'balanced',acceleration:'cpu',richAudioEnabled:true,diagnosticsOverlay:true}];
  const r=await replayAcousticAcceleration({quality:'quality',acceleration:'cpu',scenario:'enclosure',blocks:192,changes});
  assert.ok(r.traces[40].paths>12);assert.equal(r.traces[60].paths,1);
  assert.equal(r.traces[60].acoustic.outputLevel,.4);assert.equal(r.traces[96].acoustic.richAudioEnabled,false);
  assert.equal(r.traces[144].paths,16);assert.equal(r.traces[144].acoustic.diagnosticsOverlay,true);
  assert.equal(r.traces[144].acoustic.dopplerBypassSupported,false);
  let muted=0;for(const ch of r.channels)for(let j=112*512;j<120*512;j++)muted+=ch[j]**2;
  assert.ok(muted<1e-12);assert.equal(r.final.simulation.resets,1);assert.equal(r.final.dsp.cursorResets,0);
});
