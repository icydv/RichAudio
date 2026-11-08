// Plans and compares a requalification using private receipts only.
// This module never opens installation paths or publishes runtime proof.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {collisionNameHash,collisionProjection} from '../src/acoustics/world/static-world-resource.mjs';
import {resolveInteriorCollisionPlacements01} from '../src/acoustics/world/interior-placements-completion01.mjs';

const normalize=value=>value.replaceAll('\\','/').toLowerCase();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const setupPack=member=>member?.match(/(?:dlcpacks|dlc_patch)\/([^/]+)/)?.[1]??null;
const counts=(rows,key)=>Object.fromEntries(Object.entries(Object.groupBy(rows,key)).map(([k,v])=>[k,v.length]));
const nestedTable=member=>{
 const index=member.lastIndexOf('.rpf/');
 return index<0?'':member.slice(0,index+4);
};
const exactKey=(kind,hash)=>kind+':'+hash.toLowerCase();

// Only independently established mount precedence may select a winner.
// An unread equal/higher-ranked candidate continues to block that identity.
export function effectiveMapSelection01(candidates){
 if(!candidates.length||candidates.some(c=>!Number.isSafeInteger(c.rank)))return {state:'effective-precedence-unresolved'};
 const highest=Math.max(...candidates.map(c=>c.rank)),top=candidates.filter(c=>c.rank===highest);
 if(top.length!==1)return {state:'ambiguous-effective-override',paths:top.map(c=>c.path).sort()};
 return top[0].state==='verified'?{state:'effective-verified',path:top[0].path}:{state:'winning-source-unverified',path:top[0].path};
}

