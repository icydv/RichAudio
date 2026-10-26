// Explicit research ordering policy. No source, gain, clock or join mutation.
export function recentSelection(seed){
  if(!Number.isSafeInteger(seed)||seed<=0||seed>0xFFFFFFFF)throw Error('explicit nonzero uint32 seed required');
  let state=seed>>>0,calls=0;
  function next(){state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;return state;}
  return Object.freeze({
    order(candidates,previousIndex=null){
      if(++calls>512||!Array.isArray(candidates)||!candidates.length||candidates.length>1024||new Set(candidates.map(p=>p.index)).size!==candidates.length||candidates.some(p=>!Number.isSafeInteger(p.index)||p.index<0))throw Error('bounded candidate order required');
      const ordered=[...candidates].sort((a,b)=>a.index-b.index),fresh=ordered.filter(p=>p.index!==previousIndex);
      const pool=fresh.length?fresh:ordered,chosen=pool[Math.floor(next()/4294967296*pool.length)];
      // The old pair is retained last as a safety fallback, never silently added.
      return [chosen,...fresh.filter(p=>p.index!==chosen.index),...ordered.filter(p=>p.index===previousIndex&&p.index!==chosen.index)];
    },
    diagnostics(){return {mode:'recent-seeded-v1',seed,draws:calls,historyLength:1,algorithm:'xorshift32; one draw per event, no retry search'};}
  });
}
