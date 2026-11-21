// Entirely arithmetic original geometry matching retained computational scale.
// No installed resource, historical geometry or proprietary coordinates are read.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {exportCollision} from '../../src/acoustics/world/convert-collision.mjs';
import {collisionNameHash} from '../../src/acoustics/world/static-world-resource.mjs';
import {identity} from '../../src/acoustics/world/collision-mesh.mjs';
export const pressureEpoch01='2026-11-06T09:00:00.000Z';
const sha=x=>createHash('sha256').update(Buffer.isBuffer(x)||typeof x==='string'?x:JSON.stringify(x)).digest('hex');
function wall(vertices,polygons,count,{axis='y',at=0,start=-6,width=12,bottom=0,height=4,columns=100,offset=0}={}){
 for(let t=0;t<count;t++){const cell=Math.floor(t/2)+offset,column=cell%columns,row=Math.floor(cell/columns),u0=start+column*width/columns,u1=u0+width/columns,h0=bottom+row*height/Math.max(1,Math.ceil((Math.ceil(count/2)+offset)/columns)),h1=h0+height/Math.max(1,Math.ceil((Math.ceil(count/2)+offset)/columns));
  const xy=(u,h)=>axis==='y'?[u,at,h]:[at,u,h],points=t%2===0?[xy(u0,h0),xy(u1,h0),xy(u1,h1)]:[xy(u0,h0),xy(u1,h1),xy(u0,h1)],v=vertices.length;vertices.push(...points);polygons.push({family:'Triangle',indices:[v,v+1,v+2],materialSlot:0});
 }
}
export function createCachePressure01(root,{nearNativeTriangles=189,duplicateNativeTriangles=8,neighbor=true,bridge=true}={}){
 root=path.resolve(root);
 if(fs.existsSync(path.join(root,'fixture.json')))throw Error('Original pressure fixture already exists');fs.mkdirSync(root,{recursive:true});
 const write=(name,value)=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(value),{flag:'wx'});return p;};
 const pin=sha('original pressure game/parser'),archiveSHA=sha('original pressure archive identity'),resources=[],rows=[],bounds={};
 for(let n=0;n<10663;n++){
  const name='pressure_authored_'+String(n).padStart(5,'0'),hash=collisionNameHash(name),entry='pressure-original.rpf/'+name+'.ybn',active=n<3||neighbor&&n===3||bridge&&n===4;
  resources.push({Hash:hash,Kind:'ybn',Name:name+'.ybn',Path:entry,SourceArchive:'pressure-original.rpf',ResolutionBasis:'CodeWalker.GameFileCache selected dictionary'});
  const box=n===0?{min:[-8,-2,-.1],max:[9,100,5.1]}:n===1?{min:[19.9,-7,-.1],max:[20.1,7,5.1]}:n===2?{min:[-22.1,-7,-.1],max:[-21.9,7,5.1]}:n===3?{min:[57.9,-7,-.1],max:[58.1,7,5.1]}:n===4?{min:[35.9,-7,-.1],max:[36.1,7,5.1]}:{min:[1000+n*2,1000,-1],max:[1001+n*2,1001,1]};
  bounds[hash]=[{NameHash:hash,Layer:'0',CacheFile:'pressure-original.rpf/cache.dat',CacheMetadataSHA256:sha('original pressure bounds '+n),Min:box.min,Max:box.max}];
  const row={Id:name,Hash:hash,EntryPath:entry,Eligibility:'eligible-exterior',Status:'not-imported'};
  if(active){const vertices=[],polygons=[];
   if(n===0){
    wall(vertices,polygons,nearNativeTriangles-duplicateNativeTriangles,{at:0,start:-6,width:12,height:3,columns:30});
    // Independent authored records can describe the same physical support;
    // existing exact surface deduplication, rather than a smaller cap, removes
    // these eight duplicates from the final acoustic window.
    for(let d=0;d<duplicateNativeTriangles;d++)polygons.push({...polygons[d],indices:[...polygons[d].indices]});
    wall(vertices,polygons,6000-nearNativeTriangles,{at:10,start:-7,width:14,height:4,columns:100});
    wall(vertices,polygons,2192,{at:22,start:-7,width:14,height:4,columns:100});
    const sphere=(point,radius)=>{const v=vertices.length;vertices.push(point);polygons.push({family:'Sphere',indices:[v],radius,materialSlot:0});};
    for(const x of [-4,0,4])sphere([x,5.5,1.5],1);
    for(let j=0;j<19;j++)sphere([-6+j*.6,10.5,2],.02);
    for(let j=0;j<6;j++)sphere([-6+j*2.4,23,2],1.3);
    for(let j=0;j<130;j++)sphere([0,80+j*.05,2],.02);
   }else wall(vertices,polygons,n===1?8192:n===2?2099:1800,{axis:'x',at:n===1?20:n===2?-22:n===3?58:36,start:-7,width:14,height:4,columns:100});
   const sourceSHA=sha({vertices,polygons}),raw={schema:1,kind:'CodeWalkerYbnMesh',source:{archive:'pressure-original.rpf',entry,sha256:sourceSHA,coordinateSpace:'resource-root',placement:'unresolved-static-vs-archetype-local'},nodes:[{id:'n0',parent:null,type:'BoundGeometry',transform:identity,center:[0,0,0],vertices,polygons,materials:[{type:7,data1:7,data2:0}]}]},resourceRoot=path.join(root,name);fs.mkdirSync(resourceRoot);
   const normalized=write(name+'/original-input.json',raw),result=exportCollision(normalized,resourceRoot),receiptPath=write(name+'/receipt.json',{Schema:1,Archive:'pressure-original.rpf',Entry:entry,SourceSHA256:sourceSHA,ArchiveUnchanged:true,ArchiveVerification:'sha256-before-after',BeforeSHA256:archiveSHA,AfterSHA256:archiveSHA,ParserSHA256:pin,Result:result});
   row.Status='imported-exterior-incomplete-surfaces';row.Result={IndexPath:result.index,IndexSHA256:result.indexSHA256,ReceiptPath:receiptPath,ReceiptSHA256:sha(fs.readFileSync(receiptPath)),ArchiveSHA256:archiveSHA};row.ArchiveValidation01={EpochUtc:pressureEpoch01,Source:'current-archive-sha256',ArchiveSHA256:archiveSHA};
  }rows.push(row);
 }
 const catalog={Schema:1,Stage:'codewalker-resolved-installation-model',ParserErrorCount:0,InputBinding:{GameExecutableSHA256:pin,CodeWalkerCoreSHA256:pin},SelectedDlc:'original-pressure',Gen9SelectorAvailable:true,ModsFolderResolutionEnabled:false,Resources:resources,CollisionPlacementIndex:{IndexComplete:true,ManifestFilesVisited:1,CacheFilesVisited:1,ProjectionSchemaGaps:0,InteriorBoundsMembershipByHash:{},MapGroupMembershipByHash:{},BoundsStoreItemsByHash:bounds}},catalogPath=write('catalog.json',catalog),catalogSHA256=sha(fs.readFileSync(catalogPath));
 const manifestPath=write('manifest.json',{Schema:1,ResolvedCatalogSHA256:catalogSHA256,InputFingerprint:sha({kind:'entirely-original-cache-pressure01',nearNativeTriangles,duplicateNativeTriangles,neighbor,bridge}),InputBinding:catalog.InputBinding,ValidationEpochUtc01:pressureEpoch01,Resources:rows});
 const descriptor={schema:1,kind:'EntirelyOriginalCachePressure01',root,catalogPath,catalogSHA256,manifestPath,expectedGameSHA256:pin,validationEpochUtc01:pressureEpoch01,resources:10663,nearNativeTriangles,duplicateNativeTriangles,neighbor,bridge,sourceNativeTriangleCounts:[8192,8192,2099],analyticAvailable:158,targetAdaptiveQuerySequence:[3,1,1],targetAnalyticCandidateSequence:[28,22,3],targetRawChunkReadBytesPerWindow:3347352,generatedFromInstalledData:false,historicalGeometryRead:false,retainedEvidenceLimitation:'Native per-query chunk/primitive identities and entry sizes were not recorded; this is an original computational construction, not recovered GTA geometry.'};write('fixture.json',descriptor);return descriptor;
}
export function cachePressurePose01(sequence){const phase=sequence<25?'stable-pressure':sequence<50?'smooth-pressure':sequence<70?'neighbor-crossing':sequence<85?'neighbor-generation':sequence<100?'return-generation':'long-return-pressure',generation=sequence<70?1:sequence<85?2:3;const x=sequence<25?0:sequence<50?(sequence-25)*.015:sequence<70?.375+(sequence-50)*2.1:sequence<85?42.375+(sequence-70)*.015:sequence<100?(sequence-85)*.015:.225+(sequence-100)*.005;return {sequence,phase,generation,listener:[x,-3,1.6],sources:[[x+1,-3,1.3]],velocity:[sequence>=50&&sequence<70?10.5:sequence<25?0:sequence<100?.075:.025,0,0]};}
