import test from 'node:test';
import assert from 'node:assert/strict';
import {listenerTerminalEvidence} from '../tools/Check-ListenerStartup.mjs';
const fixture=()=>({listenerTerminalBoundary:{qpcTicks:10000,qpcFrequency:1000,fixtureCompletedFrames:512,fixtureSubmissionFrames:512},
 deviceFreeSink:{qpcFrequency:1000,lastSubmissionQpcTicks:9900,lastAdmissionQpcTicks:9900,lastCompletionQpcTicks:10010,frames:1024,
  lastAdmissionFrameStart:512,lastCompletionFrameEnd:1024,submissionFrames:512}});
test('one measured prior-admitted completion remains visible rather than claiming stop-request quiescence',()=>{
 const r=listenerTerminalEvidence(fixture(),'stale');assert.equal(r.passed,true);assert.equal(r.admissionAfterRequestMs,-100);
 assert.equal(r.completionAfterRequestMs,10);assert.equal(r.completedFramesAfterSnapshot,512);assert.equal(r.alreadyAdmittedCompletionAfterRequest,true);
});
test('new admission after stop remains refused even when samples could be muted',()=>{
 const f=fixture();f.deviceFreeSink.lastAdmissionQpcTicks=10001;const r=listenerTerminalEvidence(f,'future');
 assert.equal(r.passed,false);assert.ok(r.failedPredicates.includes('no-new-admission-after-stop-request'));
});
test('excess completion, changed block bound and inconsistent frame lineage cannot pass',()=>{
 for(const edit of [f=>f.deviceFreeSink.frames=1536,f=>f.deviceFreeSink.lastCompletionFrameEnd=1000,f=>f.deviceFreeSink.submissionFrames=1024,
  f=>f.deviceFreeSink.lastCompletionQpcTicks=9899,f=>f.deviceFreeSink.qpcFrequency=1001,
  f=>{f.deviceFreeSink.qpcFrequency=-1000;f.listenerTerminalBoundary.qpcFrequency=-1000},f=>f.deviceFreeSink.lastAdmissionFrameStart=-1]){
  const f=fixture();edit(f);assert.equal(listenerTerminalEvidence(f,'reordered').passed,false);
 }
});
test('missing and private malformed values produce bounded evidence without echoing paths or payloads',()=>{
 const marker='DO-NOT-PUBLISH';const f=fixture();f.listenerTerminalBoundary.qpcTicks=marker;f.deviceFreeSink.privatePayload=marker;
 const r=listenerTerminalEvidence(f,marker),text=JSON.stringify(r);assert.equal(r.passed,false);assert.equal(r.mode,'unrecognized');
 assert.ok(!text.includes(marker));assert.ok(Buffer.byteLength(text)<4096);assert.equal(listenerTerminalEvidence({},'stale').passed,false);
});
