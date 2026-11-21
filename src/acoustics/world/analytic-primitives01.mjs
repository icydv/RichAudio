// RichAudio-authored analytic normalization and local-workset approximation.
// Parameter semantics: CodeWalker Bounds.cs / Utils/Vectors.cs at upstream
// 485d56bec00262ed7fa472261cce7bbc6202b96e. No vendor code is copied here.
// Native indexed endpoints/radius are transformed in the SAME center-before-
// SharpDX-row-vector leaf-to-root convention as collision-mesh.mjs. Compact
// records preserve affine ellipsoids/sheared cylinders instead of assuming a
// world-space scalar radius. No IO, archive decoder or PCM work occurs here.
import {matrix,resourcePoint,determinant3,triangleNormal} from './collision-mesh.mjs';
const kinds=new Set(['Sphere','Capsule','Cylinder']),MAX=1e9;
const requirePrimitive=(yes,message)=>{if(!yes)throw Error(message);};
const vec=v=>{requirePrimitive(Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=MAX),'finite analytic vector');return [...v];};
const sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),scale=(a,k)=>a.map(x=>x*k),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a);
const uint=x=>Number.isSafeInteger(x)&&x>=0&&x<=0xffffffff;
function frame(a,b,family){if(family==='Sphere')return [[1,0,0],[0,1,0],[0,0,1]];const delta=sub(b,a),length=norm(delta);requirePrimitive(length>1e-8,'nondegenerate analytic axis');const w=scale(delta,1/length),reference=Math.abs(w[0])<.8?[1,0,0]:[0,1,0],u0=cross(reference,w),u=scale(u0,1/norm(u0));return [u,cross(w,u),w];}
function radiusBound(axes){const row=Math.max(...axes.map(a=>a.reduce((n,x)=>n+Math.abs(x),0))),column=Math.max(...[0,1,2].map(i=>axes.reduce((n,a)=>n+Math.abs(a[i]),0)));return Math.sqrt(row*column);}
function extent(axes,family){return [0,1,2].map(i=>Math.hypot(...axes.slice(0,family==='Cylinder'?2:3).map(a=>a[i])));}
function primitiveBounds(a,b,axes,family){const e=extent(axes,family);return {min:a.map((x,i)=>Math.min(x,b?.[i]??x)-e[i]),max:a.map((x,i)=>Math.max(x,b?.[i]??x)+e[i])};}
function validate(p){
 requirePrimitive(p?.schema===1&&p.kind==='RichAudioAnalyticPrimitive01'&&kinds.has(p.family)&&Number.isSafeInteger(p.node)&&p.node>=0&&Number.isSafeInteger(p.polygon)&&p.polygon>=0,'compact analytic identity');
 const a=vec(p.a),b=p.b===null?null:vec(p.b);requirePrimitive((p.family==='Sphere')===(b===null)&&Array.isArray(p.radiusAxes)&&p.radiusAxes.length===3,'compact analytic shape');const axes=p.radiusAxes.map(vec),r=radiusBound(axes);
 requirePrimitive(Number.isFinite(r)&&r>1e-8&&r<=MAX&&Math.abs(dot(axes[0],cross(axes[1],axes[2])))>Math.pow(r,3)*1e-12,'nondegenerate affine analytic radius');
 requirePrimitive(Number.isInteger(p.materialType)&&p.materialType>=0&&p.materialType<=255&&Number.isInteger(p.materialSlot)&&p.materialSlot>=0&&uint(p.data1)&&uint(p.data2)&&(p.data1&255)===p.materialType&&(p.affineOrientation===1||p.affineOrientation===-1),'analytic native material/orientation');
 const bounds=primitiveBounds(a,b,axes,p.family);requirePrimitive(bounds.min.every((x,i)=>Number.isFinite(x)&&Number.isFinite(bounds.max[i])&&Math.abs(x)<=MAX&&Math.abs(bounds.max[i])<=MAX),'bounded analytic extent');
 if(p.bounds!==undefined)requirePrimitive(JSON.stringify(p.bounds)===JSON.stringify(bounds),'analytic bounds derivation');
 return {a,b,axes,r,bounds};
}
export function validateAnalyticPrimitive01(primitive){validate(primitive);return primitive;}
export const analyticPrimitiveRevision01='native-indexed-affine-compact-v1';
export function collectAnalyticPrimitives01(raw,{maximumRecords=65536,cellSize=64}={}){
 requirePrimitive(raw?.schema===1&&raw.kind==='CodeWalkerYbnMesh'&&Array.isArray(raw.nodes)&&raw.nodes.length<=65536&&Number.isInteger(maximumRecords)&&maximumRecords>=1&&maximumRecords<=65536&&Number.isFinite(cellSize)&&cellSize>=1&&cellSize<=1024,'bounded normalized analytic collection');
 const nodes=new Map(),primitives=[],cells=new Map(),overflowChunks=[],counts={candidatePolygons:0,represented:0,invalidOrUnsupported:0,recordBudgetOmitted:0},families={};let references=0;
 for(let ni=0;ni<raw.nodes.length;ni++){
  const n=raw.nodes[ni],polygons=n.polygons??[],vertices=n.vertices??[];requirePrimitive(typeof n.id==='string'&&!nodes.has(n.id)&&(n.parent===null||nodes.has(n.parent))&&Array.isArray(polygons)&&Array.isArray(vertices),'ordered normalized primitive nodes');
  nodes.set(n.id,n);const chain=[n.transform];for(let id=n.parent;id!==null;id=nodes.get(id).parent){chain.push(nodes.get(id).transform);requirePrimitive(chain.length<=64,'bounded primitive transform hierarchy');}
  for(let pi=0;pi<polygons.length;pi++){
   const polygon=polygons[pi];if(!kinds.has(polygon?.family))continue;counts.candidatePolygons++;
   if(primitives.length>=maximumRecords){counts.recordBudgetOmitted++;continue;}
   const normalized=normalizeAnalyticPrimitive01({polygon,vertices,center:n.center??[0,0,0],leafToRoot:chain,node:ni,polygonIndex:pi,materials:n.materials});if(normalized.state!=='supported-analytic'){counts.invalidOrUnsupported++;continue;}
   const primitive=normalized.primitive,index=primitives.length;primitives.push(primitive);counts.represented++;families[primitive.sourceFamily]=(families[primitive.sourceFamily]??0)+1;
   const lo=primitive.bounds.min.map(x=>Math.floor(x/cellSize)),hi=primitive.bounds.max.map(x=>Math.floor(x/cellSize)),number=lo.reduce((value,x,i)=>value*(hi[i]-x+1),1);
   if(number>512||references+number>2000000){overflowChunks.push(index);continue;}
   let exceeded=false;for(let x=lo[0];x<=hi[0]&&!exceeded;x++)for(let y=lo[1];y<=hi[1]&&!exceeded;y++)for(let z=lo[2];z<=hi[2];z++){const key=x+','+y+','+z;let row=cells.get(key);if(!row){if(cells.size>=262144){exceeded=true;break;}cells.set(key,row=[]);}row.push(index);references++;}
   if(exceeded)overflowChunks.push(index);
  }
 }
 return {schema:1,kind:'RichAudioCompactAnalyticPrimitives01',revision:analyticPrimitiveRevision01,sourceSHA256:raw.source?.sha256,cellSize,primitives,cells:Object.fromEntries(cells),overflowChunks,counts,families,maximumRecords,coordinateSpace:'resource-root',errorBasis:'decoded-affine-geometry; native-unit/metre-assumption-unverified'};
}
export function normalizeAnalyticPrimitive01({polygon,vertices,center=[0,0,0],leafToRoot,node,polygonIndex,materials}={}){
 let conservativeBounds=null;
 try{
  requirePrimitive(kinds.has(polygon?.family)&&Array.isArray(vertices)&&vertices.length<=2000000&&Array.isArray(leafToRoot)&&leafToRoot.length>=1&&leafToRoot.length<=64,'supported normalized analytic input');
  leafToRoot.forEach(matrix);center=vec(center);const count=polygon.family==='Sphere'?1:2;requirePrimitive(Array.isArray(polygon.indices)&&polygon.indices.length===count&&polygon.indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<vertices.length),'analytic native vertex references');
  const local=polygon.indices.map(i=>vec(vertices[i])),radius=polygon.radius;requirePrimitive(Number.isFinite(radius)&&radius>0&&radius<=MAX,'positive analytic native radius');
  let family=polygon.family;if(family==='Capsule'&&norm(sub(local[1],local[0]))<=1e-8)family='Sphere';
  const basis=frame(local[0],local[1],family),a=resourcePoint(local[0],center,leafToRoot),b=family==='Sphere'?null:resourcePoint(local[1],center,leafToRoot),radiusAxes=basis.map(axis=>sub(resourcePoint(add(local[0],scale(axis,radius)),center,leafToRoot),a));
  conservativeBounds=primitiveBounds(a,b,radiusAxes,family);
  const slot=polygon.materialSlot,m=materials?.[slot];requirePrimitive(Number.isInteger(slot)&&slot>=0&&m,'analytic native material reference');
  const primitive={schema:1,kind:'RichAudioAnalyticPrimitive01',family,node,polygon:polygonIndex,a,b,radiusAxes,affineOrientation:Math.sign(leafToRoot.reduce((n,transform)=>n*determinant3(transform),1)),materialType:m.type,materialSlot:slot,data1:m.data1,data2:m.data2,coordinateSpace:'resource-root',transformConvention:'SharpDX-row-vector-leaf-to-root-center-before-transform',sourceFamily:polygon.family};
  const checked=validate(primitive);primitive.bounds=checked.bounds;return {state:'supported-analytic',primitive};
 }catch(error){return {state:'unknown',reason:String(error.message).slice(0,160),bounds:conservativeBounds};}
}

