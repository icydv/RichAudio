import assert from 'node:assert/strict';
import path from 'node:path';
import { StockGameplay } from '../../src/acoustics/vehicle/gameplay.mjs';
import { StreamingRenderer } from '../../src/acoustics/streaming/causal.mjs';
import { vehicleDistancePresentations } from '../../src/acoustics/vehicle/distance-presentation.mjs';
import { vehicleBlockFrames as blockSize, vehicleSampleRate as rate } from '../../src/acoustics/vehicle/pipeline.mjs';
import { adderModel, writeStereoWave } from './powertrain-drive.mjs';
import { describeRenderer, listenerPacket } from './mapped-drive-render.mjs';

// A free-field listening control keeps the rev input steady on both sides of
// the listener. Replay only the change in air loss after path admission.
export async function renderStraightPass(inputs, session, directory) {
  let now = 0;
  const engine = new StockGameplay({ registry:inputs.registry, profiles:inputs.profiles, session,
    now:()=>now, latencyProfile:'street-01', continuityPolicy:'camera-source-01', vehicleSourcePolicy:'catalogue-fleet-01' });
  engine.setSettings({...engine.settings, quality:'quality',acceleration:'cpu',volume:.8});
  const settings = describeRenderer(engine.pipeline.renderer);
  const replay = new StreamingRenderer(settings);
  const unchanged = new StreamingRenderer(settings);
  replay.setOutputPreferences({richAudioEnabled:true, outputLevel:.8});
  unchanged.setOutputPreferences({richAudioEnabled:true, outputLevel:.8});
  const check = [new Float32Array(blockSize),new Float32Array(blockSize)];
  const active = vehicleDistancePresentations['authored-detail-loss-v1'].airDbPerMetre;
  const reference = vehicleDistancePresentations['physical-default'].airDbPerMetre;
  const count = 1024;
  const channels = () => [new Float32Array(count*blockSize),new Float32Array(count*blockSize)];
  const normal = channels(), comparison = channels(), probes = [];
  const nearest = 5.35, speed = 16, rev = .48;
  const camera = [0,5,1.45], heading = [1,0,0], up = [0,0,1];
  try {
    for (let block=0; block<count; block++) {
      const frame=block*blockSize, seconds=frame/rate;
      now=1000*seconds;
      if (block%4===0) {
        const ticks=10_000_000+Math.round(seconds*10_000_000);
        const cars=seconds<10.68 ? [{id:'pass',model:adderModel,context:'player',generation:1,
          position:[speed*(seconds-nearest),0,0],velocity:[speed,0,0],forward:heading,up,
          observationTicks:ticks,operatingPoint:rev,running:true,valid:true}] : [];
        engine.accept({version:1,session,listener:listenerPacket(session,block,ticks,camera,[0,-1,0]),vehicles:cars},0,250);
      }
      const stereo=await engine.render();
      for (let ch=0;ch<2;ch++) normal[ch].set(stereo[ch],frame);
      const control=engine.pipeline.lastControl;
      assert(control.paths.every(p=>p.order===0));
      unchanged.accept(control);
      unchanged.process(engine.inputs, ...check, blockSize);
      assert.deepEqual(check,stereo,'Unchanged controls must reconstruct actual gameplay PCM');
      const paths=control.paths.map(p=>({...p,bands:p.bands.map((gain,i)=>
        gain * 10**((active[i]-reference[i])*p.distance/20))}));
      replay.accept({...control, paths});
      replay.process(engine.inputs,...comparison.map(ch=>ch.subarray(frame,frame+blockSize)),blockSize);
      if(block%4===0 && control.paths.length) probes.push({seconds,paths:control.paths.map(p=>({
        source:p.sourceId,distance:p.distance,rate:p.rate,pan:p.pan,bands:p.bands,
        highToLowDb:20*Math.log10(p.bands[2]/p.bands[0])}))});
    }
    assert.equal(engine.pipeline.renderer.stats.limited,0);
    assert.equal(replay.stats.limited,0);
    assert(probes.some(row=>row.paths.some(p=>p.rate>1.03)) && probes.some(row=>row.paths.some(p=>p.rate<.97)));
    const actualHash=writeStereoWave(path.join(directory,'Pass by at steady revs.wav'),normal);
    const controlHash=writeStereoWave(path.join(directory,'Pass by with default air loss.wav'),comparison);
    return {actualHash,controlHash,nominalClosestSeconds:nearest,speedMetresPerSecond:speed,listener:camera,
      revRatio:rev,geometry:'Authored free-field pass with forward engine and rearward exhaust at their original offsets.',
      actualAirDbPerMetre:active,controlAirDbPerMetre:reference,probes};
  } finally { await engine.close(); }
}
