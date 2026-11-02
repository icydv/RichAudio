import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTransientFixtureLibrary} from '../src/acoustics/events/fixture-library.mjs';
import {createPreparedTransientKernel,copyPreparedTransientPCM} from '../src/acoustics/events/prepared-path.mjs';
import {transientFixtureScene,transientFixtureSession,transientFixturePoses} from '../src/acoustics/events/fixture-scenes.mjs';
const options={scene:transientFixtureScene('wall'),sceneId:'wall-waveform',sceneGeneration:1,session:transientFixtureSession,
 sourcePose:transientFixturePoses.source,listenerPose:transientFixturePoses.listener,authority:'authored-fixture-only',frames:16384};
const copy=k=>{const p=new Float32Array(k.frames*2);copyPreparedTransientPCM(k,p);return p;};

test('the waveform hook leaves all eight original delta-kernel PCM hashes unchanged',()=>{
 const expected=['ef0c3fed80cc84779c6ffc27c6a06f6be283ab456a3a6c5a7e28dcc7e9bc242f','ef0c3fed80cc84779c6ffc27c6a06f6be283ab456a3a6c5a7e28dcc7e9bc242f',
 '6b17175fadd182f2bb58c5a21c47bb646638aa244b2e308b6b815baeb0925cab','afb4f93610861b4b7fb5555cefdebb32070b37bbea861ddaf1b7a27b734f96d4',
 'ec34dee9c20d870638d655d8fb940fce54baeeafd81d2eb64d97ab8c4b541232','f954ffe2b1e3347dd189ecbefb8245b1d83460b158ab487fdbefc2fe76deb1e7',
 'e864e01368ffc15af543ff2f61fc1e614b63a440a34a76fcf82c5cb0a7190f63','c5cda41409abd125de2ba6842314930aa8b156fa330130780c66ab86da02b372'];
 const library=createTransientFixtureLibrary();assert.equal(library.length,8);
 library.forEach((entry,i)=>{assert.equal(entry.kernel.pcmSha256,expected[i]);assert.equal(Object.hasOwn(entry.kernel,'waveformId'),false);});
});

test('a named original waveform retains physical path timing and immutable content identity',()=>{
 const waveform=Float32Array.from({length:1024},(_,i)=>.2*Math.cos(i*.13)*Math.exp(-i/110));
 const expected=createHash('sha256').update(Buffer.from(waveform.buffer)).digest('hex');
 const kernel=createPreparedTransientKernel({...options,dryWaveform:waveform,waveformId:'original-impact-02',amplitude:.004});
 assert.equal(kernel.waveformSha256,expected);assert.equal(kernel.waveformFrames,1024);assert.equal(kernel.firstNonzeroFrame,480);
 assert.equal(kernel.kernelAffectedHistoryFrames,0);assert.equal(kernel.rendererLimited,0);assert(kernel.peak<=.001);
 assert.equal(kernel.paths[0].delayFrames,480);assert(kernel.paths.some(p=>p.order===1));
 const pcm=copy(kernel);waveform.fill(0);assert.deepEqual(copy(kernel),pcm);
 assert.notEqual(kernel.kernelId,createPreparedTransientKernel({...options,dryWaveform:new Float32Array([.2]),waveformId:'another-original'}).kernelId);
});

test('waveform preparation rejects missing identity, oversized/nonfinite/unbounded sources and clipped tails',()=>{
 for(const waveform of [new Float32Array(),new Float32Array(8193),new Float32Array([NaN]),new Float32Array([.251]),new Float32Array([0])])
  assert.throws(()=>createPreparedTransientKernel({...options,dryWaveform:waveform,waveformId:'original'}));
 assert.throws(()=>createPreparedTransientKernel({...options,dryWaveform:new Float32Array([.1])}));
 assert.throws(()=>createPreparedTransientKernel({...options,waveformId:'missing-samples'}));
 const waveform=new Float32Array(4096);waveform[4095]=.2;
 assert.throws(()=>createPreparedTransientKernel({...options,frames:8192,dryWaveform:waveform,waveformId:'too-long'}),/retain source/);
});