export function buildMapRequalification01({scope,plan,catalog,census,previous,requalified=[]}){
 const tables=new Set(previous.filter(r=>r.kind==='table').map(r=>r.path));
 const blocked=new Map(previous.filter(r=>r.kind==='blocked').map(r=>[r.path,r]));
 const newRows=new Map(requalified.filter(r=>['metadata','selected-ybn-entry','configuration','blocked'].includes(r.kind)).map(r=>[r.path,r]));
 const seen=new Map(previous.filter(r=>['metadata','selected-ybn-entry','configuration'].includes(r.kind)).map(r=>[r.path,r]));
 const orderRows=[...previous,...requalified].filter(r=>r.kind==='configuration'&&r.path.endsWith('/setup2.xml'));
 const exactSetups=new Map(orderRows.map(r=>[setupPack(r.path),r]));
 const patchTargets=new Map();
 for(const {Original,Replacement} of catalog.PatchedPaths??[]){
  const key=normalize(Original),target=normalize(Replacement);
  if(!patchTargets.has(key))patchTargets.set(key,new Set());
  patchTargets.get(key).add(target);
 }
 // CodeWalker's YBN and YMAP dictionaries assign by short-name hash in
 // ActiveMapRpfFiles enumeration order. The pinned catalogue preserves that
 // order. YTYP uses a different global parsed-archetype dictionary.
 const retainedMountOrder=new Map((catalog.ActiveMapArchives??[]).map(({Archive},index)=>[normalize(Archive),index]));
 const listed=previous.find(r=>r.kind==='configuration'&&r.path.endsWith('/dlclist.xml')&&r.sha256===catalog.DlcListSHA256);
 const groups=new Map();
 const unplanned=new Map();
 for(const row of requalified.filter(r=>r.kind==='unplanned-map-member'&&/^0x[0-9a-f]{8}$/.test(r.shortNameHash??''))){
  const kind=row.path.split('.').at(-1);
  if(!['ybn','ymap','ytyp'].includes(kind))continue;
  const key=exactKey(kind,row.shortNameHash);
  unplanned.set(key,[...(unplanned.get(key)??[]),row.path]);
 }
 const mapResources=catalog.Resources.filter(r=>['ybn','ymap','ytyp'].includes(r.Kind));
 for(const row of mapResources){
  const k=exactKey(row.Kind,row.Hash),group=groups.get(k)??[];
  group.push(normalize(row.Path));groups.set(k,group);
 }
 const planMembers=new Set(plan.selected);
 const physical=new Set(scope.archives.map(a=>a.relative));
 function identify(member){
  const outer=member.slice(0,member.indexOf('.rpf/')+4);
  return {physicalArchive:physical.has(outer)?outer:null,nestedTable:nestedTable(member)};
 }
 function dependency(member,resource=null){
  const {physicalArchive,nestedTable:table}=identify(member),observation=seen.get(member),pin=plan.pins[member]??null;
  let failedTable=table;
  while(failedTable&&!blocked.has(failedTable))failedTable=nestedTable(failedTable);
  const setup=exactSetups.get(setupPack(member)),renewed=newRows.get(member);
  const currentState=renewed?.kind==='blocked'?
   (renewed.reason==='entry absent from verified table'?'absent-in-rechecked-table':'requalification-blocked'):
   renewed?(pin&&renewed.sha256!==pin?'retained-pin-mismatch':'member-reobserved'):
   observation?(pin&&observation.sha256!==pin?'retained-pin-mismatch':'member-observed'):
   !physicalArchive||!planMembers.has(member)?'outside-reviewed-member-scope':
   failedTable?'enclosing-table-unread':tables.has(table)?'unobserved-in-read-table':'enclosing-table-unqualified';
  const alternatives=resource?groups.get(exactKey(resource.Kind,resource.Hash))??[]:[];
  // A member already in the retained selected catalogue can appear in the
  // table-only inventory when this particular pass did not select its bytes.
  // Its identical path is evidence about the same member, not an override.
  const alternativesObserved=resource?(unplanned.get(exactKey(resource.Kind,resource.Hash))??[]).filter(candidate=>candidate!==member):[];
  const winnerMount=retainedMountOrder.get(table);
  const resolvedContenders=[],competing=[];
  for(const candidate of new Set(alternativesObserved)){
   const candidateMount=retainedMountOrder.get(nestedTable(candidate));
   const patch=patchTargets.get(candidate);
   const reason=patch?.size===1&&patch.has(member)?'exact-retained-patch':
    ['ymap','ybn'].includes(resource.Kind)&&winnerMount!==undefined?
     candidateMount===undefined?'outside-retained-active-map':candidateMount<winnerMount?'earlier-retained-active-mount':null:null;
   if(reason)resolvedContenders.push({path:candidate,reason,winnerMount,candidateMount:candidateMount??null});
   else competing.push(candidate);
  }
  return {member,kind:resource?.Kind??member.split('.').at(-1),resourceHash:resource?.Hash??null,
   physicalArchive,nestedTable:table,retainedMemberIdentity:resource?.Path??member,retainedPayloadSHA256:pin,
   retainedWinningSelection:resource?.ResolutionBasis??null,observedPayloadSHA256:renewed?.sha256??observation?.sha256??null,
   retainedDlcOrder:setup?.order==null?null:{setup:setup.path,major:Number(setup.order),minor:Number(setup.minorOrder??0)},
   exactRetainedCandidates:[...alternatives].sort(),currentState,failedTable:failedTable||null,
   candidatePrecedence:effectiveMapSelection01([...alternatives,...competing].map(path=>({path,rank:null}))).state,
   resolvedContenders,
   competingUnplannedCandidates:[...new Set(competing)].sort(),
   failure:renewed?.reason??blocked.get(failedTable)?.reason??null,
   effectiveSelectionReverified:false};
 }
 const members=mapResources.map(r=>dependency(normalize(r.Path),r));
 const unreadPins=Object.keys(plan.pins).sort().map(p=>dependency(p)).filter(d=>!['member-observed','member-reobserved'].includes(d.currentState));
 const missing=members.filter(d=>!['member-observed','member-reobserved'].includes(d.currentState));
 const setupGaps=[...new Set((listed?.items??[]).map(p=>normalize(p).match(/^(?:dlcpacks:\/?|platform:\/dlcpacks\/)([^/]+)/)?.[1]).filter(Boolean))]
  .filter(pack=>exactSetups.get(pack)?.order==null).map(pack=>({pack,retainedSetup:exactSetups.get(pack)??null,
   retainedMountOrderIndex:catalog.DlcNames.indexOf(pack),state:exactSetups.has(pack)?'setup-read-order-unavailable':'setup-path-unresolved-within-reviewed-scope'}));
 const affectedTables=[...blocked.keys()].filter(p=>p.endsWith('.rpf')).sort();
 const selected=new Set([...missing,...unreadPins].filter(d=>planMembers.has(d.member)).map(d=>d.member));
 for(const r of plan.selected)if(affectedTables.some(p=>r.startsWith(p+'/')))selected.add(r);
 for(const row of setupGaps)if(row.retainedSetup)selected.add(row.retainedSetup.path);
 // The old YMF projection lost its physical FileEntry on every conditional
 // row. Reproject the exact already-observed YMF inputs from the same scope.
 const knownYmf=[...seen.values()].filter(r=>r.kind==='metadata'&&r.path.endsWith('.ymf')&&identify(r.path).physicalArchive);
 const needsManifestSources=census.some(r=>r.activationBasis==='conditional-mapgroup-observation-required');
 if(needsManifestSources)for(const row of knownYmf)selected.add(row.path);
 const branches=new Set(affectedTables.filter(p=>!physical.has(p)));
 for(const p of [...selected,...branches]){
  for(let parent=nestedTable(p);parent&&!physical.has(parent);parent=nestedTable(parent))branches.add(parent);
 }
 const verifiedPayloads=new Map([...seen,...newRows].filter(([p,row])=>row.kind==='metadata'&&plan.pins[p]===row.sha256).map(([p,row])=>[p,row.sha256]));
 const valid=(p,pin)=>p&&pin&&verifiedPayloads.get(normalize(p))===pin;
 const retained=catalog.InteriorPlacementMetadata01;
 const guarded={...catalog,InteriorPlacementMetadata01:{...retained,
  Archetypes:retained.Archetypes.filter(r=>valid(r.SourceYtyp,r.SourceSHA256)),Instances:retained.Instances.filter(r=>valid(r.SourceYmap,r.SourceSHA256))}};
 const byPath=new Map(mapResources.map(r=>[normalize(r.Path),r]));
 const ymfCompleted=new Map(requalified.filter(r=>r.kind==='ymf-projection'&&r.representation==='pso-membership-projection').map(r=>[r.path,r.sha256]));
 const ymfRelationships=new Map();
 for(const row of requalified.filter(r=>['ymf-mapgroup','ymf-interior'].includes(r.kind)&&ymfCompleted.get(r.path)===r.sha256)){
  for(const bound of row.bounds){
   const key=[row.kind,bound,row.groupHash??row.archetypeHash].join(':');
   ymfRelationships.set(key,[...(ymfRelationships.get(key)??[]),{path:row.path,sha256:row.sha256}]);
  }
 }
 const metadataHash=value=>typeof value==='string'&&/^0x[0-9a-f]{8}$/i.test(value)?value.toLowerCase():typeof value==='string'&&value?collisionNameHash(value):null;
 const conditionalRequirements=census.filter(r=>r.activationBasis==='conditional-mapgroup-observation-required').map(r=>{
  const identity=byPath.get(normalize(r.entry)),projection=identity?collisionProjection(catalog,identity.Hash.toLowerCase()):null;
  return {resourceId:r.id,entry:r.entry,resourceHash:identity?.Hash??null,currentEffectiveSelectionVerified:false,runtimeState:'unknown',
   requirements:(projection?.MapGroupMembership??[]).map(group=>{
    const matches=ymfRelationships.get(['ymf-mapgroup',group.BoundsHash,group.GroupHash??metadataHash(group.Name)].join(':'))??[];
    const manifest=typeof group.Manifest==='string'?normalize(group.Manifest):matches.length===1?matches[0].path:null;
    return {manifest,observedManifestSHA256:newRows.get(manifest)?.sha256??seen.get(manifest)?.sha256??null,
     group:group.Name,dataGroup:group.DataGroupName,boundsHash:group.BoundsHash,retainedHours:group.HoursOnOff,retainedWeather:group.WeatherTypes,
     exactManifestCandidates:matches,
     requiredObservation:manifest?'effective manifest group and exact bound active collision variant in the same game session':'source manifest identity required before runtime association'};
   })};
 });
 const placements=census.filter(r=>['cache-identity-candidate','ambiguous-or-missing-native-bounds','interior-local-unplaced'].includes(r.placement)).map(r=>{
  const identity=byPath.get(normalize(r.entry)),projection=identity?collisionProjection(catalog,identity.Hash.toLowerCase()):null;
  const bounds=projection?.BoundsStoreItems??[],memberships=projection?.InteriorBoundsMembership??[];
  const parents=new Set(memberships.map(m=>m.InteriorName).filter(Boolean).map(m=>/^0x[0-9a-f]{8}$/i.test(m)?m.toLowerCase():collisionNameHash(m)));
  const candidateTypes=retained.Archetypes.filter(a=>a.PhysicsDictionaryHash.toLowerCase()===identity?.Hash.toLowerCase()||parents.has(a.ArchetypeHash.toLowerCase()));
  const candidateParents=new Set(candidateTypes.map(a=>a.ArchetypeHash.toLowerCase()));
  const candidateInstances=retained.Instances.filter(i=>candidateParents.has(i.ArchetypeHash.toLowerCase()));
  const check=r.placement==='interior-local-unplaced'&&identity?resolveInteriorCollisionPlacements01(guarded,identity.Hash,memberships):null;
  return {id:r.id,entry:r.entry,resourceHash:identity?.Hash??null,retainedState:r.placement,currentState:'unresolved',
   bounds:bounds.map(v=>({entry:v.CacheFile,layer:v.Layer,pin:v.CacheMetadataSHA256,pinMatched:!!valid(v.CacheFile,v.CacheMetadataSHA256)})),
   manifestParents:memberships.map(m=>({...m,exactManifestCandidates:ymfRelationships.get(['ymf-interior',m.BoundsHash,m.InteriorNameHash??metadataHash(m.InteriorName)].join(':'))??[]})),
   exactCandidateTypes:candidateTypes.map(a=>({entry:a.SourceYtyp,hash:a.ArchetypeHash,pinMatched:!!valid(a.SourceYtyp,a.SourceSHA256)})),
   exactCandidateInstances:candidateInstances.map(i=>({entry:i.SourceYmap,id:i.InstanceId,pinMatched:!!valid(i.SourceYmap,i.SourceSHA256)})),
   reason:check?.reason??(check?'effective-source-or-manifest-parent-not-currently-qualified':bounds.length?'native-coordinate-identity-unqualified':'exact-bounds-store-key-missing')};
 });
 const authorityChanges=members.filter(row=>row.competingUnplannedCandidates.length||row.currentState==='retained-pin-mismatch'||
  row.currentState==='absent-in-rechecked-table'||row.currentState==='requalification-blocked'||
  row.currentState==='member-reobserved'&&!seen.has(row.member)).map(row=>({member:row.member,resourceHash:row.resourceHash,
   change:row.competingUnplannedCandidates.length?'possible-override-precedence-unverified':row.currentState,
   competingPaths:row.competingUnplannedCandidates,
   placementAndActivationRequalificationRequired:true,runtimeProofPublished:false}));
 const retainedContenderResolutions=members.filter(row=>row.resolvedContenders.length)
  .map(row=>({member:row.member,alternatives:row.resolvedContenders}));
 return {schema:1,affectedTables,missing,unreadPins,setupGaps,placements,conditionalRequirements,authorityChanges,retainedContenderResolutions,
  summary:{catalogueYbn:census.length,coverage:counts(members,r=>r.kind+'/'+r.currentState),gapsByCause:counts(missing,r=>r.currentState),
   pinsUnverified:unreadPins.length,unresolvedPlacements:placements.length,previouslyObservedYmf:knownYmf.length,
   conditionalManifestSourceMissing:conditionalRequirements.filter(r=>r.requirements.some(g=>!g.manifest)).length,
   selectedMembersWithRetainedContenderResolution:retainedContenderResolutions.length,
   selectedMembersWithUnresolvedContenders:members.filter(r=>r.competingUnplannedCandidates.length).length,
   effectiveMapVerified:false,AcousticWorldComplete:false},
  readPlan:{archives:scope.archives.map(a=>a.relative),branches:[...branches].sort(),selected:[...selected].sort(),
   parserSHA256:scope.codeWalkerCoreSHA256,executableSHA256:scope.gameExecutableSHA256}};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const [base,catalogFile,output,newMetadata]=process.argv.slice(2).map(p=>path.resolve(p));
 if(![base,catalogFile,output,...(newMetadata?[newMetadata]:[])].every(p=>p?.split(path.sep).includes('.local')))throw Error('Private receipt inputs and output required');
 const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
 const sourceScope=path.join(base,'source-scope-map-only.json'),catalog=read(catalogFile),scope=read(sourceScope);
 const prior=path.join(base,'approved-corrected-preparation-02'),receipt=read(path.join(prior,'execution-inputs.json'));
 const planFile=path.join(base,'corrected-reader-02/read-plan.json');
 for(const [file,expected] of [[sourceScope,receipt.scopeSHA256],[catalogFile,scope.catalogueSHA256],[planFile,receipt.metadataPlanSHA256]])
  if(sha(fs.readFileSync(file))!==expected)throw Error('Prior receipt binding differs');
 const lines=file=>{
  const info=fs.lstatSync(file);
  if(!info.isFile()||info.nlink!==1||info.size>128*1024*1024||fs.realpathSync.native(file).toLowerCase()!==file.toLowerCase())throw Error('Bounded private metadata receipt required');
  return fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
 };
 const result=buildMapRequalification01({scope,plan:read(planFile),catalog,census:read(path.join(prior,'resource-census.json')),
  previous:lines(path.join(prior,'metadata.jsonl')),requalified:newMetadata?lines(newMetadata):[]});
 fs.mkdirSync(output);
 fs.writeFileSync(path.join(output,'dependency-audit.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 const candidate=Buffer.from(JSON.stringify(result.readPlan));
 fs.writeFileSync(path.join(output,'read-plan.json'),candidate,{flag:'wx'});
 console.log(JSON.stringify({...result.summary,affectedTables:result.affectedTables.length,setupGaps:result.setupGaps,
  candidateBranches:result.readPlan.branches.length,candidateMembers:result.readPlan.selected.length,planSHA256:sha(candidate)},null,2));
}
