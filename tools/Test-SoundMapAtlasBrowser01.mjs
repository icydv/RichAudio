// Optional local WebGL qualification using only prebuilt retained data and injected camera frames.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as wait} from 'node:timers/promises';
import {startSoundMap} from './soundmap/server.mjs';
import {installedContextConfig01,verifyMapProofReceipt01} from './soundmap/installed-world-context01.mjs';
import {sha256} from '../src/acoustics/world/collision-mesh.mjs';

const [chrome,file,expected,contextFile,traversalFile,output]=process.argv.slice(2);
assert(output,'Arguments: Chrome, atlas.json, SHA-256, retained context.json, retained traversal.json, fresh private evidence directory');
const root=path.resolve(output);
assert(root.split(path.sep).includes('.local'));fs.mkdirSync(root);
const config=installedContextConfig01(contextFile),atlas=JSON.parse(fs.readFileSync(file)),census=JSON.parse(fs.readFileSync(path.join(path.dirname(file),'provenance.json')));
const places=JSON.parse(fs.readFileSync(traversalFile)).controls;
const placed=census.owners.find(o=>o.instance?.includes('v_michael')&&o.instance.includes('milo')&&!o.instance.includes('garage'));
assert(placed,'Retained selected Michael interior exists');
const ownerId='a'.repeat(32),checkedAt=Date.now(),stopAt=checkedAt+180000;
const receiptPath=path.join(root,'authored-source-receipt.json');
const authored=Buffer.from(JSON.stringify({schema:1,kind:'soundmap-current-source-identity',ownerId,stopAt,configSHA256:config.configSHA256,
 proofEpoch:config.proofEpoch,archiveCount:123,matchingArchiveIdentities:123,archiveContentBytesRead:0,gameExecutableSHA256:config.expectedGameSHA256,checkedAt}));
fs.writeFileSync(receiptPath,authored,{flag:'wx'});
const sourceReceipt=verifyMapProofReceipt01(receiptPath,sha256(authored),config,ownerId,stopAt);
const service=await startSoundMap({root,port:0,viewOnly:true,viewOnlyMap:true,installedContext:config,ownerId,worldAtlas:{file,sha256:expected},sourceReceipt});
const profile=path.join(root,'browser-profile'),browser=spawn(chrome,['--headless=new','--disable-background-networking','--no-first-run','--no-default-browser-check',
 '--remote-debugging-port=0','--window-size=1440,1000','--user-data-dir='+profile,service.descriptor.url],{windowsHide:true,stdio:'ignore'});
