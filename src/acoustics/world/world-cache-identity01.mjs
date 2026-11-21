// Cache derivation identity, separate from control-worker/source diagnostics.
// Geometry changes invalidate geometry; unrelated catalogue/control changes do
// not discard every already converted resource.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './collision-mesh.mjs';
import {collisionProjection} from './static-world-resource.mjs';
import {canonical} from './contracts.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
// These own the base triangle/box transforms and binary format. An optional
// analytic index extension or orchestration change does not alter old chunks.
const decoderSources=['src/acoustics/world/CodeWalkerCollisionAdapter.cs','src/acoustics/world/collision-mesh.mjs','src/acoustics/world/placements.mjs'];
let decoderIdentity=null;
export function worldGeometryDecoderSHA25601(){
 if(decoderIdentity===null){const bindings=decoderSources.map(p=>[p,sha256(fs.readFileSync(path.join(root,p)))]);decoderIdentity=sha256(Buffer.from(JSON.stringify(bindings)));}return decoderIdentity;
}
export const legacyStreet01WriterSHA256='8f6940095fb6a62a6ef02e5d61b93a021ed931471620158ec5625f6c0fdcdebe';
const legacyDecoderSHA256='7a2e724867e0fc7f5ae3a51a63013736b08b7c1057dfcdcd44d37e527b7510bc',baseDecoderSHA256='e518f81ac19ae5120fa472b880a6575aa783c573ba0709e257437073ed7f7d41';
export function resourceDependencyFingerprint01(catalog,resource,decoderSHA256=worldGeometryDecoderSHA25601()){
 const p=collisionProjection(catalog,String(resource.Hash).toLowerCase());
 return sha256(Buffer.from(canonical({revision:'installed-collision-resource-dependencies01',decoderSHA256,game:catalog.InputBinding.GameExecutableSHA256,parser:catalog.InputBinding.CodeWalkerCoreSHA256,gen9Selector:catalog.Gen9SelectorAvailable,member:{hash:resource.Hash,path:resource.Path},projection:p?{complete:catalog.CollisionPlacementIndex?.IndexComplete??true,schemaGaps:p.ProjectionSchemaGaps,interior:p.InteriorBoundsMembership,conditional:p.MapGroupMembership,bounds:p.BoundsStoreItems,selected:p.SelectedYbn}:null})));
}
export function compatiblePriorDecoderResource01(previous,catalog,resource,row){return previous?.InputBinding?.GeometryDecoderSHA256===legacyDecoderSHA256&&worldGeometryDecoderSHA25601()===baseDecoderSHA256&&row?.DependencyFingerprint===resourceDependencyFingerprint01(catalog,resource,legacyDecoderSHA256);}
export function compatibleLegacyStreet01Plan(previous,catalog,decoderSHA256=worldGeometryDecoderSHA25601()){
 const b=previous?.InputBinding;if(!b||b.ImporterSourceSHA256!==legacyStreet01WriterSHA256||decoderSHA256!==baseDecoderSHA256||previous.Algorithm!=='installed-exterior-collision-warmup-v1'||b.GameExecutableSHA256!==catalog.InputBinding.GameExecutableSHA256||b.CodeWalkerCoreSHA256!==catalog.InputBinding.CodeWalkerCoreSHA256||b.Gen9SelectorAvailable!==catalog.Gen9SelectorAvailable||b.ModsFolderResolutionEnabled!==catalog.ModsFolderResolutionEnabled)return false;
 const selected=catalog.Resources.filter(r=>r.Kind==='ybn').map(r=>({Hash:r.Hash,Path:r.Path}));
 // Only the retained, known writer with the exact unchanged catalogue closure
 // migrates once. Unknown older writers still require a new conversion.
 return sha256(Buffer.from(canonical({inputBinding:b,selected,placements:catalog.CollisionPlacementIndex??catalog.TargetCollisionEvidence})))===previous.InputFingerprint;
}
