// Offline arithmetic only. No game/framework dependencies or inferred physical-state labels.
import {isDeepStrictEqual} from 'node:util';
const finite = Number.isFinite;
const point = p => p && ['X','Y','Z'].every(k => finite(p[k]));
const sub = (a,b) => ({X:a.X-b.X,Y:a.Y-b.Y,Z:a.Z-b.Z});
const length = p => Math.hypot(p.X,p.Y,p.Z);
const distance = (a,b) => length(sub(a,b));
const dot = (a,b) => a.X*b.X+a.Y*b.Y+a.Z*b.Z;
const stats = xs => xs.length ? {minimum:Math.min(...xs),maximum:Math.max(...xs),mean:xs.reduce((a,b)=>a+b,0)/xs.length} : null;
const requireEvidence = (ok, reason) => {if(!ok) throw new Error(reason);};
export function analyseMovement({raw,footer,route}) {
  requireEvidence(Array.isArray(raw)&&raw.length>=2&&raw.length<=2500,'missing/bounded raw observations');
  const accepted=footer?.Run?.Samples;
  requireEvidence(Array.isArray(accepted)&&accepted.length>=2&&accepted.length<=raw.length,'missing accepted observations');
  requireEvidence(Array.isArray(route?.Points)&&route.Points.length===5&&route.Points.every(point),'missing five-point route');
  const settings=footer.Run.Settings, driving=footer.Run.Driving;
  requireEvidence(settings&&['WaypointLookahead','FinishRadius','StallSeconds','StationarySpeed','StationaryHoldSeconds','MaxGapSeconds'].every(k=>finite(settings[k])&&settings[k]>0),'missing policy');
  requireEvidence(driving&&finite(driving.FirstTaskRequestedAt)&&finite(driving.LastProgressAt),'missing task/progress timing');
  const byTime=new Map();
  for(let i=0;i<raw.length;i++) {
    const r=raw[i];
    requireEvidence(r&&finite(r.At)&&point(r.Position)&&point(r.Velocity)&&finite(r.Speed)&&r.Speed>=0,'invalid raw measurement');
    requireEvidence(!i||r.At>raw[i-1].At,'nonmonotonic raw observations');
    requireEvidence(!byTime.has(r.At),'duplicate raw timestamp');byTime.set(r.At,r);
  }
  for(let i=0;i<accepted.length;i++) {
    const r=accepted[i]?.Observation;
    requireEvidence(r&&isDeepStrictEqual(byTime.get(r.At),r),'accepted/raw mismatch');
    requireEvidence(!i||r.At>accepted[i-1].Observation.At,'duplicate/nonmonotonic accepted observations');
  }
  const rows=accepted.map(s=>s.Observation), first=rows[0],last=rows.at(-1), start=route.Points[0],target=route.Points[1];
  const direction=sub(target,start), segmentLength=length(direction);
  requireEvidence(segmentLength>0,'zero route segment');
  const projection=r=>dot(sub(r.Position,start),direction)/segmentLength;
  const pairs=[];
  let path=0,integrated=0,maximumProgress=-Infinity,minimumTarget=Infinity;
  let velocityError=0, progressError=0, clockMissing=0;
  for(let i=0;i<rows.length;i++) {
    const r=rows[i];velocityError=Math.max(velocityError,Math.abs(length(r.Velocity)-r.Speed));
    const progress=Math.max(0,projection(r));maximumProgress=Math.max(maximumProgress,progress);
    minimumTarget=Math.min(minimumTarget,distance(r.Position,target));
    requireEvidence(finite(accepted[i].RouteProgress),'missing recorded progress');
    progressError=Math.max(progressError,Math.abs(progress-accepted[i].RouteProgress));
    if(!i)continue;
    const previous=rows[i-1],dt=r.At-previous.At,delta=sub(r.Position,previous.Position),step=length(delta);
    const integral=(previous.Speed+r.Speed)*.5*dt;
    const expected={X:(previous.Velocity.X+r.Velocity.X)*.5*dt,Y:(previous.Velocity.Y+r.Velocity.Y)*.5*dt,Z:(previous.Velocity.Z+r.Velocity.Z)*.5*dt};
    const gameDelta=Number.isInteger(r.GameTimeMs)&&Number.isInteger(previous.GameTimeMs)?(r.GameTimeMs-previous.GameTimeMs+2**32)%2**32:null;
    if(gameDelta===null)clockMissing++;
    path+=step;integrated+=integral;
    pairs.push({at:r.At,dt,gameDeltaMs:gameDelta,step,positionSpeed:step/dt,reportedSpeed:r.Speed,
      meanReportedSpeed:(r.Speed+previous.Speed)*.5,acceleration:(r.Speed-previous.Speed)/dt,
      distanceResidual:step-integral,vectorResidual:length(sub(delta,expected)),progress,
      gap:dt>settings.MaxGapSeconds});
  }
  const peak=rows.reduce((a,b)=>b.Speed>a.Speed?b:a), firstMotionIndex=rows.findIndex((r,i)=>i&&r.Speed>0&&distance(r.Position,rows[i-1].Position)>0);
  const movingIndices=rows.flatMap((r,i)=>r.Speed>settings.StationarySpeed?[i]:[]), lastMovingIndex=movingIndices.at(-1);
  let stopIndex=null, confirmIndex=null;
  if(lastMovingIndex!==undefined&&lastMovingIndex<rows.length-1) {
    stopIndex=lastMovingIndex+1;
    const origin=rows[stopIndex];
    // Observed stationary suffix only; no claim that the physical entity was frozen.
    for(let i=stopIndex;i<rows.length;i++) {
      if(rows[i].Speed>settings.StationarySpeed||distance(rows[i].Position,origin.Position)>1e-9||i>stopIndex&&rows[i].At-rows[i-1].At>settings.MaxGapSeconds) {stopIndex=null;break;}
      if(confirmIndex===null&&rows[i].At-origin.At>=settings.StationaryHoldSeconds)confirmIndex=i;
    }
    if(stopIndex===null)confirmIndex=null;
  }
  const transitions=[];
  for(let i=1;i<rows.length;i++)for(const field of ['TaskState','Gear','ConsoleOpen','GamePaused','Mounted','EngineOn','Collision','Interference'])
    if(!isDeepStrictEqual(rows[i][field],rows[i-1][field]))transitions.push({at:rows[i].At,field,before:rows[i-1][field]??null,after:rows[i][field]??null});
  const firstDecline=pairs.find(p=>p.acceleration<0);
  const stopPair=stopIndex===null?null:pairs[stopIndex-1];
  const counted={};for(const field of ['TaskState','ConsoleOpen','GamePaused','Mounted','EngineOn','Collision','Interference']) {
    counted[field]={};for(const r of rows){const key=r[field]===undefined||r[field]===null?'UNKNOWN':String(r[field]);counted[field][key]=(counted[field][key]??0)+1;}
  }
  return {summary:{schemaVersion:1,kind:'offline-existing-evidence-analysis',units:'uncalibrated native game units',
    rawCount:raw.length,acceptedCount:rows.length,acceptedSeconds:last.At-first.At,
    movement:{firstTaskAt:driving.FirstTaskRequestedAt,firstDisplacementAndSpeedAt:firstMotionIndex<0?null:rows[firstMotionIndex].At,
      peakAt:peak.At,peakSpeed:peak.Speed,firstNegativeSpeedDerivativeAt:firstDecline?.at??null,
      lastAboveStationaryThresholdAt:lastMovingIndex===undefined?null:rows[lastMovingIndex].At,
      stationarySuffixBeginsAt:stopIndex===null?null:rows[stopIndex].At,stationarySuffixConfirmedAt:confirmIndex===null?null:rows[confirmIndex].At,
      stationaryDefinition:{speedAtMost:settings.StationarySpeed,unchangedSampledPosition:true,requiredSeconds:settings.StationaryHoldSeconds},
      lastProgressAt:driving.LastProgressAt,terminationAt:last.At,stallSeconds:last.At-driving.LastProgressAt,
      initialToPeakSeconds:peak.At-first.At,path,integratedSpeedDistance:integrated,absoluteDistanceDifference:Math.abs(path-integrated),
      relativeDistanceDifference:integrated?Math.abs(path-integrated)/integrated:null,
      acceleration:stats(pairs.map(p=>p.acceleration)),positionSpeed:stats(pairs.map(p=>p.positionSpeed)),
      distanceResidual:stats(pairs.map(p=>p.distanceResidual)),vectorResidual:stats(pairs.map(p=>p.vectorResidual)),
      stopPair:stopPair?{...stopPair,beforeSpeed:rows[stopIndex-1].Speed,positionExactlyUnchanged:stopPair.step===0}:null},
    route:{startToMid1:segmentLength,firstDistanceToMid1:distance(first.Position,target),finalDistanceToMid1:distance(last.Position,target),minimumDistanceToMid1:minimumTarget,
      maximumProjectedProgress:maximumProgress,maximumRecordedProgressError:progressError,
      lookahead:settings.WaypointLookahead,stopRange:settings.FinishRadius,enteredLookahead:minimumTarget<=settings.WaypointLookahead,
      passedMid1:rows.some(r=>projection(r)>=segmentLength),lifecycleLookaheadCalls:(footer.Run.Lifecycle??[]).filter(x=>x.startsWith('lookahead task')).length},
    consistency:{maximumSpeedMagnitudeError:velocityError,acceptedDt:stats(pairs.map(p=>p.dt)),gameDeltaMs:stats(pairs.filter(p=>p.gameDeltaMs!==null).map(p=>p.gameDeltaMs)),missingGameClockPairs:clockMissing,
      gapCount:pairs.filter(p=>p.gap).length},transitions,counted,
    limits:'Copied observations corroborate motion and a stationary reporting suffix, not physical freeze, native task identity, navigation, or cause. Source getters are not independent physical instrumentation.'},pairs};
}
