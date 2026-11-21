// Interpret recorded telemetry without inventing RPM or treating phase requests as facts.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const phases = ['engine-off','idle','stationary-rev','acceleration','gear-transitions','deceleration','return-idle'];
export const reviewThresholds = Object.freeze({
  idleSeconds:2, idleMinimumSamples:10, idleBaseline:0.2, idleBaselineTolerance:0.05,
  idleMaximumExcursion:0.03, returnIdleTolerance:0.03, stationaryMps:0.10,
  speedChangeMps:2, activitySeconds:2, signalChange:0.10, orderedChange:0.05,
  maximumGapMs:250, maximumStepForAutomaticReview:0.35,
  maximumActiveSeconds:120, maximumTargets:2400, maximumHz:20,
});
const finite = x => typeof x === 'number' && Number.isFinite(x);
const integer = x => Number.isSafeInteger(x);
const int32 = x => integer(x)&&x>=-0x80000000&&x<=0x7fffffff;
const uint32 = x => integer(x)&&x>=0&&x<=0xffffffff;
const median = values => percentile(values, .5);
function percentile(values, p) {
  if (!values.length) return null;
  const a=[...values].sort((x,y)=>x-y), at=(a.length-1)*p, lo=Math.floor(at), hi=Math.ceil(at);
  return a[lo]+(a[hi]-a[lo])*(at-lo);
}
function numberBits(value) { const b=new DataView(new ArrayBuffer(4)); b.setFloat32(0,value,true); return b.getUint32(0,true); }
function decodeBits(value) {
  if (!integer(value) || value<0 || value>0xffffffff) return null;
  const b=new DataView(new ArrayBuffer(4)); b.setUint32(0,value,true); return b.getFloat32(0,true);
}
function phaseIndex(row) {
  if (integer(row.requestedPhaseIndex) && row.requestedPhaseIndex>=0 && row.requestedPhaseIndex<phases.length) return row.requestedPhaseIndex;
  return -1;
}
function contextValue(context, name) { return context?.[name]; }
function speed(context) {
  if (!context || context.speedObserved!==true) return null;
  const fromBits=decodeBits(context.speedBits);
  if(!finite(fromBits)||!finite(context.speedMps)||numberBits(context.speedMps)!==context.speedBits)return null;
  return fromBits;
}
function identity(context) {
  if (!context) return null;
  const names=['player','ped','vehicle','driver','model'];
  if (!names.slice(0,4).every(k=>int32(context[k]))||!uint32(context.model)) return null;
  if (context.player<0||!context.ped || !context.vehicle || context.driver!==context.ped || context.model!==0xF9300CC5) return null;
  return names.map(k=>context[k]).join(':');
}
function quarterDelta(rows, selector) {
  if (rows.length<4) return null;
  const n=Math.max(1,Math.floor(rows.length/4));
  return median(rows.slice(-n).map(selector))-median(rows.slice(0,n).map(selector));
}
function region(rows, f) {
  if (!rows.length) return {samples:0,durationSeconds:0};
  const values=rows.map(r=>r.ratio), middle=median(values);
  return {samples:rows.length,durationSeconds:(rows.at(-1).before-rows[0].before)/f,
    median:middle,minimum:Math.min(...values),maximum:Math.max(...values),
    maximumExcursion:Math.max(...values.map(v=>Math.abs(v-middle))),
    speedStart:rows[0].speed,speedEnd:rows.at(-1).speed,speedQuarterDelta:quarterDelta(rows,r=>r.speed),
    ratioQuarterDelta:quarterDelta(rows,r=>r.ratio)};
}
function longestRegion(rows, predicate, maxGapTicks) {
  let best=[], current=[];
  for (const row of rows) {
    if (!predicate(row)) { current=[]; continue; }
    if (current.length && row.before-current.at(-1).before>maxGapTicks) current=[];
    current.push(row);
    if (current.length>best.length) best=[...current];
  }
  return best;
}

