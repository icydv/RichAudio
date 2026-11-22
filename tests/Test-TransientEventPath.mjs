import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPreparedTransientKernel,copyPreparedTransientPCM,isPreparedTransientKernel,transientLimits,
  stationaryTransientPose} from '../src/acoustics/events/prepared-path.mjs';
import {transientFixtureScene,transientFixtureSession,transientFixturePoses} from '../src/acoustics/events/fixture-scenes.mjs';
import {AuthoredTransientDescriptorSource} from '../src/acoustics/events/contracts.mjs';
import {encodeTransientDescriptor,transientReadyPacket} from '../src/acoustics/events/wire.mjs';
import {conditionalDirectScene} from '../src/acoustics/engine/contracts.mjs';

const options=name=>({scene:transientFixtureScene(name),sceneId:name,sceneGeneration:1,session:transientFixtureSession,
  sourcePose:transientFixturePoses.source,listenerPose:transientFixturePoses.listener,authority:'authored-fixture-only'});
const kernels=Object.fromEntries(['unknown','open','wall','passage'].map(name=>[name,createPreparedTransientKernel(options(name))]));
const pcm=k=>{const p=new Float32Array(k.frames*2);copyPreparedTransientPCM(k,p);return p;};
const hash=p=>createHash('sha256').update(Buffer.from(p.buffer)).digest('hex');

test('original impulse uses unchanged causal solver/renderer with exact direct physical travel time',()=>{
  const k=kernels.open,p=pcm(k);assert.equal(k.physicalDirectDelayFrames,480);assert.equal(k.firstNonzeroFrame,480);
  assert.equal(k.paths.length,1);for(let n=0;n<480*2;n++)assert.equal(p[n],0);
  assert(k.peak>0&&k.peak<=.001);assert.equal(k.rendererLimited,0);assert.equal(k.kernelAffectedHistoryFrames,0);
  assert.equal(hash(p),k.pcmSha256);assert.equal(k.motionModel,'fixed-authored-source-and-listener-pose');
});

test('finite wall and passage arrivals agree with independent image distances; no authored echo delay',()=>{
  const direct=pcm(kernels.open),wall=pcm(kernels.wall),passage=kernels.passage;
  const reflection=kernels.wall.paths.find(p=>p.order===1),expected=Math.hypot(10,3.43)/343*48000;
  assert(Math.abs(reflection.delayFrames-expected)<1e-8);
  const second=passage.paths.filter(p=>p.order===2);assert.equal(second.length,2);
  assert(second.every(p=>Math.abs(p.delayFrames-Math.hypot(20,3.43)/343*48000)<1e-8));
  let first=-1;for(let f=0;f<kernels.wall.frames;f++)if(Math.max(Math.abs(wall[f*2]-direct[f*2]),Math.abs(wall[f*2+1]-direct[f*2+1]))>1e-10){first=f;break;}
  assert.equal(first,Math.floor(expected));assert.equal(kernels.wall.paths.length,2);assert.equal(passage.paths.length,5);
  assert(kernels.wall.lastSignificantFrame<kernels.wall.frames-256);assert(passage.lastSignificantFrame>kernels.wall.lastSignificantFrame);
  assert(kernels.wall.last256Peak<=kernels.wall.significanceThreshold);
  const exactLast=p=>{for(let f=p.length/2-1;f>=0;f--)if(p[f*2]!==0||p[f*2+1]!==0)return f;return -1;};
  assert.equal(exactLast(wall),kernels.wall.lastNonzeroFrame);
});

test('missing geometry is explicit conditional direct and agrees with the qualified empty fixture',()=>{
  assert.equal(kernels.unknown.geometry,'conditional-direct-unobserved-space-assumed-clear');
  assert.equal(kernels.unknown.paths.length,1);assert.deepEqual(pcm(kernels.unknown),pcm(kernels.open));
  assert.equal(kernels.wall.geometry,'qualified-authored-static-fixture');assert(kernels.wall.immutableSceneWhileWorkerBusy);
});

test('kernel authority, exact fixed pose and camera generation are immutable preparation identities',()=>{
  const k=kernels.wall;assert(Object.isFrozen(k));assert(Object.isFrozen(k.listenerPose.position));
  assert.throws(()=>{k.listenerPose.position[0]=1;},TypeError);
  const o=options('wall');o.listenerPose={position:[0,0,1],generation:2,forward:[1,0,0],up:[0,0,1]};
  const changed=createPreparedTransientKernel(o);assert.notEqual(changed.kernelId,k.kernelId);assert.notEqual(changed.listenerPoseKey,k.listenerPoseKey);
  assert.deepEqual(changed.listenerPose.forward,[1,0,0]);assert.equal(k.listenerPose.generation,1);
});

