// A separate, read-only native camera lease. Never a solver frame or recording clock.
export const PASSIVE_LEASE_MS=500;
function validInteriorReadback(sample,vector){
  if(!sample||Object.keys(sample).length!==6||!['outcome','proxy','ready','archetype','origin','offsetMs'].every(k=>Object.hasOwn(sample,k)))return false;
  const {outcome,proxy,ready,archetype,origin,offsetMs}=sample;
  if(typeof outcome!=='string'||!/^(observed|unavailable|no-proxy|not-ready|invalid-origin|invalid-archetype-or-age|getter-error:[A-Za-z0-9_]{1,64})$/.test(outcome)||
    proxy!==null&&(!Number.isInteger(proxy)||proxy< -0x80000000||proxy>0x7fffffff)||ready!==null&&typeof ready!=='boolean'||
    archetype!==null&&(!Number.isInteger(archetype)||archetype<0||archetype>0xffffffff)||origin!==null&&!vector(origin)||
    !Number.isFinite(offsetMs)||Math.abs(offsetMs)>500)return false;
  return outcome!=='observed'||proxy>0&&ready===true&&archetype>0&&vector(origin)&&origin.every(n=>Math.abs(n)<=100000)&&Math.abs(offsetMs)<=50;
}
export class PassiveListener {
  constructor(now=Date.now,{viewOnlyMap=false}={}){this.now=now;this.viewOnlyMap=viewOnlyMap;this.frame=null;this.receivedAt=0;this.accepted=0;this.dropped=0;this.sessionChanges=0;this.identityViolations=0;this.session=null;this.sequence=-1;this.observed=-1;this.generation=-1;this.contextRevision=0;this.contextScope=null;}
  accept(f){
    const fail=reason=>{this.dropped++;return {accepted:false,reason};};
    const vector=v=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e7);
    const id=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
    const fields=['schemaVersion','kind','streamId','sessionId','sequence','observedAtUnixMs','sampleAgeMs','coordinateSpace','units','listener'];
    if(this.viewOnlyMap)fields.push('interiorReadback');
    if(!f||Object.keys(f).some(k=>!fields.includes(k))||!f.listener||Object.keys(f.listener).some(k=>!['position','forward','up','velocity','valid','reason','generation'].includes(k)))return fail('invalid-fields');
    if(!f||f.schemaVersion!==1||f.kind!=='passive-listener'||!id(f.streamId)||!id(f.sessionId)||!Number.isSafeInteger(f.sequence)||f.sequence<0||!Number.isSafeInteger(f.observedAtUnixMs)||!Number.isFinite(f.sampleAgeMs)||f.sampleAgeMs<0||f.coordinateSpace!=='gta-native-unscaled'||f.units!=='native-unverified'||!f.listener||typeof f.listener.valid!=='boolean'||!vector(f.listener.position)||!vector(f.listener.forward)||!vector(f.listener.up)||f.listener.velocity!==null&&!vector(f.listener.velocity)||!Number.isSafeInteger(f.listener.generation)||f.listener.generation<1||typeof f.listener.reason!=='string'||f.listener.reason.length>64)return fail('invalid');
    if(this.viewOnlyMap&&f.listener.valid&&!validInteriorReadback(f.interiorReadback,vector))return fail('invalid-interior-readback');
    // Monotonic sample age and original UTC must both qualify; reception never renews a sample.
    const age=this.now()-f.observedAtUnixMs;
    if(age< -2||age>PASSIVE_LEASE_MS||f.sampleAgeMs>PASSIVE_LEASE_MS)return fail('stale-or-future');
    const identity=f.streamId+':'+f.sessionId;
    if(Math.abs(Math.hypot(...f.listener.forward)-1)>.01||Math.abs(Math.hypot(...f.listener.up)-1)>.01||Math.abs(f.listener.forward.reduce((n,x,i)=>n+x*f.listener.up[i],0))>.01)return fail('invalid-basis');
    if(this.session!==null&&identity!==this.session){
      if(this.viewOnlyMap){this.identityViolations++;return fail('single-use-camera-identity');}
      if(this.age()<=PASSIVE_LEASE_MS)return fail('identity-change');
      this.sequence=-1;this.observed=-1;this.generation=-1;this.sessionChanges++;
    }
    if(f.sequence<=this.sequence||f.observedAtUnixMs<this.observed||f.listener.generation<this.generation||
       this.viewOnlyMap&&f.listener.valid&&f.observedAtUnixMs===this.observed)return fail('ordering');
    if(this.viewOnlyMap){
      const raw=f.interiorReadback;
      const scope=f.listener.valid?JSON.stringify([f.listener.generation,...f.listener.position.map(n=>Math.floor(n/16)),
        ...(raw?.outcome==='observed'?[raw.proxy,raw.archetype,raw.origin]:[])]):null;
      if(scope!==this.contextScope||this.age()>=PASSIVE_LEASE_MS)this.contextRevision++;
      this.contextScope=scope;
    }
    if(this.sequence>=0)this.dropped+=Math.max(0,f.sequence-this.sequence-1);
    this.session=identity;this.sequence=f.sequence;this.observed=f.observedAtUnixMs;this.generation=f.listener.generation;
    this.frame=structuredClone(f);this.receivedAt=this.now();this.initialAge=Math.max(0,age,f.sampleAgeMs);this.accepted++;
    return {accepted:true};
  }
  age(){return this.frame?this.initialAge+Math.max(0,this.now()-this.receivedAt):null;}
  snapshot(){return this.frame?{...this.frame,ageMs:this.age(),...(this.viewOnlyMap?{contextRevision:this.contextRevision}:{})}:null;}
  status(){return {available:!!this.frame&&this.frame.listener.valid&&this.age()<=PASSIVE_LEASE_MS,ageMs:this.age(),receivedAt:this.receivedAt||null,accepted:this.accepted,dropped:this.dropped,sessionChanges:this.sessionChanges,identityViolations:this.identityViolations,streamId:this.frame?.streamId??null,sessionId:this.frame?.sessionId??null};}
}
