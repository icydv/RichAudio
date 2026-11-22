// Finite image-source extension. Reuses the validated research geometry and visibility queries.
import {
  sub,
  scale,
  dot,
  cross,
  length,
  unit,
  onPatch,
  querySegment,
  isValidatedTileSnapshot01,
  inBox,
} from "../research/local-geometry.mjs";
import { pose, trackPosition, requireValue } from "./contracts.mjs";
const E = 1e-8;
const coherentBandFrequencies = [200, 1600, 6400];
const tileLifetimes = new WeakMap();
const surfacesByTile=new WeakMap();
function surfaceLookup(tile){
  let index=surfacesByTile.get(tile);
  if(!index){
    index=new Map();
    for(const face of tile.surfaces)index.set(face.id,face);
    if(isValidatedTileSnapshot01(tile))surfacesByTile.set(tile,index);
  }
  return index;
}
function validUntil(tile) {
  let until = tileLifetimes.get(tile);
  if (until === undefined) {
    until = tile.surfaces.reduce((end, s) => Math.min(end, s.validUntil), tile.validUntil);
    if (Object.isFrozen(tile) && Object.isFrozen(tile.surfaces)) tileLifetimes.set(tile, until);
  }
  return until;
}

// Stable across opposite winding and clipping. This key only groups proposals
// and mixer identities. A bounce still needs an actual finite supporting face.
export function reflectionPlaneId(surface) {
  const sign = surface.normal.find(n => Math.abs(n) > 1e-6) < 0 ? -1 : 1;
  const components = surface.normal.map(n => Math.round(n * sign * 1e6));
  components.push(Math.round(dot(surface.normal, surface.center) * sign * 1e4));
  return 'plane.' + components.map(n => n.toString(36)).join('.');
}

const supportVertices = new WeakMap();
function finiteVertices(s) {
  let points = supportVertices.get(s.corners);
  if (!points) {
    points = s.footprint?.map(([u,v])=>s.center.map((x,i)=>x+u*s.u[i]+v*s.v[i])) ?? s.corners;
    supportVertices.set(s.corners,points);
  }
  return points;
}

