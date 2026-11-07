import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {sha256} from './collision-mesh.mjs';
import {collisionProjection,classifyStaticWorldResource,classifyPotentialCollisionResource01,readPinnedResolvedCatalogue01} from './static-world-resource.mjs';
import {loadCollisionResource} from './collision-resource.mjs';
import {atomicWriteJson01} from './atomic-publication01.mjs';
import {sceneAuthorityView01} from './prepared-world-metadata01.mjs';
import {analyticPrimitiveRevision01} from './analytic-primitives01.mjs';
import {resourcePreparationStates01,geometryQueueCounts01,worldCoverageStates01,readInitialWorldPriority01,orderWorldPreparationQueue01,localWorldPreparationIds01} from './world-state-completion01.mjs';
import {worldGeometryDecoderSHA25601,resourceDependencyFingerprint01,compatibleLegacyStreet01Plan,compatiblePriorDecoderResource01} from './world-cache-identity01.mjs';
const algorithm='installed-exterior-collision-warmup-v1';
const sourceRoot=path.dirname(fileURLToPath(import.meta.url));
const importerSources=['CodeWalkerCollisionAdapter.cs','collision-mesh.mjs','collision-resource.mjs','convert-collision.mjs','placements.mjs','static-world-resource.mjs','world-warmup.mjs','../../../tools/Export-InstalledCollision.ps1','../../../tools/Prepare-InstalledCollisionWorld.ps1'];
let importerSourceIdentity=null;
function importerSourceSHA256(){if(importerSourceIdentity===null)importerSourceIdentity=sha256(Buffer.from(JSON.stringify(importerSources.map(name=>[name,sha256(fs.readFileSync(path.resolve(sourceRoot,name)))]))));return importerSourceIdentity;}
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v);
const norm=v=>v.replaceAll('\\','/').toLowerCase();
function readJson(filename,expected){const info=fs.statSync(filename);if(info.size>67108864)throw Error('warmup input byte limit');const bytes=fs.readFileSync(filename);if(expected&&sha256(bytes)!==expected.toLowerCase())throw Error('warmup input integrity');return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}
const publicationMetrics01={attempts:0,publishedFiles:0,identicalFiles:0,publishedBytes:0,serializedCandidateBytes:0,failedPublications:0,invalidatedCachedResourceRows:0};
function publishJson01(filename,value){publicationMetrics01.attempts++;try{const r=atomicWriteJson01(filename,value);publicationMetrics01.serializedCandidateBytes+=r.bytes;publicationMetrics01[r.published?'publishedFiles':'identicalFiles']++;if(r.published)publicationMetrics01.publishedBytes+=r.bytes;return r;}catch(e){publicationMetrics01.failedPublications++;throw e;}}
function atomic(filename,value){
 if(path.basename(filename)!=='manifest.json'||!Array.isArray(value.Resources))return publishJson01(filename,value);
 return publishWarmupManifest01(filename,value);
}
export function publishWarmupManifest01(filename,value){
 const authority=sceneAuthorityView01(value),authoritySHA256=sha256(Buffer.from(JSON.stringify(authority)));
 // Put the proof-view digest first so the reader can check it against the
 // exact published manifest bytes before materializing the large JSON graph.
 const {SceneAuthoritySHA25601:previousAuthority,...body}=value;
 const published=publishJson01(filename,{SceneAuthoritySHA25601:authoritySHA256,...body});
 publishJson01(path.join(path.dirname(filename),'driver-plan01.json'),{
  Schema:1,ManifestSHA256:published.sha256,ResolvedCatalogSHA256:value.ResolvedCatalogSHA256,InputBinding:value.InputBinding,
  ValidationEpochUtc01:value.ValidationEpochUtc01??null,SceneAuthority01:authority,
  Resources:value.Resources.map(r=>({Id:r.Id,Hash:r.Hash,EntryPath:r.EntryPath,PhysicalArchive:r.PhysicalArchive,
   Eligibility:r.Eligibility,GeometryEligibility:r.GeometryEligibility,Status:r.Status,PotentialStatus:r.PotentialStatus??null,
   AnalyticUpgradeNeeded01:!!(r.Result??r.RejectedResult)&&(r.Result??r.RejectedResult).Classification?.AnalyticBackfillNeeded01!==false&&(r.Result??r.RejectedResult).AnalyticExtensionRevision01!==analyticPrimitiveRevision01,
   ResultArchiveSHA256:(r.Result??r.PotentialResult??r.RejectedResult)?.ArchiveSHA256??null})),
 });
 return published;
}
function relativeEntry(value){if(typeof value!=='string'||value.length>8192||value.includes(':')||value.startsWith('/')||value.startsWith('\\')||value.replaceAll('\\','/').split('/').includes('..'))throw Error('bounded game-relative collision entry');return value.replaceAll('\\','/');}
export function physicalArchive(gameRoot,entry,exists=p=>fs.existsSync(p)&&fs.statSync(p).isFile()){
 const relative=relativeEntry(entry),pieces=relative.split('/');for(let i=0;i<pieces.length;i++)if(/\.rpf$/i.test(pieces[i])){const candidate=pieces.slice(0,i+1).join('/');if(exists(path.join(gameRoot,candidate)))return candidate;}return null;
}
export function resourceEligibility(catalog,resource){
 const p=collisionProjection(catalog,norm(resource.Hash));if(!p||p.ProjectionSchemaGaps!==0)return 'deferred-incomplete-placement-index';
 if(!Array.isArray(p.InteriorBoundsMembership)||!Array.isArray(p.MapGroupMembership)||!Array.isArray(p.BoundsStoreItems)||!Array.isArray(p.SelectedYbn))return 'deferred-placement-schema';
 if(p.InteriorBoundsMembership.length)return 'deferred-interior-local';if(p.MapGroupMembership.length)return 'deferred-conditional-mapgroup';
 if(p.SelectedYbn.length!==1||p.BoundsStoreItems.length!==1)return 'deferred-ambiguous-or-missing-native-bounds';
 const b=p.BoundsStoreItems[0];if(Number(b.Layer)!==0||typeof b.CacheFile!=='string'||!digest(b.CacheMetadataSHA256))return 'deferred-cache-provenance-or-layer';return 'eligible-exterior';
}
export function buildWarmupPlan(catalog,catalogSHA256,{gameRoot,previous,exists,validationEpochUtc01=null}={}){
 if(!digest(catalogSHA256)||catalog?.Schema!==1||catalog.Stage!=='codewalker-resolved-installation-model'||catalog.ParserErrorCount!==0||!Array.isArray(catalog.Resources))throw Error('verified resolved catalogue required');
 const selected=catalog.Resources.filter(r=>r.Kind==='ybn');if(selected.length>262144)throw Error('world resource limit');
 const inputBinding={Algorithm:algorithm,ImporterSourceSHA256:importerSourceSHA256(),GeometryDecoderSHA256:worldGeometryDecoderSHA25601(),GameExecutableSHA256:catalog.InputBinding?.GameExecutableSHA256,CodeWalkerCoreSHA256:catalog.InputBinding?.CodeWalkerCoreSHA256,SelectedDlc:catalog.SelectedDlc,Gen9SelectorAvailable:catalog.Gen9SelectorAvailable,ModsFolderResolutionEnabled:catalog.ModsFolderResolutionEnabled};
 if(!digest(inputBinding.CodeWalkerCoreSHA256)||!digest(inputBinding.GameExecutableSHA256))throw Error('game/parser input binding required');
 const fingerprint=sha256(Buffer.from(canonical({inputBinding,selected:selected.map(r=>({Hash:r.Hash,Path:r.Path})),placements:catalog.CollisionPlacementIndex??catalog.TargetCollisionEvidence}))),legacyCompatible=compatibleLegacyStreet01Plan(previous,catalog),decoderCompatible=previous?.InputBinding?.GeometryDecoderSHA256===worldGeometryDecoderSHA25601(),old=new Map((previous?.Resources??[]).map(r=>[r.Id,r])),ids=new Set();
 const resources=selected.map(r=>{const entry=relativeEntry(r.Path),id=sha256(Buffer.from(norm(entry))).slice(0,24);if(ids.has(id))throw Error('duplicate selected collision entry');ids.add(id);const dependencyFingerprint=resourceDependencyFingerprint01(catalog,r),eligibility=resourceEligibility(catalog,r),archive=physicalArchive(gameRoot,entry,exists),candidate=old.get(id),prior=candidate&&(legacyCompatible||decoderCompatible&&candidate.DependencyFingerprint===dependencyFingerprint||compatiblePriorDecoderResource01(previous,catalog,r,candidate))?candidate:null,status=archive?eligibility:'deferred-source-archive-missing';return {Id:id,Hash:r.Hash,EntryPath:entry,DependencyFingerprint:dependencyFingerprint,PhysicalArchive:archive,Eligibility:status,Status:status==='eligible-exterior'?(prior?.Result?'cache-awaiting-archive-revalidation':prior?.FailureArchiveSHA256?'failure-awaiting-archive-revalidation':'pending-exterior-import'):status,Result:status==='eligible-exterior'?prior?.Result??null:null,RejectedResult:status==='eligible-exterior'?prior?.RejectedResult??null:null,Failure:prior?.Failure??null,FailureArchiveSHA256:prior?.FailureArchiveSHA256??null};});
 const selectedByEntry=new Map(selected.map(r=>[norm(r.Path),r]));
 for(const row of resources){const source=selectedByEntry.get(norm(row.EntryPath)),candidate=old.get(row.Id),compatible=candidate&&(legacyCompatible||decoderCompatible&&candidate.DependencyFingerprint===row.DependencyFingerprint||compatiblePriorDecoderResource01(previous,catalog,source,candidate));row.PreparationStates01=resourcePreparationStates01(catalog,source,row);row.GeometryEligibility=row.PreparationStates01.geometry.eligible?'eligible-resource-root':'deferred-source-provenance';if(row.Eligibility!=='eligible-exterior'&&row.GeometryEligibility==='eligible-resource-root'){row.PotentialResult=compatible?candidate.PotentialResult??null:null;row.PotentialStatus=row.PotentialResult?'cache-awaiting-archive-revalidation':'pending-import';row.PotentialFailureArchiveSHA256=compatible?candidate.PotentialFailureArchiveSHA256??null:null;row.PotentialFailure=compatible?candidate.PotentialFailure??null:null;row.PreparationStates01=resourcePreparationStates01(catalog,source,row);}}
 return {Schema:1,Algorithm:algorithm,InputBinding:inputBinding,InputFingerprint:fingerprint,ResolvedCatalogSHA256:catalogSHA256,ValidationEpochUtc01:validationEpochUtc01,CacheCompatibility:legacyCompatible?'known-STREET01-writer-exact-closure-migration':'per-resource-decoder-and-metadata-dependencies',FullPlacementIndexComplete:catalog.CollisionPlacementIndex?.IndexComplete===true,Scope:'all-selected-ybn-without-radius-cutoff',Resources:resources,InitialPriority01:previous?.InputBinding?.GameExecutableSHA256===inputBinding.GameExecutableSHA256?previous.InitialPriority01??null:null,AcousticWorldComplete:false,RuntimeReplacementImplemented:false,WorldPlacementVerified:false};
}
export function warmupSummary(plan,state){const eligible=plan.Resources.filter(r=>r.Eligibility==='eligible-exterior'),processed=eligible.filter(r=>r.Status==='imported-exterior-incomplete-surfaces');return {Schema:1,State:state??(processed.length===eligible.length&&eligible.length?'selected-exterior-imported-with-explicit-gaps':'partial-with-pending-work'),InputBinding:plan.InputBinding,InputFingerprint:plan.InputFingerprint,ResolvedCatalogSHA256:plan.ResolvedCatalogSHA256,Scope:plan.Scope,ValidationEpochUtc01:plan.ValidationEpochUtc01??null,ValidationEpochComplete01:!!plan.ValidationEpochUtc01&&plan.Resources.every(r=>r.ArchiveValidation01?.EpochUtc===plan.ValidationEpochUtc01),GeometryQueue:geometryQueueCounts01(plan),CoverageStates01:worldCoverageStates01(plan),SelectedYbnCount:plan.Resources.length,EligibleExteriorCount:eligible.length,ProcessedResources:processed.length,PendingResources:eligible.length-processed.length,BlockedResources:plan.Resources.length-eligible.length,FailedResources:eligible.filter(r=>r.Status==='deferred-resource-import-failed').length,UnattemptedResources:eligible.filter(r=>!['imported-exterior-incomplete-surfaces','deferred-resource-import-failed'].includes(r.Status)).length,AllSelectedExteriorAttempted:eligible.length>0&&eligible.every(r=>['imported-exterior-incomplete-surfaces','deferred-resource-import-failed'].includes(r.Status)),CacheRevalidationPending:eligible.filter(r=>r.Status==='cache-awaiting-archive-revalidation').length,AllSelectedExteriorImported:eligible.length>0&&processed.length===eligible.length,AcousticWorldComplete:false,RuntimeReplacementImplemented:false,WorldPlacementVerified:false,GameWrites:false,EndpointOpened:false};}
function refreshPreparationStates01(plan,catalog,affected=null){const byEntry=new Map(catalog.Resources.filter(r=>r.Kind==='ybn').map(r=>[norm(r.Path),r]));for(const row of plan.Resources)if(!affected||affected.has(row.Id))row.PreparationStates01=resourcePreparationStates01(catalog,byEntry.get(norm(row.EntryPath)),row);return plan;}
function checkedPotentialResult01(row,catalog,catalogSHA256){const result=row.PotentialResult,resource=loadCollisionResource(result.IndexPath,{expectedSHA256:result.IndexSHA256}),receipt=readJson(result.ReceiptPath,result.ReceiptSHA256),classification=classifyPotentialCollisionResource01(resource.index,catalog,receipt,{indexSHA256:result.IndexSHA256,catalogSHA256,receiptSHA256:result.ReceiptSHA256});if(classification.state!=='codewalker-potential-resource-model')throw Error('potential source classification failed: '+classification.reason);return {...classification,artifactIntegrity:resource.verifyIntegrity().state};}
function checkedResult(row,catalog,catalogSHA256){
 const result=row.Result,resource=loadCollisionResource(result.IndexPath,{expectedSHA256:result.IndexSHA256}),
  receipt=readJson(result.ReceiptPath,result.ReceiptSHA256),
  classification=classifyStaticWorldResource(resource.index,catalog,receipt,{
   indexSHA256:result.IndexSHA256,catalogSHA256,receiptSHA256:result.ReceiptSHA256,
  });
 if(classification.state!=='codewalker-exterior-static-model')throw Error('resource classification failed: '+classification.reason);
 const integrity=resource.verifyIntegrity();
 return {...classification,artifactIntegrity:integrity.state,integrityBytes:integrity.bytes,
  AnalyticBackfillNeeded01:resource.index.analyticPrimitives01?.revision!==analyticPrimitiveRevision01&&
   ['Sphere','Capsule','Cylinder'].some(f=>resource.index.unsupported?.[f]>0)};
}
export function revalidateArchive(plan,archive,archiveSHA256,catalogPath,catalogSHA256,validationEpochUtc01=null,selectionIds=null){
 if(!digest(archiveSHA256))throw Error('archive digest required');
 const catalog=readPinnedResolvedCatalogue01(catalogPath,catalogSHA256);
 const allowed=new Set(plan.Resources.filter(r=>r.PhysicalArchive===archive).map(r=>r.Id)),selected=selectionIds===null?null:new Set(selectionIds);if(selected&&(!Array.isArray(selectionIds)||selected.size!==selectionIds.length||!selectionIds.length||selectionIds.length>262144||selectionIds.some(id=>typeof id!=='string'||!allowed.has(id))))throw Error('exact archive resource selection required');
 const affected=plan.Resources.filter(r=>r.PhysicalArchive===archive&&(!selected||selected.has(r.Id))),hadCached=new Set(affected.filter(r=>r.Result||r.PotentialResult).map(r=>r.Id));
 for(const row of affected.filter(r=>r.Eligibility==='eligible-exterior')){
  const candidate=row.Result??row.RejectedResult;
  if(!candidate){if(row.FailureArchiveSHA256&&norm(row.FailureArchiveSHA256)===norm(archiveSHA256))row.Status='deferred-resource-import-failed';else{row.Status='pending-exterior-import';row.FailureArchiveSHA256=null;}continue;}
  try{if(norm(candidate.ArchiveSHA256)!==norm(archiveSHA256))throw Error('archive changed');const classification=checkedResult({...row,Result:candidate},catalog,catalogSHA256);row.Result={...candidate,Classification:classification};row.RejectedResult=null;row.Status='imported-exterior-incomplete-surfaces';row.Failure=null;row.FailureArchiveSHA256=null;}
  catch(error){row.Result=null;if(String(error.message).startsWith('resource classification failed:')){row.RejectedResult=candidate;row.Status='deferred-resource-import-failed';row.Failure=String(error.message).slice(0,2048);row.FailureArchiveSHA256=archiveSHA256;}else{row.RejectedResult=null;row.Status='pending-exterior-import';row.FailureArchiveSHA256=null;}}
 }
 for(const row of affected.filter(r=>r.GeometryEligibility==='eligible-resource-root'&&r.Eligibility!=='eligible-exterior')){
  const candidate=row.PotentialResult;
  if(!candidate){row.PotentialStatus=row.PotentialFailureArchiveSHA256===archiveSHA256?'failed-resource-import':'pending-import';continue;}
  try{if(norm(candidate.ArchiveSHA256)!==norm(archiveSHA256))throw Error('archive changed');row.PotentialResult={...candidate,Classification:checkedPotentialResult01(row,catalog,catalogSHA256)};row.PotentialStatus='imported-resource-root-incomplete-surfaces';row.PotentialFailure=null;row.PotentialFailureArchiveSHA256=null;}
  catch(error){row.PotentialResult=null;row.PotentialStatus='pending-import';row.PotentialFailure=String(error.message).slice(0,2048);row.PotentialFailureArchiveSHA256=null;}
 }
 for(const row of affected){if(hadCached.has(row.Id)&&!row.Result&&!row.PotentialResult)publicationMetrics01.invalidatedCachedResourceRows++;delete row.ArchiveValidation01;}
 if(validationEpochUtc01){if(validationEpochUtc01!==plan.ValidationEpochUtc01||!Number.isFinite(Date.parse(validationEpochUtc01)))throw Error('exact validation epoch required');for(const row of affected)row.ArchiveValidation01={EpochUtc:validationEpochUtc01,ArchiveSHA256:archiveSHA256,ValidatedUtc:new Date().toISOString(),Source:'current-archive-sha256'};}
 return refreshPreparationStates01(plan,catalog,new Set(affected.map(r=>r.Id)));
}
export function requalifyDerivedArtifacts01(plan,catalogPath,catalogSHA256){
 const archives=new Map();for(const row of plan.Resources){const result=row.Result??row.RejectedResult??row.PotentialResult;if(!result)continue;const prior=archives.get(row.PhysicalArchive);if(prior&&prior!==result.ArchiveSHA256)throw Error('inconsistent retained archive-content receipts');archives.set(row.PhysicalArchive,result.ArchiveSHA256);}
 for(const [archive,hash]of archives)revalidateArchive(plan,archive,hash,catalogPath,catalogSHA256);return plan;
}
export function acceptBatch(plan,batch,catalogPath,catalogSHA256){
 if(batch?.Schema!==1||batch.ArchiveUnchanged!==true||!Array.isArray(batch.Resources))throw Error('qualified archive batch required');
 const catalog=readPinnedResolvedCatalogue01(catalogPath,catalogSHA256),byEntry=new Map(plan.Resources.map(r=>[norm(r.EntryPath),r]));
 for(const item of batch.Resources){
  const row=byEntry.get(norm(item.Entry));if(!row||(row.Eligibility!=='eligible-exterior'&&row.GeometryEligibility!=='eligible-resource-root'))throw Error('batch entry outside eligible plan');
  const receipt=readJson(item.ReceiptPath),indexPath=receipt.Result?.index,indexSHA256=receipt.Result?.indexSHA256;if(!digest(indexSHA256))throw Error('batch index digest missing');
  const result={IndexPath:indexPath,IndexSHA256:indexSHA256,ReceiptPath:item.ReceiptPath,ReceiptSHA256:sha256(fs.readFileSync(item.ReceiptPath)),ArchiveSHA256:receipt.AfterSHA256,Counts:receipt.Result.counts,Unsupported:receipt.Result.unsupported};
  if(row.Eligibility!=='eligible-exterior'){
   row.PotentialResult=result;try{row.PotentialResult.Classification=checkedPotentialResult01(row,catalog,catalogSHA256);row.PotentialStatus='imported-resource-root-incomplete-surfaces';row.PotentialFailure=null;row.PotentialFailureArchiveSHA256=null;}
   catch(error){row.PotentialResult=null;row.PotentialStatus='failed-resource-import';row.PotentialFailure=String(error.message).slice(0,2048);row.PotentialFailureArchiveSHA256=batch.AfterSHA256;}continue;
  }
  row.Result=result;try{row.Result.Classification=checkedResult(row,catalog,catalogSHA256);row.Status='imported-exterior-incomplete-surfaces';row.Failure=null;row.FailureArchiveSHA256=null;}
  catch(error){row.RejectedResult=row.Result;row.Result=null;row.Status='deferred-resource-import-failed';row.Failure=String(error.message).slice(0,2048);row.FailureArchiveSHA256=batch.AfterSHA256;}
 }
 for(const failure of batch.Failures??[]){const row=byEntry.get(norm(failure.Entry));if(!row||(row.Eligibility!=='eligible-exterior'&&row.GeometryEligibility!=='eligible-resource-root'))throw Error('failed batch entry outside eligible plan');if(row.Eligibility==='eligible-exterior'){row.Result=null;row.Status='deferred-resource-import-failed';row.Failure=String(failure.Error).slice(0,2048);row.FailureArchiveSHA256=batch.AfterSHA256;}else{row.PotentialResult=null;row.PotentialStatus='failed-resource-import';row.PotentialFailure=String(failure.Error).slice(0,2048);row.PotentialFailureArchiveSHA256=batch.AfterSHA256;}}
 for(const item of [...batch.Resources,...(batch.Failures??[])])delete byEntry.get(norm(item.Entry)).ArchiveValidation01;
 return refreshPreparationStates01(plan,catalog,new Set([...batch.Resources,...(batch.Failures??[])].map(r=>byEntry.get(norm(r.Entry)).Id)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 process.on('exit',()=>{try{fs.writeSync(1,JSON.stringify({type:'world-metadata-publication01',...publicationMetrics01})+'\n');}catch{}});
 const [mode,...args]=process.argv.slice(2);if(mode==='plan'){const [catalogPath,catalogSHA256,output,gameRoot,validationEpochUtc01=null]=args,catalog=readJson(catalogPath,catalogSHA256),manifest=path.join(output,'manifest.json');let previous;try{previous=readJson(manifest);}catch{}const plan=buildWarmupPlan(catalog,catalogSHA256,{gameRoot,previous,validationEpochUtc01});atomic(manifest,plan);atomic(path.join(output,'summary.json'),warmupSummary(plan,'planned-no-geometry-export'));}
 else if(mode==='revalidate'){const [manifest,archive,archiveSHA256,catalogPath,catalogSHA256,validationEpochUtc01=null,selectionPath=null]=args,plan=revalidateArchive(readJson(manifest),archive,archiveSHA256,catalogPath,catalogSHA256,validationEpochUtc01==='-'?null:validationEpochUtc01||null,selectionPath?readJson(selectionPath):null);atomic(manifest,plan);atomic(path.join(path.dirname(manifest),'summary.json'),warmupSummary(plan));}
 else if(mode==='accept'){const [manifest,batchPath,catalogPath,catalogSHA256]=args,plan=acceptBatch(readJson(manifest),readJson(batchPath),catalogPath,catalogSHA256);atomic(manifest,plan);atomic(path.join(path.dirname(manifest),'summary.json'),warmupSummary(plan));}
 else if(mode==='upgrade-analytic'){
  const [manifest,allowedRoot,catalogPath,catalogSHA256,maximumMilliseconds='900000',archive=null,archiveHash=null,selectionPath=null]=args,{backfillAnalyticManifest01}=await import('./analytic-backfill01.mjs'),initial=readJson(manifest),base=initial.BaseInputFingerprint01??initial.InputFingerprint,selection=selectionPath?readJson(selectionPath):null;
  if(selection&&(!Array.isArray(selection)||!selection.length||selection.length>262144||new Set(selection).size!==selection.length||selection.some(id=>!initial.Resources.some(r=>r.Id===id&&r.PhysicalArchive===archive))))throw Error('exact archive resource selection required');
  const subset=archive?{...initial,Resources:initial.Resources.filter(r=>r.PhysicalArchive===archive&&(!selection||selection.includes(r.Id)))}:initial;
  let lastProgress=-Infinity;const merge=part=>{if(!archive)return part;const rows=new Map(part.Resources.map(r=>[r.Id,r]));const whole={...initial,Resources:initial.Resources.map(r=>rows.get(r.Id)??r),BaseInputFingerprint01:base,AnalyticUpgrade01:part.AnalyticUpgrade01};whole.InputFingerprint=sha256(Buffer.from(JSON.stringify([base,part.AnalyticUpgrade01.revision,whole.Resources.map(r=>[r.Id,(r.Result??r.RejectedResult)?.IndexSHA256??null])])));return whole;};
  const progress=({manifest:part,summary},force=false)=>{if(!force&&performance.now()-lastProgress<1000)return;lastProgress=performance.now();const stamped={...part,AnalyticUpgrade01:{...summary,actualWorldComplete:false}};const plan=merge(stamped);atomic(manifest,plan);atomic(path.join(path.dirname(manifest),'summary.json'),warmupSummary(plan,'upgrading-retained-analytic-geometry'));};
  const upgraded=await backfillAnalyticManifest01({manifest:subset,allowedRoot,maximumMilliseconds:Number(maximumMilliseconds),maximumNewBytes:536870912,onProgress:progress}),plan=merge(upgraded.manifest);
  if(archive){revalidateArchive(plan,archive,archiveHash,catalogPath,catalogSHA256,null,selection);}else requalifyDerivedArtifacts01(plan,catalogPath,catalogSHA256);
  atomic(manifest,plan);atomic(path.join(path.dirname(manifest),'summary.json'),warmupSummary(plan));
 }
 else if(mode==='catalog-header'){const [catalogPath,catalogSHA256,output]=args,c=readJson(catalogPath,catalogSHA256);atomic(output,{Schema:c.Schema,Stage:c.Stage,InputBinding:c.InputBinding,ReferenceCoverage:c.ReferenceCoverage??null,SourceArchiveRefreshId:c.SourceArchiveRefreshId??'',Vehicles:(c.Vehicles??[]).map(v=>({Model:v.Model,VehicleAudioRecord:v.VehicleAudioRecord?{present:true}:null,GranularRecord:v.GranularRecord?{present:true}:null,Sounds:Object.fromEntries(Object.entries(v.Sounds??{}).map(([k,s])=>[k,s?{Hash:s.Hash,ChannelLinks:s.ChannelLinks??[]}:null]))}))});}
 else if(mode==='queue'){
  const [manifest,priorityFile,notBeforeUtc,retainedPosePath=null]=args,plan=readJson(manifest),before=JSON.stringify([plan.InitialPriority01??null,plan.PriorityState01??null]);let priority;
  if(retainedPosePath){const binding=readJson(retainedPosePath),poseFile=path.resolve(binding.PoseFile??''),privatePrefix=path.resolve(sourceRoot,'../../../.local')+path.sep;if(binding.Schema!==1||binding.Kind!=='RichAudioRetainedReadinessPose01'||binding.GameExecutableSHA256!==plan.InputBinding.GameExecutableSHA256||!poseFile.startsWith(privatePrefix)||!digest(binding.PoseSHA256))throw Error('bound retained offline qualification pose required');const pose=readJson(poseFile,binding.PoseSHA256),valid=p=>Array.isArray(p)&&p.length===3&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000);if(!valid(pose.listener)||!valid(pose.source)||!Number.isFinite(Date.parse(notBeforeUtc)))throw Error('bounded retained offline pose');priority={priority:{listener:pose.listener,sources:[pose.source],GameExecutableSHA256:binding.GameExecutableSHA256,origin:'retained-offline-qualification-pose',receivedUtc:notBeforeUtc,activationAuthority:false,poseSHA256:binding.PoseSHA256},state:'retained-offline-qualification-pose'};}
  else priority=readInitialWorldPriority01(priorityFile,{gameSHA256:plan.InputBinding.GameExecutableSHA256,notBeforeUtc,previous:plan.InitialPriority01});plan.InitialPriority01=priority.priority;plan.PriorityState01={state:priority.state,reason:priority.reason??null,activationAuthority:false};if(before!==JSON.stringify([plan.InitialPriority01,plan.PriorityState01]))atomic(manifest,plan);const localIds=new Set(localWorldPreparationIds01(plan));atomic(path.join(path.dirname(manifest),'queue.json'),{Schema:1,PriorityState01:plan.PriorityState01,Resources:orderWorldPreparationQueue01(plan).map(r=>({Id:r.Id,PhysicalArchive:r.PhysicalArchive,EntryPath:r.EntryPath,LocalReadinessPriority01:localIds.has(r.Id)}))});
 }
 else if(mode==='summarize'){const [manifest,state]=args,plan=readJson(manifest);atomic(path.join(path.dirname(manifest),'summary.json'),warmupSummary(plan,state));}
 else throw Error('warmup mode: plan|revalidate|accept|upgrade-analytic|summarize');
}
