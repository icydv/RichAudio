import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeTrafficRoute,trafficDrive} from '../tools/audio/mapped-traffic-route.mjs';

const pose={sourceStart:[10,0,1],sourceEnd:[10,29,0],listener:[14,12,2],cameraForward:[0,1,0],turnRadians:Math.PI/3};
const get=(route,time)=>route.frames.find(row=>row.timeMs===time);

test('five lanes cross a full passage at independent times, release and recycle one handle, then hold for the camera turn',()=>{
 const route=makeTrafficRoute(pose), start=get(route,0), later=get(route,7500);
 assert.deepEqual(start.vehicles.map(v=>v.context),['player','npc','npc','npc','npc']);
 assert.equal(new Set(start.vehicles.map(v=>v.position[0])).size,5);
 assert.equal(new Set(get(route,4000).vehicles.map(v=>v.operatingPoint)).size,5);
 for(const original of start.vehicles){
  const lifetime=route.frames.flatMap(r=>r.vehicles.filter(v=>v.id===original.id&&v.generation===1));
  assert.equal(Math.abs(lifetime.at(-1).position[1]-original.position[1]),29);
  assert(lifetime.some(v=>Math.abs(v.velocity[1])>1));
 }
 assert(later.vehicles[0].position[1]>pose.listener[1]&&start.vehicles[0].position[1]<pose.listener[1]);
 const before=get(route,7950).vehicles, gap=get(route,8000).vehicles, after=get(route,8800).vehicles;
 assert.deepEqual(gap.map(v=>v.id),before.slice(0,4).map(v=>v.id));
 assert.equal(after[4].id,before[4].id);
 assert.equal(after[4].generation,2);
 assert(get(route,10600).vehicles.every(v=>v.velocity.every(x=>x===0)));
 assert.notDeepEqual(get(route,10600).forward,get(route,11800).forward);
 const drive=trafficDrive(route);
 assert.equal(drive.at(8,80_000_000).vehicles.length,4);
 assert.equal(drive.at(8.8,88_000_000).vehicles.at(-1).observationTicks,88_000_000);
 assert.equal(drive.at(12,120_000_000).vehicles.length,0);
});

test('the sixty-second covered repeat keeps five independent bounded motions on a 20 Hz clock',()=>{
 const route=makeTrafficRoute(pose,'covered');
 assert.equal(route.frames.length,1201);
 for(const [i,row] of route.frames.entries()){
  assert.equal(row.timeMs,i*50);
  assert.equal(row.vehicles.length,5);
  assert(row.vehicles.every(v=>v.position[1]>2.6&&v.position[1]<12.1&&v.generation===1));
  assert(row.vehicles.every(v=>v.operatingPoint>=0&&v.operatingPoint<=1));
 }
 for(let track=0;track<5;track++){
  const velocities=route.frames.map(r=>r.vehicles[track].velocity[1]);
  assert(Math.min(...velocities)<-2 && Math.max(...velocities)>2);
 }
});
