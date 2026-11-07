import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {originalInstalledCache01} from './fixtures/InstalledStaticCache01.mjs';
import {buildWarmupPlan,acceptBatch,revalidateArchive,warmupSummary} from '../src/acoustics/world/world-warmup.mjs';
import {readInitialWorldPriority01,orderWorldPreparationQueue01} from '../src/acoustics/world/world-state-completion01.mjs';
import {InstalledStaticWorld01} from '../src/acoustics/world/installed-static-scene01.mjs';
import {sha256} from '../src/acoustics/world/collision-mesh.mjs';
import {identity} from '../src/acoustics/world/collision-mesh.mjs';
import {collisionNameHash} from '../src/acoustics/world/static-world-resource.mjs';
const pin='a'.repeat(64),options={gameRoot:'original-no-archive',exists:()=>true};

test('conditional/layer geometry is cacheable while placement and activation remain separate and withheld',()=>{
 const f=originalInstalledCache01();try{
  const catalog=JSON.parse(fs.readFileSync(f.catalogPath,'utf8')),hash=catalog.Resources[0].Hash;
  catalog.CollisionPlacementIndex.MapGroupMembershipByHash[hash]=[{Manifest:'a.rpf/manifest.ymf',DataGroupName:'original-night',HoursOnOff:'255',WeatherTypes:['original-weather']}];
  catalog.CollisionPlacementIndex.BoundsStoreItemsByHash[hash][0].Layer='1';fs.writeFileSync(f.catalogPath,JSON.stringify(catalog));const catalogSHA256=sha256(fs.readFileSync(f.catalogPath)),plan=buildWarmupPlan(catalog,catalogSHA256,options),row=plan.Resources[0];
  assert.equal(row.Eligibility,'deferred-conditional-mapgroup');assert.equal(row.GeometryEligibility,'eligible-resource-root');assert.equal(row.PotentialStatus,'pending-import');
  acceptBatch(plan,{Schema:1,ArchiveUnchanged:true,AfterSHA256:pin,Resources:[{Entry:row.EntryPath,ReceiptPath:f.manifest.Resources[0].Result.ReceiptPath}]},f.catalogPath,catalogSHA256);
  assert.equal(row.PotentialStatus,'imported-resource-root-incomplete-surfaces');assert.equal(row.Result,null);assert.equal(row.PotentialResult.Classification.liveSceneInclusionAllowed,false);assert.equal(row.PreparationStates01.geometry.state,'qualified-partial');assert.equal(row.PreparationStates01.activation.runtimeVerified,false);assert.equal(row.PreparationStates01.activation.conditions.length,1);
  const summary=warmupSummary(plan);assert.equal(summary.GeometryQueue.prepared,1);assert.equal(summary.ProcessedResources,0);assert.equal(summary.BlockedResources,1);assert.equal(summary.CoverageStates01.activation.unobserved,1);
  fs.writeFileSync(f.manifestPath,JSON.stringify(plan));const world=new InstalledStaticWorld01({manifestPath:f.manifestPath,catalogPath:f.catalogPath,catalogSHA256});assert.equal(world.status().preparation.completedEligibleTiles,0);world.close();
  revalidateArchive(plan,'a.rpf','b'.repeat(64),f.catalogPath,catalogSHA256);assert.equal(row.PotentialResult,null);assert.equal(row.PotentialStatus,'pending-import');
 }finally{f.close();}
});

test('potential failures are retained per source and archive; decoder cache never invents interior instances',()=>{
 const f=originalInstalledCache01();try{
  const catalog=JSON.parse(fs.readFileSync(f.catalogPath,'utf8')),hash=catalog.Resources[0].Hash;catalog.CollisionPlacementIndex.InteriorBoundsMembershipByHash[hash]=[{InteriorName:'original_inside',BoundsHash:hash,Manifest:'a.rpf/original.ymf'}];fs.writeFileSync(f.catalogPath,JSON.stringify(catalog));const cp=sha256(fs.readFileSync(f.catalogPath)),plan=buildWarmupPlan(catalog,cp,options),row=plan.Resources[0];
  acceptBatch(plan,{Schema:1,ArchiveUnchanged:true,AfterSHA256:pin,Resources:[],Failures:[{Entry:row.EntryPath,Error:'original unsupported resource'}]},f.catalogPath,cp);assert.equal(row.PotentialStatus,'failed-resource-import');
  revalidateArchive(plan,'a.rpf',pin,f.catalogPath,cp);assert.equal(row.PotentialStatus,'failed-resource-import','same-source failures are not retried');assert.equal(row.PreparationStates01.placement.state,'interior-local-unplaced');assert.equal(warmupSummary(plan).GeometryQueue.failed,1);
  revalidateArchive(plan,'a.rpf','b'.repeat(64),f.catalogPath,cp);assert.equal(row.PotentialStatus,'pending-import');assert.equal(warmupSummary(plan).GeometryQueue.unattempted,1);
 }finally{f.close();}
});

