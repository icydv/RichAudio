// Opt-in, read-only projection of a startup coordinator. Global coverage is
// metadata; only explicit cache loads enter the existing finite-geometry view.
import fs from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {isStartupCoordinator06} from '../../src/acoustics/world/startup-coordinator06.mjs';
import {startupLoadingPresentation06} from '../../src/acoustics/world/startup-presentation06.mjs';
import {isResourceInventory04} from '../../src/acoustics/world/resource-inventory04.mjs';
import {createSceneTileContext03} from '../../src/acoustics/world/scene-union03.mjs';
import {CausalSimulation} from '../../src/acoustics/streaming/causal.mjs';
import {SoundMapTelemetry} from '../../src/acoustics/streaming/soundmap-telemetry.mjs';
import {vehicleDistanceSceneOptions} from '../../src/acoustics/vehicle/distance-presentation.mjs';
import {canonical,digest,freeze,requireWorld,identifier,vector} from '../../src/acoustics/world/contracts.mjs';
import {createCachedAcousticWorld041} from './cache-world041.mjs';
import {startSoundMap} from './server.mjs';
const inspections=new WeakMap(),solvers=new WeakMap(),samples=new WeakMap();
export const worldCoverageLimits06=Object.freeze({displayTiles:1024,coverageBytes:2097152,solverSeconds:50});
function coveragePresentation(t){
 const processed=t.status==='prepared'||t.status==='cached',partial=processed&&(t.geometryCoverage!=='complete-synthetic'||t.geometryUnknownCount!==0||!Array.isArray(t.geometryMissingRegions)||t.geometryMissingRegions.length>0);
 return {viewClass:partial?'processed-partial':t.status,geometryQualification:partial?(t.geometryMissingRegions.length?'Processed partial geometry; explicit missing regions remain unknown':'Processed partial geometry; missing extent is not localized'):processed?'Verified declared geometry only':'Geometry not qualified by a completed cache check'};
}

export function createWorldCoverageSnapshot06(coordinator,{offset=0,maximumTiles=1024}={}){
 requireWorld(isStartupCoordinator06(coordinator),'branded startup coordinator required');
 requireWorld(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(maximumTiles)&&maximumTiles>0&&maximumTiles<=worldCoverageLimits06.displayTiles,'bounded coverage window');
 const s=coordinator.snapshot();
 const body={schema:1,kind:'RichAudioWorldCoverage06',purpose:'read-only-startup-coverage',catalogueDigest:s.catalogueDigest,loading:startupLoadingPresentation06(coordinator),stage:s.stage,percent:s.percent,discoverySealed:s.discoverySealed,
  totalTiles:s.totalTiles,eligibleTiles:s.eligibleTiles,completedEligibleTiles:s.completedEligibleTiles,failedTiles:s.failedTiles,unsupportedTiles:s.unsupportedTiles,eligibleComplete:s.eligibleComplete,readiness:s.readiness,
  geometryUnknownTiles:s.geometryUnknownTiles,geometryUnknownRegions:s.geometryUnknownRegions,geometryUnknownEntries:s.geometryUnknownEntries,geometryUnverifiedTiles:s.geometryUnverifiedTiles,
  coverageWindow:{offset,total:s.tiles.length,shown:s.tiles.slice(offset,offset+maximumTiles).length,omitted:s.tiles.length-s.tiles.slice(offset,offset+maximumTiles).length},
  tiles:s.tiles.slice(offset,offset+maximumTiles).map(t=>({...t,...coveragePresentation(t),geometryLayer:'static-cache',runtimeState:'not-supplied'})),unknownRegions:s.unknownRegions,
  checkpointSHA256:s.checkpointSHA256??null,checkpointError:s.checkpointError??null,restoreWarning:s.restoreWarning??null,controlBoundaryFailure:s.controlBoundaryFailure??null,controlClosureUnknown:s.controlClosureUnknown??false,unresolvedControlOperations:s.unresolvedControlOperations??0,quarantinedControlOperations:s.quarantinedControlOperations??0,
  runtimeState:s.runtimeState,cacheValidity:'exact-plan-and-artifact-bindings; explicit-load-rechecks',lastPreparation:'current-coordinator-checkpoint; no-unobserved-wall-clock-claim',
  staticGeometry:'qualified-declared-subset-only',dynamicGeometry:'not-observed',interiors:'only-explicit-loaded-topology; current-cache-does-not-persist-MLO-connectivity',outsideCoverage:'unknown',
  actualWorldCoverage:'unmeasured',installedWorldVerified:false,genuineResourceVerified:false,runtimeActivationVerified:false,viewerCanPublishAcoustics:false,paths:[],solverPathEvidence:false};
 requireWorld(Buffer.byteLength(canonical(body))<=worldCoverageLimits06.coverageBytes,'bounded coverage projection');return freeze({...body,generation:digest(body)});
}

