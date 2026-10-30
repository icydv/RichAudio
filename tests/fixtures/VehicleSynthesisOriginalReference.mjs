// Original bounded additive combustion + independent stochastic component synthesis.
// Oscillator phases advance from engine speed, never vehicle road speed. No samples,
// nonlinear waveshaper, audio endpoint, lookahead, FFT allocation or async work.
import {createVehicleProfile, vehicleLayerNames, vehicleProfiles} from './VehicleSynthesisOriginalProfiles.mjs';
const FS = 48000, TAU = 2 * Math.PI;
const clamp = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
const valid = (x,lo,hi,label) => { if (!Number.isFinite(x) || x < lo || x > hi) throw Error(`invalid ${label}`); return x; };
const smooth = seconds => 1 - Math.exp(-1/(FS*seconds));
// Cosine fade leaves a 12.48 kHz guard to Nyquist for control modulation and Doppler.
export function vehiclePartialWeight(hz) {
  if (hz <= 9600) return 1;
  if (hz >= 11520) return 0;
  return .5 + .5*Math.cos(Math.PI*(hz-9600)/1920);
}
export function firingFrequency(profile,rpm) { return profile.cylinders*rpm/(30*profile.strokes); }
// Dipole-like vibrating-body radiation: low-frequency pressure ~f^2, power ~f^4.
// The turnover is an authored estimate, not an inferred engine/body dimension.
// Applied to source partials without compensation, phase reset or low-end boost.
export function mechanicalRadiationWeight(hz,turnoverHz) {
  const squared=(hz/turnoverHz)**2;
  return squared/Math.sqrt(1+squared*squared);
}
export function createVehicleBuffers(frames) {
  if (!Number.isInteger(frames) || frames < 1 || frames > FS) throw Error('bounded vehicle block frames');
  return {layers:Object.fromEntries(vehicleLayerNames.map(n=>[n,new Float32Array(frames)])),mixed:new Float32Array(frames)};
}
// Cascaded convex one-pole filters have a strict bounded-output property. Four
// stages suppress upper broadband energy; these are spectral envelopes, not an
// asserted measured exhaust transfer function.
class TextureFilter {
  constructor(hz) { this.a=1-Math.exp(-TAU*hz/FS); this.s=new Float64Array(4); }
  next(x) { for(let i=0;i<4;i++) {this.s[i]+=this.a*(x-this.s[i]);x=this.s[i];} return x; }
}
function compileCombustion(p) {
  const harmonics=[], cycle=180*p.strokes, weight=p.firingPattern.reduce((s,e)=>s+e.weight,0);
  for(let k=1;k<=p.cylinders*14;k++) {
    let re=0,im=0;
    for(const e of p.firingPattern) {const phase=-TAU*k*e.angleDegrees/cycle; re+=e.weight*Math.cos(phase);im+=e.weight*Math.sin(phase);}
    const eventAmplitude=Math.hypot(re,im)/weight;
    if(eventAmplitude<.0025)continue;
    const relative=k/p.cylinders, envelope=1/((1+.3*relative)*(1+(relative/8)**2));
    harmonics.push({cycleOrder:k,amplitude:eventAmplitude*envelope,phase:Math.atan2(im,re),relative});
  }
  // Retain important real firing-pattern orders, bounded independently of cylinder count.
  harmonics.sort((a,b)=>b.amplitude-a.amplitude); harmonics.length=Math.min(harmonics.length,48);
  const normalization=harmonics.reduce((s,x)=>s+x.amplitude,0);
  for(const h of harmonics)h.amplitude/=normalization;
  return harmonics.sort((a,b)=>a.cycleOrder-b.cycleOrder);
}
function controls(c,p) {
  if (!c || typeof c!=='object')throw Error('vehicle control required');
  const running=c.engineRunning??true;
  if(typeof running!=='boolean'||(c.overrun!==undefined&&typeof c.overrun!=='boolean')||
    (c.exhaustPop!==undefined&&typeof c.exhaustPop!=='boolean'))throw Error('vehicle control boolean');
  const rpm=valid(c.estimatedRpm??c.targetRpm??c.rpm??p.idleRpm,0,p.redlineRpm*1.5,'estimated RPM');
  const throttle=valid(c.throttle??c.load??.12,0,1,'throttle'), load=valid(c.load??throttle,0,1,'load');
  const speed=valid(c.speed??0,0,100,'road speed'),gear=c.gear??0;
  if(!Number.isInteger(gear)||gear < -1||gear > 12)throw Error('invalid gear');
  const roadSurface=c.roadSurface??'asphalt';
  if(!['asphalt','wet','gravel'].includes(roadSurface))throw Error('unsupported road surface');
  return {rpm:running?clamp(rpm,p.idleRpm*.5,p.redlineRpm*1.03):0,requestedRpm:rpm,load,throttle,speed,gear,running,
    overrun:c.overrun===true,exhaustPop:c.exhaustPop===true,roadSurface};
}
export class VehicleSynthesizer {
  constructor(profile=vehicleProfiles.hypercarV12,{sampleRate=FS,seed=0x72696368}={}) {
    if(sampleRate!==FS||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('vehicle sample rate or seed');
    this.profile=createVehicleProfile(profile);this.sampleRate=FS;this.random=seed>>>0;
    this.harmonics=compileCombustion(this.profile);this.cycleRevolutions=this.profile.strokes/2;
    this.rpm=this.profile.idleRpm;this.load=.12;this.throttle=.12;this.speed=0;this.engineEnvelope=0;
    this.cyclePhase=0;this.rotationPhase=0;this.drivetrainPhase=0;this.inductionPhase=0;this.limiterPhase=0;this.spool=0;
    this.gear=null;this.gearEnvelope=0;this.roadGain=.58;this.limiterDepth=0;
    this.shiftRemaining=0;this.popAge=Infinity;this.popRequested=false;this.fuelEnergy=0;this.frame=0;
    this.filters={mechanical:new TextureFilter(1200),exhaust:new TextureFilter(6500),intake:new TextureFilter(4800),
      tyres:new TextureFilter(4000),aero:new TextureFilter(2500),induction:new TextureFilter(6000),transients:new TextureFilter(4500)};
    this.mechanicalNormalization=this.profile.mechanicalOrders.reduce((s,o)=>s+o.amplitude,0);
    this.stats={blocks:0,frames:0,shifts:0,pops:0,rejectedPops:0,limitedFrames:0,peak:0,maximumRpmStep:0,maximumLoadStep:0};
  }
  noise() {this.random=(Math.imul(this.random,1664525)+1013904223)>>>0;return this.random/2147483648-1;}
  render(control,frames=512) {return this.renderInto(control,createVehicleBuffers(frames));}
  renderInto(control,output) {
    const c=controls(control,this.profile),p=this.profile,frames=output?.mixed?.length;
    if(!(output?.mixed instanceof Float32Array)||!Number.isInteger(frames)||frames<1||frames>FS||
      vehicleLayerNames.some(n=>!(output.layers?.[n] instanceof Float32Array)||output.layers[n].length!==frames))throw Error('vehicle output buffers');
    if(this.gear!==null&&this.gear>0&&c.gear>0&&c.gear!==this.gear) {this.shiftRemaining=p.shiftSeconds;this.stats.shifts++;}
    this.gear=c.gear;
    if(c.exhaustPop&&!this.popRequested) {
      if(p.allowOverrunPops&&c.running&&c.overrun&&c.throttle<.15&&this.rpm>3000&&this.fuelEnergy>.15&&this.popAge>.2) {
        this.popAge=0;this.fuelEnergy*=.3;this.stats.pops++;
      } else this.stats.rejectedPops++;
    }
    this.popRequested=c.exhaustPop;
    const rpmUp=smooth(p.responseSeconds),rpmDown=smooth(p.decelerationSeconds),loadA=smooth(.035),throttleA=smooth(.025),
      speedA=smooth(.03),envelopeA=smooth(.018),spoolA=smooth(p.induction.spoolSeconds),fuelA=smooth(.5),limiterA=smooth(.008),
      g=p.components,layer=output.layers,roadGain=c.roadSurface==='gravel'?1:c.roadSurface==='wet'?.8:.58;
    for(let i=0;i<frames;i++) {
      const oldRpm=this.rpm,oldLoad=this.load;
      this.rpm+=(c.rpm-this.rpm)*(c.rpm>this.rpm?rpmUp:rpmDown);
      this.load+=loadA*(c.load-this.load);this.throttle+=throttleA*(c.throttle-this.throttle);this.speed+=speedA*(c.speed-this.speed);
      this.engineEnvelope+=envelopeA*((c.running?1:0)-this.engineEnvelope);
      this.fuelEnergy+=fuelA*(this.load*(this.rpm>3000?1:0)-this.fuelEnergy);
      this.stats.maximumRpmStep=Math.max(this.stats.maximumRpmStep,Math.abs(this.rpm-oldRpm));
      this.stats.maximumLoadStep=Math.max(this.stats.maximumLoadStep,Math.abs(this.load-oldLoad));
      const crankHz=this.rpm/60,cycleHz=crankHz/this.cycleRevolutions,rev=this.rpm/p.redlineRpm;
      // Four crank revolutions support half engine orders and half firing orders
      // for odd cylinder counts without a discontinuity at the firing-cycle wrap.
      this.rotationPhase=(this.rotationPhase+crankHz/(4*FS))%1;
      const cycleAngle=this.rotationPhase*4/this.cycleRevolutions;
      this.cyclePhase=cycleAngle%1;
      this.limiterPhase=(this.limiterPhase+32/FS)%1;
      // A smooth fuel-cut envelope, not hard sample gating; redline operation is bounded.
      this.limiterDepth+=limiterA*(clamp((c.requestedRpm-p.redlineRpm*.985)/(p.redlineRpm*.045),0,1)-this.limiterDepth);
      const limiterDepth=this.limiterDepth;
      const limiter=1-limiterDepth*(.25+.25*Math.sin(TAU*this.limiterPhase));
      if(limiterDepth>0)this.stats.limitedFrames++;
      let shift=1;
      if(this.shiftRemaining>0) {const progress=1-this.shiftRemaining/p.shiftSeconds;shift=1-.8*Math.sin(Math.PI*progress)**2;this.shiftRemaining=Math.max(0,this.shiftRemaining-1/FS);}
      const firingPower=this.engineEnvelope*(.22+.78*this.load)*limiter*shift;
      let combustion=0;
      for(const h of this.harmonics) {
        const hz=cycleHz*h.cycleOrder,band=vehiclePartialWeight(hz);
        if(band===0)continue;
        const brightness=1/(1+h.relative*.1/(.2+p.exhaustBrightness*(.2+.8*this.load)*(.5+.5*rev)));
        // Fixed original resonances are broad and bounded; frequency tracks engine orders.
        const resonance=.70+.18/(1+((hz-210)/130)**2)+.12/(1+((hz-1500)/650)**2);
        combustion+=h.amplitude*brightness*resonance*band*Math.cos(TAU*h.cycleOrder*this.cyclePhase+h.phase);
      }
      let mechanical=0;
      for(const o of p.mechanicalOrders)mechanical+=o.amplitude/this.mechanicalNormalization*vehiclePartialWeight(crankHz*o.order)*
        mechanicalRadiationWeight(crankHz*o.order,p.mechanicalRadiationHz)*
        Math.sin(TAU*o.order*4*this.rotationPhase+o.phase);
      const mechanicalNoise=this.filters.mechanical.next(this.noise()),exhaustNoise=this.filters.exhaust.next(this.noise()),
        intakeNoise=this.filters.intake.next(this.noise()),tyreNoise=this.filters.tyres.next(this.noise()),aeroNoise=this.filters.aero.next(this.noise());
      const pulseEnvelope=.65+.35*Math.sin(TAU*p.cylinders*this.cyclePhase);
      const intakeTone=.62*Math.sin(TAU*p.cylinders*cycleAngle+.7)+.25*Math.sin(TAU*p.cylinders*.5*cycleAngle-.4)+
        .13*Math.sin(TAU*p.cylinders*2*cycleAngle+1.1);
      // Gear tooth whine is separate from firing; torque and engaged gear gate it.
      const gearHz=crankHz*(c.gear>0?7+.35*c.gear:5);
      this.drivetrainPhase=(this.drivetrainPhase+gearHz/FS)%1;
      this.gearEnvelope+=envelopeA*((c.gear!==0?1:0)-this.gearEnvelope);
      this.roadGain+=speedA*(roadGain-this.roadGain);
      const drivetrain=(.7*Math.sin(TAU*this.drivetrainPhase)+.3*vehiclePartialWeight(gearHz*2)*Math.sin(TAU*2*this.drivetrainPhase+.2))*
        this.gearEnvelope*this.engineEnvelope*(.2+.8*this.load)*shift;
      this.spool+=spoolA*((p.induction.kind==='turbocharger'?Math.sqrt(this.load)*rev:rev)-this.spool);
      const inductionHz=p.induction.kind==='supercharger'?Math.min(p.induction.maximumHz,crankHz*p.induction.order):p.induction.maximumHz*this.spool;
      this.inductionPhase=(this.inductionPhase+inductionHz/FS)%1;
      const induction=p.induction.kind==='none'?0:this.engineEnvelope*this.spool*(.3+.7*this.load)*
        (.75*vehiclePartialWeight(inductionHz)*Math.sin(TAU*this.inductionPhase)+.25*p.texture*this.filters.induction.next(this.noise()));
      let transient=0;
      if(this.popAge<.16) {const envelope=(1-Math.exp(-this.popAge/.0025))*Math.exp(-this.popAge/.028);
        transient=envelope*(.6*Math.sin(TAU*(85*this.popAge+450*this.popAge*this.popAge))+.4*this.filters.transients.next(this.noise()));}
      this.popAge+=1/FS;
      layer.mechanical[i]=g.mechanical.gain*this.engineEnvelope*(.55+.45*this.load)*(.94*mechanical+.06*p.texture*mechanicalNoise);
      layer.exhaust[i]=g.exhaust.gain*firingPower*(.86*combustion+.14*p.texture*exhaustNoise*pulseEnvelope);
      layer.intake[i]=g.intake.gain*this.engineEnvelope*(.12+.88*this.throttle)*(.48*intakeTone+.52*p.texture*intakeNoise);
      layer.drivetrain[i]=g.drivetrain.gain*drivetrain;
      layer.tyres[i]=g.tyres.gain*this.roadGain*(this.speed/100)**.85*tyreNoise;
      layer.aero[i]=g.aero.gain*(this.speed/100)**2*aeroNoise;
      layer.induction[i]=g.induction.gain*induction;
      layer.transients[i]=g.transients.gain*transient;
      let mixed=0;for(const n of vehicleLayerNames)mixed+=layer[n][i];output.mixed[i]=mixed;
      this.stats.peak=Math.max(this.stats.peak,Math.abs(mixed));
      this.frame++;
    }
    this.stats.blocks++;this.stats.frames+=frames;
    output.diagnostics={profileId:p.id,frame:this.frame,estimatedRpm:this.rpm,rpmBasis:'configured-estimate',load:this.load,
      loadBasis:'control-input-or-estimator',firingHz:firingFrequency(p,this.rpm),crankHz:this.rpm/60,
      cyclePhase:this.cyclePhase,gear:this.gear,partialCount:this.harmonics.length,partialCeilingHz:11520,
      inductionKind:p.induction.kind,calibration:p.provenance.calibration,...this.stats};
    return output;
  }
}