test('first genuine observation prioritises a complete deterministic queue and new sessions can replace it',()=>{
 const f=originalInstalledCache01();try{
  const file=path.join(f.root,'initial-observation01.json'),epoch='2026-11-05T00:00:00.000Z',now='2026-11-05T00:00:10.000Z';
  const observation={Schema:1,Kind:'RichAudioInitialWorldObservation01',GameExecutableSHA256:pin,session:'1'.repeat(32),sequence:0,generation:1,geometryTimeMs:12,sourceAgeMs:20,listener:[100,0,0],sources:[[101,0,0]],origin:'normal-gameplay-observation',receivedUtc:now};fs.writeFileSync(file,JSON.stringify(observation));
  const accepted=readInitialWorldPriority01(file,{gameSHA256:pin,notBeforeUtc:epoch,nowUtc:now});assert.equal(accepted.state,'accepted-initial-observation');assert.equal(accepted.priority.sequence,0,'retain the actual first normal source sequence without renumbering');assert.equal(accepted.priority.activationAuthority,false);
  const rows=[{Id:'far',EntryPath:'z',PhysicalArchive:'a.rpf',GeometryEligibility:'eligible-resource-root',PreparationStates01:{placement:{nativeBounds:{min:[0,0,0],max:[1,1,1]}}}},{Id:'near',EntryPath:'a',PhysicalArchive:'b.rpf',GeometryEligibility:'eligible-resource-root',PreparationStates01:{placement:{nativeBounds:{min:[99,0,0],max:[101,1,1]}}}}];
  assert.deepEqual(orderWorldPreparationQueue01({Resources:rows}).map(r=>r.Id),['far','near']);assert.deepEqual(orderWorldPreparationQueue01({Resources:rows,InitialPriority01:accepted.priority}).map(r=>r.Id),['near','far']);
  observation.listener=[0,0,0];observation.sequence++;fs.writeFileSync(file,JSON.stringify(observation));assert.deepEqual(readInitialWorldPriority01(file,{gameSHA256:pin,notBeforeUtc:epoch,nowUtc:now,previous:accepted.priority}).priority.listener,[100,0,0]);
  observation.session='2'.repeat(32);observation.receivedUtc='2026-11-05T00:00:11.000Z';fs.writeFileSync(file,JSON.stringify(observation));assert.equal(readInitialWorldPriority01(file,{gameSHA256:pin,notBeforeUtc:epoch,nowUtc:observation.receivedUtc,previous:accepted.priority}).priority.session,observation.session);
 }finally{f.close();}
});

