import {VisualState,PassiveState,presentation,DisplayCadence,RateMeter,TELEMETRY_POLL_FPS,ReplayClock,project,pathStyle,parseVisualContext,visibleContext,clampFps,isPoint,LIMITS,CachedWorldState041,cachedWorldPresentation041,InstalledContextState01} from './model.mjs';
import {AtlasRenderer01} from './atlas-renderer01.mjs';
import {alignsWithWorldAtlas01} from './model.mjs';
const $=id=>document.getElementById(id),state=new VisualState(),passive=new PassiveState(),replay=new ReplayClock(),cacheWorld=new CachedWorldState041();
const displayCadence=new DisplayCadence(20),displayRate=new RateMeter(),solverRate=new RateMeter(),passiveRate=new RateMeter();
const canvas=$('scene'),ctx=canvas.getContext('2d'),camera={target:[0,0,0],yaw:-.7,pitch:.65,scale:13,topDown:false,width:800,height:600};
const installedContext=new InstalledContextState01();
let token=null,serviceStatus={},isReplay=false,viewPaused=false,follow=true,fps=20,connected=false,context=null;
let lastMetadataAt=-Infinity,noticeUntil=0,lastReplayRequest=-1,pendingSeek=true,requestEpoch=0,lastCoordinateKey=null;
let geometryCompiled=null,geometryFaces=[],contextFaces=[],contextBoxes=[],contextSelectionKey='',lastDrawMs=0,paintMs=0;
let replayAudioInfo=null,audioObjectUrl=null;
let atlas=null,atlasShown=true,atlasPoseInitialised=false,atlasFirstFollow=true,atlasResumeView=null,atlasLive=null,atlasInspection=null,atlasInspectionCell=null,atlasInspectAt=0,serviceHeardAt=-Infinity;
const operatorFrames={frames:0,emptyCoveredFrames:0,detailFallbackFrames:0,frameIntervalMs:null,maximumFrameIntervalMs:null};
let operatorLastDraw=null,operatorLastPublish=-Infinity,operatorSending=false;
const player=$('replay-audio');
const format=n=>Number.isFinite(n)?n.toFixed(2):'unavailable';
const time=n=>{const ms=Math.max(0,Math.round(n||0));return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
const safeText=(el,value)=>{el.textContent=String(value??'unavailable');};
function notice(message,error=false){safeText($('notice'),message);$('notice').className=error?'error':'';$('notice').style.display='block';noticeUntil=performance.now()+8000;}
async function apiResponse(path,body,timeout=2500){
  if(!token){const response=await fetch('/api/session',{cache:'no-store',signal:AbortSignal.timeout(2500)});if(!response.ok)throw Error('Cannot authenticate local SoundMap service');token=(await response.json()).token;}
  const response=await fetch(path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{'X-RichAudio-Token':token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  if(!response.ok){if(response.status===401||response.status===403)token=null;const error=await response.json().catch(()=>({}));throw Error(error.error||error.message||`Local service returned ${response.status}`);}return response;
}
async function api(path,body){return (await apiResponse(path,body)).json();}
function startAtlas(){
  if(atlas||!serviceStatus.worldAtlas)return;
  camera.northUpAtlas=true;
  for(const id of ['atlas-scene','atlas-controls','atlas-evidence'])$(id).hidden=false;
  $('atlas-toggle').hidden=serviceStatus.viewOnly;
  atlas=new AtlasRenderer01($('atlas-scene'),{getIndex:()=>api('/api/atlas/index'),
    getPage:async name=>(await apiResponse('/api/atlas/page?name='+encodeURIComponent(name),undefined,10000)).arrayBuffer()});
  void atlas.start();
}
function atlasOverview(){
  const bounds=atlas?.index?.bounds;
  if(!bounds)return;
  if(atlasPoseInitialised&&camera.scale>=.14){
    const {scale,yaw,pitch,topDown}=camera;atlasResumeView={scale,yaw,pitch,topDown};
  }
  camera.target=bounds.min.map((v,i)=>(v+bounds.max[i])/2);
  camera.scale=Math.min(camera.width/(bounds.max[0]-bounds.min[0]+1),camera.height/(bounds.max[1]-bounds.min[1]+1))*.88;
  camera.yaw=0;camera.topDown=true;follow=false;atlasPoseInitialised=true;
  $('follow').classList.remove('active');$('isometric').classList.remove('active');$('topdown').classList.add('active');
}
function inspectAtlas(now){
  const data=atlas?.index;
  if(!data||now<atlasInspectAt||camera.scale<.14)return;
  const cell=camera.target.slice(0,2).map(x=>Math.floor(x/data.cellSize)).join('_');
  if(cell===atlasInspectionCell)return;
  atlasInspectAt=now+400;atlasInspectionCell=cell;atlasInspection=null;
  $('atlas-sources').replaceChildren();
  if(!atlas.tilesById.has(cell)){atlasInspection={missing:true};return;}
  void api('/api/atlas/coverage?tile='+encodeURIComponent(cell)).then(result=>{
    if(cell!==atlasInspectionCell)return;
    atlasInspection=result;
    const nodes=result.entries.map(r=>{
      const el=document.createElement('p');
      safeText(el,`${r.entry} · ${r.id} · ${r.class} · layer ${r.layer??'unknown'} · ${r.unsupported} unknown records${r.instance?' · '+r.instance:''}`);
      el.title=`Archive SHA-256 ${r.archiveSHA256}\nEntry SHA-256 ${r.sourceSHA256}\nIndex SHA-256 ${r.indexSHA256}\nReceipt SHA-256 ${r.receiptSHA256}\nRetained proof epoch ${r.historicalProofEpoch??'not requalified in the retained acoustic workset'}`;
      return el;
    });
    $('atlas-sources').replaceChildren(...nodes);
  }).catch(error=>{if(cell===atlasInspectionCell)atlasInspection={error:error.message};});
}
function bind(id,callback){$(id).addEventListener('click',()=>Promise.resolve().then(callback).catch(e=>notice(e.message,true)));}
function line(points,color,width=1,dash=[]){if(!points?.length)return;ctx.beginPath();points.forEach((p,i)=>{const s=project(p,camera);if(i)ctx.lineTo(s.x,s.y);else ctx.moveTo(s.x,s.y);});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
function dot(point,color,size=4,label,diamond=false){if(!isPoint(point))return;const p=project(point,camera);ctx.beginPath();if(diamond){ctx.moveTo(p.x,p.y-size);ctx.lineTo(p.x+size,p.y);ctx.lineTo(p.x,p.y+size);ctx.lineTo(p.x-size,p.y);ctx.closePath();}else ctx.arc(p.x,p.y,size,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#f7faff';ctx.lineWidth=2;ctx.stroke();if(label){ctx.font='600 12px Segoe UI';const w=ctx.measureText(label).width;ctx.fillStyle='#0a0e14';ctx.fillRect(p.x+size+5,p.y-10,w+10,21);ctx.fillStyle='#f4f7fb';ctx.fillText(label,p.x+size+10,p.y+5);}}
function facePath(points){points.forEach((p,i)=>{const s=project(p,camera);if(i)ctx.lineTo(s.x,s.y);else ctx.moveTo(s.x,s.y);});ctx.closePath();}
let passiveMapContext=null;
function installedContextFrame(now){
  if(!serviceStatus.viewOnlyMap)return state.frame;
  return !passive.health(now).expired&&passiveMapContext?.sequence===passive.frame?.sequence?passiveMapContext:null;
}
function currentPresentation(now){
  const base=presentation(state,passive,now,connected),cached=cachedWorldPresentation041(cacheWorld,base,now,{enabled:$('show-cache-world').checked&&!isReplay});
  if(cached.visible&&cached.cacheOnly)return {...base,kind:'cached-world',frame:null,geometry:null,listener:null,coordinateKey:cached.coordinateKey,
    health:{state:'cache',message:cached.reason,expired:false,ageMs:null},cacheLayer:cached};
  return {...base,cacheLayer:cached};
}
function wireBox(box,color,dash=[7,5]){
  const corners=[0,1].flatMap(x=>[0,1].flatMap(y=>[0,1].map(z=>[x?box.max[0]:box.min[0],y?box.max[1]:box.min[1],z?box.max[2]:box.min[2]])));
  for(let a=0;a<8;a++)for(const bit of [1,2,4]){const b=a^bit;if(a<b)line([corners[a],corners[b]],color,1.2,dash);}
}
function grid(){
  const step=camera.scale<8?10:5,span=Math.min(150,Math.max(20,camera.width/camera.scale)),[x,y,z]=camera.target;
  for(let n=-span;n<=span;n+=step){const a=Math.round(x/step)*step+n,b=Math.round(y/step)*step+n;
    line([[a,y-span,z],[a,y+span,z]],'#233044',1);line([[x-span,b,z],[x+span,b,z]],'#233044',1);}
}
function compileGeometry(geometry){
  if(geometryCompiled===geometry)return;
  geometryCompiled=geometry;
  geometryFaces=(geometry?.surfaces||[]).map(s=>({vertices:s.vertices,openings:s.openings||[],normal:s.normal,id:s.id,context:false}));
}
function compileContext(view){
  const listener=view.listener?.position,geometry=view.geometry;
  const key=context?JSON.stringify([view.coordinateKey,geometry?.generation,listener?.map(x=>Math.round(x/8))]):'';
  if(key===contextSelectionKey)return;contextSelectionKey=key;
  const selected=visibleContext(context,geometry,listener);
  contextBoxes=selected.tiles.filter(t=>t.showBounds===true).map(t=>({bounds:t.bounds,unknown:t.classification==='unknown-inspection'}));
  contextFaces=selected.tiles.flatMap(t=>t.faces.map(f=>({vertices:f.map(i=>t.vertices[i]),openings:[],normal:null,context:true})));
  if(context)safeText($('context-status'),`${selected.reason} · ${selected.tiles.length} visible tiles`);
}
function unknownColor(region){return /activation|portal/.test(region.reason??'')?'#e99d68':'#e4cc80';}
function draw(now){
  const start=performance.now(),bounds=canvas.getBoundingClientRect(),dpr=Math.min(3,devicePixelRatio||1);
  if(canvas.width!==Math.round(bounds.width*dpr)||canvas.height!==Math.round(bounds.height*dpr)){canvas.width=Math.round(bounds.width*dpr);canvas.height=Math.round(bounds.height*dpr);}
  camera.width=bounds.width;camera.height=bounds.height;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,bounds.width,bounds.height);
  const view=currentPresentation(now),health=view.health,usingAtlas=atlas&&atlasShown&&!isReplay,aligned=usingAtlas&&alignsWithWorldAtlas01(view.frame,atlas.index?.identity);
  const f=usingAtlas&&!aligned?null:view.frame,g=usingAtlas&&!aligned?null:view.geometry,cached=usingAtlas?{visible:false}:view.cacheLayer;
  if(atlas)atlas.canvas.hidden=!usingAtlas;
  camera.northUpAtlas=Boolean(usingAtlas);
  if(lastCoordinateKey!==view.coordinateKey){lastCoordinateKey=view.coordinateKey;if(!usingAtlas){camera.target=view.listener?.valid?[...view.listener.position]:cached.visible?[...cached.target]:[0,0,0];camera.scale=13;}contextSelectionKey='';}
  const freshAtlasCamera=!isReplay&&!health.expired&&view.listener?.valid&&isPoint(view.listener.position)&&
    (view.kind==='passive'||aligned);
  if(usingAtlas&&atlas.index&&!atlasPoseInitialised){
    if(freshAtlasCamera)atlasPoseInitialised=true;
    else if(follow){atlasOverview();follow=true;$('follow').classList.add('active');}
    else atlasPoseInitialised=true;
  }
  if(follow&&view.listener?.valid&&isPoint(view.listener.position)&&(!usingAtlas||freshAtlasCamera)){
    if(usingAtlas&&atlasFirstFollow){
      atlasFirstFollow=false;
      if(camera.scale<.14){
        Object.assign(camera,atlasResumeView??{scale:3,topDown:false});
        $('isometric').classList.toggle('active',!camera.topDown);$('topdown').classList.toggle('active',camera.topDown);
      }
    }
    camera.target=[...view.listener.position];
  }
  if(usingAtlas){
    const glCanvas=atlas.canvas,w=Math.round(bounds.width*Math.min(dpr,1.5)),h=Math.round(bounds.height*Math.min(dpr,1.5));
    if(glCanvas.width!==w||glCanvas.height!==h){glCanvas.width=w;glCanvas.height=h;}
    const heading=freshAtlasCamera&&follow?(view.listener.velocity&&Math.hypot(...view.listener.velocity)>1?view.listener.velocity.map(v=>v/Math.hypot(...view.listener.velocity)):view.listener.forward):null;
    atlas.render(camera,heading);
    if(camera.scale>=.14&&atlasInspection?.regions)for(const r of atlasInspection.regions)wireBox(r.bounds,unknownColor(r),[3,7]);
  }else{ctx.fillStyle='#0A0E14';ctx.fillRect(0,0,bounds.width,bounds.height);grid();}
  compileGeometry(g);if(!usingAtlas){compileContext(view);for(const box of contextBoxes)wireBox(box.bounds,box.unknown?'#efc46c':'#95b9df',[7,5]);}
  const cachedFaces=cached.visible?cached.tiles.flatMap(tile=>tile.surfaces.map(surface=>({...surface,context:false,cached:true,expired:['expired-fixture','future-fixture','expired-static-native','future-static-native'].includes(tile.state)}))):[];
  const admittedIds=new Set(geometryFaces.map(face=>face.id));
  const installedTiles=!atlas&&(view.kind==='acoustic'||view.kind==='passive')?installedContext.visible(installedContextFrame(now),now):[];
  const surrounding=new Map();
  for(const tile of installedTiles){
    wireBox(tile.bounds,'#6eafba',[5,7]);
    for(const region of tile.missingRegions)if(isPoint(region.bounds?.min)&&isPoint(region.bounds?.max))wireBox(region.bounds,unknownColor(region),[3,7]);
    for(const surface of tile.surfaces)if(!admittedIds.has(surface.id))surrounding.set(surface.id,{...surface,openings:[],context:true,installedContext:true});
  }
  const faces=[...(usingAtlas?[]:contextFaces),...cachedFaces,...surrounding.values(),...geometryFaces].map(face=>({...face,depth:face.vertices.reduce((n,p)=>n+project(p,camera).depth,0)/face.vertices.length})).sort((a,b)=>a.depth-b.depth);
  for(const face of faces){
    // Openings can overlap a convex footprint edge. Clip to the actual footprint
    // before using even-odd holes so no exterior part of a hole becomes a face.
    ctx.save();ctx.beginPath();facePath(face.vertices);ctx.clip();
    ctx.beginPath();facePath(face.vertices);for(const opening of face.openings)facePath(opening.vertices);
    const shade=face.normal?Math.round(43+16*Math.abs(face.normal[2]||0)):35;
    ctx.fillStyle=face.installedContext?'#172e35':face.context?'#18212f':face.cached?'#1d3545':health.expired?'#242b38':`rgb(${shade},${shade+7},${shade+16})`;
    ctx.fill('evenodd');ctx.restore();
    // Stroke outside the clipped fill so the full 2.2 CSS-pixel outline survives
    // at high DPI and along a finite support edge. Holes stay clipped inside it.
    ctx.beginPath();facePath(face.vertices);ctx.lineWidth=face.context?1.8:2.2;ctx.strokeStyle=face.installedContext?'#78b7bf':face.context?'#97a8c2':face.cached?'#8fcbe8':health.expired?'#b0bed2':'#f5f7fc';ctx.setLineDash(face.context?[7,5]:face.expired||health.expired?[5,5]:view.kind==='replay'?[12,3]:[]);ctx.stroke();ctx.setLineDash([]);
    if(face.openings.length){ctx.save();ctx.beginPath();facePath(face.vertices);ctx.clip();ctx.beginPath();for(const opening of face.openings)facePath(opening.vertices);ctx.stroke();ctx.restore();}
  }
  if(cached.visible){
    for(const tile of cached.tiles){wireBox(tile.bounds,tile.state==='prepared-fixture'?'#53758b':'#e4cc80');const p=project(tile.bounds.min,camera);ctx.font='11px Segoe UI';ctx.fillStyle='#b7d9e8';ctx.fillText(`${tile.tileId} · ${tile.state}`,p.x+4,p.y-5);
      for(const missing of tile.missingRegions)wireBox(missing.bounds,'#e4cc80');}
    for(const interior of cached.interiors){
      for(const room of interior.rooms){wireBox(room.bounds,room.completeness==='known'?'#a8a0ce':'#e4cc80',[3,5]);const p=project(room.bounds.min,camera);ctx.fillStyle='#c8bde6';ctx.fillText(`${room.id} · Z ${room.bounds.min[2]}–${room.bounds.max[2]} · ${room.completeness}`,p.x+4,p.y+13);}
      for(const portal of interior.portals)line([...portal.vertices,portal.vertices[0]],portal.topology==='known'?'#d7abe3':'#e4cc80',2,[3,4]);
    }
  }
  // Missing-region wire boxes are evidence, never an invented city boundary.
  for(const r of g?.missingRegions||[]){if(!isPoint(r.bounds?.min)||!isPoint(r.bounds?.max))continue;const [lo,hi]=[r.bounds.min,r.bounds.max];const a=[[lo[0],lo[1],lo[2]],[hi[0],lo[1],lo[2]],[hi[0],hi[1],lo[2]],[lo[0],hi[1],lo[2]]];line([...a,a[0]],unknownColor(r),2,[7,5]);}
  ctx.globalAlpha=health.expired?.7:1;
  for(const p of f?.paths||[]){if(!$('show-rejected').checked&&p.status!=='selected')continue;const style=pathStyle(p);if(!p.vertices)continue;const selected=p.status==='selected',dash=health.expired?[4,6]:view.kind==='replay'&&selected?[13,3]:style.dash;line(p.vertices,selected?'#0a0e14':style.color,selected?5.6:1.6,dash);if(selected)line(p.vertices,style.color,3.2,dash);for(const point of p.points||[])dot(point,style.color,selected?4.5:2.5);}
  ctx.globalAlpha=1;
  for(const s of f?.sources||[])if(s.valid!==false)dot(s.position,'#ffbc80',8,s.id,true);
  if(view.listener?.valid&&(!usingAtlas||freshAtlasCamera)){const l=view.listener;dot(l.position,health.expired?'#8897af':'#73bcff',8,view.kind==='passive'?'Camera · passive':'Listener');if(isPoint(l.forward)){const end=l.position.map((n,i)=>n+l.forward[i]*2.5);line([l.position,end],'#b6dcff',3.5,health.expired?[5,4]:[]);dot(end,'#b6dcff',3);}if(isPoint(l.up))line([l.position,l.position.map((n,i)=>n+l.up[i]*1.2)],'#a9c7e9',2);}
  // Fixed-scale axes indicate the model basis only.
  ctx.font='11px Segoe UI';ctx.fillStyle='#b0bed2';ctx.fillText('Z ↑  ·  X / Y reference plane',camera.width-174,camera.height-20);
  paintMs=performance.now()-start;lastDrawMs=now;
  if(usingAtlas&&serviceStatus.operatorMap){
    const s=atlas.snapshot();
    if(operatorLastDraw!==null){
      operatorFrames.frameIntervalMs=now-operatorLastDraw;
      operatorFrames.maximumFrameIntervalMs=Math.max(operatorFrames.maximumFrameIntervalMs??0,operatorFrames.frameIntervalMs);
    }
    operatorLastDraw=now;operatorFrames.frames++;
    if(s.coveredCells&&!s.visibleTriangles)operatorFrames.emptyCoveredFrames++;
    if(s.visibleDetailFallback)operatorFrames.detailFallbackFrames++;
    if(!operatorSending&&now-operatorLastPublish>=1000){
      operatorLastPublish=now;operatorSending=true;
      void api('/api/atlas/metrics',{schema:1,...operatorFrames,paintMs,gpuDrawMs:s.gpuMs,cameraAgeMs:Number.isFinite(health.ageMs)?health.ageMs:null,viewerFault:s.error?.slice(0,240)??null,
        overviewReadyMs:s.overviewCompleteMs,drawSubmitMs:s.drawCpuMs,visibleTriangles:s.visibleTriangles,visibleCells:s.visibleTiles,detailedCells:s.visibleDetailedTiles,
        overviewPages:s.overviewPages,uploads:s.uploads,cacheHits:s.hits,cacheMisses:s.misses,evictions:s.evictions,detailFailures:s.fetchFailures,
        bufferBytes:s.overviewBytes+s.detailBytes+s.reservedBytes}).catch(()=>{}).finally(()=>{operatorSending=false;});
    }
  }
}
function metric(label,value){const term=document.createElement('dt'),definition=document.createElement('dd');safeText(term,label);safeText(definition,value);$('metrics').append(term,definition);}
function metadata(now){
  const view=currentPresentation(now),f=view.frame,g=view.geometry,h=view.health,d=f?.diagnostics,isPassive=view.kind==='passive',isCached=view.kind==='cached-world',cached=view.cacheLayer;
  safeText($('connection'),viewPaused?'View paused · recording is independent':atlas&&atlasShown&&(!view.listener?.valid||h.expired)?'Retained atlas · camera unavailable':h.message);
  $('status-dot').style.background=h.state==='live'?'#63e8d3':h.state==='passive'?'#73bcff':h.state==='historical'?'#c6adff':'#e4cc80';
  const conditional=f?.readiness?.mode==='listener-only-conditional-direct',inspectionOnly=!g&&context?.inspection05?.mode==='unqualified-xml05';
  const mode=inspectionOnly?'UNQUALIFIED XML':isReplay?'HISTORICAL':isCached?'CACHED FIXTURE':serviceStatus.viewOnlyMap?'VIEW-ONLY WORLD':isPassive?'PASSIVE CAMERA':conditional?'CONDITIONAL DIRECT':view.kind==='acoustic'?'ACOUSTIC SOLVER':h.state.toUpperCase();
  safeText($('mode-chip'),mode);safeText($('mode-label'),viewPaused?'VISUAL UPDATES PAUSED':mode);
  safeText($('scene-title'),isCached?'Cached acoustic geometry.':isPassive?'Your listener, live.':f?isReplay?'A recorded acoustic moment.':'Sound, mapped.':'Ready when Story Mode is.');
  if(!g&&context?.inspection05?.mode==='unqualified-xml05')safeText($('scene-title'),'Unqualified XML inspection.');
  if(isPassive&&h.expired)safeText($('scene-title'),'Camera tracking unavailable.');
  const coverage=g?`${g.surfaces.length} finite surfaces · ${g.coverage}. `:'No accepted geometry. ';
  safeText($('knowledge'),isCached?'Original authored cache fixtures only. Tile and room boxes are bounds, not invented walls. Unsupported, unprepared and outside space remain unknown. Runtime doors and activation are unavailable.':isPassive?'Passive camera telemetry only. Acoustic processing is inactive. The reference grid is not world geometry.':conditional?'Listener-only conditional direct path. Unobserved space is assumed clear for the owned beacon; this is not verified unobstructed geometry.':coverage+(h.expired?'Geometry unavailable or expired at this moment. ':'')+'Unobserved space remains unknown.');
  if(inspectionOnly)safeText($('knowledge'),'Unqualified XML inspection only. Source identity and placement remain unverified; no acoustic surfaces or solver paths are authorized. Outside coverage is unknown.');
  const contextFrame=installedContextFrame(now);
  if(!atlas&&serviceStatus.viewOnlyMap&&!isReplay){
    safeText($('knowledge'),'Teal surfaces are verified collision context. The audio renderer is off. Conditional groups, higher layers and portal state can remain unknown.');
    if(!contextFrame)safeText($('context-status'),'Waiting for fresh camera and source proof.');
  }
  if(!atlas&&contextFrame?.worldContext01&&!isReplay&&!context){
    const explanation=installedContext.explanation(contextFrame,g,now);
    const decision=contextFrame.worldContext01.rendererDecision01;
    const expired=Number.isFinite(decision?.remainingMs)&&Number.isFinite(h.ageMs)&&h.ageMs>=decision.remainingMs;
    const renderer=!h.expired&&decision&&['admitted','expired','withheld','prepared'].includes(decision.state)?
      expired?' Renderer · expired.':
        ` Renderer · ${decision.state}${typeof decision.scope==='string'?` · ${decision.scope.slice(0,40)}`:''}${typeof decision.reason==='string'?` · ${decision.reason.slice(0,160).replaceAll('-',' ')}`:''}.`:'';
    const surroundings=explanation.contextOnly?
      `Teal · ${explanation.contextOnly} surrounding surfaces absent from the renderer’s admitted set · ${explanation.worksets} worksets.`:
      `Surrounding collision · ${explanation.state.replaceAll('-',' ')}.`;
    const unknown=explanation.unknownReasons.length?
      ` Unknown coverage · ${explanation.unknownReasons.slice(0,8).map(reason=>reason.slice(0,80).replaceAll('-',' ')).join(', ')}.`:'';
    safeText($('context-status'),surroundings+renderer+unknown);
  }
  const packet=cacheWorld.packet;
  safeText($('cache-world-status'),packet?`${packet.tiles.length} declared tiles · ${packet.tiles.reduce((n,t)=>n+t.surfaces.length,0)} finite collision surfaces · ${packet.interiors.length} interior fixtures. ${cached.visible?cached.reason:'Inspection hidden.'} Installed-world compatibility remains unqualified.`:'No qualified cache snapshot supplied. The reference grid is not a building map.');
  safeText($('cache-world-identities'),cached.visible?cached.tiles.flatMap(t=>t.buildingBindings.slice(0,4).map(b=>`${t.tileId}: archetype ${b.archetypeHash} → ${b.collisionResourceId}`)).slice(0,16).join(' · '):'');
  const actualFps=displayRate.rate(now),incoming=(isPassive?passiveRate:solverRate).rate(now);
  safeText($('display-fps'),actualFps.toFixed(1));safeText($('telemetry-rate'),incoming.toFixed(1));safeText($('telemetry-age'),Number.isFinite(h.ageMs)?`${Math.round(h.ageMs)} ms`:'—');
  $('display-fps').dataset.target=String(fps);$('telemetry-rate').dataset.pollTarget=String(TELEMETRY_POLL_FPS);
  safeText($('grid-note'),isCached?'Reference grid only · authored cache model metres':isPassive?'Reference grid only · native units, physical scale unverified':'Reference grid only · model metres, physical scale unverified');
  $('metrics').replaceChildren();
  if(atlas&&atlasShown&&!isReplay){
    const s=atlas.snapshot(),p=serviceStatus.worldAtlas?.proof,data=atlas.index;
    const currentInterior=atlasLive&&now<atlasLive.until&&!passive.health(now).expired?atlasLive.sample:null;
    const title=serviceStatus.viewOnly?'WORLD ATLAS · VIEW ONLY':'WORLD ATLAS';
    safeText($('mode-chip'),title);if(!viewPaused)safeText($('mode-label'),title);
    safeText($('scene-title'),s.error?'Atlas display incomplete.':data?'GTA V Enhanced collision atlas.':'Opening the retained world atlas.');
    safeText($('knowledge'),s.error??'CodeWalker-derived collision context. Static meshes stay on the map when camera observations expire. Only renderer overlays can show acoustic admissions.');
    safeText($('grid-note'),'GTA native coordinates · graphical textures are outside this atlas');
    inspectAtlas(now);
    safeText($('atlas-coverage'),!data?'Reading the pinned spatial index.':
      `${data.counts.placedResources.toLocaleString()} of ${data.counts.resources.toLocaleString()} resources have retained world placement; ${data.counts.unresolvedPlacements} unresolved. All models are partial. `+
      (camera.scale<.14?'Overview omits detail. Zoom in for the exact retained mesh.':atlasInspection?.missing?'No mesh is indexed to this cell; coverage remains unknown.':atlasInspection?.error??(atlasInspection?`${atlasInspection.entries.length} source bindings in this cell; ${atlasInspection.regionCount} located unknown records${atlasInspection.regionDisplayLimited?' (boxes sampled)':''}.`:'Reading cell coverage…')));
    const proofState=p?.stopAt&&Date.now()>=p.stopAt?'session-source-receipt-expired':p?.live&&now-serviceHeardAt>500?'current-proof-service-unavailable':p?.state;
    metric('Atlas source',proofState?.replaceAll('-',' '));metric('Atlas catalogue',serviceStatus.worldAtlas?.identity.catalogSHA256);
    metric('Atlas proof epoch',p?.epoch);metric('Atlas SHA-256',serviceStatus.worldAtlas?.sha256);
    metric('Visible atlas triangles',s.visibleTriangles);metric('Visible atlas cells',`${s.visibleTiles} · ${s.visibleDetailedTiles} above overview`);
    metric('Whole-world overview',`${s.overviewTriangles} triangles · ${s.overviewCompleteMs===null?'loading':format(s.overviewCompleteMs)+' ms'}`);
    metric('Atlas GPU buffers',`${format((s.overviewBytes+s.detailBytes+s.reservedBytes)/1048576)} MiB accounted incl. reservations`);
    metric('Atlas cache',`${s.hits} visible reuses · ${s.misses} loads · ${s.evictions} evictions · ${s.uploads} uploads`);
    metric('Atlas GPU draw',s.gpuMs===null?'timer unavailable':format(s.gpuMs)+' ms');
    metric('Atlas CPU submit',format(s.drawCpuMs)+' ms');
    if(s.lastDetailError||s.budgetLimitedTiles)metric('Atlas detail withheld',s.lastDetailError??`${s.budgetLimitedTiles} cells held at lower detail while cache is busy`);
    metric('Observed placed interior',currentInterior?`Proxy ${currentInterior.proxy} · ${currentInterior.id}`:'No fresh source-bound match');
    if(f&&!alignsWithWorldAtlas01(f,data?.identity))metric('Renderer overlays','Separate solver view · no exact atlas alignment');
    if(currentInterior)metric('Portal / door state','Unknown');
  }
  if(!atlas&&serviceStatus.viewOnlyMap&&contextFrame){
    const c=contextFrame.worldContext01,raw=passive.frame?.interiorReadback;
    metric('Catalogue',c.catalogue);metric('Proof epoch',c.epoch);
    metric('Interior readback',raw?.outcome==='observed'?[`Proxy ${raw.proxy}`,`archetype ${raw.archetype}`,`origin ${raw.origin.join(', ')}`].join(' · '):raw?.outcome??'unavailable');
    const tiles=installedContext.visible(contextFrame,now);
    metric('Context lease',tiles.length?`${Math.max(0,Math.round(installedContext.validUntil-now))} ms remaining`:'unavailable');
    for(const tile of tiles)if(tile.query)metric('Context selection',`${tile.query.verified}/${tile.query.nearby} resources verified · ${tile.query.withheld} withheld · ${tile.query.interiorActivation}`);
    for(const source of tiles.flatMap(tile=>tile.sources??[]).slice(0,16))metric(source.interiorInstanceId?'Source · observed placement':'Source · static placement',`${source.resourceId} · receipt ${source.receiptSHA256}`);
  }
  metric('Tracking',mode);metric('Session',f?.sessionId||(isPassive?passive.frame.sessionId:'No session'));metric(isPassive?'Camera sequence':'Solver sequence',isPassive?passive.frame.sequence:f?.sequence??'—');
  metric('Display / telemetry',`${actualFps.toFixed(1)} / ${incoming.toFixed(1)} FPS`);metric('Observation age',Number.isFinite(h.ageMs)?`${format(h.ageMs)} ms`:'unavailable');
  metric('Canvas / device scale',`${Math.round(camera.width)} × ${Math.round(camera.height)} · DPR ${format(devicePixelRatio||1)}`);
  metric('Observation',f?.observationTimeSeconds==null?'unavailable':`${format(f.observationTimeSeconds)} s (original)`);
  metric('Geometry clock',f?`${format(f.geometryTimeMs)} ms (original)`:'—');
  metric('Geometry lease',g?`${format(g.validUntil)} ms`:'unavailable');
  if(f?.readiness){metric('Owned renderer',f.readiness.rendererReadyForOwnedEmission?'Ready':'Unavailable');metric('Observed / reflections',`${f.readiness.genuineGeometryPresent?'available':'unavailable'} / ${f.readiness.reflectionsActive?'active':'inactive'}`);}
  metric('Worker / viewer paint',`${format(f?.performance?.workerMs)} / ${format(paintMs)} ms`);
  const processing=f?.settings?.processing,acoustic=f?.settings?.acoustic;
  metric('Quality',acoustic?.activeQuality||processing?.quality||'unavailable');metric('Acceleration',acoustic?.activeAcceleration||processing?.acceleration||'unavailable');
  metric('GPU capability',acoustic?.gpuCapability||'unverified');metric('Compute task',`${format(acoustic?.taskWallMs)} ms`);metric('Quality deadline misses',acoustic?.qualityDeadlineMisses??'unavailable');
  metric('Visual updates skipped',`${state.dropped} client / ${serviceStatus.droppedUpdates??0} transport`);
  metric('Paths omitted by producer',d?.omittedPaths??0);metric('Input / solver state',d?.reason||'Available');
  const calibration=f?.calibration||g?.calibration;
  safeText($('coordinate-note'),isCached?'Independent authored metre cache view. Live camera, sources and solver paths are hidden without an exact declared model alignment.':isPassive?'Unscaled GTA-native coordinates · right-handed Z-up. No acoustic calibration or world surfaces are implied.':calibration?`Engine model coordinates; ${calibration.metresPerNativeUnit} model m/native unit. Physical calibration: ${calibration.physicalCalibration||'unverified'}.`:'Engine model coordinates only. Physical GTA scale remains unverified.');
  safeText($('path-count'),`${f?.paths.length||0} paths`);$('paths').replaceChildren();
  if(!f?.paths.length){const p=document.createElement('p');p.className='muted';safeText(p,isCached?'Cached geometry supplies no solver paths. Reflections appear only in accepted solver evidence.':isPassive?'Passive tracking has no sound sources, acoustic surfaces or solver paths.':d?.reason||'No solver paths available. No visual rays are invented.');$('paths').append(p);}
  for(const p of (f?.paths||[]).filter(p=>$('show-rejected').checked||p.status==='selected').slice(0,64)){
    const style=pathStyle(p),row=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span'),reason=document.createElement('small');row.className='path';row.style.borderColor=style.color;
    safeText(title,`${style.label} · ${p.sourceId}`);safeText(detail,`${p.order} bounce(s) · ${p.delay==null?'delay unavailable':format(p.delay*1000)+' ms'} · ${p.distance==null?'distance unavailable':format(p.distance)+' model m'}`);
    safeText(reason,[p.solverStatus,p.visibility,p.reason,p.vertices?'':'no solver vertices'].filter(Boolean).join(' · '));row.append(title,detail,reason);$('paths').append(row);
  }
  if((f?.paths.length||0)>64){const p=document.createElement('p');p.className='muted';safeText(p,'First 64 path details shown; bounded canvas includes the remaining paths.');$('paths').append(p);}
}
function recordingStatus(){
  if(serviceStatus.operatorMap){
    $('operator-stop').hidden=false;$('popout').hidden=true;
    $('operator-stop').disabled=serviceStatus.operatorMap.stopRequestedAt!==null;
    if(serviceStatus.operatorMap.stopRequestedAt!==null)safeText($('operator-stop'),'Quit GTA normally');
  }
  if(serviceStatus.viewOnlyMap||serviceStatus.viewOnly&&serviceStatus.worldAtlas){
    document.querySelector('footer').hidden=true;
    if(serviceStatus.worldAtlas)document.body.classList.add('atlas-view-only');
    $('show-cache-world').checked=false;$('show-cache-world').disabled=true;
    $('context-file').disabled=true;
  }
  if(serviceStatus.viewOnly){$('record-start').disabled=$('record-stop').disabled=true;safeText($('record-status'),'View only · recording disabled');return;}
  const r=serviceStatus.recording,active=r&&['recording','starting','stopping'].includes(r.state);
  $('record-start').disabled=!!active||isReplay;$('record-stop').disabled=!active||r?.state==='stopping';
  safeText($('record-status'),r?`${r.state} · ${time(r.durationMs)} · ${format((r.bytes||0)/1048576)} MiB${r.terminationReason?' · '+r.terminationReason:''}`:'Not recording');
}
async function refreshRecordings(){const {recordings=[]}=await api('/api/recordings');const selected=$('recordings').value;$('recordings').replaceChildren(new Option('Choose a local recording…',''));for(const r of recordings)$('recordings').add(new Option(`${r.id} · ${time(r.durationMs)} · ${r.state}`,r.id));$('recordings').value=selected;}
async function fetchStatus(){try{serviceStatus=await api('/api/status');serviceHeardAt=performance.now();connected=serviceStatus.connected===true;startAtlas();recordingStatus();}catch(error){connected=false;safeText($('record-status'),'Local service unavailable');}}
async function statusLoop(){await fetchStatus();setTimeout(statusLoop,1000);}
async function telemetryLoop(){
  const now=performance.now();
  if(!viewPaused&&!document.hidden){
    const playbackTime=replay.timeMs;
    if(!isReplay||pendingSeek||replay.playing||lastReplayRequest<0){
      const epoch=requestEpoch,requestStarted=performance.now();
      try{
        const query=`geometryGeneration=${encodeURIComponent(state.geometryRequestKey())}&cacheWorldGeneration=${encodeURIComponent(cacheWorld.requestKey())}`;
        const url=isReplay?`/api/replay/frame?timeMs=${Math.round(playbackTime)}&${query}`:`/api/frame?${query}`;
        const envelope=await api(url);
        if(epoch===requestEpoch){
          const received=performance.now(),timing={requestElapsedMs:received-requestStarted};
          if(envelope.status){serviceStatus={...serviceStatus,...envelope.status};serviceHeardAt=received;connected=envelope.status.connected===true;}
          startAtlas();
          if(!isReplay){
            if(passive.ingest(envelope.passive,received,timing))passiveRate.mark(received);
            passiveMapContext=envelope.mapContext??null;
            const interior=envelope.atlasContext?.interior;
            atlasLive=interior?{sample:interior,until:received+Math.max(0,interior.remainingMs-(received-requestStarted))}:null;
          }
          if(!isReplay)cacheWorld.ingest(envelope.cacheWorld,received,timing);
          if(state.ingest(envelope,received,timing))solverRate.mark(received);
          lastReplayRequest=playbackTime;pendingSeek=false;
        }
      }catch(error){connected=false;if(epoch===requestEpoch&&state.frame===null)safeText($('connection'),error.message);}
    }
  }
  // Never derive this interval from the display target. 60 FPS displays copied
  // observations; it does not request extra collision, solver or DSP work.
  setTimeout(telemetryLoop,Math.max(1,1000/TELEMETRY_POLL_FPS-(performance.now()-now)));
}
async function installedContextLoop(){
  const frame=installedContextFrame(performance.now());
  if(!atlas&&!isReplay&&!viewPaused&&!document.hidden&&frame?.worldContext01){
    const start=performance.now();
    try{
      const response=await api('/api/world-context?generation='+encodeURIComponent(installedContext.generation));
      const now=performance.now(),current=installedContextFrame(now);
      if(InstalledContextState01.key(frame)===InstalledContextState01.key(current)){
        installedContext.ingest(response,current,now,now-start);
      }
    }catch{installedContext.clear();}
  }else installedContext.clear();
  setTimeout(installedContextLoop,serviceStatus.viewOnlyMap||frame?.worldContext01?.interiorKey?100:400);
}
function animationLoop(now){
  requestAnimationFrame(animationLoop);
  if(now>noticeUntil)$('notice').style.display='none';
  if(!document.hidden&&!viewPaused){
    if(isReplay){if(!player.paused&&audioObjectUrl)replay.seek(player.currentTime*1000+(replayAudioInfo.startTimeMs||0));else replay.tick(now);}
    if(displayCadence.due(now)){draw(now);displayRate.mark(now);}
  }
  if(!document.hidden&&now-lastMetadataAt>=250){
    metadata(now);lastMetadataAt=now;
    $('scrubber').value=String(Math.round(replay.timeMs));safeText($('time-label'),`${time(replay.timeMs)} / ${time(replay.durationMs)}`);safeText($('play-pause'),replay.playing?'Ⅱ Pause':'▶ Play');
  }
}
bind('record-start',async()=>{await api('/api/record/start',{maxDurationSeconds:Number($('max-seconds').value),maxBytes:Math.round(Number($('max-mib').value)*1048576)});await fetchStatus(performance.now());notice('Recording started. Only RichAudio-owned output and its acoustic timeline are requested.');});
bind('record-stop',async()=>{const result=await api('/api/record/stop',{id:serviceStatus.recording?.id});await fetchStatus(performance.now());await refreshRecordings();notice(result.recording?.state==='stopping'?'Recording is stopping; waiting for the owned PCM tail.':'Recording stopped. Original timeline and PCM evidence remain in the private bundle.');});
bind('refresh-recordings',refreshRecordings);
bind('open-replay',async()=>{
  const id=$('recordings').value;if(!id)throw Error('Select a local recording first.');
  const result=await api('/api/replay/open',{id});clearAudio();replayAudioInfo={...result.audio,timeline:result.timeline};requestEpoch++;isReplay=true;replay.open(result.durationMs);state.reset();pendingSeek=true;lastReplayRequest=-1;
  $('scrubber').max=String(replay.durationMs);$('scrubber').disabled=false;$('play-pause').disabled=false;$('close-replay').disabled=false;recordingStatus();
  $('events').replaceChildren();for(const event of (result.events||[]).slice(0,2000)){const button=document.createElement('button');safeText(button,`${time(event.timeMs)} ${event.type}`);button.title=typeof event.detail==='string'?event.detail:JSON.stringify(event.detail??{});if(/fail|gap|expiry|expired|spike|missing|discontinu|invalid|stale/i.test(event.type))button.className='anomaly';button.addEventListener('click',()=>{player.pause();replay.playing=false;replay.seek(event.timeMs);pendingSeek=true;requestEpoch++;});$('events').append(button);}
  $('load-audio').disabled=!result.audio?.available||!Number.isFinite(result.audio?.startTimeMs);
  safeText($('audio-evidence'),result.audio?.available?'Visual replay · audio is opt-in':'PCM unavailable / discontinuous');
  notice('Historical replay opened. Observation timestamps and failed events are preserved.');
});
function clearAudio(){player.pause();player.removeAttribute('src');player.hidden=true;if(audioObjectUrl)URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=null;$('load-audio').disabled=true;}
bind('load-audio',async()=>{
  if(!replayAudioInfo?.available)throw Error('No contiguous owned PCM evidence is available.');
  const result=await fetch('/api/replay/audio',{headers:{'X-RichAudio-Token':token},cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw Error((await result.json()).error||'Owned PCM unavailable');
  const blob=await result.blob();if(blob.size>256*1048576+44)throw Error('Audio bundle exceeds the viewer memory bound');
  audioObjectUrl=URL.createObjectURL(blob);player.src=audioObjectUrl;player.hidden=false;$('load-audio').disabled=true;
  const engineClock=replayAudioInfo.timeline?.basis==='original-engine-audioFrame';
  safeText($('audio-evidence'),engineClock?'Engine frame sync':'Audio sync approximate');$('audio-evidence').title=replayAudioInfo.clockUncertainty||'Original submitted PCM lineage; not speaker presentation time';
  notice('Owned PCM loaded, not playing. Press its audio Play control to hear it. '+(engineClock?'The acoustic timeline uses original engine frames; wall-clock event alignment is approximate.':'Timeline alignment uses the approximate host UTC/QPC anchor.'));
});
player.addEventListener('play',()=>{replay.playing=true;pendingSeek=true;});player.addEventListener('pause',()=>{replay.playing=false;replay.lastNow=null;});
player.addEventListener('seeked',()=>{replay.seek(player.currentTime*1000+(replayAudioInfo?.startTimeMs||0));pendingSeek=true;requestEpoch++;});
player.addEventListener('ended',()=>{replay.playing=false;});
bind('play-pause',()=>{player.pause();if(replay.timeMs>=replay.durationMs)replay.seek(0);replay.playing=!replay.playing;replay.lastNow=performance.now();pendingSeek=true;});
$('scrubber').addEventListener('input',()=>{player.pause();replay.seek($('scrubber').value);pendingSeek=true;requestEpoch++;});
bind('isometric',()=>{camera.topDown=false;$('isometric').classList.add('active');$('topdown').classList.remove('active');});
bind('topdown',()=>{camera.topDown=true;$('topdown').classList.add('active');$('isometric').classList.remove('active');});
bind('follow',()=>{follow=!follow;if(follow&&atlas&&camera.scale<.14)atlasFirstFollow=true;$('follow').classList.toggle('active',follow);});
bind('atlas-overview',atlasOverview);
bind('operator-stop',async()=>{
  await api('/api/operator/stop',{end:true});$('operator-stop').disabled=true;
  safeText($('operator-stop'),'Quit GTA normally');notice('Exit GTA normally when ready. The launcher will verify process closure before restoring the original files.');
});
bind('atlas-toggle',()=>{
  atlasShown=!atlasShown;atlasPoseInitialised=false;atlasFirstFollow=true;lastCoordinateKey=null;
  safeText($('atlas-toggle'),atlasShown?'Solver view':'World atlas');
  $('atlas-overview').disabled=$('atlas-layers').disabled=!atlasShown;
});
$('atlas-layers').addEventListener('change',()=>{if(atlas)atlas.mode=Number($('atlas-layers').value);});
bind('reset-camera',()=>{Object.assign(camera,{yaw:-.7,pitch:.65,scale:13});follow=true;$('follow').classList.add('active');});
bind('visual-toggle',()=>{viewPaused=!viewPaused;replay.lastNow=null;displayCadence.reset();displayRate.reset();safeText($('visual-toggle'),viewPaused?'Resume view':'Pause view');if(!viewPaused)pendingSeek=true;});
$('fps').addEventListener('change',()=>{fps=clampFps($('fps').value);displayCadence.setRate(fps);displayRate.reset();});
$('show-rejected').addEventListener('change',()=>{metadata(performance.now());});
$('show-cache-world').addEventListener('change',()=>{lastCoordinateKey=null;metadata(performance.now());});
$('context-file').addEventListener('change',async event=>{try{const file=event.target.files?.[0];if(!file)return;if(file.size>LIMITS.contextBytes)throw Error('Private context file exceeds 4 MiB');context=parseVisualContext(await file.text());contextSelectionKey='reload';compileContext(presentation(state,passive,performance.now(),connected));}catch(error){context=null;contextFaces=[];contextBoxes=[];safeText($('context-status'),'Context rejected: '+error.message);notice(error.message,true);}});
window.addEventListener('richaudio-inspection-context05',event=>{try{context=parseVisualContext(JSON.stringify(event.detail));contextSelectionKey='reload';if(context.inspection05?.mode==='unqualified-xml05'){camera.target=[...context.inspection05.anchor];follow=false;}compileContext(presentation(state,passive,performance.now(),connected));}catch{context=null;contextFaces=[];contextBoxes=[];safeText($('context-status'),'Inspection context rejected');}});
bind('clear-context',()=>{context=null;contextFaces=[];contextBoxes=[];contextSelectionKey='';$('context-file').value='';safeText($('context-status'),'None loaded · no complete buildings inferred');});
bind('popout',()=>{const popup=window.open(location.href,'RichAudioSoundMap','popup,width=1280,height=820,resizable=yes');if(!popup)throw Error('Allow this local page to open its independent SoundMap window.');});
let drag=null;
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};
  if(e.shiftKey){follow=false;$('follow').classList.remove('active');const c=Math.cos(camera.yaw),s=Math.sin(camera.yaw),v=dy*(camera.topDown&&camera.northUpAtlas?-1:1)/(camera.scale*Math.max(.2,Math.sin(camera.topDown?Math.PI/2:camera.pitch)));camera.target[0]-=dx*c/camera.scale-v*s;camera.target[1]-=dx*s/camera.scale+v*c;}
  else {camera.yaw+=dx*.008;camera.pitch=Math.max(.15,Math.min(1.5,camera.pitch+dy*.005));}});
canvas.addEventListener('wheel',e=>{e.preventDefault();if(atlas){atlasPoseInitialised=true;atlasFirstFollow=false;}camera.scale=Math.max(atlas?.index?.bounds?Math.min(.01,camera.width/(atlas.index.bounds.max[0]-atlas.index.bounds.min[0]+1)*.5):2,Math.min(80,camera.scale*Math.exp(-e.deltaY*.001)));},{passive:false});
document.addEventListener('visibilitychange',()=>{replay.lastNow=null;operatorLastDraw=null;pendingSeek=true;displayCadence.reset();displayRate.reset();});
refreshRecordings().catch(()=>{});statusLoop();telemetryLoop().catch(error=>notice(error.message,true));installedContextLoop();requestAnimationFrame(animationLoop);
