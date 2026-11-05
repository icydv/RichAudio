// Private offline comparison: original procedural source + genuine cached
// collision surfaces through the existing CausalSimulation/StreamingRenderer.
// No archives, private source banks, endpoint, playback or game APIs are opened.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {InstalledStaticWorld01,installedStaticSceneMetadata01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {loadStaticWorldResource} from '../src/acoustics/world/static-world-resource.mjs';
import {createTile,sub,cross} from '../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {pathGeometry} from '../src/acoustics/engine/paths.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {createStockVehiclePipeline,encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {originalSourceBank05} from '../tests/fixtures/SourcePreparation05.mjs';
import {SoundMapTelemetry} from '../src/acoustics/streaming/soundmap-telemetry.mjs';
const args=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>[process.argv[2+i*2],process.argv[3+i*2]])),repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.resolve(args['--output']??'');
if(!output.startsWith(path.join(repo,'.local')+path.sep)||!args['--manifest']||!args['--catalog']||!args['--catalog-sha'])throw Error('explicit private manifest/catalog/hash/output required');
if(fs.existsSync(output))throw Error('fresh private comparison output required');fs.mkdirSync(output,{recursive:true});
const session='1'.repeat(32),map=new InstalledStaticWorld01({manifestPath:args['--manifest'],catalogPath:args['--catalog'],catalogSHA256:args['--catalog-sha']}),engine={order:2,maxPaths:32,maxReflectors:16,...vehicleDistanceSceneOptions('authored-detail-loss-v1')};
let chosen=null,attempts=[];
for(const row of map.manifest.Resources.filter(r=>r.Status==='imported-exterior-incomplete-surfaces'&&r.Result?.Counts?.triangles>1&&r.Result.Counts.triangles<=12000).slice(0,32)){
 try{const world=loadStaticWorldResource({indexPath:row.Result.IndexPath,indexSHA256:row.Result.IndexSHA256,receiptPath:row.Result.ReceiptPath,receiptSHA256:row.Result.ReceiptSHA256,catalogPath:args['--catalog'],catalogSHA256:args['--catalog-sha']}),view=world.query(world.resource.index.bounds,{maxChunks:16,maxTriangles:131072}),walls=view.triangles.filter(t=>t.normal&&Math.abs(t.normal[2])<.4).map(t=>({...t,area:Math.hypot(...cross(sub(t.positions[1],t.positions[0]),sub(t.positions[2],t.positions[0])))/2})).filter(t=>t.area>2).sort((a,b)=>b.area-a.area).slice(0,8);
  for(const wall of walls){const center=[0,1,2].map(i=>wall.positions.reduce((n,p)=>n+p[i],0)/3),edge=sub(wall.positions[1],wall.positions[0]),length=Math.hypot(...edge),u=edge.map(v=>v/length),listener=center.map((v,i)=>v+wall.normal[i]*2-u[i]*.25),source=center.map((v,i)=>v+wall.normal[i]*2+u[i]*.25),scene=map.window({listener,sources:[source],session,generation:1,geometryTimeMs:0,durationMs:60000,radius:8,maximumSurfaces:2048,engine}),ids=scene.observationModel.reflectionSurfaceIds,valid=scene.tile.surfaces.filter(s=>ids.includes(s.id)).map(s=>({surface:s,path:pathGeometry(scene,source,listener,[s])})).filter(p=>p.path.status==='clear');attempts.push({resourceId:row.Id,activeSurfaces:scene.tile.surfaces.length,candidates:ids.length,valid:valid.length,metadata:installedStaticSceneMetadata01(scene)});if(valid.length){chosen={row,scene,listener,source,valid};break;}}
  if(chosen)break;
 }catch(error){attempts.push({resourceId:row.Id,failure:error.message});}
}
fs.writeFileSync(path.join(output,'search.json'),JSON.stringify(attempts,null,2),{flag:'wx'});
if(!chosen)throw Error('no finite unblocked genuine reflection found in bounded qualified-cache search; inspect private attempts');
const {scene,source,listener}=chosen,open=acousticScene(createTile({...scene.tile,id:'installed01-open-comparison',surfaces:[],missingRegions:[]}),{}, {...scene.config,observationModel:{...scene.observationModel,reflectionSurfaceIds:[],evidence:[]}}),ids=['stock:slot0:engine','stock:slot0:exhaust'],blocks=128,frames=blocks*512,results={};
for(const [name,activeScene]of [['open',open],['genuine',scene]]){
 const voice=new StockVehicleSource(originalSourceBank05()),pipeline=createStockVehiclePipeline({scene:activeScene,sourceIds:ids,quality:'quality',acceleration:'cpu',continuousRates:true}),telemetry=new SoundMapTelemetry({enabled:true}),inputs=Object.fromEntries(ids.map(id=>[id,new Float32Array(512)])),channels=[new Float32Array(frames),new Float32Array(frames)],left=new Float32Array(512),right=new Float32Array(512),dry=createHash('sha256'),timings=[];let peak=0,nonfinite=0,lastPaths=[],lastMap=null;
 try{for(let block=0;block<blocks;block++){const began=performance.now(),time=block*512/48000;voice.renderInto({operatingPoint:.5,load:.9,lift:false,running:true},inputs[ids[0]],inputs[ids[1]]);for(const id of ids)dry.update(Buffer.from(inputs[id].buffer));telemetry.begin(pipeline.simulation,time*1000);const control=await pipeline.prepare({time,session,generation:1,listener:{position:listener,forward:[0,1,0],up:[0,0,1]},sources:ids.map(id=>({id,generation:1,position:source,velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],directivity:0}))},{geometryTimeMs:time*1000});pipeline.process(inputs,left,right);timings.push(performance.now()-began);channels[0].set(left,block*512);channels[1].set(right,block*512);for(let i=0;i<512;i++){peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));if(!Number.isFinite(left[i])||!Number.isFinite(right[i]))nonfinite++;}lastPaths=control.paths;const packet=telemetry.publish(pipeline.simulation,control);if(packet.soundMapFrame)lastMap={...lastMap,...packet};}
 const bytes=encodeVehicleWav(channels);fs.writeFileSync(path.join(output,name+'.wav'),bytes,{flag:'wx'});if(lastMap)fs.writeFileSync(path.join(output,name+'-soundmap.json'),JSON.stringify(lastMap),{flag:'wx'});results[name]={source:'original-analytic-bank05; not private Bati PCM',frames,sourceFrame:voice.frame,drySHA256:dry.digest('hex'),wavSHA256:createHash('sha256').update(bytes).digest('hex'),peak,nonfinite,paths:lastPaths,directPaths:lastPaths.filter(p=>p.order===0).length,reflectedPaths:lastPaths.filter(p=>p.order>0).length,processingMs:timings,over8ms:timings.filter(t=>t>8).length,overHardDeadline:timings.filter(t=>t>512/48000*1000).length,maximumMs:Math.max(...timings),diagnostics:pipeline.diagnostics(),soundMapGeometryMatchesScene:lastMap?.soundMapGeometry?.geometryKey===activeScene.geometryKey};
 }finally{pipeline.close();}
}
if(results.open.drySHA256!==results.genuine.drySHA256||results.open.wavSHA256===results.genuine.wavSHA256||results.genuine.reflectedPaths<1||results.genuine.nonfinite)throw Error('genuine reflection/dry continuity comparison failed');
const report={kind:'RichAudioGenuineStaticReflections01',passed:true,basis:'genuine-private-derived-collision-plus-original-analytic-source',sceneMetadata:installedStaticSceneMetadata01(scene),source,listener,results,installedWorldComplete:false,liveVerified:false,played:false,endpointOpened:false};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});map.close();console.log(JSON.stringify({passed:true,output,activeSurfaces:scene.tile.surfaces.length,reflectedPaths:results.genuine.reflectedPaths,openPaths:results.open.reflectedPaths,exactDryPCM:true,distinctRenderedPCM:true,openPeak:results.open.peak,genuinePeak:results.genuine.peak,genuineOver8ms:results.genuine.over8ms,genuineOverHardDeadline:results.genuine.overHardDeadline,genuineMaximumMs:results.genuine.maximumMs,liveVerified:false}));
