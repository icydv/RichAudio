// Startup-only routing/quota around the EXISTING tile format/store. One trusted
// control host owns this directory; this is not a multiprocess cache service.
import fs from 'node:fs/promises';
import path from 'node:path';
import {privateStoragePath} from '../research/research-private-storage.mjs';
import {digest,requireWorld} from './contracts.mjs';
import {isResourceTilePlan04} from './resource-inventory04.mjs';
import {ResourceTileStore04,encodeResourceTile04} from './resource-tile-store04.mjs';
const packetLimit=524448;
export class StartupTileStoreRouter06 {
 constructor({root,directory,maximumBytes=1073741824,maximumShards=16384,maximumVersionsPerTile=8}={}){
  requireWorld(typeof root==='string'&&typeof directory==='string'&&Number.isSafeInteger(maximumBytes)&&maximumBytes>=packetLimit&&maximumBytes<=8589934592&&Number.isInteger(maximumShards)&&maximumShards>0&&maximumShards<=16384&&Number.isInteger(maximumVersionsPerTile)&&maximumVersionsPerTile>0&&maximumVersionsPerTile<=64,'startup routed cache quotas');
  this.root=path.resolve(root);this.directory=privateStoragePath(this.root,directory);this.maximumBytes=maximumBytes;this.maximumShards=maximumShards;this.maximumVersionsPerTile=maximumVersionsPerTile;this.stores=new Map();this.totalBytes=0;this.shards=0;this.initializing=null;this.initialized=false;this.publishing=false;this.loads=new Set();this.closed=false;
 }
 #store(directory){return new ResourceTileStore04(this.root,directory,{maximumFiles:this.maximumVersionsPerTile,maximumBytes:Math.min(33554432,Math.max(524288,packetLimit*this.maximumVersionsPerTile))});}
 async initialize(){
  requireWorld(!this.closed,'open startup cache router');if(this.initialized)return;if(this.initializing)return this.initializing;
  this.initializing=(async()=>{privateStoragePath(this.root,this.directory);await fs.mkdir(this.directory,{recursive:true});privateStoragePath(this.root,this.directory);const stat=await fs.lstat(this.directory);requireWorld(stat.isDirectory()&&!stat.isSymbolicLink(),'startup cache root directory');let shards=0,bytes=0;const reader=await fs.opendir(this.directory);
   try{while(true){const item=await reader.read();if(!item)break;requireWorld(++shards<=this.maximumShards&&/^[a-f0-9]{64}$/.test(item.name),'startup cache bounded shard directory');const directory=privateStoragePath(this.root,path.join(this.directory,item.name)),s=await fs.lstat(directory);requireWorld(s.isDirectory()&&!s.isSymbolicLink(),'startup cache shard type');const usage=await this.#store(directory).usage();bytes+=usage.bytes;requireWorld(bytes<=this.maximumBytes,'startup cache aggregate disk quota');}}
   finally{await reader.close();}this.totalBytes=bytes;this.shards=shards;this.initialized=true;
  })();try{await this.initializing;}finally{this.initializing=null;}
 }
 async #route(plan,{create=false}={}){
  requireWorld(isResourceTilePlan04(plan),'existing qualified tile plan for routed cache');await this.initialize();const key=digest({kind:'RichAudioStableTileShard06',tileId:plan.tileId}),directory=privateStoragePath(this.root,path.join(this.directory,key));
  if(!this.stores.has(key)){
   try{const stat=await fs.lstat(directory);requireWorld(stat.isDirectory()&&!stat.isSymbolicLink(),'routed tile directory');}
   catch(error){if(error.code!=='ENOENT')throw error;if(!create)return null;requireWorld(this.shards<this.maximumShards,'startup cache shard quota');await fs.mkdir(directory);this.shards++;}
   this.stores.set(key,this.#store(directory));
  }
  // Store objects hold paths/budgets only, never tile geometry. Bound the memo
  // independently of catalogue size; runtime geometry remains bounded by04.
  const store=this.stores.get(key);this.stores.delete(key);this.stores.set(key,store);while(this.stores.size>16)this.stores.delete(this.stores.keys().next().value);return store;
 }
 async load(plan,options={}){requireWorld(!this.closed,'open startup cache router');const work=(async()=>{const store=await this.#route(plan);return store?store.load(plan,options):{state:'not-cached',tile:null};})();this.loads.add(work);try{return await work;}finally{this.loads.delete(work);}}
 async publish(plan,tile,options={}){
  requireWorld(!this.closed&&!this.publishing,'one startup routed cache writer');this.publishing=true;
  try{const store=await this.#route(plan,{create:true}),existing=await store.load(plan,{tileDigest:tile.tileDigest});if(existing.tile)return {state:'existing-exact-artifact',published:true,bytes:encodeResourceTile04(plan,tile).length};const bytes=encodeResourceTile04(plan,tile).length;requireWorld(this.totalBytes+bytes<=this.maximumBytes,'startup cache aggregate disk quota');
   const result=await store.publish(plan,tile,options);if(result.published&&result.state==='published')this.totalBytes+=result.bytes;return result;
  }catch(error){
   // An interrupted existing04 publication can leave bounded .pending evidence.
   // Re-measure before another write, rather than under-accounting that space.
   this.initialized=false;throw error;
  }finally{this.publishing=false;}
 }
 diagnostics(){return {kind:'RichAudioStartupTileStoreRouter06',initialized:this.initialized,measuredBytes:this.totalBytes,maximumBytes:this.maximumBytes,shards:this.shards,maximumShards:this.maximumShards,maximumVersionsPerTile:this.maximumVersionsPerTile,memoizedStoreObjects:this.stores.size,geometryResidentInRouter:0,pendingLoads:this.loads.size,writerModel:'one-trusted-control-host',automaticDeletion:false};}
 async close(){requireWorld(!this.publishing&&!this.initializing&&!this.loads.size,'join coordinator/read operations before closing startup cache router');this.closed=true;this.stores.clear();}
}
