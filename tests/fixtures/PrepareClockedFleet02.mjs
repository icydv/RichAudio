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
 if(phases.some(phase=>!['multi-wall','warm-wall'].includes(phase)))throw Error('Unknown wall fixture phase');
 const route={};
 if(multiWall&&pose.sourceStart){
  for(const key of ['sourceStart','sourceEnd','npcStart','npcEnd']){
   if(!validVector(pose[key])||Math.hypot(...pose[key].map((v,i)=>v-pose.listener[i]))>128)throw Error('Bounded fleet drive route required');
   route[key]=pose[key];
  }
 }
 fs.writeFileSync(path.join(root,'installed-wall-drive.json'),JSON.stringify({listener:pose.listener,source:pose.source,
  tangent:validVector(pose.forward)?pose.forward:[1,0,0],surfaceId:pose.surfaceId,resourceId,...route,
  warmWall:phases.includes('warm-wall'),...(multiWall?{multiWall:true}: {})}),{flag:'wx'});
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
config.bindings=walk(root).filter(file=>file!==manifest).map(file=>({file:path.relative(root,file).replaceAll('\\','/'),sha256:hash(file)}));
fs.writeFileSync(manifest,JSON.stringify(config,null,2));
console.log(JSON.stringify({root,manifestSha256:hash(manifest),authoredOwnerSha256:gameHash,bindings:config.bindings.length,authoredWorldEpoch:epoch}));
