// Admission of a separately reviewed genuine native batch. Review pins are
// control inputs; a decoder result cannot create its own acoustic authority.
import {byteDigest,digest,canonical,decodeCanonical,fields,freeze,requireWorld,bounds,identifier} from './contracts.mjs';
import {boundedXmlMetadata05} from './xml-evidence05.mjs';
const reviews=new WeakSet(),admissions=new WeakMap(),grants=new WeakSet(),decodedObjects=new WeakMap(),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function stableBody(w){const {qualificationDigest,sourceScopeSHA256,sourceReceiptSHA256,...body}=w;return {...body,kind:'RichAudioNativeConversion08'};}
export function nativeQualificationDigest08(w){boundedXmlMetadata05(w,131072);return digest(stableBody(w));}
export function nativeConversionWitness08(w){const value=validateNativeWitness08(w);return validateNativeWitness08({...stableBody(value),qualificationDigest:value.qualificationDigest});}
export function pinNativeReview08(bytes,{expectedSHA256}={}){
 requireWorld(Buffer.isBuffer(bytes)&&bytes.length<=16384&&hex(expectedSHA256)&&byteDigest(bytes)===expectedSHA256,'independently pinned native review');
 const p=decodeCanonical(bytes,16384);fields(p,['schema','kind','purpose','witnessSHA256','reviewReceiptSHA256']);
 requireWorld(p.schema===1&&p.kind==='RichAudioNativeReview08'&&p.purpose==='offline-static-cache-only'&&hex(p.witnessSHA256)&&hex(p.reviewReceiptSHA256),'native review purpose and identities');
 const result=freeze({...p,policySHA256:expectedSHA256});reviews.add(result);return result;
}
export function validateNativeWitness08(w){
 boundedXmlMetadata05(w,131072);
 fields(w,['schema','kind','tileId','build','bounds','layout','parserSHA256','resources','mounts','bindings','materialTable','collisionFrame','sourceScopeSHA256','sourceReceiptSHA256','coordinateReceiptSHA256','associationReceiptSHA256','activation','qualificationDigest']);
 const execution=w.kind==='RichAudioNativeWitness08';requireWorld(w.schema===1&&(execution||w.kind==='RichAudioNativeConversion08')&&w.layout==='gen9'&&w.activation==='static-runtime-unverified'&&['world','archetype-local'].includes(w.collisionFrame),'reviewed static native scope; runtime unverified');
 identifier(w.tileId);identifier(w.build);bounds(w.bounds);
 requireWorld([w.parserSHA256,w.coordinateReceiptSHA256,w.associationReceiptSHA256,w.qualificationDigest].every(hex)&&(execution?hex(w.sourceScopeSHA256)&&hex(w.sourceReceiptSHA256):w.sourceScopeSHA256===undefined&&w.sourceReceiptSHA256===undefined),'native source/control receipt identities');
 requireWorld(nativeQualificationDigest08(w)===w.qualificationDigest,'native witness integrity');
 requireWorld(Array.isArray(w.resources)&&w.resources.length>=3&&w.resources.length<=32&&new Set(w.resources.map(r=>r.id)).size===w.resources.length,'bounded native resource closure');
 for(const r of w.resources){fields(r,['id','path','kind','mount','sha256','bytes','decodedSHA256']);identifier(r.id);identifier(r.mount);requireWorld(['ymap','ytyp','ybn'].includes(r.kind)&&typeof r.path==='string'&&r.path.length<=160&&!r.path.includes(':')&&!r.path.includes('\\')&&r.path.split('/').every(p=>/^[A-Za-z0-9_.-]+$/.test(p)&&p!=='.'&&p!=='..')&&r.path.endsWith('.'+r.kind)&&hex(r.sha256)&&hex(r.decodedSHA256)&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=16777216,'native resource and decoded content identity');}
 requireWorld(['ymap','ytyp','ybn'].every(k=>w.resources.some(r=>r.kind===k))&&Array.isArray(w.bindings)&&w.bindings.length>0&&w.bindings.length<=128&&Array.isArray(w.mounts)&&w.mounts.length>0&&w.mounts.length<=16&&w.materialTable&&typeof w.materialTable==='object','native association/mount/material controls');
 const names=new Set();for(const b of w.bindings){fields(b,['archetypeHash','resourceId','basis','physicsDictionary','sourceSHA256','collisionFrame']);requireWorld(Number.isSafeInteger(b.archetypeHash)&&b.archetypeHash>=0&&b.archetypeHash<=0xffffffff&&!names.has(b.archetypeHash)&&Number.isSafeInteger(b.physicsDictionary)&&b.physicsDictionary>=0&&b.physicsDictionary<=0xffffffff&&w.resources.some(r=>r.id===b.resourceId&&r.kind==='ybn')&&b.basis==='reviewed-native-association08'&&b.sourceSHA256===w.associationReceiptSHA256&&b.collisionFrame===w.collisionFrame,'consistent typed native collision ownership/frame');names.add(b.archetypeHash);}
 return freeze(structuredClone(w));
}
export function admitNativeBatch08({witness,reviewPolicy}={}){
 requireWorld(reviews.has(reviewPolicy),'separate branded native review required');
 const w=validateNativeWitness08(witness);requireWorld(w.kind==='RichAudioNativeWitness08','separate native execution attestation required');const conversion=nativeConversionWitness08(w);requireWorld(byteDigest(Buffer.from(canonical(conversion)))===reviewPolicy.witnessSHA256,'exact externally reviewed stable native conversion');
 grants.add(conversion);const token=Object.freeze({kind:'RichAudioNativeAdmission08'});admissions.set(token,{witness:w,conversion,reviewPolicy});return token;
}
export function verifyNativeAdmission08(token){requireWorld(admissions.has(token),'branded native admission required');return admissions.get(token).witness;}
export function nativeGrantForAdmission08(token){requireWorld(admissions.has(token),'branded native scene admission');return admissions.get(token).conversion;}
export function nativeAdmissionControl08(token){requireWorld(admissions.has(token),'branded native admission control');const data=admissions.get(token),{policySHA256,...policy}=data.reviewPolicy;return freeze({policy,expectedPolicySHA256:policySHA256,executionWitness:data.witness});}
// Used on the dedicated cache worker's parent-supplied control envelope, not a
// field discovered in an RPF/resource or in a serialized manifest itself.
export function rebindNativeAdmission08({witness,control}={}){requireWorld(control&&hex(control.expectedPolicySHA256)&&canonical(nativeConversionWitness08(control.executionWitness))===canonical(witness),'separate native worker control pin and exact stable conversion');const policy=pinNativeReview08(Buffer.from(canonical(control.policy)),{expectedSHA256:control.expectedPolicySHA256});return admitNativeBatch08({witness:control.executionWitness,reviewPolicy:policy});}
export const isNativeGrant08=value=>grants.has(value);
export function parseAdmittedNativeResource08(decodedJson,{resourceId,sourceSHA256,grant}={}){
 requireWorld(grants.has(grant)&&typeof decodedJson==='string'&&Buffer.byteLength(decodedJson)<=16777216,'branded native grant and bounded reviewed decoder bytes');
 const resource=grant.resources.find(r=>r.id===resourceId);requireWorld(resource&&resource.sha256===sourceSHA256&&resource.decodedSHA256===byteDigest(Buffer.from(decodedJson)),'exact reviewed native decoder JSON');
 const value=JSON.parse(decodedJson,(key,data)=>{requireWorld(!['__proto__','prototype','constructor'].includes(key),'unsafe native decoder key');return data;});
 requireWorld(value?.kind==='CodeWalkerExplicitStaticResource02'&&value.resourceKind===resource.kind&&value.sourceSHA256===resource.sha256&&value.sourceAuthority==='separately-authorized-explicit-resource','reviewed native decoded source identity');
 freeze(value);decodedObjects.set(value,{qualificationDigest:grant.qualificationDigest,resourceId,sourceSHA256});return value;
}
export function isAdmittedNativeResource08(value,{grant,resourceId,sourceSHA256}={}){const binding=decodedObjects.get(value);return grants.has(grant)&&binding?.qualificationDigest===grant.qualificationDigest&&binding.resourceId===resourceId&&binding.sourceSHA256===sourceSHA256;}
