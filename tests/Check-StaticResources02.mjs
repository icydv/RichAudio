// Explicit CLI: requires the original binary fixture receipt, never auto-scans.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {createExplicitResourceScene02,effectiveExplicitResources02} from '../src/acoustics/world/resource-scene02.mjs';
import {querySegment} from '../src/acoustics/research/local-geometry.mjs';
import {collisionFixture02} from '../src/acoustics/collisions/fixtures.mjs';
import {createAuthoredCollisionContext,createAuthoredCollisionEvent} from '../src/acoustics/collisions/contracts.mjs';
import {renderCollisionFixture02} from '../src/acoustics/collisions/render.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url)),sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const closure=new Map();function source(file){file=path.resolve(file);if(closure.has(file))return;const text=fs.readFileSync(file,'utf8');closure.set(file,sha(file));
 for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))source(path.resolve(path.dirname(file),match[1]));
 for(const match of text.matchAll(/new URL\(['"](\.[^'"]+\.mjs)['"],\s*import.meta.url\)/g))source(path.resolve(path.dirname(file),match[1]));}
source(fileURLToPath(import.meta.url));
const file=process.argv[2];if(!file)throw Error('Explicit original binary fixture receipt required');
const receipt=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));assert.equal(receipt.passed,true);assert.equal(receipt.gameFilesRead,false);
const entries=receipt.result.resources;assert.deepEqual(entries.map(e=>e.kind),['ymap','ytyp','ybn']);
for(const entry of entries){const bytes=fs.readFileSync(path.join(path.dirname(file),'original.'+entry.kind));assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.equal(bytes.toString('ascii',0,4),'RSC7');}
const resources=entries.map(e=>({id:e.kind==='ybn'?'mesh':e.kind,path:'original.'+e.kind,kind:e.kind,order:0,sha256:e.sha256,deleted:false,normalized:e.normalized}));
const options={resources,bindings:[{archetypeHash:123456789,resourceId:'mesh',basis:'authored-fixture'}],materialTable:{7:{reflection:[.64,.49,.25],transmission:[0,0,0],basis:'authored-assumption',reference:'original-material02'}},
 session:'d'.repeat(32),region:{min:[-16,-16,-8],max:[16,16,16]},listenerAnchor:[0,0,1]};
const built=createExplicitResourceScene02(options);assert.equal(built.state,'qualified-original-resource-fixture');assert.equal(built.metadata.placedInstances,1);assert.equal(built.metadata.finiteTriangleSupports,1);
const surface=built.scene.tile.surfaces[0];assert.equal(surface.footprint.length,3);assert(Math.abs(surface.center[0]-2)<1e-5);assert(Math.abs(surface.center[1]-4)<1e-5);
assert.equal(querySegment(built.scene.tile,[2,3,1],[2,5,1]).hits.length,1);assert.equal(querySegment(built.scene.tile,[2.95,3,1.9],[2.95,5,1.9]).hits.length,0,'triangle footprint must not fill its bounding rectangle');
assert.equal(createExplicitResourceScene02({...options,materialTable:{}}).state,'unqualified-material');assert.equal(createExplicitResourceScene02({...options,bindings:[]}).state,'unqualified-placement');
const override=structuredClone(resources[0]);override.id='custom-map';override.order=1;override.normalized.sourceSHA256=override.sha256='e'.repeat(64);override.normalized.data.entities[0].position[0]=4;
const changed=createExplicitResourceScene02({...options,resources:[...resources,override]});assert.notEqual(changed.worldDigest,built.worldDigest);assert(Math.abs(changed.scene.tile.surfaces[0].center[0]-4)<1e-5);
assert.throws(()=>effectiveExplicitResources02([...resources,{...resources[0],id:'ambiguous'}]),/ambiguous/);
const fixture=collisionFixture02('high-energy',{seconds:.8}),context=createAuthoredCollisionContext({session:options.session,knownThroughFrame:fixture.frames}),raw=structuredClone(fixture.events[0]);raw.identity.session=options.session;raw.contact.position=[2,3,1];fixture.context=context;fixture.events=[createAuthoredCollisionEvent(raw,context)];fixture.listener.position=[2,2,1];
const reflected=await renderCollisionFixture02(fixture,{scene:built.scene,late:false}),open=await renderCollisionFixture02(fixture,{late:false});
assert.equal(reflected.summary.sources[0].pcmSha256,open.summary.sources[0].pcmSha256);assert.notEqual(reflected.summary.outputSha256,open.summary.outputSha256);
const reflection=reflected.summary.firstQualifiedPaths.find(p=>p.order===1);assert(reflection);assert(Math.abs(reflection.distance-3)<1e-5);assert(Math.abs(reflection.delayFrames-3/343*48000)<1e-3);
assert.equal(reflected.summary.diagnostics.renderer.limited,0);assert.equal(reflected.summary.diagnostics.history.affectedFrames,0);
for(const [file,before]of closure)assert.equal(sha(file),before,'source changed during original resource/audio check');
const result={schema:1,passed:true,originalBinaryKinds:['ymap','ytyp','ybn'],instances:1,triangleSupports:1,finiteFootprintVerified:true,overrideInvalidatesCache:true,
 sourcePins:[...closure].map(([file,sha256])=>({file:path.relative(repo,file).replaceAll('\\','/'),sha256})),
 acousticComparison:{sameOriginalDryPcm:true,sourceSha256:reflected.summary.sources[0].pcmSha256,openSha256:open.summary.outputSha256,resourceSceneSha256:reflected.summary.outputSha256,
  physicalReflectedDistanceMetres:reflection.distance,physicalReflectedDelayFrames:reflection.delayFrames,renderedWithoutLimitingOrHistoryFaults:true},
 worldDigest:built.worldDigest,changedWorldDigest:changed.worldDigest,gameFilesRead:false,installedWorldVerified:false,sourceEventAcquisition:false,endpointOpened:false};
fs.writeFileSync(path.join(path.dirname(file),'independent-placement-check.json'),JSON.stringify(result,null,2));console.log('PASS original RSC7 YMAP/YTYP/YBN decode → placement → finite acoustic triangle/override and matched collision PCM checks; installed world unverified.');
