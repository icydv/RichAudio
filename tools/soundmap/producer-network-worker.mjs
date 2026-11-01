import {parentPort,workerData} from 'node:worker_threads';
import http from 'node:http';
import {readServiceConfiguration} from './producer-client.mjs';
let config=workerData,refresh=false;
parentPort.on('message',message=>{
  if(refresh){try{config=readServiceConfiguration(workerData.filename);refresh=false;}catch{parentPort.postMessage({ok:false});return;}}
  const data=Buffer.from(JSON.stringify(message.body));
  const req=http.request(config.url+message.route,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':data.length,'X-RichAudio-Token':config.token},timeout:300},res=>{res.resume();res.on('end',()=>{refresh=res.statusCode!==200;parentPort.postMessage({ok:res.statusCode===200});});});
  req.on('timeout',()=>req.destroy(Error('SoundMap timeout')));req.on('error',()=>{refresh=true;parentPort.postMessage({ok:false});});req.end(data);
});