export function sharedReflectionEdge(a,b) {
  if (a===b || reflectionPlaneId(a)!==reflectionPlaneId(b)) return null;
  const av=finiteVertices(a), bv=finiteVertices(b);
  // Numeric plane buckets alone cannot establish connectivity or coplanarity.
  if (!av.every(p=>Math.abs(dot(sub(p,b.center),b.normal))<=E) ||
      !bv.every(p=>Math.abs(dot(sub(p,a.center),a.normal))<=E)) return null;
  const same=(p,q)=>p.every((x,i)=>Math.abs(x-q[i])<=E);
  for (let i=0;i<av.length;i++) {
    const start=av[i],end=av[(i+1)%av.length];
    for (let j=0;j<bv.length;j++) {
      const p=bv[j],q=bv[(j+1)%bv.length];
      if (same(start,p)&&same(end,q) || same(start,q)&&same(end,p)) {
        // Overlapping polygons can share an edge on the same side. Only
        // opposing finite interiors meet as neighbours across the edge.
        const across=cross(a.normal,sub(end,start));
        const side=vertices=>vertices.reduce((sum,v)=>sum+dot(sub(v,start),across),0);
        if(side(av)*side(bv)<0) return [start,end];
      }
    }
  }
  return null;
}
export function distanceToReflectionEdge(point, [a,b]) {
  const axis=sub(b,a), delta=sub(point,a);
  const t=Math.max(0,Math.min(1,dot(delta,axis)/dot(axis,axis)));
  return Math.hypot(...delta.map((x,i)=>x-t*axis[i]));
}
// Explicit finite-emitter calibration, opt-in per source. Outside the declared
// radius the original inverse-distance calculation is exactly unchanged. Inside,
// pressure and its first derivative join 1/d at the boundary, with a finite
// centre pressure and zero radial derivative. This is a source assumption, not a
// limiter, automatic gain control, or alteration of delay/direction/Doppler.
export function spreadingDistance(distance,referenceDistance,nearFieldRadius=0){
  requireValue(Number.isFinite(distance)&&distance>=0&&Number.isFinite(referenceDistance)&&referenceDistance>0&&
    Number.isFinite(nearFieldRadius)&&nearFieldRadius>=0&&nearFieldRadius<=10&&
    (nearFieldRadius===0||nearFieldRadius>=referenceDistance),'finite emitter distance/radius');
  if(nearFieldRadius===0||distance>=nearFieldRadius)return Math.max(distance,referenceDistance);
  const u=distance/nearFieldRadius;
  return nearFieldRadius/(1.5-.5*u*u);
}
function differenceDot(a,b,n){
  return 0+(a[0]-b[0])*n[0]+(a[1]-b[1])*n[1]+(a[2]-b[2])*n[2];
}
export function mirror(point,surface){
  const n=surface.normal,offset=-2*differenceDot(point,surface.center,n);
  return [point[0]+n[0]*offset,point[1]+n[1]*offset,point[2]+n[2]*offset];
}
const separation=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export function imageFor(p, surfaces) {
  for (const s of surfaces) p = mirror(p, s);
  return p;
}
// The retarded-time iteration needs only the final distance. Carry the three
// coordinates through the same ordered reflections without allocating the
// intermediate vectors at every iteration of every emitter.
export function imageDistance(point,surfaces,listener){
  let x=point[0],y=point[1],z=point[2];
  for(const s of surfaces){
    const c=s.center,n=s.normal;
    const offset=-2*(0+(x-c[0])*n[0]+(y-c[1])*n[1]+(z-c[2])*n[2]);
    x+=n[0]*offset;y+=n[1]*offset;z+=n[2]*offset;
  }
  return Math.hypot(x-listener[0],y-listener[1],z-listener[2]);
}
export function pathGeometry(
  scene,
  source,
  listener,
  surfaces,
  stats = { queries: 0, surfaceTests: 0 },
) {
  return finishPathGeometry(preparePathGeometry(scene,source,listener,surfaces),null,stats);
}
// Prepare finite reflection vertices once, then batch visibility independently.
// The CPU and GPU-screened routes share the exact same path and material math.
export function preparePathGeometry(scene,source,listener,surfaces,faceAtPoint=null) {
  if(scene.directPath){
    requireValue(!surfaces.length&&scene.directPath.mode==='listener-only-conditional-direct','conditional model permits direct path only');
    if(!inBox(source,scene.modelBounds)||!inBox(listener,scene.modelBounds))return {status:'outside-tile'};
    const delta=sub(source,listener),distance=length(delta);
    return {status:'clear',distance,points:[],hits:[],arrivalDirection:distance>E?unit(delta):[0,0,0],
      emissionDirection:distance>E?unit(scale(delta,-1)):[0,0,0]};
  }
  const tile = scene.tile;
  const conditional = scene.observationModel?.visibilityAssumption === 'unobserved-space-assumed-clear';
  if (!inBox(source, tile.bounds) || !inBox(listener, tile.bounds))
    return { status: "outside-tile" };
  if (!surfaces.length && separation(source, listener) <= E)
    return tile.coverage === "complete-synthetic" &&
      !tile.missingRegions.some((m) => inBox(source, m.bounds)) &&
      !tile.surfaces.some((s) => onPatch(s, source))
      ? {
          status: "clear",
          distance: 0,
          points: [],
          hits: [],
          arrivalDirection: [0, 0, 0],
          emissionDirection: [0, 0, 0],
        }
      : { status: "unknown" };
  const images = [source];
  for (const s of surfaces) images.push(mirror(images.at(-1), s));
  const originalSurfaces=surfaces;
  const points = new Array(surfaces.length);
  let end = listener;
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const s = surfaces[i],image=images[i+1],den=differenceDot(image,end,s.normal);
    if (Math.abs(den) < E) return { status: "parallel" };
    const t = -differenceDot(end,s.center,s.normal) / den;
    if (t <= E || t >= 1 - E) return { status: "wrong-reflection-order" };
    const p=[end[0]+(image[0]-end[0])*t,end[1]+(image[1]-end[1])*t,end[2]+(image[2]-end[2])*t];
    if (faceAtPoint) {
      const face = faceAtPoint(i, p);
      if (!face) return { status: "outside-finite-patch-or-opening" };
      if(face!==s){
        if(surfaces===originalSurfaces)surfaces=[...surfaces];
        surfaces[i]=face;
      }
    } else if (!onPatch(s, p)) return { status: "outside-finite-patch-or-opening" };
    points[i] = p;
    end = p;
  }
  const vertices = [source, ...points, listener];
  let distance = 0;
  for (let i = 1; i < vertices.length; i++) {
    const leg = separation(vertices[i], vertices[i - 1]);
    if (leg <= E) return { status: "degenerate" };
    distance += leg;
  }
  // A bounce must stay on one side of its plane. Reject impossible paths
  // before querying the tile or putting their legs in the GPU visibility batch.
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i],
      a = differenceDot(vertices[i], s.center, s.normal),
      b = differenceDot(vertices[i + 2], s.center, s.normal);
    if (a * b <= E || (s.reflectiveSide === "front" && (a <= E || b <= E)))
      return { status: "wrong-reflecting-side" };
  }
  return {status:'prepared-geometry',scene,surfaces,source,listener,vertices,points,conditional,distance};
}
export function finishPathGeometry(plan,queries=null,stats={queries:0,surfaceTests:0}) {
  if(plan.status!=='prepared-geometry')return plan;
  const {scene,surfaces,source,listener,vertices,points,conditional,distance}=plan,tile=scene.tile;
  const hits = [];
  let uncertain = false,ambiguousContact=false;const unmappedRegions=new Set();
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i],
      b = vertices[i + 1];
    const q = queries ? queries[i] : querySegment(tile, a, b);
    stats.queries++;
    stats.surfaceTests += q.surfaceTests;
    const sharedEndpoint = (hit, face) => {
      if (hit.id === face.id) return true;
      if (scene.config?.installedReflectionTrains !== true) return false;
      const neighbour = surfaceLookup(tile).get(hit.id);
      // Only an actual contact on both finite footprints at this endpoint.
      // A non-coplanar neighbour or an intervening hit still blocks the leg.
      const edge=neighbour && sharedReflectionEdge(face,neighbour);
      return edge && distanceToReflectionEdge(hit.point,edge)<=E;
    };
    const actual = q.hits.filter(
      (h) =>
        !(
          (i > 0 && Math.abs(h.t) < E && sharedEndpoint(h, surfaces[i - 1])) ||
          (i < surfaces.length &&
            Math.abs(h.t - 1) < E && sharedEndpoint(h, surfaces[i]))
        ),
    );
    hits.push(...actual);
    ambiguousContact||=q.ambiguous.length>0;for(const id of q.unknown)unmappedRegions.add(id);
    if (
      q.ambiguous.length ||
      q.unknown.length ||
      (tile.coverage !== "complete-synthetic" && !conditional)
    )
      uncertain = true;
  }
  // Limited operation through an unmapped static region retains the existing
  // conditional direct source, explicitly labelled as such. It grants no
  // reflection/clearance authority, and never bypasses a represented wall or
  // ambiguous contact. Every reflected leg still fails on an unknown region.
  const unknownDirectFallback=uncertain&&!surfaces.length&&!hits.length&&!ambiguousContact&&unmappedRegions.size>0&&scene.observationModel?.kind==='conditional-installed-static-model';
  if (uncertain&&!unknownDirectFallback) return { status: "unknown", distance, hits,
    ...(scene.observationModel?.kind==='conditional-installed-static-model'?{ambiguousContact,unmappedRegions:[...unmappedRegions]}:{}) };
  if (hits.length && surfaces.length)
    return { status: "blocked-reflection", distance, hits };
  return {
    status: hits.length ? "blocked" : "clear",
    distance,
    points,
    hits,
    arrivalDirection: unit(sub(vertices.at(-2), listener)),
    emissionDirection: unit(sub(vertices[1], source)),
    ...(unknownDirectFallback?{unknownDirectFallback:true,unmappedRegions:[...unmappedRegions]}:{}),
  };
}
export function candidatePaths(scene, {maxReflectors=scene.config.maxReflectors}={}) {
  requireValue(Number.isInteger(maxReflectors)&&maxReflectors>=1&&maxReflectors<=16,'bounded reflector candidates');
  if(scene.directPath)return [{id:'direct',surfaces:[]}];
  // Stable deterministic cap by ID. No hidden change of material or invented echo when pruned.
  const installedIds=scene.observationModel?.kind==='conditional-installed-static-model'?scene.observationModel.reflectionSurfaceIds:null;
  const byId=installedIds?surfaceLookup(scene.tile):null;
  if(installedIds!==undefined&&installedIds!==null)requireValue(Array.isArray(installedIds)&&installedIds.length<=16&&new Set(installedIds).size===installedIds.length&&installedIds.every(id=>byId.has(id)),'finite installed reflection candidates');
  const s = (installedIds?installedIds.map(id=>byId.get(id)):[...scene.tile.surfaces].sort((a, b) => a.id.localeCompare(b.id, "en")))
      .slice(0, maxReflectors),
    result = [{ id: "direct", surfaces: [] }];
  if (scene.config.installedReflectionTrains === true && installedIds) {
    const selected = new Map(s.map(surface => [surface.id, surface]));
    const planes=new Map(s.map(face=>[face,reflectionPlaneId(face)]));
    const neighbours = new Map(s.map(face=>[face,s.filter(other=>planes.get(other)===planes.get(face)&&sharedReflectionEdge(face,other))]));
    for (const sequence of scene.observationModel.reflectionSequences) {
      if (!sequence.every(id => selected.has(id))) continue;
      const surfaces = sequence.map(id => selected.get(id));
      const adjacentFaces = surfaces.map(face=>neighbours.get(face));
      result.push({id:'r:' + sequence.join('>'), surfaces,
        ...(adjacentFaces.some(faces=>faces.length)?{adjacentFaces}:{}),
        continuityId:'r:' + surfaces.map(face=>planes.get(face)).join('>')});
    }
    return result;
  }
  if (scene.config.order >= 1)
    for (const a of s) result.push({ id: "r:" + a.id, surfaces: [a] });
  if (scene.config.order === 2)
    for (const a of s)
      for (const b of s)
        if (a.id !== b.id)
          result.push({ id: "r:" + a.id + ">" + b.id, surfaces: [a, b] });
  if (scene.config.higherOrderPaths?.length) {
    const selected = new Map(s.map(surface => [surface.id, surface]));
    const identities = new Set(result.map(path => path.id));
    for (const sequence of scene.config.higherOrderPaths) {
      // Explicit finite routes only: never enumerate an exponential path tree.
      // Every bounce must survive the same quality reflector cap as lower orders.
      if (!sequence.every(surfaceId => selected.has(surfaceId))) continue;
      const id = 'r:' + sequence.join('>');
      if (identities.has(id)) continue;
      identities.add(id);
      result.push({ id, surfaces: sequence.map(surfaceId => selected.get(surfaceId)) });
    }
  }
  return result;
}
export function solvePath(
  scene,
  source,
  listenerTrack,
  arrivalTime,
  candidate,
  stats = { queries: 0, surfaceTests: 0 },
  geometryTimeMs = (scene.tile?.createdAt??0) + arrivalTime * 1000,
) {
  return finishPath(preparePath(scene,source,listenerTrack,arrivalTime,candidate,geometryTimeMs),null,stats);
}
export function preparePath(scene,source,listenerTrack,arrivalTime,candidate,
  geometryTimeMs=(scene.tile?.createdAt??0)+arrivalTime*1000) {
  return prepareReceiver(scene,listenerTrack,arrivalTime,geometryTimeMs)(source,candidate);
}
// Geometry lifetime and the receiver belong to the arrival block. Retarded
// emission, finite faces, visibility and radiation are solved for each source.
export function prepareReceiver(scene,listenerTrack,arrivalTime,
  geometryTimeMs=(scene.tile?.createdAt??0)+arrivalTime*1000) {
  if (
    !Number.isFinite(arrivalTime) ||
    arrivalTime < 0 ||
    (!scene.directPath && (!Number.isFinite(geometryTimeMs) || geometryTimeMs < scene.tile.createdAt ||
    geometryTimeMs >= validUntil(scene.tile)))
  )
    return () => ({ status: "geometry-time-unavailable" });
  const listener = pose(listenerTrack, arrivalTime);
  if (!listener.valid) return () => ({ status: "listener-unavailable" });
  return (source,candidate)=>prepareEmission(scene,source,listener,arrivalTime,candidate);
}
function prepareEmission(scene,source,listener,arrivalTime,candidate) {
  let emission = arrivalTime,
    residual = Infinity;
  for (let i = 0; i < 20; i++) {
    const position = trackPosition(source.track, emission);
    const d = imageDistance(position, candidate.surfaces, listener.position);
    const next = arrivalTime - d / scene.config.soundSpeed;
    residual = Math.abs(next - emission);
    emission = next;
    if (residual < 1e-10) break;
  }
  const state = pose(source.track, emission);
  if (!state.valid || residual > 1e-7)
    return { status: "source-unavailable-or-retarded-time-unconverged" };
  let crossedEdge=false;
  const faceAtPoint=candidate.adjacentFaces?(i,point)=>{
    const face=candidate.surfaces[i];
    if(onPatch(face,point))return face;
    crossedEdge=true;
    return candidate.adjacentFaces[i].find(other=>onPatch(other,point));
  }:null;
  let geometry=preparePathGeometry(scene,state.position,listener.position,candidate.surfaces,faceAtPoint);
  if(crossedEdge){
    // A different finite face needs its own retarded emission time and
    // complete solve. If it fails, keep the original finite-miss reason.
    if(geometry.status==='prepared-geometry'){
      const surfaces=geometry.surfaces;
      return prepareEmission(scene,source,listener,arrivalTime,{surfaces,
        id:'r:'+surfaces.map(s=>s.id).join('>'),continuityId:candidate.continuityId});
    }
    geometry={status:'outside-finite-patch-or-opening'};
  }
  return {status:'prepared-path',scene,source,listener,arrivalTime,candidate,state,emission,residual,geometry};
}
export function pathSegments(plan) {
  if(plan.status!=='prepared-path'||plan.geometry.status!=='prepared-geometry')return [];
  return plan.geometry.vertices.slice(0,-1).map((a,i)=>({a,b:plan.geometry.vertices[i+1]}));
}
export function finishPath(plan,queries=null,stats={queries:0,surfaceTests:0}) {
  if(plan.status!=='prepared-path')return plan;
  const {scene,source,listener,arrivalTime,candidate,state,emission,residual}=plan;
  const g=finishPathGeometry(plan.geometry,queries,stats);
  if (!["clear", "blocked"].includes(g.status)) return g;
  if (g.distance / scene.config.soundSpeed > scene.config.maxDelay)
    return { status: "delay-budget" };
  let bands = [1, 1, 1],
    materialBasis = [];
  const interactions = candidate.surfaces.length
    ? candidate.surfaces.map((s) => [s.id, "reflection"])
    : g.hits.map((h) => [h.id, "transmission"]);
  for (const [id, kind] of interactions) {
    const m = scene.materials[id];
    if (!m) return { status: "material-unknown" };
    bands = bands.map((x, i) => x * Math.sqrt(m[kind][i]));
    materialBasis.push({
      surface: id,
      kind,
      basis: m.basis,
      reference: m.reference,
    });
  }
  if (bands.every((x) => x === 0))
    return { status: "blocked-no-modelled-path" };
  const radiation =
    g.distance <= E
      ? 1
      : 1 -
        source.directivity +
        (source.directivity *
          (1 +
            Math.max(
              -1,
              Math.min(1, dot(state.forward, g.emissionDirection)),
            ))) /
          2;
  const spreading=spreadingDistance(g.distance,scene.config.referenceDistance,source.nearFieldRadius??0);
  if (scene.config.surfaceRoughnessRmsMetres > 0 && candidate.surfaces.length) {
    // For Gaussian height variation the mean specular pressure at frequency f
    // is multiplied by exp(-2 (k sigma cos(theta))²) at each contact. Use
    // independent height variations and nominal frequencies for our three
    // broad bands. Energy scattered in other directions is not synthesized.
    let incidenceSum = 0;
    let from = state.position;
    for (let i = 0; i < candidate.surfaces.length; i++) {
      const leg = sub(g.points[i], from);
      const cosine = dot(leg, candidate.surfaces[i].normal) / length(leg);
      incidenceSum += cosine * cosine;
      from = g.points[i];
    }
    const phase = (2 * Math.PI / scene.config.soundSpeed) * scene.config.surfaceRoughnessRmsMetres;
    const exponent = -2 * incidenceSum * phase * phase;
    bands = coherentBandFrequencies.map((frequency,i) => bands[i] * Math.exp(exponent * frequency * frequency));
  }
  if (source.roadExhaust && g.distance > E) {
    // Authored tailpipe radiation. Use the departing leg, including for
    // reflections whose arrival direction points away from the vehicle.
    const cosine = Math.max(-1, Math.min(1, dot(state.forward, g.emissionDirection)));
    const cardioid = (1 + cosine) / 2;
    const polar = [.76 + .24 * cardioid, .24 + .76 * cardioid ** 2, .07 + .93 * cardioid ** 3];
    bands = bands.map((band,i) => band * polar[i]);
  }
  bands = bands.map(
    (x, i) =>
      ((x * (source.roadExhaust ? 1 : radiation) * scene.config.referenceDistance) /
        spreading) *
      10 ** ((-scene.config.airDbPerMetre[i] * g.distance) / 20),
  );
  const pan = Math.max(
    -1,
    Math.min(1, dot(g.arrivalDirection, listener.right)),
  );
  return {
    status: "renderable",
    id: candidate.id,
    order: candidate.surfaces.length,
    emissionTime: emission,
    arrivalTime,
    distance: g.distance,
    delay: g.distance / scene.config.soundSpeed,
    bands,
    pan,
    points: g.points,
    arrivalDirection: g.arrivalDirection,
    emissionDirection: g.emissionDirection,
    materialBasis,
    nearFieldRadius:source.nearFieldRadius??0,
    geometryEvidence: g.unknownDirectFallback?'conditional-direct-fallback-unmapped-regions':scene.directPath?'conditional-listener-only-no-geometry':scene.observationModel?.kind==='conditional-installed-static-model'?'conditional-genuine-installed-static-model':scene.observationModel ? 'conditional-finite-observed-model' : 'synthetic-model',
    visibilityAssumption:scene.directPath?.visibilityAssumption??scene.observationModel?.visibilityAssumption??null,
    generation: state.generation,
    visibility:
      g.unknownDirectFallback?'conditional-direct-unknown-coverage':scene.directPath?'conditional-unobserved-space-assumed-clear':scene.observationModel
        ? (g.status === 'blocked' ? 'authored-transmission-in-partial-model' : scene.observationModel.kind==='conditional-installed-static-model'?'conditional-installed-static-path':'conditional-observed-path')
        : g.status === "blocked" ? "authored-transmission" : "verified-synthetic-path",
    retardedResidual: residual,
  };
}

