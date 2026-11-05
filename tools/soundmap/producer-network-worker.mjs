import {parentPort,workerData} from 'node:worker_threads';
import http from 'node:http';
import {readServiceConfiguration} from './producer-client.mjs';
import {SOUND_MAP_WIRE,geometryWireBudget} from './ui/wire-limits.mjs';
let config=workerData,refresh=false;
parentPort.on('message',message=>{
  if(refresh){try{config=readServiceConfiguration(workerData.filename);refresh=false;}catch{parentPort.postMessage({ok:false});return;}}
  let data;try{if(message.preparedGeometry){const {header,bodyBytes}=message.preparedGeometry;if(message.route!=='/api/telemetry'||!(bodyBytes instanceof Uint8Array)||bodyBytes.byteLength>SOUND_MAP_WIRE.installedGeometryBytes-4096)throw Error('prepared-geometry-byte-budget');const text=new TextDecoder('utf-8',{fatal:true}).decode(bodyBytes);message.body.geometry={...JSON.parse(text),...header};}
    data=Buffer.from(JSON.stringify(message.body));if(data.length>(message.route==='/api/telemetry'?SOUND_MAP_WIRE.telemetryBytes:1048576))throw Error('message-byte-budget');
    if(message.route==='/api/telemetry'){const {frame,geometry}=message.body;if(Buffer.byteLength(JSON.stringify(frame))>SOUND_MAP_WIRE.frameBytes)throw Error('frame-byte-budget');if(geometry){const budget=geometryWireBudget(geometry);if(!Array.isArray(geometry.surfaces)||geometry.surfaces.length>budget.surfaces||Buffer.byteLength(JSON.stringify(geometry))>budget.bytes)throw Error('geometry-byte-or-surface-budget');}}}
  catch(error){parentPort.postMessage({ok:false,reason:error.message,byteBudgetRejected:true});return;}
  const req=http.request(config.url+message.route,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':data.length,'X-RichAudio-Token':config.token},timeout:300},res=>{res.resume();res.on('end',()=>{refresh=res.statusCode!==200;parentPort.postMessage({ok:res.statusCode===200});});});
  req.on('timeout',()=>req.destroy(Error('SoundMap timeout')));req.on('error',()=>{refresh=true;parentPort.postMessage({ok:false});});req.end(data);
});
