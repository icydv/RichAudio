// Optional authored presentation through the existing path-band loss model.
// These profiles are uncalibrated. Core defaults remain
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

// ISO 9613-1 analytical air absorption for a homogeneous atmosphere. One
// representative frequency per existing renderer band, matching the
// roughness model. It is not a weather observation or an equalizer preset.
// Equations 3–5 and Annex B, also published as ECMA-108 Annex A.
export function atmosphericVehicleDistanceSceneOptions({
  temperatureC=20, relativeHumidity=50, pressureKPa=101.325,
}={}){
  const bounded=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
  if(!bounded(temperatureC,-20,40)||!bounded(relativeHumidity,0,100)||!bounded(pressureKPa,70,110))
    throw Error('explicit bounded uniform atmosphere required');
  const kelvin=temperatureC+273.15, temperatureRatio=kelvin/293.15, pressureRatio=pressureKPa/101.325;
  const vapour=relativeHumidity*10**(-6.8346*(273.16/kelvin)**1.261+4.6151)/pressureRatio;
  const oxygen=pressureRatio*(24+40400*vapour*(.02+vapour)/(.391+vapour));
  const nitrogen=pressureRatio/Math.sqrt(temperatureRatio)*
    (9+280*vapour*Math.exp(-4.170*(temperatureRatio**(-1/3)-1)));
  const classical=1.84e-11*Math.sqrt(temperatureRatio)/pressureRatio;
  const oxygenScale=.01275*Math.exp(-2239.1/kelvin);
  const nitrogenScale=.1068*Math.exp(-3352/kelvin);
  return {airDbPerMetre:[200,1600,6400].map(frequency=>{
    const squared=frequency*frequency;
    const relaxation=oxygenScale/(oxygen+squared/oxygen)+nitrogenScale/(nitrogen+squared/nitrogen);
    return 8.686*squared*(classical+temperatureRatio**-2.5*relaxation);
  })};
}
