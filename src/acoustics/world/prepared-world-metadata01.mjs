// Only snapshots received on the owned preparer's channel acquire authority.
import {createHash} from 'node:crypto';
import {digest} from './contracts.mjs';
const prepared=new WeakSet();
export const isPreparedWorldMetadata01=value=>prepared.has(value);
export function createMetadataStage01(){
 const nodes=[],sealed=new Set(),hash=createHash('sha256');let totalBytes=0,operations=0;
 return {accept(packet){
  const text=JSON.stringify(packet),bytes=Buffer.byteLength(text);if(bytes>32768||!Array.isArray(packet)||packet.length>256||(totalBytes+=bytes)>268435456)throw Error('Bounded metadata staging packet');hash.update(text);
  for(const op of packet){if(++operations>4000000)throw Error('Bounded metadata staging operations');const [kind,id,key,value]=op;
   if(kind==='node'){if(id!==nodes.length||!['array','object'].includes(key))throw Error('Ordered metadata node');nodes.push(key==='array'?[]:Object.create(null));}
   else if(kind==='set'){if(!nodes[id]||sealed.has(id)||typeof key!=='string')throw Error('Mutable staging node required');const v=value&&typeof value==='object'?nodes[value.ref]:value;if(value&&typeof value==='object'&&!v)throw Error('Prior metadata reference required');Object.defineProperty(nodes[id],key,{value:v,enumerable:true,writable:true,configurable:true});}
   else if(kind==='seal'){if(!nodes[id]||sealed.has(id))throw Error('One metadata seal');Object.freeze(nodes[id]);sealed.add(id);}
   else throw Error('Metadata operation');
  }
 },finish(expected){if(!nodes.length||sealed.size!==nodes.length||hash.digest('hex')!==expected)throw Error('Complete immutable metadata graph and digest required');prepared.add(nodes[0]);return nodes[0];},stats(){return {bytes:totalBytes,nodes:nodes.length,operations};}};
}
export function* metadataOperations01(root){
 const seen=new WeakMap();let serial=0;
 function* visit(value,depth=0){if(depth>64)throw Error('Metadata depth bound');const id=serial++;seen.set(value,id);yield ['node',id,Array.isArray(value)?'array':'object'];
  for(const [key,child]of Object.entries(value)){let encoded=child;if(child&&typeof child==='object'){if(!seen.has(child))yield* visit(child,depth+1);encoded={ref:seen.get(child)};}if(typeof encoded==='string'&&Buffer.byteLength(encoded)>16384)throw Error('Metadata scalar bound');yield ['set',id,key,encoded];}yield ['seal',id];
 }yield* visit(root);
}

export const sceneAuthorityBinding01=manifest=>digest([
 manifest.ResolvedCatalogSHA256,manifest.ValidationEpochUtc01??null,manifest.InputFingerprint,manifest.InputBinding,
]);
export const sceneRowAuthority01=row=>digest([row.Id,row.Hash,row.Status,row.Eligibility,row.Result??null,row.ArchiveValidation01??null]);
export function sceneAuthorityView01(manifest){
 return {
  binding:sceneAuthorityBinding01(manifest),
  rows:manifest.Resources.filter(row=>row.Status==='imported-exterior-incomplete-surfaces')
   .map(row=>[row.Id,sceneRowAuthority01(row)]),
 };
}
