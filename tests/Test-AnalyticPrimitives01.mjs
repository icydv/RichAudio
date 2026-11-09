import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeAnalyticPrimitive01,tessellateAnalyticPrimitive01,validateAnalyticPrimitive01} from '../src/acoustics/world/analytic-primitives01.mjs';
import {identity} from '../src/acoustics/world/collision-mesh.mjs';
const material={type:7,data1:0x80000007,data2:65536};
const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a);
function primitive(family,{radius=.5,vertices=[[0,0,-1],[0,0,1]],center=[0,0,0],leafToRoot=[identity],...extra}={}){return normalizeAnalyticPrimitive01({polygon:{family,indices:family==='Sphere'?[0]:[0,1],radius,materialSlot:0},vertices,center,leafToRoot,materials:[material],node:3,polygonIndex:9,...extra});}
function closed(mesh){const edges=new Map(),key=p=>p.map(x=>Math.round(x*1e8)).join(',');for(const {positions}of mesh.triangles)for(let i=0;i<3;i++){const a=key(positions[i]),b=key(positions[(i+1)%3]),edge=[a,b].sort().join('|');assert.notEqual(a,b,'no collapsed facet edge');edges.set(edge,(edges.get(edge)??0)+1);}for(const count of edges.values())assert.equal(count,2,'every shell edge shared by two facets');}

test('sphere/capsule/cylinder remain distinct closed shells with outward winding and original native materials',()=>{
 const meshes={};for(const family of ['Sphere','Capsule','Cylinder']){
  const normalized=primitive(family);assert.equal(normalized.state,'supported-analytic');assert.ok(Buffer.byteLength(JSON.stringify(normalized.primitive))<1200,'compact parameters, no dense disk tessellation');
  const p=normalized.primitive,mesh=tessellateAnalyticPrimitive01(p,{maximumErrorMetres:.03,maximumTriangles:4096});meshes[family]=mesh;assert.equal(mesh.state,'approximated-analytic');assert.ok(mesh.maximumErrorMetres<=.03+1e-12);assert.equal(mesh.exactAnalyticSurface,false);closed(mesh);
  const inside=p.b?p.a.map((x,i)=>(x+p.b[i])/2):p.a;
  for(const triangle of mesh.triangles){assert.equal(triangle.materialType,material.type);assert.equal(triangle.data1,material.data1);assert.equal(triangle.data2,material.data2);assert.equal(triangle.node,3);assert.equal(triangle.polygon,9);const centroid=[0,1,2].map(i=>triangle.positions.reduce((n,v)=>n+v[i],0)/3);assert.ok(dot(triangle.normal,sub(centroid,inside))>0);}
 }
 const capsuleMax=Math.max(...meshes.Capsule.triangles.flatMap(t=>t.positions.map(p=>p[2]))),cylinderMax=Math.max(...meshes.Cylinder.triangles.flatMap(t=>t.positions.map(p=>p[2])));assert.equal(cylinderMax,1);assert.equal(capsuleMax,1.5,'hemispherical capsule extends beyond cylinder flat cap');
});

test('center-first SharpDX affine chains retain nonuniform scale/shear, mirrored winding and exact derived extents',()=>{
 const transform=[-2,.4,0,0,0,3,.5,0,0,0,1.5,0,10,20,30,1],parent=[...identity];parent[12]=5;parent[13]=-7;parent[14]=2;
 const normalized=primitive('Sphere',{radius:1,vertices:[[1,2,3]],center:[4,5,6],leafToRoot:[transform,parent]});assert.equal(normalized.state,'supported-analytic');const p=normalized.primitive;assert.deepEqual(p.a,[5,36,49]);assert.equal(p.affineOrientation,-1);assert.deepEqual(p.radiusAxes,[[-2,.3999999999999986,0],[0,3,.5],[0,0,1.5]]);
 assert.ok(Math.abs(p.bounds.min[0]-3)<1e-12);assert.ok(Math.abs(p.bounds.max[1]-(36+Math.sqrt(9.16)))<1e-12);
 const mesh=tessellateAnalyticPrimitive01(p,{maximumErrorMetres:.05,maximumTriangles:8192});assert.equal(mesh.state,'approximated-analytic');closed(mesh);
 for(const t of mesh.triangles){const centroid=[0,1,2].map(i=>t.positions.reduce((n,v)=>n+v[i],0)/3);assert.ok(dot(t.normal,sub(centroid,p.a))>0,'mirrored faces retain outward normals');for(const q of t.positions){const dx=q[0]-p.a[0],dy=q[1]-p.a[1],dz=q[2]-p.a[2],x=dx/-2,y=(dy-.4*x)/3,z=(dz-.5*y)/1.5;assert.ok(Math.abs(Math.hypot(x,y,z)-1)<1e-12,'each generated vertex stays on the source affine ellipsoid');}}
});

test('measured facet-centroid deviation respects explicit bound and refinement lowers approximation error',()=>{
 for(const family of ['Sphere','Capsule','Cylinder']){
  const p=primitive(family,{radius:1}).primitive,coarse=tessellateAnalyticPrimitive01(p,{maximumErrorMetres:.1,maximumTriangles:4096}),fine=tessellateAnalyticPrimitive01(p,{maximumErrorMetres:.025,maximumTriangles:8192});assert.equal(fine.state,'approximated-analytic');assert.ok(fine.triangles.length>coarse.triangles.length);assert.ok(fine.maximumErrorMetres<coarse.maximumErrorMetres);
  for(const t of fine.triangles){const c=[0,1,2].map(i=>t.positions.reduce((n,v)=>n+v[i],0)/3);let deviation;
   if(family==='Sphere')deviation=1-norm(sub(c,p.a));
   else if(family==='Capsule'){const z=Math.max(-1,Math.min(1,c[2]));deviation=1-Math.hypot(c[0],c[1],c[2]-z);}
   else deviation=Math.min(1-Math.hypot(c[0],c[1]),Math.abs(c[2]+1),Math.abs(c[2]-1));
   assert.ok(deviation>=-1e-12&&deviation<=fine.maximumErrorMetres+1e-12,`${family} observed centroid error ${deviation}`);
  }
 }
});

test('unsupported/invalid/oversized geometry remains explicit unknown without publishing partial shells',()=>{
 for(const family of ['Sphere','Capsule','Cylinder']){const huge=primitive(family,{radius:100}).primitive,result=tessellateAnalyticPrimitive01(huge,{maximumErrorMetres:.001,maximumTriangles:32});assert.equal(result.state,'unknown');assert.equal(result.triangles.length,0);assert.ok(result.bounds);}
 for(const change of [{radius:-1},{radius:NaN},{materials:[]},{polygon:{family:'Sphere',indices:[9],radius:1,materialSlot:0}},{leafToRoot:[[...identity.slice(0,15),0]]}])assert.equal(primitive('Sphere',change).state,'unknown');
 assert.equal(primitive('Cylinder',{vertices:[[0,0,0],[0,0,0]]}).state,'unknown');assert.equal(primitive('Capsule',{vertices:[[0,0,0],[0,0,0]]}).primitive.family,'Sphere','collapsed capsule preserves its exact spherical limit');
 const p=primitive('Sphere').primitive,bad=structuredClone(p);bad.bounds.max[0]++;assert.throws(()=>validateAnalyticPrimitive01(bad),/bounds derivation/);assert.throws(()=>tessellateAnalyticPrimitive01(p,{maximumErrorMetres:0}),/controls/);
 assert.equal(tessellateAnalyticPrimitive01(primitive('Sphere',{radius:1e-6}).primitive).state,'unknown');
});
