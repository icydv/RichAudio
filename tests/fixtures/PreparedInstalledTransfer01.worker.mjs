// Original-only or explicitly supplied derived-cache transfer proof. Never
// opens a game archive, endpoint, game executable or audio bank.
import {parentPort,workerData} from 'node:worker_threads';
import {InstalledStaticWorld01,encodeInstalledStaticScene01,prepareInstalledStaticSceneTransfer01} from '../../src/acoustics/world/installed-static-scene01.mjs';
try{
 const {packet:input,config,request,expected}=workerData;let world=null,packet=input;
 if(config){world=new InstalledStaticWorld01(config);packet=encodeInstalledStaticScene01(world.window(request));}
 const preparedScene=prepareInstalledStaticSceneTransfer01(packet,expected);
 for(let n=0;n<(workerData.messages??1);n++)parentPort.postMessage({schema:1,type:'scene',session:expected.session,catalogSHA256:expected.catalogSHA256,bindingEpoch:1,requestId:n+1,packetDigest:packet.packetDigest,preparedScene,referencePacket:packet});
 world?.close();
}catch(error){parentPort.postMessage({schema:1,type:'failed',reason:String(error.message)});}
finally{parentPort.close();}
