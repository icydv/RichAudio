import assert from 'node:assert/strict';
import { batiModel, unit } from './powertrain-drive.mjs';

const stepMs = 50;
const tracks = [
 { id: 'lead-pass', lane: 0, sign: 1, start: .65, travel: 6.6, rev: .69 },
 { id: 'opposing-pass', lane: 1.15, sign: -1, start: .15, travel: 8.8, rev: .44 },
 { id: 'late-approach', lane: -.95, sign: 1, start: 2.15, travel: 8.2, rev: .54 },
 { id: 'receding-traffic', lane: -1.85, sign: 1, start: .05, travel: 9.5, rev: .35 },
 { id: 'returning-traffic', lane: 2.05, sign: -1, start: 1.25, travel: 6.6, rev: .60 }
];
const clamp = x => Math.min(1, Math.max(0, x));
const smooth = x => x*x*(3-2*x);

// Distances are fractions of the supplied passage centerline. Keep the grade
// and camera coordinates from the retained placement out of public fixtures.
export function makeTrafficRoute(placement, route = 'exit', seconds = route === 'exit' ? 12 : 60) {
 assert(['exit', 'covered'].includes(route));
 assert(route === 'exit' ? seconds === 12 : Number.isInteger(seconds) && seconds >= 4 && seconds <= 120);
 const first = placement.sourceStart, last = placement.sourceEnd;
 const span = last.map((x,i) => x-first[i]);
 const tangent = unit([span[0],span[1],0]), side = [tangent[1],-tangent[0],0];
 const camera = placement.cameraForward ?? tangent;
 const angle = Math.atan2(camera[1],camera[0]), frames = [];
 for (let timeMs = 0; timeMs <= seconds*1000; timeMs += stepMs) {
  const t = timeMs/1000, vehicles = [];
  const yaw = route === 'exit' ? smooth(clamp((t-10.6)/1.15)) * (placement.turnRadians ?? 0) : 0;
  for (const [track, config] of tracks.entries()) {
   const recycled = route === 'exit' && track === 4 && t >= 8.8;
   if (route === 'exit' && track === 4 && t >= 8 && !recycled) continue;
   const start = recycled ? 8.8 : config.start, travel = recycled ? 1.7 : config.travel;
   const progress = clamp((t-start)/travel);
   let u = smooth(progress), rate = 6*progress*(1-progress)/travel;
   let facing = recycled ? 1 : config.sign;
   if (route === 'covered') {
    // Bounded oscillations stay within the covered portion of the measured
    // passage. The vehicle reverses along its lane with a fixed heading.
    const phase = t*(.61 + track*.073) + .78*track;
    u = .255 + .16 * Math.sin(phase);
    rate = .16 * (.61 + track*.073) * Math.cos(phase);
    facing = config.sign;
   } else if (recycled) {
    u = .18 + .57*u;
    rate *= .57;
   } else if (config.sign < 0) { u = 1-u; rate *= -1; }
   const rev = route === 'covered'
    ? .15 + config.rev*(.5+.5*Math.sin(t*(.94+track*.19)+track))
    : .11+.018*track + config.rev * smooth(clamp((t-start)/(.9+.14*track))) *
      (1-.82*smooth(clamp((t-start-travel*(.44+.045*track))/(travel*.32))));
   vehicles.push({track, id:config.id, generation: recycled ? 2 : 1, model:batiModel, context:track ? 'npc' : 'player',
    position:first.map((x,i)=>x+span[i]*u+side[i]*config.lane), velocity:span.map(x=>x*rate),
    forward:tangent.map(x=>x*facing), up:[0,0,1], operatingPoint:rev, running:true, valid:true});
  }
  frames.push({timeMs, forward:[Math.cos(angle+yaw),Math.sin(angle+yaw),0], vehicles});
 }
 return {schema:1,route,stepMs,seconds,listener:placement.listener,frames};
}

export function trafficDrive(route) {
 const releaseSeconds = .21;
 return {seconds: route.seconds + releaseSeconds, listener:route.listener, observationStepMs:route.stepMs,
  at(seconds, ticks) {
   const frame = route.frames[Math.min(route.frames.length-1,Math.floor((seconds*1000+.00001)/route.stepMs))];
   return {forward:frame.forward, vehicles: seconds >= route.seconds ? [] :
    frame.vehicles.map(({track, ...vehicle})=>({...vehicle,observationTicks:ticks}))};
  }};
}
