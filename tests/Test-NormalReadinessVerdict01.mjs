// Evaluate the actual measurement predicate with authored state, without
// importing/executing the installed-data measurement entry point.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const text=fs.readFileSync(new URL('../tools/Measure-NormalWorldReadiness01.mjs',import.meta.url),'utf8'),matches=[...text.matchAll(/localReadinessQualified=([^;\r\n]+);/g)];
assert.equal(matches.length,1,'one actual local qualification predicate');
const predicate=new vm.Script('Boolean('+matches[0][1]+')');
const state=()=>({service:{failed:false},cost:{consumerAcceptances:1},retainedLocalProof:true,invalidatedSource:false,publications:{failedPublications:0},broaderPreparationCompleted:true,controlledBudget:false,processReceipt:{ControlJoined:true},closure:{workerJoined:true},forced:false,sourcePinsUnchanged:true});
test('actual local verdict retains first acceptance but rejects later reader/consumer failure and revoked proof',()=>{
 const evaluate=s=>predicate.runInNewContext(s);assert.equal(evaluate(state()),true);
 for(const patch of [{service:{failed:true}},{retainedLocalProof:false},{invalidatedSource:true},{publications:{failedPublications:1}},{processReceipt:{ControlJoined:false}},{closure:{workerJoined:false}},{sourcePinsUnchanged:false}])assert.equal(evaluate({...state(),...patch}),false);
 assert.equal(evaluate({...state(),broaderPreparationCompleted:false,controlledBudget:true}),true,'controlled budget retains separately qualified local state');
 assert.equal(evaluate({...state(),broaderPreparationCompleted:false,controlledBudget:false}),false,'structural outer failure never substitutes for completion');
});
