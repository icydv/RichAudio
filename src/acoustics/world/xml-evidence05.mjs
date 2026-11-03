// Trusted control-side evidence policy, separate from the untrusted XML decoder.
// A pinned review is an external trust input, never discovered in an export.
// No file opener, private-key loader, game API or installed-world certification.
import {canonical,decodeCanonical,byteDigest,digest,freeze,fields,requireWorld,bounds} from './contracts.mjs';
import {convertCollision,transformPoint,identity} from './collision-mesh.mjs';
import {entityMatrix,transformInstance} from './placements.mjs';
const policies=new WeakSet(),admissions=new WeakMap(),grants=new WeakSet();
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const same=(a,b)=>canonical(a)===canonical(b);
const need=requireWorld;
const receiptKeys=['provenanceReceiptSHA256','permissionReceiptSHA256','associationReceiptSHA256','coordinateReceiptSHA256','precedenceReceiptSHA256','activationReceiptSHA256'];
export function boundedXmlMetadata05(value,maximumBytes=262144){
 let entries=0,minimumBytes=0;
 function visit(v,depth){need(depth<=16&&++entries<=16384,'bounded XML metadata structure');if(v===null){minimumBytes+=4;return;}if(typeof v==='string'){minimumBytes+=v.length+2;need(minimumBytes<=maximumBytes,'bounded XML metadata text');return;}if(typeof v==='number'){need(Number.isFinite(v),'finite XML metadata');minimumBytes+=String(v).length;return;}if(typeof v==='boolean'){minimumBytes+=4;return;}
 need(v&&typeof v==='object','plain XML metadata data');const array=Array.isArray(v),proto=Object.getPrototypeOf(v);need(array?proto===Array.prototype:proto===Object.prototype||proto===null,'plain XML metadata container');if(array)need(v.length<=4096,'bounded XML metadata array');const keys=Reflect.ownKeys(v);need(keys.length<=4097,'bounded XML metadata fields');
 if(array)need(keys.length===v.length+1&&keys.every(k=>k==='length'||typeof k==='string'&&/^(0|[1-9][0-9]*)$/.test(k)&&Number(k)<v.length),'dense XML metadata arrays');
 for(const k of keys){if(array&&k==='length')continue;const d=Object.getOwnPropertyDescriptor(v,k);need(typeof k==='string'&&d.enumerable&&Object.hasOwn(d,'value')&&!['__proto__','prototype','constructor'].includes(k),'XML metadata data properties only');minimumBytes+=array?1:k.length+3;need(minimumBytes<=maximumBytes,'bounded XML metadata keys');visit(d.value,depth+1);}
 }
 visit(value,0);const bytes=Buffer.from(canonical(value));need(bytes.length<=maximumBytes,'bounded encoded XML metadata');return bytes;
}
export function pinXmlReviewPolicy05(bytes,{expectedSHA256}={}){
 need(Buffer.isBuffer(bytes)&&bytes.length<=16384&&hex(expectedSHA256)&&byteDigest(bytes)===expectedSHA256,'independently pinned XML review policy required');
 const p=decodeCanonical(bytes,16384);
 fields(p,['schema','kind','authority','purpose','evidenceSHA256','decoderSHA256','reviewReceiptSHA256','resources',...receiptKeys]);
 need(p.schema===1&&p.kind==='RichAudioXmlReviewPolicy05'&&['original-reference-fixture','review-policy-bound-static-export'].includes(p.authority)&&p.purpose==='offline-static-comparison-only','explicit offline XML review policy');
 need([p.evidenceSHA256,p.decoderSHA256,p.reviewReceiptSHA256,...receiptKeys.map(k=>p[k])].every(hex),'review policy receipt identities');
 need(Array.isArray(p.resources)&&p.resources.length===3&&new Set(p.resources.map(r=>r.id)).size===3,'exact three reviewed XML resources');
 for(const r of p.resources){fields(r,['id','xmlSHA256','decodedSHA256']);need(typeof r.id==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(r.id)&&hex(r.xmlSHA256)&&hex(r.decodedSHA256),'reviewed XML/DTO identity');}
 const result=freeze({...p,policySHA256:expectedSHA256});policies.add(result);return result;
}
export function inspectXmlGeometry05(decoded){
 need(decoded?.state==='decoded-unqualified-codewalker-xml-static-subset'&&Array.isArray(decoded.resources),'decoded XML building required');
 const map=decoded.resources.find(r=>r.kind==='ymap'),collision=decoded.resources.find(r=>r.kind==='ybn');
 need(map&&collision&&map.normalized.data.entities.length===1,'one explicit ordinary entity');
 const mesh=convertCollision(collision.normalized.data),entity=map.normalized.data.entities[0],placement=decoded.selection.collisionFrame==='world'?identity:entityMatrix(entity);
 const triangles=transformInstance(mesh.chunks.flatMap(c=>c.triangles),{instanceId:map.id+':'+entity.id,matrix:placement,coordinateSpace:'world',evidence:'metadata-resolved-runtime-unverified'});
 need(triangles.length<=128,'existing acoustic triangle limit');
 const unknown=mesh.unknownRegions.map(r=>({...r,bounds:r.bounds?(()=>{const p=Array.from({length:8},(_,mask)=>transformPoint(r.bounds.min.map((v,i)=>(mask>>i)&1?r.bounds.max[i]:v),placement));return {min:[0,1,2].map(i=>Math.min(...p.map(v=>v[i]))),max:[0,1,2].map(i=>Math.max(...p.map(v=>v[i])))};})():null}));
 const points=[...triangles.flatMap(t=>t.positions),...unknown.filter(r=>r.bounds).flatMap(r=>[r.bounds.min,r.bounds.max])];
 const geometryBounds=points.length?{min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))}:null;
 return freeze({kind:'RichAudioXmlInspectionGeometry05',authority:'unqualified-inspection-only',selection:decoded.selection,entity,triangles,geometryBounds,unknown,unsupported:mesh.unsupported,canPublishAcoustics:false,genuineResourceVerified:false,installedWorldVerified:false});
}
function nonCoplanar(points){
 const sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),a=points[0];
 for(let i=1;i<points.length;i++)for(let j=i+1;j<points.length;j++)for(let k=j+1;k<points.length;k++)if(Math.abs(dot(cross(sub(points[i],a),sub(points[j],a)),sub(points[k],a)))>1e-6)return true;
 return false;
}
export function admitXmlBuilding05({decoded,evidence,reviewPolicy}={}){
 need(policies.has(reviewPolicy),'separate branded pinned review policy; metadata cannot self-authorize');
 const bytes=boundedXmlMetadata05(evidence);need(byteDigest(bytes)===reviewPolicy.evidenceSHA256,'exact reviewed XML evidence');
 fields(evidence,['schema','kind','buildingId','tileId','build','layout','bounds','selection','resources','controls','materialTable','mounts','resourceMounts','activation',...receiptKeys]);
 need(evidence.schema===1&&evidence.kind==='RichAudioXmlBuildingEvidence05'&&['gen9','legacy'].includes(evidence.layout)&&same(evidence.selection,decoded.selection),'reviewed XML selection/layout');
 for(const k of ['buildingId','tileId','build'])need(typeof evidence[k]==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(evidence[k]),'explicit XML building identity');
 for(const key of receiptKeys)need(evidence[key]===reviewPolicy[key],'separately reviewed evidence receipt binding');
 need(decoded.supported===true&&decoded.resources.length===3&&same(evidence.resources.map(r=>r.id).sort(),decoded.resources.map(r=>r.id).sort()),'complete supported XML subset');
 for(const r of decoded.resources){const expected=reviewPolicy.resources.find(x=>x.id===r.id),source=evidence.resources.find(x=>x.id===r.id);fields(source,['id','kind','logicalArchive','logicalMember','xmlSHA256','xmlBytes','rawSourceSHA256']);need(expected&&source.kind===r.kind&&source.logicalArchive===r.logicalArchive&&source.logicalMember===r.logicalMember&&source.xmlSHA256===r.xmlSHA256&&source.xmlBytes===r.bytes&&source.rawSourceSHA256===r.sourceSHA256&&expected.xmlSHA256===r.xmlSHA256&&expected.decodedSHA256===digest(r.normalized),'reviewed source/export/DTO crossbinding');}
 const inspection=inspectXmlGeometry05(decoded);need(inspection.triangles.length>0&&inspection.unknown.length===0,'unsupported geometry cannot qualify');
 const region=bounds(evidence.bounds);need(inspection.triangles.every(t=>t.positions.every(p=>p.every((n,i)=>n>=region.min[i]&&n<=region.max[i]))),'finite geometry enclosed by reviewed tile');
 fields(evidence.controls,['units','basis','points']);need(evidence.controls.units==='metres'&&Array.isArray(evidence.controls.points)&&evidence.controls.points.length>=4&&evidence.controls.points.length<=16&&evidence.controls.basis===(reviewPolicy.authority==='original-reference-fixture'?'independent-CodeWalker-original-reference':'independently-reviewed-native-controls'),'independent 3D coordinate controls required');
 const collision=decoded.resources.find(r=>r.kind==='ybn'),matrix=decoded.selection.collisionFrame==='world'?identity:entityMatrix(inspection.entity),points=[],keys=new Set();
 for(const c of evidence.controls.points){fields(c,['node','vertex','world','tolerance']);need(typeof c.node==='string'&&Number.isSafeInteger(c.vertex)&&c.vertex>=0&&Array.isArray(c.world)&&c.world.length===3&&c.world.every(Number.isFinite)&&Number.isFinite(c.tolerance)&&c.tolerance>0&&c.tolerance<=.01&&!keys.has(c.node+':'+c.vertex),'unique bounded measured control');keys.add(c.node+':'+c.vertex);const node=collision.normalized.data.nodes.find(n=>n.id===c.node);need(node&&c.vertex<node.vertices.length,'control references exact collision vertex');
 const chain=[];for(let at=node;at;at=at.parent===null?null:collision.normalized.data.nodes.find(n=>n.id===at.parent))chain.push(at.transform);
 let actual=node.vertices[c.vertex].map((v,i)=>v+node.center[i]);for(const m of chain)actual=transformPoint(actual,m);actual=transformPoint(actual,matrix);
 need(actual.every((v,i)=>Math.abs(v-c.world[i])<=c.tolerance),'independent coordinate control mismatch');points.push(c.world);}
 need(nonCoplanar(points),'controls must span three dimensions');
 need(evidence.activation?.staticOnly===true&&evidence.activation.runtimeVerified===false,'offline static activation only; no runtime authority');
 need(evidence.materialTable&&inspection.triangles.every(t=>evidence.materialTable[t.materialType]?.basis==='authored-assumption'),'explicit acoustic material assumptions, never native-ID inference');
 const core={schema:1,kind:'RichAudioXmlAdmissionWitness05',authority:reviewPolicy.authority,purpose:reviewPolicy.purpose,policySHA256:reviewPolicy.policySHA256,evidenceSHA256:reviewPolicy.evidenceSHA256,decoderSHA256:reviewPolicy.decoderSHA256,reviewReceiptSHA256:reviewPolicy.reviewReceiptSHA256,selection:decoded.selection,resources:decoded.resources.map(r=>({id:r.id,kind:r.kind,logicalArchive:r.logicalArchive,logicalMember:r.logicalMember,xmlSHA256:r.xmlSHA256,xmlBytes:r.bytes,rawSourceSHA256:r.sourceSHA256,decodedSHA256:digest(r.normalized)})),buildingId:evidence.buildingId,tileId:evidence.tileId,build:evidence.build,layout:evidence.layout,bounds:region,materialTable:evidence.materialTable,mounts:evidence.mounts,resourceMounts:evidence.resourceMounts,activation:evidence.activation,controls:evidence.controls,receipts:Object.fromEntries(receiptKeys.map(k=>[k,evidence[k]])),genuineResourceVerified:false,installedWorldVerified:false,runtimeActivationVerified:false};
 const witness=freeze({...core,qualificationDigest:digest(core)}),token=Object.freeze({kind:'BrandedXmlAdmission05'});admissions.set(token,witness);return token;
}
export function verifyXmlAdmission05(value){need(admissions.has(value),'branded XML admission required');return admissions.get(value);}
// Used only after parent admission and joined-worker plan binding. This verifies
// serialized identity/integrity, not the historical truth of a review or origin.
export function validateXmlWitness05(witness){
 boundedXmlMetadata05(witness);
 fields(witness,['schema','kind','authority','purpose','policySHA256','evidenceSHA256','decoderSHA256','reviewReceiptSHA256','selection','resources','buildingId','tileId','build','layout','bounds','materialTable','mounts','resourceMounts','activation','controls','receipts','genuineResourceVerified','installedWorldVerified','runtimeActivationVerified','qualificationDigest']);
 need(witness?.kind==='RichAudioXmlAdmissionWitness05'&&witness.schema===1&&['original-reference-fixture','review-policy-bound-static-export'].includes(witness.authority)&&witness.purpose==='offline-static-comparison-only'&&witness.installedWorldVerified===false&&witness.genuineResourceVerified===false&&witness.runtimeActivationVerified===false,'bounded offline XML witness, no installation authority');
 const {qualificationDigest,...core}=witness;need(hex(qualificationDigest)&&digest(core)===qualificationDigest&&Array.isArray(witness.resources)&&witness.resources.length===3&&witness.resources.every(r=>hex(r.xmlSHA256)&&hex(r.decodedSHA256)&&r.xmlBytes>0&&r.xmlBytes<=16777216),'XML witness identity integrity');
 const grant=freeze(structuredClone(witness));grants.add(grant);return grant;
}
export const isXmlGrant05=value=>grants.has(value);
export function rebindCachedXmlAdmission05({witness,reviewPolicy,expectedQualificationDigest}={}){
 need(policies.has(reviewPolicy),'independently pinned cached XML review policy');const w=validateXmlWitness05(witness);
 need(hex(expectedQualificationDigest)&&w.qualificationDigest===expectedQualificationDigest&&w.policySHA256===reviewPolicy.policySHA256&&w.evidenceSHA256===reviewPolicy.evidenceSHA256&&w.decoderSHA256===reviewPolicy.decoderSHA256&&w.authority===reviewPolicy.authority&&w.reviewReceiptSHA256===reviewPolicy.reviewReceiptSHA256,'cached XML admission exact expected policy/evidence identity');
 need(w.resources.every(r=>reviewPolicy.resources.some(p=>p.id===r.id&&p.xmlSHA256===r.xmlSHA256&&p.decodedSHA256===r.decodedSHA256))&&receiptKeys.every(k=>w.receipts[k]===reviewPolicy[k]),'cached XML admission reviewed source/receipt closure');
 const token=Object.freeze({kind:'BrandedXmlAdmission05'});admissions.set(token,w);return token;
}
