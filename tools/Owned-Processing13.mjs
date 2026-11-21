// Process controls apply only to children created here and held at an IPC gate.
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import fs from 'node:fs';
const check=(ok,reason)=>{if(!ok)throw Error(reason);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const isolatedInputs13=['PLAYABLE01_CANDIDATE','RICHAUDIO_INSTALLED_CATALOG','RICHAUDIO_STOCK_SOURCE05_REPORT','RICHAUDIO_NPC_MANIFEST','RICHAUDIO_CODEWALKER_ROOT','RICHAUDIO_PROVIDER08_PACKAGE','RICHAUDIO_PROVIDER08_FIXTURES','RICHAUDIO_XML05_SUPERVISOR','RICHAUDIO_XML05_RUNTIME','RICHAUDIO_NG041_SUPERVISOR','RICHAUDIO_NG041_RUNTIME','NODE_OPTIONS','NODE_PATH','DOTNET_STARTUP_HOOKS','COR_ENABLE_PROFILING','COR_PROFILER','CORECLR_ENABLE_PROFILING','CORECLR_PROFILER'];
const cleanEnvironment=()=>{const env={...process.env};for(const key of isolatedInputs13)delete env[key];return env;};
export async function hashExecutedNode13(){
 const before=await fs.promises.lstat(process.execPath,{bigint:true});
 check(before.isFile()&&!before.isSymbolicLink()&&before.size>0n&&before.size<=128n*1024n*1024n,'bounded regular executed Node binary required');
 const digest=createHash('sha256');let bytes=0;
 for await(const chunk of fs.createReadStream(process.execPath,{highWaterMark:64*1024})){bytes+=chunk.length;check(bytes<=128*1024*1024,'executed Node stream bound');digest.update(chunk);}
 const after=await fs.promises.lstat(process.execPath,{bigint:true});
 check(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs&&BigInt(bytes)===before.size,'executed Node changed while hashing');
 return {sha256:digest.digest('hex'),bytes,node:process.version,scope:'Bounded streamed bytes at this process.execPath; no claim of independent loaded-image authentication.'};
}
export function startOwnedProcessing13(script,role,config,{lifetimeMs=30000,failStop=false}={}){
 check(['render','contender'].includes(role)&&Number.isInteger(lifetimeMs)&&lifetimeMs>=1000&&lifetimeMs<=45000,'bounded owned child role/lifetime required');
 const nonce=randomUUID(),args=['--max-old-space-size='+(role==='render'?192:64),script,'--owned-child',JSON.stringify({role,nonce,config,lifetimeMs})];
 const child=spawn(process.execPath,args,{cwd:path.dirname(path.dirname(script)),env:cleanEnvironment(),windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
 const record={role,pid:child.pid??null,parentPid:process.pid,nonce,createdUtc:new Date().toISOString(),messages:[],joined:false,exitCode:null,signal:null,stdout:'',stderr:'',failure:null,affinity:null,lifetimeMs};
 let resolveDone,resolveReady,rejectReady;
 const done=new Promise(resolve=>resolveDone=resolve),ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 // A readiness rejection is observed even when an earlier startup step fails.
 ready.catch(()=>{});
 const readyTimer=setTimeout(()=>{record.failure??='owned child ready deadline';rejectReady(Error(record.failure));child.kill();},5000);
 const lifetime=setTimeout(()=>{record.failure??='owned child parent lifetime deadline';record.parentLifetimeKill=true;child.kill();},lifetimeMs+7000);
 function append(data,key){record[key]+=data.toString();if(record.stdout.length+record.stderr.length>24*1024*1024){record.failure??='owned child output bound';child.kill();}}
 child.stdout.on('data',data=>append(data,'stdout'));child.stderr.on('data',data=>append(data,'stderr'));
 child.on('message',message=>{
  if(record.messages.length>=64){record.failure??='owned child IPC output bound';child.kill();return;}record.messages.push(message);
  if(message?.kind==='held-ready'){
   try{check(message.pid===child.pid&&message.parentPid===process.pid&&message.nonce===nonce&&Number.isFinite(message.timeOrigin),'exact newly owned child identity required');clearTimeout(readyTimer);resolveReady(message);}
   catch(error){record.failure??=error.message;rejectReady(error);child.kill();}
  }
 });
 child.once('error',error=>{record.failure??=error.message;rejectReady(error);});
 child.once('close',(code,signal)=>{clearTimeout(readyTimer);clearTimeout(lifetime);record.joined=true;record.exitCode=code;record.signal=signal;record.stdoutSha256=sha(record.stdout);record.stderrSha256=sha(record.stderr);rejectReady(Error('owned child closed before readiness'));resolveDone(record);});
 const send=message=>new Promise((resolve,reject)=>{if(!child.connected)return reject(Error('owned child IPC disconnected'));child.send(message,error=>error?reject(error):resolve());});
 return {child,record,done,ready,async go(){await ready;check(!record.joined&&!record.failure,'owned child remains held');await send({kind:'go',nonce});},async stop(){
  if(record.joined)return done;
  const timer=setTimeout(()=>{record.stopDeadlineKill=true;record.failure??='owned stop deadline';child.kill();},2500);
  try{if(failStop)throw Error('injected owned stop-send failure');await send({kind:'stop',nonce});}
  catch(error){record.stopSendError=error.message;record.failure??=error.message;child.kill();}
  try{return await done;}finally{clearTimeout(timer);}
 }};
}

export async function qualifyOwnedAffinity13(owned,{mode='normal',mask=null}={}){
 check(['normal','restricted4','restricted1'].includes(mode)&&process.platform==='win32','Windows owned affinity control required');
 const ready=await owned.ready;check(!owned.record.joined&&!owned.record.failure,'live held child required for affinity');
 check(mask===null||/^[1-9][0-9]{0,18}$/.test(mask),'bounded positive affinity mask required');
 const script=`$ErrorActionPreference='Stop';$p=[Diagnostics.Process]::GetProcessById(${owned.record.pid});$start=$p.StartTime.ToUniversalTime();$expected=[DateTimeOffset]::FromUnixTimeMilliseconds(${Math.round(ready.timeOrigin)}).UtcDateTime;if([Math]::Abs(($start-$expected).TotalMilliseconds)-gt2000){throw 'Owned PID start-time qualification failed'};$ticks=$start.Ticks;$before=$p.ProcessorAffinity.ToInt64();if($before-le0){throw 'Unsupported processor-group affinity'};$target=$before;${mask!==null?`$target=[Int64]::Parse('${mask}');`:(mode!=='normal'?`$remaining=$before;$target=[Int64]0;for($i=0;$i-lt${mode==='restricted4'?4:1};$i++){if($remaining-eq0){throw 'Requested restricted logical CPUs unavailable'};$bit=$remaining-band(-$remaining);$target=$target-bor$bit;$remaining=$remaining-bxor$bit;}`:'')}$p.Refresh();if($p.StartTime.ToUniversalTime().Ticks-ne$ticks){throw 'Owned PID start-time changed'};${mode!=='normal'||mask!==null?'$p.ProcessorAffinity=[IntPtr]::new($target);':''}$p.Refresh();$after=$p.ProcessorAffinity.ToInt64();if($after-ne$target){throw 'Owned affinity readback differs'};[ordered]@{pid=$p.Id;startUtc=$start.ToString('o');startTicks=$ticks.ToString();beforeMask=$before.ToString();requestedMask=$target.ToString();actualMask=$after.ToString();changed=($before-ne$after);startTimeQualified=$true;processorGroupLimitation='Current Windows process processor group only'}|ConvertTo-Json -Compress`;
 const executable=path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const result=await new Promise((resolve,reject)=>{
  const started=performance.now();
  const helper=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:cleanEnvironment(),windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',failure=null;const timer=setTimeout(()=>{failure='affinity helper deadline';helper.kill();},5000);
  helper.stdout.on('data',data=>{stdout+=data;if(stdout.length>8192){failure='affinity helper output bound';helper.kill();}});helper.stderr.on('data',data=>{stderr+=data;if(stderr.length>8192){failure='affinity helper output bound';helper.kill();}});
  helper.once('error',error=>failure=error.message);helper.once('close',(code,signal)=>{
   clearTimeout(timer);
   const timedOut=failure==='affinity helper deadline';
   owned.record.affinityHelper={pid:helper.pid,joined:true,exitCode:code,signal,stderr,elapsedMs:performance.now()-started,timedOut,stdoutBytes:Buffer.byteLength(stdout),phase:'before-render-start'};
   if(failure||code!==0)reject(Object.assign(Error(failure??(stderr||'affinity helper failure')),{code:timedOut?'AFFINITY_HELPER_TIMEOUT':'AFFINITY_HELPER_FAILED'}));
   else{try{resolve(JSON.parse(stdout));}catch(error){reject(error);}}
  });
 });
 check(!owned.record.joined&&result.pid===owned.record.pid&&result.startTimeQualified&&result.actualMask===result.requestedMask,'held owned affinity identity/readback required');
 owned.record.affinity={mode,...result,appliedAfterNodeStartup:true,heldAtApplicationIpcGate:true,equivalenceScope:'Logical CPU count only; no equivalence to hosted CPU model, SMT, physical cores, V8 thread pools or startup topology.'};return owned.record.affinity;
}

export async function waitOwnedMessage13(owned,kind){
 if(owned.record.messages.some(m=>m.kind===kind))return;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('owned '+kind+' handshake deadline')),3000);
  const onMessage=message=>{if(message?.kind===kind)finish();},onClose=()=>finish(Error('owned child closed before '+kind));
  function finish(error){clearTimeout(timer);owned.child.off('message',onMessage);owned.child.off('close',onClose);if(error)reject(error);else resolve();}
  owned.child.on('message',onMessage);owned.child.once('close',onClose);
 });
}

