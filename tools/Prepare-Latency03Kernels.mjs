import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createLatency03Library} from '../src/acoustics/events/latency03-library.mjs';
import {copyPreparedTransientPCM,transientLimits} from '../src/acoustics/events/prepared-path.mjs';
import {modulePins,sha256,freshPrivateOutput} from './latency03-source-pins.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--output')throw Error('Explicit fresh --output required');const output=freshPrivateOutput(root,args[1]);
const sourcePins=modulePins(root,['tools/Prepare-Latency03Kernels.mjs','tools/Run-Latency03EventWorker.mjs']),library=createLatency03Library();
const parts=[],kernels=[];let offsetBytes=0;
for(const {kernelSlot,kernelGeneration,sourceId,name,kernel} of library){const pcm=new Float32Array(kernel.frames*2);copyPreparedTransientPCM(kernel,pcm);const bytes=Buffer.from(pcm.buffer);
 parts.push(bytes);kernels.push({kernelSlot,kernelGeneration,sourceId,name,offsetBytes,bytes:bytes.length,...kernel});offsetBytes+=bytes.length;}
for(const pin of sourcePins)if(sha256(fs.readFileSync(path.join(root,pin.file)))!==pin.sha256)throw Error('Preparation source drift');
const payload=Buffer.concat(parts);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'kernels.f32le'),payload,{flag:'wx'});
const result={schema:1,kind:'original-authored-fixed-transient-kernels-not-recording',experimentProfile:'LATENCY-03',passed:true,nodeVersion:process.version,sourcePins,limits:transientLimits,kernels,
 payload:{file:'kernels.f32le',format:'Float32LE interleaved stereo',bytes:payload.length,sha256:sha256(payload)},endpointOpened:false,gameLaunched:false,recordingStarted:false,nativeEventAcquired:false,productionEnabled:false,
 scope:'Original synthetic shot/impact shapes, authored static geometry and fixed poses; existing acoustic engine. No endpoint or actual gunshot timing.'};
const receipt=path.join(output,'preparation.json');fs.writeFileSync(receipt,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,receipt,sha256:sha256(fs.readFileSync(receipt)),pcmBytes:payload.length}));
