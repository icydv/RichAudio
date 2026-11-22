// Authored response to a sustained normalized rev ceiling. No measured
// crank RPM, pedal position, gear or ignition events enter this model.
export const batiVoicing = 'bati-exhaust-limiter-v1';
const batiExhaustPressure = 1.55;
const FS = 48000;
const idlePressure = 1 / batiExhaustPressure;
const ceiling = .995;
const qualifyFrames = .10 * FS;
const patterns = [[.044,.090],[.034,.081],[.053,.077]].map(pair=>pair.map(t=>Math.round(t*FS)));
const blend = x => {
  const t = Math.max(0,Math.min(1,x));
  return t*t*(3-2*t);
};

const roadMixes = {
  'bati-road': {nearPressure: 3.1, reachScale: 2.4, reachExponent: .75, body: .95, attack: .50},
  'bati-bold': {nearPressure: 4.5, reachScale: 2.2, reachExponent: .84, body: 1.40, attack: .74},
};

export function batiExhaustPathGain(distance, demand, voicing) {
  const mix = roadMixes[voicing];
  if (mix) {
    // A fixed exterior transfer for this path. A throttle lift may already
    // have happened by the time the previous exhaust pulse reaches a wall.
    const reach = Math.hypot(1, Math.min(distance, 150) / mix.reachScale) ** mix.reachExponent;
    return mix.nearPressure * reach;
  }
  // Recover some distant exhaust under load while retaining the falling 1/r
  // level and the solver's frequency-dependent air loss and rear radiation.
  return batiExhaustPressure * (1 + .65 * demand * blend((distance - 7) / 17));
}

export class BatiFiringEnvelope {
  held = 0;
  phaseFrames = 0;
  pattern = 0;
  cutting = false;
  cuts = 0;
  renderedFrames = 0;
  lastEdge = null;

  select(control, frames) {
    const sourceFrame = this.renderedFrames;
    this.renderedFrames += frames;
    this.lastEdge = null;
    const ratio = control.operatingPoint;
    if (!control.running || control.lift || ratio < ceiling) {
      if (this.cutting) {
        const reason = !control.running ? 'stopped' : control.lift ? 'lift' : 'below-ceiling';
        this.lastEdge = {kind: 'catch', reason, sourceFrame};
      }
      this.held = this.phaseFrames = this.pattern = 0;
      this.cutting = false;
      return ratio;
    }
    this.held += frames;
    if (this.held < qualifyFrames) return ratio;
    const [cut,catchFrames] = patterns[this.pattern];
    const cutting = this.phaseFrames < cut;
    if (cutting !== this.cutting) {
      if (cutting) this.cuts++;
      this.lastEdge = {kind: cutting ? 'cut' : 'catch', reason: 'cycle', sourceFrame};
    }
    this.cutting = cutting;
    // Move the grain target down on the cut, then climb back on the catch.
    // Stock synthesis provides its existing smooth interpolation.
    const target = cutting ? ratio-.095 : ratio-.055*(1-blend((this.phaseFrames-cut)/catchFrames));
    this.phaseFrames += frames;
    if(this.phaseFrames>=cut+catchFrames){
      this.phaseFrames-=cut+catchFrames;
      this.pattern=(this.pattern+1)%patterns.length;
    }
    return target;
  }
}

function boundedPressure(value) {
  const magnitude = Math.abs(value);
  if(magnitude<=.59)return value;
  const over=magnitude-.59;
  return Math.sign(value)*(.59+.39*over/(.39+over));
}

export function voiceBatiPowertrain(source, voicing = batiVoicing) {
  if(source.vehicle.model!=='bati'||source.npc||source.batiFiring)throw Error('The enhanced voice requires one Bati player source');
  const render=source.renderInto.bind(source);
  const firing=new BatiFiringEnvelope();
  const mix = roadMixes[voicing];
  source.batiVoicing = voicing;
  source.roadMix = Boolean(mix);
  const idle = mix ? .78 / mix.nearPressure : idlePressure;
  let lowMid = 0, lowBass = 0, fastEnvelope = 0, slowEnvelope = 0, dryShare = 0;
  const bodyPole = 1 - Math.exp(-2*Math.PI*580/FS);
  const bassPole = 1 - Math.exp(-2*Math.PI*85/FS);
  const fastPole = 1 - Math.exp(-1/(FS*.002));
  const slowPole = 1 - Math.exp(-1/(FS*.035));
  const drySharePole = 1 - Math.exp(-1/(FS*.004));
  const attackDecaySeconds = mix ? .028 : .076;
  let previousRatio=null,transient=0,engineCut=1,exhaustCut=1,pressure=idle;
  const cutSlew=1-Math.exp(-1/(FS*.003)),pressureSlew=1-Math.exp(-1/(FS*.020));
  source.batiExhaustDemand=0;
  source.batiFiring=firing;
  source.renderInto=(control,engine,exhaust,frames=engine.length)=>{
    const {operatingPoint:ratio,lift,running}=control;
    const rise=previousRatio===null?0:ratio-previousRatio;
    previousRatio=ratio;
    transient=lift||!running?0:Math.max(transient*Math.exp(-frames/(FS*attackDecaySeconds)),blend((rise-.007)/.065));
    const demand=running&&!lift?blend((ratio-.22)/.46):0;
    source.batiExhaustDemand+=(demand-source.batiExhaustDemand)*(1-Math.exp(-frames/(FS*.035)));
    const drive = mix ? (running && !lift ? blend((ratio-.28)/.55) : 0) : demand;
    const wanted = mix ? idle + drive * (1.26 + mix.attack * transient)
                       : idlePressure+.55*demand+.24*transient*demand;
    const heldDryShare = .32 * drive * (1 - transient);
    const target=firing.select(control,frames);
    const result=render(target===ratio?control:{...control,operatingPoint:target},engine,exhaust,frames);
    const engineTarget=firing.cutting?.33:1,exhaustTarget=firing.cutting?.15:1;
    for(let i=0;i<frames;i++){
      engineCut+=cutSlew*(engineTarget-engineCut);
      exhaustCut+=cutSlew*(exhaustTarget-exhaustCut);
      pressure+=pressureSlew*(wanted-pressure);
      engine[i]*=engineCut;
      if (!mix) {
        exhaust[i]=boundedPressure(exhaust[i]*pressure)*exhaustCut;
        continue;
      }
      const dry = exhaust[i];
      lowMid += bodyPole * (dry - lowMid);
      lowBass += bassPole * (dry - lowBass);
      fastEnvelope += fastPole * (Math.abs(dry) - fastEnvelope);
      slowEnvelope += slowPole * (Math.abs(dry) - slowEnvelope);
      const attack = Math.min(1, Math.max(0, (fastEnvelope - slowEnvelope) / (.06 + slowEnvelope)));
      const body = (lowMid - lowBass) * mix.body * drive;
      const pulse = (dry + body) * pressure * (1 + .20 * mix.attack * attack * drive);
      // Smooth knee only at large individual pulses. Preserve polarity and
      // leave the beginning of the transient linear up through 0.80 FS.
      const over = Math.max(0, Math.abs(pulse) - .80);
      const bounded = over ? Math.sign(pulse) * (.80 + .18 * over / (.18 + over)) : pulse;
      // As a hard rev settles, restore some original grain pressure. The
      // unboosted layer leaves room between the opening blip and the hold.
      dryShare += drySharePole * (heldDryShare - dryShare);
      exhaust[i] = (bounded + dryShare * (dry - bounded)) * exhaustCut;
    }
    return result;
  };
  return source;
}
