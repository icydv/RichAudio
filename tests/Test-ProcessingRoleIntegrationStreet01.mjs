// Fresh exact historical/current processes, not a reclassification of old data.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
import {freezeProcessing13} from '../tools/Freeze-Processing13.mjs';
import {runProcessingTrial13,compareProcessingPcm13} from '../tools/Profile-Processing13.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('fresh role-aware parent/current workers preserve legacy sources, settings, stereo and histories',{skip:process.platform!=='win32'},async t=>{
 const id=randomUUID(),names={parent:'world13-baseline-street-roles-'+id,candidate:'world13-current-street-roles-'+id};
 const snapshots={parent:await freezeProcessing13(names.parent,{implementation:'parent'}),candidate:await freezeProcessing13(names.candidate)};
 t.diagnostic('Frozen role-aware worker snapshots: '+JSON.stringify(snapshots));
 const results=[];
 for(const scenario of [{scene:'direct',blocks:36,lifecycle:false,texture:false},{scene:'walls',blocks:192,lifecycle:true,texture:true}]){
  const trials={};for(const implementation of ['parent','candidate']){
   trials[implementation]=await runProcessingTrial13({snapshot:names[implementation],preparation:'data-prepared',...scenario});
   assert.equal(trials[implementation].failure,null,JSON.stringify(trials[implementation].workers));assert.equal(trials[implementation].allChildrenJoined,true);
  }
  const comparison=compareProcessingPcm13(trials.parent.result,trials.candidate.result);
  results.push({scenario,comparison,trials});
  assert.equal(Object.values(comparison).every(v=>v===true),true,JSON.stringify(comparison));
  assert.notEqual(trials.parent.result.continuity.drySha256,trials.candidate.result.continuity.drySha256,'the old structural aggregate difference stays visible');
 }
 const directory=path.join(root,'.local','street01-completion','role-baseline-'+id);await fs.mkdir(directory,{recursive:true});
 await fs.writeFile(path.join(directory,'result.json'),JSON.stringify({schema:1,kind:'RichAudioFreshRoleBaselineStreet01',node:process.version,snapshots,results,historicalFailuresReclassified:false,timingAcceptance:false,scope:'Original fixtures only. Role capture occurs outside the render timer; all measured misses remain in raw trial rows.',gameRead:false,endpointOpened:false},null,2)+'\n',{flag:'wx'});
 t.diagnostic('Fresh role-aware evidence: '+directory);
});
