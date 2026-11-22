import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acousticScene, conditionalStockScene} from '../src/acoustics/engine/contracts.mjs';
import {CausalSimulation, StreamingRenderer} from '../src/acoustics/streaming/causal.mjs';
import * as presentation from '../src/acoustics/vehicle/distance-presentation.mjs';
import {distanceProbeScene,originalDistanceProbe,renderHeldDistance,measureOriginalDistanceProbe,distanceProbeMetres} from './fixtures/vehicle-distance-probe.mjs';
const {vehicleDistancePresentations,vehicleDistanceSceneOptions}=presentation;

test('authored uniform atmosphere agrees with tabulated air loss at representative bands',()=>{
  const air=presentation.atmosphericVehicleDistanceSceneOptions({temperatureC:15,relativeHumidity:50});
  // ISO 9613-1 Table 1(h), dB/km at 15 °C, 50% RH and 101.325 kPa.
  // The table uses exact fractional-octave centers; this renderer models
  // its three broad bands at the existing nominal frequencies.
  const [low,mid,high]=air.airDbPerMetre.map(x=>x*1000);
  assert(Math.abs(low-0.930)<.004);
  assert(Math.abs(mid-7.55)<.13);
  assert(high>60 && high<130);
  assert.notDeepEqual(air,presentation.atmosphericVehicleDistanceSceneOptions({temperatureC:15,relativeHumidity:0}));
  for(const weather of [{temperatureC:100},{relativeHumidity:NaN},{pressureKPa:0}])
    assert.throws(()=>presentation.atmosphericVehicleDistanceSceneOptions(weather),/bounded uniform atmosphere/);
});

test('band radiation travels from the actual emission observation',()=>{
  const id='stock:test:exhaust',session='9'.repeat(32),distance=343;
  const scene=conditionalStockScene([id],session,{airDbPerMetre:[0,0,0]});
  const ctrl=new CausalSimulation(scene);
  const rear=[.2,.6,.8],later=[.4,.7,.9];
  const sample=(time,profile,heading)=>ctrl.observe({time,session,generation:1,
    listener:{position:[0,distance,0],forward:[0,-1,0]},
    sources:[{id,generation:1,position:[0,0,0],forward:heading,radiationByBand:profile}]});
  for(let i=0;i<=34;i++) {
    const time=i/10;
    sample(time,time<2?rear:later,time<2?[0,-1,0]:[1,0,0]);
    if(i===2) {
      assert.throws(()=>sample(time+.01,[.7,.2,.8],[0,-1,0]),/radiation/);
    }
    if(i!==24&&i!==34)continue;
    const [result]=ctrl.update(time).paths;
    assert.ok(result,'exactly one delayed direct path is present');
    const measured=result.bands.map(gain=>gain*distance);
    const expected=(i===24?rear:later).map(d=>1-d*(i===24?1:.5));
    measured.forEach((value,j)=>assert.ok(Math.abs(value-expected[j])<1e-10,measured.join(', ')));
    assert.ok(Math.abs(result.delay-1)<1e-10);
    assert.equal(result.rate,1);
  }
});

test('steeper complementary bands retain unity sum and reset their filter pressure on withdrawal',()=>{
  const id='test-voice', frames=512;
  const render=bandShape=>{
    const r=new StreamingRenderer({sourceIds:[id],bandShape});
    const x=Float32Array.from({length:frames},(_,i)=>Math.sin(i*.25)*.26+Math.cos(i)*.17);
    const l=new Float32Array(frames),right=new Float32Array(frames);
    const block=()=>{
      r.accept({frame:r.frame,sourceGenerations:{[id]:1},paths:[{
        sourceId:id,id:'direct',generation:1,emissionFrame:r.frame,rate:1,bands:[1,1,1],pan:0,
      }]});
      r.process({[id]:x},l,right,frames);
    };
    for(let i=0;i<4;i++)block();
    const audible=l.slice();
    r.discardSourcePcm(id);
    x.fill(0);
    block();
    assert(l.every(v=>v===0),'no former filter pressure crosses the discard');
    assert.equal(r.stats.limited,0);
    return audible;
  };
  const legacy=render('legacy'),steep=render('steep-four-pole');
  const max=Math.max(...steep.map((v,i)=>Math.abs(v-legacy[i])));
  assert(max<6e-8,'equal band gains reconstruct same pressure: '+max);
  assert.throws(()=>new StreamingRenderer({bandShape:'unbounded'}),/band shape/);
});

test('steeper bands reduce measured high-frequency leakage without changing travel or applying a floor',async()=>{
  const source=originalDistanceProbe(),profile='authored-detail-loss-v1',distance=200;
  const [legacy,steep]=await Promise.all(['legacy','steep-four-pole'].map(bandShape=>
    renderHeldDistance(source,{profile,distance,bandShape}).then(measureOriginalDistanceProbe)));
  assert(steep.highLowDb<legacy.highLowDb-8,JSON.stringify({legacy:legacy.highLowDb,steep:steep.highLowDb}));
  assert.deepEqual(steep.propagation.bands,legacy.propagation.bands);
  assert.deepEqual(steep.propagation.maximumRetardedFrameError,legacy.propagation.maximumRetardedFrameError);
  assert.equal(steep.diagnostics.renderer.limited,0);
});

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
