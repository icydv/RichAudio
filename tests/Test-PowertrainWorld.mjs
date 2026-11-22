import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePowertrainWorld, powertrainRegistry} from '../src/acoustics/vehicle/powertrain-registry.mjs';
import {batiVoicing} from '../src/acoustics/vehicle/bati-powertrain-voicing.mjs';

const base = {powertrainVoice:'bati-player-on-adder', eligible:[{model:0xb779a091,context:'player'}], acousticWorld:false};
const retained = {privateCacheRoot:'./',derivedCacheRoot:'./',manifestPath:'geometry/manifest.json',
  catalogPath:'resolved/resolved-catalog.json',retainedManifestSHA256:'a'.repeat(64),catalogSHA256:'b'.repeat(64),
  resourceIds:['c'.repeat(24)]};

test('installed world is explicit and uses the retained metadata fingerprints', () => {
  assert.doesNotThrow(() => validatePowertrainWorld(base));
  assert.doesNotThrow(() => validatePowertrainWorld({...base,powertrainWorld:true,acousticWorld:retained}));
  assert.throws(() => validatePowertrainWorld({...base,acousticWorld:retained}), /explicit/);
  assert.throws(() => validatePowertrainWorld({...base,powertrainWorld:true,acousticWorld:{...retained,retainedManifestSHA256:null}}), /retained/);
  assert.throws(() => validatePowertrainWorld({...base,powertrainWorld:true,acousticWorld:{...retained,resourceIds:[]}}), /retained/);
  assert.throws(() => validatePowertrainWorld({...base,powertrainWorld:true,acousticWorld:retained,eligible:[...base.eligible,{model:0xf9300cc5,context:'npc'}]}), /one stock ADDER/);
});

test('the development donor preserves the observed ADDER identity and slot boundary', () => {
  const bank={model:'bati'}, voice={bank,status:'available'};
  const retainedBank={
    resolve:model=>model===0xf9300cc5?voice:{status:'unavailable'},
    createSource:(model,context)=>({model,context}),
  };
  const registry=powertrainRegistry(retainedBank);
  assert.deepEqual(registry.resolve(0xb779a091,'player'),{bank,status:'available',model:'adder',modelHash:0xb779a091});
  assert.deepEqual(registry.createSource(0xb779a091,'player'),{model:0xf9300cc5,context:'player'});
  assert.equal(registry.resolve(0xb779a091,'npc').status,'unavailable');
  assert.throws(()=>registry.createSource(0xf9300cc5,'player'),/unbound/);
});

test('Bati voicing requires the one-car opt-in', () => {
  assert.equal(validatePowertrainWorld({...base,powertrainVoicing:batiVoicing}),true);
  assert.throws(() => validatePowertrainWorld({...base,powertrainVoice:undefined,powertrainVoicing:batiVoicing}), /dedicated/);
  assert.throws(() => validatePowertrainWorld({...base,powertrainVoicing:'unknown'}), /dedicated/);
  assert.throws(() => validatePowertrainWorld({...base,powertrainVoicing:batiVoicing,vehicleSourcePolicy:'catalogue-fleet-01'}), /one stock ADDER/);
});
