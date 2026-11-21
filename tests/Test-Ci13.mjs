import test from 'node:test';import assert from 'node:assert/strict';
import {processingVerdict13,requiredJobsVerdict13,blockBudget13} from '../tools/ci-gates13.mjs';
import {execFileSync} from 'node:child_process';
import {sanitizePublication13,publishProcessing13,readPublicationOriginal13} from '../tools/Publish-Processing13.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import {createHash} from 'node:crypto';
const group=(maximumMs=7)=>({implementation:'candidate',blocks:2,all:{calls:2,maximumMs,overBudget:maximumMs>blockBudget13?1:0,blockBudgetMs:blockBudget13},postAnalysisHeadroom:{targetMs:8,blocksAboveTarget:maximumMs>8?1:0,maximumTargetMet:maximumMs<=8}});
const summary=()=>({blockBudgetMs:blockBudget13,functionalPassed:true,pcmPassed:true,experiments:[0,1].map(()=>({completed:true,terminalFailure:null,requestedTrials:1,trials:1,gates:{functional:true,pcm:true},groups:[group()]}))});
test('all selected candidate deadlines and headroom are required even when functional checks pass',()=>{
 assert.equal(processingVerdict13(summary()).requiredPassed,true);
 for(const maximum of [8.1,10.666666666666668,20]){const s=summary();s.experiments[1].groups[0]=group(maximum);const v=processingVerdict13(s);assert.equal(v.functionalPassed,true);assert.equal(v.requiredPassed,false);assert.equal(v.headroomPassed,false);}
});
test('missing, incomplete or contradictory measurement evidence cannot become passing validation',()=>{
 for(const change of [s=>s.experiments.pop(),s=>s.pcmPassed=false,s=>s.experiments[0].completed=false,s=>s.experiments[0].trials=0,s=>s.experiments[0].groups=[],s=>s.experiments[0].groups[0].all.calls=0,s=>s.experiments[0].groups[0].all.maximumMs=NaN,s=>s.experiments[0].groups[0].postAnalysisHeadroom.targetMs=9]){const s=summary();change(s);assert.equal(processingVerdict13(s).requiredPassed,false);}
});
test('a parent overrun is preserved without preventing qualification of a passing candidate',()=>{
 const s=summary();s.experiments[0].groups.push({...group(20),implementation:'parent'});assert.equal(processingVerdict13(s).requiredPassed,true);
});
test('all required job outcomes are independent and fail closed for failures or missing work',()=>{
 for(const functional of ['success','failure','cancelled','skipped',null])for(const processing of ['success','failure','cancelled','skipped',null])assert.equal(requiredJobsVerdict13({functional,processing}).requiredPassed,functional==='success'&&processing==='success');
});
test('the actual PowerShell stage retains its first failure and runs independent following work',{skip:process.platform!=='win32'},()=>{
 const output=execFileSync('pwsh',['-NoProfile','-File','tests/Test-CiStages13.ps1'],{encoding:'utf8',windowsHide:true,timeout:15000});assert.match(output,/"passed":true,"retainedFirstFailure":true,"followingStageRan":true/);
});
test('publication redacts nested failure paths without changing numeric gates or identity hashes',()=>{
 const raw={error:'file:///C:/Users/Author/Project/.local/worker.mjs:12 C:\\Users\\Author\\Project\\worker.mjs C:/Users/Author/public/node.exe',maximumMs:10.666666666666668,requiredPassed:false,hash:'a'.repeat(64),nested:[{error:'c:/users/author/Project/test.mjs'}]};
 const published=sanitizePublication13(raw,['C:\\Users\\Author\\Project\\','C:\\Users\\Author']);assert(!/Author|Project/.test(JSON.stringify(published)));assert.equal(published.maximumMs,raw.maximumMs);assert.equal(published.requiredPassed,false);assert.equal(published.hash,raw.hash);assert.match(published.error,/file:\/\/\/<repo>/);assert.match(raw.error,/Author/);
});
test('publication preserves original bytes, binds both identities and refuses replacement or path expansion',async()=>{
 const suffix=randomUUID(),name='world13-ci-publication-control-'+suffix+'.json',original=Buffer.from(JSON.stringify({failure:path.join(process.cwd(),'.local','authored-failure.mjs'),renderMs:10.666666666666668,passed:false})+'\n'),directory=path.resolve('.local/world13-publication-control-'+suffix+'/artifact');await fs.mkdir(directory,{recursive:true});const source=path.resolve('.local',name);await fs.writeFile(source,original,{flag:'wx'});
 const result=await publishProcessing13(directory,[name]);assert.equal(result.records.length,1);assert.equal(result.records[0].originalSha256,createHash('sha256').update(original).digest('hex'));assert.deepEqual(await fs.readFile(source),original);const published=JSON.parse(await fs.readFile(path.join(directory,result.records[0].publishedName),'utf8'));assert.equal(published.passed,false);assert.equal(published.renderMs,10.666666666666668);assert.match(published.failure,/<repo>/);assert(!published.failure.includes(process.cwd()));await assert.rejects(publishProcessing13(directory,[name]),/EEXIST/);await assert.rejects(publishProcessing13(directory,['../outside.json']),/bounded exact/);
});
test('bounded publication reads reject growth and truncation before parsing or public output',async()=>{
 let allocations=0;await assert.rejects(readPublicationOriginal13({read:async(_buffer,_at,requested)=>{allocations++;return {bytesRead:requested};}},3),/input grew/);assert.equal(allocations,1);await assert.rejects(readPublicationOriginal13({read:async()=>({bytesRead:0})},3),/truncated/);await assert.rejects(readPublicationOriginal13({},160*1024*1024+1),/bounded publication allocation/);
});
test('a later malformed report preserves qualified earlier publication and a failed terminal receipt',async()=>{
 const suffix=randomUUID(),directory=path.resolve('.local/world13-publication-failure-'+suffix+'/artifact'),names=['world13-ci-first-'+suffix+'.json','world13-ci-malformed-'+suffix+'.json'];await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.resolve('.local',names[0]),'{"passed":false}\n',{flag:'wx'});await fs.writeFile(path.resolve('.local',names[1]),'original authored malformed JSON',{flag:'wx'});await assert.rejects(publishProcessing13(directory,names),SyntaxError);assert.equal((JSON.parse(await fs.readFile(path.join(directory,'processing-publication-failed.json')))).qualifiedCopies.length,1);await assert.rejects(fs.stat(path.join(directory,'published-'+names[1])),/ENOENT/);assert.equal(await fs.readFile(path.resolve('.local',names[1]),'utf8'),'original authored malformed JSON');
});
