// Browser presentation only. The existing Canvas draws cached finite surfaces
// and copied solver paths; this table never manufactures either.
const panel=document.getElementById('world06-coverage');
const loading=document.createElement('div');loading.style.cssText='position:fixed;bottom:20px;right:24px;background:#121820ed;border:1px solid #d5b65e;padding:10px 14px;border-radius:4px;color:#e9d18e;max-width:360px;font:14px system-ui;z-index:20;pointer-events:none';loading.setAttribute('role','status');document.body.append(loading);
let stopped=false;
const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=String(value);return e;};
function coverageMap(packet){
 const boxes=[...packet.tiles.map(t=>({...t,classification:t.viewClass})),...packet.tiles.flatMap(t=>t.geometryMissingRegions.map(r=>({...r,id:t.tileId+'/'+r.id,classification:'unknown'}))),...(packet.unknownRegions??[]).filter(r=>r.bounds).map(r=>({...r,classification:'unknown'}))];
 if(!boxes.length)return text('p','No finite coverage bounds have been supplied.');
 const min=[0,1].map(i=>Math.min(...boxes.map(b=>b.bounds.min[i]))),max=[0,1].map(i=>Math.max(...boxes.map(b=>b.bounds.max[i]))),width=max[0]-min[0],height=max[1]-min[1],scale=Math.max(width,height),pad=scale*.025;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`${min[0]-pad} ${-max[1]-pad} ${width+pad*2} ${height+pad*2}`);svg.setAttribute('width','100%');svg.setAttribute('height','150');svg.setAttribute('role','img');svg.setAttribute('aria-label','Declared static tile bounds. Dark gaps are unknown, not empty streets.');
 const colours={prepared:'#4dbe89',cached:'#4dbe89','processed-partial':'#d4aa4c',pending:'#4c6a9b',unsupported:'#d4aa4c',failed:'#e26666',unknown:'#a780c9'};
 for(const b of boxes){const r=document.createElementNS(svg.namespaceURI,'rect');r.setAttribute('x',b.bounds.min[0]);r.setAttribute('y',-b.bounds.max[1]);r.setAttribute('width',b.bounds.max[0]-b.bounds.min[0]);r.setAttribute('height',b.bounds.max[1]-b.bounds.min[1]);r.setAttribute('fill',colours[b.classification]??colours.unknown);r.setAttribute('fill-opacity','.3');r.setAttribute('stroke',colours[b.classification]??colours.unknown);r.setAttribute('stroke-width',scale*.001);const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=`${b.tileId??b.id}: ${b.classification}`;r.append(title);svg.append(r);}
 return svg;
}
async function poll(){
 try{
  const auth=await fetch('/api/session',{cache:'no-store',signal:AbortSignal.timeout(2500)});if(!auth.ok)throw Error('Session unavailable');const {token}=await auth.json();
  const response=await fetch('/api/worldcoverage06',{headers:{'X-RichAudio-Token':token},cache:'no-store',signal:AbortSignal.timeout(2500)});if(!response.ok)throw Error('Coverage unavailable');const p=await response.json();
  if(stopped)return;loading.replaceChildren(text('div',p.loading.text),text('small','RichAudio-owned preview · native GTA loading label unchanged'));
  panel.replaceChildren(text('h2','Startup world coverage'),text('p',p.loading.text),text('p',`${p.stage}: ${p.completedEligibleTiles}/${p.eligibleTiles} eligible tiles; ${p.unsupportedTiles} unsupported; ${p.failedTiles} failed`),text('p',`Readiness: ${p.readiness}. This percentage describes the declared supported subset. Actual installed-world coverage is unmeasured.`),text('p','Static cache geometry; dynamic doors, IPL/interior activation and movable objects remain unobserved. Outside coverage is unknown. No MLO connectivity is inferred.'));
  panel.append(text('p',`Geometry qualification: ${p.geometryUnknownTiles} processed tiles remain partial; ${p.geometryUnknownRegions} localized missing regions; ${p.geometryUnknownEntries} unknown diagnostics; ${p.geometryUnverifiedTiles} eligible tiles not yet verified. Completed processing is separate from complete geometry.`),coverageMap(p),text('p','Tile bounds only: green verified declared geometry, blue pending, amber partial or unsupported, red failed, purple localized unknown. Dark gaps remain unknown. Partial geometry without bounds is not assigned an invented missing location.'));
  const details=document.createElement('details');details.append(text('summary',`${p.coverageWindow.shown}/${p.coverageWindow.total} declared tiles · ${p.coverageWindow.omitted} omitted from this bounded view`));
  for(const t of p.tiles)details.append(text('p',`${t.pageId}/${t.tileId}: ${t.status}${t.reason?' · '+t.reason:''} · ${t.geometryQualification} · ${t.artifactDigest?'artifact bound':'not prepared'} · runtime state unknown`));
  for(const r of p.unknownRegions??[])details.append(text('p',`Unknown: ${r.id} · ${r.reason}`));panel.append(details,text('p','Enable Cached acoustic world to inspect the explicitly loaded tile. Live positions and solver paths overlay only with exact model alignment.'));
  if(p.checkpointError||p.restoreWarning||p.controlBoundaryFailure||p.controlClosureUnknown)panel.append(text('p',`Recovery evidence: ${p.checkpointError??p.restoreWarning??p.controlBoundaryFailure??'control-operation closure unknown'}. ${p.unresolvedControlOperations} unresolved control operations; no forced I/O closure is claimed.`));
 }catch{if(!stopped){panel.replaceChildren(text('h2','Startup world coverage'),text('p','Coverage unavailable; readiness is not established.'));loading.textContent='Acoustic cache status unavailable — readiness unknown';}}
 if(!stopped)setTimeout(poll,500);
}
window.addEventListener('pagehide',()=>{stopped=true;});poll();
