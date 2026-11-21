// Source/pin selection only. No vendor assembly is loaded or redistributed.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
export const streetPreparationFiles01=Object.freeze([
 'tools/Prepare-InstalledAudioWorld.ps1','tools/Build-InstalledAcousticCatalog.ps1',
 'tools/Resolve-InstalledGameCache.ps1','tools/Export-InstalledCollision.ps1',
 'tools/Prepare-InstalledCollisionWorld.ps1','src/acoustics/startup/InstalledCatalog.psm1',
 'src/acoustics/startup/CatalogLifecycle.psm1','src/acoustics/startup/CodeWalkerInitialization01.psm1',
 'src/acoustics/integration/PreparationCoordinator.psm1','src/acoustics/world/CodeWalkerCollisionAdapter.cs',
 'tools/playable/WorldPreparation01.psm1','third_party/codewalker08/SharpDX.LICENSE',
]);
export function selectStreetEligible01(eligible){
 const selected=eligible.filter(v=>v.model===0xf9300cc5&&['player','npc'].includes(v.context));
 check(selected.filter(v=>v.context==='player').length===1&&selected.length<=2&&new Set(selected.map(v=>v.context)).size===selected.length,'STREET-01 requires one exact Bati player mapping and at most its verified NPC mapping');return selected;
}
function noLinks(filename){for(let at=filename;;at=path.dirname(at)){check(!fs.lstatSync(at).isSymbolicLink(),'Linked external dependency refused');if(path.dirname(at)===at)break;}}
export function streetWorldPreparation01({codeWalkerRoot,sourceFiles}={}){
 check(typeof codeWalkerRoot==='string'&&path.isAbsolute(codeWalkerRoot),'Explicit separately obtained unmodified CodeWalker dependency folder required');const root=path.resolve(codeWalkerRoot);noLinks(root);
 const dependencies=['CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll'].map(file=>{const full=path.join(root,file);noLinks(full);const stat=fs.statSync(full);check(stat.isFile()&&stat.size>0&&stat.size<=134217728,'Bounded required software dependency missing');return {file,bytes:stat.size,sha256:createHash('sha256').update(fs.readFileSync(full)).digest('hex')};});
 check(Array.isArray(sourceFiles)&&sourceFiles.length>=10&&sourceFiles.length<=256&&new Set(sourceFiles).size===sourceFiles.length&&sourceFiles.includes('tools/Prepare-InstalledAudioWorld.ps1')&&sourceFiles.includes('runtime/node.exe')&&sourceFiles.every(file=>typeof file==='string'&&!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..')),'Bounded complete installed-world source closure required');
 return {schema:1,cacheRoot:'.local/plugin-world-warmup',sourceFiles:[...sourceFiles].sort(),dependencies,
  externalParserRequired:true,parserRedistributed:false,credit:'CodeWalker by dexyfex',upstream:'https://www.gta5-mods.com/tools/codewalker-gtav-interactive-3d-map',dependencyPolicy:'Use the exact separately obtained unmodified Core and required SharpDX software; no CodeWalker application, game asset or initialization secret is included.',
  maximumSeconds:1800,maximumStageSeconds:1800,maximumMemoryMiB:3072,maximumGeometryResources:262144,maximumBatches:4,maximumTotalSeconds:7200};
}
