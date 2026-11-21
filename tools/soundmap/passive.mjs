// A separate, read-only native camera lease. Never a solver frame or recording clock.
export const PASSIVE_LEASE_MS=500;
export class PassiveListener {
  constructor(now=Date.now){this.now=now;this.frame=null;this.receivedAt=0;this.accepted=0;this.dropped=0;this.sessionChanges=0;this.session=null;this.sequence=-1;this.observed=-1;this.generation=-1;}
  accept(f){
    const fail=reason=>{this.dropped++;return {accepted:false,reason};};
    const vector=v=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e7);
    const id=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
    const fields=['schemaVersion','kind','streamId','sessionId','sequence','observedAtUnixMs','sampleAgeMs','coordinateSpace','units','listener'];
    if(!f||Object.keys(f).some(k=>!fields.includes(k))||!f.listener||Object.keys(f.listener).some(k=>!['position','forward','up','velocity','valid','reason','generation'].includes(k)))return fail('invalid-fields');
    if(!f||f.schemaVersion!==1||f.kind!=='passive-listener'||!id(f.streamId)||!id(f.sessionId)||!Number.isSafeInteger(f.sequence)||f.sequence<0||!Number.isSafeInteger(f.observedAtUnixMs)||!Number.isFinite(f.sampleAgeMs)||f.sampleAgeMs<0||f.coordinateSpace!=='gta-native-unscaled'||f.units!=='native-unverified'||!f.listener||typeof f.listener.valid!=='boolean'||!vector(f.listener.position)||!vector(f.listener.forward)||!vector(f.listener.up)||f.listener.velocity!==null&&!vector(f.listener.velocity)||!Number.isSafeInteger(f.listener.generation)||f.listener.generation<1||typeof f.listener.reason!=='string'||f.listener.reason.length>64)return fail('invalid');
    // Monotonic sample age and original UTC must both qualify; reception never renews a sample.
    const age=this.now()-f.observedAtUnixMs;
    if(age< -2||age>PASSIVE_LEASE_MS||f.sampleAgeMs>PASSIVE_LEASE_MS)return fail('stale-or-future');
    const identity=f.streamId+':'+f.sessionId;
    if(Math.abs(Math.hypot(...f.listener.forward)-1)>.01||Math.abs(Math.hypot(...f.listener.up)-1)>.01||Math.abs(f.listener.forward.reduce((n,x,i)=>n+x*f.listener.up[i],0))>.01)return fail('invalid-basis');
    if(this.session!==null&&identity!==this.session){
      if(this.age()<=PASSIVE_LEASE_MS)return fail('identity-change');
      this.sequence=-1;this.observed=-1;this.generation=-1;this.sessionChanges++;
    }
    if(f.sequence<=this.sequence||f.observedAtUnixMs<this.observed||f.listener.generation<this.generation)return fail('ordering');
    if(this.sequence>=0)this.dropped+=Math.max(0,f.sequence-this.sequence-1);
    this.session=identity;this.sequence=f.sequence;this.observed=f.observedAtUnixMs;this.generation=f.listener.generation;
    this.frame=structuredClone(f);this.receivedAt=this.now();this.initialAge=Math.max(0,age,f.sampleAgeMs);this.accepted++;
    return {accepted:true};
  }
  age(){return this.frame?this.initialAge+Math.max(0,this.now()-this.receivedAt):null;}
  snapshot(){return this.frame?{...this.frame,ageMs:this.age()}:null;}
  status(){return {available:!!this.frame&&this.frame.listener.valid&&this.age()<=PASSIVE_LEASE_MS,ageMs:this.age(),receivedAt:this.receivedAt||null,accepted:this.accepted,dropped:this.dropped,sessionChanges:this.sessionChanges,streamId:this.frame?.streamId??null,sessionId:this.frame?.sessionId??null};}
}
