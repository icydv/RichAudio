// Dedicated control worker. Never loaded by the audio render callback/game fiber.
import {parentPort,workerData} from 'node:worker_threads';
import {decodeSceneTileContext03,composeSceneUnion03,encodeUnionResult03} from './scene-union03.mjs';
try{
 const {contexts,...request}=workerData.request;
 const result=composeSceneUnion03({...request,contexts:contexts.map(decodeSceneTileContext03)});
 parentPort.postMessage({schema:1,requestId:workerData.requestId,passed:true,result:encodeUnionResult03(result)});
}catch(error){parentPort.postMessage({schema:1,requestId:workerData.requestId,passed:false,reason:String(error.message).slice(0,256)});}
finally{parentPort.close();}
