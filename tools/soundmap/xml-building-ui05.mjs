const panel=document.getElementById('xml05-evidence');
const add=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;panel.append(e);return e;};
try{
 const {token}=await(await fetch('/api/session')).json(),headers={'X-RichAudio-Token':token};
 const [info,context]=await Promise.all(['/api/xml-building05','/api/xml-context05'].map(async url=>{const r=await fetch(url,{headers});if(!r.ok)throw Error('Unavailable');return r.json();}));
 if(info?.kind!=='RichAudioXmlBuildingView05'||info.viewerCanPublishAcoustics!==false)throw Error('Unqualified inspection declaration');
 panel.replaceChildren();add('h2','XML building evidence');add('p',info.originalFixture?'Original CodeWalker XML fixture. No genuine Los Santos building is claimed.':info.qualified?'Supplied XML export bound to a separate review policy. Origin is not certified here.':'Supplied XML inspection. Provenance remains unqualified.');
 add('p',info.qualified?'Offline static geometry admitted under an exact pinned review policy. Runtime activation is unverified.':'UNQUALIFIED inspection geometry. No acoustic scene or solver paths are published.');
 for(const b of info.buildings){add('h3',b.buildingId+' · '+b.tileId);add('p','Position: '+b.position.join(', ')+' · stored quaternion: '+b.storedQuaternion.join(', '));add('p','Scale: '+b.scale.join(', ')+' · collision frame: '+b.collisionFrame);add('p','Tile: '+b.bounds.min.join(', ')+' → '+b.bounds.max.join(', '));}
 add('p','Outside represented geometry is unknown. Native materials retain their identities; acoustic response is an explicit assumption.');
 for(const u of info.unknown)add('p','Unknown geometry: '+u);
 const details=add('details','');const summary=document.createElement('summary');summary.textContent='Exact XML and original member identities ('+info.resources.length+')';details.append(summary);
 for(const r of info.resources){const p=document.createElement('p');p.textContent=r.kind.toUpperCase()+' · '+r.logicalArchive+'/'+r.logicalMember+' · XML SHA-256 '+r.xmlSHA256;p.style.overflowWrap='anywhere';details.append(p);}
 for(const id of ['record-start','context-file','show-cache-world']){const element=document.getElementById(id)?.closest('section');if(element)element.hidden=true;}
 const footer=document.querySelector('footer');if(footer)footer.hidden=true;
 window.dispatchEvent(new CustomEvent('richaudio-inspection-context05',{detail:context}));
 if(!info.qualified){document.getElementById('scene-title').textContent='Unqualified XML inspection';}
}catch{panel.replaceChildren();add('h2','XML building evidence');add('p','No accepted XML inspection is available.');}