const exited=once(browser,'close'),exceptions=[],run={atlas:expected,scope:'Retained geometry and injected camera/receipt; no installed reads, GTA, audio host or endpoint',overview:null,traverse:[],checkedAt};
let socket,stop=false,feed,sequence=0,generation=1,position=places[0].position,interior=null,stage='boot';
const until=async(fn,ms=15000)=>{
 const deadline=performance.now()+ms;let value;
 while(!(value=await fn())){assert(performance.now()<deadline,'Timed out: '+stage);await wait(50);}return value;
};
const headers={'X-RichAudio-Token':service.descriptor.token,'Content-Type':'application/json'};
const get=async route=>(await fetch(service.descriptor.url+route,{headers})).json();
const post=(route,value)=>fetch(service.descriptor.url+route,{method:'POST',headers,body:JSON.stringify(value)});
try{
 const ready=path.join(profile,'DevToolsActivePort');await until(()=>fs.existsSync(ready));
 const [port,browserPath]=fs.readFileSync(ready,'utf8').split(/\r?\n/);
 const target=await until(async()=> (await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.url===service.descriptor.url+'/'));
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let serial=0;const pending=new Map();
 socket.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.text+': '+(msg.params.exceptionDetails.exception?.description??''));
  if(msg.id&&pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id);}
 });
 const cdp=(method,params={})=>new Promise(resolve=>{const id=++serial;pending.set(id,resolve);socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true});
  assert(!r.error&&!r.result?.exceptionDetails,JSON.stringify(r));return r.result?.result?.value;
 };
 async function browserMemory(){
  if(process.platform!=='win32')return null;
  const ws=new WebSocket('ws://127.0.0.1:'+port+browserPath);
  try{
   await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
   const processes=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Browser memory process list timed out')),3000);
    ws.addEventListener('message',e=>{clearTimeout(timer);resolve(JSON.parse(e.data).result.processInfo);},{once:true});
    ws.send(JSON.stringify({id:1,method:'SystemInfo.getProcessInfo'}));
   });
   const ids=processes.map(p=>p.id).filter(x=>Number.isSafeInteger(x)&&x>0).join(',');
   const raw=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    '@(Get-Process -Id '+ids+' -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64,PrivateMemorySize64) | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true,timeout:6000});
   const memory=JSON.parse(raw).map(p=>({role:processes.find(x=>x.id===p.Id)?.type,workingSetMiB:p.WorkingSet64/1048576,privateMiB:p.PrivateMemorySize64/1048576}));
   return {workingSetSumMiB:memory.reduce((n,p)=>n+p.workingSetMiB,0),privateSumMiB:memory.reduce((n,p)=>n+p.privateMiB,0),processes:memory};
  }finally{ws.close();}
 }
 async function screenshot(name){
  const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  assert(r.result?.data,'Browser fixture screenshot');fs.writeFileSync(path.join(root,name),Buffer.from(r.result.data,'base64'),{flag:'wx'});
 }
 await cdp('Runtime.enable');
 await until(()=>evaluate("Boolean(document.querySelector('#scene-title'))"));
 const snapshot=()=>evaluate(`({title:document.querySelector('#scene-title').textContent,coverage:document.querySelector('#atlas-coverage').textContent,
  metrics:Object.fromEntries(Array.from(document.querySelectorAll('#metrics dt'),n=>[n.textContent,n.nextElementSibling.textContent])),
  fps:Number(document.querySelector('#display-fps').textContent),follow:document.querySelector('#follow').classList.contains('active'),
  topDown:document.querySelector('#topdown').classList.contains('active'),footerHidden:document.querySelector('footer').hidden})`);
 const display=()=>snapshot().then(v=>{
  assert(!v.title.includes('incomplete'),JSON.stringify(v));
  const [,hits,loads,evictions,uploads]=v.metrics['Atlas cache']?.match(/^(\d+) visible reuses · (\d+) loads · (\d+) evictions · (\d+) uploads$/)??[];
  return {...v,triangles:Number(v.metrics['Visible atlas triangles']),hits:Number(hits),loads:Number(loads),evictions:Number(evictions),uploads:Number(uploads)};
 });
 stage='whole-world overview';
 run.overview=await until(async()=>{
  const s=await display();return s.triangles===atlas.lods.triangles[0]&&s.metrics['Whole-world overview'].endsWith('ms')&&s;
 },30000);
 run.gpu=await evaluate(`(()=>{const gl=document.querySelector('#atlas-scene').getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
  return {version:gl.getParameter(gl.VERSION),renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):null,depthBits:gl.getParameter(gl.DEPTH_BITS)}})()`);
 assert(run.gpu.depthBits>0&&run.overview.footerHidden);
 await screenshot('whole-world.png');
 run.browserMemoryOverview=await browserMemory();
 await evaluate(`(()=>{
  const atlas=document.querySelector('#atlas-scene'),gl=atlas.getContext('webgl2');
  const clear=gl.clear.bind(gl),draw=gl.drawElements.bind(gl),trace=window.__atlasTrace={frames:0,blank:0,count:null,min:null,max:0};
  gl.clear=function(mask){
   if(trace.count!==null){trace.frames++;if(!trace.count)trace.blank++;trace.min=Math.min(trace.min??Infinity,trace.count);trace.max=Math.max(trace.max,trace.count);}
   trace.count=0;return clear(mask);
  };
  gl.drawElements=function(mode,count,...args){trace.count+=count/3;return draw(mode,count,...args);};
 })()`);
 assert.equal((await post('/api/record/start',{})).status,403);
 assert.equal((await post('/api/host/ready',{})).status,403);
 assert.equal((await fetch(service.descriptor.url+'/api/replay/frame',{headers})).status,403);
 assert.equal((await fetch(service.descriptor.url+'/api/atlas/page?name=..%2Fatlas.json',{headers})).status,404);
 assert.equal((await fetch(service.descriptor.url+'/api/atlas/index')).status,403);
 feed=(async()=>{while(!stop){
  const value={schemaVersion:1,kind:'passive-listener',streamId:'b'.repeat(32),sessionId:'c'.repeat(32),sequence:sequence++,observedAtUnixMs:Date.now(),
   sampleAgeMs:0,coordinateSpace:'gta-native-unscaled',units:'native-unverified',listener:{position,forward:[0,1,0],up:[0,0,1],velocity:null,valid:true,reason:'retained-atlas-replay',generation},
   interiorReadback:interior??{outcome:'no-proxy',proxy:0,ready:null,archetype:null,origin:null,offsetMs:0}};
  const r=await (await post('/api/passive',value)).json();assert.equal(r.accepted,true,JSON.stringify(r));await wait(55);
 }})();
 feed.catch(()=>{});
 const detailed=async()=>{const s=await display();return Number(s.metrics['Visible atlas cells']?.split(' · ')[1]?.split(' ')[0])>0&&s.triangles>512&&s;};
 stage='city details';
 const city=await until(detailed);run.traverse.push({region:places[0].region,...city});
 // A different original 16-unit camera scope. The atlas keeps existing meshes.
 position=position.map((n,i)=>n+(i===1?18:0));await wait(500);
 const street=await display();assert(street.triangles>512&&street.uploads>=city.uploads);
 run.traverse.push({region:'nearby street / original scope boundary',...street});
 await screenshot('city-detail.png');
 stage='warm city revisit';
 await evaluate("document.querySelector('#atlas-overview').click()");
 await until(async()=>{const s=await display();return s.triangles===atlas.lods.triangles[0]&&s;});
 await evaluate("document.querySelector('#follow').click()");
 run.warmRevisit=await until(async()=>{const s=await display();return s.hits>street.hits&&s.triangles>512&&s;});
 assert.equal(run.warmRevisit.evictions,street.evictions);
 await evaluate(`document.querySelector('#topdown').click();document.querySelector('#isometric').click();
  document.querySelector('#scene').dispatchEvent(new WheelEvent('wheel',{deltaY:-250,cancelable:true}));`);
 for(const place of places.slice(1)){
  stage=place.region;
  const old=(await get('/api/frame')).passive.sequence,at=performance.now();position=place.position;generation++;
  await until(async()=>{const s=(await get('/api/frame')).passive;return s.sequence>old&&s.listener.generation===generation;});
  // Current destination's overview never waits for a new local workset.
  const transition=[];for(let i=0;i<5;i++){await wait(60);transition.push((await display()).triangles);}
  const s=await until(detailed);
  const cell=place.position.slice(0,2).map(x=>Math.floor(x/atlas.cellSize)).join('_'),coverage=await get('/api/atlas/coverage?tile='+cell);
  run.traverse.push({region:place.region,observedWithinMs:performance.now()-at,transition,classes:[...new Set(coverage.entries?.map(e=>e.class))],...s});
 }
 stage='placed interior';
 position=placed.matrix.slice(12,15);generation++;
 interior={outcome:'observed',proxy:329,ready:true,archetype:Number(placed.archetype),origin:position,offsetMs:-10};
 const match=await until(async()=>{const f=(await get('/api/frame')).atlasContext;return f?.interior?.id===placed.instance&&f;});
 assert.equal(match.rendererAdmission,false);assert.equal(match.portalState,'unknown');assert(match.interior.remainingMs<500);
 run.interior={matched:match.interior.id,portalState:match.portalState};
 interior=null;
 await until(async()=>!(await get('/api/frame')).atlasContext.interior);
 run.interior.withdrawalOnProxyDisappearance=true;
 interior={outcome:'observed',proxy:329,ready:true,archetype:Number(placed.archetype),origin:position,offsetMs:-10};
 await until(async()=>(await get('/api/frame')).atlasContext.interior);
 stop=true;await feed;
 await wait(650);
 const expired=await get('/api/frame');assert.equal(expired.atlasContext.interior,null);assert(expired.passive.ageMs>500);
 const held=await display();assert(held.triangles>0);run.interior.expiredWithMeshesResident=true;
 run.browserMemoryDetail=await browserMemory();
 run.drawTrace=await evaluate('window.__atlasTrace');
 assert(run.drawTrace.frames>10&&run.drawTrace.blank===0,'No empty WebGL submissions across regions with located geometry');
 await evaluate("document.querySelector('#atlas-overview').click()");
 const again=await until(async()=>{const v=await display();return v.triangles===atlas.lods.triangles[0]&&v;});
 run.overviewAfterCameraExpiry=again;assert(again.hits>0,'At least one visible detail cache reuse');
 assert.equal((await fetch(service.descriptor.url+'/api/atlas/coverage?tile=999_999',{headers})).status,404);
 assert.deepEqual(exceptions,[]);
 run.server=service.status();assert.equal(run.server.audio.hostConnected,false);assert.equal(run.server.accepted,0);
 run.terminal=await service.close();assert.equal(run.terminal.contextClosure.closedWorkers,0);
}finally{
 stop=true;await feed?.catch(()=>{});
 socket?.close();browser.kill();await exited.catch(()=>{});
 await service.close();run.lastStage=stage;run.exceptions=exceptions;
 fs.writeFileSync(path.join(root,'browser-result.json'),JSON.stringify(run,null,2),{flag:'wx'});
 console.log(JSON.stringify({evidence:path.join(root,'browser-result.json'),stage,overview:run.overview?.triangles,regions:run.traverse.length,renderer:run.gpu?.renderer}));
}
