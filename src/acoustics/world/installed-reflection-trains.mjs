import {onPatch} from '../research/local-geometry.mjs';
import {preparePathGeometry, finishPathGeometry, reflectionPlaneId} from '../engine/paths.mjs';

// Fixed worker-side ceilings. Plane sequences are tested before any face is
// admitted to the existing 16-reflector workset. No triangle permutation tree.
const pairPlanes = 24, triplePlanes = 8, facesPerPlane = 32, visiblePerOrder = 24;

function distanceToFaceBounds(position, bounds) {
  let squared = 0;
  for (let i = 0; i < 3; i++) {
    const d = Math.max(bounds.min[i] - position[i], position[i] - bounds.max[i], 0);
    squared += d * d;
  }
  return Math.sqrt(squared);
}

const faceBounds = new WeakMap();
function boundsFor(surface) {
  // Retimed worker tiles reuse these immutable support coordinates.
  let bounds = faceBounds.get(surface.corners);
  if (!bounds) {
    const points = surface.footprint?.map(([u,v]) => surface.center.map((x,i) =>
      x + u * surface.u[i] + v * surface.v[i])) ?? surface.corners;
    bounds = {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),
      max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))),
      area:surface.footprint ? surface.footprint.reduce((sum,[u,v],i,polygon)=>{
        const next=polygon[(i+1)%polygon.length];
        return sum+(u*next[1]-v*next[0])/2;
      },0) : 4*surface.half[0]*surface.half[1]};
    faceBounds.set(surface.corners, bounds);
  }
  return bounds;
}

function apparentArea(face,area,point) {
  const x=point[0]-face.center[0], y=point[1]-face.center[1], z=point[2]-face.center[2];
  const distance=Math.max(.25, Math.hypot(x,y,z));
  return area*Math.abs(x*face.normal[0]+y*face.normal[1]+z*face.normal[2])/(distance**3);
}

function rankedPlanes(tile, sources, listener) {
  const planes = new Map();
  for (const face of tile.surfaces) {
    const id = reflectionPlaneId(face), bounds = boundsFor(face);
    const distance = distanceToFaceBounds(listener,bounds) +
      Math.min(...sources.map(p=>distanceToFaceBounds(p,bounds)));
    let plane = planes.get(id);
    if (!plane) {
      plane = {id, distance:Infinity, prominence:0, side:Math.abs(face.normal[2]) < .7, members:[]};
      planes.set(id, plane);
    }
    plane.distance = Math.min(plane.distance,distance);
    plane.prominence += Math.sqrt(apparentArea(face,bounds.area,listener) *
      Math.max(...sources.map(p=>apparentArea(face,bounds.area,p))));
    plane.members.push({face,distance});
  }
  const ranked = [...planes.values()].sort((a,b)=>a.distance-b.distance || a.id.localeCompare(b.id));
  for (const plane of ranked) {
    plane.faces = plane.members.sort((a,b)=>a.distance-b.distance || a.face.id.localeCompare(b.face.id))
      .slice(0,facesPerPlane).map(s=>s.face);
  }
  return ranked;
}

// Reserve room for walls amongst finely triangulated terrain. All orientations
// remain eligible and every bounce is subsequently tested on its finite face.
function shortlist(planes, count) {
  const prominent = [...planes].sort((a,b)=>b.prominence-a.prominence || a.id.localeCompare(b.id));
  const quarter = Math.floor(count/4);
  return [...new Set([...prominent.filter(p=>p.side).slice(0,quarter),
    ...planes.filter(p=>p.side).slice(0,quarter),...prominent.slice(0,quarter),...planes])].slice(0,count);
}

function estimatedPressure(faces, materials, distance, air) {
  const bands = [1,1,1];
  for (const face of faces) {
    const material = materials[face.id];
    if (!material) return 0;
    for (let i = 0; i < 3; i++) bands[i] *= Math.sqrt(material.reflection[i]);
  }
  return Math.max(...bands.map((gain,i)=>gain * 10 ** (-air[i]*distance/20))) / Math.max(1,distance);
}

