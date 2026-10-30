import { validateNeutralEnvelope } from "./listener-control.mjs";

const norm = (v) => Math.hypot(...v);
const dot = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = (v) => {
  const n = norm(v);
  if (n < 1e-8) throw Error("Ambiguous listener orientation");
  return v.map((x) => x / n);
};
// Quaternion columns are right, forward, up in the original right-handed basis.
// Interpolating an orthonormal rotation avoids the singularity of mixing two
// opposite forward vectors during a legitimate camera turn.
function quaternion(s) {
  const r=unit(cross(s.forward,s.up)),f=s.forward,u=s.up;
  const m00=r[0],m01=f[0],m02=u[0],m10=r[1],m11=f[1],m12=u[1],m20=r[2],m21=f[2],m22=u[2];
  const trace=m00+m11+m22;let q;
  if(trace>0){const t=Math.sqrt(trace+1)*2;q=[(m21-m12)/t,(m02-m20)/t,(m10-m01)/t,t/4];}
  else if(m00>m11&&m00>m22){const t=Math.sqrt(1+m00-m11-m22)*2;q=[t/4,(m01+m10)/t,(m02+m20)/t,(m21-m12)/t];}
  else if(m11>m22){const t=Math.sqrt(1+m11-m00-m22)*2;q=[(m01+m10)/t,t/4,(m12+m21)/t,(m02-m20)/t];}
  else {const t=Math.sqrt(1+m22-m00-m11)*2;q=[(m02+m20)/t,(m12+m21)/t,t/4,(m10-m01)/t];}
  return unit(q);
}
function slerp(a,b,t) {
  let cosine=dot(a,b),q=b;if(cosine<0){cosine=-cosine;q=b.map(x=>-x);}
  if(cosine>.9995)return unit(a.map((x,i)=>x+(q[i]-x)*t));
  const angle=Math.acos(Math.max(-1,Math.min(1,cosine))),sine=Math.sin(angle);
  return a.map((x,i)=>(Math.sin((1-t)*angle)*x+Math.sin(t*angle)*q[i])/sine);
}
function axes([x,y,z,w]) {
  return {forward:[2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)],up:[2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y)]};
}
const same=(a,b)=>a&&b&&['session','generation','coordinates','units','listenerKind'].every(k=>a[k]===b[k]);
// Retrospective presentation permits interpolation between observations which
// have ALREADY arrived. The interactive delay is measured and converges only
// while the pose is stationary. This is control latency, not acoustic distance.
export class ListenerPlayout {
  constructor({ delayMs = 100, interactive = false } = {}) {
    if (![100, 75, 50].includes(delayMs))
      throw Error("Experimental listener delay");
    this.delay = delayMs / 1000;
    if(typeof interactive!=='boolean'||interactive&&delayMs!==100)throw Error('Interactive listener policy requires its reviewed 100 ms maximum');
    this.interactive=interactive;
    this.delayMaximum=this.delay;
    this.delayTarget=this.delay;
    this.lastRenderTime=null;
    this.cadence=[];
    this.observationAnchor=null;
    this.clockStartup=null;
    this.extrapolation = 0.05;
    this.records = [];
    this.lastState = null;
    this.stats = {
      accepted: 0,
      resets: 0,
      coalesced: 0,
      interpolated: 0,
      predicted: 0,
      unavailable: 0,
      presentationBlocks:0,
      presentationPredicted:0,
      presentationUnavailable:0,
      adaptiveDelayMinimumMs:delayMs,
      adaptiveDelayMaximumMs:delayMs,
      delayFrozenDuringMotion:0,
      startupClockCalibrations:0,
      startupClockSkipped:0,
      startupClockMaximumShiftMs:0,
    };
  }
  add(envelope, audioTime, hostMs) {
    if (
      !Number.isFinite(audioTime) ||
      audioTime < 0 ||
      !Number.isFinite(hostMs) ||
      hostMs < 0
    )
      throw Error("Listener receipt clock");
    const message = validateNeutralEnvelope(envelope, this.lastState),
      s = message.state;
    const changed =
      !this.lastState ||
      s.session !== this.lastState.session ||
      s.generation !== this.lastState.generation;
    const receiptMappedTime=audioTime-message.receiptAgeMs/1000;
    const anchor=this.interactive&&!changed?this.observationAnchor:null;
    const time=anchor?anchor.time+(s.observationTicks-anchor.ticks)/s.clockFrequency:receiptMappedTime,
      previous=this.records.at(-1);
    if (previous && hostMs < previous.hostMs)
      throw Error("Listener receipt clock reversed");
    if (
      !changed &&
      previous &&
      (s.coordinates !== previous.state.coordinates ||
        s.units !== previous.state.units ||
        s.listenerKind !== previous.state.listenerKind)
    )
      throw Error("Listener representation changed without generation");
    if (!changed && previous && time < previous.time - 1e-9)
      throw Error("Mapped observation clock reversed");
    if (
      !changed &&
      previous &&
      Math.abs(time - previous.time) <= 1e-9 &&
      ["position", "velocity", "forward", "up"].some((key) =>
        s[key].some(
          (value, i) => Math.abs(value - previous.state[key][i]) > 1e-9,
        ),
      )
    )
      throw Error("Listener pose changed without mapped time");
    if (
      !changed &&
      previous &&
      time > previous.time + 1e-9 &&
      s.valid &&
      previous.state.valid
    ) {
      if (
        dot(s.forward, previous.state.forward) < -0.99 ||
        dot(s.up, previous.state.up) < -0.99
      )
        throw Error("Listener orientation discontinuity needs generation");
      if (
        s.units === "metres" &&
        norm(s.position.map((x, i) => x - previous.state.position[i])) /
          (time - previous.time) >
          100 + 1e-6
      )
        throw Error("Listener position discontinuity needs generation");
    }
    if (changed) {
      this.records = [];
      this.cadence=[];
      this.delay=this.delayMaximum;this.delayTarget=this.delayMaximum;this.lastRenderTime=null;
      this.observationAnchor={time,ticks:s.observationTicks};
      this.clockStartup={status:'warming',reference:s,firstTicks:s.observationTicks,shiftMs:0,samples:0};
      this.stats.resets++;
    } else if (previous && Math.abs(time - previous.time) <= 1e-9) {
      this.records.pop();
      this.stats.coalesced++;
    }
    if(this.interactive&&previous&&!changed&&time>previous.time+1e-9){
      const observationInterval=(s.observationTicks-previous.state.observationTicks)/s.clockFrequency;
      this.cadence.push({interval:observationInterval,age:message.receiptAgeMs/1000});
      if(this.cadence.length>32)this.cadence.shift();
      if(this.cadence.length>=3){
        const intervals=this.cadence.map(x=>x.interval).sort((a,b)=>a-b),ages=this.cadence.map(x=>x.age).sort((a,b)=>a-b);
        // Observed 95th-percentile acquisition cadence plus transport age
        // and one millisecond guard. Prediction is never enlarged to hide a gap.
        const p95=a=>a[Math.min(a.length-1,Math.ceil(a.length*.95)-1)];
        this.delayTarget=Math.min(this.delayMaximum,Math.max(.025,p95(intervals)+p95(ages)+.001));
      }
    }
    this.records.push({
      time,
      hostMs,
      receiptAgeMs: message.receiptAgeMs,
      state: s,
      rotation:quaternion(s),
      originalObservationSeconds:s.observationTicks/s.clockFrequency,
      receiptMappedTime,
    });
    if(this.interactive&&this.clockStartup.status==='warming'){
      const startup=this.clockStartup,reference=startup.reference;
      const stationary=s.valid&&!s.paused&&norm(s.velocity)<1e-9&&
        norm(s.position.map((x,i)=>x-reference.position[i]))<1e-9&&
        dot(s.forward,reference.forward)>1-1e-12&&dot(s.up,reference.up)>1-1e-12;
      if(!stationary){
        startup.status='skipped';startup.reason='identity-pose-moved-or-unavailable';this.stats.startupClockSkipped++;
      }else if((s.observationTicks-startup.firstTicks)/s.clockFrequency>=.75&&this.records.length>=8){
        // The first receipt can arrive before cold worker/PCM prefill has
        // established the render clock's steady phase. Estimate that COMMON
        // phase from eight warm receipts, never from each subsequent packet.
        // Every pose since identity start must be stationary: shifting labels
        // during motion would change the sampled position clock and Doppler.
        const offsets=this.records.slice(-8).map(r=>r.receiptMappedTime-r.time).sort((a,b)=>a-b),
          shift=(offsets[3]+offsets[4])/2;
        startup.samples=offsets.length;
        startup.receiptSpreadMs=(offsets.at(-1)-offsets[0])*1000;
        startup.observationSpanMs=(s.observationTicks-startup.firstTicks)*1000/s.clockFrequency;
        if(Math.abs(shift)>this.delayMaximum){
          startup.status='skipped';startup.reason='startup-phase-offset-exceeds-bound';this.stats.startupClockSkipped++;
        }else{
          this.observationAnchor.time+=shift;
          for(const record of this.records)record.time+=shift;
          startup.status='calibrated';startup.reason='one-common-stationary-startup-phase';startup.shiftMs=shift*1000;
          this.stats.startupClockCalibrations++;
          this.stats.startupClockMaximumShiftMs=Math.max(this.stats.startupClockMaximumShiftMs,Math.abs(startup.shiftMs));
        }
      }
    }
    while (
      this.records.length > 128 ||
      (this.records.length > 2 && this.records[1].time < this.records.at(-1).time - 2.5)
    )
      this.records.shift();
    this.lastState = s;
    this.stats.accepted++;
    return message;
  }
  sample(renderTime, hostMs) {
    if (
      !Number.isFinite(renderTime) ||
      renderTime < 0 ||
      !Number.isFinite(hostMs) ||
      hostMs < 0
    )
      throw Error("Listener playout clock");
    if(this.interactive){
      if(this.lastRenderTime!==null&&renderTime>=this.lastRenderTime){
        const latest=this.records.at(-1),target=renderTime-this.delay;
        const first=Math.max(0,this.records.findLastIndex(r=>r.time<=target));
        // Converge the position clock only while its whole playable interval is
        // stationary. Slewing delay during motion changes apparent velocity and
        // Doppler (95 m/s became104.5 m/s at the former10% clock slew).
        const stationary=latest&&this.records.slice(first).every(r=>r.state.valid&&!r.state.paused&&
          norm(r.state.velocity)<1e-9&&norm(r.state.position.map((x,i)=>x-latest.state.position[i]))<1e-9&&
          dot(r.state.forward,latest.state.forward)>1-1e-12&&dot(r.state.up,latest.state.up)>1-1e-12);
        if(stationary){
          const maximumChange=(renderTime-this.lastRenderTime)*.1;
          this.delay+=Math.max(-maximumChange,Math.min(maximumChange,this.delayTarget-this.delay));
        }else if(Math.abs(this.delayTarget-this.delay)>1e-9)this.stats.delayFrozenDuringMotion++;
      }
      this.lastRenderTime=renderTime;
      this.stats.adaptiveDelayMinimumMs=Math.min(this.stats.adaptiveDelayMinimumMs,this.delay*1000);
      this.stats.adaptiveDelayMaximumMs=Math.max(this.stats.adaptiveDelayMaximumMs,this.delay*1000);
    }
    const targetTime = renderTime - this.delay,
      last = this.records.at(-1);
    const result = {
      state: null,
      mode: "warming",
      targetTime,
      playoutSeconds: this.delay,
      newestAgeSeconds: last ? renderTime - last.time : null,
      receiptAgeMs: last?.receiptAgeMs ?? null,
      extrapolationSeconds: 0,
    };
    const missing = (mode) => {
      this.stats.unavailable++;
      return { ...result, mode };
    };
    if (!last) return missing("missing");
    if (hostMs < last.hostMs) return missing("clock-invalid");
    if (!last.state.valid || last.state.paused)
      return missing("invalid-or-paused");
    if (last.receiptAgeMs + hostMs - last.hostMs > 250)
      return missing("stale-wall-clock");
    if (targetTime < this.records[0].time) return missing("warming");
    let a = this.records[0],
      b = null;
    for (const r of this.records) {
      if (r.time <= targetTime) a = r;
      else {
        b = r;
        break;
      }
    }
    if (
      !a.state.valid ||
      a.state.paused ||
      (b && (!b.state.valid || b.state.paused))
    )
      return missing("invalid-interval");
    let state,
      mode,
      extrapolationSeconds = 0;
    if (b) {
      if (b.time - a.time > 0.25) return missing("observation-gap");
      const u = (targetTime - a.time) / (b.time - a.time),
        mix = (x, y) => x.map((v, i) => v + (y[i] - v) * u);
      const {forward,up}=this.interactive?axes(slerp(a.rotation,b.rotation,u)):(()=>{
        const forward=unit(mix(a.state.forward,b.state.forward)),up0=mix(a.state.up,b.state.up),projection=dot(up0,forward);
        return {forward,up:unit(up0.map((x,i)=>x-projection*forward[i]))};
      })();
      state = {
        ...a.state,
        position: mix(a.state.position, b.state.position),
        velocity: mix(a.state.velocity, b.state.velocity),
        forward,
        up,
      };
      mode = "interpolated";
      this.stats.interpolated++;
    } else {
      extrapolationSeconds = targetTime - a.time;
      if (extrapolationSeconds > this.extrapolation + 1e-9)
        return missing("prediction-expired");
      state = {
        ...a.state,
        position: a.state.position.map(
          (x, i) => x + a.state.velocity[i] * extrapolationSeconds,
        ),
      };
      mode = extrapolationSeconds > 1e-9 ? "predicted" : "exact";
      this.stats.predicted++;
    }
    return { ...result, state, mode, extrapolationSeconds };
  }
  presentation(control, sampled, renderTime, hostMs) {
    if(!Number.isFinite(renderTime)||renderTime<0||!Number.isFinite(hostMs)||hostMs<0||
      !control||control.frame!==Math.round(renderTime*48000)||!Array.isArray(control.paths))throw Error('Presentation clock/control boundary');
    if(!this.interactive) return {control,muteBlock:false,diagnostic:{policy:'buffered',spatialDelayMs:this.delay*1000}};
    const latest=this.records.at(-1),previous=this.records.at(-2),context=sampled?.state;
    // Forecasting and latest-pose followers were rejected by actual-component
    // comparisons: they reduced latency but worsened spatial continuity. Use
    // one coherent retrospective pose reconstructed from genuinely arrived data.
    const presentationDelay=this.delay,presentationTime=renderTime-presentationDelay;
    const diagnostic={policy:'interactive-bounded',spatialDelayMs:this.delay*1000,spatialTargetTime:sampled?.targetTime??null,
      orientationObservationAgeMs:latest?(renderTime-latest.time)*1000:null,orientationPredictionMs:0,orientationPredictionDegrees:0,
      orientationTargetTime:presentationTime,orientationPresentationDelayMs:presentationDelay*1000,
      angularForecastBudgetDegrees:0,angularForecastHorizonMs:0,
      observationSequence:latest?.state.sequence??null,generation:latest?.state.generation??null,
      originalObservationIntervalMs:previous&&latest?(latest.state.observationTicks-previous.state.observationTicks)*1000/latest.state.clockFrequency:null,
      mappedObservationIntervalMs:previous&&latest?(latest.time-previous.time)*1000:null,
      observationClockPolicy:'identity-anchored-original-QPC',
      observationClockStartup:this.clockStartup?{status:this.clockStartup.status,reason:this.clockStartup.reason??null,
        shiftMs:this.clockStartup.shiftMs,samples:this.clockStartup.samples,
        receiptSpreadMs:this.clockStartup.receiptSpreadMs??null,observationSpanMs:this.clockStartup.observationSpanMs??null}:null,
      positionDelayPolicy:'stationary-only-convergence',
      preservesRetardedTime:true};
    const invalid=!context||!latest||!same(context,latest.state)||!latest.state.valid||latest.state.paused||hostMs<latest.hostMs||
      latest.receiptAgeMs+hostMs-latest.hostMs>250;
    const unavailable=()=>{this.stats.presentationUnavailable++;return {control:{...control,paths:[]},muteBlock:false,
      diagnostic:{...diagnostic,mode:'unavailable',release:'existing-bounded-path-release'}};};
    if(invalid)return unavailable();
    let a=this.records[0],b=null;
    if(presentationTime<a.time)return unavailable();
    for(const r of this.records){if(r.time<=presentationTime)a=r;else{b=r;break;}}
    if(!a.state.valid||a.state.paused||b&&(!b.state.valid||b.state.paused)||b&&b.time-a.time>.25)return unavailable();
    let rotation,position,predictionSeconds=0,mode;
    if(b){
      const u=(presentationTime-a.time)/(b.time-a.time);
      rotation=slerp(a.rotation,b.rotation,u);
      position=a.state.position.map((x,i)=>x+(b.state.position[i]-x)*u);
      mode='interpolated-responsive';
    }else{
      predictionSeconds=presentationTime-a.time;
      if(predictionSeconds>this.extrapolation+1e-9)return unavailable();
      rotation=a.rotation;
      position=a.state.position.map((x,i)=>x+a.state.velocity[i]*predictionSeconds);
      mode=predictionSeconds>1e-9?'position-only-gap-prediction':'latest-observed';
    }
    // The last output sample is still retrospective. Qualify its pose only from
    // observations already in this identity's arrived buffer; never extend an
    // angular forecast to fill the output block.
    const requestedPanEndTime=presentationTime+511/48000;
    let knownUntil=latest.time,prefixStopReason='latest-arrived-observation';
    for(let i=0;i<this.records.length-1;i++){
      const left=this.records[i],right=this.records[i+1];
      if(right.time<=presentationTime)continue;
      if(left.time>=requestedPanEndTime)break;
      if(!left.state.valid||left.state.paused||!right.state.valid||right.state.paused||right.time-left.time>.25){
        knownUntil=Math.min(knownUntil,left.time);
        prefixStopReason='invalid-paused-or-gapped-observation-interval';break;
      }
    }
    const panFrames=Math.min(512,Math.max(0,Math.floor((knownUntil-presentationTime)*48000+1e-6)+1)),
      panEndTime=presentationTime+Math.max(0,panFrames-1)/48000;
    let endPose=null,endA=this.records[0],endB=null;
    if(panFrames>=2){
      for(const r of this.records){if(r.time<=panEndTime)endA=r;else{endB=r;break;}}
      if(endA.state.valid&&!endA.state.paused&&(!endB||endB.state.valid&&!endB.state.paused&&endB.time-endA.time<=.25)){
        const u=endB?(panEndTime-endA.time)/(endB.time-endA.time):0;
        endPose={...axes(endB?slerp(endA.rotation,endB.rotation,u):endA.rotation),
          position:endA.state.position.map((x,i)=>x+(endB?endB.state.position[i]-x:0)*u)};
      }
    }
    diagnostic.panReconstruction={qualified:Boolean(endPose),complete:Boolean(endPose)&&panFrames===512,
      frames:endPose?panFrames:0,endTargetTime:endPose?panEndTime:null,requestedEndTargetTime:requestedPanEndTime,
      unknownTailFrames:endPose?512-panFrames:512,
      prefixStopReason:endPose&&panFrames===512?null:prefixStopReason,
      basis:'arrived-observation-brackets',angularForecast:false,
      unavailableReason:endPose?null:'output-endpoint-not-genuinely-bracketed'};
    let {forward,up}=axes(rotation);
    if(context.coordinates==='gta-native-unscaled'){
      const mapping=control.geometry?.presentationAxes;
      if(!Array.isArray(mapping)||mapping.length!==3||mapping.some(row=>!Array.isArray(row)||row.length!==3||
        row.some(x=>!Number.isFinite(x))||Math.abs(norm(row)-1)>1e-9)||
        mapping.some((row,i)=>mapping.some((other,j)=>i!==j&&Math.abs(dot(row,other))>1e-9))||
        dot(cross(mapping[0],mapping[1]),mapping[2])<1-1e-9)return unavailable();
      forward=unit(mapping.map(row=>dot(row,forward)));up=unit(mapping.map(row=>dot(row,up)));
      const scale=control.geometry?.presentationScale,buffered=control.geometry?.mappedListener?.position;
      if(!Number.isFinite(scale)||scale<1e-4||scale>100||!Array.isArray(buffered)||buffered.length!==3||
        buffered.some(x=>!Number.isFinite(x)))return unavailable();
      const mappedVelocity=mapping.map(row=>dot(row,latest.state.velocity)*scale);
      const observationDt=previous?(latest.state.observationTicks-previous.state.observationTicks)/latest.state.clockFrequency:0;
      const movement=previous?mapping.map(row=>dot(row,latest.state.position.map((x,i)=>x-previous.state.position[i]))*scale):[0,0,0];
      if(norm(mappedVelocity)>100+1e-6||previous&&observationDt>0&&norm(movement)/observationDt>100+1e-6)return unavailable();
      const delta=position.map((x,i)=>x-context.position[i]);
      position=buffered.map((x,i)=>x+dot(mapping[i],delta)*scale);
      if(endPose){
        endPose.forward=unit(mapping.map(row=>dot(row,endPose.forward)));
        endPose.up=unit(mapping.map(row=>dot(row,endPose.up)));
        const endDelta=endPose.position.map((x,i)=>x-context.position[i]);
        endPose.position=buffered.map((x,i)=>x+dot(mapping[i],endDelta)*scale);
      }
      diagnostic.nativeToModelRotation=true;
    }
    diagnostic.presentationPositionPredictionMs=predictionSeconds*1000;
    const right=unit(cross(forward,up)),endRight=endPose?unit(cross(endPose.forward,endPose.up)):null;
    const paths=control.paths.map(p=>{
      if(!Array.isArray(p.arrivalDirection)||p.arrivalDirection.length!==3||p.arrivalDirection.some(x=>!Number.isFinite(x))||
        Math.abs(norm(p.arrivalDirection)-1)>1e-6&&!(norm(p.arrivalDirection)<1e-8&&Number.isFinite(p.distance)&&
          p.distance>=0&&p.distance<=1e-8&&p.order===0))throw Error('Invalid presentation arrival direction');
      if(p.arrivalOrigin){
        if(!Array.isArray(p.arrivalOrigin)||p.arrivalOrigin.length!==3||p.arrivalOrigin.some(x=>!Number.isFinite(x)))throw Error('Invalid retained arrival origin');
      }
      // Reconstruct only the presentation endpoint of this already qualified
      // retarded arrival. Visibility, distance, delay, gain and source history
      // are unchanged; this creates no additional acoustic path.
      const panAt=(at,rightAt)=>{
        let direction=p.arrivalDirection;
        if(p.arrivalOrigin){const delta=p.arrivalOrigin.map((x,i)=>x-at[i]);if(norm(delta)>1e-8)direction=unit(delta);}
        return Math.max(-1,Math.min(1,dot(direction,rightAt)));
      };
      const pan=panAt(position,right);
      const {panTrajectory:discarded,...path}=p;
      return {...path,pan,...(endPose?{panTrajectory:{frame:control.frame,frames:panFrames,start:pan,
        end:panAt(endPose.position,endRight),basis:'arrived-observation-brackets'}}:{})};
    });
    this.stats.presentationBlocks++;
    return {control:{...control,paths},muteBlock:false,diagnostic:{...diagnostic,mode}};
  }
}
