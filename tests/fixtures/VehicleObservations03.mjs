// Authored API-result fixtures, never acquired gameplay observations.
export const vehicleSession03 = 'a'.repeat(32);
export function authoredVehicleObservation03({ sequence = 0, at = 1000, frequency = 1000,
  session = vehicleSession03, vehicleId = 'retained-vehicle', generation = 1, values = {},
  identity = {}, status = 'observed', retirementReason = null } = {}) {
  const defaults = { hornPlaying: false, engineOn: true, engineStarting: false, rawRevolutionsRatio: 50, currentGear: 1, rawSpeed: 0 };
  for (const key of Object.keys(values)) if (!Object.hasOwn(defaults, key)) throw Error('Unknown authored getter field');
  return { schema: 1, generation, kind: 'vehicle-read-only-observation-03', evidenceBasis: 'authored-device-free-api-fixture',
    session, vehicleId, status, retirementReason, runtimeVerified: false, mayGenerateAudio: false, nativePrimary: true,
    sourcePoseAvailable: false, identity: { poolValue: 4097, poolIndex: 1, poolCounter: 1, model: 0xf9300cc5,
      exists: true, inPlayerDriverScope: true, ...identity }, sequence, clockFrequency: frequency,
    captureBeforeQpc: at, captureAfterQpc: at + 7,
    fields: Object.entries({ ...defaults, ...values }).map(([name, value], i) => ({ name,
      status: status === 'retired' ? 'unavailable' : 'value', value: status === 'retired' ? null : value,
      beforeQpc: status === 'retired' ? null : at + i, afterQpc: status === 'retired' ? null : at + i + 1,
      exceptionType: null, exceptionHResult: null })) };
}
export function authoredVehicleContact03({sequence=0,at=1000,found=true}={}) {
  return {schema:1,generation:1,kind:'vehicle-last-contact-observation-03',evidenceBasis:'authored-device-free-api-fixture',
    session:vehicleSession03,vehicleId:'retained-vehicle',status:'observed',retirementReason:null,exceptionType:null,
    materialName:found?'METAL':null,materialNameStatus:found?'value':'unavailable',runtimeVerified:false,mayGenerateAudio:false,nativePrimary:true,
    lastContactOnly:true,coordinatesQualified:false,materialQualified:false,physicalIntensityAvailable:false,found,
    rawPosition:found?[10,2,1]:null,rawNormal:found?[0,1,0]:null,exceptionHResult:null,sequence,clockFrequency:1000,
    captureBeforeQpc:at,captureAfterQpc:at+3,queryBeforeQpc:at+1,queryAfterQpc:at+2,
    identity:{poolValue:4097,poolIndex:1,poolCounter:1,model:0xf9300cc5,exists:true,inPlayerDriverScope:true}};
}
