import test from 'node:test';
import assert from 'node:assert/strict';
import {createInteriorTopology04,createInteriorState04,planInteriorPropagation04} from '../src/acoustics/world/interior04.mjs';
import {interiorFixture04,interiorStateFixture04,interiorSession04} from './fixtures/Interior04.mjs';
import {createTile} from '../src/acoustics/research/local-geometry.mjs';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
function setup(options={}){const f=interiorFixture04(options),topology=createInteriorTopology04(f.input,{scene:f.scene});return {...f,topology,state:createInteriorState04(topology,interiorStateFixture04(topology))};}
const query=(topology,state,extra={})=>planInteriorPropagation04(topology,state,{from:'outside',to:'upper',sourcePosition:[-2,2,1],listenerPosition:[2,2,4.5],now:100,session:interiorSession04,generation:1,...extra});

test('explicit two-floor topology retains existing wall/floor/ceiling geometry and both propagation directions',()=>{
 const {topology,state,scene}=setup(),up=query(topology,state),down=query(topology,state,{from:'upper',to:'outside',sourcePosition:[2,2,4.5],listenerPosition:[-2,2,1]});
 assert.equal(up.status,'candidate-routes');assert.equal(up.routes.length,2);const route=up.routes.find(r=>r.portals.length===2);assert.deepEqual(route.rooms,['outside','lower','upper']);
 assert.deepEqual(route.portals.map(p=>p.id),['entry','stairs']);assert.deepEqual(route.transmissionEnergy,[.81,.6400000000000001,.48999999999999994]);assert.ok(Math.abs(route.attenuationDb[0]+10*Math.log10(.81))<1e-12);
 assert.ok(route.reflectionSurfaceIds.includes('between-floor'));assert.equal(route.rendererVisibilityQualified,false);assert.equal(up.acousticRoutingApplied,false);assert.equal(up.pcmQueueFramesAdded,0);assert.equal(up.sourceGenerationsModified,0);
 assert.equal(topology.scene,scene);assert.equal(topology.installedInteriorVerified,false);assert.deepEqual(down.routes.map(r=>r.transmissionEnergy).sort(),up.routes.map(r=>r.transmissionEnergy).sort());
});

test('closed/open doors and windows change passive candidate loss without changing static topology',()=>{
 const {topology,state}=setup(),before=topology.topologyDigest,closed=createInteriorState04(topology,interiorStateFixture04(topology,{portals:{entry:'closed','upper-window':'closed'}}));
 const openRoute=query(topology,state).routes.find(r=>r.portals.length===2),closedRoute=query(topology,closed).routes.find(r=>r.portals.length===2);
 assert.ok(closedRoute.transmissionEnergy.every((v,i)=>v<openRoute.transmissionEnergy[i]));assert.deepEqual(closedRoute.portals[0].reflection,[.7,.6,.5]);assert.equal(topology.topologyDigest,before);assert.notEqual(state.stateDigest,closed.stateDigest);
 const windowOpen=createInteriorState04(topology,interiorStateFixture04(topology,{portals:{entry:'closed','upper-window':'open'}}));assert.ok(query(topology,windowOpen).routes.find(r=>r.portals.length===1).transmissionEnergy[2]>.01);
});

test('zero transmission blocks a known route without inferring a wall leak',()=>{
 const f=interiorFixture04();f.input.portals=f.input.portals.filter(p=>p.id!=='upper-window');f.input.portals[0].profiles.closed.transmission=[0,0,0];
 const topology=createInteriorTopology04(f.input,{scene:f.scene}),state=createInteriorState04(topology,interiorStateFixture04(topology,{portals:{entry:'closed'}}));assert.equal(query(topology,state).status,'no-known-route');assert.equal(query(topology,state).routes.length,0);
});

test('unknown endpoints and missing room/portal information never fabricate connectivity',()=>{
 const f=interiorFixture04();f.input.portals[1].b=null;f.input.portals[1].topology='unknown';f.input.portals=f.input.portals.filter(p=>p.id!=='upper-window');
 const topology=createInteriorTopology04(f.input,{scene:f.scene}),state=createInteriorState04(topology,interiorStateFixture04(topology,{portals:{entry:'open'}})),result=query(topology,state);
 assert.equal(result.status,'partial-unknown-connectivity');assert.equal(result.routes.length,0);assert.equal(result.unknownConnectivity,true);
 const missing=interiorFixture04();missing.input.rooms[1].completeness='unknown';missing.input.rooms[1].surfaces.ceilings=[];const t=createInteriorTopology04(missing.input,{scene:missing.scene}),s=createInteriorState04(t,interiorStateFixture04(t));assert.equal(query(t,s).reason,'unknown-room-geometry');
});

test('unknown runtime portal state stays unknown and cannot default to open or closed',()=>{
 const {topology}=setup(),state=createInteriorState04(topology,interiorStateFixture04(topology,{portals:{'upper-window':'unknown'}})),result=query(topology,state);assert.equal(result.status,'partial-unknown-connectivity');assert.equal(result.routes.length,0);
});