// One resolved image path lends part of its last reflection to one finite
// off-specular return. The three fractions are illustrative rough concrete
// assumptions at 200 / 1600 / 6400 Hz, not a GTA surface measurement.
const scatterEnergy = [.18, .33, .48];
const scatterOffsets = [6, -4, 2];
export const roadScatterLimit = 3;
export const roadScatterDelayLimit = .13;

function scatterSurfaceAt(tile, surface, point, stats) {
  if(!inBox(point,tile.bounds))return null;
  if(onPatch(surface,point))return {face:surface,point};
  // Finite collision tessellation can change grade and normal across
  // triangles. Intersect a short normal probe and use the actual hit, with
  // bounded grade and tilt, rather than extending the original plane.
  const delta=scale(surface.normal,.45);
  const from=sub(point,delta),to=sub(point,scale(delta,-1));
  if(!inBox(from,tile.bounds)||!inBox(to,tile.bounds))return null;
  const q=querySegment(tile,from,to);
  stats.queries++;
  stats.surfaceTests+=q.surfaceTests;
  if(q.unknown.length||q.ambiguous.length)return null;
  const lookup=surfaceLookup(tile);
  let chosen=null,distance=Infinity;
  for(const hit of q.hits){
    const face=lookup.get(hit.id);
    const d=Math.abs(hit.t-.5);
    if(d<distance&&face?.motion==='static'&&Math.abs(dot(face.normal,surface.normal))>=.97){
      chosen={face,point:hit.point};
      distance=d;
    }
  }
  return chosen;
}

