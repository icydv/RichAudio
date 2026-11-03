import test from 'node:test';
import assert from 'node:assert/strict';
import {startupWorld06} from './fixtures/StartupWorld06.mjs';
import {startupHarness06} from './fixtures/StartupHarness06.mjs';
import {createWorldCoverageSnapshot06,loadWorldCoverageInspection06,createWorldCoverageSolver06,startWorldCoverageService06} from '../tools/soundmap/worldcoverage06.mjs';
import {CachedWorldState041,cachedWorldPresentation041} from '../tools/soundmap/ui/model.mjs';
import {admittedOriginalXml05} from './fixtures/AdmittedXml05.mjs';
import {xmlInventory05} from '../src/acoustics/world/xml-building05.mjs';
const loaded=async(h,c,f)=>{const l=f.locations.at(-1),page=f.pages.find(p=>p.pageId===l.pageId);return loadWorldCoverageInspection06({coordinator:c,...l,inventory:page.inventory});};

test('world coverage reports exact coordinator accounting, bounded omissions and unknowns without inventing geometry or paths',async()=>{
 const h=await startupHarness06(),f=startupWorld06({incompleteDiscovery:true,unsupported:true}),c=h.create(f);
 try{assert.equal(createWorldCoverageSnapshot06(c).percent,null);await c.run();const s=c.snapshot(),p=createWorldCoverageSnapshot06(c,{maximumTiles:3,offset:2});assert.equal(p.completedEligibleTiles,s.completedEligibleTiles);assert.equal(p.percent,s.percent);assert.equal(p.loading.percent,p.percent);assert.equal(p.loading.nativeLoadingLabelModified,false);assert.equal(p.loading.gameplayGateConnected,false);assert.equal(p.coverageWindow.total,12);assert.equal(p.coverageWindow.shown,3);assert.equal(p.coverageWindow.omitted,9);assert.equal(p.tiles[0].tileId,'declared-02');assert.equal(p.tiles[0].status,'unsupported');assert(p.unknownRegions.length>0);assert.equal(p.dynamicGeometry,'not-observed');assert.equal(p.solverPathEvidence,false);assert.deepEqual(p.paths,[]);assert.equal(p.installedWorldVerified,false);assert(!JSON.stringify(p).includes('resourceBytes'));assert.throws(()=>createWorldCoverageSnapshot06({...c}),/branded/);assert.throws(()=>createWorldCoverageSnapshot06(c,{maximumTiles:16384}),/bounded/);}finally{await h.close();}
});

test('explicit prepared cache geometry reuses existing finite layer and overlays only exact actual solver session and coordinates',async()=>{
 const h=await startupHarness06(),f=startupWorld06(),c=h.create(f);let solver;
 try{await c.run();const inspection=await loaded(h,c,f),location=f.locations.at(-1);solver=createWorldCoverageSolver06({inspection,source:location.source,listener:location.listener});
  assert(inspection.geometry.tiles.find(t=>t.tileId===location.tileId).surfaces[0].vertices.length===3);assert.equal(inspection.geometry.tiles.filter(t=>t.tileDigest!==null).length,1);assert.equal(inspection.geometry.tiles.filter(t=>t.state==='unprepared').length,3,'a page summary does not imply other geometry is resident');
  const cache=new CachedWorldState041();cache.ingest({packet:solver.geometry,status:{available:true,generation:solver.geometry.generation,geometryTimeMs:0}},0);
  const frame=solver.sample.soundMapFrame,base={kind:'acoustic',coordinateKey:solver.geometry.alignment.coordinateKey,frame};assert.equal(cachedWorldPresentation041(cache,base,0,{enabled:true}).overlay,true);
  assert.equal(cachedWorldPresentation041(cache,{...base,coordinateKey:'native-passive:unscaled'},0,{enabled:true}).overlay,false);
  assert.equal(cachedWorldPresentation041(cache,{...base,frame:{...frame,listenerSessionId:'other:1'}},0,{enabled:true}).overlay,false);
  assert.equal(solver.geometry.paths.length,0);assert(solver.sample.control.paths.some(p=>p.order>0));assert.throws(()=>createWorldCoverageSolver06({inspection:{...inspection},source:location.source,listener:location.listener}),/branded/);
 }finally{solver?.close();await h.close();}
});

