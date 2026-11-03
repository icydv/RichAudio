// Additive original-fixture integration. No real export decoder or authority
// promotion exists here. The existing builder, solver and viewer stay unchanged.
import fs from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {isPreparedSuppliedBuilding042,createSuppliedBuildingInterior042} from '../../src/acoustics/world/supplied-building042.mjs';
import {ResourceTileBuilder04} from '../../src/acoustics/world/cache-builder04.mjs';
import {ScenePreparation03} from '../../src/acoustics/world/scene-preparation03.mjs';
import {CausalSimulation,StreamingRenderer} from '../../src/acoustics/streaming/causal.mjs';
import {SoundMapTelemetry} from '../../src/acoustics/streaming/soundmap-telemetry.mjs';
import {freeze,requireWorld,byteDigest} from '../../src/acoustics/world/contracts.mjs';
import {cachedWorldFromBuilder041} from './cache-world041.mjs';
import {startSoundMap} from './server.mjs';

const views=new WeakSet();
const sourceId='supplied-source042';
const pointInside=(p,b)=>p.every((v,i)=>v>b.min[i]&&v<b.max[i]);
export function ownedCleanup042(closers){
  requireWorld(Array.isArray(closers)&&closers.length>0&&closers.length<=8&&closers.every(fn=>typeof fn==='function'),'bounded owned cleanup callbacks');
  let completion=null;
  return ()=>completion??=(async()=>{
    const results=await Promise.allSettled(closers.map(fn=>Promise.resolve().then(fn)));
    const failures=results.filter(r=>r.status==='rejected').map(r=>r.reason);
    if(failures.length)throw new AggregateError(failures,'Supplied-building owned cleanup failed');
  })();
}
export async function prepareSuppliedBuildingView042(value,{store=null,trustedArtifacts={}}={}){
  requireWorld(isPreparedSuppliedBuilding042(value),'branded original supplied-building preparation; real exports remain blocked');
  const building=value.buildingSummaries[0],listener=[...building.auditionPoses.listener];
  // Both poses are explicit authored observations inside the first room. No
  // retarded pose or reflection contact is inferred by this presentation code.
  const source=building.auditionPoses.source.map((v,i)=>v*.25+listener[i]*.75);
  requireWorld(pointInside(source,building.region)&&pointInside(listener,building.region),'bounded authored preview poses');
  const builder=new ResourceTileBuilder04({...value,store,trustedArtifacts});
  const preparation=new ScenePreparation03({session:value.session,worldDigest:value.inventory.inventoryDigest});
  try{
    const built=await builder.prepareNearby({listenerAnchor:listener,maximumTiles:8,radius:256,budgetMilliseconds:4000});
    requireWorld(built.state==='prepared'&&builder.resident.size>0,'original building cache preparation completed');
    const contexts=builder.contexts(),union=await preparation.prepare({contexts,listenerAnchor:listener,budgetMilliseconds:4000});
    requireWorld(union.state==='prepared'&&union.workerJoined,'joined original building scene required');
    const scene=union.prepared.scene,simulation=new CausalSimulation(scene),telemetry=new SoundMapTelemetry({enabled:true,fps:20});
    const step=(time,producedAtUnixMs=Date.now())=>{
      telemetry.begin(simulation,time*1000);
      simulation.observe({time,session:value.session,generation:1,listener:{position:listener,forward:[0,1,0]},sources:[{id:sourceId,position:source,forward:[0,1,0]}]});
      const control=simulation.update(time,{geometryTimeMs:time*1000});
      return {control,...telemetry.publish(simulation,control,{producedAtUnixMs})};
    };
    let sample,geometry;
    for(let i=0;i<=6;i++){sample=step(i*.05);geometry=sample.soundMapGeometry??geometry;}
    sample={...sample,soundMapGeometry:geometry};
    const frame=sample.soundMapFrame;
    const alignment={basis:'original-authored-exact-model-alignment',session:value.session,acousticSession:frame.listenerSessionId,coordinateKey:'model:'+frame.streamId+':'+frame.sessionId+':'+JSON.stringify(frame.calibration??null)};
    const interiors=value.sidecar.buildings.filter(b=>b.interior!==null).map(b=>{
      const context=contexts.find(c=>c.tileId===b.tileId);
      requireWorld(context,'interior must have an exact resident scene');
      return createSuppliedBuildingInterior042(value,b.id,context.scene);
    });
    const cache=cachedWorldFromBuilder041(builder,{expectedArtifacts:builder.artifactBindings(),interiors,geometryTimeMs:300,alignment});
    const info=freeze({schema:1,kind:'RichAudioSuppliedBuildingView042',authority:'original-authored-fixture-only',sidecarDigest:value.sidecarDigest,session:value.session,
      buildings:value.buildingSummaries.map(b=>({id:b.id,tileId:b.tileId,region:b.region,inputFrame:b.inputFrame,translation:b.translation,rotation:b.engineQuaternion,scale:[b.scaleXY,b.scaleXY,b.scaleZ],transformChain:b.transformChain,calibration:b.calibration,interiorDigest:b.interiorDigest,
        interiorQualification:interiors.filter(t=>t.scene===contexts.find(c=>c.tileId===b.tileId)?.scene).map(t=>({rooms:t.rooms.map(r=>({id:r.id,completeness:r.completeness})),unknown:t.unknown,runtimeState:'not-supplied'}))})),
      resources:value.sidecar.resources.map(r=>({id:r.id,kind:r.kind,logicalArchive:r.logicalArchive,logicalMember:r.logicalMember,mount:r.mount,sourceSHA256:r.sourceSHA256,sourceBytes:r.sourceBytes,encoding:r.encoding,decodedPacketSHA256:r.decodedPacketSHA256})),
      materials:value.sidecar.buildings.map(b=>({building:b.id,table:b.materialTable,basis:'authored-assumption-not-measured-response'})),
      coverage:{basis:'explicit-finite-authored-subset',outside:'unknown',emptyOutsideInferred:false},
      poses:{source,listener,basis:'authored-model-observations'},installedWorldVerified:false,enhancedCompatibilityVerified:false,realExportApproved:false,viewerCanPublishAcoustics:false,recordingEnabled:false});
    const release=ownedCleanup042([()=>builder.close(),()=>preparation.close()]);
    const view={value,builder,preparation,scene,simulation,telemetry,source,listener,step,sample,cache,info,closed:false,
      close(){view.closed=true;return release();}};
    views.add(view);return view;
  }catch(error){try{await ownedCleanup042([()=>builder.close(),()=>preparation.close()])();}catch(cleanup){throw new AggregateError([error,cleanup],'Supplied-building preparation and cleanup failed');}throw error;}
}

