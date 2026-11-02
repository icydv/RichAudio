// Explicit private offline comparison: original real-format bytes and unchanged
// private Bati banks. No game/endpoint/capture/native calls or source tuning.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {StockGameplay} from '../src/acoustics/vehicle/gameplay.mjs';
import {loadStockCatalogAssets,loadStockNpcAssets} from '../src/acoustics/vehicle/stock-source.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {prepareExplicitResourceBatch03,validateImportedTile03} from '../src/acoustics/world/resource-import03.mjs';
import {originalResourceOptions03} from '../tests/fixtures/ResourceFormats03.mjs';
import {createSceneTileContext03} from '../src/acoustics/world/scene-union03.mjs';
import {ScenePreparation03} from '../src/acoustics/world/scene-preparation03.mjs';
const repo=path.resolve(fileURLToPath(new URL('..',import.meta.url))),args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert(['--resource-receipt','--private-package','--output'].includes(args[i])&&args[i+1]&&!Object.hasOwn(options,args[i]));options[args[i]]=path.resolve(args[i+1]);}
assert.equal(Object.keys(options).length,3,'Explicit original resource receipt, existing private Bati package and fresh output required');
const out=options['--output'];assert(out.startsWith(path.join(repo,'.local')+path.sep)&&!fs.existsSync(out),'Fresh private output required');
for(const p of [out,options['--resource-receipt'],options['--private-package']])for(let at=p;at!==path.dirname(at);at=path.dirname(at))if(fs.existsSync(at))assert(!fs.lstatSync(at).isSymbolicLink(),'Linked private input/output refused');
const hash=b=>createHash('sha256').update(b).digest('hex'),read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const receipt=read(options['--resource-receipt']);assert(receipt.passed&&receipt.gameFilesRead===false&&receipt.endpointOpened===false);
assert.equal(receipt.result.kind,'original-resource-building03-roundtrips');
for(const pin of receipt.sources){const file=path.resolve(repo,pin.file);assert(file.startsWith(repo+path.sep));assert.equal(hash(fs.readFileSync(file)),pin.sha256,'Parser adapter source changed since resource proof');}
const root=options['--private-package'],inside=relative=>{const file=path.resolve(root,relative);assert(file.startsWith(root+path.sep));return file;};
const manifest=read(inside('playable.json')),packageHash=hash(fs.readFileSync(inside('playable.json')));
for(const b of manifest.bindings)assert.equal(hash(fs.readFileSync(inside(b.file))),b.sha256,'Original source package changed');
const assets=loadStockCatalogAssets(inside(manifest.playerManifest),{sustainAtlasFile:inside(manifest.atlas)}),npcAssets=loadStockNpcAssets(inside(manifest.npcManifest));
const registry=loadInstalledStockRegistry({catalogFile:inside(manifest.catalog),catalogSha256:manifest.catalogSha256,assets,npcAssets}),profiles=read(inside(manifest.profiles));
fs.mkdirSync(out,{recursive:true});
const baselineCommit='e9d256f26841546f42e6cee1de0889e1b2616c8d',relative='src/acoustics/vehicle/gameplay.mjs';
const original=execFileSync('git',['show',baselineCommit+':'+relative],{cwd:repo,maxBuffer:1000000});
const originalBlob=execFileSync('git',['rev-parse',baselineCommit+':'+relative],{cwd:repo,encoding:'utf8'}).trim();
assert.equal(createHash('sha1').update('blob '+original.length+'\0').update(original).digest('hex'),originalBlob);
const relocated=original.toString('utf8').replace(/from\s*(['"])(\.[^'"]+)\1/g,(_all,_quote,dependency)=>'from '+JSON.stringify(pathToFileURL(path.resolve(repo,path.dirname(relative),dependency)).href));
const originalFile=path.join(out,'original-gameplay.mjs');fs.writeFileSync(originalFile,relocated,{flag:'wx'});const {StockGameplay:Original}=await import(pathToFileURL(originalFile));
const closure=new Map();function source(file){file=path.resolve(file);if(closure.has(file))return;const text=fs.readFileSync(file,'utf8');closure.set(file,hash(fs.readFileSync(file)));for(const m of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))source(path.resolve(path.dirname(file),m[1]));}
source(fileURLToPath(import.meta.url));source(path.join(repo,'src/acoustics/world/scene-worker03.mjs'));
const stats=a=>{a=[...a].sort((a,b)=>a-b);return {count:a.length,median:a[Math.ceil((a.length-1)*.5)],p95:a[Math.ceil((a.length-1)*.95)],p99:a[Math.ceil((a.length-1)*.99)],maximum:a.at(-1),mean:a.reduce((a,b)=>a+b,0)/a.length};};
const frames=192000,session='c'.repeat(32),results=[],channelsByArm=new Map();
for(const [arm,profile]of [['exact-original',null],['unchanged-default',null],['open','gen9-open'],['building','gen9-building'],['passage','gen9-passage']]){
 let wall=0,sequence=0;const engine=new (arm==='exact-original'?Original:StockGameplay)({registry,profiles,session,now:()=>wall}),channels=[new Float32Array(frames),new Float32Array(frames)],dry=createHash('sha256'),cost=[],paths=new Map();
 engine.setSettings({quality:'balanced',acceleration:'cpu',enabled:true,volume:1,reflections:true,mode:'experimental-additive'});
 let background=null,prepared=null,resourceMs=0,worldDigest=null,sourceObject=null,sourceFrame=null,sourceBuffers=null,continuousFrames=0;
 try{
  if(profile){
   const group=receipt.result.groups.find(g=>g.profile===profile);assert(group&&group.gen9===true,'Exact original Gen9 profile required');
   const bytes=Object.fromEntries(group.resources.map(r=>[r.kind,fs.readFileSync(path.join(path.dirname(options['--resource-receipt']),profile,'original.'+r.kind))]));
   const begin=performance.now(),configuration=originalResourceOptions03(group,bytes,{session});configuration.listenerAnchor=[-2,0,1.5];
   const imported=prepareExplicitResourceBatch03(configuration);assert.equal(imported.state,'prepared-original-resource-subset');worldDigest=imported.worldDigest;
   const contexts=imported.tiles.map(t=>{validateImportedTile03(t);return createSceneTileContext03({tileId:t.tileId,worldDigest,
    scene:acousticScene(t.engineTile,t.materials,{order:2,...vehicleDistanceSceneOptions('authored-detail-loss-v1')}),sourceBindings:t.sources,layout:'gen9-rsc7'});});
   background=new ScenePreparation03({session,worldDigest});prepared=await background.prepare({contexts,listenerAnchor:[-2,0,1.5],budgetMilliseconds:10000});assert.equal(prepared.state,'prepared');assert.equal(prepared.workerJoined,true);
   engine.setPreparedResourceScene03(prepared.prepared.scene,{worldDigest,generation:prepared.prepared.generation});resourceMs=performance.now()-begin;
  }
  for(let at=0;at<frames;at+=512){
   if(at/512%5===0){const ticks=Math.round((1000+wall)*10000),operatingPoint=.3+.5*(.5+.5*Math.sin(at/512*.017));
    engine.accept({version:1,session,listener:{version:1,session,generation:1,sequence:sequence++,observationTicks:ticks,clockFrequency:10000000,gameTimeMs:Math.round(wall),position:[-2,0,1.5],velocity:[0,0,0],forward:[1,0,0],up:[0,0,1],listenerKind:'camera',velocityKind:'estimated-camera-difference',paused:false,valid:true,reason:'valid',coordinates:'gta-native-unscaled',units:'native-unverified',sourceId:null},
     vehicles:[{id:'matched-private-bati',generation:1,observationTicks:ticks,model:0xf9300cc5,context:'player',position:[2,0,0],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],operatingPoint,running:true,valid:true}]},0,200);}
   const start=performance.now(),pcm=await engine.render();cost.push(performance.now()-start);for(let c=0;c<2;c++)channels[c].set(pcm[c],at);
   for(const id of engine.ids)dry.update(Buffer.from(engine.inputs[id].buffer));
   const slot=engine.slots.find(s=>s.source);if(slot){sourceObject??=slot.source;assert.equal(slot.source,sourceObject);if(sourceFrame!==null){assert.equal(slot.source.frame-sourceFrame,512);continuousFrames+=512;}sourceFrame=slot.source.frame;
    sourceBuffers??=engine.pipeline.renderer.sourceList.map(s=>s.bands);engine.pipeline.renderer.sourceList.forEach((s,i)=>assert.equal(s.bands,sourceBuffers[i]));}
   for(const p of engine.pipeline.lastControl.paths)if(!paths.has(p.id))paths.set(p.id,{id:p.id,order:p.order,distance:p.distance,delaySeconds:p.delaySeconds??p.delay,bands:p.bands});wall+=512000/48000;
  }
  const diagnostics=engine.diagnostics(),pcmSha256=hash(Buffer.concat(channels.map(c=>Buffer.from(c.buffer))));let peak=0,energy=0;
  for(const c of channels)for(const value of c){assert(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));energy+=value*value;}
  assert(peak<1);assert.equal(diagnostics.stageCounters.sourceCreations,1);assert.equal(diagnostics.pipeline.history.affectedFrames,0);assert.equal(diagnostics.pipeline.renderer.missingHistory,0);assert.equal(diagnostics.pipeline.renderer.limited,0);
  const wave=encodeVehicleWav(channels);fs.writeFileSync(path.join(out,arm+'.wav'),wave,{flag:'wx'});channelsByArm.set(arm,channels);
  results.push({arm,worldDigest,sourceSha256:dry.digest('hex'),pcmSha256,waveSha256:hash(wave),frames,peak,rms:Math.sqrt(energy/(frames*2)),resourceAndScenePreparationMs:resourceMs,
   processingMs:stats(cost),workerBudgetMs:512000/48000,workerBudgetMisses:cost.filter(n=>n>512000/48000).length,sourceCreations:diagnostics.stageCounters.sourceCreations,
   continuousSourceFramesVerified:continuousFrames,historyAffectedFrames:diagnostics.pipeline.history.affectedFrames,rendererLimitedSamples:diagnostics.pipeline.renderer.limited,
   headroomPathsOmitted:diagnostics.headroomPathsOmitted,sourceHistoryBytes:diagnostics.pipeline.sourceHistoryBytes,selectedPaths:[...paths.values()],background:background?{...background.stats}:null});
 }finally{engine.close();if(background)await background.close();}
}
assert.equal(results[0].pcmSha256,results[1].pcmSha256,'The current untouched default must remain bit-exact to original e9d256f');
assert.equal(results[1].pcmSha256,results[2].pcmSha256,'A decoded open actual-format map must not change the default Bati PCM');
assert(results.every(r=>r.sourceSha256===results[0].sourceSha256),'Identical genuine dry Bati excitation required in every arm');
for(const r of results.slice(3)){assert(r.selectedPaths.some(p=>p.order>0));assert.notEqual(r.pcmSha256,results[2].pcmSha256);let energy=0;
 for(let c=0;c<2;c++)for(let i=0;i<frames;i++)energy+=(channelsByArm.get(r.arm)[c][i]-channelsByArm.get('open')[c][i])**2;
 r.reflectionDifferenceRms=Math.sqrt(energy/(frames*2));assert(r.reflectionDifferenceRms>1e-6);}
