// Only renders a server-validated original subset. Never opens a local file,
// publishes geometry, traces a ray or invokes an audio API.
const panel=document.getElementById('building042-evidence');
const add=(parent,tag,text)=>{const element=document.createElement(tag);element.textContent=text;parent.append(element);return element;};
try{
  const session=await(await fetch('/api/session')).json();
  const response=await fetch('/api/supplied-building042',{headers:{'X-RichAudio-Token':session.token}});
  if(!response.ok)throw Error('Evidence unavailable');
  const info=await response.json();
  if(info.kind!=='RichAudioSuppliedBuildingView042'||info.authority!=='original-authored-fixture-only'||info.realExportApproved!==false)throw Error('Unqualified evidence');
  panel.replaceChildren();add(panel,'h2','Supplied building evidence');
  add(panel,'p','Original authored building fixtures · real exports remain unqualified.');
  add(panel,'p','Finite supplied geometry only. Outside coverage is unknown. Acoustic material response is assumed.');
  for(const building of info.buildings){
    add(panel,'h3',building.id+' · '+building.tileId);
    add(panel,'p','Model scale: '+building.scale.join(', ')+' · frame: '+building.inputFrame);
    add(panel,'p','Translation: '+building.translation.join(', ')+' · quaternion: '+building.rotation.join(', '));
    add(panel,'p','Calibration: '+building.calibration.controls.length+' authored control points; native scale unverified.');
    const topology=building.interiorQualification??[];
    add(panel,'p',building.interiorDigest?'Static rooms: '+topology.flatMap(t=>t.rooms).map(r=>r.id+' ('+r.completeness+')').join(', ')+'; runtime activation unknown.':'Room and portal topology not supplied.');
    for(const unknown of topology.flatMap(t=>t.unknown))add(panel,'p',unknown.includes('triangle-footprint-room-references-not-qualified')?'Room surface references remain unqualified; no connectivity is inferred.':'Additional room information is unknown.');
  }
  const resources=add(panel,'details','');add(resources,'summary','Exact resource identities ('+info.resources.length+')');
  for(const resource of info.resources){
    add(resources,'p',resource.kind.toUpperCase()+' · '+resource.logicalArchive+'/'+resource.logicalMember+' · '+resource.mount);
    const code=add(resources,'code',resource.sourceSHA256);code.style.overflowWrap='anywhere';code.style.fontSize='10px';
  }
  const recording=document.getElementById('record-start')?.closest('section');if(recording)recording.hidden=true;
  const context=document.getElementById('context-file')?.closest('section');if(context)context.hidden=true;
  const footer=document.querySelector('footer');if(footer)footer.hidden=true;
  // Preserve the existing viewer's opt-in cache checkbox and native/solver
  // alignment checks. Nothing here changes its scene or solver evidence.
}catch{panel.replaceChildren();add(panel,'h2','Supplied building evidence');add(panel,'p','No qualified supplied subset is available.');}
