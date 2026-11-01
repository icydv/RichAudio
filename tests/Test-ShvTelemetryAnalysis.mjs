// Recorded ABI-fixture data validates analysis logic; it never qualifies a live provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {analyzeTimeline} from '../tools/Analyze-ShvTelemetry.mjs';

const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2);
const arg=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const fixtureArg=arg('--fixture-root'),outputArg=arg('--output');
if(!fixtureArg||!outputArg)throw Error('Use --fixture-root <actual PLAYABLE-07 fixture folder> --output <new .local/playable-07 JSON>.');
const root=path.resolve(fixtureArg),output=path.resolve(outputArg);
if(!['.local/playable-07','build/playable-07-fixtures'].some(name=>output.startsWith(path.join(repo,name)+path.sep)))throw Error('New PLAYABLE-07 output path required.');
if(fs.existsSync(output))throw Error('Refusing to overwrite an analysis validation receipt.');
for(let parent=path.dirname(output);;parent=path.dirname(parent)){
  if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink())throw Error('Linked output parents are not permitted.');
  if(path.dirname(parent)===parent)break;
}
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fixtureReceipt=path.join(root,'fixture-result.json');
const receipt=JSON.parse(fs.readFileSync(fixtureReceipt,'utf8'));
assert.equal(receipt.profile,'PLAYABLE-07');
assert.equal(receipt.fullMatrix,true);
assert.equal(receipt.actualShvExecuted,false);
assert.equal(receipt.gameStarted,false);
assert.equal(receipt.providerQualified,false);
function load(name){
  const sessionRoot=path.join(root,`case-${name}`,'RichAudio','ShvProbe');
  const sessions=fs.readdirSync(sessionRoot,{withFileTypes:true}).filter(e=>e.isDirectory());
  assert.equal(sessions.length,1,'One actual fixture session per case.');
  const directory=path.join(sessionRoot,sessions[0].name);
  const timeline=path.join(directory,'timeline.ndjson'),capture=path.join(directory,'capture.json');
  const raw=fs.readFileSync(timeline,'utf8');
  const records=raw.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const summary=JSON.parse(fs.readFileSync(capture,'utf8'));
  return {records,summary,result:analyzeTimeline(records,summary),timelineSha256:hash(timeline),captureSha256:hash(capture)};
}
const sourceCases=['sequence_dynamic','sequence_constant','sequence_wrong_trend','sequence_marker_only','zero_running','zero_off','rising','falling','stale_gap','post_identity_changed','post_context_seh','target_seh','null_pointer','nan','out_of_range'];
const data=Object.fromEntries(sourceCases.map(name=>[name,load(name)]));
const outcomes=[];
function test(name,run){
  try{run();outcomes.push({name,passed:true});console.log(`PASS analysis ${name}`);}
  catch(error){outcomes.push({name,passed:false,message:String(error.message).slice(0,500)});console.error(`FAIL analysis ${name}: ${error.message}`);}
}
const dynamic=data.sequence_dynamic;
test('actual dynamic binary timeline meets review heuristics without provider qualification',()=>{
  assert.equal(dynamic.result.verdict,'candidate-consistent',JSON.stringify(dynamic.result));
  assert.equal(dynamic.result.providerQualified,false);
  assert.ok(Object.values(dynamic.result.criteria).every(v=>v===true));
  assert.ok(dynamic.result.measurements.initialIdle.durationSeconds>=2);
  assert.ok(dynamic.result.measurements.returnIdle.durationSeconds>=2);
  assert.ok(dynamic.result.measurements.acceleration.speedQuarterDelta>=2);
  assert.ok(dynamic.result.measurements.deceleration.speedQuarterDelta<=-2);
});
test('constant output under actual independent speed activity is rejected',()=>{
  const r=data.sequence_constant.result;
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.criteria.independentAcceleration&&r.criteria.independentDeceleration);
  assert.ok(r.qualityFailures.includes('constant-or-insufficiently-varying-signal-under-observed-activity'));
});
test('actual opposite ratio trends are rejected independently of requested labels',()=>{
  const r=data.sequence_wrong_trend.result;
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('opposite-ordered-ratio-trend-during-acceleration'));
  assert.ok(r.qualityFailures.includes('opposite-ordered-ratio-trend-during-deceleration'));
});
test('all requested labels with stationary unchanging observations remain incomplete',()=>{
  const r=data.sequence_marker_only.result;
  assert.equal(r.verdict,'incomplete');
  assert.ok(r.measurements.operatorPhaseEvents>=7);
  assert.equal(r.criteria.independentAcceleration,false);
  assert.equal(r.criteria.independentDeceleration,false);
});
test('running zero remains unexplained while engine-off zero remains recorded',()=>{
  assert.equal(data.zero_running.result.verdict,'inconsistent');
  assert.ok(data.zero_running.result.qualityFailures.includes('unexplained-zero-while-running'));
  assert.equal(data.zero_off.result.verdict,'incomplete');
  assert.ok(data.zero_off.result.measurements.engineOff.samples>3);
});
test('genuine rising and falling sequences alone do not satisfy multistate acceptance',()=>{
  assert.equal(data.rising.result.verdict,'incomplete');
  assert.equal(data.falling.result.verdict,'incomplete');
  assert.ok(data.rising.result.measurements.runningRatioRange>.5);
  assert.ok(data.falling.result.measurements.runningRatioRange>.5);
});
test('actual terminal stale/context/native failures prevent acceptance',()=>{
  for(const name of ['stale_gap','post_identity_changed','post_context_seh','target_seh','null_pointer','nan','out_of_range'])assert.notEqual(data[name].result.verdict,'candidate-consistent',name);
});
test('every actual timeline remains explicitly unqualified and uncalibrated',()=>{
  for(const entry of Object.values(data)){
    assert.equal(entry.result.providerQualified,false);
    assert.equal(entry.result.measuredRPM,false);
    assert.equal(entry.result.operatorMarkersAreAchievedProof,false);
    assert.equal(entry.result.declarationsAreInvocationProof,false);
    assert.match(entry.result.interpretation.achievedGearTransitions,/unobserved/);
    assert.match(entry.result.interpretation.actualThrottle,/unavailable/);
  }
});
function changed(edit){const records=structuredClone(dynamic.records),summary=structuredClone(dynamic.summary);edit(records,summary);return analyzeTimeline(records,summary);}
test('failed writer cannot inherit otherwise valid observations',()=>{
  const r=changed((_records,summary)=>{summary.writerFailed=true;});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('writer-status-failed-or-unobserved'));
});
test('missing completed-producer status remains incomplete',()=>{
  const r=changed((_records,summary)=>{delete summary.producerCompleted;});
  assert.notEqual(r.verdict,'candidate-consistent');
  assert.ok(r.evidenceGaps.includes('producer-outcome-unobserved'));
});
test('mismatched terminal outcome and written record counts are rejected',()=>{
  for(const key of ['targetOutcomesObserved','timelineRecordsWritten']){
    const r=changed((_records,summary)=>{summary[key]--;});
    assert.notEqual(r.verdict,'candidate-consistent',key);
  }
});
test('negative player identity is invalid even with matching driver and model',()=>{
  const r=changed(records=>{
    for(const row of records.filter(row=>row.observationIndex===20)){
      if(row.preContext)row.preContext.player=-1;
      if(row.postContext)row.postContext.player=-1;
    }
  });
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('missing-or-invalid-identity-bracket'));
});
test('unobserved pre-context cannot qualify a bracket',()=>{
  const r=changed(records=>{for(const row of records.filter(row=>row.observationIndex===20))row.preContextObserved=false;});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('missing-or-invalid-identity-bracket'));
});
test('290ms start gap remains stale despite a valid 50ms after-to-next gap',()=>{
  const r=changed((records,summary)=>{
    const before=records.find(row=>row.kind==='observation'&&row.observationIndex===19);
    const after=records.find(row=>row.kind==='observation'&&row.observationIndex===20);
    const newAfter=before.targetBeforeQpc+Math.ceil(summary.qpcFrequency*.240);
    const newNext=newAfter+Math.ceil(summary.qpcFrequency*.050);
    const delta=newNext-after.targetBeforeQpc;
    before.targetAfterQpc=newAfter;
    before.postContext.acquisitionStartQpc=newAfter+10;
    before.postContext.acquisitionEndQpc=newAfter+20;
    records.find(row=>row.kind==='target-return'&&row.observationIndex===19).targetAfterQpc=newAfter;
    function shift(value){for(const [key,item]of Object.entries(value)){
      if(item&&typeof item==='object')shift(item);
      else if(key.endsWith('Qpc')&&!key.startsWith('gap')&&typeof item==='number'&&item>0)value[key]+=delta;
    }}
    for(const row of records.slice(records.indexOf(before)+1))shift(row);
    summary.activeEndQpc+=delta;
  });
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('stale-or-missing-acquisition-gap'));
  assert.ok(!r.qualityFailures.includes('acquisition-exceeds-20hz-bound'));
});
test('missing declared or immediate-return triplet member stays incomplete',()=>{
  for(const kind of ['declared-precontext','target-return']){
    const r=changed((records,summary)=>{
      records.splice(records.findIndex(row=>row.kind===kind&&row.observationIndex===20),1);
      summary.timelineRecordsProduced--;summary.timelineRecordsWritten--;
    });
    assert.notEqual(r.verdict,'candidate-consistent',kind);
    assert.ok(r.evidenceGaps.includes('missing-or-duplicate-attempt-record-triplet'));
  }
});
test('early raw return disagreement cannot be hidden by a valid final observation',()=>{
  const r=changed(records=>{records.find(row=>row.kind==='target-return'&&row.observationIndex===20).rawBits^=1;});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('raw-return-and-complete-observation-disagree'));
});
test('phase advancement cannot skip requested states',()=>{
  const r=changed(records=>{const row=records.find(row=>row.kind==='phase'&&row.action==='advance');row.requestedPhaseIndex=3;row.requestedPhase='ACCELERATION';});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('invalid-requested-phase-progression'));
});
test('invalid numeric phase is not rescued by a plausible text label',()=>{
  const r=changed(records=>{records.find(row=>row.kind==='phase').requestedPhaseIndex=999;});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('phase-index-and-name-disagree'));
});
test('a different target native cannot inherit this candidate interpretation',()=>{
  const r=changed((_records,summary)=>{summary.targetHash='0000000000000000';});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('unexpected-or-missing-target-native'));
});
test('unarmed or differently armed identity remains incomplete',()=>{
  for(const change of [summary=>{summary.operatorArming.accepted=false;},summary=>{summary.operatorArming.context.vehicle=9999;}]){
    const r=changed((_records,summary)=>change(summary));
    assert.notEqual(r.verdict,'candidate-consistent');
    assert.ok(r.evidenceGaps.includes('missing-or-mismatched-operator-arming-identity'));
  }
});
test('missing observed row cannot inherit a complete terminal count',()=>{
  const r=changed(records=>{const at=records.findIndex(row=>row.kind==='observation'&&row.observationIndex===20);records.splice(at,1);});
  assert.notEqual(r.verdict,'candidate-consistent');
  assert.ok(r.evidenceGaps.includes('terminal-target-count-does-not-match-recorded-attempts'));
});
test('duplicate observation indices are rejected',()=>{
  const r=changed(records=>{const row=records.find(row=>row.kind==='observation'&&row.observationIndex===20);records.push(structuredClone(row));});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('nonmonotonic-or-duplicate-observation-index'));
});
test('probe-reported stale observation cannot be silently reused',()=>{
  const r=changed(records=>{records.find(row=>row.kind==='observation'&&row.observationIndex===20).staleGap=true;});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('probe-reported-stale-gap'));
});
test('unfresh post-context and impossible acquisition ordering are rejected',()=>{
  const r=changed((records,summary)=>{const row=records.find(row=>row.kind==='observation'&&row.observationIndex===20);row.postContext.acquisitionEndQpc+=Math.ceil(summary.qpcFrequency*.3);});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('stale-context-window'));
});
test('mismatched speed bits are not accepted as independent motion evidence',()=>{
  const r=changed(records=>{records.find(row=>row.kind==='observation'&&row.observationIndex===20).preContext.speedBits=0x3f800000;});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('invalid-independent-speed'));
});
test('raw ratio bit/value disagreement is rejected',()=>{
  const r=changed(records=>{records.find(row=>row.kind==='observation'&&row.observationIndex===20).rawFloat=.4;});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('raw-float-and-bits-disagree'));
});
test('declared intent and phase markers without target outcomes are insufficient',()=>{
  const r=analyzeTimeline(dynamic.records.filter(row=>row.kind!=='observation'),dynamic.summary);
  assert.equal(r.verdict,'incomplete');
  assert.equal(r.measurements.recordedObservations,0);
  assert.equal(r.declarationsAreInvocationProof,false);
});
test('early raw returns without completed contexts remain incomplete',()=>{
  const rows=dynamic.records.filter(row=>row.kind==='target-return'||row.kind==='phase');
  assert.ok(rows.some(row=>row.kind==='target-return'));
  const r=analyzeTimeline(rows,dynamic.summary);
  assert.notEqual(r.verdict,'candidate-consistent');
  assert.equal(r.providerQualified,false);
});
test('unpublished raw result remains visible but cannot qualify a failed writer',()=>{
  const r=changed((records,summary)=>{summary.unpublishedRecord=structuredClone(records.find(row=>row.kind==='observation'));});
  assert.equal(r.verdict,'inconsistent');
  assert.ok(r.qualityFailures.includes('writer-or-queue-failure-unpublished-record'));
});
test('missing exact clock cannot produce a qualified timeline',()=>{
  const r=changed((_records,summary)=>{delete summary.qpcFrequency;});
  assert.notEqual(r.verdict,'candidate-consistent');
  assert.ok(r.evidenceGaps.includes('missing-or-inexact-monotonic-clock'));
});
const failed=outcomes.filter(o=>!o.passed).length;
const negativeNames=outcomes.slice(1,4);
const report={schema:1,profile:'PLAYABLE-07',scope:'Analysis logic checked against actual production-ASI fake-framework timelines plus labelled malformed-data controls; no live provider qualification',candidateSha256:receipt.candidateSha256,fixtureReceiptSha256:hash(fixtureReceipt),analysisSourceSha256:hash(path.join(repo,'tools','Analyze-ShvTelemetry.mjs')),currentTestSourceSha256:hash(fileURLToPath(import.meta.url)),passed:outcomes.length-failed,failed,negativeControlsValidated:negativeNames.every(r=>r.passed),actualShvExecuted:false,gameStarted:false,endpointOpened:false,providerQualified:false,sourceCases:sourceCases.map(name=>({case:name,timelineSha256:data[name].timelineSha256,captureSha256:data[name].captureSha256,verdict:data[name].result.verdict,providerQualified:false})),outcomes};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(`${failed?'FAIL':'PASS'} ${report.passed}/${outcomes.length} timeline analysis checks; actual framework/game/audio not executed.`);
if(failed)process.exitCode=1;