test('mutable PCM is not exposed; copying a registered kernel cannot corrupt its shared source',()=>{
  const k=kernels.passage,a=pcm(k);a.fill(.5);assert.equal(hash(pcm(k)),k.pcmSha256);
  assert.equal(isPreparedTransientKernel({...k}),false);assert.throws(()=>copyPreparedTransientPCM({...k},a));
  assert.throws(()=>copyPreparedTransientPCM(k,new Float32Array(10)));
});

test('prewarming rejects unbranded geometry, missing authority, short tails and unsupported motion',()=>{
  assert.throws(()=>createPreparedTransientKernel({...options('open'),authority:undefined}));
  assert.throws(()=>createPreparedTransientKernel({...options('open'),scene:{}}));
  assert.throws(()=>createPreparedTransientKernel({...options('wall'),frames:4096}));
  assert.throws(()=>createPreparedTransientKernel({...options('open'),sourcePose:{position:[0,3.43,1],generation:1,velocity:[1,0,0]}}));
  assert.throws(()=>stationaryTransientPose({position:[0,0,0],generation:1,forward:[0,2,0]}));
});

test('an explicitly supplied tileless conditional scene cannot be relabelled qualified geometry',()=>{
  const scene=conditionalDirectScene({calibration:{basis:'declared-demonstration-scale',physicalCalibration:'unverified'},
    modelBounds:{min:[-128,-128,-16],max:[128,128,32]},listenerSession:transientFixtureSession,contextEpoch:1,
    sourceId:'beacon-0',visibilityAssumption:'unobserved-space-assumed-clear'});
  assert.throws(()=>createPreparedTransientKernel({...options('open'),scene}),/explicit null conditional/);
  assert.equal(kernels.unknown.geometry,'conditional-direct-unobserved-space-assumed-clear');
});

test('all shared kernels respect fixed memory, polyphony and aggregate peak budgets without tuning the bed',()=>{
  assert.equal(transientLimits.kernels,8);assert.equal(transientLimits.frames,24000);assert.equal(transientLimits.voices,32);
  assert.equal(transientLimits.descriptorQueue,128);assert.equal(transientLimits.kernels*transientLimits.frames*2*4,1536000);
  assert(transientLimits.voices*transientLimits.peakPerKernel<=.04);assert(.95+transientLimits.voices*transientLimits.peakPerKernel<.99);
  for(const k of Object.values(kernels)){assert.equal(k.kernelAffectedHistoryFrames,0);assert(k.peak<=transientLimits.peakPerKernel);}
});

const descriptorSource=()=>new AuthoredTransientDescriptorSource({mode:'authored-fixture',session:transientFixtureSession,qpcFrequency:10000000,
  library:Object.values(kernels).map((kernel,kernelSlot)=>({kernelSlot,kernel}))});
const event=(sequence=0,edit={})=>({eventId:sequence+1,sourceId:3,sourceGeneration:1,sourceEventSequence:sequence,kernelSlot:2,kernelGeneration:1,listenerGeneration:1,sceneGeneration:1,
  sourcePose:transientFixturePoses.source,listenerPose:transientFixturePoses.listener,
  timing:{basis:'authored-fixture-clock',occurrenceLowerQpc:1000000+sequence*250000,occurrenceUpperQpc:1001000+sequence*250000,
    observationAfterQpc:1003000+sequence*250000,qpcFrequency:10000000},...edit});

test('autofire and concurrent impact descriptors preserve individual occurrence intervals without retrospective delay or PCM copies',()=>{
  const source=descriptorSource();for(let n=0;n<1000;n++)for(const kernelSlot of [0,1,2]){const e=event(n,{eventId:n*3+kernelSlot+1,kernelSlot,sourceId:kernelSlot+1}),r=source.admit(e);
    assert(r.admitted);assert.equal(r.descriptor.occurrenceLowerQpc,e.timing.occurrenceLowerQpc);
    assert.equal(r.descriptor.occurrenceUpperQpc,e.timing.occurrenceUpperQpc);assert.equal(r.descriptor.observationAfterQpc,e.timing.observationAfterQpc);
    assert.equal(r.descriptor.firstNonzeroFrame,480);assert.equal(r.descriptor.authority,'authored-fixture-only');}
  assert.equal(source.stats.admitted,3000);assert.equal(source.stats.retrospectiveDelayMs,0);assert.equal(source.stats.pcmCopiesDuringAdmission,0);
  assert.equal(source.stats.geometryCallsDuringAdmission,0);assert.equal(source.sources.size,3);
});

test('descriptor identity, sequence, exact prepared pose, camera generation and clock are independent admission gates',()=>{
  const source=descriptorSource();assert(source.admit(event()).admitted);assert.equal(source.admit(event()).reason,'duplicate-event-id');
  for(const edit of [{sourceGeneration:2},{listenerGeneration:2},{sceneGeneration:2},{sourcePose:{position:[1,3.43,1],generation:1}}])
    assert.equal(source.admit(event(1,edit)).admitted,false);
  assert.equal(source.admit(event(1,{timing:{...event(1).timing,qpcFrequency:1000}})).reason,'clock-domain');
  assert(source.admit(event(1)).admitted);assert.equal(source.stats.admitted,2);
});

