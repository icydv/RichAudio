// Fixed opt-in profiles. The manifest is immutable and hash-bound by its owner;
// no environment variable, live control command or adaptive queue changes it.
const profiles=Object.freeze({
 baseline:Object.freeze({id:'baseline',controlDelayMs:100,startupBlocks:8,producerCreditBlocks:8,ringCapacityBlocks:8}),
 'low-latency-01':Object.freeze({id:'low-latency-01',controlDelayMs:75,startupBlocks:8,producerCreditBlocks:6,ringCapacityBlocks:8}),
 'street-01':Object.freeze({id:'street-01',controlDelayMs:75,startupBlocks:8,producerCreditBlocks:6,ringCapacityBlocks:8}),
});
export function resolveLatencyProfile(name='baseline'){
 if(name===null)name='baseline';
 if(typeof name!=='string'||!Object.hasOwn(profiles,name))throw Error('Unknown immutable gameplay latency profile');
 return profiles[name];
}

// Separate explicit product selection. This does not widen the sealed
// LOW-LATENCY-01 demonstration contract or change any existing manifest.
export function validateStreetLatencySelection01(configuration){
 if(configuration?.vehicleSourcePolicy!=null){
  if(configuration.vehicleSourcePolicy!=='catalogue-fleet-01'||configuration.latencyProfile!=='street-01'||configuration.demoProfile!=null||
    configuration.continuityPolicy!=='camera-source-01'||!Array.isArray(configuration.eligible)||configuration.eligible.length!==0)
   throw Error('Catalogue fleet requires normal STREET-01 continuity and no model allowlist');
  return;
 }
 if(configuration?.latencyProfile!=='street-01')return;
 const eligible=configuration.eligible;
 if(configuration.demoProfile!=null||configuration.continuityPolicy!=null&&configuration.continuityPolicy!=='camera-source-01'||!Array.isArray(eligible)||eligible.length<1||eligible.length>2||eligible.some(v=>v?.model!==0xf9300cc5||!['player','npc'].includes(v.context))||eligible.filter(v=>v.context==='player').length!==1||new Set(eligible.map(v=>v.context)).size!==eligible.length)throw Error('STREET-01 latency requires a normal Bati-only package and camera-source-01 continuity');
}
