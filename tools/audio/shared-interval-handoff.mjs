// Opt-in read-only research. No PCM generation or historical-policy mutation.
import {performance} from 'node:perf_hooks';
import {deriveCoverage,stateAt,controlRange,trajectory} from './transition-feasibility.mjs';
export const policyId='shared-interval-v1';
const RATE=48000,TOTAL=720000,SEAM=96;
export const contract=Object.freeze({id:policyId,transfer:'Retain successful legacy boundary decisions; otherwise first legal integer frame inside the same shared active interval, to the next existing path context only',
  reads:'Target plus existing 96-frame outer continuation calculations; all 24 memory loads count, including zero-weight or discarded work',
  eligibility:'The nominal event and each contributing provider interval retain the conservative 2% state, both rounded-period rates, actual rate and source-bound checks. This per-provider interpretation is the candidate contract.',
  preservation:'Ownership metadata only: no cursor, fraction, rate, source identity, event extent, cumulative clock or control change',stop:'First failed read or ownership condition; no alternate policy/path/trajectory'});
export function buildCatalogue(grains,sourceFrames){
  const coverage=deriveCoverage(grains,sourceFrames),bands=new Map(coverage.rows.map(r=>[r.index,r]));
  return {sourceFrames,coverage,rows:grains.slice(0,-1).map((g,index)=>({index,start:g.UnkUint1,end:grains[index+1].UnkUint1,frames:grains[index+1].UnkUint1-g.UnkUint1,state:(g.UnkFloat1+grains[index+1].UnkFloat1)/2,band:bands.get(index)??null}))};
}
export function cursorAt(op,frame){return op.sourcePosition+(frame-op.startFrame)*op.rate;}
export function tapBounds(op,frame){const base=Math.floor(cursorAt(op,frame));return [base-11,base+12];}
function firstTrue(lo,hi,predicate){while(lo<hi){const m=Math.floor((lo+hi)/2);if(predicate(m))hi=m;else lo=m+1;}return lo;}
function rangeEligibility(row,first,last,sourceFrames){
  const range=controlRange(first/RATE,last/RATE),error=Math.max(Math.abs(row.state-range[0])/range[0],Math.abs(row.state-range[1])/range[1]),lengths=[Math.floor(RATE/range[1]),Math.ceil(RATE/range[0])],rates=lengths.map(n=>row.frames/n);
  let reason=null;if(row.start<16||row.end+SEAM*1.05+16>=sourceFrames)reason='provider_source_margin';else if(row.state<14||row.state>28||error>.02)reason='provider_state_tolerance';else if(rates.some(r=>r<.95||r>1.05))reason='provider_rounded_period_rate';else if(!row.band||range[0]<row.band.lo||range[1]>row.band.hi)reason='provider_conservative_band';
  return {passed:reason===null,reason,stateRange:range,stateError:error,roundedEventLengths:lengths,periodReadRates:rates,band:row.band?[row.band.lo,row.band.hi]:null};
}
function earliestBadFrame(row,first,end,sourceFrames){
  const cuts=[first,...trajectory.map(p=>p.t*RATE).filter(n=>n>first&&n<end),end];
  for(let i=0;i<cuts.length-1;i++){const a=cuts[i],b=cuts[i+1]-1;if(!rangeEligibility(row,a,a,sourceFrames).passed)return a;
    if(!rangeEligibility(row,a,b,sourceFrames).passed)return firstTrue(a,b,n=>!rangeEligibility(row,n,n,sourceFrames).passed);
  }return null;
}
export function checkReadOperation(op,catalogue,sourceKey){
  if(!op||!['target','continuation'].includes(op.kind)||!Number.isSafeInteger(op.startFrame)||!Number.isSafeInteger(op.endFrame)||op.startFrame<0||op.endFrame<=op.startFrame||op.endFrame>TOTAL||!Number.isFinite(op.sourcePosition)||!Number.isFinite(op.rate)||op.rate<.95||op.rate>1.05||!Number.isSafeInteger(op.activeInterval))throw Error('invalid source read operation');
  const footprint=[tapBounds(op,op.startFrame)[0],tapBounds(op,op.endFrame-1)[1]],proof={sourceKey,activeInterval:op.activeInterval,startFrame:op.startFrame,endFrame:op.endFrame,kind:op.kind,footprint,providers:[],eligibilityEvaluations:0,readRangeChecks:1,passed:false,failure:null};
  if(footprint[0]<0||footprint[1]>=catalogue.sourceFrames){proof.failure={frame:op.startFrame,kind:'sampler_bounds',footprint,reason:'The real modulo sampler would read outside validated source bounds'};return proof;}
  if(!catalogue.rows.length||footprint[0]<catalogue.rows[0].start||footprint[1]>=catalogue.rows.at(-1).end){proof.failure={frame:op.startFrame,kind:'unmapped_sampler_context',footprint};return proof;}
  const active=catalogue.rows.find(r=>r.index===op.activeInterval);if(!active)throw Error('invalid active source identity');
  if(op.kind==='target'&&(op.sourcePosition<active.start||cursorAt(op,op.endFrame-1)>=active.end))throw Error('target read does not belong to declared active interval');
  if(op.kind==='continuation'){const previous=catalogue.rows.find(r=>r.index===op.continuationFrom);if(!previous||op.sourcePosition!==previous.end||op.endFrame-op.startFrame>SEAM)throw Error('invalid continuation source identity or extent');}
  const dependencies=[];
  for(const row of catalogue.rows){if(row.end<=footprint[0]||row.start>footprint[1])continue;
    // Exact floor-based sampler predicates and bounded binary searches identify
    // every frame this provider supplies; no sparse control-state sampling.
    const first=firstTrue(op.startFrame,op.endFrame,n=>tapBounds(op,n)[1]>=row.start),end=firstTrue(first,op.endFrame,n=>tapBounds(op,n)[0]>=row.end);
    if(first<end)dependencies.push({row,first,end});
  }
  dependencies.sort((a,b)=>a.first-b.first||a.row.index-b.row.index);
  const failures=[];for(const {row,first,end}of dependencies){const eligibility=rangeEligibility(row,first,end-1,catalogue.sourceFrames);proof.eligibilityEvaluations++;
    proof.providers.push({interval:row.index,firstFrame:first,endFrame:end,...eligibility});
    if(!eligibility.passed){const frame=earliestBadFrame(row,first,end,catalogue.sourceFrames),bounds=tapBounds(op,frame),tap=Math.max(row.start,bounds[0]);
      failures.push({frame,time:frame/RATE,kind:eligibility.reason,operation:op.kind,activeInterval:op.activeInterval,providerInterval:row.index,providerState:row.state,providerSourceRange:[row.start,row.end],providerUseFrames:[first,end],requestedState:stateAt(frame/RATE),stateErrorAtFailure:Math.abs(row.state-stateAt(frame/RATE))/stateAt(frame/RATE),rate:op.rate,sourceCursor:cursorAt(op,frame),fractionalCursor:cursorAt(op,frame)-Math.floor(cursorAt(op,frame)),requiredTapRange:bounds,firstRequiredSourceIndex:tap,tapIndex:tap-bounds[0],eligibility});}
  }
  if(failures.length){failures.sort((a,b)=>a.frame-b.frame||a.firstRequiredSourceIndex-b.firstRequiredSourceIndex);proof.failure=failures[0];return proof;}
  proof.passed=true;return proof;
}
export function readerSnapshot(event,frame,owner,sourceKey){
  if(!Number.isSafeInteger(event.index)||!Number.isSafeInteger(event.start)||!Number.isSafeInteger(event.end)||event.end<=event.start||['sourceStart','sourceEnd','speed','clockStart','clockEnd'].some(k=>!Number.isFinite(event[k]))||event.speed<.95||event.speed>1.05)throw Error('invalid reader state');
  if(!Number.isSafeInteger(frame)||frame<event.start||frame>event.end)throw Error('snapshot outside active interval lifetime');
  // At the existing event boundary, the legacy reader uses its stored integer
  // sourceEnd for continuation. This is a logical endpoint, not an extra sample.
  const completeEvent=event.fullEnd===undefined||event.end===event.fullEnd;
  const cursor=frame===event.end&&completeEvent?event.sourceEnd:event.sourceStart+(frame-event.start)*event.speed;
  return Object.freeze({owner,sourceKey,interval:event.index,frame,cursor,fractionalCursor:cursor-Math.floor(cursor),rate:event.speed,eventStart:event.start,eventEnd:event.end,clockStart:event.clockStart,clockEnd:event.clockEnd});
}
const protectedKeys=['sourceKey','interval','frame','cursor','fractionalCursor','rate','eventStart','eventEnd','clockStart','clockEnd'];
export function assertPreserved(before,after){for(const k of protectedKeys)if(before[k]===undefined||k!=='sourceKey'&&(!Number.isFinite(before[k])||!Number.isFinite(after[k]))||!Object.is(before[k],after[k]))throw Error('ownership changes protected playback field: '+k);if(!Object.is(before.fractionalCursor,before.cursor-Math.floor(before.cursor)))throw Error('inconsistent fractional cursor');return true;}
export function transferOwnership(before,outgoing,incoming,proof){
  if(before.owner!==outgoing.id||!outgoing.indices.includes(before.interval)||!incoming.indices.includes(before.interval))throw Error('no shared active source identity');
  const v=stateAt(before.frame/RATE);for(const context of [outgoing,incoming])if(!Number.isFinite(context.lo)||!Number.isFinite(context.hi)||v<context.lo||v>context.hi)throw Error('ownership outside instantaneous context overlap');
  const logicalEnd=before.frame===before.eventEnd&&before.frame===proof.endFrame;
  if(!proof.passed||proof.sourceKey!==before.sourceKey||proof.activeInterval!==before.interval||before.frame<proof.startFrame||before.frame>=proof.endFrame&&!logicalEnd)throw Error('missing valid read proof for ownership transfer');
  const after=Object.freeze({...before,owner:incoming.id});assertPreserved(before,after);return after;
}
export function firstLegalTransferFrame(event,outgoing,incoming,from=event.start){
  if(!Number.isSafeInteger(from)||from<event.start||from>=event.end)throw Error('handoff search extent');
  if(!outgoing.indices.includes(event.index)||!incoming.indices.includes(event.index))return null;
  const lo=Math.max(outgoing.lo,incoming.lo),hi=Math.min(outgoing.hi,incoming.hi);if(lo>hi)return null;
  // Control is monotone within each original trajectory segment. Find the first
  // legal frame in each segment; never alter the event or audition other times.
  const cuts=[from,...trajectory.map(p=>p.t*RATE).filter(n=>n>from&&n<event.end),event.end];
  for(let i=0;i<cuts.length-1;i++){const a=cuts[i],b=cuts[i+1];if(a>=b)continue;const rising=stateAt((b-1)/RATE)>=stateAt(a/RATE),f=firstTrue(a,b,n=>rising?stateAt(n/RATE)>=lo:stateAt(n/RATE)<=hi);if(f<b){const v=stateAt(f/RATE);if(v>=lo&&v<=hi)return f;}}
  return null;
}
export function verifyEventCoverage(events,expectedPrefix){
  if(!Array.isArray(events)||events.length>450||!Number.isSafeInteger(expectedPrefix)||expectedPrefix<0||expectedPrefix>TOTAL)throw Error('coverage extent');
  let frame=0,clock=0;for(const e of events){const next=clock+RATE/stateAt(frame/RATE),end=Math.min(Math.round(next),TOTAL);
    if(e.start!==frame||e.end!==end||!Object.is(e.clockStart,clock)||!Object.is(e.clockEnd,next)||e.fullEnd!==Math.round(next))throw Error('gap, duplicate frame or changed event clock');frame=end;clock=next;}
  if(frame!==expectedPrefix)throw Error('uncovered output prefix');return true;
}
export function planSharedOwnership(baseline,catalogue,sourceKey,{policy}={}){
  if(policy!==policyId)throw Error('shared-interval-v1 requires explicit opt-in');
  if(!baseline.route||baseline.route.length<2||baseline.route.length>258)throw Error('bounded baseline route required');
  if(typeof sourceKey!=='string'||!sourceKey||baseline.sourceSha256&&baseline.sourceSha256!==sourceKey||JSON.stringify(baseline.coverage.rows)!==JSON.stringify(catalogue.coverage.rows))throw Error('baseline source catalogue/fingerprint mismatch');
  const started=performance.now(),route=baseline.route,byIndex=new Map(catalogue.rows.map(r=>[r.index,r])),events=[],transfers=[],readProofs=[];let owner=route[0],clock=0,start=0,previous=null,failure=null,eligibilityEvaluations=0,ownershipChecks=0,rangeChecks=0;
  while(start<TOTAL){if(events.length>=450)throw Error('event bound');const requested=stateAt(start/RATE),clockEnd=clock+RATE/requested,rawEnd=Math.round(clockEnd),end=Math.min(rawEnd,TOTAL),range=controlRange(start/RATE,end/RATE),ordered=start/RATE<8?route:[...route].reverse(),next=ordered[ordered.indexOf(owner)+1];
    const oldCandidateEligible=next&&next.lo<=range[0]&&range[1]<=next.hi,legacyTransfer=start>=RATE&&next&&previous&&next.indices.includes(previous.index)&&owner.indices.includes(previous.index)&&oldCandidateEligible;
    // Keep the source choice the legacy successful decision would have made.
    // For a blocked case, ownership is deferred until inside this same event.
    const selectedOwner=legacyTransfer?next:owner;if(previous&&!selectedOwner.indices.includes(previous.index)){failure={frame:start,kind:'ownership_would_relocate_source',activeInterval:previous.index};break;}
    const index=previous&&previous.index!==selectedOwner.indices.at(-1)?previous.index+1:selectedOwner.indices[0],row=byIndex.get(index);
    if(!row){failure={frame:start,kind:'missing_active_interval',index};break;}
    const nominal=rangeEligibility(row,start,end,catalogue.sourceFrames);eligibilityEvaluations++;if(!nominal.passed){failure={frame:start,kind:'active_interval_ineligible',activeInterval:index,...nominal};break;}
    const event={start,end,fullEnd:rawEnd,index,sourceStart:row.start,sourceEnd:row.end,requestedState:requested,stateRange:range,speed:row.frames/(rawEnd-start),clockStart:clock,clockEnd,owner:selectedOwner.id,boundary:!previous?'start':previous.end===row.start?'internal':'wrap'};
    const operations=[{kind:'target',startFrame:start,endFrame:end,sourcePosition:row.start,rate:event.speed,activeInterval:index}];
    if(event.boundary==='wrap')operations.push({kind:'continuation',startFrame:start,endFrame:Math.min(end,start+SEAM),sourcePosition:previous.end,rate:previous.speed,activeInterval:index,continuationFrom:previous.index});
    const proofs=operations.map(op=>checkReadOperation(op,catalogue,sourceKey));for(const proof of proofs){rangeChecks+=proof.readRangeChecks;eligibilityEvaluations+=proof.eligibilityEvaluations;readProofs.push(proof);}
    const firstFailure=proofs.filter(p=>!p.passed).sort((a,b)=>a.failure.frame-b.failure.frame||(a.kind==='target'?-1:1))[0];
    if(firstFailure)failure={...firstFailure.failure,category:'actual_read',eventStart:start,eventEnd:end,context:owner.indices,proposedContext:next?.indices??null,eventClockStart:clock,eventClockEnd:clockEnd,sourceFingerprint:sourceKey};
    if(failure)break;
    if(legacyTransfer){ownershipChecks++;const before=readerSnapshot(previous.event,start,owner.id,sourceKey),after=transferOwnership(before,owner,next,previous.proof);transfers.push({frame:start,kind:'legacy_boundary',before,after,preserved:true});owner=next;}
    else if(owner.lo>range[0]||range[1]>owner.hi){ownershipChecks++;const frame=next?firstLegalTransferFrame(event,owner,next):null;
      if(frame===null){failure={frame:start,kind:'no_legal_shared_interval_transfer',activeInterval:index,context:owner.indices,proposedContext:next?.indices??null};break;}
      const before=readerSnapshot(event,frame,owner.id,sourceKey),after=transferOwnership(before,owner,next,proofs[0]);transfers.push({frame,requestedState:stateAt(frame/RATE),kind:frame===start?'shared_boundary':'shared_intra_event',before,after,preserved:true});owner=next;
    }
    events.push(event);previous={...row,speed:event.speed,event,proof:proofs[0]};clock=clockEnd;start=end;
  }
  verifyEventCoverage(events,start);
  return {schemaVersion:1,policy:contract,complete:!failure&&start===TOTAL,validPrefixFrames:start,events,transfers,readProofs,failure,renderedFrames:0,
    performance:{planningMs:performance.now()-started,eligibilityEvaluations,ownershipChecks,readRangeChecks:rangeChecks,rssBytes:process.memoryUsage().rss},
    evidenceBoundary:'Read-only planning and dependency validation. No PCM, waveform or perceptual result.'};
}
