// Entire DECLARED original world, not an inventory of an installed game. Each
// page is bounded independently and each tile is geographically separated.
import {deflateRawSync} from 'node:zlib';
import {worldResources04} from './WorldResources04.mjs';
import {qualifyResourceInventory04} from '../../src/acoustics/world/resource-inventory04.mjs';
import {byteDigest,digest} from '../../src/acoustics/world/contracts.mjs';
export const startupSession06='6'.repeat(32);

function revisedCollision(f,id,revision){
 const resource=f.inventory.resources.find(r=>r.id===id),packet=f.inputs.decodedResources[id],head=Buffer.from(f.inputs.resourceBytes[id].subarray(0,16)),payload=Buffer.alloc(512);
 payload.write('original startup06 collision revision '+revision);const bytes=Buffer.concat([head,deflateRawSync(payload)]),sha256=byteDigest(bytes),normalized=JSON.parse(packet.decodedJson);
 normalized.sourceSHA256=sha256;normalized.bytes=bytes.length;normalized.data.source.sha256=sha256;
 if(revision==='wide')normalized.data.nodes[0].vertices[0][0]=-1.5;
 const decodedJson=JSON.stringify(normalized);Object.assign(resource,{sha256,bytes:bytes.length});f.inputs.resourceBytes[id]=bytes;
 f.inputs.decodedResources[id]={...packet,sourceSHA256:sha256,bytes:bytes.length,decodedJson,decodedSHA256:byteDigest(Buffer.from(decodedJson))};
}

export function startupWorld06({changedYbn=false,dlc=false,customOverride=false,unsupported=false,missingYtyp=false,incompleteDiscovery=false}={}){
 const pages=[],locations=[];const count=dlc?13:12;
 for(let pageNumber=0;pageNumber<Math.ceil(count/4);pageNumber++){
  const f=worldResources04(),materialTable=f.inventory.tiles[0].materialTable;f.inventory.resources=[];f.inventory.tiles=[];f.inputs.resourceBytes={};f.inputs.decodedResources={};f.inventory.build='original-declared-world06';
  for(let n=pageNumber*4;n<Math.min(count,(pageNumber+1)*4);n++){
   const tileId='declared-'+String(n).padStart(2,'0'),x=n*100,mount=n===12?'dlc':'base',names=f.group(tileId,x,mount),bounds={min:[x-8,-8,-4],max:[x+8,12,8]};
   const tile={tileId,bounds,bindings:[{archetypeHash:123456789,resourceId:names.ybn,basis:'authored-fixture'}],materialTable};
   f.inventory.tiles.push(tile);locations.push({pageId:'page-'+pageNumber,tileId,x,listener:[x+.4,2,.6],source:[x-.4,2,.6]});
   if(n===0&&changedYbn)revisedCollision(f,names.ybn,'wide');
   if(n===1&&customOverride){
    const old=f.inventory.resources.find(r=>r.id===names.ybn),id=names.ybn+'-custom';f.inventory.resources.push({...structuredClone(old),id,mount:'custom'});
    f.inputs.resourceBytes[id]=Buffer.from(f.inputs.resourceBytes[names.ybn]);f.inputs.decodedResources[id]=structuredClone(f.inputs.decodedResources[names.ybn]);revisedCollision(f,id,'custom');tile.bindings[0].resourceId=id;
   }
   if(n===2&&unsupported)f.inventory.resources.find(r=>r.id===names.ybn).supported=false;
   if(n===3&&missingYtyp){f.inventory.resources=f.inventory.resources.filter(r=>r.id!==names.ytyp);delete f.inputs.resourceBytes[names.ytyp];delete f.inputs.decodedResources[names.ytyp];}
  }
  pages.push({pageId:'page-'+pageNumber,inventory:qualifyResourceInventory04(f.inventory),inputs:f.inputs,inventoryInput:f.inventory});
 }
 const unknownRegions=incompleteDiscovery?[{id:'undiscovered-sector',bounds:{min:[1300,-8,-4],max:[1316,12,8]},reason:'catalogue-discovery-incomplete'}]:[];
 return {catalogueId:'original-declared-world06',pages,locations,session:startupSession06,discovery:{sealed:!incompleteDiscovery,totalKnown:!incompleteDiscovery,basis:'explicit-qualified-inventory-pages',unknownRegions},
  basis:'complete-declared-original-fixture-only',actualWorldCoverage:'unmeasured',installedWorldVerified:false,
  pageProvider:async pageId=>{const p=pages.find(p=>p.pageId===pageId);if(!p)throw Error('Unknown declared page');return {inventory:p.inventory,inputs:p.inputs};},
  identity:digest(pages.map(p=>({pageId:p.pageId,inventoryDigest:p.inventory.inventoryDigest})))};
}
