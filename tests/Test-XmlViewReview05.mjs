import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import * as model from '../tools/soundmap/ui/model.mjs';
import {startReadOnlyInspection05} from '../tools/soundmap/read-only-inspection05.mjs';
const calibration={originNative:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]],metresPerNativeUnit:1,basis:'original-test-only',reference:'independent-visual-control05',physicalCalibration:'unverified'};
function context(mode='admitted-xml05',c=null){return {schemaVersion:1,kind:'richaudio-visual-context',coordinateSpace:model.MODEL_SPACE,calibration:c,acousticUse:false,knowledge:'historical',provenance:{kind:'original-synthetic',reference:'independent-visual-control05'},inspection05:{mode,anchor:[0,0,0],modelSessionId:mode==='admitted-xml05'?'session05':null,modelStreamId:mode==='admitted-xml05'?'stream05':null,geometryGeneration:mode==='admitted-xml05'?'geometry05':null},tiles:[{id:'tile05',showBounds:true,classification:'unknown-inspection',bounds:{min:[-4,-4,-4],max:[4,4,4]},vertices:[[0,0,0],[2,0,0],[0,0,2]],faces:[[0,1,2]]}]};}
const geometry=c=>({sessionId:'session05',streamId:'stream05',generation:'geometry05',calibration:c});
test('review: admitted model-only context requires exact identity, valid listener and matching valid-or-null calibration',()=>{
 const c=model.parseVisualContext(JSON.stringify(context()));assert.equal(model.visibleContext(c,geometry(null),[0,0,0]).tiles.length,1);
 for(const listener of [null,undefined,[NaN,0,0],[0,0]])assert.equal(model.visibleContext(c,geometry(null),listener).tiles.length,0);
 for(const field of ['sessionId','streamId','generation'])assert.equal(model.visibleContext(c,{...geometry(null),[field]:'different'},[0,0,0]).tiles.length,0);
 for(const value of [false,0,'',{},calibration])assert.equal(model.visibleContext(c,geometry(value),[0,0,0]).tiles.length,0);
 const physical=model.parseVisualContext(JSON.stringify(context('admitted-xml05',calibration)));assert.equal(model.visibleContext(physical,geometry(calibration),[0,0,0]).tiles.length,1);assert.equal(model.visibleContext(physical,geometry({...calibration,metresPerNativeUnit:2}),[0,0,0]).tiles.length,0);assert.equal(model.visibleContext(physical,geometry(null),[0,0,0]).tiles.length,0);
 assert.throws(()=>model.parseVisualContext(JSON.stringify(context('admitted-xml05',{}))),/calibration/);
});
test('review: unqualified visual mesh cannot coexist with any solver geometry or acquire acoustic use',()=>{
 const data=context('unqualified-xml05',calibration),c=model.parseVisualContext(JSON.stringify(data));assert.equal(model.visibleContext(c,null,null).tiles.length,1);assert.equal(model.visibleContext(c,geometry(null),[0,0,0]).tiles.length,0);data.acousticUse=true;assert.throws(()=>model.parseVisualContext(JSON.stringify(data)),/visual-only/);
});
test('review: actual UI clear/error handlers remove context wire boxes before unchanged selection can reuse them',async()=>{
 let source=await fs.readFile(new URL('../tools/soundmap/ui/app.mjs',import.meta.url),'utf8');source=source.replace(/^import[^\n]*\n/,'');const bootstrap=source.lastIndexOf('\nrefreshRecordings().catch(');assert.ok(bootstrap>0);source=source.slice(0,bootstrap);
 const elements=new Map(),windowEvents=new Map();function element(id){if(!elements.has(id))elements.set(id,{value:'',checked:false,style:{},classList:{add(){},remove(){},toggle(){}},events:new Map(),addEventListener(type,fn){this.events.set(type,fn);},getContext(){return {};},getBoundingClientRect(){return {width:800,height:600};},pause(){},removeAttribute(){}});return elements.get(id);}
 const sandbox={...model,console,performance:{now:()=>0},document:{getElementById:element,addEventListener(){},createElement:()=>element('new')},window:{addEventListener:(n,f)=>windowEvents.set(n,f)},setTimeout(){},clearTimeout(){},TextEncoder,URL,AbortSignal,requestAnimationFrame(){},location:{href:'http://127.0.0.1/'}};vm.createContext(sandbox);vm.runInContext(source,sandbox,{timeout:1000});
 const dispatch=windowEvents.get('richaudio-inspection-context05');dispatch({detail:context('unqualified-xml05',calibration)});assert.equal(vm.runInContext('contextBoxes.length',sandbox),1);await element('clear-context').events.get('click')();assert.equal(vm.runInContext('compileContext(presentation(state,passive,0,false));contextBoxes.length',sandbox),0);
 dispatch({detail:context('unqualified-xml05',calibration)});assert.equal(vm.runInContext('contextBoxes.length',sandbox),1);dispatch({detail:{}});assert.equal(vm.runInContext('contextBoxes.length',sandbox),0);
 dispatch({detail:context('unqualified-xml05',calibration)});await element('context-file').events.get('change')({target:{files:[{size:model.LIMITS.contextBytes+1}]}});assert.equal(vm.runInContext('contextBoxes.length',sandbox),0);
});
test('review: inspection HTTP is token-bound GET-only and browser publication/recording/replay/host routes stay closed',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'richaudio-xmlview05-'));let viewer;
 try{viewer=await startReadOnlyInspection05({root,info:{kind:'RichAudioXmlBuildingView05',viewerCanPublishAcoustics:false,qualified:false,originalFixture:true,buildings:[],resources:[],unknown:[]},context:context('unqualified-xml05',calibration)});const origin=viewer.service.descriptor.url,session=await(await fetch(origin+'/api/session')).json(),headers={'X-RichAudio-Token':session.token};assert.equal((await fetch(origin+'/api/xml-building05')).status,403);assert.equal((await fetch(origin+'/api/xml-context05',{headers})).status,200);
  for(const route of ['/api/telemetry','/api/passive','/api/record/start','/api/record/stop','/api/replay/open','/api/host/pcm','/api/host/control','/api/producer/event','/api/service/stop'])assert.equal((await fetch(origin+route,{method:'POST',headers:{...headers,'Content-Type':'application/json','X-RichAudio-Publisher05':'0'.repeat(64)},body:'{}'})).status,405,route);
  for(const route of ['/api/recordings','/api/replay/frame','/api/replay/audio','/api/host/control'])assert.equal((await fetch(origin+route,{headers})).status,405,route);
  assert.equal((await fetch(origin+'/api/xml-context05',{headers:{...headers,Origin:'http://untrusted.invalid'}})).status,403);assert.equal((await fetch(origin+'/api/xml-context05',{headers:{...headers,'Sec-Fetch-Site':'cross-site'}})).status,403);await assert.rejects(viewer.publish({}),/qualified open XML view/);assert.equal(viewer.service.status().accepted,0);assert.equal((await(await fetch(origin+'/api/frame',{headers})).json()).frame,null);assert.equal(viewer.recordingEnabled,false);
 }finally{await viewer?.close();const target=path.resolve(root);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert.ok(path.basename(target).startsWith('richaudio-xmlview05-'));await fs.rm(target,{recursive:true,force:true});}
});
