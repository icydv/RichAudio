// Independent read-only validation. Original code, no GTA/RPH dependency.
import {fitPlane,convexHull,insidePolygon} from './surface-reconstruction.mjs';
const finite=Number.isFinite,add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(p,s)=>p.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),length=p=>Math.hypot(...p),unit=p=>mul(p,1/length(p));
export function vector(p){const v=[p?.X,p?.Y,p?.Z];if(v.some(x=>!finite(x)||Math.abs(x)>100000))throw Error('invalid coordinate');return v;}
const same=(a,b,t)=>length(sub(a,b))<=t;
export function tileRayPlan(kind,player,forward){
 const p=vector(player),f=vector(forward),h=Math.hypot(f[0],f[1]);if(h<.5||!['wall','ground'].includes(kind))throw Error('fixed plan kind/pose');
 const d=[f[0]/h,f[1]/h,0],right=[d[1],-d[0],0],rays=[];
 for(let row=0;row<3;row++)for(let col=0;col<3;col++){
  const x=(col-1)*.75,y=(row-1)*(kind==='wall'?.5:.75);
  const a=kind==='wall'?add(add(p,mul(right,x)),[0,0,1+y]):add(add(add(p,mul(right,x)),mul(d,y)),[0,0,1]);
  rays.push({a,b:kind==='wall'?add(a,mul(d,8)):add(a,[0,0,-8]),row,col,x,y});
 }return rays;
}
export function inspectTileGroup(g){
 const result={status:'rejected',reasons:[],actualCalls:0,validHits:0,validMisses:0,plane:null,points:[],normals:[]};
 try{
  if(!g||g.Plan!=='wall-ground-two-groups-v1'||!['wall','ground'].includes(g.Kind)||!/^[A-Za-z0-9_-]{1,32}$/.test(g.Name)||!/^[A-Za-z0-9_-]{1,64}$/.test(g.Session)||g.Build!=='1.0.1158.16'||g.Framework!=='1.132.1428.17748'||g.Generation!==1||!Number.isSafeInteger(g.Interior)||g.Interior<0||!Array.isArray(g.Samples)||g.Samples.length>9||!Number.isSafeInteger(g.TraceCalls)||g.TraceCalls<0||g.TraceCalls>9||!finite(g.StartedMs)||g.StartedMs<0||!finite(g.FinishedMs)||g.FinishedMs<g.StartedMs||g.FinishedMs-g.StartedMs>1000)throw Error('group envelope');
  const plan=tileRayPlan(g.Kind,g.Player,g.Forward),identities=new Set();let previous=g.StartedMs,player=null,maxTolerance=0;
  for(const [i,s] of g.Samples.entries()){
   const o=s?.Observation,r=s?.Ray,p=plan[i];if(!o||!r||s.Id!==g.Name+'-ray-'+i||r.Order!==i||r.Row!==p.row||r.Column!==p.col||r.Lateral!==p.x||r.Vertical!==p.y)throw Error('sample identity/plan');
   if(o.TraceCalls!==1||o.FlagsName!=='IntersectWorld'||o.FlagsValue!==1||o.SchemaVersion!==1||o.SessionId!==g.Session||o.GameVersion!==g.Build||o.FrameworkVersion!==g.Framework||o.CoordinateSpace!=='gta-native-units-unverified'||o.TimeUnit!=='monotonic-ms'||!finite(o.ObservedAtMs)||o.ObservedAtMs<previous||o.ObservedAtMs>g.FinishedMs||o.ErrorClass!=null)throw Error('sample provenance');
   if(!Number.isSafeInteger(o.IgnoredPlayerHandle)||o.IgnoredPlayerHandle<=0||player!==null&&o.IgnoredPlayerHandle!==player||o.SetupStatus!=='on_foot_stationary_by_SDK_getters'||!finite(o.PlayerSpeed)||o.PlayerSpeed<0||o.PlayerSpeed>.25||typeof o.QueryProvenance!=='string'||!o.QueryProvenance||o.QueryProvenance.length>256||o.MaterialStatus!=='unavailable_RPH_HitResult'||o.ExtentStatus!=='unavailable_single_hit'||!finite(o.TraceDurationMs)||o.TraceDurationMs<0||!finite(o.ConversionDurationMs)||o.ConversionDurationMs<0)throw Error('sample setup/scope');
   previous=o.ObservedAtMs;player=o.IgnoredPlayerHandle;result.actualCalls++;
   const a=vector(o.Origin),b=vector(o.End),tol=16/8388608*Math.max(1,...a.map(Math.abs),...b.map(Math.abs)),d=sub(b,a),n=length(d);maxTolerance=Math.max(maxTolerance,tol);
   if(o.MaximumDistance!==8||Math.abs(n-8)>tol||!same(a,p.a,tol)||!same(b,p.b,tol)||!same(vector(r.Origin),p.a,tol)||!same(vector(r.End),p.b,tol))throw Error('fixed trace endpoints');
   if(o.Completion==='miss'){if(o.HitPosition!=null||o.HitNormal!=null||o.HitEntityHandle!=null)throw Error('contradictory miss');result.validMisses++;continue;}
   if(o.Completion!=='hit'||o.PositionStatus!=='observed'||o.NormalStatus!=='observed')throw Error('invalid hit');
   const point=vector(o.HitPosition),normal=vector(o.HitNormal),nl=length(normal),t=dot(sub(point,a),d)/(n*n),off=length(sub(sub(point,a),mul(d,t)));
   if(t< -tol/n||t>1+tol/n||off>tol||nl===0||Math.abs(nl-1)>.01)throw Error('hit geometry');
   if(o.HitEntityHandle==null){if(!['none_returned_static_unproven','unavailable'].includes(o.EntityStatus))throw Error('entity ambiguity');identities.add('unavailable');}
   else{if(!Number.isSafeInteger(o.HitEntityHandle)||o.HitEntityHandle<=0||o.EntityStatus!=='returned_identity_unclassified')throw Error('entity ambiguity');identities.add('handle-'+o.HitEntityHandle);}
   result.points.push(point);result.normals.push(unit(normal));result.validHits++;
  }
  if(result.actualCalls!==g.TraceCalls||g.Completion!=='complete'||g.Samples.length!==9||result.validHits!==9||g.Error!=null)throw Error('incomplete or rejected support');
  if(identities.size!==1)throw Error('mixed support identities');const fit=fitPlane(result.points);if(dot(fit.normal,result.normals[0])<0)fit.normal=mul(fit.normal,-1);
  const maxNormalDegrees=Math.max(...result.normals.map(n=>Math.acos(Math.max(-1,Math.min(1,dot(n,fit.normal))))*180/Math.PI)),planeTolerance=Math.max(.005,4*maxTolerance);
  if(maxNormalDegrees>5||fit.maxResidual>planeTolerance)throw Error('normal disagreement or nonplanarity');
  result.status='candidate-inferred';result.plane={...fit,maxNormalDegrees,planeTolerance,maxPositionTolerance:maxTolerance,orientation:Math.abs(fit.normal[2])>=Math.cos(Math.PI/6)?'horizontal-or-gently-sloping':Math.abs(fit.normal[2])<=.2?'predominantly-vertical':'other-orientation'};
 }catch(e){result.reasons.push(e.message);}return result;
}
export function independentPatch(g,result=inspectTileGroup(g)){
 if(result.status!=='candidate-inferred')throw Error('no independently qualified patch');const p=result.plane,n=p.normal,reference=Math.abs(n[0])<.8?[1,0,0]:[0,1,0],u=unit(sub(reference,mul(n,dot(reference,n)))),v=unit([n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]]);
 const hull=convexHull(result.points.map(q=>{const d=sub(q,p.center);return [dot(d,u),dot(d,v)];})),inset=Math.max(2*p.planeTolerance,2*(p.maxResidual+p.maxPositionTolerance));
 const lines=hull.map((q,i)=>{const r=hull[(i+1)%hull.length],dx=r[0]-q[0],dy=r[1]-q[1],l=Math.hypot(dx,dy);return {a:-dy/l,b:dx/l,c:(-dy*q[0]+dx*q[1])/l+inset};});
 const inner=lines.map((l,i)=>{const prev=lines[(i+lines.length-1)%lines.length],d=prev.a*l.b-l.a*prev.b;if(Math.abs(d)<1e-12)throw Error('inset stability');return [(prev.c*l.b-l.c*prev.b)/d,(prev.a*l.c-l.a*prev.c)/d];});if(inner.some(q=>!q.every(finite)||!insidePolygon(q,hull)))throw Error('inset outside support');
 const point=q=>({X:q[0],Y:q[1],Z:q[2]});return {Id:g.Name+'-candidate-1',Group:g.Name,Session:g.Session,Build:g.Build,Status:'inferred-local-planarity-only',Material:'unknown',Permanence:'unverified',Footprint:inner.map(q=>point(add(p.center,add(mul(u,q[0]),mul(v,q[1]))))),Center:point(p.center),Normal:point(n)};
}
export function checkVisualSnapshot(snapshot,groups,patches){
 validateVisualSnapshot(snapshot);const samples=new Map(),expected=new Map();let valid=0,records=0;
 if(groups.length<1||groups.length>2||new Set(groups.map(g=>g.Name)).size!==groups.length||groups.some(g=>g.Session!==groups[0].Session||g.Build!==groups[0].Build||g.Framework!==groups[0].Framework||g.Interior!==groups[0].Interior||g.Generation!==1||length(sub(vector(g.Player),vector(groups[0].Player)))>16))throw Error('combined tile provenance');
 const key=l=>JSON.stringify(l),line=(a,b,kind,id)=>({A:a,B:b,Kind:kind,Id:id}),point=p=>({X:p[0],Y:p[1],Z:p[2]});
 const addLine=l=>{const k=key(l);expected.set(k,(expected.get(k)||0)+1);};
 for(const g of groups){const r=inspectTileGroup(g);if(r.status!=='candidate-inferred')throw Error('independently rejected group');for(const s of g.Samples){samples.set(s.Id,s.Observation);records++;valid++;const o=s.Observation,p=vector(o.HitPosition),n=unit(vector(o.HitNormal));addLine(line(o.Origin,o.End,'ray',s.Id));
  for(let i=0;i<3;i++){const d=[0,0,0];d[i]=.035;addLine(line(point(sub(p,d)),point(add(p,d)),'hit',s.Id));}addLine(line(point(p),point(add(p,mul(n,.22))),'measured-normal',s.Id));
 }}
 for(const p of patches){if(p.Status!=='inferred-local-planarity-only'||p.Material!=='unknown'||p.Permanence!=='unverified'||!samples.has(p.Group+'-ray-0'))throw Error('candidate provenance');
  for(let i=0;i<p.Footprint.length;i++)addLine(line(p.Footprint[i],p.Footprint[(i+1)%p.Footprint.length],'inferred-outline',p.Id));const c=vector(p.Center),n=vector(p.Normal);for(let j=0;j<3;j++)addLine(line(point(add(c,mul(n,.3+j*.12))),point(add(c,mul(n,.36+j*.12))),'fitted-normal',p.Id));
 }
 if(snapshot.ObservationCount!==records||snapshot.ValidHitCount!==valid||snapshot.SurfaceCount!==patches.length||snapshot.Rejections.length!==0||expected.size!==snapshot.Lines.length||snapshot.CandidateValidUntilMs.some((t,i)=>t!==groups.find(g=>g.Name===patches[i].Group).FinishedMs+1000))throw Error('snapshot counts/expiry');
 // Tolerate different last-bit floating-point sums, never relocation or wrong IDs.
 const remaining=[...expected.keys()].map(k=>JSON.parse(k));for(const actual of snapshot.Lines){const index=remaining.findIndex(l=>l.Kind===actual.Kind&&l.Id===actual.Id&&same(vector(l.A),vector(actual.A),1e-10)&&same(vector(l.B),vector(actual.B),1e-10));if(index<0)throw Error('snapshot primitive mismatch');remaining.splice(index,1);}if(remaining.length)throw Error('missing visual primitives');return {records,valid,primitives:snapshot.Lines.length,surfaces:patches.length};
}
export function validateVisualSnapshot(s){
 if(!s||s.SchemaVersion!==1||!Array.isArray(s.Lines)||s.Lines.length>192||!Array.isArray(s.Rejections)||s.Rejections.length>20||s.Rejections.some(x=>typeof x!=='string'||x.length>160)||!Number.isSafeInteger(s.ObservationCount)||s.ObservationCount<0||s.ObservationCount>18||!Number.isSafeInteger(s.ValidHitCount)||s.ValidHitCount<0||s.ValidHitCount>s.ObservationCount||!Number.isSafeInteger(s.SurfaceCount)||s.SurfaceCount<0||s.SurfaceCount>2||!Array.isArray(s.CandidateValidUntilMs)||s.CandidateValidUntilMs.length!==s.SurfaceCount||s.CandidateValidUntilMs.some(t=>!finite(t)||t<0)||typeof s.Status!=='string'||s.Status.length>128||typeof s.Unknown!=='string'||s.Unknown.length>256)throw Error('invalid visual snapshot');
 for(const l of s.Lines){if(!['ray','hit','measured-normal','inferred-outline','fitted-normal'].includes(l.Kind)||typeof l.Id!=='string'||l.Id.length>80||length(sub(vector(l.A),vector(l.B)))>20)throw Error('invalid visual line');}return s;
}
