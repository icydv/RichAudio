// One private device-free comparison. Native PCM is never published.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadStockNpcAssets,StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {stockExteriorPressure} from '../src/acoustics/vehicle/stock-pressure.mjs';
import {encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {audioMetrics} from '../src/acoustics/engine/signals.mjs';
import {npcOperating,npcComparisonSeconds} from './world-vehicle-02-scenario.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),manifestFile=path.resolve(process.argv[2]??''),out=path.resolve(process.argv[3]??'');
assert.ok(out.startsWith(path.join(root,'.local')+path.sep)&&!fs.existsSync(out),'fresh private output required');
const sha=b=>createHash('sha256').update(b).digest('hex'),protectedInputs=new Map();
const protect=f=>{const b=fs.readFileSync(f);protectedInputs.set(f,sha(b));return b;};
protect(manifestFile);const assets=loadStockNpcAssets(manifestFile),bank=assets.vehicles.get('bati');assert.equal(assets.vehicles.size,1);
for(const layer of Object.values(bank.layers).flatMap(Object.values)){protect(path.join(assets.base,layer.file));assert.equal(sha(protect(path.join(assets.base,layer.wavFile))),layer.sourceWavSha256.toLowerCase());}
assert.equal(stockExteriorPressure.exhaust,10);assert.equal(stockExteriorPressure.commonHeadroom,.25);
const source=new StockVehicleSource(bank),total=Math.round(npcComparisonSeconds*48000),channels=[new Float32Array(total),new Float32Array(total)],e=new Float32Array(512),x=new Float32Array(512),rows=[];
for(let at=0;at<total;at+=512){const n=Math.min(512,total-at),control=npcOperating(at/48000);source.renderInto(control,e,x,n);
 for(let i=0;i<n;i++)channels[0][at+i]=channels[1][at+i]=.7*.25*(e[i]+10*x[i]);
 if(at%5120===0)rows.push({seconds:at/48000,control,weights:[...source.weights],roleRatesHz:{...source.commonRates},phases:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(source.modes.map(mode=>[mode,{phase:source.voices[role][mode].phase,cycles:source.voices[role][mode].clockCycles}]))]))});
}
const rawFrames=Math.round(2.5*48000),raw=[new Float32Array(rawFrames),new Float32Array(rawFrames)];
assert.equal(bank.layers.engine.accel.sampleRate,48000);assert.equal(bank.layers.exhaust.accel.sampleRate,48000);
for(let i=0;i<rawFrames;i++)raw[0][i]=raw[1][i]=.7*.25*.5*(bank.layers.engine.accel.samples[i]+10*bank.layers.exhaust.accel.samples[i]);
fs.mkdirSync(out,{recursive:true});const files=[];
for(const [name,data]of [['native-acceleration.wav',raw],['reconstructed-states.wav',channels]]){
 const metrics=audioMetrics(data);assert.ok(metrics.peak<.98&&metrics.nonfiniteSamples===0&&metrics.clippedSamples===0);
 const bytes=encodeVehicleWav(data);fs.writeFileSync(path.join(out,name),bytes);files.push({file:name,seconds:data[0].length/48000,sha256:sha(bytes),metrics});
}
for(const [file,hash]of protectedInputs)assert.equal(sha(fs.readFileSync(file)),hash);
const report={schemaVersion:1,scope:'one Bati NPC source comparison',files,sampleRate:48000,sourceGain:1,roleShares:{engine:.5,exhaust:.5},exteriorPressure:stockExteriorPressure,rendererMasterEquivalent:.7,
 reference:'First2.5seconds of original engine/exhaust accel PCM at native48k, linearly mixed. No loop, state control, resampling or propagation.',
 reconstruction:'4.1seconds authored idle/rise/hold/falling-operating-point/idle; same per-role gain as reference. Different operating performances, not an identical-state fidelity null test.',
 policy:source.stats.transitionPolicy,sourceStats:source.stats,voices:Object.fromEntries(['engine','exhaust'].map(role=>[role,Object.fromEntries(source.modes.map(mode=>[mode,source.voices[role][mode].stats]))])),rows,
 sourceFilesUnchanged:true,protectedInputCount:protectedInputs.size,normalization:false,limiting:false,spatialProcessing:false,gameLaunched:false,endpointOpened:false,subjectiveListeningPerformed:false,perceptualAcceptance:'PENDING user listening'};
fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(report,null,2)+'\n');
const refs=Object.entries(bank.layers).flatMap(([role,modes])=>Object.entries(modes).map(([mode,a])=>`<li><a href="${path.relative(out,path.join(assets.base,a.wavFile)).replaceAll('\\','/')}">${role} ${mode} · original mono WAV</a></li>`)).join('');
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Bati NPC source comparison</title><style>body{font:17px system-ui;max-width:850px;margin:40px auto;padding:20px;background:#111923;color:#e5edf8}a{color:#a8d5ff}audio{width:100%}section{padding:20px;background:#1b2939;margin:20px 0}</style><h1>Genuine Bati NPC source</h1><p>One common gain. Approved10× exhaust balance and.25 headroom trim; no normalization, EQ, synthetic pops or propagation. The source calibration is1 with equal.5 role shares for both clips. This diagnostic does not calibrate traffic loudness.</p><section><h2>Original NPC acceleration ·2.5s</h2><p>Unmodified original samples at native48kHz, mixed engine/exhaust. No looping or source-state control.</p><audio controls preload="none" src="native-acceleration.wav"></audio></section><section><h2>Reconstructed NPC states ·4.1s</h2><p>Authored idle, rise, hold, falling operating point and idle. Missing deceleration uses acceleration PCM as the operating point falls, then blends to idle. This is not a claim about Rockstar's native lift behavior.</p><audio controls preload="none" src="reconstructed-states.wav"></audio></section><p>These clips demonstrate different operating performances at identical gain, not the same trajectory or a sample-identical comparison. No subjective listening by the assistant. Acceptance remains pending.</p><ul>${refs}</ul><a href="measurements.json">Measurements, native interval rates and phase diagnostics</a><script>const p=[...document.querySelectorAll('audio')];p.forEach(a=>a.onplay=()=>p.forEach(b=>{if(a!==b)b.pause()}));</script></html>`);
console.log(JSON.stringify({files,output:out,sourceFilesUnchanged:true}));
