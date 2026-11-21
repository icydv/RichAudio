// Opt-in control-side wiring of the existing inventory/cache/scene workers.
// No XML acquisition, game discovery, audio endpoint or authority from a label.
import {verifyXmlAdmission05} from './xml-evidence05.mjs';
import {qualifyResourceInventory04,xmlBindings05} from './resource-inventory04.mjs';
import {ResourceTileBuilder04} from './cache-builder04.mjs';
import {ScenePreparation03} from './scene-preparation03.mjs';
import {codeWalkerSource03} from './resource-import03.mjs';
import {requireWorld,freeze} from './contracts.mjs';
export function xmlInventory05(admissions){
 const tokens=Array.isArray(admissions)?admissions:[admissions];requireWorld(tokens.length>0&&tokens.length<=8,'bounded admitted XML tile set');
 const witnesses=tokens.map(verifyXmlAdmission05),first=witnesses[0];
 requireWorld(witnesses.every(w=>w.build===first.build&&w.layout===first.layout&&w.authority===first.authority&&w.decoderSHA256===first.decoderSHA256),'one XML build/layout/review authority');
 const mounts=new Map();for(const w of witnesses)for(const m of w.mounts){const old=mounts.get(m.id);requireWorld(!old||JSON.stringify(old)===JSON.stringify(m),'consistent declared XML mounts');mounts.set(m.id,m);}
 const input={schema:1,kind:'RichAudioResourceInventory04',inputFormat:'codewalker-xml05',origin:first.authority==='original-reference-fixture'?'original-authored-fixture':'separately-authorized-static-export',build:first.build,layout:first.layout,parser:{sourceCommit:codeWalkerSource03,sha256:first.decoderSHA256},mountPolicy:'explicit-reviewed-order-v1',precedenceEvidence:first.receipts.precedenceReceiptSHA256,mounts:[...mounts.values()],resources:witnesses.flatMap(w=>w.resources.map(r=>({id:r.id,path:r.logicalMember,kind:r.kind,mount:w.resourceMounts[r.id],sha256:r.xmlSHA256,bytes:r.xmlBytes,deleted:false,supported:true,scopeTiles:[w.tileId],dependencies:r.kind==='ymap'?w.resources.filter(d=>d.kind!=='ymap').map(d=>d.logicalMember):[]}))),tiles:witnesses.map(w=>({tileId:w.tileId,bounds:w.bounds,bindings:xmlBindings05(w),materialTable:w.materialTable}))};
 return qualifyResourceInventory04(input,{xmlAdmission05:tokens});
}
export async function prepareXmlBuildingPipeline05({admissions,inputs={resourceBytes:{},decodedResources:{}},session,store=null,trustedArtifacts={},listenerAnchor,signal,engine}={}){
 const inventory=xmlInventory05(admissions),builder=new ResourceTileBuilder04({inventory,inputs,store,trustedArtifacts,session});
 const preparation=new ScenePreparation03({session,worldDigest:inventory.inventoryDigest});let completion=null;
 const close=()=>completion??=(async()=>{const results=await Promise.allSettled([()=>builder.close(),()=>preparation.close()].map(fn=>Promise.resolve().then(fn)));const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);if(errors.length)throw new AggregateError(errors,'XML pipeline cleanup failed');})();
 try{
  const anchor=listenerAnchor??inventory.tilePlans[0].bounds.min.map((v,i)=>(v+inventory.tilePlans[0].bounds.max[i])/2);
  const built=await builder.prepareNearby({listenerAnchor:anchor,maximumTiles:8,radius:256,budgetMilliseconds:5000,signal});
  requireWorld(built.state==='prepared'&&builder.resident.size===inventory.tilePlans.length,'complete explicitly admitted XML preparation');
  const result=await preparation.prepare({contexts:builder.contexts(engine===undefined?{}:{engine}),listenerAnchor:anchor,budgetMilliseconds:5000,signal});
  requireWorld(result.state==='prepared'&&result.workerJoined,'joined XML scene preparation');
  return {kind:'RichAudioXmlBuildingPipeline05',inventory,builder,preparation,scene:result.prepared.scene,prepared:result.prepared,artifactBindings:builder.artifactBindings(),close,
   qualification:freeze({scope:'offline-static-comparison-only',authority:verifyXmlAdmission05((Array.isArray(admissions)?admissions:[admissions])[0]).authority,installedWorldVerified:false,genuineResourceVerified:false,runtimeActivationVerified:false,pcmQueueFramesAdded:0,sourceGenerationsModified:0})};
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'XML preparation and cleanup failed');}throw error;}
}
