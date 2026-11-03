// Trusted test-control construction for exact ORIGINAL, versioned CodeWalker
// XML fixtures. No user resource/export can be passed to this fixture helper.
import {readFileSync} from 'node:fs';
import {decodeCodeWalkerXmlBuilding05} from '../../src/acoustics/world/codewalker-xml05.mjs';
import {pinXmlReviewPolicy05,admitXmlBuilding05,verifyXmlAdmission05} from '../../src/acoustics/world/xml-evidence05.mjs';
import {xmlBindings05} from '../../src/acoustics/world/resource-inventory04.mjs';
import {xmlPacket05,codeWalkerSource03} from '../../src/acoustics/world/resource-import03.mjs';
import {canonical,byteDigest,digest} from '../../src/acoustics/world/contracts.mjs';
import {originalCodeWalkerXml05,originalXmlReference05} from './CodeWalkerXml05.mjs';
export function admittedOriginalXml05({group='gen9-corner',tileId='original-xml05-corner',authority='original-reference-fixture'}={}){
 if(!['gen9-corner','gen9-corner-east','gen9-corner-wide'].includes(group)||!/^original-xml05-[A-Za-z0-9_-]+$/.test(tileId)||!['original-reference-fixture','review-policy-bound-static-export'].includes(authority))throw Error('Exact original test-control fixture required');
 const request=originalCodeWalkerXml05(group);for(const r of request.resources){r.id=tileId+'-'+r.kind;request.selection[r.kind+'Id']=r.id;if(group==='gen9-corner-wide')r.logicalMember='gen9-corner/original.'+r.kind;}
 const decoded=decodeCodeWalkerXmlBuilding05(request),reference=originalXmlReference05.fixtureSets.find(r=>r.group===group);
 // Bind this building's exact independent reference subset, so adding another
 // unrelated original fixture does not poison all existing dependent plans.
 const decoderSHA256=byteDigest(readFileSync(new URL('../../src/acoustics/world/codewalker-xml05.mjs',import.meta.url))),referenceSHA256=digest({kind:'original-CodeWalker-reviewed-reference-subset05',parserSourceCommit:originalXmlReference05.parserSourceCommit,parserSHA256:originalXmlReference05.parserSHA256,reference});
 const receipts=Object.fromEntries(['provenanceReceiptSHA256','permissionReceiptSHA256','associationReceiptSHA256','coordinateReceiptSHA256','precedenceReceiptSHA256','activationReceiptSHA256'].map(key=>[key,digest({kind:'original-test-control-receipt05',authority,key,group,referenceSHA256})]));
 const materialTable={7:{reflection:[.64,.49,.25],transmission:[.04,.02,.01],basis:'authored-assumption',reference:'original-xml05-assumed-response'}},mounts=[{id:'original-base',family:'base',order:0,enabled:true}],resourceMounts=Object.fromEntries(decoded.resources.map(r=>[r.id,'original-base']));
 const shift=group==='gen9-corner-east'?40:0,region={min:[-12+shift,-12,-4],max:[12+shift,12,8]};
 const evidence={schema:1,kind:'RichAudioXmlBuildingEvidence05',buildingId:tileId,tileId,build:'original-xml05',layout:'gen9',bounds:region,selection:decoded.selection,resources:decoded.resources.map(r=>({id:r.id,kind:r.kind,logicalArchive:r.logicalArchive,logicalMember:r.logicalMember,xmlSHA256:r.xmlSHA256,xmlBytes:r.bytes,rawSourceSHA256:r.sourceSHA256})),controls:{units:'metres',basis:authority==='original-reference-fixture'?'independent-CodeWalker-original-reference':'independently-reviewed-native-controls',points:reference.world.samples.map(s=>({node:'n'+s.node,vertex:s.vertex,world:s.positionInWorld,tolerance:.0002}))},materialTable,mounts,resourceMounts,activation:{staticOnly:true,runtimeVerified:false},...receipts};
 const policyMetadata={schema:1,kind:'RichAudioXmlReviewPolicy05',authority,purpose:'offline-static-comparison-only',evidenceSHA256:digest(evidence),decoderSHA256,reviewReceiptSHA256:referenceSHA256,resources:decoded.resources.map(r=>({id:r.id,xmlSHA256:r.xmlSHA256,decodedSHA256:digest(r.normalized)})),...receipts};
 const policyBytes=Buffer.from(canonical(policyMetadata)),reviewPolicy=pinXmlReviewPolicy05(policyBytes,{expectedSHA256:byteDigest(policyBytes)}),admission=admitXmlBuilding05({decoded,evidence,reviewPolicy}),witness=verifyXmlAdmission05(admission);
 const inventoryInput={schema:1,kind:'RichAudioResourceInventory04',inputFormat:'codewalker-xml05',origin:authority==='original-reference-fixture'?'original-authored-fixture':'separately-authorized-static-export',build:evidence.build,layout:evidence.layout,parser:{sourceCommit:codeWalkerSource03,sha256:decoderSHA256},mountPolicy:'explicit-reviewed-order-v1',precedenceEvidence:evidence.precedenceReceiptSHA256,mounts,resources:decoded.resources.map(r=>({id:r.id,path:r.logicalMember,kind:r.kind,mount:resourceMounts[r.id],sha256:r.xmlSHA256,bytes:r.bytes,deleted:false,supported:true,scopeTiles:[tileId],dependencies:r.kind==='ymap'?decoded.resources.filter(d=>d.kind!=='ymap').map(d=>d.logicalMember):[]})),tiles:[{tileId,bounds:region,bindings:xmlBindings05(witness),materialTable}]};
 const inputs={resourceBytes:Object.fromEntries(request.resources.map(r=>[r.id,r.xml])),decodedResources:Object.fromEntries(decoded.resources.map(r=>[r.id,xmlPacket05(r,witness)]))};
 return {decoded,witness,admission,inventoryInput,inputs,session:'6'.repeat(32),evidence,policyMetadata,policyBytes,reviewPolicy,reference,sourceAuthority:'original-authored-fixture',realResourceEvidence:false};
}
