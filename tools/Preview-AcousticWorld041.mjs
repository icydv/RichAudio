// Explicit offline demonstration only. Original synthetic keys/resources/poses;
// no archive access, audio pipeline, native getter, recording or deployment.
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {worldFixture041} from '../tests/fixtures/World041.mjs';
import {qualifyResourceInventory04} from '../src/acoustics/world/resource-inventory04.mjs';
import {ResourceTileBuilder04} from '../src/acoustics/world/cache-builder04.mjs';
import {ScenePreparation03} from '../src/acoustics/world/scene-preparation03.mjs';
import {CausalSimulation} from '../src/acoustics/streaming/causal.mjs';
import {SoundMapTelemetry} from '../src/acoustics/streaming/soundmap-telemetry.mjs';
import {cachedWorldFromBuilder041} from './soundmap/cache-world041.mjs';
import {startSoundMap} from './soundmap/server.mjs';
export async function prepareOriginalWorldPreview041(){
 const f=worldFixture041(),inventory=qualifyResourceInventory04(f.inventory),builder=new ResourceTileBuilder04({...f,inventory}),preparation=new ScenePreparation03({session:f.session,worldDigest:inventory.inventoryDigest});
 try{
  await builder.prepareNearby({listenerAnchor:[-4,0,1.2],maximumTiles:1});const union=await preparation.prepare({contexts:builder.contexts(),listenerAnchor:[-4,0,1.2]});if(union.state!=='prepared')throw Error('Original fixture scene unavailable');
  const simulation=new CausalSimulation(union.prepared.scene),telemetry=new SoundMapTelemetry({enabled:true,fps:20});
  const step=(time,producedAtUnixMs=Date.now())=>{
   telemetry.begin(simulation,time*1000);simulation.observe({time,session:f.session,generation:1,listener:{position:[-3.8,0,1.2],forward:[0,1,0]},sources:[{id:'authored-source',position:[-4.2,0,1.2],forward:[0,1,0]}]});
   const control=simulation.update(time,{geometryTimeMs:time*1000});return {control,...telemetry.publish(simulation,control,{producedAtUnixMs})};
  };
  // The warmup emits geometry once. Retain that exact snapshot alongside the
  // latest frame so a newly started read-only viewer receives both identities.
  let sample,geometry;for(let i=0;i<=6;i++){sample=step(i*.05);geometry=sample.soundMapGeometry??geometry;}
  sample={...sample,soundMapGeometry:geometry};
  const frame=sample.soundMapFrame,coordinateKey='model:'+frame.streamId+':'+frame.sessionId+':'+JSON.stringify(frame.calibration??null);
  const cache=cachedWorldFromBuilder041(builder,{expectedArtifacts:builder.artifactBindings(),geometryTimeMs:300,alignment:{basis:'original-authored-exact-model-alignment',session:f.session,acousticSession:frame.listenerSessionId,coordinateKey}});
  return {fixture:f,inventory,builder,preparation,simulation,telemetry,step,sample,cache,async close(){await builder.close();await preparation.close();}};
 }catch(error){await builder.close();await preparation.close();throw error;}
}
export async function serveOriginalWorldPreview041({root,maximumSeconds=120}={}){
 if(!Number.isInteger(maximumSeconds)||maximumSeconds<1||maximumSeconds>120)throw Error('Bounded offline preview duration');
 const preview=await prepareOriginalWorldPreview041(),service=await startSoundMap({root,port:0});await service.cacheWorld.publish(preview.cache);
 const publish=async sample=>{const response=await fetch(service.descriptor.url+'/api/telemetry',{method:'POST',headers:{'X-RichAudio-Token':service.descriptor.token,'Content-Type':'application/json'},body:JSON.stringify({frame:sample.soundMapFrame,geometry:sample.soundMapGeometry})});if(!response.ok)throw Error('Original fixture publication rejected');};
 await publish(preview.sample);let tick=7,active=false,stopped=false;
 const timer=setInterval(async()=>{if(active||stopped)return;active=true;try{await publish(preview.step(tick++*.05));}catch{await close();}finally{active=false;}},50);
 const deadline=setTimeout(()=>void close(),maximumSeconds*1000);
 async function close(){if(stopped)return;stopped=true;clearInterval(timer);clearTimeout(deadline);await service.close();await preview.close();}
 return {preview,service,url:service.descriptor.url,close};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url))),root=path.resolve(process.argv[2]??path.join(repo,'.local','world041-preview'));
 if(!root.startsWith(path.join(repo,'.local')+path.sep))throw Error('Explicit private preview output');await fs.mkdir(root,{recursive:true});
 const running=await serveOriginalWorldPreview041({root});console.log(JSON.stringify({kind:'original-world041-offline-preview',url:running.url,maximumSeconds:120,selectedPaths:running.preview.sample.control.paths.length,reflections:running.preview.sample.soundMapFrame.paths.filter(p=>p.status==='selected'&&p.order>0).length,recording:false,audioEndpoint:false,installedWorld:false}));
 process.once('SIGINT',()=>void running.close());process.once('SIGTERM',()=>void running.close());
}
