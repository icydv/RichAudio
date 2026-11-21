// Controlled original XML/analytic-source ablation through the existing engine.
// No endpoint, recording, installed reader, diffraction model or bank loader.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {prepareXmlBuildingPipeline05} from '../src/acoustics/world/xml-building05.mjs';
import {verifyXmlAdmission05} from '../src/acoustics/world/xml-evidence05.mjs';
import {StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {createStockVehiclePipeline,encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {createTile,querySegment} from '../src/acoustics/research/local-geometry.mjs';
import {freeze,requireWorld,fields,vector} from '../src/acoustics/world/contracts.mjs';
const ids=Object.freeze(['stock:slot0:engine','stock:slot0:exhaust']),FS=48000,BLOCK=512;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
export const xmlAcousticPoses05=freeze({beside:{source:[-5,-5,1],listener:[5,-5,1]},obstructed:{source:[0,-6,1],listener:[0,6,1]}});
const operating=Object.freeze({operatingPoint:.5,load:.9,lift:false,running:true});
function emitters(position){return ids.map((id,i)=>({id,generation:1,position:position.map((v,k)=>v+(k===1?(i?-.75:.35):0)+(k===2?(i?.3:.65):0)),velocity:[0,0,0],forward:i?[0,-1,0]:[0,1,0],up:[0,0,1],directivity:i?.65:.1,valid:true,emitting:true}));}
function checkedPoses(poses,region){
 fields(poses,['beside','obstructed']);const result={};
 for(const name of ['beside','obstructed']){const p=poses[name];fields(p,['source','listener']);const source=vector(p.source),listener=vector(p.listener),inside=point=>point.every((v,i)=>v>=region.min[i]&&v<=region.max[i]);requireWorld([source,listener,...emitters(source).map(s=>s.position)].every(inside),'explicit source, emitters and listener must lie within admitted tile bounds');result[name]={source,listener};}
 return freeze(result);
}
function metric(channels,skip){let total=0,steady=0,peak=0,nonzero=0;for(const c of channels)for(let i=0;i<c.length;i++){const value=c[i];requireWorld(Number.isFinite(value)&&Math.abs(value)<=1,'finite bounded original comparison PCM');total+=value*value;if(i>=skip)steady+=value*value;peak=Math.max(peak,Math.abs(value));if(value!==0)nonzero++;}return {peak,rms:Math.sqrt(total/(channels.length*channels[0].length)),steadyRms:Math.sqrt(steady/(channels.length*(channels[0].length-skip))),nonzeroSamples:nonzero};}
function difference(a,b,skip){let energy=0,count=0;for(let c=0;c<a.length;c++)for(let i=skip;i<a[c].length;i++){energy+=(a[c][i]-b[c][i])**2;count++;}return Math.sqrt(energy/count);}
function stereoHash(channels){const digest=createHash('sha256');for(const c of channels)digest.update(bytes(c));return digest.digest('hex');}
const loss=(value,reference)=>reference.map((r,i)=>value[i]===0?null:-20*Math.log10(value[i]/r));

async function renderCase({scene,poses,bank,session,blocks,replacements=[]}){
 const constructionStarted=performance.now(),source=new StockVehicleSource(bank),sourceConstructionMs=performance.now()-constructionStarted;
 requireWorld(source.frame===0,'source preparation must not pre-roll PCM');
 const pipeline=createStockVehiclePipeline({scene,sourceIds:ids,quality:'balanced',acceleration:'cpu',masterGain:.175,continuousRates:true});
 pipeline.simulation.setProcessingSettings({pathBudget:pipeline.renderer.maxPathsPerSource,maxReflectors:16,earlyReflections:true});
 const input=Object.fromEntries(ids.map(id=>[id,new Float32Array(BLOCK)])),left=new Float32Array(BLOCK),right=new Float32Array(BLOCK),channels=[new Float32Array(blocks*BLOCK),new Float32Array(blocks*BLOCK)],dry=createHash('sha256');
 let histories=null,historyStable=true,cursorContinuous=true,previousCursor=0,finalPaths=[],candidateReasons={},sourceCount=1;
 const sceneChanges=[];
 try{
  for(let block=0;block<blocks;block++){
   const time=block*BLOCK/FS;
   for(const replacement of replacements.filter(r=>r.block===block)){pipeline.replaceScene(replacement.scene);sceneChanges.push({block,sourceFrame:source.frame,rendererFrame:pipeline.renderer.frame,sourceObjectUnchanged:true});}
   source.renderInto(operating,input[ids[0]],input[ids[1]]);cursorContinuous&&=source.frame-previousCursor===BLOCK;previousCursor=source.frame;
   for(const id of ids)dry.update(bytes(input[id]));
   pipeline.simulation.captureSoundMap=block===blocks-1;
   const control=await pipeline.prepare({time,session,generation:1,listener:{position:poses.listener,velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],valid:true,generation:1},sources:emitters(poses.source)},{geometryTimeMs:time*1000});
   pipeline.process(input,left,right);channels[0].set(left,block*BLOCK);channels[1].set(right,block*BLOCK);
   histories??=pipeline.renderer.sourceList.map(s=>s.bands);historyStable&&=pipeline.renderer.sourceList.every((s,i)=>s.bands===histories[i]);
   if(block===blocks-1){
    const visual=pipeline.simulation.soundMapState,byId=new Map((visual?.candidates??[]).filter(c=>c.identity).map(c=>[c.identity,c]));
    for(const candidate of visual?.candidates??[])candidateReasons[candidate.reason]=(candidateReasons[candidate.reason]??0)+1;
    finalPaths=control.paths.map(p=>{const v=byId.get(p.id);requireWorld(v&&v.result.status==='renderable','selected path must have actual solver evidence');return {id:p.id,sourceId:p.sourceId,order:p.order,distance:p.distance,delaySeconds:p.delay,bands:[...p.bands],attenuationDb:p.bands.map(g=>g===0?null:-20*Math.log10(g)),vertices:v.plan.geometry.vertices.map(point=>[...point]),materialInteractions:v.result.materialBasis.map(m=>({...m})),evidence:'selected-existing-solver-result'};});
   }
  }
  const skip=Math.min(24,Math.floor(blocks/3))*BLOCK,diagnostics=pipeline.diagnostics(),directQueries=emitters(poses.source).map(s=>({sourceId:s.id,...querySegment(pipeline.simulation.scene.tile,s.position,poses.listener)}));
  return {channels,summary:{poses,emitterPoses:emitters(poses.source),operating:{...operating},sourceConstruction:{outsideRender:true,sameNodeEventLoop:true,cpuIsolation:false,elapsedMs:sourceConstructionMs,sourceFrameBeforeRender:0},drySHA256:dry.digest('hex'),stereoSHA256:stereoHash(channels),metrics:metric(channels,skip),steadyWindowStartFrame:skip,
   finalPaths,candidateReasons,directQueries,frames:pipeline.renderer.frame,sourceFrame:source.frame,sourceCount,cursorContinuous,rendererHistoryStable:historyStable,historyAffectedFrames:diagnostics.history.affectedFrames,limited:diagnostics.renderer.limited,sceneChanges,sceneReplacements:diagnostics.simulation.sceneReplacements,sourcePressureGains:diagnostics.sourcePressureGains,masterGain:.175,pcmQueueFramesAdded:0,endpointOpened:false,recordingStarted:false}};
 }finally{pipeline.close();}
}

export async function compareXmlBuilding05({blocks=144,includePcm=false,store=null,trustedArtifacts={},building,bank:providedBank,poses:providedPoses}={}){
 requireWorld(Number.isInteger(blocks)&&blocks>=64&&blocks<=192&&typeof includePcm==='boolean','bounded original XML acoustic comparison');
 const original=building===undefined;let input,witness,bank;
 if(original){requireWorld(providedBank===undefined&&providedPoses===undefined,'supplied bank and poses require an explicit admitted building');const [{admittedOriginalXml05},{originalSourceBank05}]=await Promise.all([import('../tests/fixtures/AdmittedXml05.mjs'),import('../tests/fixtures/SourcePreparation05.mjs')]);input=admittedOriginalXml05();witness=input.witness;bank=originalSourceBank05();}
 else{fields(building,['admission','inputs','session']);requireWorld(providedBank!==undefined&&providedPoses!==undefined,'supplied building requires explicit in-memory bank and poses');witness=verifyXmlAdmission05(building.admission);requireWorld(typeof building.session==='string'&&/^[a-f0-9]{32}$/.test(building.session)&&building.inputs&&typeof building.inputs==='object','explicit supplied building inputs and session');input=building;bank=providedBank;}
 const comparisonPoses=checkedPoses(original?xmlAcousticPoses05:providedPoses,witness.bounds),engine=vehicleDistanceSceneOptions('authored-detail-loss-v1');
 const prepared=await prepareXmlBuildingPipeline05({admissions:input.admission,inputs:input.inputs,session:input.session,store,trustedArtifacts,listenerAnchor:original?[0,-6,1]:comparisonPoses.beside.listener,engine});
 try{
  const building=prepared.scene,open=acousticScene(createTile({...building.tile,id:'xml05-open-ablation',surfaces:[],missingRegions:[],coverage:'complete-synthetic'}),{},building.config),cases={},pcm={};
  for(const [name,poses]of Object.entries(comparisonPoses)){
   const reference=await renderCase({scene:open,poses,bank,session:input.session,blocks}),withBuilding=await renderCase({scene:building,poses,bank,session:input.session,blocks});
   const directLoss=ids.map(sourceId=>{const a=reference.summary.finalPaths.find(p=>p.sourceId===sourceId&&p.order===0),b=withBuilding.summary.finalPaths.find(p=>p.sourceId===sourceId&&p.order===0);return {sourceId,open:a??null,building:b??null,additionalAttenuationDb:a&&b?loss(b.bands,a.bands):null};});
   cases[name]={open:reference.summary,building:withBuilding.summary,comparison:{dryBitIdentical:reference.summary.drySHA256===withBuilding.summary.drySHA256,stereoBitIdentical:reference.summary.stereoSHA256===withBuilding.summary.stereoSHA256,steadyDifferenceRms:difference(reference.channels,withBuilding.channels,reference.summary.steadyWindowStartFrame),directLoss}};
   if(includePcm){pcm[name+'-open']=reference.channels;pcm[name+'-building']=withBuilding.channels;}
  }
  const changing=await renderCase({scene:open,poses:comparisonPoses.beside,bank,session:input.session,blocks,replacements:[{block:Math.floor(blocks/3),scene:building},{block:Math.floor(blocks*2/3),scene:open}]});
  const sourceAndControlsIdentical=new Set([...Object.values(cases).flatMap(c=>[c.open.drySHA256,c.building.drySHA256]),changing.summary.drySHA256]).size===1;
  const report=freeze({schema:1,kind:original?'RichAudioOriginalXmlAcousticComparison05':'RichAudioSuppliedXmlAcousticComparison05',source:original?'original analytic bank through existing StockVehicleSource; no genuine Bati asset':'explicit supplied-memory bank through existing StockVehicleSource; origin not certified',geometry:original?'original CodeWalker-exported XML cube; no genuine installed building':'independently admitted XML static subset; origin not certified by comparison',inputBasis:original?'original-analytic-and-XML-fixture':'controlled-supplied-memory-and-admitted-XML',sampleRate:FS,blockFrames:BLOCK,blocks,frames:blocks*BLOCK,engineProfile:'authored-detail-loss-v1',materialBasis:'explicit authored passive coefficients; no measured native material response',
   xmlResources:witness.resources,qualificationDigest:witness.qualificationDigest,cacheWorldDigest:prepared.inventory.inventoryDigest,geometryKey:building.geometryKey,geometryBounds:building.tile.bounds,finiteSurfaces:building.tile.surfaces.length,cases,
   continuity:{...changing.summary,dryMatchesReference:changing.summary.drySHA256===cases.beside.open.drySHA256,framesMatchReference:changing.summary.frames===cases.beside.open.frames},
   workers:{cacheStarted:prepared.builder.stats.workersStarted,cacheJoined:prepared.builder.stats.workersJoined,sceneStarted:prepared.preparation.stats.workersStarted,sceneJoined:prepared.preparation.stats.workersJoined},qualification:prepared.qualification,
   limits:{posesStaticPerPairedCase:true,sourceAndControlsIdentical,diffractionModelAdded:false,reflectionsInventedByViewer:false,physicalScaleOrResponseMeasured:false,realBuildingVerified:false,genuineBatiBankVerified:false,bankOriginVerified:false,privateBankFileRead:false,endpointOpened:false,recordingStarted:false,defaultGameplayChanged:false,processingDeadlineBenchmark:false}});
  return {report,pcm:includePcm?pcm:null};
 }finally{await prepared.close();}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);requireWorld(args[0]==='--run'&&args[1]==='--out'&&(args.length===3||args.length===4&&args[3]==='--write-original-wav'),'use --run --out .local/fresh-original-xml05 [--write-original-wav]');
  const repository=fileURLToPath(new URL('../',import.meta.url)),local=path.join(repository,'.local'),directory=path.resolve(repository,args[2]);requireWorld(path.dirname(directory)===local&&/^[\w-]+$/.test(path.basename(directory)),'fresh private original comparison directory');
  await fs.mkdir(local,{recursive:true});const stat=await fs.lstat(local);requireWorld(stat.isDirectory()&&!stat.isSymbolicLink(),'owned private comparison parent');await fs.mkdir(directory);
  const result=await compareXmlBuilding05({includePcm:args.length===4});const files=[];
  if(result.pcm)for(const [name,channels]of Object.entries(result.pcm)){const data=encodeVehicleWav(channels),file='original-analytic-'+name+'.wav';await fs.writeFile(path.join(directory,file),data,{flag:'wx'});files.push({file,sha256:sha(data),bytes:data.length,source:'original-analytic-only-no-recording'});}
  const report={...result.report,optionalOriginalWavs:files},data=JSON.stringify(report,null,2)+'\n';await fs.writeFile(path.join(directory,'comparison.json'),data,{flag:'wx'});console.log(JSON.stringify({kind:report.kind,sha256:sha(data),cases:Object.fromEntries(Object.entries(report.cases).map(([name,c])=>[name,{dryIdentical:c.comparison.dryBitIdentical,differenceRms:c.comparison.steadyDifferenceRms,openRms:c.open.metrics.steadyRms,buildingRms:c.building.metrics.steadyRms,buildingPaths:c.building.finalPaths.length}])),originalWavs:files.length,endpoint:false,recording:false,genuineBuilding:false}));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
