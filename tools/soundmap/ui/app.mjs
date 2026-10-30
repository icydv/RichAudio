import {VisualState,PassiveState,presentation,DisplayCadence,RateMeter,TELEMETRY_POLL_FPS,ReplayClock,project,pathStyle,parseVisualContext,visibleContext,clampFps,isPoint,LIMITS} from './model.mjs';
const $=id=>document.getElementById(id),state=new VisualState(),passive=new PassiveState(),replay=new ReplayClock();
const displayCadence=new DisplayCadence(20),displayRate=new RateMeter(),solverRate=new RateMeter(),passiveRate=new RateMeter();
const canvas=$('scene'),ctx=canvas.getContext('2d'),camera={target:[0,0,0],yaw:-.7,pitch:.65,scale:13,topDown:false,width:800,height:600};
let token=null,serviceStatus={},isReplay=false,viewPaused=false,follow=true,fps=20,connected=false,context=null;
let lastMetadataAt=-Infinity,noticeUntil=0,lastReplayRequest=-1,pendingSeek=true,requestEpoch=0,lastCoordinateKey=null;
let geometryCompiled=null,geometryFaces=[],contextFaces=[],contextSelectionKey='',lastDrawMs=0,paintMs=0;
let replayAudioInfo=null,audioObjectUrl=null;
const player=$('replay-audio');
const format=n=>Number.isFinite(n)?n.toFixed(2):'unavailable';
const time=n=>{const ms=Math.max(0,Math.round(n||0));return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
const safeText=(el,value)=>{el.textContent=String(value??'unavailable');};
function notice(message,error=false){safeText($('notice'),message);$('notice').className=error?'error':'';$('notice').style.display='block';noticeUntil=performance.now()+8000;}
async function api(path,body){
  if(!token){const response=await fetch('/api/session',{cache:'no-store',signal:AbortSignal.timeout(2500)});if(!response.ok)throw Error('Cannot authenticate local SoundMap service');token=(await response.json()).token;}
  const response=await fetch(path,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{'X-RichAudio-Token':token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(2500)});
  if(!response.ok){if(response.status===401||response.status===403)token=null;const error=await response.json().catch(()=>({}));throw Error(error.error||error.message||`Local service returned ${response.status}`);}return response.json();
}
function bind(id,callback){$(id).addEventListener('click',()=>Promise.resolve().then(callback).catch(e=>notice(e.message,true)));}
function line(points,color,width=1,dash=[]){if(!points?.length)return;ctx.beginPath();points.forEach((p,i)=>{const s=project(p,camera);if(i)ctx.lineTo(s.x,s.y);else ctx.moveTo(s.x,s.y);});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
function dot(point,color,size=4,label,diamond=false){if(!isPoint(point))return;const p=project(point,camera);ctx.beginPath();if(diamond){ctx.moveTo(p.x,p.y-size);ctx.lineTo(p.x+size,p.y);ctx.lineTo(p.x,p.y+size);ctx.lineTo(p.x-size,p.y);ctx.closePath();}else ctx.arc(p.x,p.y,size,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#f7faff';ctx.lineWidth=2;ctx.stroke();if(label){ctx.font='600 12px Segoe UI';const w=ctx.measureText(label).width;ctx.fillStyle='#0a0e14';ctx.fillRect(p.x+size+5,p.y-10,w+10,21);ctx.fillStyle='#f4f7fb';ctx.fillText(label,p.x+size+10,p.y+5);}}
function facePath(points){points.forEach((p,i)=>{const s=project(p,camera);if(i)ctx.lineTo(s.x,s.y);else ctx.moveTo(s.x,s.y);});ctx.closePath();}
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
  contextFaces=selected.tiles.flatMap(t=>t.faces.map(f=>({vertices:f.map(i=>t.vertices[i]),openings:[],normal:null,context:true})));
  if(context)safeText($('context-status'),`${selected.reason} · ${selected.tiles.length} visible tiles`);
}
function draw(now){
  const start=performance.now(),bounds=canvas.getBoundingClientRect(),dpr=Math.min(3,devicePixelRatio||1);
  if(canvas.width!==Math.round(bounds.width*dpr)||canvas.height!==Math.round(bounds.height*dpr)){canvas.width=Math.round(bounds.width*dpr);canvas.height=Math.round(bounds.height*dpr);}
  camera.width=bounds.width;camera.height=bounds.height;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0A0E14';ctx.fillRect(0,0,bounds.width,bounds.height);
  const view=presentation(state,passive,now,connected),f=view.frame,g=view.geometry,health=view.health;
  if(lastCoordinateKey!==view.coordinateKey){lastCoordinateKey=view.coordinateKey;camera.target=view.listener?.valid?[...view.listener.position]:[0,0,0];camera.scale=13;contextSelectionKey='';}
  if(follow&&view.listener?.valid&&isPoint(view.listener.position))camera.target=[...view.listener.position];
  grid();compileGeometry(g);compileContext(view);
  const faces=[...contextFaces,...geometryFaces].map(face=>({...face,depth:face.vertices.reduce((n,p)=>n+project(p,camera).depth,0)/face.vertices.length})).sort((a,b)=>a.depth-b.depth);
  for(const face of faces){
    // Openings can overlap a convex footprint edge. Clip to the actual footprint
    // before using even-odd holes so no exterior part of a hole becomes a face.
    ctx.save();ctx.beginPath();facePath(face.vertices);ctx.clip();
    ctx.beginPath();facePath(face.vertices);for(const opening of face.openings)facePath(opening.vertices);
    const shade=face.normal?Math.round(43+16*Math.abs(face.normal[2]||0)):35;
    ctx.fillStyle=face.context?'#18212f':health.expired?'#242b38':`rgb(${shade},${shade+7},${shade+16})`;
    ctx.fill('evenodd');ctx.restore();
    // Stroke outside the clipped fill so the full 2.2 CSS-pixel outline survives
    // at high DPI and along a finite support edge. Holes stay clipped inside it.
    ctx.beginPath();facePath(face.vertices);ctx.lineWidth=face.context?1.8:2.2;ctx.strokeStyle=face.context?'#97a8c2':health.expired?'#b0bed2':'#f5f7fc';ctx.setLineDash(face.context?[7,5]:health.expired?[5,5]:view.kind==='replay'?[12,3]:[]);ctx.stroke();ctx.setLineDash([]);
    if(face.openings.length){ctx.save();ctx.beginPath();facePath(face.vertices);ctx.clip();ctx.beginPath();for(const opening of face.openings)facePath(opening.vertices);ctx.stroke();ctx.restore();}
  }
  // Missing-region wire boxes are evidence, never an invented city boundary.
  for(const r of g?.missingRegions||[]){if(!isPoint(r.bounds?.min)||!isPoint(r.bounds?.max))continue;const [lo,hi]=[r.bounds.min,r.bounds.max];const a=[[lo[0],lo[1],lo[2]],[hi[0],lo[1],lo[2]],[hi[0],hi[1],lo[2]],[lo[0],hi[1],lo[2]]];line([...a,a[0]],'#e4cc80',2,[7,5]);}
  ctx.globalAlpha=health.expired?.7:1;
  for(const p of f?.paths||[]){if(!$('show-rejected').checked&&p.status!=='selected')continue;const style=pathStyle(p);if(!p.vertices)continue;const selected=p.status==='selected',dash=health.expired?[4,6]:view.kind==='replay'&&selected?[13,3]:style.dash;line(p.vertices,selected?'#0a0e14':style.color,selected?5.6:1.6,dash);if(selected)line(p.vertices,style.color,3.2,dash);for(const point of p.points||[])dot(point,style.color,selected?4.5:2.5);}
  ctx.globalAlpha=1;
  for(const s of f?.sources||[])if(s.valid!==false)dot(s.position,'#ffbc80',8,s.id,true);
  if(view.listener?.valid){const l=view.listener;dot(l.position,health.expired?'#8897af':'#73bcff',8,view.kind==='passive'?'Camera · passive':'Listener');if(isPoint(l.forward)){const end=l.position.map((n,i)=>n+l.forward[i]*2.5);line([l.position,end],'#b6dcff',3.5,health.expired?[5,4]:[]);dot(end,'#b6dcff',3);}if(isPoint(l.up))line([l.position,l.position.map((n,i)=>n+l.up[i]*1.2)],'#a9c7e9',2);}
  // Fixed-scale axes indicate the model basis only.
  ctx.font='11px Segoe UI';ctx.fillStyle='#b0bed2';ctx.fillText('Z ↑  ·  X / Y reference plane',camera.width-174,camera.height-20);
  paintMs=performance.now()-start;lastDrawMs=now;
}
function metric(label,value){const term=document.createElement('dt'),definition=document.createElement('dd');safeText(term,label);safeText(definition,value);$('metrics').append(term,definition);}
function metadata(now){
  const view=presentation(state,passive,now,connected),f=view.frame,g=view.geometry,h=view.health,d=f?.diagnostics,isPassive=view.kind==='passive';
  safeText($('connection'),viewPaused?'View paused · recording is independent':h.message);
  $('status-dot').style.background=h.state==='live'?'#63e8d3':h.state==='passive'?'#73bcff':h.state==='historical'?'#c6adff':'#e4cc80';
  const conditional=f?.readiness?.mode==='listener-only-conditional-direct';
  const mode=isReplay?'HISTORICAL':isPassive?'PASSIVE CAMERA':conditional?'CONDITIONAL DIRECT':view.kind==='acoustic'?'ACOUSTIC SOLVER':h.state.toUpperCase();
  safeText($('mode-chip'),mode);safeText($('mode-label'),viewPaused?'VISUAL UPDATES PAUSED':mode);
  safeText($('scene-title'),isPassive?'Your listener, live.':f?isReplay?'A recorded acoustic moment.':'Sound, mapped.':'Ready when Story Mode is.');
  if(isPassive&&h.expired)safeText($('scene-title'),'Camera tracking unavailable.');
  const coverage=g?`${g.surfaces.length} finite surfaces · ${g.coverage}. `:'No accepted geometry. ';
  safeText($('knowledge'),isPassive?'Passive camera telemetry only. Acoustic processing is inactive. The reference grid is not world geometry.':conditional?'Listener-only conditional direct path. Unobserved space is assumed clear for the owned beacon; this is not verified unobstructed geometry.':coverage+(h.expired?'Geometry unavailable or expired at this moment. ':'')+'Unobserved space remains unknown.');
  const actualFps=displayRate.rate(now),incoming=(isPassive?passiveRate:solverRate).rate(now);
  safeText($('display-fps'),actualFps.toFixed(1));safeText($('telemetry-rate'),incoming.toFixed(1));safeText($('telemetry-age'),Number.isFinite(h.ageMs)?`${Math.round(h.ageMs)} ms`:'—');
  $('display-fps').dataset.target=String(fps);$('telemetry-rate').dataset.pollTarget=String(TELEMETRY_POLL_FPS);
  safeText($('grid-note'),isPassive?'Reference grid only · native units, physical scale unverified':'Reference grid only · model metres, physical scale unverified');
  $('metrics').replaceChildren();
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
  safeText($('coordinate-note'),isPassive?'Unscaled GTA-native coordinates · right-handed Z-up. No acoustic calibration or world surfaces are implied.':calibration?`Engine model coordinates; ${calibration.metresPerNativeUnit} model m/native unit. Physical calibration: ${calibration.physicalCalibration||'unverified'}.`:'Engine model coordinates only. Physical GTA scale remains unverified.');
  safeText($('path-count'),`${f?.paths.length||0} paths`);$('paths').replaceChildren();
  if(!f?.paths.length){const p=document.createElement('p');p.className='muted';safeText(p,isPassive?'Passive tracking has no sound sources, acoustic surfaces or solver paths.':d?.reason||'No solver paths available. No visual rays are invented.');$('paths').append(p);}
  for(const p of (f?.paths||[]).filter(p=>$('show-rejected').checked||p.status==='selected').slice(0,64)){
    const style=pathStyle(p),row=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span'),reason=document.createElement('small');row.className='path';row.style.borderColor=style.color;
    safeText(title,`${style.label} · ${p.sourceId}`);safeText(detail,`${p.order} bounce(s) · ${p.delay==null?'delay unavailable':format(p.delay*1000)+' ms'} · ${p.distance==null?'distance unavailable':format(p.distance)+' model m'}`);
    safeText(reason,[p.solverStatus,p.visibility,p.reason,p.vertices?'':'no solver vertices'].filter(Boolean).join(' · '));row.append(title,detail,reason);$('paths').append(row);
  }
  if((f?.paths.length||0)>64){const p=document.createElement('p');p.className='muted';safeText(p,'First 64 path details shown; bounded canvas includes the remaining paths.');$('paths').append(p);}
}
function recordingStatus(){
  const r=serviceStatus.recording,active=r&&['recording','starting','stopping'].includes(r.state);
  $('record-start').disabled=!!active||isReplay;$('record-stop').disabled=!active||r?.state==='stopping';
  safeText($('record-status'),r?`${r.state} · ${time(r.durationMs)} · ${format((r.bytes||0)/1048576)} MiB${r.terminationReason?' · '+r.terminationReason:''}`:'Not recording');
}
async function refreshRecordings(){const {recordings=[]}=await api('/api/recordings');const selected=$('recordings').value;$('recordings').replaceChildren(new Option('Choose a local recording…',''));for(const r of recordings)$('recordings').add(new Option(`${r.id} · ${time(r.durationMs)} · ${r.state}`,r.id));$('recordings').value=selected;}
async function fetchStatus(){try{serviceStatus=await api('/api/status');connected=serviceStatus.connected===true;recordingStatus();}catch(error){connected=false;safeText($('record-status'),'Local service unavailable');}}
async function statusLoop(){await fetchStatus();setTimeout(statusLoop,1000);}
async function telemetryLoop(){
  const now=performance.now();
  if(!viewPaused&&!document.hidden){
    const playbackTime=replay.timeMs;
    if(!isReplay||pendingSeek||replay.playing||lastReplayRequest<0){
      const epoch=requestEpoch,requestStarted=performance.now();
      try{
        const query=`geometryGeneration=${encodeURIComponent(state.geometryRequestKey())}`;
        const url=isReplay?`/api/replay/frame?timeMs=${Math.round(playbackTime)}&${query}`:`/api/frame?${query}`;
        const envelope=await api(url);
        if(epoch===requestEpoch){
          const received=performance.now(),timing={requestElapsedMs:received-requestStarted};
          if(envelope.status){serviceStatus={...serviceStatus,...envelope.status};connected=envelope.status.connected===true;}
          if(!isReplay&&passive.ingest(envelope.passive,received,timing))passiveRate.mark(received);
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
bind('follow',()=>{follow=!follow;$('follow').classList.toggle('active',follow);});
bind('reset-camera',()=>{Object.assign(camera,{yaw:-.7,pitch:.65,scale:13});follow=true;$('follow').classList.add('active');});
bind('visual-toggle',()=>{viewPaused=!viewPaused;replay.lastNow=null;displayCadence.reset();displayRate.reset();safeText($('visual-toggle'),viewPaused?'Resume view':'Pause view');if(!viewPaused)pendingSeek=true;});
$('fps').addEventListener('change',()=>{fps=clampFps($('fps').value);displayCadence.setRate(fps);displayRate.reset();});
$('show-rejected').addEventListener('change',()=>{metadata(performance.now());});
$('context-file').addEventListener('change',async event=>{try{const file=event.target.files?.[0];if(!file)return;if(file.size>LIMITS.contextBytes)throw Error('Private context file exceeds 4 MiB');context=parseVisualContext(await file.text());contextSelectionKey='reload';compileContext(presentation(state,passive,performance.now(),connected));}catch(error){context=null;contextFaces=[];safeText($('context-status'),'Context rejected: '+error.message);notice(error.message,true);}});
bind('clear-context',()=>{context=null;contextFaces=[];contextSelectionKey='';$('context-file').value='';safeText($('context-status'),'None loaded · no complete buildings inferred');});
bind('popout',()=>{const popup=window.open(location.href,'RichAudioSoundMap','popup,width=1280,height=820,resizable=yes');if(!popup)throw Error('Allow this local page to open its independent SoundMap window.');});
let drag=null;
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};
  if(e.shiftKey){follow=false;$('follow').classList.remove('active');const c=Math.cos(camera.yaw),s=Math.sin(camera.yaw),v=dy/(camera.scale*Math.max(.2,Math.sin(camera.topDown?Math.PI/2:camera.pitch)));camera.target[0]-=dx*c/camera.scale-v*s;camera.target[1]-=dx*s/camera.scale+v*c;}
  else {camera.yaw+=dx*.008;camera.pitch=Math.max(.15,Math.min(1.5,camera.pitch+dy*.005));}});
canvas.addEventListener('wheel',e=>{e.preventDefault();camera.scale=Math.max(2,Math.min(80,camera.scale*Math.exp(-e.deltaY*.001)));},{passive:false});
document.addEventListener('visibilitychange',()=>{replay.lastNow=null;pendingSeek=true;displayCadence.reset();displayRate.reset();});
refreshRecordings().catch(()=>{});statusLoop();telemetryLoop().catch(error=>notice(error.message,true));requestAnimationFrame(animationLoop);