export function tessellateAnalyticPrimitive01(primitive,{maximumErrorMetres=.05,maximumTriangles=2048}={}){
 requirePrimitive(Number.isFinite(maximumErrorMetres)&&maximumErrorMetres>=.001&&maximumErrorMetres<=.25&&Number.isInteger(maximumTriangles)&&maximumTriangles>=8&&maximumTriangles<=16384,'bounded analytic approximation controls');
 const {a,b,axes,r,bounds}=validate(primitive),sphere=primitive.family==='Sphere',cylinder=primitive.family==='Cylinder';
 if(r<1e-5)return {state:'unknown',reason:'analytic-below-finite-facet-resolution',bounds,maximumErrorMetres,triangles:[]};
 // For spherical charts every second directional derivative is <=2R.
 // Triangle interpolation error is conservatively <=R/2*(dTheta^2+dPhi^2).
 // R bounds the affine map's spectral norm, preserving nonuniform/shear scale.
 const h=Math.sqrt(maximumErrorMetres/r),longitude=cylinder?Math.max(8,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-maximumErrorMetres/r)))):Math.max(8,Math.ceil(2*Math.PI/h)),latitude=Math.max(2,Math.ceil(Math.PI/h)),hemisphere=Math.max(1,Math.ceil((Math.PI/2)/h));
 const required=cylinder?4*longitude:sphere?2*longitude*(latitude-1):4*hemisphere*longitude;
 if(!Number.isFinite(required)||required>maximumTriangles||longitude>512||latitude>256)return {state:'unknown',reason:'analytic-local-triangle-or-error-budget',bounds,requiredTriangles:Number.isFinite(required)?required:null,maximumErrorMetres,triangles:[]};
 const bound=cylinder?r*(1-Math.cos(Math.PI/longitude)):r/2*(Math.pow(2*Math.PI/longitude,2)+Math.pow((sphere?Math.PI/latitude:Math.PI/2/hemisphere),2));
 requirePrimitive(bound<=maximumErrorMetres+1e-12,'analytic approximation error proof');
 const triangles=[],inside=b?a.map((x,i)=>(x+b[i])/2):a;
 const radial=(center,theta,phi=0)=>add(center,add(scale(axes[0],Math.cos(theta)*Math.cos(phi)),add(scale(axes[1],Math.sin(theta)*Math.cos(phi)),scale(axes[2],Math.sin(phi)))));
 function addTriangle(p0,p1,p2){let positions=[p0,p1,p2],normal=triangleNormal(positions);requirePrimitive(normal,'nondegenerate analytic facet');const middle=[0,1,2].map(i=>(p0[i]+p1[i]+p2[i])/3);if(dot(normal,sub(middle,inside))<0){positions=[p0,p2,p1];normal=scale(normal,-1);}triangles.push({positions,normal,node:primitive.node,polygon:primitive.polygon,materialType:primitive.materialType,materialSlot:primitive.materialSlot,data1:primitive.data1,data2:primitive.data2,primitiveFamily:primitive.family,analyticFace:triangles.length,approximationErrorMetres:bound});}
 function band(center,lo,hi,poleLo=false,poleHi=false){for(let n=0;n<longitude;n++){const x=n*2*Math.PI/longitude,y=(n+1)*2*Math.PI/longitude,p=radial(center,x,lo),q=radial(center,y,lo),s=radial(center,x,hi),t=radial(center,y,hi);if(poleLo)addTriangle(p,t,s);else if(poleHi)addTriangle(p,q,s);else{addTriangle(p,q,t);addTriangle(p,t,s);}}}
 try{
  if(sphere){for(let j=0;j<latitude;j++)band(a,-Math.PI/2+j*Math.PI/latitude,-Math.PI/2+(j+1)*Math.PI/latitude,j===0,j===latitude-1);}
  else{
   for(let n=0;n<longitude;n++){const x=n*2*Math.PI/longitude,y=(n+1)*2*Math.PI/longitude,p=radial(a,x),q=radial(a,y),s=radial(b,x),t=radial(b,y);addTriangle(p,q,t);addTriangle(p,t,s);if(cylinder){addTriangle(a,q,p);addTriangle(b,s,t);}}
   if(!cylinder)for(let j=0;j<hemisphere;j++){band(a,-Math.PI/2+j*Math.PI/2/hemisphere,-Math.PI/2+(j+1)*Math.PI/2/hemisphere,j===0,false);band(b,j*Math.PI/2/hemisphere,(j+1)*Math.PI/2/hemisphere,false,j===hemisphere-1);}
  }
 }catch(error){return {state:'unknown',reason:String(error.message).slice(0,160),bounds,maximumErrorMetres,triangles:[]};}
 requirePrimitive(triangles.length===required,'complete bounded analytic shell');
 return {state:'approximated-analytic',family:primitive.family,bounds,triangles,maximumErrorMetres:bound,requestedMaximumErrorMetres:maximumErrorMetres,errorBasis:'decoded-affine-geometry; native-unit/metre-assumption-unverified',approximation:'inscribed-affine-parametric-convex-surface',nativeMaterialPreserved:true,exactAnalyticSurface:false};
}
