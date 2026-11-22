// Fixed opt-in profiles. The manifest is immutable and hash-bound by its owner;
// no environment variable, live control command or adaptive queue changes it.
const profiles=Object.freeze({
 baseline:Object.freeze({id:'baseline',controlDelayMs:100,startupBlocks:8,producerCreditBlocks:8,ringCapacityBlocks:8}),
 'low-latency-01':Object.freeze({id:'low-latency-01',controlDelayMs:75,startupBlocks:8,producerCreditBlocks:6,ringCapacityBlocks:8}),
});
export function resolveLatencyProfile(name='baseline'){
 if(name===null)name='baseline';
 if(typeof name!=='string'||!Object.hasOwn(profiles,name))throw Error('Unknown immutable gameplay latency profile');
 return profiles[name];
}
