// Original offline research. No game API, extraction, DSP or audio output.
import {createHash} from 'node:crypto';
export const coordinateSpace='research-rh-z-up-metres-v1';
export const timeUnit='monotonic-ms';
export const limits=Object.freeze({surfaces:128,missingRegions:32,openings:8,tileSide:256,coordinate:100000,epsilon:1e-8});
const E=limits.epsilon;
const validatedTiles=new WeakSet();
function requireTile(tile){if(!validatedTiles.has(tile))throw Error('validated immutable tile snapshot required');}
export function vector(v){if(!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x)||Math.abs(x)>limits.coordinate))throw Error('invalid finite metre vector');return [...v];}
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const scale=(v,s)=>v.map(x=>x*s);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length=v=>Math.hypot(...v);
export function unit(v){const a=vector(v),n=length(a);if(n<E)throw Error('degenerate direction');return scale(a,1/n);}
export function toSteamAudio(v){const [x,y,z]=vector(v);return [x,z,-y];}
const finite=(n,label)=>{if(!Number.isFinite(n)||n<0)throw Error('invalid '+label);return n;};
const identifier=s=>{if(typeof s!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(s))throw Error('invalid research identifier');return s;};
function confidence(n){if(!Number.isFinite(n)||n<0||n>1)throw Error('invalid confidence');return n;}
function box(b){if(!b)throw Error('missing bounds');const min=vector(b.min),max=vector(b.max);if(min.some((v,i)=>max[i]<=v||max[i]-v>limits.tileSide))throw Error('invalid bounded region');return {min,max};}
export const inBox=(p,b)=>p.every((x,i)=>x>=b.min[i]-E&&x<=b.max[i]+E);
function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
function surface(s,bounds){
  if(!s||s.coordinateSpace!==coordinateSpace)throw Error('explicit surface coordinate space required');
  const center=vector(s.center),normal=vector(s.normal),u=vector(s.u);
  if(Math.abs(length(normal)-1)>E||Math.abs(length(u)-1)>E||Math.abs(dot(normal,u))>E)throw Error('unit perpendicular normal and tangent required');
  if(!Array.isArray(s.half)||s.half.length!==2||s.half.some(x=>!Number.isFinite(x)||x<=E||x>128))throw Error('invalid finite surface extent');
  const v=cross(normal,u),half=[...s.half],corners=[[-1,-1],[-1,1],[1,1],[1,-1]].map(([a,b])=>add(center,add(scale(u,a*half[0]),scale(v,b*half[1]))));
  if(corners.some(p=>!inBox(p,bounds)))throw Error('surface outside tile');
  if(!['static','dynamic','unknown'].includes(s.motion)||!['front','both'].includes(s.reflectiveSide))throw Error('explicit motion and reflective side required');
  if(!s.provenance||!['synthetic','observation','derived'].includes(s.provenance.kind))throw Error('geometry provenance required');
  const observedAt=finite(s.observedAt,'observation time'),validUntil=finite(s.validUntil,'expiry');if(validUntil<=observedAt||!Number.isSafeInteger(s.version)||s.version<1)throw Error('invalid surface lifetime/version');
  const material=s.material??{observedId:null,observedConfidence:null,acoustic:null};
  if(material.observedId!==null&&(!['string','number'].includes(typeof material.observedId)||typeof material.observedId==='number'&&!Number.isFinite(material.observedId)||String(material.observedId).length>80))throw Error('invalid observed material identifier');
  if(material.observedId!==null)confidence(material.observedConfidence);else if(material.observedConfidence!==null)throw Error('unknown material confidence must be null');
  if(material.acoustic){const a=material.acoustic;confidence(a.energyReflection);confidence(a.confidence);if(!['synthetic-assumption','authored-assumption'].includes(a.kind)||typeof a.reason!=='string'||!a.reason||a.reason.length>200)throw Error('explicit acoustic assumption required');}
  const openings=s.openings??[];if(!Array.isArray(openings)||openings.length>limits.openings)throw Error('opening limit');
  const holes=openings.map(h=>{if(!Array.isArray(h.min)||!Array.isArray(h.max)||h.min.length!==2||h.max.length!==2||h.min.some((x,i)=>!Number.isFinite(x)||!Number.isFinite(h.max[i])||h.max[i]<=x||x< -half[i]||h.max[i]>half[i]))throw Error('invalid opening');return {min:[...h.min],max:[...h.max]};});
  // Optional convex support preserves an observed footprint instead of expanding
  // its bounding rectangle into an invented reflector. Existing rectangles are unchanged.
  let footprint;
  if(s.footprint!==undefined){
    if(!Array.isArray(s.footprint)||s.footprint.length<3||s.footprint.length>16)throw Error('bounded convex footprint required');
    footprint=s.footprint.map(p=>{if(!Array.isArray(p)||p.length!==2||p.some((x,i)=>!Number.isFinite(x)||Math.abs(x)>half[i]+E))throw Error('footprint outside finite extent');return [...p];});
    for(let i=0;i<footprint.length;i++){const a=footprint[i],b=footprint[(i+1)%footprint.length];if(Math.hypot(b[0]-a[0],b[1]-a[1])<=E||footprint.some(p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])< -E))throw Error('convex counterclockwise footprint required');}
    if(footprint.reduce((n,a,i)=>{const b=footprint[(i+1)%footprint.length];return n+a[0]*b[1]-a[1]*b[0];},0)<=E)throw Error('degenerate footprint');
  }
  const materialValue={observedId:material.observedId,observedConfidence:material.observedConfidence,acoustic:material.acoustic?{energyReflection:material.acoustic.energyReflection,confidence:material.acoustic.confidence,kind:material.acoustic.kind,reason:material.acoustic.reason}:null};
  return {id:identifier(s.id),coordinateSpace,center,normal,u,v,half,corners,...(footprint?{footprint}:{}),motion:s.motion,reflectiveSide:s.reflectiveSide,provenance:{kind:s.provenance.kind,reference:identifier(s.provenance.reference)},confidence:s.confidence===null?null:confidence(s.confidence),material:materialValue,version:s.version,observedAt,validUntil,openings:holes};
}
export function createTile(input){
  if(!input||input.schemaVersion!==1||input.coordinateSpace!==coordinateSpace||input.timeUnit!==timeUnit||!['complete-synthetic','partial'].includes(input.coverage))throw Error('unsupported tile schema, coordinates, time units or coverage');
  const bounds=box(input.bounds),anchor=vector(input.listenerAnchor);if(!inBox(anchor,bounds))throw Error('listener anchor outside tile');
  if(!Array.isArray(input.surfaces)||input.surfaces.length>limits.surfaces)throw Error('surface limit');
  const surfaces=input.surfaces.map(s=>surface(s,bounds)).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  if(new Set(surfaces.map(s=>s.id)).size!==surfaces.length)throw Error('duplicate surface observation');
  const geometricKeys=new Set();for(const s of surfaces){const k=JSON.stringify(s.corners.map(p=>p.join(',')).sort());if(geometricKeys.has(k))throw Error('duplicate coincident surface');geometricKeys.add(k);}
  const missing=input.missingRegions??[];if(!Array.isArray(missing)||missing.length>limits.missingRegions)throw Error('missing region limit');
  const missingRegions=missing.map(m=>{const b=box(m.bounds);if(!inBox(b.min,bounds)||!inBox(b.max,bounds))throw Error('unknown region outside tile');return {id:identifier(m.id),bounds:b,reason:identifier(m.reason)};}).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  if(new Set(missingRegions.map(m=>m.id)).size!==missingRegions.length)throw Error('duplicate unknown region');
  const createdAt=finite(input.createdAt,'creation time'),validUntil=finite(input.validUntil,'tile expiry');if(validUntil<=createdAt||!Number.isSafeInteger(input.version)||input.version<1||!Number.isSafeInteger(input.dynamicEpoch)||input.dynamicEpoch<0)throw Error('invalid tile lifetime/version');
  if(surfaces.some(s=>s.observedAt>createdAt||s.validUntil>validUntil))throw Error('surface lifetime outside tile snapshot');
  if(input.coverage==='complete-synthetic'&&surfaces.some(s=>s.provenance.kind!=='synthetic'))throw Error('observations cannot declare complete world coverage');
  const tile={schemaVersion:1,id:identifier(input.id),coordinateSpace,timeUnit,bounds,listenerAnchor:anchor,coverage:input.coverage,surfaces,missingRegions,version:input.version,createdAt,validUntil,build:identifier(input.build),session:identifier(input.session),interior:identifier(input.interior),dynamicEpoch:input.dynamicEpoch};
  tile.observationKey=createHash('sha256').update(JSON.stringify(tile)).digest('hex');validatedTiles.add(tile);return freeze(tile);
}
export function cacheStatus(tile,c){
  requireTile(tile);if(!c)throw Error('cache context required');const reasons=[],now=finite(c.now,'query time'),listener=vector(c.listener),movement=finite(c.maxListenerMove,'reuse distance');
  for(const key of ['id','observationKey','coordinateSpace','timeUnit','build','session','interior','version','dynamicEpoch'])if(tile[key]!==c[key])reasons.push(key+'_changed');
  if(now<tile.createdAt||now>=tile.validUntil)reasons.push('tile_expired_or_clock_reset');
  if(tile.surfaces.some(s=>now>=s.validUntil))reasons.push('surface_expired');
  if(!inBox(listener,tile.bounds)||length(sub(listener,tile.listenerAnchor))>movement)reasons.push('listener_moved');
  return {valid:reasons.length===0,reasons,coverage:tile.coverage,missingRegions:tile.missingRegions.length};
}
export function onPatch(s,p){const d=sub(p,s.center),u=dot(d,s.u),v=dot(d,s.v);return Math.abs(dot(d,s.normal))<=E&&Math.abs(u)<=s.half[0]+E&&Math.abs(v)<=s.half[1]+E&&(!s.footprint||s.footprint.every((a,i)=>{const b=s.footprint[(i+1)%s.footprint.length];return (b[0]-a[0])*(v-a[1])-(b[1]-a[1])*(u-a[0])>=-E;}))&&!s.openings.some(h=>u>=h.min[0]-E&&u<=h.max[0]+E&&v>=h.min[1]-E&&v<=h.max[1]+E);}
function hitsBox(a,b,box){let lo=0,hi=1;const d=sub(b,a);for(let i=0;i<3;i++){if(Math.abs(d[i])<E){if(a[i]<box.min[i]||a[i]>box.max[i])return false;}else {let x=(box.min[i]-a[i])/d[i],y=(box.max[i]-a[i])/d[i];if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return false;}}return true;}
export function querySegment(tile,start,end,{reflectorId=null,surfaceIndices=null}={}){
  requireTile(tile);const a=vector(start),b=vector(end);if(!inBox(a,tile.bounds)||!inBox(b,tile.bounds)||length(sub(b,a))<=E)throw Error('segment extent');
  let selected=tile.surfaces;
  if(surfaceIndices!==null){if(!Array.isArray(surfaceIndices)||surfaceIndices.length>tile.surfaces.length||surfaceIndices.some((n,i)=>!Number.isSafeInteger(n)||n<0||n>=tile.surfaces.length||(i>0&&n<=surfaceIndices[i-1])))throw Error('invalid conservative surface indices');selected=surfaceIndices.map(i=>tile.surfaces[i]);}
  const hits=[],ambiguous=[];let surfaceTests=0;
  for(const s of selected){surfaceTests++;const d0=dot(sub(a,s.center),s.normal),d1=dot(sub(b,s.center),s.normal),den=d0-d1;
    if(Math.abs(den)<E){if(Math.abs(d0)<E&&hitsBox(a,b,{min:[0,1,2].map(i=>Math.min(...s.corners.map(p=>p[i]))-E),max:[0,1,2].map(i=>Math.max(...s.corners.map(p=>p[i]))+E)}))ambiguous.push(s.id);continue;}
    const t=d0/den;if(t< -E||t>1+E)continue;const p=add(a,scale(sub(b,a),t));if(!onPatch(s,p))continue;
    if(s.id===reflectorId&&(Math.abs(t)<=E||Math.abs(t-1)<=E))continue;
    hits.push({id:s.id,t,point:p});
  }
  hits.sort((a,b)=>a.t-b.t||a.id.localeCompare(b.id,'en'));const unknown=tile.missingRegions.filter(m=>hitsBox(a,b,m.bounds)).map(m=>m.id);
  return {visibility:hits.length?'blocked':ambiguous.length||unknown.length||tile.coverage==='partial'?'unknown':'clear',hits,ambiguous,unknown,surfaceTests,claim:'Visibility within represented geometry only'};
}
