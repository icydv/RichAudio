import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { Policy, budget } from './policy.mjs';

// Reusable supervisor: child identity is the retained spawn handle, never a PID search.
// No live CLI/approval adapter is shipped. The executable entry below is fixture-only.
export function supervise(command,args,{limits=budget,onEvent=()=>{},onDone=()=>{}}={}) {
  const policy=new Policy(limits), origin=performance.now();
  limits=policy.limits;
  const child=spawn(command,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
  let bytes=0, buffer='', exited=false, abortAt=null, killed=false, stopAck=false, lastPoll=-Infinity, stopPrompt=false;
  const now=()=>performance.now()-origin;
  const send=commands=>{for(const command of commands){if(!child.stdin.destroyed)child.stdin.write(command+'\n');onEvent({at:now(),code:'command-'+command});}};
  const abort=code=>{send(policy.abort(now(),code));if(abortAt===null)abortAt=now();};
  child.stdin.on('error',()=>abort('stdin-failure'));
  child.on('error',()=>abort('spawn-failure'));
  child.stdout.on('data',chunk=>{
    bytes+=chunk.length;if(bytes>1048576){abort('output-budget');return;}
    buffer+=chunk.toString('utf8');if(buffer.length>16384){abort('line-budget');buffer='';return;}
    let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trimEnd();buffer=buffer.slice(index+1);const prior=policy.state;send(policy.line(line,now()));if(prior!=='complete'&&policy.state==='complete')onEvent({at:now(),code:'receiver-stop-observed'});}
  });
  child.stderr.on('data',()=>abort('child-stderr'));
  const timer=setInterval(()=>{
    const at=now();send(policy.tick(at));
    if(policy.state==='aborted'&&abortAt===null)abortAt=at;
    if(policy.state==='complete'&&abortAt===null)abortAt=at; // bounded normal drain too
    if(policy.state==='stopping'&&!stopPrompt){stopPrompt=true;onEvent({at,code:'bridge-stop-required'});}
    if(!['aborted','complete'].includes(policy.state)&&at-lastPoll>=Math.min(250,limits.ready/10)){send(['status']);lastPoll=at;}
    if(!exited&&!killed&&((abortAt!==null&&at-abortAt>=Math.min(3000,limits.kill-limits.ack))||at>=limits.kill)){
      killed=true;child.kill();onEvent({at,code:'owned-child-kill'});
    }
    if(at>=limits.end&&!exited){clearInterval(timer);onDone({state:'cleanup-unverified',elapsedMs:at,events:policy.events,killed,verifiedExit:false});}
  },10);
  child.on('close',(code,signal)=>{
    exited=true;clearInterval(timer);
    if(policy.state!=='complete'&&policy.state!=='aborted')policy.abort(now(),'unexpected-child-exit');
    onDone({state:policy.state,normalStop:policy.state==='complete'&&stopAck,receiverStop:policy.state==='complete',senderStopConfirmed:stopAck,elapsedMs:now(),events:policy.events,killed,verifiedExit:true,exitCode:code,signal});
  });
  return {control(message){
    const at=now();send(policy.tick(at));
    if(message==='sender-stop-confirmed'&&policy.state==='complete'&&at<limits.ack){stopAck=true;policy.record(at,'operator-confirmed-sender-stop');return true;}
    if(['aborted','complete'].includes(policy.state)||at>=limits.ready&&message==='arm')return false;
    if(message==='arm')policy.armed=true;
    else if(message==='sender-frames-confirmed')policy.senderAck=true;
    else if(message==='abort')abort('operator-abort');
    else return false;
    return true;
  }};
}
