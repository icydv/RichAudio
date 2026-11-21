import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const cases=JSON.parse(fs.readFileSync(path.join(process.argv[2],'kit-cases.json')));let n=0;
const check=(value,message)=>{assert(value,message);n++;};
check(cases.length===22,'two functional cases and twenty failures');
for(const c of cases){const k=c.Kit;check(c.Domain==='original-synthetic-fixture','synthetic provenance');check(k.DocumentedKitIdentityValidity==='UNKNOWN','no fabricated global index validity');
 for(const o of [k.Before,k.After,k.AvailableKitCount]){check(o.ReturnType==='System.Int32','native integer type');if(o.Raw!==null)check(o.Hex==='0x'+(o.Raw>>>0).toString(16).toUpperCase().padStart(8,'0'),'raw integer and hex correspondence');}
 if(c.Started){const indexed=c.Upgrades.filter(u=>u.Category!==18&&u.Count>0);check(k.Verification==='VERIFIED_BY_INDEXED_READBACK'&&indexed.length===k.VerifiedIndexedCategories&&indexed.length>0,'functional evidence independently counted');for(const u of indexed)check(u.Requested===u.Count-1&&u.Observed===u.Requested&&u.RequestReturnedNormally,'actual highest indexed readback required');}
 else check(k.Verification==='FAILED','bad states cannot pass');
}
const nonzero=cases.find(c=>c.Name==='functional-207');check(nonzero.Kit.After.Raw>nonzero.Kit.AvailableKitCount.Raw&&nonzero.Kit.Indication==='RAW_INDEX_SEMANTICS_UNKNOWN','global raw value never compared to model count');
check(!JSON.stringify(cases).match(/private paths|private diagnostic|ScopeNonce|Handle|Generation/),'sanitized diagnostics only');
const adapter=fs.readFileSync('src/benchmark/Bati/BatiAdapter.Rph.cs','utf8');
check(adapter.includes('CallByName<int>("SET_VEHICLE_MOD_KIT",Bike(id),selection')&&adapter.includes('selection==0'),'documented int placeholder and unchanged default selection');
check(!adapter.includes('"GET_VEHICLE_MOD_KIT",Bike(id))==0'),'old equality absent');
console.log(`PASS: ${n} independent mod-kit diagnostic and boundary checks; synthetic only.`);

check(!adapter.includes('typeof(void)'), 'no unsupported void invocation');
