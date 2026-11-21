import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {originalInstalledCache01} from './fixtures/InstalledStaticCache01.mjs';
import {exportCollision} from '../src/acoustics/world/convert-collision.mjs';
import {identity,sha256} from '../src/acoustics/world/collision-mesh.mjs';
import {classifyStaticWorldResource} from '../src/acoustics/world/static-world-resource.mjs';
import {upgradeNativeSupportBounds01} from '../src/acoustics/world/native-support-bounds-completion01.mjs';
test('native indexed bounds do not incorrectly reject complete reconstructed rotated Box corners',()=>{
 const f=originalInstalledCache01();try{
  const a=[1,1,1].map(v=>v/Math.sqrt(3)),b=[1,-1,0].map(v=>v/Math.sqrt(2)),c=[1,1,-2].map(v=>v/Math.sqrt(6)),add=(x,y)=>x.map((v,i)=>v+y[i]),points=[[0,0,0],add(b,c),add(a,b),add(a,c)];
  const raw={schema:1,kind:'CodeWalkerYbnMesh',source:{archive:'a.rpf',entry:'a.rpf/original_wall.ybn',sha256:'a'.repeat(64),coordinateSpace:'resource-root',placement:'unresolved-static-vs-archetype-local'},nodes:[{id:'n0',parent:null,type:'BoundGeometry',transform:identity,center:[0,0,0],vertices:points,polygons:[{family:'Box',indices:[0,1,2,3],materialSlot:0}],materials:[{type:7,data1:7,data2:0}]}]};
  const input=path.join(f.root,'box.json');fs.writeFileSync(input,JSON.stringify(raw));fs.mkdirSync(path.join(f.root,'box-output'));const output=exportCollision(input,path.join(f.root,'box-output')),index=JSON.parse(fs.readFileSync(output.index,'utf8')),catalog=JSON.parse(fs.readFileSync(f.catalogPath,'utf8')),item=catalog.CollisionPlacementIndex.BoundsStoreItemsByHash[catalog.Resources[0].Hash][0];item.Min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i])));item.Max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
  const receipt=JSON.parse(fs.readFileSync(f.manifest.Resources[0].Result.ReceiptPath,'utf8')),pins={indexSHA256:output.indexSHA256,catalogSHA256:'a'.repeat(64),receiptSHA256:'a'.repeat(64)},classification=classifyStaticWorldResource(index,catalog,receipt,pins);
  assert.equal(classification.state,'codewalker-exterior-static-model');assert.equal(classification.maxOutsideCacheBoundsNativeUnits,0);assert.equal(classification.boundsToleranceNativeUnits,.001);assert(classification.reconstructedSurfaceMaxOutsideCacheBoundsNativeUnits>.1);assert(classification.queryBounds.max[0]>item.Max[0]);
  const legacy=structuredClone(index);delete legacy.nativeSupportBounds01;assert.equal(classifyStaticWorldResource(legacy,catalog,receipt,pins).reason,'export-outside-native-cache-bounds');
  const corrupt=structuredClone(index);corrupt.nativeSupportBounds01.chunkSHA256[0]='f'.repeat(64);assert.equal(classifyStaticWorldResource(corrupt,catalog,receipt,pins).reason,'invalid-native-indexed-source-bounds');
  item.Max[0]-=.01;assert.equal(classifyStaticWorldResource(index,catalog,receipt,pins).reason,'export-outside-native-cache-bounds','a real indexed-source bounds mismatch still fails unchanged tolerance');item.Max[0]+=.01;
  const old=path.join(path.dirname(output.index),'legacy-index.json');fs.writeFileSync(old,JSON.stringify(legacy));const pin=sha256(fs.readFileSync(old)),upgrade=upgradeNativeSupportBounds01({normalizedPath:input,indexPath:old,indexSHA256:pin,outputRoot:path.join(f.root,'derived')});assert(upgrade.allBaseChunksReproduced);assert.equal(sha256(fs.readFileSync(old)),pin);assert.equal(upgrade.qualifier.boundsToleranceChanged,false);
  raw.nodes[0].vertices[0][0]+=.1;fs.writeFileSync(input,JSON.stringify(raw));assert.throws(()=>upgradeNativeSupportBounds01({normalizedPath:input,indexPath:old,indexSHA256:pin,outputRoot:path.join(f.root,'bad')}),/reproduce exact base geometry/);
 }finally{f.close();}
});
