import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {encodeNgCapabilityMetadata042,inspectNgCapabilityMetadata042} from '../src/acoustics/world/ng-readiness042.mjs';
import {byteDigest} from '../src/acoustics/world/contracts.mjs';
const original=()=>({schema:1,kind:'RichAudioNgCapabilityMetadata042',provider:'original-authored-declaration-fixture',targetEdition:'unknown',algorithm:'RPF7-NG',acquisition:'not-established',permission:{declaredUse:'not-established',provenanceReceiptSHA256:null,redistribution:'not-established'},archive:{fileNameCaseSensitive:null,wholeFileBytes:null,captureReceiptSHA256:null},materialDeclarations:Object.fromEntries(['selectedExpandedSchedule','decryptionTables','filenameLookup'].map(key=>[key,{referenceId:null,bytes:null,sha256:null,selectedKeyIndex:null}]))});
const inspect=value=>{const bytes=encodeNgCapabilityMetadata042(value);return inspectNgCapabilityMetadata042(bytes,{expectedSHA256:byteDigest(bytes)});};
test('missing capability metadata stays explicitly blocked with zero ciphertext, material or referenced-path access',()=>{
  const result=inspect(original());assert.equal(result.canExecute,false);assert.equal(result.keyMaterialReads,0);assert.equal(result.ciphertextReads,0);assert.equal(result.referencedPathsOpened,0);assert(result.missingEvidence.includes('Enhanced-provenance-not-established'));
});
test('even complete self-declared Enhanced material identities cannot authorize a real decoder or private input',()=>{
  const value=original();value.targetEdition='enhanced';value.acquisition='existing-user-supplied-capability';value.permission={declaredUse:'private-local-metadata-decoding',provenanceReceiptSHA256:'a'.repeat(64),redistribution:'not-permitted'};value.archive={fileNameCaseSensitive:'original-fixture.rpf',wholeFileBytes:8192,captureReceiptSHA256:'b'.repeat(64)};
  for(const [key,size]of Object.entries({selectedExpandedSchedule:272,decryptionTables:278528,filenameLookup:256}))value.materialDeclarations[key]={referenceId:key,bytes:size,sha256:'c'.repeat(64),selectedKeyIndex:key==='selectedExpandedSchedule'?7:null};
  const result=inspect(value);assert.equal(result.declaredMaterialBytes,279056);assert.equal(result.canExecute,false);assert.equal(result.realCapabilityQualified,false);assert.deepEqual(result.missingEvidence,['independent-private-input-review-and-explicit-approval','real-material-adapter-and-runtime-containment-qualification']);
  value.targetEdition='legacy';assert(inspect(value).missingEvidence.includes('Enhanced-provenance-not-established'));
});
test('raw key fields, paths, full schedules, hash drift, oversized and alternate JSON encodings reject',()=>{
  for(const mutate of [v=>v.rawKey='original-test-only',v=>v.materialDeclarations.selectedExpandedSchedule.path='must-not-open.key',v=>v.materialDeclarations.selectedExpandedSchedule.bytes=27472,v=>v.materialDeclarations.filenameLookup.selectedKeyIndex=2]){const value=original();mutate(value);assert.throws(()=>inspect(value));}
  const bytes=encodeNgCapabilityMetadata042(original());assert.throws(()=>inspectNgCapabilityMetadata042(bytes,{expectedSHA256:'0'.repeat(64)}),/identity/);
  const alternate=Buffer.from(JSON.stringify(original(),null,2));assert.throws(()=>inspectNgCapabilityMetadata042(alternate,{expectedSHA256:byteDigest(alternate)}),/canonical/);
  assert.throws(()=>inspectNgCapabilityMetadata042(Buffer.alloc(16385),{expectedSHA256:'0'.repeat(64)}),/identity/);
});
test('published planning templates remain nonexecuting exact-input scopes rather than inferred authorization',async()=>{
  const read=name=>fs.readFile(new URL('../config/world042/'+name,import.meta.url),'utf8').then(JSON.parse);
  const a0=await read('ng-capability-metadata.blocked.json'),a1=await read('ng-saved-inputs.blocked.json'),b0=await read('export-metadata.blocked.json');
  for(const proposal of [a0,a1,b0]){assert.equal(proposal.canExecute,false);assert.equal(proposal.command,null);assert.equal(proposal.approval,null);assert.equal(proposal.candidateIdentity,null);assert.deepEqual(proposal.installedReadAllowlist,[]);assert.equal(proposal.consumedMarkerAbsenceAllowsRetry,false);}
  assert.equal(a0.maximumAggregateInputBytes,a0.input.maximumBytes+Object.values(a0.optionalReceiptInputs).reduce((n,p)=>n+p.maximumBytes,0));assert.equal(a0.keyMaterialReads,0);assert.equal(a0.ciphertextReads,0);
  assert.equal(a1.maximumAggregateInputBytes,a1.descriptorMaximumBytes+Object.values(a1.inputs).reduce((n,p)=>n+(p.maximumBytes??p.bytes),0));assert.equal(a1.inputs.expandedKeys.bytes,272);assert.equal(a1.inputs.savedCiphertext.bytes,46128);assert.equal(a1.tableLayout.rawHeaderFileRequired,false);
  assert.equal(b0.referencedResourceAccess,false);assert.equal(b0.sourcePathStatAllowed,false);assert.equal(b0.futureXmlSubsetProposal.separateApprovalRequired,true);
});
