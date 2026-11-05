// Persistent derived-cache reader. This worker never opens a game archive,
// invokes CodeWalker, acquires telemetry or produces PCM.
import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';
import {InstalledStaticWorld01,encodeInstalledStaticScene01,prepareInstalledStaticSceneTransfer01} from './installed-static-scene01.mjs';
import {prepareInstalledSoundMapGeometry01} from '../streaming/soundmap-telemetry.mjs';
const reason=e=>String(e?.message??e).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,240);
let world=null,failed=false,lastRequest=0,catalogSHA256=null,bindingEpoch=0,poll=null,manifestStamp=null;
const {schema,config,session}=workerData??{};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),automatic=config?.catalogSHA256==null;
const pendingStatus=()=>({stage:'preparing/indexing',installedWorldVerified:false,genuineResourceVerified:false,runtimeActivationVerified:false,preparation:{completedEligibleTiles:0,eligibleTiles:0,totalTiles:0},actualWorldCoverage:'unmeasured'});
function worldStatus(){const status=world.status();return {...status,genuineResourceVerified:status.lastWindow?.genuineResourceVerified===true&&status.lastWindow.activeSurfaces>0};}
function post(type,extra={},transfer=[]){parentPort.postMessage({schema:1,type,session,catalogSHA256,bindingEpoch,...extra},transfer);}
function fail(error,phase,requestId=null){if(failed)return;failed=true;clearTimeout(poll);post('failed',{reason:reason(error),phase,requestId});world?.close();world=null;parentPort.close();}
function refresh(){
 try{
  const info=fs.statSync(config.manifestPath,{bigint:true}),stamp=[info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');
  if(world&&stamp===manifestStamp)return true;
  if(info.size<=0||info.size>67108864n)throw Error('Bounded known installed scene manifest required');
  const manifest=JSON.parse(fs.readFileSync(config.manifestPath,'utf8').replace(/^\uFEFF/,'')),admitted=manifest.ResolvedCatalogSHA256;
  if(manifest.Schema!==1||!hex(admitted)||(config.expectedGameSHA256!==undefined&&manifest.InputBinding?.GameExecutableSHA256!==config.expectedGameSHA256)||(!automatic&&admitted!==config.catalogSHA256))throw Error('Installed scene manifest game/catalogue identity');
  const changed=catalogSHA256!==admitted;
  if(changed||world===null){world?.close();world=null;catalogSHA256=admitted;bindingEpoch++;world=new InstalledStaticWorld01({...config,catalogSHA256});}
  else world.reload();
  manifestStamp=stamp;post(changed?'ready':'status',{ready:true,status:worldStatus()});return true;
 }catch(error){
  if(automatic&&error.code==='ENOENT'){
   if(world){world.close();world=null;catalogSHA256=null;bindingEpoch++;manifestStamp=null;}
   post('status',{ready:false,status:pendingStatus()});return false;
  }
  throw error;
 }
}
function schedulePoll(){if(failed)return;poll=setTimeout(()=>{try{refresh();schedulePoll();}catch(error){fail(error,'cache-refresh');}},1000);}
try{
 if(schema!==1||!/^[a-f0-9]{32}$/.test(session)||(automatic&&!hex(config.expectedGameSHA256)))throw Error('Bound installed scene worker identity required');
 refresh();schedulePoll();
 parentPort.on('message',message=>{
  if(failed)return;
  try{
   if(message?.schema!==1||message.session!==session||(!automatic&&message.catalogSHA256!==config.catalogSHA256))throw Error('Installed scene command identity');
   if(message.type==='close'){clearTimeout(poll);world?.close();world=null;post('closed');parentPort.close();return;}
   if(message.type!=='window'||!Number.isSafeInteger(message.requestId)||message.requestId<=lastRequest)throw Error('Ordered installed scene window required');
   lastRequest=message.requestId;
   const began=performance.now();
   // The manifest may advance atomically while the existing archive builder
   // runs. Resource readers retain their independently digest-bound cache data.
   if(!refresh()){post('not-ready',{requestId:message.requestId,status:pendingStatus()});return;}
   const scene=world.window({...message.request,session}),packet=encodeInstalledStaticScene01(scene),preparedScene=prepareInstalledStaticSceneTransfer01(packet,{...message.request,session,catalogSHA256}),preparedSoundMapGeometry=prepareInstalledSoundMapGeometry01(preparedScene.scene,{requestId:message.requestId,bindingEpoch,packetDigest:packet.packetDigest}),status=worldStatus(),memory=process.memoryUsage();
   post('scene',{requestId:message.requestId,packetDigest:packet.packetDigest,preparedScene,preparedSoundMapGeometry,status:{...status,genuineResourceVerified:packet.metadata.genuineResourceVerified===true&&packet.metadata.activeSurfaces>0},workerPreparationMilliseconds:performance.now()-began,memory:{heapUsed:memory.heapUsed,external:memory.external,arrayBuffers:memory.arrayBuffers}},[preparedSoundMapGeometry.bodyBytes.buffer]);
  }catch(error){fail(error,'window',message?.requestId??null);}
 });
}catch(error){fail(error,'initialization');}
