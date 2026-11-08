import {atlasFormat01,atlasPageMagic01,atlasVertexStride01,atlasHeaderBytes01} from './atlas-format01.mjs';

const MiB=1048576,detailBudget=192*MiB,parallel=3;
const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
const groupKey=(tile,lod)=>tile.id+':'+lod;
const centre=b=>b.min.map((n,i)=>(n+b.max[i])/2);
const extents=b=>b.min.map((n,i)=>(b.max[i]-n)/2);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

export function decodeAtlasPage01(array,p,offset=0){
 const header=new DataView(array,offset,p.bytes),nv=header.getUint32(4,true),nt=header.getUint32(8,true),nr=header.getUint32(12,true);
 const vertexBytes=nv*atlasVertexStride01,indexBytes=nt*12;
 if(header.getUint32(0,true)!==atlasPageMagic01||nv!==p.vertices||nt!==p.triangles||nr<1||nr>nt||
    atlasHeaderBytes01+vertexBytes+indexBytes+nr*12!==p.bytes||vertexBytes+indexBytes!==p.gpuBytes)throw Error('Atlas page format mismatch');
 const at=offset+atlasHeaderBytes01;
 return {vertices:new Uint8Array(array,at,vertexBytes),indices:new Uint8Array(array,at+vertexBytes,indexBytes),triangles:nt};
}

export function atlasView01(camera,bounds){
 const s=Math.sin(camera.yaw),c=Math.cos(camera.yaw),pitch=camera.topDown?Math.PI/2:camera.pitch,sp=Math.sin(pitch),cp=Math.cos(pitch);
 const ySign=camera.topDown&&camera.northUpAtlas?-1:1;
 const right=[c,s,0],up=[s*sp*ySign,-c*sp*ySign,cp*ySign],near=[-s*cp,c*cp,sp];
 const x=camera.width/(2*camera.scale),y=camera.height/(2*camera.scale);
 const g=centre(bounds),distance=g.map((v,i)=>v-camera.target[i]);
 const depth=Math.max(1,Math.abs(dot(distance,near))+dot(extents(bounds),near.map(Math.abs))+1);
 return {target:camera.target,right,up,near,x,y,depth};
}

function visible(tile,v,pad=1){
 const d=tile.centre.map((n,i)=>n-v.target[i]);
 return Math.abs(dot(d,v.right))<=v.x*pad+dot(tile.extent,v.right.map(Math.abs))&&
        Math.abs(dot(d,v.up))<=v.y*pad+dot(tile.extent,v.up.map(Math.abs));
}

export function planAtlasView01(tiles,camera,bounds,heading,budget=detailBudget){
 const v=atlasView01(camera,bounds),visibleTiles=[],candidates=[];
 for(const tile of tiles){
  const inView=visible(tile,v);
  if(inView)visibleTiles.push(tile);
  const [x,y]=camera.target,dx=tile.centre[0]-x,dy=tile.centre[1]-y;
  // Distance to a tile's true bounds, rather than its cell center.
  const distance=Math.hypot(Math.max(0,Math.abs(dx)-tile.extent[0]),Math.max(0,Math.abs(dy)-tile.extent[1]));
  const ahead=heading?Math.hypot(dx-heading[0]*320,dy-heading[1]*320):Infinity;
  if(camera.scale<.14||!inView&&distance>370&&ahead>280)continue;
  const lod=camera.scale>=2.5&&distance<=385?2:1;
  const score=(inView?0:1000)+distance-Math.max(0,280-ahead)*.4;
  candidates.push({tile,lod,score,inView});
 }
 candidates.sort((a,b)=>a.score-b.score);
 let remaining=budget;
 const wants=new Map();
 for(const {tile,lod,inView} of candidates){
  const fallback=lod===2?1:lod;
  const level=tile.cost[lod]<=remaining?lod:inView&&tile.cost[fallback]<=remaining?fallback:0;
  if(level){remaining-=tile.cost[level];wants.set(tile.id,level);}
 }
 return {v,visibleTiles,wants};
}

