// Uses the existing SoundMap server and UI. The browser receives GET-only
// inspection, while a separate closure-held capability publishes solver output.
import fs from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {startSoundMap} from './server.mjs';
import {requireWorld} from '../../src/acoustics/world/contracts.mjs';
export async function startReadOnlyInspection05({root,port=0,info,context,initialSample=null,canPublish=()=>false}={}){
 const service=await startSoundMap({root,port}),origin=service.descriptor.url,secret=randomBytes(32).toString('hex');
 try{
 const original=service.server.listeners('request')[0],index=await fs.readFile(new URL('./ui/index.html',import.meta.url),'utf8'),script=await fs.readFile(new URL('./xml-building-ui05.mjs',import.meta.url));
 const html=index.replace('<aside>','<aside><section id="xml05-evidence"><h2>XML building evidence</h2><p>Loading supplied evidence…</p></section>').replace('</body>','<script type="module" src="/xml-building05.mjs"></script></body>');
 const allowed=req=>req.headers.host===new URL(origin).host&&(!req.headers.origin||req.headers.origin===origin)&&req.headers['sec-fetch-site']!=='cross-site';
 const equal=(value,expected)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&timingSafeEqual(Buffer.from(value,'ascii'),Buffer.from(expected,'ascii'));
 const handler=(req,res)=>{try{
  const route=new URL(req.url,origin).pathname;
  if(!allowed(req)){res.writeHead(403);res.end('Same-origin localhost only');return;}
  if(req.method!=='GET'){if(req.method==='POST'&&route==='/api/telemetry'&&equal(req.headers['x-richaudio-publisher05'],secret)&&canPublish())return original(req,res);res.writeHead(405);res.end('Read-only XML inspection');return;}
  if(['/api/recordings','/api/record','/api/replay','/api/host'].some(p=>route.startsWith(p))){res.writeHead(405);res.end('No recording or replay in XML inspection');return;}
  if(['/xml-building05','/xml-building05.mjs','/api/xml-building05','/api/xml-context05'].includes(route)){
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'none'; object-src 'none'; frame-ancestors 'none'");
   if(route.startsWith('/api/')){if(!equal(req.headers['x-richaudio-token'],service.descriptor.token)){res.writeHead(403);res.end('Inspection token required');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(route==='/api/xml-context05'?context:info));return;}
   res.setHeader('Content-Type',route.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(route.endsWith('.mjs')?script:html);return;
  }
  return original(req,res);
 }catch{if(!res.headersSent)res.writeHead(400);res.end('Invalid inspection request');}};
 service.server.removeListener('request',original);service.server.on('request',handler);
 const publish=async sample=>{requireWorld(canPublish(),'qualified open XML view required for trusted publication');const response=await fetch(origin+'/api/telemetry',{method:'POST',headers:{'Content-Type':'application/json','X-RichAudio-Token':service.descriptor.token,'X-RichAudio-Publisher05':secret},body:JSON.stringify({frame:sample.soundMapFrame,geometry:sample.soundMapGeometry})});requireWorld(response.ok,'XML solver publication accepted');const result=await response.json();requireWorld(result.accepted===true,'fresh XML solver evidence');return result;};
 if(initialSample)await publish(initialSample);
 return {service,url:origin+'/xml-building05',publish,close:()=>service.close(),recordingEnabled:false};
 }catch(error){try{await service.close();}catch(cleanup){throw new AggregateError([error,cleanup],'Inspection startup and cleanup failed');}throw error;}
}
