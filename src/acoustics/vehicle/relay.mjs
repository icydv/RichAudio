// Measured native-host -> producer forwarding, with one immutable pending frame.
// A configured latency allowance alone is never evidence of delivery freshness.
export class VehicleRelayGate {
  constructor({now=()=>performance.now(),log,apply}) {
    Object.assign(this,{now,log,apply});this.stage=null;this.sequence=-1;
    this.stats={staged:0,committed:0,rejected:0,dropped:0,maximumBoundMs:0};
  }
  receive(m) {
    if(!m.type?.startsWith('vehicle-relay-'))return false;
    try {
      if(m.type==='vehicle-relay-stage') {
        if(!Number.isSafeInteger(m.sequence)||m.sequence<0||m.sequence<=this.sequence||
          m.vehicle?.type!=='vehicle'||m.vehicle.state?.sequence!==m.sequence||
          !Number.isFinite(m.vehicle.receiptAgeMs)||m.vehicle.receiptAgeMs<0||m.vehicle.receiptAgeMs>250||
          Buffer.byteLength(JSON.stringify(m))>8192)throw Error('Vehicle relay stage bounds/order');
        this.sequence=m.sequence;this.stage={sequence:m.sequence,vehicle:structuredClone(m.vehicle),at:this.now()};
        this.stats.staged++;this.log({type:'vehicle-relay-ack',sequence:m.sequence});
      } else if(m.type==='vehicle-relay-commit') {
        const stage=this.stage;this.stage=null;
        if(!stage||m.sequence!==stage.sequence||!Number.isFinite(m.maximumMs)||m.maximumMs<=0||m.maximumMs>10)
          throw Error('Vehicle forwarding bound unproven or exceeded');
        const elapsed=this.now()-stage.at,age=stage.vehicle.receiptAgeMs+elapsed+m.maximumMs;
        if(elapsed<0||age>250)throw Error('Vehicle relay commit freshness');
        this.apply({...stage.vehicle,receiptAgeMs:age});
        this.stats.committed++;this.stats.maximumBoundMs=Math.max(this.stats.maximumBoundMs,m.maximumMs);
        this.log({type:'vehicle-relay-result',sequence:m.sequence,accepted:true});
      } else if(m.type==='vehicle-relay-drop') {
        if(this.stage?.sequence===m.sequence)this.stage=null;
        this.stats.dropped++;
      } else throw Error('Unknown vehicle relay message');
    } catch(error) {
      this.stage=null;this.stats.rejected++;
      this.log({type:'vehicle-relay-result',sequence:m.sequence??-1,accepted:false,reason:error.message});
    }
    return true;
  }
}