export async function loadWorldCoverageInspection06({coordinator,pageId,tileId,inventory,geometryTimeMs=0,interiors=[]}={}){
 requireWorld(isStartupCoordinator06(coordinator)&&isResourceInventory04(inventory)&&inventory.origin==='original-authored-fixture','qualified original page and coordinator required');identifier(pageId);identifier(tileId);
 const row=coordinator.snapshot().tiles.find(t=>t.pageId===pageId&&t.tileId===tileId),plan=inventory.tilePlans.find(p=>p.tileId===tileId);
 requireWorld(row&&plan&&row.planDigest===plan.planDigest,'exact current catalogue/page tile plan');
 const result=await coordinator.loadPrepared({pageId,tileId,engine:vehicleDistanceSceneOptions('authored-detail-loss-v1')});
 if(result.state!=='prepared-cache-hit')return result;
 // The cache context has the complete catalogue identity. The existing page
 // viewer checks the same geometry against its exact page inventory identity.
 const context=createSceneTileContext03({...result.context,worldDigest:inventory.inventoryDigest});
 const args={inventory,contexts:[context],tiles:[result.tile],expectedArtifacts:{[plan.planDigest]:row.artifactDigest},interiors,session:context.scene.tile.session,geometryTimeMs};
 const geometry=createCachedAcousticWorld041(args),inspection=Object.freeze({state:result.state,pageId,tileId,context:result.context,tile:result.tile,geometry,workerStarted:false,conversionWorkers:0});
 inspections.set(inspection,{args,coordinator});return inspection;
}

export function createWorldCoverageSolver06({inspection,source,listener}={}){
 const record=inspections.get(inspection);requireWorld(record,'branded explicit cache inspection required');
 source=vector(source);listener=vector(listener);const scene=inspection.context.scene;
 requireWorld([source,listener].every(p=>p.every((v,i)=>v>=scene.tile.bounds.min[i]&&v<=scene.tile.bounds.max[i])),'explicit solver poses inside loaded tile');
 const simulation=new CausalSimulation(scene),telemetry=new SoundMapTelemetry({enabled:true,fps:20}),session=scene.tile.session;let closed=false,last=-1,geometry=null;
 const step=(time,producedAtUnixMs=Date.now())=>{
  requireWorld(!closed&&Number.isFinite(time)&&time>=0&&time<=worldCoverageLimits06.solverSeconds&&time>last,'open increasing bounded solver model time');last=time;
  telemetry.begin(simulation,time*1000);simulation.observe({time,session,generation:1,listener:{position:listener,forward:[0,1,0],up:[0,0,1]},sources:[{id:'declared-world06-source',generation:1,position:source,forward:[0,1,0],up:[0,0,1],directivity:0}]});
  const control=simulation.update(time,{geometryTimeMs:time*1000}),packet=telemetry.publish(simulation,control,{producedAtUnixMs});geometry=packet.soundMapGeometry??geometry;
  const sample=freeze({control,...packet,soundMapGeometry:geometry});samples.set(sample,simulation);return sample;
 };
 let sample;for(let i=0;i<=6;i++)sample=step(i*.05);
 requireWorld(sample.soundMapFrame&&geometry,'actual existing solver/telemetry publication required');
 const frame=sample.soundMapFrame,alignment={basis:'original-authored-exact-model-alignment',session,acousticSession:frame.listenerSessionId??frame.sessionId,coordinateKey:'model:'+frame.streamId+':'+frame.sessionId+':'+JSON.stringify(geometry.calibration??geometry.observationModel?.calibration??null)};
 const cachedGeometry=createCachedAcousticWorld041({...record.args,alignment}),solver={step,sample,geometry:cachedGeometry,simulation,get closed(){return closed;},close(){closed=true;}};
 solvers.set(solver,{inspection,coordinator:record.coordinator});return Object.freeze(solver);
}

