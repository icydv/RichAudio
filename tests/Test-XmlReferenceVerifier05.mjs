import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCurrentCodeWalkerXmlReference05,xmlReferencePath05} from '../tools/Test-CodeWalkerXmlReference05.mjs';
import {originalXmlReference05} from './fixtures/CodeWalkerXml05.mjs';
test('fresh-reference comparator checks all fixed current original XML bytes and actual DTO/world/hash fields',async()=>{const result=await compareCurrentCodeWalkerXmlReference05(originalXmlReference05);assert.equal(result.resourcesChecked,27);assert.equal(result.selectedResources,24);assert.equal(result.emptySelectionRejected,1);assert.equal(result.hashVectorsChecked,5);assert(result.worldVertices>24);assert.equal(result.genuineResourceVerified,false);});
test('reference identity and missing/changed independent fields fail rather than falling back to the golden receipt',async()=>{
 await assert.rejects(compareCurrentCodeWalkerXmlReference05(originalXmlReference05,{expectedParserSHA256:'a'.repeat(64)}),/parser SHA-256 mismatch/);assert.equal((await compareCurrentCodeWalkerXmlReference05(originalXmlReference05,{expectedParserSHA256:originalXmlReference05.parserSHA256})).expectedParserBindingChecked,true);
 for(const change of [r=>r.passed=false,r=>r.parserSHA256='bad',r=>r.parserSourceCommit='a'.repeat(40),r=>r.sourceAuthority='real-source',r=>r.gameFilesRead=true,r=>r.fixtureSets.pop(),r=>r.fixtureSets[0].resources[0].xmlSHA256='a'.repeat(64),r=>r.fixtureSets[0].world.samples.pop(),r=>r.fixtureSets[0].world.samples[0].positionInWorld[0]+=1,r=>r.nameHashVectors[0].hash++]){const r=structuredClone(originalXmlReference05);change(r);await assert.rejects(compareCurrentCodeWalkerXmlReference05(r),/reference/);}
});
test('reference path allowlist rejects other worktrees, non-world05 directories and non-reference leaves before filesystem access',()=>{
 assert.match(xmlReferencePath05('.local/world-03/world05-explicit-reference/reference.json'),/world05-explicit-reference/);for(const value of ['../unopened-other-worktree/.local/world-03/world05-reference/reference.json','.local/world-03/world04-reference/reference.json','.local/world-03/world05-reference/payload.bin','.local/world-03/world05-reference/../../reference.json','Z:\\unopened-original-sentinel\\reference.json'])assert.throws(()=>xmlReferencePath05(value),/exact new-worktree/);
});