export function analyzeTimeline(records, summary={}) {
  const failures=[], gaps=[], warnings=[];
  const add=(list,code)=>{if(!list.includes(code)&&list.length<64)list.push(code);};
  const frequency=summary.qpcFrequency;
  const start=summary.activeStartQpc??summary.captureStartQpc;
  const validClock=integer(frequency)&&frequency>0&&integer(start)&&start>=0;
  if(!validClock)add(gaps,'missing-or-inexact-monotonic-clock');
  const f=validClock?frequency:1, maxGap=f*reviewThresholds.maximumGapMs/1000, minSpacing=Math.ceil(f/20);
  const rows=Array.isArray(records)?[...records]:[];
  if (!Array.isArray(records))add(gaps,'timeline-not-an-array');
  if (summary.unpublishedRecord) {
    if(!rows.some(r=>r.kind===summary.unpublishedRecord.kind&&r.observationIndex===summary.unpublishedRecord.observationIndex))rows.push(summary.unpublishedRecord);
    add(failures,'writer-or-queue-failure-unpublished-record');
  }
  const observed=rows.filter(r=>r.kind==='observation');
  const declared=rows.filter(r=>r.kind==='declared-precontext');
  const rawReturns=rows.filter(r=>r.kind==='target-return');
  const markers=rows.filter(r=>r.kind==='phase');
  if(summary.schema!==3||rows.some(r=>r.schema!==3))add(gaps,'unsupported-or-missing-capture-schema');
  if(String(summary.targetHash??'').toUpperCase()!=='F9DDA40BC293A61E')add(failures,'unexpected-or-missing-target-native');
  if(rows.length>7209)add(failures,'timeline-record-bound-exceeded');
  if(rows.some(r=>!['phase','declared-precontext','target-return','observation'].includes(r.kind)))add(gaps,'unrecognised-timeline-record');
  let requested=-1, stopped=false, markerQpc=-1;
  const phaseNames=['OFF','IDLE','STATIONARY_REV','ACCELERATION','GEAR_TRANSITIONS','DECELERATION','RETURN_IDLE'];
  for(const row of rows) {
    const p=phaseIndex(row);
    if(p<0||row.requestedPhase!==phaseNames[p])add(failures,'phase-index-and-name-disagree');
    if(row.kind==='phase') {
      if(stopped||!integer(row.inputBeforeQpc)||!integer(row.inputAfterQpc)||!integer(row.acceptedQpc)||
        row.inputBeforeQpc<0||row.inputBeforeQpc>row.inputAfterQpc||row.inputAfterQpc>row.acceptedQpc||row.acceptedQpc<markerQpc)
        add(failures,'invalid-operator-marker-clock-or-order');
      if(row.action==='start'&&requested===-1&&p===0)requested=0;
      else if(row.action==='advance'&&p===requested+1&&p<=6)requested=p;
      else if(row.action==='stop'&&requested>=0&&p===requested)stopped=true;
      else add(failures,'invalid-requested-phase-progression');
      markerQpc=row.acceptedQpc;
    } else {
      if(stopped||requested<0||p!==requested)add(failures,'observation-does-not-match-operator-phase');
      if(row.targetAttempted===true&&row.targetBeforeQpc<markerQpc)add(failures,'target-precedes-accepted-phase-marker');
    }
  }
  const returnedWithoutContext=rawReturns.filter(r=>!observed.some(o=>o.observationIndex===r.observationIndex));
  if(returnedWithoutContext.length)add(gaps,'raw-target-return-without-complete-observation');
  for(const raw of rawReturns) {
    const complete=observed.find(o=>o.observationIndex===raw.observationIndex);
    if(complete&&['rawBits','readStatus','pointerPresent','targetBeforeQpc','targetAfterQpc'].some(k=>raw[k]!==complete[k]))
      add(failures,'raw-return-and-complete-observation-disagree');
  }
  for(const row of observed.filter(r=>r.targetAttempted===true)) {
    const declarations=declared.filter(r=>r.observationIndex===row.observationIndex);
    const returns=rawReturns.filter(r=>r.observationIndex===row.observationIndex);
    if(declarations.length!==1||returns.length!==1){add(gaps,'missing-or-duplicate-attempt-record-triplet');continue;}
    const d=declarations[0],r=returns[0];
    if(!(rows.indexOf(d)<rows.indexOf(r)&&rows.indexOf(r)<rows.indexOf(row)))add(failures,'attempt-record-triplet-out-of-order');
    if(phaseIndex(d)!==phaseIndex(row)||phaseIndex(r)!==phaseIndex(row)||d.preContextObserved!==true||
      d.invocationProven!==false||JSON.stringify(d.preContext)!==JSON.stringify(row.preContext)||
      !integer(d.declaredQpc)||d.declaredQpc<d.preContext?.acquisitionEndQpc||d.declaredQpc>row.targetBeforeQpc)
      add(failures,'declared-precontext-and-observation-disagree');
  }
  const good=[]; let referenceIdentity=null, lastAttempt=null, previousIndex=0, returned=0;
  const latencies=[], intervals=[];
  for (const row of observed) {
    let valid=true;
    const fail=code=>{add(failures,code);valid=false;};
    if(!integer(row.observationIndex)||row.observationIndex<=previousIndex)fail('nonmonotonic-or-duplicate-observation-index');
    else {if(previousIndex&&row.observationIndex!==previousIndex+1)add(gaps,'missing-observation-index');previousIndex=row.observationIndex;}
    if(row.targetAttempted!==true) {add(gaps,'observation-without-target-attempt');continue;}
    if(!integer(row.targetBeforeQpc)||!integer(row.targetAfterQpc)||row.targetAfterQpc<row.targetBeforeQpc)fail('invalid-target-clock');
    else if(validClock) {
      const latency=(row.targetAfterQpc-row.targetBeforeQpc)*1000/f;latencies.push(latency);
      if(latency>250)fail('target-window-exceeds-freshness-bound');
      if(validClock&&(row.targetBeforeQpc<start||row.targetBeforeQpc-start>=120*f))fail('target-start-outside-active-deadline');
      if(lastAttempt){
        intervals.push((row.targetBeforeQpc-lastAttempt.targetBeforeQpc)*1000/f);
        if(row.targetBeforeQpc-lastAttempt.targetAfterQpc<minSpacing)fail('acquisition-exceeds-20hz-bound');
        if(row.targetBeforeQpc-lastAttempt.targetBeforeQpc>maxGap)fail('stale-or-missing-acquisition-gap');
      }
      lastAttempt=row;
    }
    const readable=row.pointerPresent===true&&[0,'good','ok','success'].includes(row.readStatus);
    if(!readable)fail('native-result-unreadable-or-faulted');else returned++;
    const ratio=decodeBits(row.rawBits);
    if(!finite(ratio))fail('nonfinite-or-missing-raw-ratio');
    else {
      if(ratio<0||ratio>1)fail('ratio-outside-review-plausibility-band');
      if(!finite(row.rawFloat)||numberBits(row.rawFloat)!==row.rawBits)fail('raw-float-and-bits-disagree');
      if(row.rawBitsHex!==undefined&&String(row.rawBitsHex).replace(/^0x/i,'').toUpperCase()!==row.rawBits.toString(16).padStart(8,'0').toUpperCase())fail('raw-hex-and-bits-disagree');
    }
    const pre=row.preContext, post=row.postContext;
    const preId=identity(pre), postId=identity(post);
    if(row.preContextObserved!==true||row.postContextObserved!==true||row.contextBracketValid!==true||!preId||preId!==postId)fail('missing-or-invalid-identity-bracket');
    if(preId){if(referenceIdentity&&referenceIdentity!==preId)fail('identity-changed-during-session');else referenceIdentity=preId;}
    const a=speed(pre),b=speed(post);
    if(!finite(a)||!finite(b)||a<0||b<0)fail('invalid-independent-speed');
    const engineA=contextValue(pre,'engineRunningRaw'),engineB=contextValue(post,'engineRunningRaw');
    if(!uint32(engineA)||!uint32(engineB))fail('missing-engine-running-context');
    if(integer(pre?.acquisitionStartQpc)&&integer(pre?.acquisitionEndQpc)&&integer(post?.acquisitionStartQpc)&&integer(post?.acquisitionEndQpc)) {
      if(pre.acquisitionStartQpc>pre.acquisitionEndQpc||pre.acquisitionEndQpc>row.targetBeforeQpc||
        row.targetAfterQpc>post.acquisitionStartQpc||post.acquisitionStartQpc>post.acquisitionEndQpc)fail('acquisition-windows-out-of-order');
      if(validClock&&(row.targetBeforeQpc-pre.acquisitionEndQpc>maxGap||post.acquisitionEndQpc-pre.acquisitionStartQpc>maxGap))fail('stale-context-window');
    } else fail('missing-context-acquisition-clock');
    if(engineA!==0&&engineB!==0&&ratio===0)fail('unexplained-zero-while-running');
    if(row.staleGap===true)fail('probe-reported-stale-gap');
    const phase=phaseIndex(row);if(phase<0)add(gaps,'missing-requested-phase-marker');
    if(valid&&validClock)good.push({before:row.targetBeforeQpc,after:row.targetAfterQpc,ratio,
      engineOn:engineA!==0&&engineB!==0,engineOff:engineA===0&&engineB===0,
      stationary:a<=0.1&&b<=0.1,speed:(a+b)/2,phase,index:row.observationIndex,
      keyboardW:row.keyboardIntentBefore?.wDown===true||row.keyboardIntentAfter?.wDown===true});
  }
  if(observed.length>2400)add(failures,'target-count-exceeds-2400');
  const attempts=summary.targetAttempts??summary.targetStarts;
  if(!integer(attempts))add(gaps,'missing-terminal-target-count');
  else if(attempts!==observed.filter(r=>r.targetAttempted===true).length)add(gaps,'terminal-target-count-does-not-match-recorded-attempts');
  if(attempts>2400)add(failures,'terminal-target-count-exceeds-2400');
  if(summary.producerCompleted!==true)add(gaps,'producer-outcome-unobserved');
  if(summary.writerFailed!==false)add(failures,'writer-status-failed-or-unobserved');
  if(summary.targetOutcomesObserved!==attempts)add(gaps,'terminal-outcome-count-does-not-match-attempts');
  if(summary.observationsProduced!==observed.length||summary.timelineRecordsProduced!==rows.length||summary.timelineRecordsWritten!==rows.length)
    add(gaps,'terminal-record-counts-do-not-match-timeline');
  if(summary.phaseMarkers!==markers.length)add(gaps,'terminal-phase-count-does-not-match-timeline');
  const arm=summary.operatorArming,firstMarker=markers[0];
  if(arm?.accepted!==true||!identity(arm.context)||identity(arm.context)!==referenceIdentity)
    add(gaps,'missing-or-mismatched-operator-arming-identity');
  if(!integer(arm?.inputBeforeQpc)||!integer(arm?.inputAfterQpc)||!integer(arm?.observedQpc)||
    arm.inputBeforeQpc>arm.inputAfterQpc||arm.inputAfterQpc>arm.observedQpc||
    (validClock&&arm.observedQpc>start)||firstMarker?.inputBeforeQpc!==arm?.inputBeforeQpc||
    firstMarker?.inputAfterQpc!==arm?.inputAfterQpc)
    add(gaps,'missing-or-inconsistent-operator-arming-clock');
  if(!markers.length)add(gaps,'no-operator-phase-events');
  const terminal=String(summary.terminalReason??'');
  if(!/^(operator-stop|active-deadline|sample-limit)$/.test(terminal))add(gaps,'session-not-a-clean-completed-boundary');
  for(let i=1;i<good.length;i++) {
    if(good[i].engineOn&&good[i-1].engineOn&&Math.abs(good[i].ratio-good[i-1].ratio)>0.35)
      add(warnings,'large-step-requires-explanation-not-automatically-a-gear-shift');
  }
  const idleRows=longestRegion(good,r=>r.phase===1&&r.engineOn&&r.stationary,maxGap);
  const returnRows=longestRegion(good,r=>r.phase===6&&r.engineOn&&r.stationary,maxGap);
  const idle=region(idleRows,f), returnIdle=region(returnRows,f);
  const acceleration=region(longestRegion(good,r=>r.phase===3&&r.engineOn,maxGap),f);
  const deceleration=region(longestRegion(good,r=>r.phase===5&&r.engineOn,maxGap),f);
  const stationaryInputRows=good.filter(r=>r.phase===2&&r.engineOn&&r.stationary&&r.keyboardW);
  const engineOff=region(longestRegion(good,r=>r.engineOff,maxGap),f);
  const onValues=good.filter(r=>r.engineOn).map(r=>r.ratio);
  const runningRange=onValues.length?Math.max(...onValues)-Math.min(...onValues):null;
  const steady=r=>r.samples>=10&&r.durationSeconds>=2&&r.maximumExcursion<=0.03;
  const criteria={
    initialIdleContextAndStability:steady(idle)&&Math.abs(idle.median-0.2)<=0.05,
    returnIdleContextAndStability:steady(returnIdle)&&steady(idle)&&Math.abs(returnIdle.median-idle.median)<=0.03,
    independentAcceleration:acceleration.durationSeconds>=2&&acceleration.speedQuarterDelta>=2,
    independentDeceleration:deceleration.durationSeconds>=2&&deceleration.speedQuarterDelta<=-2,
    ratioRiseDuringObservedAcceleration:acceleration.ratioQuarterDelta>=0.05,
    ratioFallDuringObservedDeceleration:deceleration.ratioQuarterDelta<=-0.05,
    meaningfulRunningVariation:runningRange!==null&&runningRange>=0.10,
  };
  for(const [key,passed]of Object.entries(criteria))if(!passed)add(gaps,key);
  if(!engineOff.samples)add(warnings,'engine-off-unobserved');
  add(warnings,'gear-and-actual-throttle-unavailable-with-approved-native-set');
  if(!stationaryInputRows.length)add(warnings,'stationary-rev-input-association-unobserved');
  add(warnings,'keyboard-intent-does-not-prove-engine-actuation');
  const strongActivity=criteria.independentAcceleration||criteria.independentDeceleration;
  if(strongActivity&&runningRange!==null&&runningRange<0.10)add(failures,'constant-or-insufficiently-varying-signal-under-observed-activity');
  if(criteria.independentAcceleration&&acceleration.ratioQuarterDelta<0)add(failures,'opposite-ordered-ratio-trend-during-acceleration');
  if(criteria.independentDeceleration&&deceleration.ratioQuarterDelta>0)add(failures,'opposite-ordered-ratio-trend-during-deceleration');
  if(warnings.includes('large-step-requires-explanation-not-automatically-a-gear-shift'))add(gaps,'unexplained-discontinuity-review');
  const verdict=failures.length?'inconsistent':gaps.length?'incomplete':'candidate-consistent';
  return {schema:1,verdict,providerQualified:false,measuredRPM:false,operatorMarkersAreAchievedProof:false,
    declarationsAreInvocationProof:false,reviewThresholds,criteria,
    measurements:{recordedObservations:observed.length,validBracketedObservations:good.length,readableResults:returned,
      declaredPrecontexts:declared.length,operatorPhaseEvents:markers.length,
      rawTargetReturnRecords:rawReturns.length,rawReturnsWithoutCompleteContext:returnedWithoutContext.length,
      minimumTargetIntervalMs:intervals.length?Math.min(...intervals):null,
      targetWindowMs:{median:median(latencies),p95:percentile(latencies,.95),maximum:latencies.length?Math.max(...latencies):null},
      runningRatioRange:runningRange,initialIdle:idle,returnIdle,acceleration,deceleration,engineOff,
      stationaryKeyboardRequestSamples:stationaryInputRows.length,
      stationaryKeyboardRequestMedian:stationaryInputRows.length?median(stationaryInputRows.map(r=>r.ratio)):null},
    interpretation:{scope:'Evidence review heuristics for one Bati; not a native quantity/range contract or physical RPM calibration',
      achievedGearTransitions:'unobserved: no approved gear getter',
      actualThrottle:'unavailable: raw SDK keyboard intent is separate',
      stationaryRevving:'No independent engine-actuation proof is inferred from a label or key alone',
      promotion:'Human review of the real captured timeline and unobserved states is required before any restricted provider recommendation'},
    qualityFailures:failures,evidenceGaps:gaps,warnings};
}

