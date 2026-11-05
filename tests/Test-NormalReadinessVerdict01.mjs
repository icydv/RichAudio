// Evaluate the actual measurement predicate with authored state, without
// importing/executing the installed-data measurement entry point.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const text=fs.readFileSync(new URL('../tools/Measure-NormalWorldReadiness01.mjs',import.meta.url),'utf8'),matches=[...text.matchAll(/localReadinessQualified=([^;\r\n]+);/g)];
assert.equal(matches.length,1,'one actual local qualification predicate');
const predicate=new vm.Script('Boolean('+matches[0][1]+')');
const state=()=>({service:{failed:false},cost:{consumerAcceptances:1},terminalConsumer01:{clockVerified:true,fresh:true,activeSceneMatches:true},consumerLeaseGaps01:{count:0},retainedLocalProof:true,invalidatedSource:false,publications:{failedPublications:0},broaderPreparationCompleted:true,controlledBudget:false,processReceipt:{ControlJoined:true},closure:{workerJoined:true},forced:false,sourcePinsUnchanged:true});
test('actual local verdict retains first acceptance but rejects later reader/consumer failure and revoked proof',()=>{
 const evaluate=s=>predicate.runInNewContext(s);assert.equal(evaluate(state()),true);
 for(const patch of [{service:{failed:true}},{retainedLocalProof:false},{invalidatedSource:true},{publications:{failedPublications:1}},{processReceipt:{ControlJoined:false}},{closure:{workerJoined:false}},{sourcePinsUnchanged:false}])assert.equal(evaluate({...state(),...patch}),false);
 assert.equal(evaluate({...state(),broaderPreparationCompleted:false,controlledBudget:true}),true,'controlled budget retains separately qualified local state');
 assert.equal(evaluate({...state(),broaderPreparationCompleted:false,controlledBudget:false}),false,'structural outer failure never substitutes for completion');
 const terminal=state().terminalConsumer01;
 for(const patch of [{fresh:false},{activeSceneMatches:false},{clockVerified:false}])assert.equal(evaluate({...state(),terminalConsumer01:{...terminal,...patch}}),false,'early acceptance with retained proof cannot qualify an expired, replaced or unbound terminal consumer');
 assert.equal(evaluate({...state(),consumerLeaseGaps01:{count:1}}),false,'a recovered publication cannot erase an earlier post-acceptance lease gap');
});
test('terminal rejection propagates through the actual harness exit status despite successful cleanup',()=>{
 const exit=text.match(/if\(!finalPassed01[^\r\n]+process\.exitCode=1;/)?.[0];assert(exit,'actual harness must propagate the final verdict');
 const script=new vm.Script(exit);
 for(const passed of [false,true]){const context={finalPassed01:passed,error:null,childClosed:true,closure:{workerJoined:true},process:{}};script.runInNewContext(context);assert.equal(context.process.exitCode,passed?undefined:1);}
});