export function discoverInstalledReflectionTrains(tile, poses, listener, materials, engine) {
  const sources = poses.length ? poses : [listener], ranked = rankedPlanes(tile,sources,listener);
  const pairs = shortlist(ranked,pairPlanes), triples = shortlist(ranked,triplePlanes);
  const proposals = shortlist(ranked,128).map(p=>[p]);
  for (const a of pairs) for (const b of pairs) if (a!==b) proposals.push([a,b]);
  for (const a of triples) for (const b of triples) if (a!==b)
    for (const c of triples) if (b!==c) proposals.push([a,b,c]);
  const stats = {planes:ranked.length,pairPlanes:pairs.length,triplePlanes:triples.length,
    proposed:[0,0,0,0],finite:[0,0,0,0],tested:[0,0,0,0],qualified:[0,0,0,0],admitted:[0,0,0,0],
    visibilitySegments:0,surfaceTests:0,geometryMs:0,visibilityMs:0};
  const report = {finiteCandidates:0,testedCandidates:0,knownHit:0,ambiguous:0,unknown:0,
    qualified:0,unknownByReason:{},multiBounce:stats};
  const model = {tile,config:engine,observationModel:{kind:'conditional-installed-static-model',
    visibilityAssumption:'unobserved-space-assumed-clear'}};
  const maxDistance = (engine.maxDelay ?? 2) * (engine.soundSpeed ?? 343);
  const air = engine.airDbPerMetre ?? [.0001,.001,.01];
  const visibility = {queries:0,surfaceTests:0}, routes = new Map(), reasons = new Map(tile.missingRegions.map(r=>[r.id,r.reason]));
  const compare = (a,b)=>b.pressure-a.pressure || a.key.localeCompare(b.key);
  for (const source of sources) {
    const start = performance.now(), pending = [[],[],[],[]];
    for (const sequence of proposals) {
      const order = sequence.length;
      stats.proposed[order]++;
      const representatives = sequence.map(p=>p.faces[0]);
      const plan = preparePathGeometry(model,source,listener,representatives,
        (i,point)=>sequence[i].faces.find(face=>onPatch(face,point)));
      if (plan.status!=='prepared-geometry' || plan.distance>maxDistance) continue;
      // Different members of a plane bucket can have tiny numeric differences.
      // Solve on the actual supporting faces again before querying visibility.
      const exact = plan.surfaces.every((s,i)=>s===representatives[i]) ? plan :
        preparePathGeometry(model,source,listener,plan.surfaces);
      if (exact.status!=='prepared-geometry' || exact.distance>maxDistance) continue;
      const pressure = estimatedPressure(exact.surfaces,materials,exact.distance,air);
      if (!pressure) continue;
      const ids = exact.surfaces.map(s=>s.id);
      pending[order].push({plan:exact,ids,key:ids.join('>'),pressure});
      stats.finite[order]++;
    }
    stats.geometryMs += performance.now() - start;
    const visibilityStart = performance.now();
    for (let order=1;order<=3;order++) {
      const best = pending[order].sort(compare).slice(0,visiblePerOrder);
      for (const route of best) {
        stats.tested[order]++;
        const result = finishPathGeometry(route.plan,null,visibility);
        if (result.status!=='clear') {
          if(result.hits?.length) report.knownHit++;
          if(result.ambiguousContact) report.ambiguous++;
          if(result.status==='unknown') {
            report.unknown++;
            for(const reason of new Set(result.unmappedRegions.map(id=>reasons.get(id))))
              report.unknownByReason[reason]=(report.unknownByReason[reason]??0)+1;
          }
          continue;
        }
        stats.qualified[order]++;
        const held=routes.get(route.key);
        if(!held || held.pressure<route.pressure) routes.set(route.key,route);
      }
    }
    stats.visibilityMs += performance.now() - visibilityStart;
  }
  stats.visibilitySegments=visibility.queries;
  stats.surfaceTests=visibility.surfaceTests;
  report.finiteCandidates=stats.finite[1]; report.testedCandidates=stats.tested[1]; report.qualified=stats.qualified[1];
  const ids = new Set(), sequences = [];
  const available=[...routes.values()].sort(compare);
  for (const route of available) {
    const order=route.ids.length;
    if (sequences.length>=63) break;
    if (order===3 && stats.admitted[3]>=16) continue;
    const added=route.ids.filter(id=>!ids.has(id));
    if (ids.size+new Set(added).size>(engine.maxReflectors??8)) continue;
    for (const id of added) ids.add(id);
    sequences.push(route.ids);
    stats.admitted[order]++;
  }
  return {ids:[...ids],sequences,report};
}
