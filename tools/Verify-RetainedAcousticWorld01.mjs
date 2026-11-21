import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadCollisionResource} from '../src/acoustics/world/collision-resource.mjs';
import {revalidateArchive} from '../src/acoustics/world/world-warmup.mjs';
import {worldCoverageStates01} from '../src/acoustics/world/world-state-completion01.mjs';

const [manifestPath,catalogPath,scopePath,outputDir]=process.argv.slice(2);
if(process.argv.length!==6)throw Error('Supply the private retained manifest, catalogue, source scope and a new private output directory');
const privateRoot=path.resolve(import.meta.dirname,'../.local');
const contained=file=>path.resolve(file).toLowerCase().startsWith(privateRoot.toLowerCase()+path.sep);
function safe(file){
 const full=path.resolve(file);
 if(!contained(full)||fs.realpathSync.native(full).toLowerCase()!==full.toLowerCase())throw Error('Unlinked retained input under the private checkout required');
 return full;
}
function pinnedJson(file,cap,pin){
 const full=safe(file), stat=fs.lstatSync(full);
 if(!stat.isFile()||stat.size<=0||stat.size>cap)throw Error('Bounded retained input required');
 const bytes=fs.readFileSync(full);
 if(bytes.length!==stat.size||pin&&createHash('sha256').update(bytes).digest('hex')!==pin)throw Error('Retained input digest differs');
 return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
}
const out=path.resolve(outputDir);
safe(path.dirname(out));
if(!contained(out))throw Error('Private output required');
const scope=pinnedJson(scopePath,65536);
if(scope.kind!=='RichAudioRetainedWorldSourceScope01'||scope.currentProofIssued!==false)throw Error('Retained scope required');
const world=pinnedJson(manifestPath,64*1024*1024,scope.manifestSHA256);
pinnedJson(catalogPath,64*1024*1024,scope.catalogueSHA256);
if(world.ResolvedCatalogSHA256!==scope.catalogueSHA256||world.Resources.length!==scope.coverage.denominator||
 new Set(world.Resources.map(r=>r.Id)).size!==world.Resources.length)throw Error('Retained catalogue identity differs');
const groups=new Map(scope.archives.filter(a=>a.collision>0).map(a=>[a.relative,{archive:a,rows:[]}]));
for(const row of world.Resources){
 const group=groups.get(row.PhysicalArchive), prior=row.Result??row.PotentialResult??row.RejectedResult;
 if(!group||prior&&prior.ArchiveSHA256!==group.archive.retainedCollisionSHA256)throw Error('Retained source outside scoped collision identity');
 group.rows.push(row);
 delete row.ArchiveValidation01;
}
delete world.ValidationEpochUtc01;
for(const {archive,rows} of groups.values())if(rows.length!==archive.collision)throw Error('Retained collision population differs');
fs.mkdirSync(out);
const census=[];
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
for(const {archive,rows} of groups.values()){
 const errors=new Map();
 for(const row of rows){
  const r=row.Result??row.PotentialResult??row.RejectedResult;
  if(!r)continue;
  try{safe(r.IndexPath);safe(r.ReceiptPath);}catch(error){errors.set(row.Id,error.message);}
 }
 const selected=rows.filter(r=>!errors.has(r.Id)).map(r=>r.Id);
 if(selected.length)revalidateArchive(world,archive.relative,archive.retainedCollisionSHA256,path.resolve(catalogPath),scope.catalogueSHA256,null,selected);
 const records=rows.map(row=>{
  const r=row.Result??row.PotentialResult, c=r?.Classification, placement=row.PreparationStates01?.placement;
  const artifactVerified=!errors.has(row.Id)&&c?.artifactIntegrity==='all-chunk-bytes-sha256-verified';
  const prep=row.PreparationStates01,source=c?.PlacementQualification01??c;
  const index=artifactVerified?loadCollisionResource(safe(r.IndexPath),{expectedSHA256:r.IndexSHA256}).index:null;
  const primitives=index?.analyticPrimitives01?.primitives??[];
  const represented=new Set(primitives.map(p=>[p.node,p.polygon,p.sourceFamily].join(':')));
  const unknownRegions=index?.unknownRegions??[];
  return {
   id:row.Id,archive:archive.relative,entry:row.EntryPath,artifactVerified,currentSourceVerified:false,
   geometry:artifactVerified?prep.geometry.state:prep?.geometry?.state==='failed'?'failed':'pending-revalidation',
   placement:placement?.state??'unknown',
   placementVerifiedOffline:artifactVerified&&(source?.offlineCoordinateFrameVerified===true||placement?.state==='metadata-interior-instances-resolved'),
   layer:prep?.activation.layer??null,conditional:!!prep?.activation.conditions.length,interior:!!prep?.activation.interiorActivationRequired,
   runtimeActivationVerified:false,acousticResourceComplete:false,finiteTriangles:index?.counts.triangles??0,
   analyticPrimitives:primitives.length,unknownRegionDescriptors:unknownRegions.length,
   unknownWithoutAnalyticRecord:unknownRegions.filter(region=>!represented.has(region.compactAnalyticPrimitive01)).length,
   unsupportedRawFamilies:index?.unsupported??{},error:errors.get(row.Id)??row.Failure??row.PotentialFailure??null
  };
 });
 census.push(...records);
 write('checkpoint-'+String(census.length).padStart(5,'0')+'.json',{archive:archive.relative,records});
 console.log(JSON.stringify({archive:archive.relative,processed:census.length,verified:records.filter(r=>r.artifactVerified).length}));
}
const countsBy=key=>Object.groupBy(census,row=>row[key]);
const counts=key=>Object.fromEntries(Object.entries(countsBy(key)).map(([value,rows])=>[value,rows.length]));
const verified=census.filter(r=>r.artifactVerified);
write('census.json',census);
write('summary.json',{
 authority:'retained artifacts independently verified against retained digests',
 selected:census.length,archiveGroups:groups.size,derivedVerified:verified.length,currentSourceVerified:0,
 placement:counts('placement'),placementQualifiedOffline:census.filter(r=>r.placementVerifiedOffline).length,
 geometry:counts('geometry'),layers:counts('layer'),runtimeActivationVerified:0,
 conditional:census.filter(r=>r.conditional).length,interior:census.filter(r=>r.interior).length,
 knownFiniteTriangles:verified.reduce((n,r)=>n+r.finiteTriangles,0),knownAnalyticPrimitives:verified.reduce((n,r)=>n+r.analyticPrimitives,0),
 resourcesWithRawUnsupportedFamilies:verified.filter(r=>Object.keys(r.unsupportedRawFamilies).length>0).length,
 resourcesWithRetainedUnknownDescriptors:verified.filter(r=>r.unknownRegionDescriptors>0).length,
 resourcesWithUnknownWithoutAnalyticRecord:verified.filter(r=>r.unknownWithoutAnalyticRecord>0).length,
 noVerifiedFiniteOrAnalyticSupport:verified.filter(r=>r.finiteTriangles===0&&r.analyticPrimitives===0).length,
 AcousticWorldComplete:false,archiveReads:0,decoderRuns:0,coverage:worldCoverageStates01(world)
});