test('native receipt cannot manufacture occurrence; future, uncertain and expired authored intervals remain rejected',()=>{
  for(const timing of [{basis:'native-poll',observationAfterQpc:1000,qpcFrequency:10000000},
    {...event().timing,occurrenceUpperQpc:1004000}, {...event().timing,occurrenceUpperQpc:1030000,observationAfterQpc:1031000},
    {...event().timing,observationAfterQpc:4000000}, {...event().timing,occurrenceLowerQpc:null}])
    assert.equal(descriptorSource().admit(event(0,{timing})).admitted,false);
  assert.throws(()=>new AuthoredTransientDescriptorSource({session:transientFixtureSession,qpcFrequency:10000000,library:[{kernelSlot:0,kernel:kernels.open}]}));
});

test('distinct source bookkeeping is bounded under adversarial impact identities',()=>{
  const source=new AuthoredTransientDescriptorSource({mode:'authored-fixture',session:transientFixtureSession,qpcFrequency:10000000,
    library:Array.from({length:8},(_,kernelSlot)=>({kernelSlot,kernel:kernels.open}))});
  for(let kernelSlot=0;kernelSlot<8;kernelSlot++)assert(source.admit(event(0,{eventId:kernelSlot+1,kernelSlot,sourceId:kernelSlot+1})).admitted);
  assert.equal(source.admit(event(0,{kernelSlot:8,sourceId:9})).admitted,false);assert.equal(source.admit(event(0,{sourceId:100})).admitted,false);
  assert.equal(source.sources.size,8);assert.equal(source.stats.maximumSources,8);assert.equal(source.stats.maximumSourceSlots,8);
});

test('shared finite event IDs cannot be zero, exceed8192 or be reused after the descriptor queue window',()=>{
  const source=descriptorSource();assert.equal(source.admit(event(0,{eventId:0})).admitted,false);
  assert.equal(source.admit(event(0,{eventId:8193})).admitted,false);
  for(let n=0;n<200;n++)assert(source.admit(event(n)).admitted);
  assert.equal(source.admit(event(201,{eventId:1})).reason,'duplicate-event-id');assert.equal(source.seenEventIds.length,8193);
  assert.throws(()=>stationaryTransientPose({position:[0,0,1],generation:2147483648}));
});

test('priority wire has exact root-owned144byte layout, original timestamps and host-only output mapping',()=>{
  const r=descriptorSource().admit(event(2,{eventId:123}));assert(r.admitted);const buffer=Buffer.alloc(144,255);
  assert.equal(encodeTransientDescriptor(r.descriptor,{session:transientFixtureSession,transportSequence:17,priority:1,
    extraClockUncertaintyFrames:3,maximumSoftwareLatenessFrames:960},buffer),buffer);
  assert.equal(buffer.toString('ascii',0,4),'RAE2');assert.equal(buffer.readUInt16LE(4),1);assert.equal(buffer.readUInt16LE(6),1);
  assert.equal(buffer.readUInt32LE(8),144);assert.equal(buffer.readUInt32LE(12),17);assert.equal(buffer.readBigUInt64LE(16),123n);
  assert.equal(buffer.readUInt32LE(24),3);assert.equal(buffer.readUInt32LE(28),1);assert.equal(buffer.readUInt32LE(32),2);
  assert.equal(buffer.readUInt32LE(36),1);assert.equal(buffer.readUInt32LE(40),1);assert.equal(buffer.readUInt32LE(44),1);
  assert.equal(buffer.readUInt32LE(48),1);assert.equal(buffer.readUInt32LE(52),48000);
  assert.equal(Number(buffer.readBigInt64LE(56)),event(2).timing.occurrenceLowerQpc);assert.equal(Number(buffer.readBigInt64LE(64)),event(2).timing.occurrenceUpperQpc);
  assert.equal(buffer.readBigInt64LE(72),-1n);assert.equal(Number(buffer.readBigInt64LE(80)),event(2).timing.observationAfterQpc);
  assert.equal(buffer.readBigInt64LE(88),10000000n);assert.equal(buffer.readBigInt64LE(96),-1n);assert.equal(buffer.readBigUInt64LE(104),2n);
  assert.equal(buffer.readUInt32LE(112),3);assert.equal(buffer.readUInt32LE(116),960);assert.equal(buffer.subarray(120,136).toString('hex'),transientFixtureSession);
  assert.equal(buffer.readBigInt64LE(136),0n);assert.equal(transientReadyPacket(8).toString('ascii',0,4),'RA2R');
  assert.throws(()=>encodeTransientDescriptor({...r.descriptor,authority:'native-rph'},{session:transientFixtureSession,transportSequence:0},buffer));
  assert.throws(()=>encodeTransientDescriptor(r.descriptor,{session:transientFixtureSession,transportSequence:0,maximumSoftwareLatenessFrames:2401},buffer));
});
