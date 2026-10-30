// Optional authored presentation through the existing path-band loss model.
// Neither profile is a measured atmospheric calibration. Core defaults remain
// in engine/contracts.mjs; this helper adds no renderer, EQ stage or room field.
export const vehicleDistancePresentations=Object.freeze({
  'physical-default':Object.freeze({
    basis:'existing-propagation-model-default',physicalCalibration:'unverified',
    airDbPerMetre:Object.freeze([0.0001,0.001,0.01]),
  }),
  'authored-detail-loss-v1':Object.freeze({
    basis:'authored-distance-presentation-assumption',physicalCalibration:'unverified',
    // At 2 m, additional nominal mid/high loss is only .018/.18 dB.
    // At 100 m it is .9/9 dB. Actual frequency response is gentler because
    // existing complementary first-order bands overlap around 400 Hz/4 kHz.
    airDbPerMetre:Object.freeze([0.0001,0.01,0.10]),
  }),
});

export function vehicleDistanceSceneOptions(profile='physical-default'){
  if(!Object.hasOwn(vehicleDistancePresentations,profile))throw Error('explicit supported vehicle distance presentation required');
  return {airDbPerMetre:[...vehicleDistancePresentations[profile].airDbPerMetre]};
}