test('coverage service is read-only, exposes bounded static status and accepts only its own actual solver samples through local capability',async()=>{
 const h=await startupHarness06(),f=startupWorld06(),c=h.create(f);let solver,other,view;
 try{await c.run();const inspection=await loaded(h,c,f),location=f.locations.at(-1);solver=createWorldCoverageSolver06({inspection,source:location.source,listener:location.listener});other=createWorldCoverageSolver06({inspection,source:location.source,listener:location.listener});view=await startWorldCoverageService06({coordinator:c,root:h.root,inspection,solver});
  const origin=view.service.descriptor.url,headers={'X-RichAudio-Token':view.service.descriptor.token};const response=await fetch(origin+'/api/worldcoverage06',{headers});assert.equal(response.status,200);const p=await response.json();assert.equal(p.completedEligibleTiles,12);assert.equal(p.eligibleComplete,true);assert.equal((await fetch(origin+'/api/worldcoverage06')).status,403);
  for(const route of ['/','/index.html','/worldcoverage06']){const html=await(await fetch(origin+route)).text();assert(html.includes('READ-ONLY CACHE INSPECTION'));assert(html.includes('[data-world06-unavailable]{display:none!important}'));for(const [kind,id]of [['recording','record-start'],['manual-context','context-file'],['replay','recordings']]){const block=html.match(new RegExp('<(?:section|footer) hidden data-world06-unavailable="'+kind+'">[\\s\\S]*?</(?:section|footer)>'));assert(block&&block[0].includes('id="'+id+'"'),'unavailable '+kind+' controls hidden in initial HTML');}assert(html.includes('id="show-cache-world"'),'read-only finite-cache inspection remains available');}
  for(const route of ['/api/telemetry','/api/passive','/api/record','/api/replay','/api/host','/api/service/stop'])assert.equal((await fetch(origin+route,{method:'POST',headers,body:'{}'})).status,405,route);
  assert.equal((await fetch(origin+'/api/worldcoverage06',{headers:{...headers,Origin:'http://example.invalid'}})).status,403);assert.equal((await fetch(origin+'/api/recordings',{headers})).status,405);
  assert.throws(()=>view.publish({...solver.sample}),/actual solver/);assert.throws(()=>view.publish(other.sample),/actual solver/);await view.publish(solver.step(.35));assert.throws(()=>{solver.sample.soundMapFrame.paths=[];},TypeError);
  const envelope=await(await fetch(origin+'/api/frame',{headers})).json();assert.equal(envelope.frame.listenerSessionId,solver.sample.soundMapFrame.listenerSessionId);assert(envelope.frame.paths.some(p=>p.order>0));assert.equal(view.service.recorder.status(),null);await view.close();assert.throws(()=>view.publish(solver.step(.4)),/open actual/);
 }finally{await view?.close();solver?.close();other?.close();await h.close();}
});

test('cache inspection rejects mismatched current page plans and preserves finite geometry expiry',async()=>{
 const h=await startupHarness06(),f=startupWorld06(),c=h.create(f);
 try{await c.run();const remote=f.locations[0],other=startupWorld06({changedYbn:true}).pages[0].inventory;await assert.rejects(loadWorldCoverageInspection06({coordinator:c,...remote,inventory:other}),/exact current/);
  const page=f.pages[0],expired=await loadWorldCoverageInspection06({coordinator:c,...remote,inventory:page.inventory,geometryTimeMs:60001});assert.equal(expired.geometry.tiles.find(t=>t.tileId===remote.tileId).state,'expired-fixture');assert.equal(expired.geometry.runtimeActivationVerified,false);assert.equal(expired.geometry.outsideCoverage,'unknown');
 }finally{await h.close();}
});

test('closing the read-only coverage service aborts and joins an in-flight solver publication', {timeout:10000},async()=>{
 const h=await startupHarness06(),f=startupWorld06(),c=h.create(f);let view,solver;
 try{
  await c.run();const inspection=await loaded(h,c,f),remote=f.locations.at(-1);solver=createWorldCoverageSolver06({inspection,source:remote.source,listener:remote.listener});view=await startWorldCoverageService06({coordinator:c,root:h.root,inspection,solver});
  const server=view.service.server,handler=server.listeners('request')[0];let entered;const started=new Promise(r=>entered=r);server.removeListener('request',handler);server.on('request',(req,res)=>{if(req.method==='POST'&&req.url==='/api/telemetry'){req.resume();entered();return;}handler(req,res);});
  const work=view.publish(solver.step(.35)),outcome=work.then(()=>({published:true}),error=>({published:false,name:error.name}));await started;await view.close();const result=await outcome;assert.equal(result.published,false);assert(['AbortError','TimeoutError'].includes(result.name));assert.equal(server.listening,false);assert.equal(view.service.recorder.status(),null);
 }finally{await view?.close();solver?.close();await h.close();}
});

test('processed partial XML stays amber and explicitly unlocalized when no missing-region coordinates are known',async()=>{
 const h=await startupHarness06(),xml=admittedOriginalXml05({authority:'review-policy-bound-static-export'}),inventory=xmlInventory05(xml.admission),f={catalogueId:'original-reviewed-coverage06',pages:[{pageId:'reviewed-page',inventory}],session:xml.session,discovery:startupWorld06().discovery,pageProvider:async()=>({inventory,inputs:xml.inputs})},c=h.create(f);
 try{
  const result=await c.run(),p=createWorldCoverageSnapshot06(c),tile=p.tiles[0];assert.equal(result.percent,100);assert.equal(p.eligibleComplete,true);assert.equal(p.readiness,'partial');assert.equal(p.geometryUnknownTiles,result.geometryUnknownTiles);assert.equal(p.geometryUnknownTiles,1);assert.equal(p.geometryUnknownRegions,0);assert.equal(p.geometryUnknownEntries,0);assert.equal(p.geometryUnverifiedTiles,0);assert.equal(tile.status,'prepared');assert.equal(tile.geometryCoverage,'partial');assert.equal(tile.viewClass,'processed-partial');assert.match(tile.geometryQualification,/not localized/);assert.deepEqual(tile.geometryMissingRegions,[]);assert.deepEqual(p.unknownRegions,[],'no synthetic location is fabricated for global partial coverage');assert.equal(p.installedWorldVerified,false);
 }finally{await h.close();}
});
