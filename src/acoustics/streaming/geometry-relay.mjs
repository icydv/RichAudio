// Host-to-Node staging only. A configured bound is not delivery evidence.
// No geometry reaches the worker until the host reports THIS stage's measured RTT.
import {validateNeutralEnvelope} from './listener-control.mjs';
import {liveGeometryLimits} from './observed-live.mjs';
export class GeometryRelayGate {
  constructor({now=()=>performance.now(),log,apply,unavailable}){
    this.now=now;this.log=log;this.apply=apply;this.unavailable=unavailable;
    this.stage=null;this.sequence=0;this.cancelThrough=0;
    this.stats={staged:0,committed:0,rejected:0,closed:0,maximumBoundMs:0};
  }
  receive(m){
    if(!m.type?.startsWith('geometry-relay-'))return false;
    try{
      if(m.type==='geometry-relay-stage'){
        if(!Number.isSafeInteger(m.sequence)||m.sequence<=this.sequence||m.sequence<=this.cancelThrough||
          !Array.isArray(m.messages)||m.messages.length>3||Buffer.byteLength(JSON.stringify(m))>liveGeometryLimits.bytes)
          throw Error('relay stage bounds/order');
        const listener=validateNeutralEnvelope(m.listener);
        if(m.messages.some(e=>!['listener-context-config','geometry-config','geometry','owned-sources'].includes(e?.type)))throw Error('relay message family');
        this.sequence=m.sequence;this.stage={sequence:m.sequence,messages:structuredClone(m.messages),listener,at:this.now()};
        this.stats.staged++;this.log({type:'geometry-relay-ack',sequence:m.sequence});
      }else if(m.type==='geometry-relay-commit'){
        const stage=this.stage;this.stage=null;
        if(!stage||m.sequence!==stage.sequence||m.sequence<=this.cancelThrough||!Number.isFinite(m.maximumMs)||m.maximumMs<=0||m.maximumMs>10)
          throw Error('unproven or exceeded forwarding bound');
        const elapsed=this.now()-stage.at;
        if(elapsed<0||stage.listener.receiptAgeMs+elapsed+m.maximumMs>250)throw Error('relay commit freshness');
        const delivery={basis:'measured-forwarding-upper-bound',maximumMs:m.maximumMs,reference:'relay:'+m.sequence};
        for(const e of stage.messages)if(e.type==='geometry-config')e.configuration.clock.delivery=delivery;
        this.apply({listener:stage.listener,messages:stage.messages,at:stage.at,elapsed,delivery});
        this.stats.committed++;this.stats.maximumBoundMs=Math.max(this.stats.maximumBoundMs,m.maximumMs);
        this.log({type:'geometry-relay-result',sequence:m.sequence,accepted:true});
      }else if(m.type==='geometry-relay-drop'){
        if(this.stage?.sequence===m.sequence)this.stage=null;
      }else if(m.type==='geometry-relay-close'){
        if(!Number.isSafeInteger(m.through)||m.through<0)throw Error('relay close order');
        if(m.event!==null&&(!m.event||m.event.type!=='geometry'||m.event.unavailableReason!=='geometry-unavailable'||
          !Array.isArray(m.event.groups)||m.event.groups.length))throw Error('relay close is an availability notice only');
        this.cancelThrough=Math.max(this.cancelThrough,m.through);this.stage=null;this.stats.closed++;
        this.unavailable(m.event);
      }else throw Error('unknown relay message');
    }catch(error){
      this.stats.rejected++;this.stage=null;
      this.log({type:'geometry-relay-result',sequence:m.sequence??0,accepted:false,reason:error.message});
    }
    return true;
  }
}
