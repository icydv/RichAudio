// Explicit audition-level matching, after acoustic DSP and before host master gain.
// It is not source SPL calibration, normalisation, clipping or an acoustic effect.
export const AUDITION_TRIM_DB = 12;
export const PREMASTER_PEAK_LIMIT = 0.5;
// Only bounded numerical state and enumerated presentation labels are retained.
// In particular, callers cannot accidentally copy a path, token, pose payload or
// rejected PCM block into a terminal diagnostic.
const finite = (x, low = 0, high = Number.MAX_SAFE_INTEGER) =>
  Number.isFinite(x) && x >= low && x <= high ? x : null;
const count = x => Number.isSafeInteger(x) && x >= 0 && x <= 100000000 ? x : null;
const sampleValue = x => Number.isFinite(x) ? x : Number.isNaN(x) ? 'NaN' : x === Infinity ? '+Infinity' : '-Infinity';
const modes = new Set(['listener-only-conditional-direct','conditional-direct-only','conditional-observed-geometry',
  'conditional-observed-model','not-requested','unavailable','unavailable-pose','expired','synthetic-model']);
const transitions = new Set(['steady','acquiring','releasing','reacquiring','generation-change','geometry-change','unavailable']);
function boundedContext(context) {
  return {
    sourceGenerations: Array.isArray(context?.sourceGenerations)
      ? context.sourceGenerations.slice(0,16).map(x=>Number.isSafeInteger(x)&&x>0?x:null) : [],
    pathCount: Number.isInteger(context?.pathCount) ? finite(context.pathCount,0,2048) : null,
    activePathCount: Number.isInteger(context?.activePathCount) ? finite(context.activePathCount,0,2048) : null,
    releasingPathCount: Number.isInteger(context?.releasingPathCount) ? finite(context.releasingPathCount,0,2048) : null,
    replacingPathCount: Number.isInteger(context?.replacingPathCount) ? finite(context.replacingPathCount,0,2048) : null,
    minimumDistance: finite(context?.minimumDistance,0,100000),
    maximumDistance: finite(context?.maximumDistance,0,100000),
    maximumRelativeSpeed: finite(context?.maximumRelativeSpeed,0,200),
    nearFieldRadius: finite(context?.nearFieldRadius,0,10),
    sourceLevel: finite(context?.sourceLevel,0,.5),
    sourceFrequencyHz: finite(context?.sourceFrequencyHz,20,2000),
    geometryMode: modes.has(context?.geometryMode) ? context.geometryMode : null,
    pathTransition: transitions.has(context?.pathTransition) ? context.pathTransition : null,
    outputLevel: finite(context?.outputLevel,0,1),
    richAudioEnabled: typeof context?.richAudioEnabled === 'boolean' ? context.richAudioEnabled : null,
    recentPoseDiscontinuities: count(context?.recentPoseDiscontinuities),
    recentControlChanges: count(context?.recentControlChanges),
    recentWindowMs: finite(context?.recentWindowMs,0,10000),
  };
}
export function validateAuditionProfile(o) {
  if (o.outputTrimDb === 0) return;
  if (o.outputTrimDb !== AUDITION_TRIM_DB || o.sources !== 1 || o.scene !== "open-road" || o.beacon !== "harmonic" || o.frequencyHz !== 600 || o.level !== 0.44 || o.delayMs !== 100 || o.orientation || !o.required)
    throw Error("Audition trim requires the fixed one-source 600Hz/0.44 open-road required-listener 100ms profile");
}
export class BeaconOutputTrim {
  constructor(db = 0) {
    if (db !== 0 && db !== AUDITION_TRIM_DB) throw Error("Output trim must be disabled or exactly +12dB");
    this.enabled = db !== 0;
    this.gain = this.enabled ? 10 ** (db / 20) : 1;
    this.stats = { db, gain: this.gain, peakLimit: PREMASTER_PEAK_LIMIT, peakBefore: 0, peakAfter: 0, blocks: 0, rejectedBlocks: 0, lastFailure: null };
  }
  apply(left, right, context = null) {
    if (!this.enabled) return; // Preserve default PCM without an extra rounding step.
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length || left.length < 1 || left.length > 512) throw Error("Output trim block bounds");
    let before = 0, after = 0, first = null, nonfinite = 0, nonfiniteInput = 0, excessive = 0;
    // Validate the whole block before mutating or publishing any of it.
    for (let i = 0; i < left.length; i++) {
      const a = Math.fround(left[i] * this.gain), b = Math.fround(right[i] * this.gain);
      for (let channel = 0; channel < 2; channel++) {
        const original = channel ? right[i] : left[i], trimmed = channel ? b : a;
        if(Number.isFinite(original))before=Math.max(before,Math.abs(original));else nonfiniteInput++;
        if(Number.isFinite(trimmed))after=Math.max(after,Math.abs(trimmed));
        const classification = !Number.isFinite(trimmed) ? 'nonfinite' : Math.abs(trimmed)>PREMASTER_PEAK_LIMIT ? 'over-ceiling' : null;
        if(classification){
          if(classification==='nonfinite')nonfinite++;else excessive++;
          if(!first)first={classification,frameOffset:i,channel:channel?'right':'left',
            originalSample:sampleValue(original),postTrimSample:sampleValue(trimmed)};
        }
      }
    }
    if(first){
      let audioFrame=null,diagnosticContext,contextCollectionFailed=false;
      try{
        const detail=typeof context==='function'?context():context;
        audioFrame=Number.isSafeInteger(detail?.audioFrame)&&detail.audioFrame>=0?detail.audioFrame:null;
        diagnosticContext=boundedContext(detail);
      }catch{
        // Diagnostic collection cannot replace or suppress the original guard
        // failure. A caller may supply a lazy collector; it never runs on valid
        // blocks and cannot cause rejected PCM to be published.
        contextCollectionFailed=true;diagnosticContext=boundedContext(null);
      }
      this.stats.rejectedBlocks++;
      this.stats.lastFailure={schemaVersion:1,classification:first.classification,audioFrame,
        offendingAudioFrame:audioFrame===null?null:audioFrame+first.frameOffset,firstOffendingSample:first,
        maximumFiniteAbsoluteValue:before,preTrimPeak:nonfiniteInput?null:before,
        maximumFinitePostTrimAbsoluteValue:after,predictedPostTrimPeak:nonfinite?null:after,
        nonfiniteSamples:nonfinite,nonfiniteInputSamples:nonfiniteInput,overCeilingSamples:excessive,frames:left.length,
        trimDb:this.stats.db,trimGain:this.gain,preHostCeiling:PREMASTER_PEAK_LIMIT,
        context:diagnosticContext,contextCollectionFailed};
      const error=Error('Audition trim rejected '+first.classification+' block; no clipping or automatic gain reduction');
      error.code='AUDITION_TRIM_'+first.classification.replace('-','_').toUpperCase();
      error.diagnostic=this.stats.lastFailure;
      throw error;
    }
    for (let i = 0; i < left.length; i++) { left[i] *= this.gain; right[i] *= this.gain; }
    this.stats.blocks++;
    this.stats.peakBefore = Math.max(this.stats.peakBefore, before);
    this.stats.peakAfter = Math.max(this.stats.peakAfter, after);
  }
}
