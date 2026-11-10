import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const exactSource = node => node?.SourceBinding?.State === 'exact-rel-metadata-bytes-sha256' &&
  /^[a-f0-9]{64}$/.test(node.SourceBinding.SHA256);
const recordHash = value => typeof value === 'string' && /^(?:0x)?[a-f0-9]{8}$/i.test(value) ? value.toLowerCase().replace(/^0x/, '') : null;
const vehicleType = 'Dat151Vehicle';
const granularType = 'Dat151VehicleEngineGranular';
const acceleration = [
  { field: 'EngineAccel', type: 'Dat54GranularSound' },
  { field: 'ExhaustAccel', type: 'Dat54EnvironmentSound' },
];
const conventional = ['EngineIdleLoop','ExhaustIdleLoop','EngineLow','EngineHigh','ExhaustLow','ExhaustHigh','RevsOff']
  .map(field=>({field,type:'Dat54SimpleSound'}));

// Names accepted by the planner are already lowercase ASCII.
function privateNameHash(name) {
  let hash = 0;
  for (const character of name) {
    hash += character.charCodeAt(0);
    hash += hash << 10;
    hash ^= hash >>> 6;
  }
  hash += hash << 3;
  hash ^= hash >>> 11;
  hash += hash << 15;
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildShadowPlan(namespace, root, clones, nodes, outgoing, variant) {
  if (!/^ra_shadow_[a-f0-9]{16}$/.test(namespace)) throw Error('Invalid private shadow namespace');
  const occupied = new Set([...nodes.values()].map(node=>recordHash(node.Record?.Hash)));
  for (const edges of outgoing.values()) for (const edge of edges) occupied.add(recordHash(edge.Hash));
  const names = new Map();
  for (const [key, clone] of clones) {
    const name = namespace + '_' + clone.role.toLowerCase();
    const hash = privateNameHash(name);
    if (hash === '00000000' || occupied.has(hash)) throw Error('Private audio name hash collision: ' + name);
    occupied.add(hash);
    names.set(key, {name,hash});
  }
  const records = [...clones].map(([key,{stock,role}])=>{
    const node = nodes.get(stock), original = outgoing.get(stock) ?? [];
    const relocations = [], preserved = [];
    for (const [index, edge] of variant.get(key).entries()) {
      const from = original[index], to = names.get(edge.Targets[0]);
      if (!to) {
        preserved.push({field:from.Field, hash:recordHash(from.Hash),
          namespace:from.Namespace ?? null, resolution:from.Resolution});
        continue;
      }
      if (from.DeclaredType !== 'CodeWalker.GameFiles.MetaHash' || from.Namespace !== 'audio-record-candidate' ||
          !/^[A-Za-z][A-Za-z0-9]*$/.test(from.Field)) throw Error('Untyped relocation: ' + role + '.' + from.Field);
      relocations.push({field:from.Field, from:recordHash(from.Hash), to:to.hash, privateTarget:to.name});
    }
    return {role, ...names.get(key), stock:{id:stock,type:node.Record.ParserType,hash:recordHash(node.Record.Hash),
      sourceSha256:node.SourceBinding.SHA256}, relocations, preserved,
      opaqueFields:node.ProjectionGaps ?? []};
  });
  return {
    kind:'RichAudioPrivateTopology02', scope:'identity and reference relocation only',
    root:names.get(root), records,
    collisionCheck:'retained projection only',
    disabled:true, globalNamespaceVerified:false, bodiesSerialized:false, suppressionQualified:false,
  };
}

function traceRecords(entry, nodes, outgoing) {
  const paths = new Map();
  const boundaries = [];
  const queue = [{edge:entry, fields:[entry.Field]}];
  for (let i = 0; i < queue.length; i++) {
    const {edge, fields} = queue[i];
    const hash = recordHash(edge.Hash);
    const node = nodes.get(edge.Targets[0]);
    if (hash === '00000000' && edge.Resolution === 'zero-reference-not-proof-of-silence' && !edge.Targets.length) continue;
    if (edge.Namespace === 'awc-container-or-stream') {
      boundaries.push({fields, hash, state:'external-wave-reference'});
      continue;
    }
    if (edge.Resolution !== 'unique-public-audio-record' || edge.Targets.length !== 1 ||
        !hash || hash === '00000000' || !exactSource(node) || recordHash(node.Record?.Hash) !== hash) {
      boundaries.push({fields, hash, state:edge.Resolution === 'unique-public-audio-record' ?
        'target-omitted-unbound-or-mismatched' : edge.Resolution});
      continue;
    }
    if (paths.has(node.Id)) continue;
    paths.set(node.Id, fields);
    for (const gap of node.ProjectionGaps ?? []) boundaries.push({fields, state:gap});
    for (const child of outgoing.get(node.Id) ?? []) queue.push({edge:child, fields:[...fields, child.Field]});
  }
  return {paths, boundaries};
}

function continuousBoundary(nodes, outgoing, vehicle, scopes, granular) {
  const candidates = [], retained = [];
  for (const scope of [{parent:vehicle, routes:scopes.map(({edge})=>({field:edge.Field}))}, ...scopes]) {
    const prefix = scope.edge ? scope.edge.Field + '.' : '';
    for (const edge of outgoing.get(scope.parent) ?? []) {
      const row = {route:prefix + edge.Field, edge};
      if (scope.routes.some(({field})=>field === edge.Field)) {
        if (scope.parent !== vehicle) candidates.push({...row, kind:'continuous-candidate'});
      } else if (scope.parent === granular && /^(Engine|Exhaust)Submix(Preset)?$/.test(edge.Field)) {
        candidates.push({...row, kind:'parallel-synth-dependency'});
      } else {
        retained.push(row);
      }
    }
  }
  const retainedByRecord = new Map();
  const unclassifiedRetainedFields = [];
  for (const {route, edge} of retained) {
    if (/(^|\.)Unk[0-9]+$/.test(route) && recordHash(edge.Hash) !== '00000000') unclassifiedRetainedFields.push(route);
    for (const [id, fields] of traceRecords(edge, nodes, outgoing).paths) {
      if (!retainedByRecord.has(id)) retainedByRecord.set(id, []);
      retainedByRecord.get(id).push({route, fields});
    }
  }
  return {
    scope:'retained typed projection; paths are reference witnesses, not audible routing',
    unclassifiedRetainedFields,
    retainedRootAliases:[...retainedByRecord].flatMap(([id, witnesses])=>{
      const routes = witnesses.filter(({fields})=>fields.length === 1).map(({route})=>route);
      const {ParserType,Hash} = nodes.get(id).Record;
      return routes.length > 1 ? [{type:ParserType, hash:recordHash(Hash), routes}] : [];
    }),
    routes:candidates.map(({route, edge, kind})=>{
      const {paths,boundaries} = traceRecords(edge, nodes, outgoing);
      return {route, kind, hash:recordHash(edge.Hash), reachableRecords:paths.size,
        sharedRecords:[...paths].filter(([id])=>retainedByRecord.has(id)).map(([id,fields])=>({
          type:nodes.get(id).Record.ParserType, hash:recordHash(nodes.get(id).Record.Hash),
          fields, retainedWitnesses:retainedByRecord.get(id),
        })),
        boundaries,
      };
    }),
  };
}

// The projection can discriminate shared-record edits from field-level redirects.
// The result grants no registration, runtime control or restoration authority.
export function compareBatiAccelerationRedirect01(graph,{continuous=false,shadowNamespace=null}={}) {
  if (shadowNamespace !== null && !continuous) throw Error('Shadow plan requires continuous audio scope');
  if (graph?.Kind !== 'RichAudioBatiAudioDependencyGraph01' ||
      !Array.isArray(graph.Nodes) || graph.Nodes.length > 256 ||
      !Array.isArray(graph.Edges) || graph.Edges.length > 4096 ||
      !Array.isArray(graph.Roots) || graph.Roots.length > 16) {
    throw Error('Bounded retained Bati audio projection required');
  }
  const nodes = new Map(graph.Nodes.map(node => [node.Id, node]));
  const outgoing = new Map();
  const reclassifiedWaveContainers = [];
  for (const edge of graph.Edges) {
    if (!nodes.has(edge.From) || !Array.isArray(edge.Targets) || edge.Targets.length > 16) {
      throw Error('Malformed audio reference projection');
    }
    if (!outgoing.has(edge.From)) outgoing.set(edge.From, []);
    // Historical projections predate classification of RelSound.AudioContainers.
    // Leave the retained artifact intact and exclude the false REL links here.
    const oldContainer = continuous && /^Dat54/.test(nodes.get(edge.From).Record?.ParserType) &&
      /^AudioContainers\[[0-9]+\]$/.test(edge.Field) && edge.Namespace === 'audio-record-candidate' &&
      recordHash(edge.Hash) !== '00000000';
    if (oldContainer) reclassifiedWaveContainers.push({
      field:edge.Field, hash:recordHash(edge.Hash),
      priorTargetTypes:edge.Targets.map(id=>nodes.get(id)?.Record?.ParserType ?? 'omitted'),
    });
    outgoing.get(edge.From).push(oldContainer ? {...edge, Namespace:'awc-container-or-stream',
      Resolution:'container-or-stream-not-audio-record-lookup', Targets:[]} : edge);
  }
  if (nodes.size !== graph.Nodes.length) throw Error('Duplicate projected record identity');
  const root = (label, type) => {
    const matches = graph.Roots.filter(item => item.Label === label);
    const node = nodes.get(matches[0]?.NodeId);
    if (matches.length !== 1 || matches[0].State !== 'resolved-metadata-root' ||
        !exactSource(node) || node.Record?.ParserType !== type) {
      throw Error('Missing or unbound typed audio root: ' + label);
    }
    return node.Id;
  };
  const exactEdge = (from, field, to) => {
    const matches = (outgoing.get(from) ?? []).filter(edge => edge.Field === field);
    if (matches.length !== 1 || matches[0].Resolution !== 'unique-public-audio-record' ||
        matches[0].Targets.length !== 1 || matches[0].Targets[0] !== to || !recordHash(matches[0].Hash) || recordHash(matches[0].Hash) !== recordHash(nodes.get(to).Record.Hash)) {
      throw Error('Missing, ambiguous or mismatched audio reference: ' + field);
    }
    return matches[0];
  };
  const vehicle = root('VehicleAudioRecord', vehicleType);
  const granular = root('GranularRecord', granularType);
  const vehicleRoute = exactEdge(vehicle, 'EngineGranular', granular);
  const engine=continuous?root('EngineRecord','Dat151VehicleEngine'):null;
  const granularDependencies=[];
  if(continuous){
    const resolved=(parent,field,type)=>{
      const id=outgoing.get(parent)?.find(edge=>edge.Field===field)?.Targets[0],node=nodes.get(id);
      if(!exactSource(node)||node.Record.ParserType!==type)throw Error('Missing or unbound typed audio root: '+field);
      return exactEdge(parent,field,id);
    };
    for(const role of ['Engine','Exhaust']){
      const synth=resolved(granular,role+'Submix','Dat10Synth');
      const preset=resolved(granular,role+'SubmixPreset','Dat10SynthPreset');
      granularDependencies.push({route:role.toLowerCase()+'-submix',synth:synth.Hash,preset:preset.Hash});
    }
    const idle=resolved(granular,'IdleSub','Dat54ModularSynthSound').Targets[0];
    const synth=resolved(idle,'SynthSound','Dat10Synth');
    const preset=(outgoing.get(idle)??[]).filter(edge=>edge.Field==='SynthPreset');
    if(preset.length!==1)throw Error('Exactly one modular idle synth preset field required');
    const presetHash=recordHash(preset[0].Hash);
    if(presetHash==='00000000'){
      if(preset[0].Targets.length!==0||preset[0].Resolution!=='zero-reference-not-proof-of-silence')throw Error('Invalid zero idle preset reference');
    }else resolved(idle,'SynthPreset','Dat10SynthPreset');
    granularDependencies.push({route:'granular-idle',synth:synth.Hash,preset:presetHash==='00000000'?null:preset[0].Hash});
  }
  const scopes=[{parent:granular,edge:vehicleRoute,routes:continuous?[...acceleration,{field:'IdleSub',type:'Dat54ModularSynthSound'}]:acceleration}];
  if(engine)scopes.push({parent:engine,edge:exactEdge(vehicle,'Engine',engine),routes:conventional});
  const vehicleEdges=new Map(),soundEdges=new Map(),privateParents=[];
  const privateVehicle=Symbol('private vehicle');
  const clones = new Map([[privateVehicle,{stock:vehicle,role:'Vehicle'}]]);
  const redirect=(edges,replacements)=>edges.map(edge=>
    replacements.has(edge)?{...edge,Targets:[replacements.get(edge)]}:edge);
  const variant=new Map(outgoing);
  for(const {parent,edge:parentEdge,routes} of scopes){
    const privateParent=Symbol(parentEdge.Field),redirects=new Map();
    clones.set(privateParent,{stock:parent,role:parentEdge.Field});
    vehicleEdges.set(parentEdge,privateParent);
    privateParents.push({privateParent,routes});
    for(const {field,type} of routes){
      const targetId=acceleration.some(route=>route.field===field)?root('Sounds.'+field,type):outgoing.get(parent)?.find(edge=>edge.Field===field)?.Targets[0];
      const target=nodes.get(targetId);
      if(!exactSource(target)||target.Record?.ParserType!==type)throw Error('Missing or unbound typed audio root: '+field);
      const edge=exactEdge(parent,field,targetId),privateSound=Symbol(field);
      clones.set(privateSound,{stock:targetId,role:field});
      redirects.set(edge,privateSound);
      soundEdges.set(edge,{privateSound,privateParent});
      variant.set(privateSound,outgoing.get(targetId)??[]);
    }
    variant.set(privateParent,redirect(outgoing.get(parent),redirects));
  }
  variant.set(privateVehicle,redirect(outgoing.get(vehicle),vehicleEdges));

  const reachable = (entry, adjacency) => {
    const seen = new Set();
    const pending = entry.flatMap(edge => edge.Targets);
    while (pending.length) {
      const id = pending.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const edge of adjacency.get(id) ?? []) for (const target of edge.Targets) pending.push(target);
    }
    return seen;
  };
  const stockVehicle = reachable(outgoing.get(vehicle), outgoing);
  const neighbor = reachable(variant.get(vehicle), variant);
  const otherRoutes = [
    ...variant.get(privateVehicle).filter(edge=>!scopes.some(scope=>scope.edge.Field===edge.Field)),
    ...privateParents.flatMap(({privateParent,routes})=>variant.get(privateParent)
      .filter(edge=>!routes.some(route=>route.field===edge.Field))),
  ];
  const preserved = reachable(otherRoutes, variant);
  const retainedEdges = [...outgoing.values()].flat();
  const referenceClosureComplete = graph.ReferenceClosureComplete === true &&
    graph.TraversalCompleteWithinPublicProjection === true &&
    graph.Roots.every(row=>row.State === 'resolved-metadata-root' && nodes.has(row.NodeId)) &&
    retainedEdges.every(edge=>{
      const hash = recordHash(edge.Hash);
      if (edge.Targets.length === 0) return hash === '00000000' && edge.Resolution === 'zero-reference-not-proof-of-silence' ||
        hash && edge.Namespace === 'awc-container-or-stream' && edge.Resolution === 'container-or-stream-not-audio-record-lookup';
      return edge.Resolution === 'unique-public-audio-record' && edge.Targets.length === 1 &&
        hash && hash !== '00000000' && recordHash(nodes.get(edge.Targets[0])?.Record?.Hash) === hash;
    });
  const proof = [...soundEdges].map(([edge,{privateSound:privateId,privateParent}]) => ({
    field:edge.Field,
    originalRecordReachableThroughRetainedFields:preserved.has(edge.Targets[0]),
    retainedInboundReferences:retainedEdges.filter(candidate =>
      candidate !== edge && candidate.Targets.includes(edge.Targets[0])).map(candidate => candidate.Field).sort(),
    selectedFieldResolvesToPrivateRecord:variant.get(privateParent)
      .some(candidate => candidate.Field === edge.Field && candidate.Targets[0] === privateId),
    privateRecordReachableThroughRetainedFields:preserved.has(privateId),
    privateRecordReachableFromNeighbor:neighbor.has(privateId),
  }));
  return {
    scope:'projected REL references only',
    privateRecordCount:1+scopes.length+soundEdges.size,
    ...(continuous?{
      continuousScope:'conventional idle/low/high/revs-off; player granular acceleration/idle synth',
      granularDependencies,
      continuousBoundary:continuousBoundary(nodes, outgoing, vehicle, scopes, granular),
      reclassifiedWaveContainers,
      granularSynthesisAudibleContributionVerified:false,
      unredirectedSubmixReferences:[...outgoing.get(granular),...outgoing.get(engine)]
        .filter(edge=>/Submix/.test(edge.Field)&&edge.Targets.length>0)
        .map(edge=>({field:edge.Field,targetTypes:edge.Targets.map(id=>nodes.get(id)?.Record?.ParserType??'unretained')})),
    }:{}),
    sameModelNeighborGraphUnchanged:stockVehicle.size === neighbor.size &&
      [...stockVehicle].every(id => neighbor.has(id)),
    ...(shadowNamespace===null?{}:{shadow:buildShadowPlan(shadowNamespace,privateVehicle,clones,nodes,outgoing,variant)}),
    routeComparisons:proof,
    unresolvedProjection:{
      referenceClosureComplete,
      traversalComplete:graph.TraversalCompleteWithinPublicProjection === true,
    },
    effectiveBaselineReadBack:false,
    runtimeAssignmentEnabled:false,
    selectiveSuppressionVerified:false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const continuous=process.argv[3]==='--continuous';
  const shadowNamespace=process.argv.length===6&&process.argv[4]==='--shadow' ? process.argv[5] : null;
  if(process.argv.length!==(continuous?(shadowNamespace===null?4:6):3))throw Error('Supply one retained project-private resolved catalogue and optional --continuous [--shadow namespace]');
  const projectPrivate = realpathSync(fileURLToPath(new URL('../.local/', import.meta.url)));
  const filename = realpathSync(process.argv[2]);
  if (!filename.startsWith(projectPrivate + path.sep) || !statSync(filename).isFile() ||
      statSync(filename).size > 64 * 1024 * 1024) throw Error('Bounded project-private retained input required');
  const bytes = readFileSync(filename);
  const catalogue = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const vehicles = catalogue.Vehicles?.filter(vehicle => vehicle.Model === 'bati') ?? [];
  if (vehicles.length !== 1) throw Error('Exactly one Bati projection required');
  const result = compareBatiAccelerationRedirect01(vehicles[0].AudioDependencyGraph01,{continuous,shadowNamespace});
  process.stdout.write(JSON.stringify({...result, retainedCatalogueSha256:createHash('sha256').update(bytes).digest('hex')}, null, 2) + '\n');
}
