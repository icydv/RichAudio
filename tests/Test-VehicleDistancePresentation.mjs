import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acousticScene} from '../src/acoustics/engine/contracts.mjs';
import {vehicleDistancePresentations,vehicleDistanceSceneOptions} from '../src/acoustics/vehicle/distance-presentation.mjs';
import {distanceProbeScene,originalDistanceProbe,renderHeldDistance,measureOriginalDistanceProbe,distanceProbeMetres} from './fixtures/vehicle-distance-probe.mjs';

test('distance presentation is an explicit optional scene configuration; physical defaults stay unchanged',()=>{
  const existing=distanceProbeScene(),unmodified=acousticScene(existing.tile,{}, {order:0,maxPaths:12,maxReflectors:1});
  assert.deepEqual(existing.config,unmodified.config);
  assert.equal(vehicleDistancePresentations['authored-detail-loss-v1'].physicalCalibration,'unverified');
  const first=vehicleDistanceSceneOptions('authored-detail-loss-v1');first.airDbPerMetre[2]=.9;
  assert.equal(vehicleDistanceSceneOptions('authored-detail-loss-v1').airDbPerMetre[2],.1);
  for(const profile of ['unknown','toString','__proto__',null])assert.throws(()=>vehicleDistanceSceneOptions(profile));
});

test('held source and bearing isolate distance spectrum and attack without gain matching or changed causal delay',async()=>{
  const source=originalDistanceProbe(),rows=[];
  for(const profile of ['physical-default','authored-detail-loss-v1'])for(const distance of distanceProbeMetres){
    const rendered=await renderHeldDistance(source,{profile,distance}),row=measureOriginalDistanceProbe(rendered);
    const air=vehicleDistancePresentations[profile].airDbPerMetre;
    for(let band=0;band<3;band++)assert.ok(Math.abs(row.propagation.bands[band]-10**(-air[band]*distance/20)/distance)<1e-10);
    assert.ok(Math.abs(row.pulse.onsetErrorFrames)<=2,'filtering must not invent propagation predelay');
    assert.ok(row.rawPeak<.1);rows.push(row);
  }
  const physical=rows.slice(0,6),authored=rows.slice(6);
  let previousExtra=Infinity;
  for(let i=0;i<6;i++){
    const extra=authored[i].highLowDb-physical[i].highLowDb;
    assert.ok(extra<previousExtra,'additional relative spectral shaping follows distance');previousExtra=extra;
    assert.ok(Math.abs(authored[i].propagation.maximumRateError)<1e-8,'no physical Doppler for stationary geometry');
  }
  assert.ok(Math.abs(authored[0].highLowDb-physical[0].highLowDb)<.25,'2 m harmonic detail retained');
  assert.ok(Math.abs(authored[0].pulse.energyCentroidMs-physical[0].pulse.energyCentroidMs)<.2,'2 m transient retained');
  assert.ok(authored[4].highLowDb-physical[4].highLowDb<-3,'100 m changes relative high/low energy, not only absolute level');
  assert.ok(authored[5].highLowDb-physical[5].highLowDb<-4,'200 m detail loss is measurable after analytical gain compensation');
  assert.ok(authored[5].pulse.normalisedMaximumAdjacentStep<physical[5].pulse.normalisedMaximumAdjacentStep*.75,'distant transient loses relative fine detail');
  assert.ok(authored[5].pulse.energyCentroidMs>physical[5].pulse.energyCentroidMs+1,'distant pulse changes temporal energy distribution');
  assert.ok(authored[5].rawSteadyStereoRms<authored[0].rawSteadyStereoRms/90,'physical dynamic range remains in audible outputs');
});
