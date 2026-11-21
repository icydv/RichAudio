// Entirely original benchmark data. No installed game data or vendor input.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {exportCollision} from '../../src/acoustics/world/convert-collision.mjs';
import {collisionNameHash} from '../../src/acoustics/world/static-world-resource.mjs';
import {identity} from '../../src/acoustics/world/collision-mesh.mjs';
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
export const responsiveEpoch01='2026-11-05T00:00:00.000Z';
export const responsiveResourceCount01=10663;
export function createResponsiveScene01(root,{analytic=false,gameSHA256}={}){
 fs.mkdirSync(root,{recursive:true});
 const write=(name,value)=>{const p=path.join(root,name);fs.writeFileSync(p,JSON.stringify(value));return p;};
 const pin=sha('original responsive game/parser binding'),archiveSHA=sha('original authored archive bytes'),resources=[],rows=[],bounds={};
 for(let n=0;n<responsiveResourceCount01;n++){
  const name='authored_street_'+String(n).padStart(5,'0'),hash=collisionNameHash(name),entry='authored.rpf/'+name+'.ybn',near=n<3,neighbor=n===3;
  const box=near?{min:[-14.1,-14.1,-.1],max:[14.1,analytic?85:1,11.1]}:neighbor?{min:[39,-14,-.1],max:[41,14,10.1]}:{min:[1000+n*2,1000,-1],max:[1001+n*2,1001,1]};
  resources.push({Hash:hash,Kind:'ybn',Name:name+'.ybn',Path:entry,SourceArchive:'authored.rpf',ResolutionBasis:'CodeWalker.GameFileCache selected dictionary'});
  bounds[hash]=[{NameHash:hash,Layer:'0',CacheFile:'authored.rpf/cache.dat',CacheMetadataSHA256:sha('authored bounds metadata'),Min:box.min,Max:box.max}];
  const row={Id:name,Hash:hash,EntryPath:entry,Eligibility:'eligible-exterior',Status:'not-imported'};
  if(near||neighbor){
   const vertices=[],polygons=[],count=neighbor?260:[260,260,261][n];
   for(let t=0;t<count;t++){
    const c=Math.floor(t/2),column=c%13,z=Math.floor(c/13),v=vertices.length;
    const xy=(u,h)=>n===0?[-13+column+u,0,z+h]:n===1?[column+u,0,z+h]:n===2?[14,-13+column+u,z+h]:[40,-13+column+u,z+h];
    const points=t%2===0?[xy(0,0),xy(1,0),xy(1,1)]:[xy(0,0),xy(1,1),xy(0,1)];vertices.push(...points);polygons.push({family:'Triangle',indices:[v,v+1,v+2],materialSlot:0});
   }
   if(analytic&&n<3){
    const v=vertices.length;vertices.push([-8+n*8,-6,2]);polygons.push({family:'Sphere',indices:[v],radius:1,materialSlot:0});
    // Three near spheres and 155 distant spheres exercise the original
    // available/candidate separation; all were authored here from arithmetic.
    for(let j=0;j<(n===0?51:52);j++){const v=vertices.length;vertices.push([n*.05,80+j*.05,2]);polygons.push({family:'Sphere',indices:[v],radius:1,materialSlot:0});}
   }
   const sourceSHA=sha({vertices,polygons}),raw={schema:1,kind:'CodeWalkerYbnMesh',source:{archive:'authored.rpf',entry,sha256:sourceSHA,coordinateSpace:'resource-root',placement:'unresolved-static-vs-archetype-local'},nodes:[{id:'n0',parent:null,type:'BoundGeometry',transform:identity,center:[0,0,0],vertices,polygons,materials:[{type:7,data1:7,data2:0}]}]};
   const resourceRoot=path.join(root,name);fs.mkdirSync(resourceRoot);const rawPath=write(name+'/original-input.json',raw),result=exportCollision(rawPath,resourceRoot),receiptPath=write(name+'/receipt.json',{Schema:1,Archive:'authored.rpf',Entry:entry,SourceSHA256:sourceSHA,ArchiveUnchanged:true,ArchiveVerification:'sha256-before-after',BeforeSHA256:archiveSHA,AfterSHA256:archiveSHA,ParserSHA256:pin,Result:result});
   row.Status='imported-exterior-incomplete-surfaces';row.Result={IndexPath:result.index,IndexSHA256:result.indexSHA256,ReceiptPath:receiptPath,ReceiptSHA256:sha(fs.readFileSync(receiptPath)),ArchiveSHA256:archiveSHA};
   row.ArchiveValidation01={EpochUtc:responsiveEpoch01,Source:'current-archive-sha256',ArchiveSHA256:archiveSHA};
  }
  rows.push(row);
 }
 const catalog={Schema:1,Stage:'codewalker-resolved-installation-model',ParserErrorCount:0,InputBinding:{GameExecutableSHA256:gameSHA256??pin,CodeWalkerCoreSHA256:pin},SelectedDlc:'original',Gen9SelectorAvailable:true,ModsFolderResolutionEnabled:false,Resources:resources,CollisionPlacementIndex:{IndexComplete:true,ManifestFilesVisited:1,CacheFilesVisited:1,ProjectionSchemaGaps:0,InteriorBoundsMembershipByHash:{},MapGroupMembershipByHash:{},BoundsStoreItemsByHash:bounds}},catalogPath=write('catalog.json',catalog),catalogSHA256=sha(fs.readFileSync(catalogPath));
 const manifest={Schema:1,ResolvedCatalogSHA256:catalogSHA256,InputFingerprint:sha({kind:'entirely-original-responsive-scene01',analytic,resources:resources.length,triangles:781}),InputBinding:catalog.InputBinding,ValidationEpochUtc01:responsiveEpoch01,Resources:rows},manifestPath=write('manifest.json',manifest);
 const descriptor={schema:1,kind:'EntirelyOriginalResponsiveScene01',root,catalogPath,catalogSHA256,manifestPath,expectedGameSHA256:catalog.InputBinding.GameExecutableSHA256,validationEpochUtc01:responsiveEpoch01,resources:rows.length,nearbyTriangleSurfaces:781,analytic,generatedFromInstalledData:false,sourceArchiveAccess:false};write('fixture.json',descriptor);return descriptor;
}
export function responsivePose01(sequence){
 // Repeated region, ordinary smooth movement over a selection boundary, then
 // a declared discontinuity/new generation and a warm return to the first area.
 const phase=sequence<20?'near-cold-and-warm':sequence<40?'boundary-movement':sequence<50?'neighbor-generation':'return-generation';
 const x=sequence<20?-1+sequence*.08:sequence<40?.52+(sequence-20)*1.4:sequence<50?36+(sequence-40)*.08:1+(sequence-50)*.08;
 return {sequence,phase,generation:sequence<40?1:sequence<50?2:3,listener:[x,-3,1.6],sources:[[x+1,-3,1.3]],velocity:[sequence>=20&&sequence<40?7:.4,0,0]};
}