export async function startWorldCoverageService06({coordinator,root,port=0,inspection=null,solver=null}={}){
 requireWorld(isStartupCoordinator06(coordinator),'branded startup coordinator required');
 requireWorld(inspection===null||inspections.get(inspection)?.coordinator===coordinator,'exact coordinator cache inspection');
 requireWorld(solver===null||solvers.get(solver)?.inspection===inspection&&!solver.closed,'exact open solver for inspection');
 const service=await startSoundMap({root,port}),origin=service.descriptor.url,secret=randomBytes(32).toString('hex'),pending=new Map();let closed=false,closing=null;
 const close=()=>{if(closing)return closing;closed=true;for(const controller of pending.values())controller.abort();closing=(async()=>{const results=await Promise.allSettled([service.close(),...pending.keys()]);const cleanup=results[0];if(cleanup.status==='rejected')throw cleanup.reason;})();return closing;};
 try{
  const [index,script]=await Promise.all([fs.readFile(new URL('./ui/index.html',import.meta.url),'utf8'),fs.readFile(new URL('./worldcoverage-ui06.mjs',import.meta.url))]);
  // Retain DOM IDs expected by the shared application, while making unavailable
  // recording, replay and manual-context controls invisible before scripts run.
  const html=index.replace('<aside>','<aside><section id="world06-coverage"><h2>Startup world coverage</h2><p>Read-only inspection · loading declared coverage…</p></section>')
   .replace('RICHAUDIO / LIVE OBSERVATORY','RICHAUDIO / READ-ONLY CACHE INSPECTION')
   .replace('<section><h2>Record owned output</h2>','<section hidden data-world06-unavailable="recording"><h2>Record owned output</h2>')
   .replace('<section><h2>Private visual context</h2>','<section hidden data-world06-unavailable="manual-context"><h2>Private visual context</h2>')
   .replace('<footer>','<footer hidden data-world06-unavailable="replay">')
   .replace('</head>','<style>[data-world06-unavailable]{display:none!important}main{height:calc(100vh - 76px)}</style></head>')
   .replace('</body>','<script type="module" src="/worldcoverage06.mjs"></script></body>');
  const original=service.server.listeners('request')[0],equal=(v,w)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&timingSafeEqual(Buffer.from(v,'ascii'),Buffer.from(w,'ascii'));
  const handler=(req,res)=>{try{
   if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);res.end('Same-origin localhost only');return;}
   const route=new URL(req.url,origin).pathname;
   if(req.method!=='GET'){
    if(req.method==='POST'&&route==='/api/telemetry'&&!closed&&solver&&!solver.closed&&equal(req.headers['x-richaudio-publisher06'],secret))return original(req,res);
    res.writeHead(405);res.end('Read-only startup coverage');return;
   }
   if(['/api/recordings','/api/record','/api/replay','/api/host'].some(p=>route.startsWith(p))){res.writeHead(405);res.end('Recording and replay unavailable');return;}
   if(['/','/index.html','/worldcoverage06','/worldcoverage06.mjs','/api/worldcoverage06'].includes(route)){
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'none'; object-src 'none'; frame-ancestors 'none'");
    if(route==='/api/worldcoverage06'){if(!equal(req.headers['x-richaudio-token'],service.descriptor.token)){res.writeHead(403);res.end('Inspection token required');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(createWorldCoverageSnapshot06(coordinator)));return;}
    res.setHeader('Content-Type',route.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(route.endsWith('.mjs')?script:html);return;
   }
   return original(req,res);
  }catch{if(!res.headersSent)res.writeHead(400);res.end('Invalid coverage request');}};
  service.server.removeListener('request',original);service.server.on('request',handler);
  if(inspection)await service.cacheWorld.publish(solver?.geometry??inspection.geometry);
  const publish=sample=>{requireWorld(!closed&&solver&&!solver.closed&&samples.get(sample)===solver.simulation,'open actual solver sample required');const controller=new AbortController();
   const work=(async()=>{const response=await fetch(origin+'/api/telemetry',{method:'POST',headers:{'Content-Type':'application/json','X-RichAudio-Token':service.descriptor.token,'X-RichAudio-Publisher06':secret},body:JSON.stringify({frame:sample.soundMapFrame,geometry:sample.soundMapGeometry}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(2500)])});requireWorld(response.ok,'solver publication accepted');const result=await response.json();requireWorld(result.accepted===true,'fresh solver evidence required');return result;})();pending.set(work,controller);work.then(()=>pending.delete(work),()=>pending.delete(work));return work;};
  if(solver)await publish(solver.sample);
  return {url:origin+'/worldcoverage06',service,publish,recordingEnabled:false,close};
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Coverage startup and cleanup failed');}throw error;}
}
