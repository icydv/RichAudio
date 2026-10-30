import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {convertCollision,identity,transformPoint,resourcePoint,encodeChunk,decodeChunk,sha256,queryChunkIds,queryUnknownRegions,boxSurface,triangleNormal} from '../src/acoustics/world/collision-mesh.mjs';
import {exportCollision} from '../src/acoustics/world/convert-collision.mjs';
import {loadCollisionResource} from '../src/acoustics/world/collision-resource.mjs';
const translation=(x,y,z)=>identity.map((v,i)=>i===12?x:i===13?y:i===14?z:v);
const rotate=[0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1];
const leaf=()=>({id:'n2',parent:'n1',type:'BoundBVH',transform:rotate,center:[10,0,0],vertices:[[0,0,0],[1,0,0],[0,1,0]],materials:[{type:7,data1:0x80000007,data2:65536}],polygons:[{family:'Triangle',indices:[0,1,2],materialSlot:0},{family:'Sphere',indices:[0],radius:2,materialSlot:0}],oracleSamples:[{index:1,positionInParent:[0,11,0]}]});
const fixture=()=>({schema:1,kind:'CodeWalkerYbnMesh',source:{archive:'synthetic.rpf',entry:'synthetic.ybn',sha256:'a'.repeat(64),coordinateSpace:'resource-root',placement:'unresolved-static-vs-archetype-local'},nodes:[{id:'n0',parent:null,type:'BoundComposite',transform:translation(100,0,0)},{id:'n1',parent:'n0',type:'BoundComposite',transform:translation(0,20,0)},leaf()]});
assert.deepEqual(transformPoint([1,2,3],translation(10,20,30)),[11,22,33]);
assert.deepEqual(resourcePoint([1,0,0],[10,0,0],[rotate,translation(0,20,0),translation(100,0,0)]),[100,31,0]);
const converted=convertCollision(fixture(),{chunkTriangles:1,cellSize:16});
assert.deepEqual(converted.chunks[0].triangles[0].positions,[[100,30,0],[100,31,0],[99,30,0]]);
assert.equal(converted.chunks[0].triangles[0].materialType,7);
assert.equal(converted.unsupported.Sphere,1);assert.equal(converted.coverage,'triangle-and-box-surfaces-incomplete');assert.equal(converted.placement,'unresolved-static-vs-archetype-local');assert.equal(converted.counts.oracleSamples,1);
assert.equal(queryUnknownRegions(converted,{min:[99,29,-1],max:[100,31,1]}).length,1);assert.equal(queryUnknownRegions(converted,{min:[1000,0,0],max:[1001,1,1]}).length,0);
assert.deepEqual(converted.bounds,{min:[98,28,-2],max:[102,32,2]});
const encoded=encodeChunk(converted.chunks[0].triangles),hash=sha256(encoded),decoded=decodeChunk(encoded,hash);
assert.deepEqual(decoded,converted.chunks[0].triangles);assert.equal(encoded.length,120);
const corrupted=Buffer.from(encoded);corrupted[80]^=1;assert.throws(()=>decodeChunk(corrupted,hash),/integrity/);
assert.deepEqual(queryChunkIds(converted,{min:[99.5,30.5,-1],max:[101,32,1]}),[0]);assert.deepEqual(queryChunkIds(converted,{min:[1000,0,0],max:[1001,1,1]}),[]);
// Centroid-only indexing would miss this triangle on the opposite side of a cell boundary.
const crossing=fixture();crossing.nodes[2].vertices=[[0,0,0],[100,0,0],[0,100,0]];crossing.nodes[2].oracleSamples=[];const crossed=convertCollision(crossing,{cellSize:16});assert.deepEqual(queryChunkIds(crossed,{min:[0,30,0],max:[1,31,0]}),[0]);
const huge=fixture();huge.nodes[2].vertices=[[0,0,0],[100000,0,0],[0,100000,0]];huge.nodes[2].oracleSamples=[];const overflow=convertCollision(huge,{cellSize:16});assert.deepEqual(overflow.overflowChunks,[0]);assert.deepEqual(queryChunkIds(overflow,{min:[-90000,30,0],max:[-89999,31,0]}),[0]);
const badIndex=fixture();badIndex.nodes[2].polygons[0].indices[0]=3;assert.throws(()=>convertCollision(badIndex),/vertex index/);
const badMaterial=fixture();badMaterial.nodes[2].polygons[0].materialSlot=1;assert.throws(()=>convertCollision(badMaterial),/material slot/);
const badOracle=fixture();badOracle.nodes[2].oracleSamples[0].positionInParent=[10,1,0];assert.throws(()=>convertCollision(badOracle),/oracle mismatch/);
const badMatrix=fixture();badMatrix.nodes[1].transform[3]=1;assert.throws(()=>convertCollision(badMatrix),/affine/);
const badOrder=fixture();badOrder.nodes[2].parent='n3';assert.throws(()=>convertCollision(badOrder),/parent/);
const reflected=fixture();reflected.nodes[2].transform=identity.map((v,i)=>i===10?-1:v);reflected.nodes[2].oracleSamples=[];assert.deepEqual(convertCollision(reflected).chunks[0].triangles[0].normal,[0,0,-1]);
const primitive=fixture();primitive.nodes.push({id:'n3',parent:'n0',type:'BoundSphere',transform:identity,unsupportedBound:true});assert.equal(convertCollision(primitive).unsupported.BoundSphere,1);
primitive.nodes[3].declaredBounds={min:[10000,10000,10000],max:[10001,10001,10001]};assert.equal(queryUnknownRegions(convertCollision(primitive),{min:[0,0,0],max:[1,1,1]}).some(r=>r.family==='BoundSphere'),true);
const scaled=identity.map((v,i)=>i===0?2:i===5?3:i===10?4:v);assert.deepEqual(resourcePoint([1,2,3],[10,20,30],[scaled]),[22,66,132]);
// Four diagonal native points exactly reconstruct a skew parallelepiped, including its outward normals.
const add=(a,b)=>a.map((v,i)=>v+b[i]),origin=[3,4,5],edges=[[2,1,0],[0,3,1],[1,0,4]],encodedBox=[origin,add(origin,add(edges[1],edges[2])),add(origin,add(edges[0],edges[1])),add(origin,add(edges[0],edges[2]))],surfaces=boxSurface(encodedBox),corners=Array.from({length:8},(_,mask)=>edges.reduce((v,e,i)=>(mask>>i)&1?add(v,e):v,origin)),center=corners[0].map((_,i)=>corners.reduce((s,p)=>s+p[i],0)/8);
assert.equal(surfaces.length,12);assert.equal(new Set(surfaces.flat().map(JSON.stringify)).size,8);assert.deepEqual([...new Set(surfaces.flat().map(JSON.stringify))].sort(),corners.map(JSON.stringify).sort());
for(const positions of surfaces){const normal=triangleNormal(positions);assert.ok(normal.reduce((s,v,i)=>s+v*(positions[0][i]-center[i]),0)>0);}
const boxFixture=fixture();boxFixture.nodes[2].vertices=encodedBox;boxFixture.nodes[2].polygons=[{family:'Box',indices:[0,1,2,3],materialSlot:0}];boxFixture.nodes[2].oracleSamples=[];const boxMesh=convertCollision(boxFixture);assert.equal(boxMesh.counts.boxPolygons,1);assert.equal(boxMesh.counts.triangles,12);assert.equal(boxMesh.unsupported.Box,undefined);assert.equal(boxMesh.chunks[0].triangles.every(t=>t.data1===0x80000007&&t.normal!==null),true);
const expectedRotated=corners.map(v=>resourcePoint(v,[10,0,0],[rotate,translation(0,20,0),translation(100,0,0)])).map(JSON.stringify).sort();assert.deepEqual([...new Set(boxMesh.chunks[0].triangles.flatMap(t=>t.positions).map(JSON.stringify))].sort(),expectedRotated);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rich-audio-collision-'));try{const input=path.join(directory,'input.json');fs.writeFileSync(input,JSON.stringify(fixture()));const receipt=exportCollision(input,directory),index=JSON.parse(fs.readFileSync(receipt.index));assert.equal(index.chunks.length,1);const chunkPath=path.join(path.dirname(receipt.index),index.chunks[0].file);assert.equal(decodeChunk(fs.readFileSync(chunkPath),index.chunks[0].sha256).length,1);const resource=loadCollisionResource(receipt.index,{expectedSHA256:receipt.indexSHA256}),view=resource.query({min:[99,29,-1],max:[101,32,1]});assert.equal(resource.indexIntegrity,'expected-sha256-verified');assert.throws(()=>loadCollisionResource(receipt.index,{expectedSHA256:'0'.repeat(64)}),/index integrity/);assert.equal(view.triangles.length,1);assert.equal(view.unknownRegions.length,1);assert.equal(view.worldPlacementVerified,false);fs.writeFileSync(chunkPath,Buffer.alloc(index.chunks[0].bytes));assert.throws(()=>resource.query({min:[99,29,-1],max:[101,32,1]}),/header/);index.chunks[0].bounds.min=[null,1,2];fs.writeFileSync(receipt.index,JSON.stringify(index));assert.throws(()=>loadCollisionResource(receipt.index),/contract/);assert.throws(()=>exportCollision(input,directory),/EEXIST/);}finally{fs.rmSync(directory,{recursive:true,force:true});}
console.log('Installed collision conversion passed: nested transforms, geometry center, parser oracle, material identity, unsupported coverage, conservative spatial indexing, binary integrity and private publication. Synthetic only.');
