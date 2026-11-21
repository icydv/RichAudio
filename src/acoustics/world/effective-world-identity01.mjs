const nativeHash=value=>typeof value==='string'&&/^0x[0-9a-f]{8}$/.test(value);
const hash=value=>nativeHash(value)&&value!=='0x00000000';
const digest=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const member=(value,extension)=>typeof value==='string'&&value===value.toLowerCase()&&
 value.includes('.rpf/')&&value.endsWith(extension)&&!value.includes('\\')&&!value.split('/').some(part=>!part||part==='.'||part==='..');

// Replay the two independent dictionary writes in CodeWalker GameFileCache.
// expectedMembers describes the audit's population, which may be only a subset
// of AllRpfs. Never promote a local replay to global effective authority.
export function replayEffectiveYtyp01({expectedMembers,projections,traversal=null,completePopulation=false}){
 const expected=new Set(expectedMembers),byPath=new Map(),order=new Map();
 if(expected.size!==expectedMembers.length||expectedMembers.some(path=>!member(path,'.ytyp')))throw Error('Unique exact YTYP member population required');
 for(const row of projections){
  if(!expected.has(row.member)||byPath.has(row.member)||!digest(row.sha256)||!nativeHash(row.nameHash)||!Array.isArray(row.definitions)||
   row.definitions.some(definition=>!nativeHash(definition?.hash)))throw Error('Invalid bound YTYP projection');
  byPath.set(row.member,row);
 }
 const ordinals=new Set();
 for(const row of traversal??[]){
  const {member:path,sha256,archiveOrdinal,entryOrdinal}=row;
  const key=archiveOrdinal+'/'+entryOrdinal;
  if(!expected.has(path)||order.has(path)||ordinals.has(key)||!digest(sha256)||
   !Number.isSafeInteger(archiveOrdinal)||archiveOrdinal<0||!Number.isSafeInteger(entryOrdinal)||entryOrdinal<0||
   byPath.has(path)&&byPath.get(path).sha256!==sha256)throw Error('Invalid bound CodeWalker traversal');
  order.set(path,row);ordinals.add(key);
 }
 const missingMembers=[...expected].filter(path=>!byPath.has(path)).sort();
 const missingTraversal=[...expected].filter(path=>!order.has(path)).sort();
 const populationState=missingMembers.length?'unread-members':!completePopulation?'scoped-members-only':'complete';
 const authority=populationState==='complete'&&!missingTraversal.length;
 const files=new Map(),archetypes=new Map();
 const record=(index,key,source)=>{
  if(!index.has(key))index.set(key,[]);
  index.get(key).push(source);
 };
 for(const row of byPath.values()){
  const position=order.get(row.member);
  const source={member:row.member,sha256:row.sha256,archive:row.member.slice(0,row.member.indexOf('.rpf/')+4),
   table:row.member.slice(0,row.member.lastIndexOf('.rpf/')+4),nameHash:row.nameHash,
   archiveOrdinal:position?.archiveOrdinal??null,entryOrdinal:position?.entryOrdinal??null};
  record(files,row.nameHash,source);
  row.definitions.forEach((definition,ordinal)=>{
   if(definition.hash!=='0x00000000')record(archetypes,definition.hash,{...source,ordinal,type:definition.type??null});
  });
 }
 const decisions=index=>[...index].sort(([a],[b])=>a.localeCompare(b)).map(([key,sources])=>{
  const knownOrder=sources.every(s=>s.member===sources[0].member)||sources.every(s=>s.archiveOrdinal!==null);
  if(knownOrder)sources.sort((a,b)=>a.archiveOrdinal-b.archiveOrdinal||a.entryOrdinal-b.entryOrdinal||(a.ordinal??0)-(b.ordinal??0));
  return {hash:key,state:authority?'effective-verified':knownOrder?'observed-only':'observed-order-unresolved',
   definitionState:sources.length===1?'single-observed-definition':'competing-definitions',
   winner:authority?sources.at(-1):null,observedWinner:knownOrder?sources.at(-1):null,
   overwriteHistory:knownOrder?sources:null,unorderedCandidates:knownOrder?null:sources};
 });
 return {populationState,missingMembers,missingTraversal,files:decisions(files),archetypes:decisions(archetypes)};
}

export function verifyPlacementArchetype01(decision,prior){
 if(!decision?.winner)return 'effective-archetype-unverified';
 const {member:path,sha256,ordinal}=decision.winner;
 return path===prior.member&&sha256===prior.sha256&&ordinal===prior.ordinal?'same-effective-definition':'placement-requalification-required';
}

// A name/hash or manifest path on its own is insufficient. Both native keys
// must occur together in a complete projection of the exact YMF FileEntry.
export function indexConditionalManifests01(rows,activeTables){
 const completed=new Map(),byBound=new Map(),byGroup=new Map();
 const active=row=>member(row.path,'.ymf')&&digest(row.sha256)&&activeTables.has(row.path.slice(0,row.path.lastIndexOf('.rpf/')+4));
 for(const row of rows){
  if(row.kind!=='ymf-projection'||row.representation!=='pso-membership-projection'||!active(row))continue;
  if(completed.has(row.path))throw Error('Duplicate completed YMF projection');
  completed.set(row.path,row.sha256);
 }
 for(const row of rows){
  if(row.kind!=='ymf-mapgroup'||!completed.has(row.path)||completed.get(row.path)!==row.sha256||!hash(row.groupHash)||!Array.isArray(row.bounds))continue;
  const group={path:row.path,sha256:row.sha256,groupHash:row.groupHash,flags:row.flags??null,hours:row.hours??null,weather:row.weather??[]};
  if(!byGroup.has(row.groupHash))byGroup.set(row.groupHash,[]);
  byGroup.get(row.groupHash).push(group);
  for(const key of new Set(row.bounds.filter(hash))){
   if(!byBound.has(key))byBound.set(key,[]);
   byBound.get(key).push(group);
  }
 }
 return {byBound,byGroup,completed};
}

export function associateConditionalBound01(index,{groupHash,boundsHash,expectedPath=null,expectedSHA256=null,effectiveSelection=null}){
 if(effectiveSelection==='superseded'||effectiveSelection==='inactive')return {state:'resource-'+effectiveSelection,candidates:[]};
 if(!hash(groupHash)||!hash(boundsHash))return {state:'native-key-unavailable',candidates:[]};
 const groups=index.byGroup.get(groupHash)??[],bounds=index.byBound.get(boundsHash)??[];
 const nativeMatches=bounds.filter(row=>row.groupHash===groupHash);
 const candidates=nativeMatches.filter(row=>(!expectedPath||row.path===expectedPath)&&(!expectedSHA256||row.sha256===expectedSHA256));
 if(candidates.length===1)return {state:'source-bound',source:candidates[0],candidates};
 if(candidates.length>1)return {state:'group-ambiguous',candidates};
 if(nativeMatches.length)return {state:'manifest-identity-mismatch',candidates:nativeMatches};
 if(expectedPath&&!index.completed.has(expectedPath))return {state:'expected-manifest-unavailable',candidates:[]};
 if(bounds.length||groups.length||expectedPath)return {state:'native-key-mismatch',candidates:[...new Set([...groups,...bounds])]};
 return {state:'source-manifest-unidentified',candidates:[]};
}