test('an outside endpoint cannot replace a known adjacent room across a shared floor boundary',()=>{
 const f=interiorFixture04();f.input.portals[0].aperture=[[1,1,3],[3,1,3],[3,3,3],[1,3,3]];
 assert.throws(()=>createInteriorTopology04(f.input,{scene:f.scene}),/outside portal conflicts/);
 const g=interiorFixture04();g.input.portals[2].aperture=[[1,1,3],[3,1,3],[3,3,3],[1,3,3]];
 assert.throws(()=>createInteriorTopology04(g.input,{scene:g.scene}),/outside portal conflicts/);
});

test('partial static scene coverage stays unknown even without exact missing-region bounds',()=>{
 const f=interiorFixture04(),scene=acousticScene(createTile({...f.scene.tile,coverage:'partial'}),f.scene.materials);
 const topology=createInteriorTopology04(f.input,{scene}),state=createInteriorState04(topology,interiorStateFixture04(topology)),result=query(topology,state);
 assert.equal(result.status,'partial-unknown-connectivity');assert.equal(result.unknownConnectivity,true);assert.ok(result.routes.length>0);assert.ok(result.routes.every(r=>r.rendererVisibilityQualified===false));
});

test('unknown/inactive IPL and interior activation independently gate topology routes',()=>{
 const {topology}=setup();for(const activation of [{},{'ipl:original':true},{'ipl:original':'unknown','interior:original':true}]){const s=createInteriorState04(topology,interiorStateFixture04(topology,{activation}));assert.equal(query(topology,s).reason,'unknown-interior-or-ipl-activation');}
 const inactive=createInteriorState04(topology,interiorStateFixture04(topology,{activation:{'ipl:original':true,'interior:original':false}}));assert.equal(query(topology,inactive).status,'inactive');
});

test('state lifetime, session/generation and earliest static-surface expiry reject reuse',()=>{
 const {topology,state}=setup();assert.equal(query(topology,state,{now:1000}).reason,'interior-state-expired-or-future');assert.equal(query(topology,state,{session:'5'.repeat(32)}).reason,'runtime-session-or-generation-mismatch');assert.equal(query(topology,state,{generation:2}).reason,'runtime-session-or-generation-mismatch');
 const future=createInteriorState04(topology,interiorStateFixture04(topology,{observedAt:200,validUntil:1000}));assert.equal(query(topology,future).reason,'interior-state-expired-or-future');
 const expired=setup({surfaceUntil:80});assert.equal(query(expired.topology,expired.state).reason,'interior-static-scene-expired-or-future');
});

test('supported custom fixture contracts retain custom provenance without claiming actual interior compatibility',()=>{
 const {topology,state}=setup({mapKind:'custom'}),result=query(topology,state);assert.equal(topology.mapKind,'custom');assert.equal(result.status,'candidate-routes');assert.equal(result.runtimeCompatibilityVerified,false);
 const f=interiorFixture04();f.input.authority='installed-resource';assert.throws(()=>createInteriorTopology04(f.input,{scene:f.scene}),/installed MLO compatibility/);
});

test('malformed topology, references, geometry and passive coefficients fail closed',()=>{
 const mutations=[f=>f.input.rooms.push(structuredClone(f.input.rooms[0])),f=>f.input.rooms[1].bounds.min[2]=2,f=>f.input.rooms[0].surfaces.floors=['not-decoded'],f=>f.input.rooms[0].surfaces.floors=['lower-wall'],f=>f.input.rooms[0].surfaces.ceilings=[],f=>f.input.portals[0].b='unresolved-room',f=>f.input.portals[0].b=null,f=>f.input.portals[0].aperture[2][0]=1,f=>f.input.portals[0].aperture=f.input.portals[0].aperture.map(p=>[2,p[1],p[2]+.2]),f=>f.input.portals[0].profiles.open.reflection=[1,1,1],f=>f.input.portals[0].profiles.open.basis='measured'];
 for(const mutate of mutations){const f=interiorFixture04();mutate(f);assert.throws(()=>createInteriorTopology04(f.input,{scene:f.scene}));}
 const {topology,state}=setup();assert.throws(()=>query({...topology},state),/branded/);assert.throws(()=>query(topology,{...state}),/branded/);assert.throws(()=>query(topology,state,{sourcePosition:[2,2,1]}),/declared room/);
 assert.throws(()=>createInteriorState04(topology,{...interiorStateFixture04(topology),portals:{stairs:'closed'}}),/declared door/);assert.throws(()=>createInteriorState04(topology,{...interiorStateFixture04(topology),validUntil:1001}),/bounded independently/);
});

test('finite path search reports truncation and keeps unknown connectivity explicit',()=>{
 const {topology,state}=setup(),limited=query(topology,state,{maxPaths:1});assert.equal(limited.status,'budget-limited');assert.equal(limited.searchComplete,false);assert.equal(limited.routes.length,1);assert.throws(()=>query(topology,state,{maxHops:9}),/bounded/);
 const f=interiorFixture04();f.input.unknown=['room-portal-record-not-decoded'];const t=createInteriorTopology04(f.input,{scene:f.scene}),s=createInteriorState04(t,interiorStateFixture04(t));assert.equal(query(t,s).status,'partial-unknown-connectivity');
});