for(const [file,sha]of closure)assert.equal(hash(fs.readFileSync(file)),sha,'Source changed during measured comparison');
for(const b of manifest.bindings)assert.equal(hash(fs.readFileSync(inside(b.file))),b.sha256,'Private source package changed');
const report={schema:1,passed:true,kind:'world03-real-format-resource-to-private-Bati-PCM',baselineCommit,originalGameplayGitBlob:originalBlob,originalGameplayCanonicalSha256:hash(original),
 sourcePackageManifestSha256:packageHash,resourceReceiptSha256:hash(fs.readFileSync(options['--resource-receipt'])),parserSHA256:receipt.parserSha256,
 resourceGeometry:'Original authored actual RSC7 Gen9 YMAP/YTYP/YBN bytes decoded by pinned public CodeWalker; not an installed Los Santos resource',
 source:'Unchanged existing private genuine Bati source banks; operating observations/poses are authored offline comparison inputs',
 sourcePins:[...closure].map(([file,sha256])=>({file:path.relative(repo,file).replaceAll('\\','/'),sha256})),frames,sampleRate:48000,
 matchedDryPcmBitExact:true,currentDefaultPcmBitExactToOriginal:true,decodedOpenPcmBitExactToDefault:true,calibrationChanged:false,sourceBankChanged:false,
 audioQueueFramesAdded:0,gameplayEventBusEnabled:false,installedWorldVerified:false,physicalLatencyMeasured:false,endpointOpened:false,gameLaunched:false,recordingStarted:false,
 nodeVersion:process.version,memoryBytesAfterArms:process.memoryUsage(),memoryScope:'post-arm process snapshot, not peak',results};
fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,output:out,defaultBitExact:true,dryBitExact:true,arms:results.map(r=>({arm:r.arm,peak:r.peak,reflectionDifferenceRms:r.reflectionDifferenceRms??0,processingMs:r.processingMs,workerBudgetMisses:r.workerBudgetMisses}))},null,2));