function cli() {
  const args=process.argv.slice(2), value=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];};
  const timeline=value('--timeline'), summary=value('--summary'), output=value('--output');
  if(!timeline||!summary||!output)throw Error('Use --timeline <timeline.ndjson> --summary <capture.json> --output <new .local/build JSON>.');
  const repo=path.dirname(path.dirname(fileURLToPath(import.meta.url))), out=path.resolve(output);
  if(!['.local','build'].some(name=>out.startsWith(path.join(repo,name)+path.sep)))throw Error('Output must be under this repository .local or build.');
  for(let cursor=path.dirname(out);;cursor=path.dirname(cursor)){if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('Linked output parents are not permitted.');if(path.dirname(cursor)===cursor)break;}
  if(fs.statSync(timeline).size>12*1024*1024||fs.statSync(summary).size>65536)throw Error('Input exceeds the bounded capture format.');
  const raw=fs.readFileSync(timeline), terminal=fs.readFileSync(summary);
  const records=raw.toString('utf8').split(/\r?\n/).filter(Boolean).map(line=>{if(Buffer.byteLength(line)>2047)throw Error('Timeline row exceeds 2047 bytes.');return JSON.parse(line);});
  if(records.length>7500)throw Error('Too many bounded timeline rows.');
  const result=analyzeTimeline(records,JSON.parse(terminal.toString('utf8')));
  result.inputIntegrity={timelineSha256:createHash('sha256').update(raw).digest('hex'),summarySha256:createHash('sha256').update(terminal).digest('hex')};
  result.origin='Recorded-data analysis only; this command does not prove live framework provenance.';
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  process.stdout.write(`Analysis: ${result.verdict}; provider qualification remains false.\n`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)cli();
