// Optional file-only preparation. PCM is an original authored render, never a
// device capture. Runtime playback/descriptor tests can instead use memory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createTransientFixtureLibrary} from '../src/acoustics/events/fixture-library.mjs';
import {copyPreparedTransientPCM,transientLimits} from '../src/acoustics/events/prepared-path.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--output')throw Error('Explicit fresh private --output required');
const out=path.resolve(args[1]),privateRoot=path.join(root,'.local')+path.sep;
if(!out.startsWith(privateRoot)||fs.existsSync(out))throw Error('Fresh checkout-local private output required');
for(let p=out;p!==path.dirname(p);p=path.dirname(p))if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Linked preparation output refused');
const sha=b=>createHash('sha256').update(b).digest('hex'),files=['src/acoustics/events/prepared-path.mjs','src/acoustics/events/fixture-scenes.mjs',
  'src/acoustics/events/fixture-library.mjs','src/acoustics/streaming/causal.mjs','src/acoustics/engine/contracts.mjs','src/acoustics/engine/paths.mjs',
  'src/acoustics/research/local-geometry.mjs','tools/Prepare-TransientEventFixture.mjs'];
const sourcePins=files.map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file)))})),library=createTransientFixtureLibrary();
const parts=[],kernels=[];let offsetBytes=0;
for(const {kernelSlot,kernelGeneration,sourceId,name,kernel}of library){const pcm=new Float32Array(kernel.frames*2);copyPreparedTransientPCM(kernel,pcm);
  const bytes=Buffer.from(pcm.buffer);parts.push(bytes);kernels.push({kernelSlot,kernelGeneration,sourceId,name,offsetBytes,bytes:bytes.length,...kernel});offsetBytes+=bytes.length;}
for(const p of sourcePins)if(sha(fs.readFileSync(path.join(root,p.file)))!==p.sha256)throw Error('Preparation source drift');
fs.mkdirSync(out,{recursive:true});const payload=Buffer.concat(parts);fs.writeFileSync(path.join(out,'kernels.f32le'),payload,{flag:'wx'});
const result={schema:1,kind:'original-authored-fixed-transient-kernels-not-recording',passed:true,nodeVersion:process.version,sourcePins,limits:transientLimits,kernels,
  payload:{file:'kernels.f32le',format:'Float32LE interleaved stereo',bytes:payload.length,sha256:sha(payload)},
  endpointOpened:false,gameLaunched:false,recordingStarted:false,nativeEventAcquired:false,productionEnabled:false,
  scope:'Original synthetic fixed-pose impulse preparations through existing CausalSimulation/StreamingRenderer; no moving-listener or live gunshot authority'};
const receipt=path.join(out,'preparation.json');fs.writeFileSync(receipt,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,receipt,sha256:sha(fs.readFileSync(receipt)),kernels:kernels.length,pcmBytes:payload.length}));
