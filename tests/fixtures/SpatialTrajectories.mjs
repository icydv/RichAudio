// Original timestamped trajectories. No game captures or live-device access.
import {liveConfiguration,nativeEnvelope,geometryEvent,nativeSource} from './LiveGeometry.mjs';

export const spatialCases=Object.freeze(['stationary','slow-rotation','rapid-rotation','slow-rotation-normal','rapid-rotation-normal','orbit','close-pass','close-pass-coincident','accelerate-away','fast-95','fast-99','fast-100','discontinuity','missing-reacquisition','geometry-expiry','moving-source','close-reflection-transition','full-session']);
export const spatialDuration=name=>name==='full-session'?60:name==='close-reflection-transition'?8:name.startsWith('close-pass')||name==='discontinuity'||name==='geometry-expiry'?6:4;
const sourcePosition=[99.7,200.1,3.8],stationary=[100.3,200.1,3.7];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function spatialPose(name,time){
  const coincident=name==='close-pass-coincident';
  name=name.replace(/-normal$/,'');
  if(coincident)name='close-pass';
  let position=[...stationary],velocity=[0,0,0],yaw=0,generation=1,source=null;
  if(name==='slow-rotation')yaw=2*Math.PI*clamp((time-1)/2);
  if(name==='rapid-rotation')yaw=Math.PI*clamp((time-1.5)/.15);
  if(name==='orbit'){
    const t=clamp(time-1,0,2),a=t*Math.PI;
    position=[sourcePosition[0]+.6*Math.cos(a),sourcePosition[1]+.6*Math.sin(a),3.7];
    velocity=time>1&&time<3?[-.6*Math.PI*Math.sin(a),.6*Math.PI*Math.cos(a),0]:[0,0,0];yaw=a;
  }
  if(name==='close-pass'){
    const u=clamp((time-1)/3),x=100.3-1.2*u;
    position=[x,coincident?200.1:200.11,3.7+.1*clamp((time-1)/.5)];velocity=time>1&&time<4?[-.4,0,time<1.5?.2:0]:[0,0,0];
  }
  if(name==='accelerate-away'){
    const u=clamp(time-1,0,2);position[0]+=.35*u*u;velocity[0]=time>1&&time<3?.7*u:0;
  }
  if(name.startsWith('fast-')){
    const speed=Number(name.slice(5)),angular=speed/8,a=time*angular;
    position=[sourcePosition[0]+.8*Math.cos(a),sourcePosition[1]+.8*Math.sin(a),3.7];
    velocity=[-.8*angular*Math.sin(a),.8*angular*Math.cos(a),0];yaw=a;
  }
  if(name==='discontinuity'&&time>=2){position=[100.5,200.5,3.7];generation=2;yaw=Math.PI;}
  if(name==='missing-reacquisition')yaw=.7*Math.sin(time*2);
  if(name==='geometry-expiry')yaw=.4*Math.sin(time*2);
  if(name==='close-reflection-transition')yaw=2*Math.PI*clamp((time-2)/4);
  if(name==='full-session'){
    const moving=Math.max(0,time-2),phase=moving*Math.PI/15;
    position=[100.3-.59*Math.sin(phase),200.11,3.7+.1*clamp(moving/2)];
    velocity=time>2?[-.59*Math.PI/15*Math.cos(phase),0,time<4?.05:0]:[0,0,0];
    yaw=.8*Math.sin(moving*.8)+Math.PI*clamp((time-35)/.25);
    if(time>=44){position[1]+=.4;generation=2;}
  }
  if(name==='moving-source'){
    yaw=.9*Math.sin(time*3);const u=clamp(time-1,0,2);
    source={...nativeSource(),positionNative:[99.7+.12*u,200.1+.03*Math.sin(u*2),3.8],velocityNative:time>1&&time<3?[.12,.06*Math.cos(u*2),0]:[0,0,0]};
  }
  return {position,velocity,forward:[-Math.cos(yaw),-Math.sin(yaw),0],up:[0,0,1],generation,source,yaw};
}
export function contextConfiguration(generation=1,epoch=1,scale=10){
  const configuration=structuredClone(liveConfiguration(epoch).configuration);
  configuration.coordinates.metresPerNativeUnit=scale;
  configuration.minimumListenerGeneration=generation;
  return {type:'listener-context-config',configuration:{contextEpoch:epoch,listenerSession:configuration.listenerSession,
    minimumListenerGeneration:generation,build:configuration.build,coordinates:configuration.coordinates,
    region:configuration.region,sources:configuration.sources,engine:configuration.engine,
    directPath:{mode:'listener-only-conditional-direct',sourceId:'beacon-0',rights:'original-generated',visibilityAssumption:'unobserved-space-assumed-clear'}}};
}
export function spatialEvents(name,{jitter=true}={}){
  if(!spatialCases.includes(name))throw Error('Unknown original spatial trajectory');
  const seconds=spatialDuration(name),events=[],delivery=name.endsWith('-normal')?[0,.003,.012,.020]:[.012,.040,.022,.032];
  const configuration=liveConfiguration(),scale=name==='close-reflection-transition'?.05:10;
  configuration.configuration.coordinates.metresPerNativeUnit=scale;
  events.push({observation:0,receipt:0,message:contextConfiguration(1,1,scale)}, {observation:0,receipt:0,message:configuration});
  let changed=false,revision=0;
  for(let i=0;i*.05<seconds;i++){
    const time=i*.05,pose=spatialPose(name,time),lag=jitter?delivery[i%delivery.length]:0;
    if(name==='missing-reacquisition'&&time>=1.5&&time<1.7)continue;
    if(name==='full-session'&&time>=40&&time<40.2)continue;
    if(pose.generation===2&&!changed){
      changed=true;events.push({observation:time,receipt:time+lag,message:contextConfiguration(2,2)});
      const replacement=liveConfiguration(2);replacement.configuration.minimumListenerGeneration=2;
      events.push({observation:time,receipt:time+lag,message:replacement});
    }
    const {source,yaw,...listener}=pose;
    events.push({observation:time,receipt:time+lag,message:nativeEnvelope(time,i,listener)});
    if(source)events.push({observation:time,receipt:time+lag,message:{type:'owned-sources',epoch:1,sources:[source]}});
    if(name==='geometry-expiry'&&(i===40||i===48)||name==='full-session'&&(i===400||i===408))events.push({observation:time,receipt:time+lag,message:geometryEvent(time,++revision)});
    if(name==='close-reflection-transition'){
      if([40,48,60,68,88,108].includes(i))events.push({observation:time,receipt:time+lag,message:geometryEvent(time,++revision,{wallY:i%3===0?.65:.5})});
      if(i===80)events.push({observation:time,receipt:time+lag,message:{type:'owned-sources',epoch:1,sources:[nativeSource(2)]}});
      if(i===96)events.push({observation:time,receipt:time+lag,message:{...geometryEvent(time,++revision,{empty:true}),unavailableReason:'geometry-unavailable'}});
    }
  }
  events.push({observation:seconds-.5,receipt:seconds-.5,message:{type:'control',command:'emit-stop'}});
  return events.sort((a,b)=>a.receipt-b.receipt);
}