function prepareScatter(plan, early, offset, stats) {
  const {scene, source, listener, arrivalTime}=plan;
  const surfaces=plan.geometry.surfaces;
  const parent=surfaces.at(-1);
  if(parent.motion!=='static')return null;
  // Horizontal tangent on wall faces. A fixed world direction on horizontal
  // supports stays consistent across changes of finite triangle/winding.
  const normal=parent.normal;
  const heading=plan.state.forward;
  const longitudinal=sub(heading,scale(normal,dot(heading,normal)));
  const direction=Math.abs(normal[2])<.75 ? unit([-normal[1],normal[0],0]) :
    unit(length(longitudinal)>1e-4 ? longitudinal : [1-normal[0]**2,-normal[0]*normal[1],-normal[0]*normal[2]]);
  const tangent=direction.find(x=>Math.abs(x)>1e-6)<0?scale(direction,-1):direction;
  const anchor=early.points.at(-1);
  const sampled=scatterSurfaceAt(scene.tile,parent,anchor.map((x,i)=>x+offset*tangent[i]),stats);
  if(!sampled)return null;
  const {face,point:contact}=sampled;
  const preceding=surfaces.slice(0,-1);
  const outgoing=separation(contact,listener.position);
  if(outgoing<=E)return null;
  let emission=early.emissionTime,residual=Infinity;
  for(let i=0;i<20;i++){
    const position=trackPosition(source.track,emission);
    const distance=imageDistance(position,preceding,contact)+outgoing;
    const next=arrivalTime-distance/scene.config.soundSpeed;
    residual=Math.abs(next-emission);
    emission=next;
    if(residual<1e-10)break;
  }
  const state=pose(source.track,emission);
  if(!state.valid||state.generation!==early.generation||residual>1e-7||emission<source.track.keys[0].time-1e-9)return null;
  const prefix=preparePathGeometry(scene,state.position,contact,preceding,plan.candidate.adjacentFaces ?
    (i,p)=>onPatch(preceding[i],p)?preceding[i]:plan.candidate.adjacentFaces[i].find(s=>onPatch(s,p)) : null);
  if(prefix.status!=='prepared-geometry')return null;
  const distance=prefix.distance+outgoing;
  // At least an independently delayed arrival, within the bounded near room.
  if(distance-early.distance<.25||distance/scene.config.soundSpeed>roadScatterDelayLimit)return null;
  const from=prefix.vertices.at(-2);
  const a=differenceDot(from,contact,face.normal);
  const b=differenceDot(listener.position,contact,face.normal);
  if(a*b<=E||(face.reflectiveSide==='front'&&(a<=E||b<=E)))return null;
  const active=[...prefix.surfaces,face];
  const candidate={...plan.candidate,id:plan.candidate.id+':scatter:'+offset,surfaces:active};
  const geometry={...prefix,listener:listener.position,distance,surfaces:active,points:[...prefix.points,contact],
    vertices:[...prefix.vertices,listener.position]};
  const scattered={...plan,candidate,geometry,state,emission,residual};
  const response=finishPath(scattered,null,stats);
  if(response.status!=='renderable')return null;
  // Diffuse directional collection is deliberately lossy and bounded. A
  // represented ray sees its actual surface, angle, air and distance loss.
  // Uncollected energy is outside these taps and is intentionally absent.
  const collection=.70*Math.abs(a)/separation(from,contact)*Math.abs(b)/outgoing;
  const bands=response.bands.map((value,i)=>
    Math.min(early.bands[i],value)*Math.sqrt(scatterEnergy[i]*Math.min(1,collection)));
  bands[1]=Math.min(bands[0],bands[1]);
  bands[2]=Math.min(bands[1],bands[2]);
  if(bands[0]===0)return null;
  return {plan:scattered,candidate,response:{...response,bands,scatter:true}};
}

export function roadScatterFromReflection(plan, early, stats) {
  for(const offset of scatterOffsets){
    const scatter=prepareScatter(plan,early,offset,stats);
    if(scatter)return scatter;
  }
  return null;
}

// The calibration here is for represented wall and canopy returns. A road
// surface below the listener retains its existing ground reflection.
export function roadScatterSupport(plan, early) {
  const parent=plan.geometry.surfaces.at(-1);
  const anchor=early.points.at(-1);
  return parent.motion==='static'&&(Math.abs(parent.normal[2])<.75||
    anchor[2]>Math.max(plan.state.position[2],plan.listener.position[2]));
}

export function roadScatterEarlyBands(bands) {
  return bands.map((band,i)=>band*Math.sqrt(1-scatterEnergy[i]));
}
