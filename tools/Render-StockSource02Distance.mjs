// Private held-source distance comparison. No endpoint, new renderer or game IO.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadStockAssets,StockVehicleSource} from '../src/acoustics/vehicle/stock-source.mjs';
import {encodeVehicleWav} from '../src/acoustics/vehicle/pipeline.mjs';
import {audioMetrics} from '../src/acoustics/engine/signals.mjs';
import {privateStoragePath} from '../src/acoustics/research/research-private-storage.mjs';
import {distanceProbeMetres,renderHeldDistance} from '../tests/fixtures/vehicle-distance-probe.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),FS=48000,BLOCK=512;
const hash=data=>createHash('sha256').update(data).digest('hex');
const profiles=['physical-default','authored-detail-loss-v1'];
const names={'physical-default':'fixed-state-distance-default.wav','authored-detail-loss-v1':'fixed-state-distance-authored.wav'};

export async function renderStockSource02Distance(manifestFile,output,{sourceGain=1.5956559506856056}={}){
  assert.equal(typeof manifestFile,'string','private decoder manifest argument required');
  const out=privateStoragePath(root,output),newFiles=[...Object.values(names),'held-source.f32','distance-render.json'];
  for(const name of newFiles)assert.ok(!fs.existsSync(path.join(out,name)),'fresh private comparison artifacts required');
  const bindings=['src/acoustics/vehicle/stock-source.mjs','src/acoustics/vehicle/stock-grain.mjs',
    'src/acoustics/vehicle/distance-presentation.mjs','src/acoustics/vehicle/pipeline.mjs',
    'src/acoustics/streaming/causal.mjs','src/acoustics/engine/contracts.mjs','src/acoustics/engine/paths.mjs',
    'tests/fixtures/vehicle-distance-probe.mjs'];
  const moduleSha256=Object.fromEntries(bindings.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]));
  const assets=loadStockAssets(manifestFile),vehicle=assets.vehicles.get('schafter3');
  const pressureShares={engine:.4,exhaust:.6},control={operatingPoint:.7,load:.9,running:true,lift:false};
  const player=new StockVehicleSource(vehicle,{sourceGain,pressureShares}),duration=3,total=FS*duration;
  const pcm=new Float32Array(total),engine=new Float32Array(BLOCK),exhaust=new Float32Array(BLOCK);
  for(let at=0;at<total;at+=BLOCK){const frames=Math.min(BLOCK,total-at);player.renderInto(control,engine,exhaust,frames);
    for(let i=0;i<frames;i++)pcm[at+i]=(engine[i]+exhaust[i])*Math.SQRT1_2;}
  const sourceSha256=hash(Buffer.from(pcm.buffer)),sourcePeak=pcm.reduce((p,v)=>Math.max(p,Math.abs(v)),0);
  assert.ok(sourcePeak<.98,'actual combined input headroom; no additional gain correction');
  const gapFrames=FS*.25,concatenatedFrames=total*6+gapFrames*5,rows=[],outputs={};
  for(const profile of profiles){
    const left=new Float32Array(concatenatedFrames),right=new Float32Array(concatenatedFrames);
    for(let i=0;i<distanceProbeMetres.length;i++){
      const distance=distanceProbeMetres[i],rendered=await renderHeldDistance(pcm,{distance,profile,masterGain:.7});
      const startFrame=i*(total+gapFrames);
      left.set(rendered.left,startFrame);right.set(rendered.right,startFrame);
      const d=rendered.diagnostics;
      rows.push({profile,distanceMetres:distance,sourceSha256,file:names[profile],startFrame,frames:total,
        expectedArrivalSeconds:rendered.delay,propagation:rendered.propagation,
        rawMetrics:audioMetrics([rendered.left,rendered.right]),
        diagnostics:{renderer:{...d.renderer},history:{...d.history},
          simulation:{missingPast:d.simulation.missingPast,rejectedPaths:d.simulation.rejectedPaths,
            prunedPaths:d.simulation.prunedPaths,resets:d.simulation.resets},sourceHistoryBytes:d.sourceHistoryBytes}});
      console.log('held distance '+profile+' '+distance+' m');
    }
    outputs[profile]=encodeVehicleWav([left,right]);
  }
  assert.equal(hash(Buffer.from(pcm.buffer)),sourceSha256,'distance rendering must not modify source material');
  for(const [file,binding] of Object.entries(moduleSha256))assert.equal(hash(fs.readFileSync(path.join(root,file))),binding,'core changed during comparison');
  const report={schemaVersion:1,milestone:'STOCK-SOURCE-02',sampleRate:FS,blockFrames:BLOCK,
    source:{model:'schafter3',durationSeconds:duration,frames:total,sha256:sourceSha256,peak:sourcePeak,
      sourceGain,pressureShares,heldControl:control,sourceStats:player.stats,
      construction:'(calibrated engine + exhaust)/sqrt(2), one co-located diagnostic emitter',
      limitation:'Co-location deliberately isolates propagation from separate car emitter positions; not the full spatial vehicle mix'},
    setup:{sourceForward:[-1,0,0],listenerForward:[1,0,0],sourceDirectivity:.5,sourceAndListenerHeightMetres:1,
      listenerPosition:[0,0,1],sourcePositions:'[distanceMetres,0,1]',sourceVelocity:[0,0,0],listenerVelocity:[0,0,0],
      tileBounds:{min:[-2,-2,0],max:[254,2,3]},tileBasis:'empty complete synthetic visibility fixture',surfaces:0,
      sourceStateProgression:'One constant control from startup; internal running/state smoothing only',
      rendererMasterGain:.7,lateField:false,independentNormalisation:false,deliveredGainCompensation:false},
    sequence:{distancesMetres:[...distanceProbeMetres],segmentSeconds:duration,gapSeconds:.25,
      segmentStartSeconds:distanceProbeMetres.map((_,i)=>i*(duration+.25)),totalSeconds:concatenatedFrames/FS,
      defaultFile:names['physical-default'],authoredFile:names['authored-detail-loss-v1']},
    analysis:{emissionWindowSeconds:[.65,2.1],waveformZoomEmissionSeconds:[.9,.918],frequencyLimitsHz:[40,10000],
      compensation:'Only analytical distance/master factor on sum(L,R)/sqrt(2); never applied to delivered listening WAVs',
      truncation:'Each delivered segment is 3 s; far clips end before the last emitted samples arrive. The common emission window ends at 2.1 s, safely before every truncation.'},
    rows,moduleSha256,
    limitations:['Authored distance coefficients and geometry are not measured atmospheric or GTA acoustic calibration',
      'Existing first-order 400 Hz/4 kHz complementary bands limit the achievable steepness',
      'Common source/control/geometry isolate distance; absolute native Schafter recognition and mix remain unverified',
      'Simulation startup pose-history exclusions are retained separately from zero renderer PCM-history faults',
      'No new headroom calibration, per-file normalization, gain compensation in delivered WAVs or timing campaign'],
    subjectiveListeningPerformed:false,gameLaunched:false,audioEndpointOpened:false};
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'held-source.f32'),Buffer.from(pcm.buffer));
  for(const profile of profiles)fs.writeFileSync(path.join(out,names[profile]),outputs[profile]);
  fs.writeFileSync(path.join(out,'distance-render.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({sourceSha256,sourcePeak,distances:distanceProbeMetres,totalSeconds:report.sequence.totalSeconds}));
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2]||!process.argv[3])throw Error('Usage: node tools/Render-StockSource02Distance.mjs <private manifest> <fresh private output directory>');
  await renderStockSource02Distance(process.argv[2],process.argv[3]);
}
