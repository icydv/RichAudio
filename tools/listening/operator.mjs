// Runs in explicit Node, never in the UI REPL. No game API or pipe probe.
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {vehicleLiveSourceIds} from '../../src/acoustics/vehicle/live-source.mjs';
export function emissionReadiness(frame,status,{now=Date.now()}={}){
  const r=frame?.readiness,age=now-frame?.producedAtUnixMs;
  const fresh=status?.connected===true&&Number.isFinite(status.ageMs)&&status.ageMs>=0&&status.ageMs<=250&&
    Number.isFinite(age)&&age>=-2&&age<=250&&frame?.listener?.valid===true&&!!frame.listenerSessionId&&frame.sessionId===frame.listenerSessionId;
  const transportAccepted=fresh&&r?.transportAccepted===true;
  const contextInitialized=transportAccepted&&r.contextInitialized===true;
  const vehicleConditional=r?.mode==='vehicle-conditional-direct'&&frame.directPath?.rights==='original-generated'&&
    JSON.stringify(frame.directPath.sourceIds)===JSON.stringify(vehicleLiveSourceIds)&&frame.sources?.length===8&&
    vehicleLiveSourceIds.every(id=>frame.sources.some(s=>s.id===id&&s.valid===true));
  const conditional=(r?.mode==='listener-only-conditional-direct'||vehicleConditional)&&r.visibilityAssumption==='unobserved-space-assumed-clear';
  const geometry=contextInitialized&&r.genuineGeometryPresent===true;
  return {transportAccepted,contextInitialized,rendererReadyForOwnedEmission:contextInitialized&&r.rendererReadyForOwnedEmission===true&&(geometry||conditional),
    genuineGeometryPresent:geometry,reflectionsActive:geometry&&r.reflectionsActive===true,mode:r?.mode??'unavailable',visibilityAssumption:r?.visibilityAssumption??null,
    emissionUnavailableReason:r?.emissionUnavailableReason??null};
}
export class ListeningOperator {
  constructor({executable,args,cwd,emit=()=>{},readinessMs=15000,stopMs=45000,limitMs=60000,cleanupMs=65000,shutdownGraceMs=5000}){
    Object.assign(this,{executable,args,cwd,emit,readinessMs,stopMs,limitMs,cleanupMs,shutdownGraceMs});
    this.state='prepared';this.primary=null;this.secondary=[];this.launches=0;this.listenerStarts=0;this.emissions=0;this.children=[];this.timers=[];
  }
  event(type,detail={}){this.emit({type,elapsedMs:this.startedAt===undefined?0:performance.now()-this.startedAt,...detail});}
  alive(){return !!this.child&&this.spawned&&this.child.exitCode===null&&this.child.signalCode===null&&!this.child.killed&&!this.primary&&!this.stopping;}
  fail(reason){if(this.primary){this.secondary.push(reason);this.event('secondary-failure',{reason});}else{this.primary=reason;this.state='failed';this.event('failure',{reason});}this.write('emit-stop');this.write('stop');}
  timer(fn,ms){this.timers.push(setTimeout(fn,ms));}
  write(command){if(this.child?.stdin.writable&&!this.child.stdin.destroyed)this.child.stdin.write(command+'\n');}
  begin(preconditions){
    if(this.state!=='prepared')throw Error('Single host launch only');
    if(!preconditions?.storyReady||!preconditions.bridgeReady||!preconditions.passiveMovementVerified)throw Error('Observed Story/READY/passive movement required');
    this.startedAt=performance.now();this.state='spawning';this.launches++;
    this.event('launch-request',{cwd:this.cwd,executable:this.executable,args:this.args});
    try{this.child=spawn(this.executable,this.args,{cwd:this.cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});}catch(e){this.fail('spawn:'+e.code);this.finish(null);return;}
    this.children.push(this.child);let pending='',bytes=0;
    this.child.once('spawn',()=>{this.spawned=true;this.event('spawned',{pid:this.child.pid});});
    this.child.stdin.on('error',e=>this.fail('stdin:'+e.code));
    this.child.on('error',e=>{this.fail('spawn:'+e.code);this.finish(null);});
    this.child.stdout.on('data',b=>{
      bytes+=b.length;if(bytes>1048576){this.fail('stdout-bound');return;}this.event('stdout',{text:b.toString()});pending+=b;
      let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at).trim();pending=pending.slice(at+1);
        // Existing host prints this AFTER output readiness and pipe.Start().
        // This confirms transport STARTING, not peer connection/acceptance.
        if(/^RichAudio shared output: .+\. Commands: start, mute, resume, emit-stop, status, stop\. Maximum 60 seconds; gain 0\.2$/.test(line)&&this.alive()&&this.state==='spawning'){
          this.state='host-ready';this.event('host-ready',{pid:this.child.pid,transport:'starting; no connection probe'});
        }
        if(line.startsWith('Listener terminal ')&&!this.stopping)this.fail('listener-terminal');
      }
    });
    let stderrBytes=0;this.child.stderr.on('data',b=>{stderrBytes+=b.length;if(stderrBytes>4194304)this.fail('stderr-bound');else this.event('stderr',{text:b.toString()});});
    this.child.once('exit',(code,signal)=>{if(!this.stopping&&!this.primary)this.fail('unexpected-host-exit:'+code);else if(code!==0&&!this.primary)this.fail('host-exit:'+code);this.finish(code,signal);});
    this.timer(()=>{if(this.state==='spawning')this.fail('host-readiness-deadline');},this.readinessMs);
    this.timer(()=>{if(this.alive()&&!this.listenerStarts)this.fail('listener-start-deadline');},15000);
    this.timer(()=>this.stop('stop-target',true),this.stopMs);
    this.timer(()=>this.write('stop'),this.stopMs+this.shutdownGraceMs);
    this.timer(()=>this.stop('hard-host-limit'),this.limitMs);
    this.timer(()=>{if(this.child.exitCode===null&&this.child.signalCode===null){this.fail('owned-host-cleanup-deadline');this.child.kill();}},this.cleanupMs);
  }
  permitListener(){
    if(this.state!=='host-ready'||!this.alive()||this.listenerStarts)throw Error('Listener Start denied: no verified live host or already consumed');
    this.listenerStarts=1;this.state='listener-permitted';this.event('listener-start-permitted',{pid:this.child.pid});
    return {permitted:true,pid:this.child.pid};
  }
  listenerIssued(){if(this.state!=='listener-permitted'||!this.alive())throw Error('Listener acknowledgement denied');this.state='awaiting-accepted-listener';this.event('listener-issued');}
  observeReadiness(frame,status){
    const readiness=emissionReadiness(frame,status),signature=JSON.stringify(readiness);
    if(signature!==this.lastReadinessSignature){this.lastReadinessSignature=signature;this.event('acoustic-readiness',{sequence:frame?.sequence,listenerSessionId:frame?.listenerSessionId,...readiness});}
    return readiness;
  }
  accepted(frame,status){
    const readiness=this.observeReadiness(frame,status);
    if(this.state!=='awaiting-accepted-listener'||!this.alive()||!readiness.rendererReadyForOwnedEmission)throw Error('Fresh accepted listener, initialized source context and owned renderer readiness required');
    this.state='listener-accepted';this.readiness=readiness;
    for(const type of ['listener-transport-accepted','listener-source-context-initialized','owned-renderer-ready'])this.event(type,{sequence:frame.sequence,listenerSessionId:frame.listenerSessionId,...readiness});
    this.event('listener-accepted',{sequence:frame.sequence,listenerSessionId:frame.listenerSessionId,...readiness});
  }
  emitBeacon(){if(this.state!=='listener-accepted'||!this.alive()||this.emissions)throw Error('Emission denied before accepted listener');this.emissions++;this.state='listening';this.write('start');this.event('emission-start');}
  stop(reason='operator-stop',grace=false){if(this.finished)return;this.stopping=true;this.event(reason);this.event('recording-stop-required');this.event('geometry-and-listener-stop-required');this.write('emit-stop');if(!grace)this.write('stop');}
  finish(code,signal){if(this.finished)return;this.finished=true;for(const t of this.timers)clearTimeout(t);this.state=this.primary?'failed':'stopped';this.event('terminal',{code,signal,primary:this.primary,secondary:this.secondary,launches:this.launches,listenerStarts:this.listenerStarts,emissions:this.emissions,ownedPids:this.children.map(c=>c.pid).filter(Boolean)});}
}
