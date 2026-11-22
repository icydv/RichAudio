import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {StockVehicleSource,isVerifiedStockBank,loadStockNpcAssets,prepareStockSource10,warmStockSourceJit10} from './stock-source.mjs';

const blockFrames=512,slotCount=5,roles=['engine','exhaust'];
const check=(ok,message)=>{if(!ok)throw Error(message);};
function bankSignature(bank){
 const layers=roles.flatMap(role=>['idle','accel'].map(mode=>{
  const layer=bank.layers[role][mode];
  return [role,mode,layer.sha256,layer.sampleRate,layer.frames,layer.playbackState,layer.intervals,layer.sustain];
 }));
 // Two manifests can describe different grain boundaries in identical PCM.
 return createHash('sha256').update(JSON.stringify([bank.model,bank.audioContext,bank.provenance,layers])).digest('hex');
}
function outputChannels(buffer){
 return Array.from({length:slotCount},(_,slot)=>roles.map((_,channel)=>
  new Float32Array(buffer,Float32Array.BYTES_PER_ELEMENT*blockFrames*(slot*2+channel),blockFrames)));
}

function ownNpcSources({session,npcManifest,descriptor,options,buffer}){
 // The main registry established the game graph. Verify the same four recorded
 // layers in this isolate, without loading the player assets or graph catalogue.
 const assets=loadStockNpcAssets(npcManifest),bank=assets.vehicles.get(descriptor.model);
 check(assets.vehicles.size===1&&bank?.audioContext==='npc'&&bankSignature(bank)===descriptor.signature,'NPC source bytes differ');
 const startup=performance.now(),plan=prepareStockSource10(bank);
 warmStockSourceJit10(plan);
 const create=()=>new StockVehicleSource(bank,{...options,preparation10:plan});
 const scratch=[new Float32Array(blockFrames),new Float32Array(blockFrames)];
 for(const lift of [false,true])for(const operatingPoint of [.5,.12,.3,.75,.5,.16,.4,.85]){
  const disposable=create();disposable.prepareInitialMatches01();
  for(let i=0;i<3;i++)disposable.renderInto({operatingPoint,load:lift?.05:.9,lift,running:true},...scratch);
 }
 const untouched=Array.from({length:slotCount},create),active=Array(slotCount).fill(null),outputs=outputChannels(buffer);
 let nextRound=0;
 parentPort.on('message',request=>{
  check(request.session===session&&request.round===nextRound++&&request.slots.length===slotCount,'out-of-order NPC synthesis round');
  const voices=[],began=performance.now();
  for(let i=0;i<slotCount;i++){
   const command=request.slots[i];
   if(!command){active[i]=null;continue;}
   const {identity,generation,sourceFrame,control}=command;
   check(typeof identity==='string'&&identity.length>0&&identity.length<256&&Number.isSafeInteger(generation)&&generation>=1,'invalid NPC lifetime');
   let record=active[i];
   if(!record||record.identity!==identity||record.generation!==generation){
    check(sourceFrame===0,'NPC replacement must begin at zero');
    record={identity,generation,source:untouched.pop()??create()};active[i]=record;
   }
   check(record.source.frame===sourceFrame,'NPC source clock drift');
   if(control)record.source.renderInto(control,...outputs[i]);
   voices.push({index:i,identity,generation,from:sourceFrame,frame:record.source.frame,peak:record.source.stats.peak,
    initialReuses:sourceFrame===0&&control?record.source.initialMatchReuses01():0});
  }
  parentPort.postMessage({session,round:request.round,voices,began,finished:performance.now()});
 });
 parentPort.postMessage({ready:true,session,bytes:plan.bytes,outputBytes:buffer.byteLength,prepareMs:performance.now()-startup});
}

if(!isMainThread&&workerData?.kind==='same-block-npc')ownNpcSources(workerData);

