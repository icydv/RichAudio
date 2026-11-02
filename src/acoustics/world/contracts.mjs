// AW01 original authored-fixture contract. This is not a GTA binary decoder.
import {createHash} from 'node:crypto';
export const staticWorldLimits=Object.freeze({resources:128,resourceBytes:262144,totalResourceBytes:4194304,archetypes:128,entities:512,panels:64,tiles:64,tileBytes:262144,resident:8,queuedTiles:16});
export const staticWorldSchema='richaudio-authored-static-json-v1';
export const staticCoordinates='authored-local-metres-v1';
// Bump for decoder, placement-transform or finite-surface validation semantics.
export const staticWorldConverterRevision='authored-panel-transform-v1';
export function requireWorld(ok,reason){if(!ok)throw Error(reason);}
export function identifier(s){requireWorld(typeof s==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(s),'bounded static-world identifier');return s;}
export function vector(v){requireWorld(Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000),'finite static-world vector');return [...v];}
export function bounds(b){const min=vector(b?.min),max=vector(b?.max);requireWorld(min.every((n,i)=>max[i]>n&&max[i]-n<=128),'finite static-world bounds <=128 metres');return {min,max};}
export function canonical(x){if(x===null||typeof x!=='object'){requireWorld(x!==undefined&&!(typeof x==='number'&&!Number.isFinite(x)),'canonical finite JSON');return JSON.stringify(x);}if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';}
export const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
export const byteDigest=b=>createHash('sha256').update(b).digest('hex');
export function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
export function fields(x,allowed){requireWorld(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>allowed.includes(k)),'unsupported static-world fields');}
export function decodeCanonical(bytes,maximumBytes){requireWorld(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=maximumBytes,'bounded static-world bytes');const text=bytes.toString('utf8');requireWorld(Buffer.from(text).equals(bytes),'static-world UTF8');let depth=0,inString=false,escaped=false;for(const c of text){if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;}else if(c==='"')inString=true;else if(c==='{'||c==='[')requireWorld(++depth<=16,'static-world nesting bound');else if(c==='}'||c===']')depth--;}
 requireWorld(depth===0&&!inString,'truncated static-world JSON');const value=JSON.parse(text,(k,v)=>{requireWorld(!['__proto__','prototype','constructor'].includes(k),'unsafe static-world key');return v;});requireWorld(canonical(value)===text,'canonical static-world JSON required; duplicate keys/alternate encodings refused');return value;}
export const intersects=(a,b)=>a.min.every((n,i)=>a.max[i]>=b.min[i]&&n<=b.max[i]);
