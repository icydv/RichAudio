import test from 'node:test';import assert from 'node:assert/strict';
import {AirflowSourceStreet01,airflowSpeedStreet01} from '../src/acoustics/vehicle/airflow-street01.mjs';
import {originalAirflowEngineStreet01,airflowFrameStreet01} from './fixtures/AirflowStreet01.mjs';
const BLOCK=512,FS=48000,energy=a=>a.reduce((n,x)=>n+x*x,0)/a.length;
const buffers=()=>[new Float32Array(BLOCK),new Float32Array(BLOCK),new Float32Array(BLOCK)];
test('airflow uses observed source velocity relative to air, preserves noise state and remains silent at rest',()=>{
 assert.equal(airflowSpeedStreet01([31.2928,0,0]),31.2928);assert.equal(airflowSpeedStreet01([31.2928,0,0],[31.2928,0,0]),0);
 const a=new AirflowSourceStreet01({seed:42}),b=new AirflowSourceStreet01({seed:42}),ab=buffers(),bb=buffers();
 a.renderInto({velocity:[0,0,0],enabled:true,riderAttached:true,riderViewAttached:true},...ab);for(const c of ab)assert.ok(c.every(x=>x===0));
 let previous=0;for(const mph of [3,30,50,70]){const source=new AirflowSourceStreet01({seed:43}),out=buffers();for(let n=0;n<24;n++)source.renderInto({velocity:[mph*.44704,0,0],enabled:true,riderAttached:true,riderViewAttached:true},...out);const rms=energy(out[1]);assert.ok(rms>previous);previous=rms;assert.ok(out.flatMap(x=>[...x]).every(Number.isFinite));}
 // Two independent identical sources retain every sample and PRNG/filter state.
 b.renderInto({velocity:[0,0,0],enabled:true,riderAttached:true,riderViewAttached:true},...bb);
 for(let n=0;n<10;n++){const controls={velocity:[31.2928,0,0],enabled:true,riderAttached:true,riderViewAttached:true};a.renderInto(controls,...ab);b.renderInto(controls,...bb);for(let c=0;c<3;c++)assert.deepEqual(ab[c],bb[c]);}
 assert.equal(a.frame,11*BLOCK);assert.notDeepEqual(ab[1],ab[2]);
 a.renderInto({velocity:[31.2928,0,0],enabled:false,riderAttached:true,riderViewAttached:true},...ab);for(const c of ab)assert.ok(c.every(x=>x===0));
 assert.throws(()=>airflowSpeedStreet01([NaN,0,0]));assert.throws(()=>a.renderInto({velocity:[0,0,0],enabled:true,level:2},...ab));
});
test('rider pressure needs explicit actor AND view attachment; camera rotation never creates wind',()=>{
 const source=new AirflowSourceStreet01(),out=buffers();
 for(const flags of [{riderAttached:true,riderViewAttached:false},{riderAttached:false,riderViewAttached:true},{}]){source.renderInto({velocity:[31.2928,0,0],enabled:true,...flags},...out);assert.ok(energy(out[0])>0);assert.equal(energy(out[1]),0);assert.equal(energy(out[2]),0);}
 const stationary=new AirflowSourceStreet01();stationary.renderInto({velocity:[0,0,0],enabled:true,riderAttached:true,riderViewAttached:true},...out);assert.equal(energy(out[0]),0);assert.equal(energy(out[1]),0);
});
test('rider detach releases pressure and off periods advance source state without an old-speed burst',()=>{
 const source=new AirflowSourceStreet01({seed:81}),out=buffers();for(let n=0;n<48;n++)source.renderInto({velocity:[31.2928,0,0],enabled:true,riderAttached:true,riderViewAttached:true},...out);
 const gain=source.riderGain;source.renderInto({velocity:[31.2928,0,0],enabled:true,riderAttached:false,riderViewAttached:false},...out);assert.ok(energy(out[1])>0,'bounded local release remains continuous');assert.ok(source.riderGain<gain*.5);
 source.renderInto({velocity:[31.2928,0,0],enabled:true,riderAttached:false,riderViewAttached:false},...out);assert.equal(source.riderReleaseLeft,0);assert.equal(source.riderGain,0);assert.ok(out[1].slice(448).every(x=>x===0),'tail ends exactly after the 960-frame bound');
 const before=source.frame;for(let n=0;n<96;n++)source.renderInto({velocity:[0,0,0],enabled:false,riderAttached:false,riderViewAttached:false},...out);assert.equal(source.frame,before+96*BLOCK);assert.ok(source.riderGain<1e-30);assert.ok(source.exteriorGain<1e-9);
 source.renderInto({velocity:[0,0,0],enabled:true,riderAttached:true,riderViewAttached:true},...out);assert.ok(energy(out[1])<1e-60);assert.ok(energy(out[0])<1e-17,'no retained fast-speed exterior burst');
 const fast=new AirflowSourceStreet01();for(let n=0;n<40;n++)fast.renderInto({velocity:[100,0,0],enabled:true,level:1,riderAttached:true,riderViewAttached:true},...out);assert.ok(out[0].every(x=>Math.abs(x)<1));assert.ok(out[1].every(x=>Math.abs(x)<.25));assert.ok(out[2].every(x=>Math.abs(x)<.25));
});
test('disabled airflow settings preserve exact engine PCM and grain history in the actual pipeline',async()=>{
 const a=await originalAirflowEngineStreet01({enabled:false}),b=await originalAirflowEngineStreet01({enabled:false,level:1});
 try{for(let block=0;block<60;block++){const time=block*BLOCK/FS;for(const run of [a,b]){run.setWall(time*1000);if(block%4===0)run.engine.accept(airflowFrameStreet01(block/4,time),0,200);}const x=await a.engine.render(),y=await b.engine.render();for(let c=0;c<2;c++)assert.deepEqual(x[c],y[c]);}
 assert.equal(a.engine.slots[0].source.frame,b.engine.slots[0].source.frame);assert.equal(a.engine.diagnostics().airflow.riderActive,false);assert.equal(a.engine.pipeline.renderer.stats.limited,0);
 }finally{await a.close();await b.close();}
});
test('actual airflow path has finite reflected exterior arrivals while rider input has no world paths',async()=>{
 const f=await originalAirflowEngineStreet01({geometry:true});let reflected=0,riderEnergy=0,aeroEnergy=0,source=null,sourceFrame=-1;
 try{for(let block=0;block<65;block++){const t=block*BLOCK/FS;f.setWall(t*1000);if(block%4===0)f.engine.accept(airflowFrameStreet01(block/4,t,{cameraGeneration:t>=.35?2:1}),0,200);await f.engine.render();const s=f.engine.slots.find(s=>s.source);if(s){source??=s.source;assert.equal(s.source,source);if(sourceFrame>=0)assert.equal(source.frame-sourceFrame,BLOCK);sourceFrame=source.frame;}
 const paths=f.engine.pipeline.lastControl.paths;reflected+=paths.filter(p=>p.sourceId.endsWith(':aero')&&p.order>0&&p.delay>0).length;assert.ok(paths.every(p=>!p.sourceId.includes('rider')));riderEnergy+=energy(f.engine.localAirflow[0]);aeroEnergy+=energy(f.engine.inputs['stock:slot0:aero']);}
 assert.ok(reflected>0);assert.ok(riderEnergy>0&&aeroEnergy>0);assert.equal(f.engine.diagnostics().pipeline.renderer.limited,0);assert.equal(f.engine.diagnostics().pipeline.history.affectedFrames,0);assert.equal(f.engine.diagnostics().arrivals,1);
 }finally{await f.close();}
});
test('detached roadside motion keeps aero spatial and loss of genuine observations stops source emission',async()=>{
 const f=await originalAirflowEngineStreet01();let stereo=0;try{for(let b=0;b<55;b++){const t=b*BLOCK/FS;f.setWall(t*1000);if(b%4===0)f.engine.accept(airflowFrameStreet01(b/4,t,{rider:false,pass:true}),0,100);await f.engine.render();stereo+=energy(f.engine.left);assert.equal(energy(f.engine.localAirflow[0]),0);assert.equal(energy(f.engine.localAirflow[1]),0);}
 assert.ok(stereo>0);f.setWall(1000);await f.engine.render();assert.equal(f.engine.diagnostics().active,0);assert.equal(f.engine.diagnostics().airflow.exteriorSources,0);
 }finally{await f.close();}
});
test('source expiry releases only the retained local pressure and reaches exact silence within 960 frames',async()=>{
 const f=await originalAirflowEngineStreet01();try{for(let b=0;b<50;b++){const t=b*BLOCK/FS;f.setWall(t*1000);if(b%4===0)f.engine.accept(airflowFrameStreet01(b/4,t),0,100);await f.engine.render();}
 const previous=f.engine.localAirflow[0][BLOCK-1];assert.notEqual(previous,0);f.setWall(1000);await f.engine.render();assert.equal(f.engine.diagnostics().active,0);assert.equal(f.engine.diagnostics().airflow.exteriorSources,0);
 assert.ok(Math.abs(f.engine.localAirflow[0][0]-previous*959/960)<1e-9);assert.equal(f.engine.diagnostics().airflow.localResidualReleaseFrames,448);await f.engine.render();assert.equal(f.engine.diagnostics().airflow.localResidualReleaseFrames,0);assert.ok(f.engine.localAirflow[0].slice(448).every(x=>x===0));await f.engine.render();assert.ok(f.engine.localAirflow.every(a=>a.every(x=>x===0)));
 }finally{await f.close();}
});
