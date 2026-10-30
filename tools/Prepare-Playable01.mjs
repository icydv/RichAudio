// One-time private cache assembly. Never installs, launches GTA or opens audio.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {loadStockCatalogAssets,loadStockNpcAssets} from '../src/acoustics/vehicle/stock-source.mjs';
import {loadInstalledStockRegistry} from '../src/acoustics/vehicle/installed-stock-registry.mjs';
import {stockDemonstrations} from './stock-source-01-scenario.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--inputs')throw Error('Supply --inputs <private preparation JSON>');
const input=JSON.parse(fs.readFileSync(args[1],'utf8')),root=path.resolve(input.output),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const contains=(p,r)=>p===r||p.startsWith(r+path.sep);
if(!contains(root,path.join(repo,'.local'))||fs.existsSync(root))throw Error('New private .local output directory required');
const game=path.resolve(input.gameExecutable),gameHash=hash(game);
if(gameHash!=='b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea')throw Error('Reviewed game build differs; no preparation');
const catalogHash=hash(input.catalog),assets=loadStockCatalogAssets(input.playerManifest,{sustainAtlasFile:input.atlas}),npcAssets=loadStockNpcAssets(input.npcManifest);
const registry=loadInstalledStockRegistry({catalogFile:input.catalog,catalogSha256:catalogHash,assets,npcAssets});
if(npcAssets.manifest.gameExecutableSha256.toLowerCase()!==gameHash)throw Error('Decoded installation binding differs');
fs.mkdirSync(root,{recursive:true});
const copy=(from,relative)=>{const to=path.join(root,relative);if(!contains(path.resolve(to),root))throw Error('package path');fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
const json=(relative,value)=>{const to=path.join(root,relative);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,JSON.stringify(value,null,2)+'\n');};
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);}
for(const f of walk(path.join(repo,'src/acoustics')).filter(f=>f.endsWith('.mjs')))copy(f,path.relative(repo,f));
for(const f of walk(path.join(repo,'tools/soundmap')))copy(f,path.relative(repo,f));
copy(path.join(repo,'tools/Run-Gameplay.mjs'),'tools/Run-Gameplay.mjs');
copy(path.join(repo,'tools/playable/Setup.ps1'),'Setup.ps1');for(const f of ['Setup.cmd','Uninstall.cmd','README.txt'])copy(path.join(repo,'tools/playable',f),f);
copy(path.join(repo,'build/acoustics-host/RichAudio.Acoustics.Host.exe'),'runtime/RichAudio.Acoustics.Host.exe');
copy(path.join(repo,'build/acoustics07/transport/RichAudio.Beacon.Rph.dll'),'plugin/RichAudio.dll');
copy(path.join(repo,'build/acoustic-gpu/RichAudio.AcousticGpu.exe'),'build/acoustic-gpu/RichAudio.AcousticGpu.exe');
copy(input.node,'runtime/node.exe');if(!fs.readFileSync(input.nodeLicense,'utf8').includes('Node.js is licensed'))throw Error('Node upstream LICENSE required');copy(input.nodeLicense,'runtime/NODE-LICENSE.txt');
for(const [context,library,filename]of [['player',assets,input.playerManifest],['npc',npcAssets,input.npcManifest]]){
 const m=structuredClone(library.manifest);delete m.privateRoot;
 for(const v of m.vehicles)for(const layers of Object.values(v.layers))for(const a of Object.values(layers)){for(const field of ['file','wavFile'])if(a[field])copy(path.resolve(path.dirname(filename),a[field]),`sources/${context}/${a[field]}`);}
 json(`sources/${context}/manifest.json`,m);if(context==='player')copy(path.join(path.dirname(filename),'analysis-intervals.json'),'sources/player/analysis-intervals.json');
}
copy(input.atlas,'sources/atlas.json');copy(input.catalog,'sources/catalog.json');
const profiles=JSON.parse(fs.readFileSync(input.profiles));profiles.emitters=Object.fromEntries(Object.entries(stockDemonstrations).map(([k,v])=>[k,{engineOffset:v.engineOffset,exhaustOffset:v.exhaustOffset,basis:'authored body-axis estimates; not verified bones'}]));json('sources/profiles.json',profiles);
const catalog=JSON.parse(fs.readFileSync(input.catalog,'utf8').replace(/^\uFEFF/,'')),eligible=[];
for(const v of catalog.Vehicles){const model=parseInt(v.ModelHash.replace(/^0x/i,''),16);if(registry.resolve(model,'player').status==='available')eligible.push({model,context:'player',name:v.Model});}
const bati=0xf9300cc5;if(registry.resolve(bati,'npc').status!=='available')throw Error('Exact Bati NPC missing');eligible.push({model:bati,context:'npc',name:'bati'});
const rphRoot=path.resolve(input.rphPackage),rphExe=path.join(rphRoot,'RAGEPluginHook.exe');
if(hash(rphExe)!=='73f05b3f7973d4731f4151ae061dd3c991065e8bf3ece51ea1d9ab728b9b42ac')throw Error('Authentic reviewed RPH differs');
const prerequisites=walk(rphRoot).filter(f=>!path.relative(rphRoot,f).includes(path.sep)&&!f.endsWith('RPH_Readme.txt')).map(f=>({file:path.basename(f),sha256:hash(f)}));
json('rph-prerequisite.json',{schema:1,version:'1.132.1428.17748',files:prerequisites,note:'Not redistributed. Consume your separately obtained authentic RPH package during setup.'});
const manifest={schema:1,gameExecutable:game,gameSha256:gameHash,gameVersion:'1.0.1158.16',rphVersion:'1.132.1428.17748',
 playerManifest:'sources/player/manifest.json',npcManifest:'sources/npc/manifest.json',atlas:'sources/atlas.json',profiles:'sources/profiles.json',catalog:'sources/catalog.json',catalogSha256:catalogHash,
 eligible,bindings:walk(root).map(f=>({file:path.relative(root,f).replaceAll('\\','/'),sha256:hash(f)})).sort((a,b)=>a.file.localeCompare(b.file)),
 mode:'experimental-additive',nativeReplacement:false,geometryCoverage:'no qualified installed collision geometry; conditional direct sound',
 sourcePolicy:'Observed engine revolution ratio, inferred lift; no measured throttle/crank RPM/native NPC deceleration claim',
 limits:{trackedVehicles:4,activeVehicles:2,sourceEmitters:4,controlDelayMs:100,historySeconds:2.5,maximumPropagationSeconds:2},
 calibration:{exhaustToEngine:10,commonSourceHeadroomTrim:.25,masterGain:.175,fleetHeadroomFactor:.25,dynamicNormalisation:false}};
json('playable.json',manifest);
json('.local/preparation-receipt.json',{schema:1,gameSha256:gameHash,manifestSha256:hash(path.join(root,'playable.json')),eligible,decodedThisRun:0,reusedVerifiedCache:true,installed:false,endpointOpened:false,rphRedistributed:false});
console.log(JSON.stringify({root,manifestSha256:hash(path.join(root,'playable.json')),files:manifest.bindings.length,bytes:walk(root).reduce((n,f)=>n+fs.statSync(f).size,0),playerModels:eligible.filter(e=>e.context==='player').map(e=>e.name),npcModels:['bati'],installed:false}));