const vertex=`#version 300 es
layout(location=0) in vec3 xyz;
layout(location=1) in uint tag;
uniform vec3 target, right, up, near;
out vec3 world;
flat out uint group;
flat out uint material;
void main(){
  vec3 delta=xyz-target;
  world=xyz;
  group=tag>>24u;
  material=tag&16777215u;
  // Give coincident layer-zero surfaces a stable visual depth tie-break.
  // Neither the stored positions nor acoustic geometry change.
  gl_Position=vec4(dot(delta,right),dot(delta,up),-dot(delta,near)+float(group)*0.00000024,1.);
}`;
const fragment=`#version 300 es
precision highp float;
precision highp int;
in vec3 world;
flat in uint group;
flat in uint material;
uniform int mode;
out vec4 pixel;
void main(){
  if((mode==1&&group!=0u)||(mode==2&&group!=3u)||(mode>=3&&group!=uint(mode-2)))discard;
  vec3 normal=normalize(cross(dFdx(world),dFdy(world)));
  float shade=.50+.50*abs(dot(normal,normalize(vec3(-.35,.42,.83))));
  vec3 base=group==0u?vec3(.38,.64,.69):group==1u?vec3(.74,.50,.27):group==2u?vec3(.59,.46,.75):group==3u?vec3(.32,.70,.56):vec3(.57,.58,.62);
  float materialShade=.83+.17*float((material*2654435761u)>>28u)/15.;
  pixel=vec4(base*shade*materialShade,1.);
}`;

function programFor(gl){
 const program=gl.createProgram();
 try{
  for(const [kind,text] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
   const shader=gl.createShader(kind);gl.shaderSource(shader,text);gl.compileShader(shader);
   const error=gl.getShaderInfoLog(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);throw Error(error);}
   gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  return program;
 }catch(e){gl.deleteProgram(program);throw e;}
}

