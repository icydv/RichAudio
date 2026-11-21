import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { Policy, budget } from './policy.mjs';
import { StopEvidence } from './stop-evidence.mjs';

// Call only in the independent supervisor, contained before it executes.
// onEvent/onDone must enqueue nonblocking messages; UI/file work belongs outside.
export function supervise(command,args,{limits=budget,onEvent=()=>{},onDone=()=>{},cwd,env}={}) {
 const policy=new Policy(limits), evidence=new StopEvidence(limits.ack);
 const origin=performance.now(); // host launch boundary, never readiness/connection
 const child=spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe'],windowsHide:true});
 onEvent({at:0,code:'host-launch-boundary'});
 let bytes=0,buffer='',exited=false,abortAt=null,killed=false,lastPoll=-Infinity,stopPrompt=false,done=false,exitCode=null,exitSignal=null,emissionObserved=false;
 const now=()=>performance.now()-origin;
 const send=commands=>{for(const command of commands){if(!child.stdin.destroyed&&!exited)child.stdin.write(command+'\n');onEvent({at:now(),code:'command-'+command});}};
 const abort=code=>{send(policy.abort(now(),code));if(abortAt===null)abortAt=now();};
 const snapshot=()=>({state:policy.state,normalStop:policy.state==='complete'&&evidence.result().onTimeAcknowledgedStop,receiverStop:!!evidence.receiver,senderStopConfirmed:!!evidence.sender,stopEvidence:evidence.result(),elapsedMs:now(),events:policy.events,killed,verifiedExit:exited,exitCode,signal:exitSignal,startCommandIssued:policy.started,producerEmissionObserved:emissionObserved,nonzeroSubmittedPcm:'unverified',listeningVerdict:'not-collected'});
 const finish=()=>{if(done)return;done=true;clearInterval(timer);onDone(snapshot());};
 child.stdin.on('error',()=>{if(!exited)abort('stdin-failure');});child.on('error',()=>abort('spawn-failure'));
 child.stdout.on('data',chunk=>{
  bytes+=chunk.length;if(bytes>1048576){abort('output-budget');return;}
  buffer+=chunk.toString('utf8');if(buffer.length>16384){abort('line-budget');buffer='';return;}
  let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trimEnd();buffer=buffer.slice(index+1);const at=now(),prior=policy.state;
   send(policy.line(line,at));
   if(line.startsWith('{')){try{const s=JSON.parse(line);if(s.type==='status'&&s.sourceEmitting===true&&policy.started)emissionObserved=true;}catch{}}
   if(prior!=='complete'&&policy.state==='complete'){let elapsed=null;try{elapsed=JSON.parse(line.slice(18,line.lastIndexOf('}')+1)).ElapsedMs??null;}catch{}evidence.receiverObserved(at,elapsed);onEvent({at,code:'receiver-stop-observed'});}
  }
 });
 child.stderr.on('data',()=>abort('child-stderr'));
 const timer=setInterval(()=>{
  const at=now();send(policy.tick(at));
  if(['aborted','complete'].includes(policy.state)&&abortAt===null)abortAt=at;
  if(policy.state==='stopping'&&!stopPrompt){stopPrompt=true;onEvent({at,code:'bridge-stop-required'});}
  if(!['aborted','complete'].includes(policy.state)&&at-lastPoll>=Math.min(250,limits.ready/10)){send(['status']);lastPoll=at;}
  if(!exited&&!killed&&((abortAt!==null&&at-abortAt>=Math.min(3000,limits.kill-limits.ack))||at>=limits.kill)){killed=true;child.kill();onEvent({at,code:'owned-child-kill'});}
  if(at>=limits.end){if(!exited)policy.state='cleanup-unverified';finish();}
 },10);
 child.on('exit',(code,signal)=>{exited=true;exitCode=code;exitSignal=signal;});
 child.on('close',()=>{policy.closed(exitCode,exitSignal,now());finish();}); // tree verification is separately reported by the broker
 return {snapshot,control(message){
  const at=now();
  // Accepted in either order and after exit; never changes terminal/cleanup state.
  if(message==='sender-stop-confirmed')return evidence.confirmSender({confirmedAtMs:at,observedAtMs:at});
  if(message?.type==='sender-stop-evidence')return evidence.confirmSender({...message,confirmedAtMs:at});
  send(policy.tick(at));
  if(['aborted','complete'].includes(policy.state)||at>=limits.ready&&message==='arm')return false;
  if(message==='arm')policy.armed=true;else if(message==='sender-frames-confirmed')policy.senderAck=true;else if(message==='abort')abort('operator-abort');else return false;
  return true;
 }};
}