// In-memory original PCM only. Useful for an acoustic ablation; never writes a
// WAV, starts a recording, opens an endpoint or changes the production source.
export function renderSuppliedBuildingPcm042(view,{reflections=true,blocks=144}={}){
  requireWorld(views.has(view)&&!view.closed&&typeof reflections==='boolean'&&Number.isInteger(blocks)&&blocks>=32&&blocks<=192,'bounded branded original PCM comparison');
  const simulation=new CausalSimulation(view.scene),renderer=new StreamingRenderer({sourceIds:[sourceId],maxPathsPerSource:12,masterGain:.05,historyDiagnostics:true});
  simulation.setProcessingSettings({pathBudget:12,maxReflectors:16,earlyReflections:reflections});
  const input=new Float32Array(512),left=new Float32Array(512),right=new Float32Array(512),pcm=Buffer.alloc(blocks*512*8),dry=Buffer.alloc(blocks*512*4);
  let peak=0,reflectedPaths=0,selectedPaths=0;
  for(let block=0;block<blocks;block++){
    const time=block*512/48000;
    simulation.observe({time,session:view.value.session,generation:1,listener:{position:view.listener,forward:[0,1,0]},sources:[{id:sourceId,position:view.source,forward:[0,1,0]}]});
    const control=simulation.update(time,{geometryTimeMs:time*1000});renderer.accept(control);
    reflectedPaths=Math.max(reflectedPaths,control.paths.filter(p=>p.order>0).length);selectedPaths=Math.max(selectedPaths,control.paths.length);
    for(let i=0;i<512;i++)input[i]=.06*Math.sin((block*512+i)*.043)+.02*Math.cos((block*512+i)*.017);
    renderer.process({[sourceId]:input},left,right);
    for(let i=0;i<512;i++){const frame=block*512+i;dry.writeFloatLE(input[i],frame*4);pcm.writeFloatLE(left[i],frame*8);pcm.writeFloatLE(right[i],frame*8+4);peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));}
  }
  return freeze({kind:'OriginalSuppliedBuildingPcm042',drySHA256:byteDigest(dry),pcmSHA256:byteDigest(pcm),frames:renderer.frame,peak,selectedPaths,reflectedPaths,
    limited:renderer.stats.limited,historyAffectedFrames:renderer.historyDiagnostics.affectedFrames,reflections,source:'original-authored-sine-not-private-bank',endpointOpened:false,recordingStarted:false,installedWorldVerified:false});
}

