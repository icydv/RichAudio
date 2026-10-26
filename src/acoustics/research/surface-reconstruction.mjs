// Original diagnostic-only implementation. No game calls, acoustic tile certification or audio.
import {performance} from 'node:perf_hooks';
export const planId='parallel-wall-grid-3x3-v1';
export const reconstructionRules=Object.freeze({queries:9,maximumQueries:16,maxBatchMs:1000,normalDegrees:5,relativePlanarity:0.01,minSecondVariance:1e-8,minVarianceRatio:0.01,maxBytes:262144});
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),len=a=>Math.hypot(...a),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const finite=x=>Number.isFinite(x),vec=p=>{const a=Array.isArray(p)?p:[p?.X,p?.Y,p?.Z];if(a.length!==3||a.some(x=>!finite(x)||Math.abs(x)>100000))throw Error('invalid finite vector');return [...a];};
const unit=v=>{const n=len(v);if(n<1e-12)throw Error('zero direction');return mul(v,1/n);};
const clamp=x=>Math.max(-1,Math.min(1,x)),degrees=x=>Math.acos(clamp(x))*180/Math.PI;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
const same=(a,b,t)=>len(sub(a,b))<=t;
export function fixedRayPlan(player,forward){
 const p=vec(player),f=vec(forward),h=Math.hypot(f[0],f[1]);if(h<.5)throw Error('invalid horizontal pose');
 const d=[f[0]/h,f[1]/h,0],right=[d[1],-d[0],0],rays=[];
 for(let row=0;row<3;row++)for(let col=0;col<3;col++){
  const lateral=(col-1)*.75,vertical=(row-1)*.5,origin=add(add(p,mul(right,lateral)),[0,0,1+vertical]);
  rays.push({Order:rays.length,Row:row,Column:col,Lateral:lateral,Vertical:vertical,Origin:origin,End:add(origin,mul(d,8))});
 }
 return {rays,right,direction:d};
}
function positionTolerance(a,b){return 16/8388608*Math.max(1,...a.map(Math.abs),...b.map(Math.abs));}
// Bounded Jacobi diagonalisation of a real symmetric 3x3 covariance matrix.
// The minimum eigenvector minimises summed orthogonal squared plane distances.
export function fitPlane(points){
 if(!Array.isArray(points)||points.length<3||points.length>16)throw Error('bounded point count');
 const ps=points.map(vec),anchor=ps[0],local=ps.map(p=>sub(p,anchor));
 const mean=[0,1,2].map(i=>local.reduce((s,p)=>s+p[i],0)/ps.length),center=add(anchor,mean);
 const c=Array.from({length:3},()=>[0,0,0]);for(const p of local){const d=sub(p,mean);for(let i=0;i<3;i++)for(let j=0;j<3;j++)c[i][j]+=d[i]*d[j]/ps.length;}
 const a=c.map(r=>[...r]),v=[[1,0,0],[0,1,0],[0,0,1]],scale=Math.max(1,...a.flat().map(Math.abs));
 for(let k=0;k<48;k++){
  let p=0,q=1;for(const [i,j] of [[0,2],[1,2]])if(Math.abs(a[i][j])>Math.abs(a[p][q])){p=i;q=j;}
  if(Math.abs(a[p][q])<=1e-14*scale)break;
  const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),s=Math.sin(angle),co=Math.cos(angle),app=a[p][p],aqq=a[q][q],apq=a[p][q];
  for(let i=0;i<3;i++)if(i!==p&&i!==q){const x=a[i][p],y=a[i][q];a[i][p]=a[p][i]=co*x-s*y;a[i][q]=a[q][i]=s*x+co*y;}
  a[p][p]=co*co*app-2*s*co*apq+s*s*aqq;a[q][q]=s*s*app+2*s*co*apq+co*co*aqq;a[p][q]=a[q][p]=0;
  for(let i=0;i<3;i++){const x=v[i][p],y=v[i][q];v[i][p]=co*x-s*y;v[i][q]=s*x+co*y;}
 }
 if(Math.max(Math.abs(a[0][1]),Math.abs(a[0][2]),Math.abs(a[1][2]))>1e-11*scale)throw Error('plane eigensolver did not converge');
 const order=[0,1,2].sort((i,j)=>a[i][i]-a[j][j]||i-j),eigenvalues=order.map(i=>Math.max(0,a[i][i]));
 if(eigenvalues[1]<reconstructionRules.minSecondVariance||eigenvalues[1]/Math.max(eigenvalues[2],1e-30)<reconstructionRules.minVarianceRatio)throw Error('degenerate or needle-like support');
 const normal=unit(v.map(row=>row[order[0]])),residuals=ps.map(p=>dot(sub(p,center),normal));
 return {center,normal,eigenvalues,residuals,rms:Math.sqrt(residuals.reduce((s,x)=>s+x*x,0)/ps.length),maxResidual:Math.max(...residuals.map(Math.abs))};
}
const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function convexHull(ps){
 const p=ps.map(x=>[...x]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 if(p.length<3)throw Error('insufficient hull support');
 const half=points=>{const h=[];for(const x of points){while(h.length>=2&&turn(h.at(-2),h.at(-1),x)<=1e-12)h.pop();h.push(x);}return h;};
 const lo=half(p),hi=half([...p].reverse()),h=[...lo.slice(0,-1),...hi.slice(0,-1)];if(h.length<3)throw Error('degenerate hull');return h;
}
export function insidePolygon(p,h,tolerance=1e-9){return h.every((a,i)=>turn(a,h[(i+1)%h.length],p)>=-tolerance);}
function insetHull(h,distance){
 const lines=h.map((p,i)=>{const q=h[(i+1)%h.length],dx=q[0]-p[0],dy=q[1]-p[1],n=Math.hypot(dx,dy);return {a:-dy/n,b:dx/n,c:(-dy*p[0]+dx*p[1])/n+distance};});
 const out=lines.map((l,i)=>{const prev=lines[(i+lines.length-1)%lines.length],d=prev.a*l.b-l.a*prev.b;if(Math.abs(d)<1e-12)throw Error('unstable hull inset');return [(prev.c*l.b-l.c*prev.b)/d,(prev.a*l.c-l.a*prev.c)/d];});
 if(out.some(p=>!p.every(finite)||!insidePolygon(p,h))||Math.abs(out.reduce((s,p,i)=>s+p[0]*out[(i+1)%out.length][1]-p[1]*out[(i+1)%out.length][0],0))<1e-8)throw Error('no stable interior footprint');return out;
}
export function reconstructSurface(batch){
 const start=performance.now(),result={schemaVersion:1,status:'rejected',reasons:[],counts:{planned:9,records:0,validHits:0,validMisses:0},candidate:null,observations:[],units:'gta-native-units-unverified',certifiedAcousticGeometry:false};
 try{
  if(!batch||batch.SchemaVersion!==1||batch.PlanId!==planId||batch.PlannedQueries!==9||!id(batch.SessionId)||batch.GameVersion!=='1.0.1158.16'||batch.FrameworkVersion!=='1.132.1428.17748'||batch.CoordinateSpace!==result.units||batch.TimeUnit!=='monotonic-ms')throw Error('batch schema/session/build/coordinate mismatch');
  if(!Array.isArray(batch.Samples)||batch.Samples.length>9||!Number.isSafeInteger(batch.TraceCalls)||batch.TraceCalls<0||batch.TraceCalls>9)throw Error('query budget');
  if(!finite(batch.StartedAtMs)||!finite(batch.FinishedAtMs)||batch.StartedAtMs<0||batch.FinishedAtMs<batch.StartedAtMs||batch.FinishedAtMs-batch.StartedAtMs>1000)throw Error('batch time bounds');
  const plan=fixedRayPlan(batch.PlayerPosition,batch.Forward),points=[],normals=[],tolerances=[],identities=[],seen=new Set();let previous=batch.StartedAtMs,calls=0;
  result.counts.records=batch.Samples.length;
  for(let i=0;i<batch.Samples.length;i++){
   const sample=batch.Samples[i],o=sample?.Observation,r=sample?.Ray,p=plan.rays[i];
   if(sample?.Id!=='ray-'+i||seen.has(sample.Id)||!o||!r||r.Order!==i||r.Row!==p.Row||r.Column!==p.Column||r.Lateral!==p.Lateral||r.Vertical!==p.Vertical)throw Error('observation identity/order/plan mismatch');seen.add(sample.Id);
   const a=vec(o.Origin),b=vec(o.End),tol=positionTolerance(a,b),d=sub(b,a),n=len(d);
   if(!same(vec(r.Origin),p.Origin,tol)||!same(vec(r.End),p.End,tol)||!same(a,p.Origin,tol)||!same(b,p.End,tol)||Math.abs(n-8)>tol||o.MaximumDistance!==8)throw Error('fixed ray changed');
   if(o.SchemaVersion!==1||o.SessionId!==batch.SessionId||o.GameVersion!==batch.GameVersion||o.FrameworkVersion!==batch.FrameworkVersion||o.CoordinateSpace!==batch.CoordinateSpace||o.TimeUnit!==batch.TimeUnit||!finite(o.ObservedAtMs)||o.ObservedAtMs<previous||o.ObservedAtMs>batch.FinishedAtMs)throw Error('observation provenance/time mismatch');previous=o.ObservedAtMs;
   if(o.FlagsName!=='IntersectWorld'||o.FlagsValue!==1||o.TraceCalls!==1||!Number.isSafeInteger(o.IgnoredPlayerHandle)||o.IgnoredPlayerHandle<=0||o.SetupStatus!=='on_foot_stationary_by_SDK_getters'||!finite(o.PlayerSpeed)||o.PlayerSpeed<0||o.PlayerSpeed>.25||typeof o.QueryProvenance!=='string'||!o.QueryProvenance||o.QueryProvenance.length>256||o.ErrorClass!=null)throw Error('observation scope/setup');calls++;
   if(i&&o.IgnoredPlayerHandle!==batch.Samples[0].Observation.IgnoredPlayerHandle)throw Error('player identity changed');
   if(o.MaterialStatus!=='unavailable_RPH_HitResult'||o.ExtentStatus!=='unavailable_single_hit')throw Error('fabricated material/extent');
   if(!finite(o.TraceDurationMs)||o.TraceDurationMs<0||!finite(o.ConversionDurationMs)||o.ConversionDurationMs<0)throw Error('observation timing unavailable');
   if(o.Completion==='miss'){
    if(o.HitPosition!=null||o.HitNormal!=null||o.HitEntityHandle!=null)throw Error('contradictory miss');
    result.counts.validMisses++;result.observations.push({id:sample.Id,status:'miss',reason:'unknown support; not automatically a wall edge'});continue;
   }
   if(o.Completion!=='hit'||o.PositionStatus!=='observed'||o.NormalStatus!=='observed')throw Error('incomplete hit');
   const point=vec(o.HitPosition),normal=vec(o.HitNormal),nl=len(normal),delta=sub(point,a),t=dot(delta,d)/(n*n),off=len(sub(delta,mul(d,t)));
   if(t< -tol/n||t>1+tol/n||off>tol||nl===0||Math.abs(nl-1)>.01)throw Error('invalid position/normal');
   if(o.HitEntityHandle==null){if(!['none_returned_static_unproven','unavailable'].includes(o.EntityStatus))throw Error('entity ambiguity');identities.push('unavailable');}
   else{if(!Number.isSafeInteger(o.HitEntityHandle)||o.HitEntityHandle<=0||o.EntityStatus!=='returned_identity_unclassified')throw Error('entity ambiguity');identities.push('handle-'+o.HitEntityHandle);}
   points.push(point);normals.push(unit(normal));tolerances.push(tol);result.counts.validHits++;result.observations.push({id:sample.Id,status:'valid-hit',position:point,normal:unit(normal),provenance:o.QueryProvenance,observedAtMs:o.ObservedAtMs});
  }
  if(calls!==batch.TraceCalls)throw Error('call count mismatch');
  if(batch.Completion!=='complete'||batch.Samples.length!==9||batch.ErrorClass!=null)throw Error('incomplete acquisition; observations retained');
  if(points.length!==9)throw Error('missing grid support; no connected patch');
  if(new Set(identities).size!==1)throw Error('incompatible or mixed available entity identities');
  const plane=fitPlane(points);if(dot(plane.normal,normals[0])<0)plane.normal=mul(plane.normal,-1);
  const normalAngles=normals.map(n=>degrees(dot(n,plane.normal))),maxAngle=Math.max(...normalAngles),maxTolerance=Math.max(...tolerances);
  const planeTolerance=Math.max(.5*reconstructionRules.relativePlanarity,4*maxTolerance);
  if(maxAngle>reconstructionRules.normalDegrees)throw Error('normal disagreement; no surface merging');
  if(Math.abs(plane.normal[2])>.2)throw Error('outside intended vertical-wall family');
  if(plane.maxResidual>planeTolerance)throw Error('noncoplanar or outlier observations; no automatic subset selection');
  const u=unit(sub(plan.right,mul(plane.normal,dot(plan.right,plane.normal)))),v=unit(cross(plane.normal,u));
  const projected=points.map(p=>{const d=sub(p,plane.center);return [dot(d,u),dot(d,v)];}),hull=convexHull(projected),inset=Math.max(2*planeTolerance,2*(plane.maxResidual+maxTolerance)),footprint=insetHull(hull,inset);
  result.status='candidate-inferred';
  result.candidate={kind:'diagnostic-inferred-polygon',sourceIds:batch.Samples.map(s=>s.Id),session:batch.SessionId,build:batch.GameVersion,center:plane.center,normal:plane.normal,u,v,observedHull:hull,footprint,inset,points:points.map(p=>[...p]),eigenvalues:plane.eigenvalues,fitRms:plane.rms,maxFitResidual:plane.maxResidual,planeTolerance,maxNormalAngleDegrees:maxAngle,maxPositionTolerance:maxTolerance,footprintArea:Math.abs(footprint.reduce((s,p,i)=>s+p[0]*footprint[(i+1)%footprint.length][1]-p[1]*footprint[(i+1)%footprint.length][0],0))/2,confidence:{classification:'inferred-local-planarity-only',probability:null,basis:'all nine valid grid hits; bounded residuals and normal agreement',continuity:'unmeasured-between-rays',boundaries:'artificial interior of observed support; true edges unknown',material:'unknown',staticPermanence:'unverified',largestHorizontalSampleGap:.75,largestVerticalSampleGap:.5},observedAtMs:previous,validUntilMs:previous+1000,units:result.units};
 }catch(e){result.reasons.push(e.message);}
 result.reconstructionMs=performance.now()-start;return result;
}
export function candidateFresh(result,{session,build,nowMs}){
 const c=result?.candidate;return !!c&&result.status==='candidate-inferred'&&session===c.session&&build===c.build&&finite(nowMs)&&nowMs>=c.observedAtMs&&nowMs<c.validUntilMs;
}
// Deliberately separate from createTile/solveFirstReflections: native units and inferred
// support cannot be silently presented as certified metre geometry or audible energy.
export function diagnosticReflection(result,source,listener){
 if(result?.status!=='candidate-inferred'||!result.candidate)throw Error('inferred diagnostic candidate required');
 const c=result.candidate,s=vec(source),l=vec(listener),a=dot(sub(s,c.center),c.normal),b=dot(sub(l,c.center),c.normal);
 if(a*b<=0)throw Error('hypothetical endpoints must share reflecting side');
 const image=sub(s,mul(c.normal,2*a)),d=sub(image,l),den=dot(d,c.normal),t=-b/den;
 if(!finite(t)||t<=0||t>=1)throw Error('invalid hypothetical reflection');
 const point=add(l,mul(d,t)),delta=sub(point,c.center),uv=[dot(delta,c.u),dot(delta,c.v)];
 if(!insidePolygon(uv,c.footprint))throw Error('reflection outside inferred footprint');
 return {classification:'calculated-reflection-hypothesis-only',point,source:s,listener:l,pathLengthNativeUnits:len(sub(point,s))+len(sub(l,point)),directLengthNativeUnits:len(sub(l,s)),arrivalSeconds:null,excessDelaySeconds:null,pressureGain:null,energyGain:null,material:'unknown',visibility:'unknown-unobserved-paths',certified:false};
}
export function hypotheticalEndpoints(result){
 if(!result.candidate)throw Error('candidate required');const c=result.candidate,base=add(c.center,mul(c.normal,2));return {source:add(base,mul(c.u,-.2)),listener:add(base,mul(c.u,.2))};
}
