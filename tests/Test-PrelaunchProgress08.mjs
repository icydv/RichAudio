import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {prelaunchPresentation08,startPrelaunchProgress08} from '../tools/prelaunch08.mjs';
const before=()=>({stage:'discovering-resources',readiness:'not-ready',loading:{text:'Discovering acoustic resources…',percent:null,actions:{continuePartiallyAvailable:false}},provider:{stage:'reading-tables',completed:2,total:null,state:'running'}});
test('owned prelaunch presentation keeps discovery indeterminate and separates processed work from readiness',()=>{
 const a=prelaunchPresentation08(before());assert.equal(a.loading.percent,null);assert.equal(a.loading.indeterminate,true);assert.equal(a.provider.completed,2);assert.equal(a.provider.total,null);assert.equal(a.work.eligible,null);assert.equal(a.work.failed,null);assert.equal(a.gameLaunchImplemented,false);
 const raw={...before(),readiness:'partial',completedEligibleTiles:12,eligibleTiles:12,geometryUnknownTiles:1,loading:{text:'Acoustic cache incomplete — review coverage',percent:100}},b=prelaunchPresentation08(raw);assert.equal(b.loading.percent,100);assert.equal(b.readiness,'partial');assert.equal(b.work.geometryUnknown,1);assert.equal(b.actualWorldCoverage,'unmeasured');assert.equal(b.nativeLoadingLabelModified,false);
});
test('prelaunch HTTP accepts no paths or launch operation and invokes an explicit cancellation callback once',async()=>{
 let cancelled=0;const view=await startPrelaunchProgress08({readStatus:before,cancel:()=>{cancelled++;}});
 try{const origin=view.url,{token}=await(await fetch(origin+'/api/prelaunch08/session')).json(),headers={'X-RichAudio-Prelaunch-Token':token};assert.equal((await fetch(origin+'/api/prelaunch08/status')).status,403);assert.equal((await fetch(origin+'/api/prelaunch08/status',{headers:{...headers,Origin:'http://example.invalid'}})).status,403);
  const p=await(await fetch(origin+'/api/prelaunch08/status',{headers})).json();assert.equal(p.loading.percent,null);assert.equal(p.gameLaunchImplemented,false);assert.equal((await fetch(origin+'/api/prelaunch08/launch',{method:'POST',headers,body:'{}'})).status,405);
  assert.equal((await fetch(origin+'/api/prelaunch08/cancel',{method:'POST',headers,body:JSON.stringify({path:'unapproved-resource'})})).status,400);assert.equal(cancelled,0);
  const accepted=await(await fetch(origin+'/api/prelaunch08/cancel',{method:'POST',headers,body:'{}'})).json();assert.equal(accepted.accepted,true);assert.equal(accepted.gameLaunchRequested,false);assert.equal((await fetch(origin+'/api/prelaunch08/cancel',{method:'POST',headers,body:'{}'})).status,409);assert.equal(cancelled,1);
 }finally{assert.equal((await view.close()).callbacksJoined,true);}
});

test('concurrent preparation actions remain single-use and rejected callbacks are visible',async()=>{
 let called=0;const view=await startPrelaunchProgress08({readStatus:before,cancel:()=>{called++;throw Error('private control detail');}});
 try{const {token}=await(await fetch(view.url+'/api/prelaunch08/session')).json(),headers={'X-RichAudio-Prelaunch-Token':token};
  // Every handler is waiting for its body before any body is released.
  let seen=0,ready;const routed=new Promise(resolve=>ready=resolve),waitForHeaders=req=>{if(req.url==='/api/prelaunch08/cancel'&&++seen===4)ready();};view.server.on('request',waitForHeaders);
  const writes=[],requests=Array.from({length:4},()=>new Promise((resolve,reject)=>{const req=http.request(view.url+'/api/prelaunch08/cancel',{method:'POST',headers:{...headers,'Content-Length':2}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.once('error',reject);req.flushHeaders();writes.push(req);}));
  await routed;for(const req of writes)req.end('{}');const results=await Promise.all(requests);view.server.removeListener('request',waitForHeaders);
  assert.equal(results.filter(status=>status===200).length,1);assert.equal(called,1);
  const status=await(await fetch(view.url+'/api/prelaunch08/status',{headers})).json();assert.match(status.actionFailure,/Preparation action failed/);assert.ok(!JSON.stringify(status).includes('private control detail'));
 }finally{await view.close();}
});

test('owned prelaunch partial choice uses actual availability and close joins accepted control work',async()=>{
 let release,called=0;const pending=new Promise(resolve=>release=resolve),raw=before();raw.loading.actions.continuePartiallyAvailable=true;
 const view=await startPrelaunchProgress08({readStatus:()=>raw,continuePartially:()=>{called++;return pending;}});
 const {token}=await(await fetch(view.url+'/api/prelaunch08/session')).json(),headers={'X-RichAudio-Prelaunch-Token':token};
 const accepted=await(await fetch(view.url+'/api/prelaunch08/continue-partially',{method:'POST',headers,body:'{}'})).json();assert.equal(accepted.accepted,true);assert.equal(called,1);
 let joined=false;const closing=view.close().then(value=>{joined=true;return value;});await new Promise(resolve=>setImmediate(resolve));assert.equal(joined,false);release();assert.equal((await closing).callbacksJoined,true);assert.equal((await view.close()).gameLaunched,false);
});
