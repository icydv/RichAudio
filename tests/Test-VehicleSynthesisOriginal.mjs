import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {VehicleSynthesizer,createVehicleBuffers} from '../src/acoustics/vehicle/synthesizer.mjs';
import {vehicleProfiles,vehicleLayerNames} from '../src/acoustics/vehicle/profiles.mjs';
import {originalSequence,sequenceDigests} from './fixtures/VehicleSynthesisSequence.mjs';
import {VehicleSynthesizer as OriginalSynthesizer,createVehicleBuffers as originalBuffers} from './fixtures/VehicleSynthesisOriginalReference.mjs';
import {vehicleProfiles as originalProfiles} from './fixtures/VehicleSynthesisOriginalProfiles.mjs';

// Captured from the original PR74 source, before the live performance edits.
// Updating this fixture requires reviewing an intentional sound/state change;
// the test never regenerates its own expectations from the implementation.
const golden=JSON.parse(fs.readFileSync(new URL('./fixtures/VehicleSynthesisOriginal.json',import.meta.url),'utf8'));
test('Original synthesis golden has pinned provenance and the authored 180-block control sequence',()=>{
  assert.equal(golden.reference.commit,'eef0cbc2e96e09754d87b375975eb1053422121e');
  assert.deepEqual(golden.sequence,originalSequence);
  assert.deepEqual(golden.layerNames,vehicleLayerNames);
  assert.equal(golden.profiles.length,2);
  for(const source of golden.reference.sources) {
    const synth=source.path.endsWith('/synthesizer.mjs');
    const file=synth?'VehicleSynthesisOriginalReference.mjs':'VehicleSynthesisOriginalProfiles.mjs';
    const original=fs.readFileSync(new URL('./fixtures/'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n')
      .replace("from './VehicleSynthesisOriginalProfiles.mjs'","from './profiles.mjs'");
    assert.equal(createHash('sha256').update(original).digest('hex'),source.sha256,'immutable original source '+source.path);
  }
});
for(const profile of Object.values(vehicleProfiles))test(`${profile.id}: all eight original layers, mix and complete state remain exact through idle, acceleration, shift, redline, overrun and stop`,()=>{
  const actual=sequenceDigests({Synthesizer:VehicleSynthesizer,createBuffers:createVehicleBuffers,profile,layerNames:vehicleLayerNames});
  const original=sequenceDigests({Synthesizer:OriginalSynthesizer,createBuffers:originalBuffers,
    profile:Object.values(originalProfiles).find(p=>p.id===profile.id),layerNames:vehicleLayerNames});
  assert.equal(actual.blocks,180);assert.equal(actual.frames,92160);
  for(const name of [...vehicleLayerNames,'mixed','state'])assert.equal(actual.sha256[name],original.sha256[name],`${profile.id} original ${name}`);
  // Math-library/runtime revisions can alter last-bit results. Same-runtime
  // original comparison above is unconditional; stored digests additionally
  // apply on the exact platform and Node release used to capture them.
  const runtime={node:process.version,platform:process.platform,architecture:process.arch};
  if(JSON.stringify(runtime)===JSON.stringify(golden.captureRuntime)) {
    assert.deepEqual(original,golden.profiles.find(p=>p.profile===profile.id));
  }
});
