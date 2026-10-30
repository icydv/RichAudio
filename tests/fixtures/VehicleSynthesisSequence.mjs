// Authored deterministic controls for the pinned PR74 waveform regression.
// This helper contains no reference synthesis algorithm or Git/runtime dependency.
import {createHash} from 'node:crypto';

export const originalSequence = Object.freeze({
  sampleRate:48000, blockFrames:512, seed:0x72696368,
  stages:[['idle',24],['acceleration',48],['shift',12],['redline',48],['overrun',24],['stop',24]],
});

function canonical(value) {
  if (typeof value === 'number') return Object.is(value,-0)?'-0':Number.isFinite(value)?value:String(value);
  if (ArrayBuffer.isView(value)) return Array.from(value,canonical);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}

export function sequenceDigests({Synthesizer,createBuffers,profile,layerNames}) {
  const {sampleRate,blockFrames,seed,stages}=originalSequence;
  const synthesizer=new Synthesizer(profile,{sampleRate,seed}),output=createBuffers(blockFrames);
  const hashes=Object.fromEntries([...layerNames,'mixed','state'].map(n=>[n,createHash('sha256')]));
  const bytes=Buffer.alloc(blockFrames*4);
  let blocks=0;
  for(const [stage,count] of stages)for(let index=0;index<count;index++) {
    const fraction=(index+1)/count,lowLoad=['idle','overrun','stop'].includes(stage);
    synthesizer.renderInto({
      estimatedRpm:stage==='idle'?profile.idleRpm:stage==='acceleration'?profile.idleRpm+fraction*(profile.redlineRpm-profile.idleRpm):stage==='shift'?profile.redlineRpm*.66:stage==='stop'?0:profile.redlineRpm,
      engineRunning:stage!=='stop',load:lowLoad?.1:1,throttle:lowLoad?.05:1,
      speed:stage==='idle'?0:stage==='stop'?Math.max(0,100*(1-fraction)):stage==='acceleration'?fraction*100:100,
      gear:['shift','redline','overrun','stop'].includes(stage)?2:1,
      overrun:stage==='overrun',exhaustPop:stage==='overrun',
    },output);
    for(const name of [...layerNames,'mixed']) {
      const pcm=name==='mixed'?output.mixed:output.layers[name];
      // Explicit little-endian Float32 representation makes the golden portable.
      for(let i=0;i<blockFrames;i++)bytes.writeFloatLE(pcm[i],i*4);
      hashes[name].update(bytes);
    }
    // Includes all filters, RNG, phases, envelopes, counters and block diagnostics.
    hashes.state.update(JSON.stringify(canonical({synthesizer,diagnostics:output.diagnostics}))+'\n');
    blocks++;
  }
  return {profile:profile.id,blocks,frames:blocks*blockFrames,sha256:Object.fromEntries(Object.entries(hashes).map(([name,h])=>[name,h.digest('hex')]))};
}