export function qualifyOwnedCompletion13(record,{render=false}={}){
 return record.joined&&record.exitCode===0&&!record.signal&&!record.failure&&!record.parentLifetimeKill&&!record.stopDeadlineKill&&!record.stopSendError&&record.affinity?.startTimeQualified===true&&record.affinity.actualMask===record.affinity.requestedMask&&record.messages.some(m=>m.pid===record.pid&&m.kind===(render?'render-finished':'contender-stopped')&&(render||m.reason==='requested'&&m.iterations>0&&m.elapsedMs>0))&&(render||record.messages.some(m=>m.kind==='contender-active'&&m.pid===record.pid));
}

export async function ownedChildGate13(input,run){
 check(process.send&&['render','contender'].includes(input.role)&&typeof input.nonce==='string','owned IPC child required');
 let resolveGo,resolveStop;const go=new Promise(resolve=>resolveGo=resolve),stop=new Promise(resolve=>resolveStop=resolve);let stopping=false;
 const deadline=setTimeout(()=>{process.stderr.write('owned self lifetime deadline\n');process.exitCode=1;stopping=true;resolveGo(false);resolveStop();},input.lifetimeMs);
 const onMessage=message=>{if(message?.nonce!==input.nonce)return;if(message.kind==='go')resolveGo(true);if(message.kind==='stop'){stopping=true;resolveGo(false);resolveStop();}};
 process.on('message',onMessage);process.once('disconnect',()=>{stopping=true;resolveGo(false);resolveStop();});
 const runtimeAtGate=input.role==='render'?await hashExecutedNode13():null;
 process.send({kind:'held-ready',pid:process.pid,parentPid:process.ppid,nonce:input.nonce,timeOrigin:performance.timeOrigin,runtimeAtGate});
 try{if(!await go)return;
  if(input.role==='render'){
   const result=await run(input.config,{runtimeAtGate});process.stdout.write(JSON.stringify(result));process.send({kind:'render-finished',pid:process.pid});
  }else{
   let value=1,iterations=0;const started=performance.now();process.send({kind:'contender-active',pid:process.pid});
   while(!stopping){const until=performance.now()+4;while(performance.now()<until){for(let i=0;i<4096;i++)value=(Math.imul(value,1664525)+1013904223)|0;iterations++;}if(process.memoryUsage.rss()>192*1024*1024)throw Error('owned contender RSS bound');await new Promise(resolve=>setImmediate(resolve));}
   process.send({kind:'contender-stopped',pid:process.pid,reason:process.exitCode?'self-lifetime':'requested',iterations,value,elapsedMs:performance.now()-started,cpu:process.cpuUsage()});
  }
 }finally{clearTimeout(deadline);process.off('message',onMessage);process.disconnect?.();}
}