export class AtlasRenderer01{
 constructor(canvas,{getIndex,getPage}){
  this.canvas=canvas;this.getIndex=getIndex;this.getPage=getPage;this.initAt=performance.now();
  this.stats={overviewTriangles:0,overviewPages:0,visibleTriangles:0,visibleTiles:0,visibleDetailedTiles:0,drawCalls:0,
   uploads:0,uploadMs:0,evictions:0,hits:0,misses:0,fetchFailures:0,detailBytes:0,overviewBytes:0,pendingUploadBytes:0,peakPendingUploadBytes:0,
   gpuMs:null,drawCpuMs:null,startupMs:null,overviewCompleteMs:null,budgetLimitedTiles:0};
  this.groups=new Map();this.overview=new Map();this.failures=new Map();this.uploadQueue=[];this.gpuQueries=[];
  this.loading=0;this.reserved=0;this.clock=0;this.generation=0;this.mode=0;
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.clear('WebGL context lost');});
  canvas.addEventListener('webglcontextrestored',()=>{void this.start();});
 }
 clear(error){
  this.generation++;this.error=error;this.groups.clear();this.overview.clear();this.failures.clear();
  for(const item of this.uploadQueue.splice(0))item.reject(Error(error));
  this.gpuQueries.length=0;this.loading=0;this.reserved=0;
  Object.assign(this.stats,{detailBytes:0,overviewBytes:0,overviewTriangles:0,overviewPages:0,gpuMs:null,overviewCompleteMs:null,pendingUploadBytes:0});
 }
 async start(){
  const epoch=++this.generation;
  try{
   this.gl=this.canvas.getContext('webgl2',{antialias:true,depth:true,alpha:false,powerPreference:'high-performance'});
   if(!this.gl)throw Error('WebGL2 unavailable; atlas geometry cannot be displayed');
   const gl=this.gl;this.program=programFor(gl);
   this.locations=Object.fromEntries(['target','right','up','near','mode'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
   this.timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
   gl.enable(gl.DEPTH_TEST);gl.clearColor(.04,.055,.08,1);
   const data=await this.getIndex();if(epoch!==this.generation)return;
   if(data.format!==atlasFormat01||!data.tiles?.length||!data.overview?.length)throw Error('Unsupported atlas index');
   this.index=data;this.error=null;
   this.tiles=data.tiles.map(t=>({...t,centre:centre(t.bounds),extent:extents(t.bounds),cost:t.pages.map(p=>sum(p,'gpuBytes'))}));
   this.tilesById=new Map(this.tiles.map(t=>[t.id,t]));
   const byPack=data.overview.map(()=>[]);
   for(const t of this.tiles)for(const page of t.pages[0])byPack[page.pack].push({t,page});
   this.stats.startupMs=performance.now()-this.initAt;
   for(const [i,f] of data.overview.entries()){
    const bytes=await this.getPage(f.name);if(epoch!==this.generation)return;
    if(bytes.byteLength!==f.bytes)throw Error('Atlas overview pack length mismatch');
    await Promise.all(byPack[i].map(async ({t,page})=>{
     const mesh=await this.stage(page,bytes,page.offset,epoch);
     if(epoch!==this.generation)return;
     const held=this.overview.get(t.id)??[];held.push(mesh);this.overview.set(t.id,held);
     this.stats.overviewBytes+=page.gpuBytes;this.stats.overviewTriangles+=page.triangles;this.stats.overviewPages++;
    }));
   }
   this.stats.overviewCompleteMs=performance.now()-this.initAt;
  }catch(e){if(epoch===this.generation)this.error=e.message;}
 }
 stage(page,bytes,offset,epoch){
  return new Promise((resolve,reject)=>{
   if(epoch!==this.generation){reject(Error('Stale WebGL context'));return;}
   this.uploadQueue.push({page,data:decodeAtlasPage01(bytes,page,offset),resolve,reject});
   this.stats.pendingUploadBytes+=page.bytes;this.stats.peakPendingUploadBytes=Math.max(this.stats.peakPendingUploadBytes,this.stats.pendingUploadBytes);
  });
 }
 upload(item){
  const gl=this.gl,{data,page}=item,at=performance.now(),vao=gl.createVertexArray(),v=gl.createBuffer(),i=gl.createBuffer();
  try{
   if(!vao||!v||!i)throw Error('WebGL mesh allocation failed');
   gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,v);gl.bufferData(gl.ARRAY_BUFFER,data.vertices,gl.STATIC_DRAW);
   gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,atlasVertexStride01,0);
   gl.enableVertexAttribArray(1);gl.vertexAttribIPointer(1,1,gl.UNSIGNED_INT,atlasVertexStride01,12);
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,i);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
   if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL mesh upload failed');
   this.stats.uploads++;this.stats.uploadMs+=performance.now()-at;
   return {vao,v,i,triangles:data.triangles,bytes:page.gpuBytes};
  }catch(e){gl.deleteVertexArray(vao);gl.deleteBuffer(v);gl.deleteBuffer(i);throw e;}
 }
 drop(mesh){
  const gl=this.gl;gl.deleteVertexArray(mesh.vao);gl.deleteBuffer(mesh.v);gl.deleteBuffer(mesh.i);
 }
 reserve(bytes,wants){
  const candidates=[...this.groups.values()].filter(g=>!g.loading&&wants.get(g.tile)!==g.lod).sort((a,b)=>a.used-b.used);
  for(const old of candidates){
   if(this.stats.detailBytes+this.reserved+bytes<=detailBudget)break;
   this.groups.delete(old.key);for(const mesh of old.meshes)this.drop(mesh);this.stats.detailBytes-=old.cost;this.stats.evictions++;
  }
  return this.stats.detailBytes+this.reserved+bytes<=detailBudget;
 }
 async load(tile,lod){
  const epoch=this.generation,key=groupKey(tile,lod),cost=tile.cost[lod],meshes=[];
  const group={key,tile:tile.id,lod,cost,meshes,loading:true,used:this.clock};
  this.groups.set(key,group);this.loading++;this.reserved+=cost;this.stats.misses++;
  try{
   for(const p of tile.pages[lod]){
    const bytes=await this.getPage(p.name);
    if(epoch!==this.generation)return;
    if(bytes.byteLength!==p.bytes)throw Error('Atlas detail page length mismatch');
    meshes.push(await this.stage(p,bytes,0,epoch));
    if(epoch!==this.generation)return;
   }
   group.loading=false;this.stats.detailBytes+=cost;
  }catch(e){
   if(epoch!==this.generation)return;
   for(const mesh of meshes)this.drop(mesh);
   this.groups.delete(key);this.stats.fetchFailures++;this.failures.set(key,e.message);
  }finally{if(epoch===this.generation){this.loading--;this.reserved-=cost;}}
 }
 measureGPU(){
  const gl=this.gl,t=this.timer;
  if(!t)return null;
  if(gl.getParameter(t.GPU_DISJOINT_EXT)){
   for(const q of this.gpuQueries)gl.deleteQuery(q);this.gpuQueries.length=0;this.stats.gpuMs=null;return null;
  }
  while(this.gpuQueries.length&&gl.getQueryParameter(this.gpuQueries[0],gl.QUERY_RESULT_AVAILABLE)){
   const q=this.gpuQueries.shift();this.stats.gpuMs=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);
  }
  if(this.clock%12||this.gpuQueries.length>=3)return null;
  const q=gl.createQuery();if(q)gl.beginQuery(t.TIME_ELAPSED_EXT,q);return q;
 }
 render(camera,heading){
  const gl=this.gl;if(!gl||gl.isContextLost()||!this.program)return;
  const began=performance.now();this.clock++;
  // Upload small overview pages in batches; yield after a large detail page.
  let uploaded=0;
  while(this.uploadQueue.length&&uploaded<4*MiB&&performance.now()-began<4){
   const item=this.uploadQueue.shift();uploaded+=item.page.bytes;this.stats.pendingUploadBytes-=item.page.bytes;
   try{item.resolve(this.upload(item));}catch(e){item.reject(e);}
  }
  gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  if(!this.index)return;
  const plan=planAtlasView01(this.tiles,camera,this.index.bounds,heading),byId=this.tilesById;
  this.stats.budgetLimitedTiles=0;
  // Finish the disk-prebuilt overview first; detailed loads never remove it.
  if(this.stats.overviewCompleteMs!==null)for(const [id,lod] of plan.wants){
   if(this.loading>=parallel)break;
   const tile=byId.get(id),key=groupKey(tile,lod);
   if(this.groups.has(key)||this.failures.has(key))continue;
   if(this.reserve(tile.cost[lod],plan.wants))void this.load(tile,lod);else this.stats.budgetLimitedTiles++;
  }
  const v=plan.v,u=this.locations;
  gl.useProgram(this.program);gl.uniform3fv(u.target,v.target);
  gl.uniform3fv(u.right,v.right.map(n=>n/v.x));gl.uniform3fv(u.up,v.up.map(n=>n/v.y));gl.uniform3fv(u.near,v.near.map(n=>n/v.depth));gl.uniform1i(u.mode,this.mode);
  const query=this.measureGPU();
  let triangles=0,tiles=0,detail=0,calls=0;
  const heldKeys=new Set();
  for(const t of plan.visibleTiles){
   const requested=plan.wants.get(t.id)??0,group=[requested,...(requested===2?[1]:[])].map(lod=>this.groups.get(groupKey(t,lod))).find(g=>g&&!g.loading);
   if(group){
    if(group.everDrawn&&!this.lastHeldKeys?.has(group.key))this.stats.hits++;
    group.everDrawn=true;group.used=this.clock;heldKeys.add(group.key);detail++;
   }
   const meshes=group?.meshes??this.overview.get(t.id);if(!meshes?.length)continue;
   tiles++;for(const m of meshes){gl.bindVertexArray(m.vao);gl.drawElements(gl.TRIANGLES,m.triangles*3,gl.UNSIGNED_INT,0);triangles+=m.triangles;calls++;}
  }
  if(query){gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.gpuQueries.push(query);}
  this.lastHeldKeys=heldKeys;
  Object.assign(this.stats,{visibleTriangles:triangles,visibleTiles:tiles,visibleDetailedTiles:detail,drawCalls:calls,drawCpuMs:performance.now()-began});
 }
 snapshot(){return {...this.stats,error:this.error??null,lastDetailError:[...this.failures.values()].at(-1)??null,detailBudget,loading:this.loading,reservedBytes:this.reserved};}
}
