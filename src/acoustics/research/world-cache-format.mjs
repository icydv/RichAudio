// Original data-only research contracts. No game, file, fitting or audio operations.
import {createHash} from 'node:crypto';
export const cacheLimits=Object.freeze({bytes:262144,tiles:16,resident:4,groups:4,patches:4,resources:32,vertices:9,totalBytes:4194304});
export const coordinateSpec='gta-native-units-unverified';
export function id(x){if(typeof x!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(x))throw Error('bounded identifier');return x;}
export function number(x,min=-100000,max=100000){if(!Number.isFinite(x)||x<min||x>max)throw Error('bounded finite number');return x;}
export function vec(p){if(!Array.isArray(p)||p.length!==3)throw Error('vector');return p.map(x=>number(x));}
export function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
export function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
function keys(o,allowed){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k)))throw Error('object fields');}
export function validateWorld(w){
 keys(w,['version','build','schema','algorithm','coordinates','environment','interior','mapFamily','evidence','resources']);
 if(w.version!==1||w.schema!==1||w.algorithm!=='orthogonal-plane-jacobi-v1'||w.coordinates!==coordinateSpec||w.build!=='1.0.1158.16'||!['synthetic-complete','partial-runtime'].includes(w.evidence)||!Array.isArray(w.resources)||w.resources.length>32)throw Error('world identity');
 for(const k of ['environment','interior','mapFamily'])id(w[k]);if(w.evidence==='synthetic-complete'&&!w.environment.startsWith('synthetic-'))throw Error('runtime cannot attest complete map detection');
 const seen=new Set();for(const r of w.resources){keys(r,['id','fingerprint','scope']);id(r.id);if(seen.has(r.id)||typeof r.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(r.fingerprint)||r.scope!==null&&(!Array.isArray(r.scope)||r.scope.length>16||new Set(r.scope).size!==r.scope.length))throw Error('resource identity');seen.add(r.id);if(r.scope)r.scope.forEach(id);}return w;
}
export function compatibility(saved,current,tileId){
 validateWorld(saved);validateWorld(current);id(tileId);
 for(const k of ['version','build','schema','algorithm','coordinates','environment','interior','mapFamily'])if(saved[k]!==current[k])return {state:'invalid',reason:k+'_changed'};
 const a=new Map(saved.resources.map(r=>[r.id,r])),b=new Map(current.resources.map(r=>[r.id,r]));let uncertain=saved.evidence!=='synthetic-complete'||current.evidence!=='synthetic-complete';
 for(const key of new Set([...a.keys(),...b.keys()])){const x=a.get(key),y=b.get(key);if(x&&y&&x.fingerprint===y.fingerprint&&canonical(x.scope)===canonical(y.scope))continue;const scopes=[x?.scope,y?.scope].filter(x=>x!==undefined);if(scopes.some(s=>s===null))return {state:'invalid',reason:'unscoped_resource_changed'};if(scopes.some(s=>s.includes(tileId)))return {state:'invalid',reason:'affected_resource_changed'};if(!scopes.length)uncertain=true;}
 return {state:uncertain?'uncertain':'compatible-declared',reason:uncertain?'map_detection_incomplete':'declared_evidence_matches_not_world_proof'};
}
export function validateTile(t){
 keys(t,['version','id','world','bounds','savedUtc','groups','patches','unknown','widerConnectivity']);
 if(t.version!==1)throw Error('tile schema');id(t.id);validateWorld(t.world);keys(t.bounds,['min','max']);const lo=vec(t.bounds.min),hi=vec(t.bounds.max);if(lo.some((v,i)=>hi[i]<=v||hi[i]-v>32))throw Error('tile bounds');
 if(typeof t.savedUtc!=='string'||t.savedUtc.length>30||!Number.isFinite(Date.parse(t.savedUtc))||!Array.isArray(t.groups)||t.groups.length<1||t.groups.length>4||!Array.isArray(t.patches)||t.patches.length!==t.groups.length||t.unknown!=='between-rays-and-beyond-support'||t.widerConnectivity!==null)throw Error('tile contents');
 const groups=new Map();for(const g of t.groups){keys(g,['id','session','generation','interior','observedMonotonicMs','observedUtc','sourceFingerprint','kind','observationCount','streamingGeneration']);id(g.id);id(g.session);if(groups.has(g.id)||g.generation!==1||!Number.isSafeInteger(g.interior)||g.interior<0||g.observationCount!==9||g.streamingGeneration!=='unavailable'||!['wall','ground'].includes(g.kind)||!/^[a-f0-9]{64}$/.test(g.sourceFingerprint)||g.observedUtc!==null&&(typeof g.observedUtc!=='string'||g.observedUtc.length>30||!Number.isFinite(Date.parse(g.observedUtc))))throw Error('group provenance');number(g.observedMonotonicMs,0,86400000);groups.set(g.id,g);}
 const seen=new Set();for(const p of t.patches){keys(p,['id','group','basis','originalState','center','normal','footprint','maxResidual','rms','planeTolerance','arithmeticTolerance','normalDegrees','material','permanence','sourceIds']);id(p.id);id(p.group);if(seen.has(p.id)||!groups.has(p.group)||p.basis!=='inferred'||p.originalState!=='observed-support-only'||p.material!=='unknown'||p.permanence!=='unverified'||!Array.isArray(p.footprint)||p.footprint.length<3||p.footprint.length>9||!Array.isArray(p.sourceIds)||p.sourceIds.length!==9||new Set(p.sourceIds).size!==9||p.sourceIds.some((x,i)=>x!==p.group+'-ray-'+i))throw Error('patch provenance');seen.add(p.id);groups.delete(p.group);
  const c=vec(p.center),n=vec(p.normal);if(Math.abs(Math.hypot(...n)-1)>.01)throw Error('normal');for(const v of [c,...p.footprint.map(vec)])if(v.some((x,i)=>x<lo[i]||x>hi[i]))throw Error('support outside tile');
  number(p.maxResidual,0,.25);number(p.rms,0,p.maxResidual+1e-12);number(p.arithmeticTolerance,0,.0625);number(p.planeTolerance,.005,.25);number(p.normalDegrees,0,5);if(p.maxResidual>p.planeTolerance||p.planeTolerance!==Math.max(.005,4*p.arithmeticTolerance))throw Error('fit screen');
  for(const q of p.footprint)if(Math.abs(q.reduce((s,x,i)=>s+(x-c[i])*n[i],0))>1e-6)throw Error('footprint off stored plane');
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);let area=0,sign=0;const ps=p.footprint;
  for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],d=ps[(i+2)%ps.length];if(Math.hypot(...sub(a,b))<1e-8)throw Error('duplicate footprint vertex');area+=dot(cross(sub(a,c),sub(b,c)),n);const turn=dot(cross(sub(b,a),sub(d,b)),n);if(Math.abs(turn)>1e-10){if(sign&&Math.sign(turn)!==sign)throw Error('nonconvex support');sign=Math.sign(turn);}}
  if(Math.abs(area)<1e-8||!sign)throw Error('degenerate support');
  // Strict convex half-spaces also reject a self-crossing star: every other
  // vertex must remain on the same inward side of every directed edge.
  for(let i=0;i<ps.length;i++)for(const q of ps)if(sign*dot(cross(sub(ps[(i+1)%ps.length],ps[i]),sub(q,ps[i])),n)<-1e-9)throw Error('crossing support');
 }if(groups.size)throw Error('missing patch');return t;
}
export function loadedView(tile,currentWorld){const c=compatibility(tile.world,currentWorld,tile.id);return freeze({tile:structuredClone(tile),compatibility:c.state,knowledge:c.state==='invalid'?'invalid':'historical',basis:'inferred',current:false,authoritative:false,observationScheduling:'none',reason:c.reason});}
// Future Layer B contracts only. A navigation node is not an acoustic portal.
export function connectivityContract(input){
 keys(input,['version','worldKey','nodes','links','coverage']);if(input.version!==1||!/^[a-f0-9]{64}$/.test(input.worldKey)||!Array.isArray(input.nodes)||input.nodes.length>16||!Array.isArray(input.links)||input.links.length>32||input.coverage!=='unknown')throw Error('connectivity contract');
 if(input.nodes.length||input.links.length)throw Error('no observed acoustic connectivity available in this milestone');return freeze(structuredClone(input));
}