export async function startSuppliedBuildingService042({view,root,port=0}={}){
  requireWorld(views.has(view)&&!view.closed,'prepared original building view required');
  const service=await startSoundMap({root,port});
  try{
    await service.cacheWorld.publish(view.cache);
    const handlers=service.server.listeners('request');requireWorld(handlers.length===1,'single existing SoundMap handler');
    const original=handlers[0],origin=service.descriptor.url,publisherSecret=randomBytes(32).toString('hex');
    const index=await fs.readFile(new URL('./ui/index.html',import.meta.url),'utf8');
    const script=await fs.readFile(new URL('./supplied-building-ui042.mjs',import.meta.url));
    const html=index.replace('<aside>','<aside><section id="building042-evidence"><h2>Supplied building evidence</h2><p>Loading the exact supplied subset…</p></section>')
      .replace('</body>','<script type="module" src="/supplied-building042.mjs"></script></body>');
    const permitted=req=>req.headers.host===new URL(origin).host&&(!req.headers.origin||req.headers.origin===origin)&&req.headers['sec-fetch-site']!=='cross-site';
    const token=req=>{const value=req.headers['x-richaudio-token'];return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&timingSafeEqual(Buffer.from(value,'ascii'),Buffer.from(service.descriptor.token,'ascii'));};
    const handler=(req,res)=>{
      try{
      let route;try{route=new URL(req.url,origin).pathname;}catch{res.writeHead(400);res.end('Invalid request URL');return;}
      // Browser clients have a GET-only inspection capability. The original
      // telemetry handler receives only publications with this separate private
      // control capability, never exposed through /api/session or the page.
      if(req.method!=='GET'){
        const secret=req.headers['x-richaudio-publisher042'];
        const trusted=route==='/api/telemetry'&&req.method==='POST'&&permitted(req)&&typeof secret==='string'&&/^[a-f0-9]{64}$/.test(secret)&&timingSafeEqual(Buffer.from(secret,'ascii'),Buffer.from(publisherSecret,'ascii'));
        if(trusted)return original(req,res);
        res.writeHead(405,{'Cache-Control':'no-store'});res.end('Read-only building preview');return;
      }
      if(route==='/api/supplied-building042'||route==='/building042'||route==='/supplied-building042.mjs'){
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'none'; object-src 'none'; frame-ancestors 'none'");
        if(!permitted(req)){res.writeHead(403);res.end('Same-origin localhost only');return;}
        if(req.method!=='GET'){res.writeHead(405);res.end('Read-only building preview');return;}
        if(route==='/api/supplied-building042'){
          if(!token(req)){res.writeHead(403);res.end('Session capability required');return;}
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify(view.info));return;
        }
        if(route==='/building042'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
        if(route==='/supplied-building042.mjs'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(script);return;}
      }
        return original(req,res);
      }catch{
        if(!res.headersSent)res.writeHead(400);
        res.end('Invalid building preview request');
      }
    };
    service.server.removeListener('request',original);service.server.on('request',handler);
    const publish=async sample=>{
      requireWorld(views.has(view)&&!view.closed,'open original view publication');
      const result=await fetch(origin+'/api/telemetry',{method:'POST',headers:{'Content-Type':'application/json','X-RichAudio-Token':service.descriptor.token,'X-RichAudio-Publisher042':publisherSecret},body:JSON.stringify({frame:sample.soundMapFrame,geometry:sample.soundMapGeometry})});
      requireWorld(result.ok,'original supplied-building telemetry accepted');
      const body=await result.json();requireWorld(body.accepted===true,'fresh original supplied-building publication');return body;
    };
    await publish(view.sample);
    return {service,url:origin+'/building042',publish,close:()=>service.close(),recordingEnabled:false};
  }catch(error){try{await service.close();}catch(cleanup){throw new AggregateError([error,cleanup],'Supplied-building service and cleanup failed');}throw error;}
}
