// Original synthesis designs, not measured manufacturer models or copied audio.
// Local vectors use [right, forward, up] metres; all radiation values are estimates.
const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
export const vehicleLayerNames = Object.freeze(['mechanical', 'exhaust', 'intake', 'drivetrain', 'tyres', 'aero', 'induction', 'transients']);
const finite = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
export function createVehicleProfile(input) {
  const p = structuredClone(input);
  if (!p || !/^[a-z0-9-]{1,48}$/.test(p.id) || ![2,4].includes(p.strokes) ||
      !Number.isInteger(p.cylinders) || p.cylinders < 1 || p.cylinders > 16 ||
      !finite(p.idleRpm, 400, 2500) || !finite(p.redlineRpm, p.idleRpm + 1000, 16000) ||
      !finite(p.responseSeconds, .025, 1) || !finite(p.decelerationSeconds, .025, 2) ||
      !finite(p.shiftSeconds, .025, .5) || !finite(p.texture, 0, 1) ||
      !finite(p.mechanicalRadiationHz, 20, 200)) throw Error('invalid vehicle profile bounds');
  const cycleDegrees = 180 * p.strokes;
  if (!Array.isArray(p.firingPattern) || p.firingPattern.length !== p.cylinders ||
      p.firingPattern.some(e => !Number.isInteger(e.cylinder) || e.cylinder < 1 || e.cylinder > p.cylinders ||
        !finite(e.angleDegrees, 0, cycleDegrees - 1e-6) || !finite(e.weight, .1, 2)) ||
      new Set(p.firingPattern.map(e => e.cylinder)).size !== p.cylinders ||
      new Set(p.firingPattern.map(e => e.angleDegrees)).size !== p.cylinders) throw Error('invalid firing pattern');
  if (!Array.isArray(p.mechanicalOrders) || !p.mechanicalOrders.length || p.mechanicalOrders.length > 12 ||
      p.mechanicalOrders.some(o => !finite(o.order, .5, 24) || !Number.isInteger(o.order*2) || !finite(o.amplitude, 0, 1) || !finite(o.phase, -Math.PI, Math.PI)) ||
      !p.mechanicalOrders.some(o => o.amplitude > 0)) throw Error('invalid mechanical orders');
  if (!p.induction || !['none', 'supercharger', 'turbocharger'].includes(p.induction.kind) ||
      !finite(p.induction.order, 0, 40) || !finite(p.induction.spoolSeconds, .03, 2) ||
      !finite(p.induction.maximumHz, 0, 11000) || !finite(p.exhaustBrightness, .3, 2) ||
      typeof p.allowOverrunPops !== 'boolean') throw Error('invalid induction or exhaust configuration');
  let maximumGain = 0;
  for (const name of vehicleLayerNames) {
    const c = p.components?.[name];
    if (!c || !finite(c.gain, 0, .4) || !finite(c.directivity, 0, 1) ||
        !Array.isArray(c.offset) || c.offset.length !== 3 || c.offset.some(x => !finite(x, -4, 4)) ||
        !Array.isArray(c.axis) || c.axis.length !== 3 || c.axis.some(x => !finite(x, -1, 1)) ||
        c.axis[2] !== 0 || Math.abs(Math.hypot(...c.axis) - 1) > 1e-6) throw Error('invalid vehicle component');
    maximumGain += c.gain;
  }
  if (maximumGain > .85) throw Error('vehicle component gain budget');
  if (p.provenance?.basis !== 'original-design-estimates') throw Error('explicit estimated profile provenance required');
  return freeze(p);
}
const components = {
  mechanical: {gain:.19, offset:[0,-.25,.65], axis:[0,1,0], directivity:.15},
  exhaust: {gain:.32, offset:[0,-1.8,.28], axis:[0,-1,0], directivity:.65},
  intake: {gain:.07, offset:[0,.5,.75], axis:[0,1,0], directivity:.5},
  drivetrain: {gain:.025, offset:[0,-.6,.35], axis:[0,-1,0], directivity:.12},
  tyres: {gain:.05, offset:[0,0,.12], axis:[1,0,0], directivity:.08},
  aero: {gain:.04, offset:[0,.7,.9], axis:[0,1,0], directivity:.2},
  induction: {gain:.03, offset:[0,.4,.7], axis:[0,1,0], directivity:.4},
  transients: {gain:.07, offset:[0,-1.8,.28], axis:[0,-1,0], directivity:.65},
};
const provenance = {basis:'original-design-estimates', calibration:'uncalibrated-relative-digital-amplitude',
  note:'Original architecture-inspired designs. No manufacturer identity, measured source power, exhaust geometry or recording-derived calibration is claimed.'};
export const vehicleProfiles = freeze({
  hypercarV12: createVehicleProfile({id:'original-hypercar-v12', name:'Original high-revving V12', architecture:'V12 even-fire',
    cylinders:12, strokes:4, idleRpm:1050, redlineRpm:9800, responseSeconds:.115, decelerationSeconds:.27, shiftSeconds:.10,
    firingPattern:[1,7,5,11,3,9,6,12,2,8,4,10].map((cylinder,i)=>({cylinder,angleDegrees:i*60,weight:[1,.95,1.03,.98,1.02,.96][i%6]})),
    mechanicalOrders:[{order:.5,amplitude:.12,phase:.2},{order:1,amplitude:.47,phase:0},{order:2,amplitude:.23,phase:.7},
      {order:3,amplitude:.12,phase:-.2},{order:6,amplitude:.19,phase:.3},{order:12,amplitude:.08,phase:1}],
    texture:.35, exhaustBrightness:1.35, mechanicalRadiationHz:50, allowOverrunPops:true,
    induction:{kind:'none',order:0,spoolSeconds:.2,maximumHz:0},components,provenance}),
  roadV8: createVehicleProfile({id:'original-supercharged-v8', name:'Original low-revving supercharged V8', architecture:'V8 cross-plane inspired bank imbalance',
    cylinders:8, strokes:4, idleRpm:750, redlineRpm:6200, responseSeconds:.23, decelerationSeconds:.44, shiftSeconds:.18,
    // Whole-engine firing is even. Original bank/radiation weights yield lower cycle orders.
    firingPattern:[1,8,4,3,6,5,7,2].map((cylinder,i)=>({cylinder,angleDegrees:i*90,weight:[1,.72,1,.84,.78,1,.82,1][i]})),
    mechanicalOrders:[{order:.5,amplitude:.2,phase:.2},{order:1,amplitude:.62,phase:0},{order:1.5,amplitude:.1,phase:-.4},
      {order:2,amplitude:.26,phase:.5},{order:4,amplitude:.17,phase:.2},{order:8,amplitude:.055,phase:1}],
    texture:.49, exhaustBrightness:.7, mechanicalRadiationHz:35, allowOverrunPops:false,
    induction:{kind:'supercharger',order:14,spoolSeconds:.08,maximumHz:7000},
    components:{...components,mechanical:{...components.mechanical,offset:[0,.9,.65],gain:.23},
      exhaust:{...components.exhaust,gain:.28,directivity:.5},intake:{...components.intake,offset:[0,1.1,.8],directivity:.6}},provenance}),
});
