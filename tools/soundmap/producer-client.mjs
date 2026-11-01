// Only one transfer may be outstanding. The producer never waits for networking.
import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
export function readServiceConfiguration(filename){
  const full=path.resolve(filename);if(path.basename(full)!=='service.json'||path.basename(path.dirname(full))!=='soundmap'||path.basename(path.dirname(path.dirname(full)))!=='.local')throw Error('Private .local/soundmap/service.json required');
  for(let current=full;;current=path.dirname(current)){if(fs.lstatSync(current).isSymbolicLink())throw Error('Linked SoundMap descriptor rejected');if(path.dirname(current)===current)break;}
  const info=fs.lstatSync(filename);if(!info.isFile()||info.isSymbolicLink()||info.size>4096)throw Error('Bounded private SoundMap descriptor required');
  const config=JSON.parse(fs.readFileSync(filename,'utf8')),url=new URL(config.url);
  if(config.schemaVersion!==1||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.search||url.hash||url.username||url.password||!/^\w{64}$/.test(config.token)||!/^[a-f0-9]+$/.test(config.token))throw Error('Private SoundMap descriptor invalid');
  return config;
}
export class SoundMapClient {
  constructor(filename){this.busy=false;this.closed=false;this.geometry=null;this.sentGeometry=null;this.events=[];this.currentEvent=null;this.stats={offered:0,sent:0,sentFrames:0,sentEvents:0,dropped:0,errors:0,droppedEvents:0};
    const config=readServiceConfiguration(filename);this.worker=new Worker(new URL('./producer-network-worker.mjs',import.meta.url),{workerData:{...config,filename}});
    this.worker.on('message',m=>{this.busy=false;if(m.ok){this.stats.sent++;this.stats[this.currentEvent?'sentEvents':'sentFrames']++;}else{this.stats.errors++;this.sentGeometry=null;if(this.currentEvent)this.stats.droppedEvents++;}this.currentEvent=null;this.drainEvents();});
    this.worker.on('error',()=>{this.busy=false;this.closed=true;this.stats.errors++;});this.worker.unref();
  }
  offer(frame,geometry){
    if(geometry)this.geometry=geometry;if(!frame)return false;this.stats.offered++;
    if(this.busy||this.closed){this.stats.dropped++;return false;}this.busy=true;
    const g=this.geometry?.generation===frame.geometryGeneration&&this.sentGeometry!==frame.geometryGeneration?this.geometry:null;
    this.worker.postMessage({route:'/api/telemetry',body:{frame:{...frame,transport:{...this.stats}},geometry:g}});if(g)this.sentGeometry=g.generation;return true;
  }
  drainEvents(){if(this.busy||this.closed||!this.events.length)return;this.busy=true;this.currentEvent=this.events.shift();this.worker.postMessage({route:'/api/producer/event',body:{...this.currentEvent,transport:{...this.stats}}});}
  event(event){if(this.closed||this.events.length>=16){this.stats.droppedEvents++;return;}this.events.push(event);this.drainEvents();}
  async close(){const end=performance.now()+500;while((this.busy||this.events.length)&&performance.now()<end)await new Promise(resolve=>setTimeout(resolve,5));this.stats.droppedEvents+=this.events.length+(this.currentEvent?1:0);this.closed=true;await this.worker.terminate();}
}
