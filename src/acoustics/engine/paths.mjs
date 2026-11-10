// Finite image-source extension. Reuses the validated research geometry and visibility queries.
import {
  add,
  sub,
  scale,
  dot,
  length,
  unit,
  onPatch,
  querySegment,
  inBox,
} from "../research/local-geometry.mjs";
import { pose, requireValue } from "./contracts.mjs";
const E = 1e-8;
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
export const mirror = (p, s) =>
  add(p, scale(s.normal, -2 * dot(sub(p, s.center), s.normal)));
export function imageFor(p, surfaces) {
  for (const s of surfaces) p = mirror(p, s);
  return p;
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
export function preparePathGeometry(scene,source,listener,surfaces) {
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
  if (!surfaces.length && length(sub(source, listener)) <= E)
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
  const points = new Array(surfaces.length);
  let end = listener;
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const s = surfaces[i],
      delta = sub(images[i + 1], end),
      den = dot(delta, s.normal);
    if (Math.abs(den) < E) return { status: "parallel" };
    const t = -dot(sub(end, s.center), s.normal) / den;
    if (t <= E || t >= 1 - E) return { status: "wrong-reflection-order" };
    const p = add(end, scale(delta, t));
    if (!onPatch(s, p)) return { status: "outside-finite-patch-or-opening" };
    points[i] = p;
    end = p;
  }
  const vertices = [source, ...points, listener];
  let distance = 0;
  for (let i = 1; i < vertices.length; i++) {
    const leg = length(sub(vertices[i], vertices[i - 1]));
    if (leg <= E) return { status: "degenerate" };
    distance += leg;
  }
  // A bounce must stay on one side of its plane. Reject impossible paths
  // before querying the tile or putting their legs in the GPU visibility batch.
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i],
      a = dot(sub(vertices[i], s.center), s.normal),
      b = dot(sub(vertices[i + 2], s.center), s.normal);
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
    const actual = q.hits.filter(
      (h) =>
        !(
          (i > 0 && h.id === surfaces[i - 1].id && Math.abs(h.t) < E) ||
          (i < surfaces.length &&
            h.id === surfaces[i].id &&
            Math.abs(h.t - 1) < E)
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
  if(installedIds!==undefined&&installedIds!==null)requireValue(Array.isArray(installedIds)&&installedIds.length<=16&&new Set(installedIds).size===installedIds.length&&installedIds.every(id=>scene.tile.surfaces.some(s=>s.id===id)),'finite installed reflection candidates');
  const s = (installedIds?installedIds.map(id=>scene.tile.surfaces.find(s=>s.id===id)):[...scene.tile.surfaces].sort((a, b) => a.id.localeCompare(b.id, "en")))
      .slice(0, maxReflectors),
    result = [{ id: "direct", surfaces: [] }];
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
  if (
    !Number.isFinite(arrivalTime) ||
    arrivalTime < 0 ||
    (!scene.directPath && (!Number.isFinite(geometryTimeMs) || geometryTimeMs < scene.tile.createdAt ||
    geometryTimeMs >=
      Math.min(
        scene.tile.validUntil,
        ...scene.tile.surfaces.map((s) => s.validUntil),
      )))
  )
    return { status: "geometry-time-unavailable" };
  const listener = pose(listenerTrack, arrivalTime);
  if (!listener.valid) return { status: "listener-unavailable" };
  let emission = arrivalTime,
    residual = Infinity,
    state;
  for (let i = 0; i < 20; i++) {
    state = pose(source.track, emission);
    const d = length(
      sub(imageFor(state.position, candidate.surfaces), listener.position),
    );
    const next = arrivalTime - d / scene.config.soundSpeed;
    residual = Math.abs(next - emission);
    emission = next;
    if (residual < 1e-10) break;
  }
  state = pose(source.track, emission);
  if (!state.valid || residual > 1e-7)
    return { status: "source-unavailable-or-retarded-time-unconverged" };
  const geometry=preparePathGeometry(scene,state.position,listener.position,candidate.surfaces);
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
  bands = bands.map(
    (x, i) =>
      ((x * radiation * scene.config.referenceDistance) /
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