export class NpcBlockWorker{
 constructor({session,npcManifest,bank,options,startupTimeoutMs=12000,workTimeoutMs=250}){
  check(/^[0-9a-f]{32}$/.test(session)&&isVerifiedStockBank(bank)&&bank.audioContext==='npc','verified NPC bank and session required');
  check(Number.isInteger(startupTimeoutMs)&&startupTimeoutMs>0&&startupTimeoutMs<=12000&&
   Number.isInteger(workTimeoutMs)&&workTimeoutMs>0&&workTimeoutMs<=250,'bounded NPC worker deadlines required');
  this.session=session;this.bank=bank;this.workTimeoutMs=workTimeoutMs;
  this.pending=null;this.hadVoice=false;this.nextRound=0;this.closing=false;
  const started=performance.now(),rss=process.memoryUsage().rss;
  const buffer=new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT*blockFrames*2*slotCount);
  this.channels=outputChannels(buffer);
  this.worker=new Worker(new URL(import.meta.url),{workerData:{kind:'same-block-npc',session,npcManifest,descriptor:{model:bank.model,signature:bankSignature(bank)},options,buffer}});
  const ready=Promise.withResolvers();this.ready=ready.promise;this.rejectReady=ready.reject;
  this.startTimer=setTimeout(()=>this.fail(Error('NPC startup deadline exceeded')),startupTimeoutMs);
  this.worker.on('message',message=>{
   if(this.closing)return;
   if(message.ready&&message.session===session&&this.startTimer){
    clearTimeout(this.startTimer);this.startTimer=null;
    ready.resolve({...message,startupMs:performance.now()-started,processRssChangeBytes:process.memoryUsage().rss-rss});return;
   }
   const work=this.pending;
   if(!work||work.received||message.session!==session||message.round!==work.round){this.fail(Error('NPC receipt mismatch'));return;}
   work.received=true;clearTimeout(work.timer);work.resolve(message);
  });
  this.worker.on('error',error=>this.fail(error));
  this.worker.on('exit',code=>{if(!this.closing)this.fail(Error('NPC worker exited '+code));});
 }
 fail(error){
  this.fault??=error;
  this.rejectReady(error);
  if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}
  this.close();
 }
 source(bank){return bank===this.bank?{detachedNpc:true,vehicle:bank,npc:true,frame:0,stats:{peak:0}}:null;}
 begin(slots,canRender){
  if(this.fault)throw this.fault;
  check(!this.closing&&!this.pending,'NPC rendering already in flight');
  check(slots.length===slotCount,'five fleet slots required');
  const commands=slots.map(slot=>{
   if(!slot.source?.detachedNpc)return null;
   const vehicle=slot.vehicle;return {identity:slot.identity,generation:slot.generation,sourceFrame:slot.source.frame,
    control:canRender(slot)?{operatingPoint:vehicle.operatingPoint,load:vehicle.lift?.05:.9,lift:vehicle.lift,running:vehicle.running}:null};
  });
  const occupied=commands.some(Boolean);
  if(!occupied&&!this.hadVoice)return null;
  this.hadVoice=occupied;
  const {promise:response,resolve,reject}=Promise.withResolvers();
  // Shutdown can interrupt the parallel geometry pass before it awaits us.
  response.catch(()=>{});
  const work={round:this.nextRound++,commands,response,resolve,reject,sent:performance.now(),received:false,joining:false};
  this.pending=work;
  work.timer=setTimeout(()=>this.fail(Error('NPC block deadline exceeded')),this.workTimeoutMs);
  this.worker.postMessage({session:this.session,round:work.round,slots:commands});return work;
 }
 async join(work,slots,inputs){
  check(this.pending===work&&!work.joining&&!this.closing,'NPC join has no matching in-flight round');
  work.joining=true;const receipt=await work.response;
  check(this.pending===work&&!this.closing,'NPC round stopped before copy');
  let seen=0;
  for(const voice of receipt.voices){
   const slot=slots[voice.index],command=work.commands[voice.index];
   check(command&&voice.identity===command.identity&&voice.generation===command.generation&&voice.from===command.sourceFrame&&
    voice.frame===voice.from+(command.control?blockFrames:0)&&slot?.identity===voice.identity&&slot.generation===voice.generation&&slot.source?.detachedNpc&&
    Number.isFinite(voice.peak)&&voice.peak<=.98+1e-12&&voice.peak>=0,'NPC response owner changed');
   const bit=1<<voice.index;check(!(seen&bit),'duplicate NPC receipt');seen|=bit;
  }
  check(seen===work.commands.reduce((mask,c,i)=>c?mask|(1<<i):mask,0),'incomplete NPC receipt');
  for(const voice of receipt.voices){
   const slot=slots[voice.index];slot.source.frame=voice.frame;slot.source.stats.peak=voice.peak;
   if(work.commands[voice.index].control)for(let j=0;j<roles.length;j++)
    inputs['stock:slot'+voice.index+':'+roles[j]].set(this.channels[voice.index][j]);
  }
  this.pending=null;return receipt;
 }
 close(){
  if(!this.closing){
   this.closing=true;clearTimeout(this.startTimer);this.startTimer=null;
   const error=this.fault??Error('NPC worker stopped');this.rejectReady(error);
   if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}
   this.terminated=this.worker.terminate();
  }
  return this.terminated;
 }
}