test('stale, future, aged, malformed and source-mismatched priority files cannot acquire authority or block fallback',()=>{
 const f=originalInstalledCache01();try{
  const file=path.join(f.root,'priority.json'),base={Schema:1,Kind:'RichAudioInitialWorldObservation01',GameExecutableSHA256:pin,session:'1'.repeat(32),sequence:1,generation:1,geometryTimeMs:0,sourceAgeMs:0,listener:[0,0,0],sources:[],origin:'normal-gameplay-observation',receivedUtc:'2026-11-05T00:00:10Z'},config={gameSHA256:pin,notBeforeUtc:'2026-11-05T00:00:05Z',nowUtc:'2026-11-05T00:00:10Z'};
  for(const patch of [{sequence:-1},{receivedUtc:'2026-11-04T00:00:00Z'},{receivedUtc:'2026-11-05T00:00:11Z'},{sourceAgeMs:501},{listener:[NaN,0,0]},{GameExecutableSHA256:'b'.repeat(64)},{origin:'cache-derived-position'},{unexpected:true}]){fs.writeFileSync(file,JSON.stringify({...base,...patch}));assert.equal(readInitialWorldPriority01(file,config).priority,null);}
  fs.writeFileSync(file,'{incomplete');assert.equal(readInitialWorldPriority01(file,config).state,'deterministic-fallback-invalid-observation');fs.unlinkSync(file);assert.equal(readInitialWorldPriority01(file,config).state,'deterministic-fallback-no-observation');assert.equal(readInitialWorldPriority01(file,{...config,previous:{...base,activationAuthority:false,receivedUtc:'2026-11-04T00:00:00Z'}}).priority,null,'missing new-session input cannot revive an earlier startup pose');
 }finally{f.close();}
});
test('interior local bounds never become a phantom world-origin gap; resolved instances remain unknown at their world placement',()=>{
 const f=originalInstalledCache01();try{
  const c=JSON.parse(fs.readFileSync(f.catalogPath,'utf8')),h=c.Resources[0].Hash,a=collisionNameHash('original_interior');c.CollisionPlacementIndex.InteriorBoundsMembershipByHash[h]=[{InteriorName:'original_interior',BoundsHash:h}];c.Resources.push({Kind:'ytyp',Path:'a.rpf/original.ytyp'},{Kind:'ymap',Path:'a.rpf/original.ymap'});c.InteriorPlacementMetadata01={Schema:1,Kind:'RichAudioInstalledMloPlacementMetadata01',YtypSourceBindings:[{Path:'a.rpf/original.ytyp',SHA256:pin}],YmapSourceBindings:[{Path:'a.rpf/original.ymap',SHA256:pin}],Archetypes:[{ArchetypeHash:a,PhysicsDictionaryHash:h,SourceYtyp:'a.rpf/original.ytyp',SourceSHA256:pin,LocalMin:[-4,-4,-4],LocalMax:[4,4,4],Rooms:[],Portals:[]}],Instances:[{ArchetypeHash:a,InstanceId:'original-instance',SourceYmap:'a.rpf/original.ymap',SourceSHA256:pin,Matrix:identity.map((v,i)=>i===12?100:i===13?200:v)}]};fs.writeFileSync(f.catalogPath,JSON.stringify(c));const cp=sha256(fs.readFileSync(f.catalogPath)),plan=buildWarmupPlan(c,cp,options);fs.writeFileSync(f.manifestPath,JSON.stringify(plan));const world=new InstalledStaticWorld01({manifestPath:f.manifestPath,catalogPath:f.catalogPath,catalogSHA256:cp}),window=listener=>world.window({listener,sources:[],session:'a'.repeat(32),generation:1,geometryTimeMs:0,durationMs:1000,radius:2});
  assert.equal(window([0,0,0]).tile.missingRegions.length,0);assert(window([100,200,0]).tile.missingRegions.length>0);const edge=world.window({listener:[106,200,0],sources:[],session:'a'.repeat(32),generation:2,geometryTimeMs:0,durationMs:1000,radius:4});assert.equal(edge.tile.missingRegions[0].bounds.max[0],104,'retain exact placed unknown volume instead of replacing the complete window');assert.equal(world.status().preparation.completedEligibleTiles,0);assert.equal(world.status().installedWorldVerified,false);world.close();
 }finally{f.close();}
});
test('normal factory requires exact current epoch, current archive source and matching SHA while explicit offline readers remain conditional',()=>{
 const f=originalInstalledCache01();try{const epoch='2026-11-05T00:00:00.0000000Z',config={manifestPath:f.manifestPath,catalogPath:f.catalogPath,catalogSHA256:f.catalogSHA256,requiredValidationEpochUtc01:epoch},world=new InstalledStaticWorld01(config);assert.equal(world.status().preparation.completedEligibleTiles,0);f.manifest.ValidationEpochUtc01=epoch;f.manifest.Resources[0].ArchiveValidation01={EpochUtc:epoch,ArchiveSHA256:pin,ValidatedUtc:epoch,Source:'retained-receipt-only'};fs.writeFileSync(f.manifestPath,JSON.stringify(f.manifest));world.reload();assert.equal(world.status().preparation.completedEligibleTiles,0);f.manifest.Resources[0].ArchiveValidation01.Source='current-archive-sha256';f.manifest.Resources[0].ArchiveValidation01.ArchiveSHA256='b'.repeat(64);fs.writeFileSync(f.manifestPath,JSON.stringify(f.manifest));world.reload();assert.equal(world.status().preparation.completedEligibleTiles,0);f.manifest.Resources[0].ArchiveValidation01.ArchiveSHA256=pin;fs.writeFileSync(f.manifestPath,JSON.stringify(f.manifest));world.reload();assert.equal(world.status().preparation.completedEligibleTiles,1);assert.equal(world.status().installedWorldVerified,false);world.close();}finally{f.close();}
});
