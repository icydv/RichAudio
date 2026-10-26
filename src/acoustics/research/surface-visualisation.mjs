// Original data-derived SVG: synthetic examples may be public; live datasets stay private.
import {fixedRayPlan} from './surface-reconstruction.mjs';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const p=x=>Array.isArray(x)?x:[x.X,x.Y,x.Z];
const xml=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function surfaceSvg(batch,result,{synthetic=false}={}){
 const c=result.candidate,plan=fixedRayPlan(batch.PlayerPosition,batch.Forward),center=c?.center??p(batch.PlayerPosition).map((x,i)=>x+[4*plan.direction[0],4*plan.direction[1],1][i]),u=c?.u??plan.right,v=c?.v??[0,0,1],n=c?.normal??plan.direction.map(x=>-x);
 const local=x=>{const d=sub(p(x),center);return [dot(d,u),dot(d,v),dot(d,n)];};
 const front=x=>[270+150*x[0],310-150*x[1]],side=x=>[790+38*x[2],310-120*x[0]];
 const line=(a,b,color,dash='',marker='')=>`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="2" ${dash?'stroke-dasharray="'+dash+'"':''} ${marker?'marker-end="url(#arrow)"':''}/>`;
 const circle=(a,color)=>`<circle cx="${a[0]}" cy="${a[1]}" r="5" fill="${color}"/>`;
 let geometry='';
 if(c){geometry+=`<polygon points="${c.footprint.map(x=>front(x).join(',')).join(' ')}" fill="#124e66" fill-opacity=".6" stroke="#55d5e8" stroke-width="2" stroke-dasharray="7 4"/>`;
 geometry+=line(side([0,0,-5]),side([0,0,5]),'#404a60','4 6');geometry+=line(side([-1,0,0]),side([1,0,0]),'#55d5e8','7 4');}
 for(const sample of batch.Samples){const o=sample.Observation,a=local(o.Origin),b=local(o.End),valid=result.observations.find(x=>x.id===sample.Id)?.status==='valid-hit';
  geometry+=line(side(a),side(b),'#64748b','3 4','arrow')+circle(side(a),'#93c5fd');
  if(o.HitPosition){const q=local(o.HitPosition),color=valid&&c?'#75e5ab':'#fb7185';geometry+=circle(front(q),color)+circle(side(q),color);if(o.HitNormal){const normal=p(o.HitNormal),tip=[q[0]+.35*dot(normal,u),q[1]+.35*dot(normal,v),q[2]+.35*dot(normal,n)];geometry+=line(side(q),side(tip),color,'','arrow');}}
  else{const z=front(a);geometry+=`<text x="${z[0]-6}" y="${z[1]+6}" fill="#fb7185" font-size="22">×</text>`;}
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="650" viewBox="0 0 1100 650"><defs><pattern id="unknown" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" stroke="#283345"/></pattern><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="#a8b5c8"/></marker></defs><rect width="1100" height="650" fill="#101827"/><g font-family="Arial,sans-serif" fill="#e5edf8"><text x="35" y="40" font-size="23">RichAudio ACOUSTICS-03 · ${synthetic?'ORIGINAL SYNTHETIC DATA':'PRIVATE LIVE DATA'}</text><text x="35" y="70" font-size="15">${xml(result.status)} · ${result.counts.validHits} valid hits · ${result.counts.validMisses} misses · no certified acoustic wall</text><rect x="35" y="110" width="470" height="385" fill="url(#unknown)" stroke="#334155"/><rect x="550" y="110" width="515" height="385" fill="url(#unknown)" stroke="#334155"/><text x="50" y="140" font-size="17">Plane view · lateral / vertical native units</text><text x="565" y="140" font-size="17">Side view · depth / lateral native units</text>${geometry}<text x="50" y="525" font-size="15" fill="${c?'#75e5ab':'#fb7185'}">● ${c?'compatible hits / normals':'hits in rejected set'}</text><text x="310" y="525" font-size="15" fill="#93c5fd">● trace origins</text><text x="550" y="525" font-size="15" fill="#55d5e8">--- inferred interior patch</text><text x="35" y="560" font-size="15">Hatched surroundings and gaps between samples remain unknown. No material or true wall edge is inferred.</text><text x="35" y="590" font-size="15">${xml(result.reasons.join('; ')||'Nine compatible observations support a planar hypothesis; sparse hits do not prove continuous solidity.')}</text><text x="35" y="620" font-size="14" fill="#aab8ca">${synthetic?'Analytic fixture wall x=4. This is not a GTA reconstruction.':'Private diagnostic geometry. Physical unit scale and permanence remain unverified.'}</text></g></svg>`;
}
