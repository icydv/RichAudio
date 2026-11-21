// Metadata declarations only. This API has no path opener, crypto decoder,
// loader or private-capability adapter. A declaration never grants authority.
import {decodeCanonical,canonical,fields,freeze,requireWorld,byteDigest} from './contracts.mjs';
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0&&value.length<=160&&!/[\u0000-\u001f]/.test(value);
const shapes=Object.freeze({selectedExpandedSchedule:272,decryptionTables:278528,filenameLookup:256});
export const ngReadinessLimits042=Object.freeze({descriptorBytes:16384,selectedMaterialBytes:279056,ciphertextBytes:46128,metadataFirstAggregateBytes:24576,decodeProposalAggregateBytes:362048});
export function encodeNgCapabilityMetadata042(value){const data=Buffer.from(canonical(value));requireWorld(data.length<=16384,'NG capability metadata byte limit');return data;}
export function inspectNgCapabilityMetadata042(bytes,{expectedSHA256}={}){
  requireWorld(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=16384&&hex(expectedSHA256)&&byteDigest(bytes)===expectedSHA256,'exact independently supplied metadata byte identity');
  const value=decodeCanonical(bytes,16384);
  fields(value,['schema','kind','provider','targetEdition','algorithm','acquisition','permission','archive','materialDeclarations']);
  requireWorld(value.schema===1&&value.kind==='RichAudioNgCapabilityMetadata042'&&text(value.provider)&&['enhanced','legacy','unknown'].includes(value.targetEdition)&&value.algorithm==='RPF7-NG','explicit bounded NG capability metadata');
  requireWorld(['existing-user-supplied-capability','original-authored-fixture','not-established','game-executable-scan','embedded-key-data-loader'].includes(value.acquisition),'declared acquisition method required');
  fields(value.permission,['declaredUse','provenanceReceiptSHA256','redistribution']);
  requireWorld(['private-local-metadata-decoding','not-established'].includes(value.permission.declaredUse)&&(value.permission.provenanceReceiptSHA256===null||hex(value.permission.provenanceReceiptSHA256))&&['not-permitted','not-established'].includes(value.permission.redistribution),'private provenance/use declarations only; no redistribution grant');
  fields(value.archive,['fileNameCaseSensitive','wholeFileBytes','captureReceiptSHA256']);
  requireWorld((value.archive.fileNameCaseSensitive===null||typeof value.archive.fileNameCaseSensitive==='string'&&/^[A-Za-z0-9_.+-]{1,128}$/.test(value.archive.fileNameCaseSensitive))&&(value.archive.wholeFileBytes===null||Number.isSafeInteger(value.archive.wholeFileBytes)&&value.archive.wholeFileBytes>=16)&&(value.archive.captureReceiptSHA256===null||hex(value.archive.captureReceiptSHA256)),'bound archive declarations, not a source read');
  fields(value.materialDeclarations,Object.keys(shapes));requireWorld(Object.keys(value.materialDeclarations).length===3,'all three NG material declarations required');
  const missing=[];
  for(const [name,size]of Object.entries(shapes)){
    const declared=value.materialDeclarations[name];fields(declared,['referenceId','bytes','sha256','selectedKeyIndex']);
    requireWorld((declared.referenceId===null||typeof declared.referenceId==='string'&&/^[A-Za-z0-9_.-]{1,80}$/.test(declared.referenceId))&&(declared.bytes===null||declared.bytes===size)&&(declared.sha256===null||hex(declared.sha256)),'selected-only exact material metadata shape; raw data and host paths are excluded');
    requireWorld(name==='selectedExpandedSchedule'?declared.selectedKeyIndex===null||Number.isInteger(declared.selectedKeyIndex)&&declared.selectedKeyIndex>=0&&declared.selectedKeyIndex<101:declared.selectedKeyIndex===null,'selected schedule index declaration only');
    if(declared.referenceId===null||declared.bytes===null||declared.sha256===null||name==='selectedExpandedSchedule'&&declared.selectedKeyIndex===null)missing.push(name+'-identity-not-established');
  }
  if(value.targetEdition!=='enhanced')missing.push('Enhanced-provenance-not-established');
  if(value.acquisition!=='existing-user-supplied-capability')missing.push('permitted-existing-capability-not-established');
  if(value.permission.declaredUse!=='private-local-metadata-decoding'||value.permission.provenanceReceiptSHA256===null)missing.push('permission-provenance-not-established');
  if(Object.values(value.archive).some(v=>v===null))missing.push('capture-archive-identity-not-established');
  missing.push('independent-private-input-review-and-explicit-approval','real-material-adapter-and-runtime-containment-qualification');
  return freeze({schema:1,kind:'RichAudioNgMetadataReadiness042',state:'unqualified-metadata-declarations-only',metadataSHA256:expectedSHA256,targetEdition:value.targetEdition,providerDeclarationPresent:true,
    declaredMaterialBytes:Object.entries(shapes).reduce((sum,[key])=>sum+(value.materialDeclarations[key].bytes??0),0),requiredSelectedMaterialBytes:279056,
    missingEvidence:missing,canExecute:false,referencedPathsOpened:0,ciphertextReads:0,keyMaterialReads:0,keyLoadersRun:0,realCapabilityQualified:false,installedWorldVerified:false});
}
