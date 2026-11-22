// Manufacture only original test inputs and bind the actual product files.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {writeOriginalGameplayPackageStreet01} from './StreetGameplayPackage01.mjs';
import {originalInstalledCache01} from './InstalledStaticCache01.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const [directory,owner,node,host,mode,retainedSourceManifest,retainedWorld,wallPose,...phases]=process.argv.slice(2);
const root=path.join(directory,'package');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const copy=(from,to)=>{
 fs.mkdirSync(path.dirname(to),{recursive:true});
 fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);
};
if(!path.resolve(directory).startsWith(path.join(repo,'.local','street01')+path.sep)||!['fleet','legacy'].includes(mode))throw Error('Private clocked benchmark package required');
fs.mkdirSync(root);
const gameHash=hash(owner);
let epoch=null,config;
const manifest=path.join(root,'playable.json');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const inside=(base,relative)=>{
 const target=path.resolve(base,relative);
 if(path.isAbsolute(relative)||!target.startsWith(base+path.sep))throw Error('Clocked fixture file escapes package');
 return target;
};
if(retainedSourceManifest){
 if(!retainedWorld||!wallPose||mode!=='fleet')throw Error('Retained sources, world and wall pose required together');
 for(const file of [retainedSourceManifest,retainedWorld,wallPose])if(!path.resolve(file).split(path.sep).includes('.local'))throw Error('Retained benchmark inputs must remain private');
 const sources=read(retainedSourceManifest), sourceRoot=path.dirname(path.resolve(retainedSourceManifest));
 const geometry=read(retainedWorld), pose=read(wallPose);
 const resourceId=pose.sourceResourceId??pose.resourceId;
 const multiWall=phases.includes('multi-wall');
 const resourceIds=multiWall&&pose.resourceIds?pose.resourceIds:[resourceId];
 const validVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
 if(!validVector(pose.listener)||!validVector(pose.source)||Math.hypot(...pose.source.map((x,i)=>x-pose.listener[i]))>(multiWall?128:12)||
    !Array.isArray(resourceIds)||resourceIds.length<1||resourceIds.length>32||!resourceIds.includes(resourceId)||
    resourceIds.some(id=>!/^[a-f0-9]{24}$/.test(id))||new Set(resourceIds).size!==resourceIds.length||
    !/^installed01:[a-f0-9]{40}$/.test(pose.surfaceId))
   throw Error('Bounded wall fixture pose and retained surface identity required');
 const catalogueSHA256=hash(geometry.catalogPath),gameManifest=read(geometry.manifestPath);
 if(catalogueSHA256!==geometry.catalogSHA256||gameManifest.ResolvedCatalogSHA256!==catalogueSHA256||
    gameManifest.InputBinding?.GameExecutableSHA256!==sources.gameSha256||hash(sources.gameExecutable)!==sources.gameSha256)
   throw Error('Retained catalogue, geometry and source game identity differ');
 if(multiWall)copy(path.join(directory,'gpu-build/RichAudio.AcousticGpu.exe'),path.join(root,'build/acoustic-gpu/RichAudio.AcousticGpu.exe'));
 for(const binding of sources.bindings.filter(b=>b.file.startsWith('sources/'))){
  const from=inside(sourceRoot,binding.file);
  if(hash(from)!==binding.sha256)throw Error('Retained audio package source changed');
  copy(from,inside(root,binding.file));
 }
 const traffic=phases.find(phase=>phase.startsWith('traffic-route='));
 let routeEndpoints;
 if(phases.some(phase=>phase!==traffic&&!['multi-wall','warm-wall','ranked-reflections','cpu-only','npc-synthesis-worker','x80-bandlimited'].includes(phase)))throw Error('Unknown wall fixture phase');
 if(traffic){
  const file=path.resolve(traffic.slice('traffic-route='.length));
  if(!multiWall||!file.split(path.sep).includes('.local')||fs.statSync(file).size>16*1024*1024)
   throw Error('Bounded private multi-wall route required');
  const input=read(file),point=v=>validVector(v)&&Math.hypot(...v.map((x,i)=>x-pose.listener[i]))<=128;
  const unit=v=>validVector(v)&&Math.abs(Math.hypot(...v)-1)<.001;
  if(input.schema!==1||!['exit','covered'].includes(input.route)||input.stepMs!==50||
     !Number.isInteger(input.seconds)||input.seconds<4||input.seconds>120||
     !validVector(input.listener)||input.listener.some((x,i)=>Math.abs(x-pose.listener[i])>.01)||
     !Array.isArray(input.frames)||input.frames.length!==1+input.seconds*1000/input.stepMs)
   throw Error('Invalid timed traffic route');
  const endpoints=new Map();
  for(const [index,frame] of input.frames.entries()){
   if(frame.timeMs!==index*input.stepMs||!unit(frame.forward)||!Array.isArray(frame.vehicles)||frame.vehicles.length>5)
    throw Error('Invalid traffic observation frame');
   const ids=new Set(),tracks=new Set();
   for(const v of frame.vehicles){
    if(!Number.isInteger(v.track)||v.track<0||v.track>4||tracks.has(v.track)||typeof v.id!=='string'||v.id.length<1||v.id.length>64||
       ids.has(v.id)||!Number.isSafeInteger(v.generation)||v.generation<1||v.generation>65535||
       !Number.isInteger(v.model)||v.model<0||v.model>0xffffffff||
       !['player','npc'].includes(v.context)||!point(v.position)||!validVector(v.velocity)||Math.hypot(...v.velocity)>80||
       !unit(v.forward)||!unit(v.up)||!Number.isFinite(v.operatingPoint)||v.operatingPoint<0||v.operatingPoint>1||
       v.valid!==true||v.running!==true)throw Error('Invalid traffic vehicle observation');
    tracks.add(v.track);ids.add(v.id);
    const key=JSON.stringify([v.id,v.generation]);
    if(!endpoints.has(key))endpoints.set(key,{track:v.track,id:v.id,generation:v.generation,from:v.position,to:v.position});
    else endpoints.get(key).to=v.position;
   }
  }
  copy(file,path.join(root,'clocked-traffic-route.json'));
  routeEndpoints=[...endpoints.values()];
 }
 const route={};
 if(multiWall&&pose.sourceStart){
  for(const key of ['sourceStart','sourceEnd','npcStart','npcEnd']){
   if(!validVector(pose[key])||Math.hypot(...pose[key].map((v,i)=>v-pose.listener[i]))>128)throw Error('Bounded fleet drive route required');
   route[key]=pose[key];
  }
 }
 fs.writeFileSync(path.join(root,'installed-wall-drive.json'),JSON.stringify({listener:pose.listener,source:pose.source,
  tangent:validVector(pose.forward)?pose.forward:[1,0,0],surfaceId:pose.surfaceId,resourceId,...route,...(routeEndpoints?{routeEndpoints}:{}),
  warmWall:phases.includes('warm-wall'),...(multiWall?{multiWall:true}: {}),...(phases.includes('cpu-only')?{cpuOnly:true}:{})}),{flag:'wx'});
 const cacheRoot=path.resolve(path.dirname(geometry.catalogPath),'..');
 const relativeCache=file=>{const rel=path.relative(cacheRoot,file);inside(cacheRoot,rel);return rel;};
 config={
  schema:1,gameExecutable:sources.gameExecutable,gameSha256:sources.gameSha256,
  playerManifest:sources.playerManifest,npcManifest:sources.npcManifest,profiles:sources.profiles,
  catalog:sources.catalog,catalogSha256:sources.catalogSha256,atlas:sources.atlas,latencyProfile:'street-01',
  acousticWorld:{privateCacheRoot:cacheRoot,derivedCacheRoot:cacheRoot,
   manifestPath:relativeCache(geometry.manifestPath),catalogPath:relativeCache(geometry.catalogPath),
   retainedManifestSHA256:hash(geometry.manifestPath),catalogSHA256:catalogueSHA256,resourceIds,
   ...(multiWall?{installedReflectionTrains:true}: {})}
 };
}else{
 const world=originalInstalledCache01({outputDirectory:path.join(root,'world'),gameHash,distantWall:true});
 epoch=new Date().toISOString().replace(/(\.\d{3})Z$/,'$10000Z');
 world.manifest.ValidationEpochUtc01=epoch;
 for(const row of world.manifest.Resources)row.ArchiveValidation01={EpochUtc:epoch,Source:'current-archive-sha256',ArchiveSHA256:row.Result.ArchiveSHA256};
 fs.writeFileSync(world.manifestPath,JSON.stringify(world.manifest));
 const acousticWorld={manifestPath:'world/manifest.json',catalogPath:'world/catalog.json',catalogSHA256:world.catalogSHA256};
 config=writeOriginalGameplayPackageStreet01(root,{gameHash,acousticWorld,latencyProfile:'street-01',fleet:mode==='fleet'}).config;
 config.gameExecutable=owner;
}
const sourceFiles=[
 ...['src/acoustics','tools/soundmap'].flatMap(dir=>walk(path.join(repo,dir)).filter(file=>file.endsWith('.mjs'))),
 ...['tools/Run-Gameplay.mjs','tools/acoustics-06-scenes.mjs','tools/acoustics-08-2-scenes.mjs',
  'config/vehicle-loudness-policy.json','tests/fixtures/acoustics-scenes.mjs'].map(name=>path.join(repo,name))
];
for(const file of sourceFiles)copy(file,path.join(root,path.relative(repo,file)));
copy(node,path.join(root,'runtime/node.exe'));
copy(host,path.join(root,'runtime/RichAudio.Acoustics.Host.exe'));
Object.assign(config,{gameVersion:'1.0.1158.16',rphVersion:'1.132.1428.17748',continuityPolicy:'camera-source-01',
 outputSink:'environment-observation',clockedFleetEvidence02:true});
if(mode==='fleet')Object.assign(config,{vehicleSourcePolicy:'catalogue-fleet-01',eligible:[]});
if(phases.includes('ranked-reflections'))config.fleetReflectionPolicy='fleet-ranked-reflections';
if(phases.includes('x80-bandlimited'))config.x80SourceQuality='bandlimited';
if(phases.includes('npc-synthesis-worker')){
 if(mode!=='fleet'||!retainedSourceManifest||!config.npcManifest||!phases.includes('multi-wall'))
  throw Error('The clocked NPC worker requires a retained multi-wall fleet with an NPC manifest');
 config.fleetNpcSynthesis='same-block-worker';
}
config.bindings=walk(root).filter(file=>file!==manifest).map(file=>({file:path.relative(root,file).replaceAll('\\','/'),sha256:hash(file)}));
fs.writeFileSync(manifest,JSON.stringify(config,null,2));
console.log(JSON.stringify({root,manifestSha256:hash(manifest),authoredOwnerSha256:gameHash,bindings:config.bindings.length,authoredWorldEpoch:epoch}));
