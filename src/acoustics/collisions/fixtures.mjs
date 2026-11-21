import {createAuthoredCollisionContext,createAuthoredCollisionEvent} from './contracts.mjs';
export const collisionFixtureSession='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export function collisionFixture02(name='high-energy',{environment='direct',seconds=3}={}){
 const knownThroughFrame=Math.ceil(seconds*48000/512)*512,context=createAuthoredCollisionContext({session:collisionFixtureSession,knownThroughFrame}),start=10240;
 const identity={session:collisionFixtureSession,vehicleId:name==='motorcycle-barrier'?'authored-bati':'authored-car',vehicleGeneration:1,model:name==='motorcycle-barrier'?0xf9300cc5:1,
  component:name==='light-scrape'?'collision-scrape':name==='glass'?'glass-break':'collision-impact',assembly:'contact',componentGeneration:1};
 const participants=[{vehicleId:identity.vehicleId,vehicleGeneration:1,model:identity.model}];if(name==='high-energy')participants.push({vehicleId:'authored-other-car',vehicleGeneration:1,model:2});
 const definitions={
  'motorcycle-barrier':{velocity:[0,-6,0],mass:250,material:'metal',position:[-2,1.5,1],normal:[0,1,0],radiatorOffset:[0,.05,0],duration:3072},
  'light-scrape':{velocity:[8,.2,0],mass:100,material:'metal',position:[-2,8,1],normal:[0,-1,0],radiatorOffset:[0,-.05,0],duration:24000},
  'high-energy':{velocity:[0,-20,0],mass:1000,material:'metal',position:[-2,0,1],duration:4096},
  glass:{velocity:[0,-7,0],mass:2,material:'glass',position:[-2,0,1.4],duration:4096},
 };
 const d=definitions[name];if(!d)throw Error('explicit original collision fixture');
 const make=(suffix,edit={})=>createAuthoredCollisionEvent({identity,participants,eventId:name+':'+suffix,crashId:'crash:'+name,sequence:0,contactOrdinal:0,parentEventId:null,
  timing:{basis:'authored-audio-frame-clock',occurrenceLowerFrame:start,occurrenceUpperFrame:start,observationFrame:start,validThroughFrame:start+12000},
  contact:{position:d.position,normal:d.normal??[0,1,0],relativeVelocity:d.velocity,positionBasis:'authored-contact-point',relativeMotionBasis:'authored-relative-velocity',radiatorOffset:d.radiatorOffset??[0,0,0]},
  severity:name==='light-scrape'?{basis:'authored-friction-proxy',normalForceN:250,frictionCoefficient:.4}:{basis:'authored-effective-mass',effectiveMassKg:d.mass},
  material:{id:d.material,basis:'authored-material',confidence:1},durationFrames:d.duration,radiatorMotion:'authored-fixed-world-contact',poseKnownThroughFrame:knownThroughFrame,...edit},context);
 const events=[make('primary')];
 if(name==='high-energy')events.push(make('glass',{identity:{...identity,component:'glass-break',assembly:'window'},eventId:name+':glass',sequence:1,contactOrdinal:1,parentEventId:events[0].eventId,
  material:{id:'glass',basis:'authored-material',confidence:1},severity:{basis:'authored-effective-mass',effectiveMassKg:2},durationFrames:4096,
  timing:{basis:'authored-audio-frame-clock',occurrenceLowerFrame:start+256,occurrenceUpperFrame:start+256,observationFrame:start+256,validThroughFrame:start+12256}}),
  make('debris',{identity:{...identity,component:'debris-impact',assembly:'debris'},eventId:name+':debris',sequence:2,contactOrdinal:2,parentEventId:events[0].eventId,
   severity:{basis:'authored-contact-impulse',impulseNs:25},durationFrames:2048,
   timing:{basis:'authored-audio-frame-clock',occurrenceLowerFrame:start+1024,occurrenceUpperFrame:start+1024,observationFrame:start+1024,validThroughFrame:start+13024}}));
 return {name,environment,context,events,listener:{position:[0,3,1.5],velocity:[0,0,0],forward:[0,1,0],up:[0,0,1],generation:1},frames:knownThroughFrame,
  physicalInterpretation:name==='light-scrape'?'authored moving material passes a fixed wall contact patch':'authored fixed contact radiator; no live physics claim'};
}
