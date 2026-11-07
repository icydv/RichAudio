import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// The projection can discriminate shared-record edits from field-level redirects.
// The result grants no registration, runtime control or restoration authority.
export function compareBatiAccelerationRedirect01(graph,{continuous=false}={}) {
  if (graph?.Kind !== 'RichAudioBatiAudioDependencyGraph01' ||
      !Array.isArray(graph.Nodes) || graph.Nodes.length > 256 ||
      !Array.isArray(graph.Edges) || graph.Edges.length > 4096 ||
      !Array.isArray(graph.Roots) || graph.Roots.length > 16) {
    throw Error('Bounded retained Bati audio projection required');
  }
  const nodes = new Map(graph.Nodes.map(node => [node.Id, node]));
  const outgoing = new Map();
  for (const edge of graph.Edges) {
    if (!nodes.has(edge.From) || !Array.isArray(edge.Targets) || edge.Targets.length > 16) {
      throw Error('Malformed audio reference projection');
    }
    if (!outgoing.has(edge.From)) outgoing.set(edge.From, []);
    outgoing.get(edge.From).push(edge);
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
  const scopes=[{parent:granular,edge:vehicleRoute,routes:continuous?[...acceleration,{field:'IdleSub',type:'Dat54ModularSynthSound'}]:acceleration}];
  if(engine)scopes.push({parent:engine,edge:exactEdge(vehicle,'Engine',engine),routes:conventional});
  const vehicleEdges=new Map(),soundEdges=new Map(),privateParents=[];
  const privateVehicle=Symbol('private vehicle');
  const redirect=(edges,replacements)=>edges.map(edge=>
    replacements.has(edge)?{...edge,Targets:[replacements.get(edge)]}:edge);
  const variant=new Map(outgoing);
  for(const {parent,edge:parentEdge,routes} of scopes){
    const privateParent=Symbol(parentEdge.Field),redirects=new Map();
    vehicleEdges.set(parentEdge,privateParent);
    privateParents.push({privateParent,routes});
    for(const {field,type} of routes){
      const targetId=acceleration.some(route=>route.field===field)?root('Sounds.'+field,type):outgoing.get(parent)?.find(edge=>edge.Field===field)?.Targets[0];
      const target=nodes.get(targetId);
      if(!exactSource(target)||target.Record?.ParserType!==type)throw Error('Missing or unbound typed audio root: '+field);
      const edge=exactEdge(parent,field,targetId),privateSound=Symbol(field);
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
  const proof = [...soundEdges].map(([edge,{privateSound:privateId,privateParent}]) => ({
    field:edge.Field,
    originalRecordReachableThroughRetainedFields:preserved.has(edge.Targets[0]),
    retainedInboundReferences:graph.Edges.filter(candidate =>
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
      unredirectedSubmixReferences:[...outgoing.get(granular),...outgoing.get(engine)]
        .filter(edge=>/Submix/.test(edge.Field)&&edge.Targets.length>0)
        .map(edge=>({field:edge.Field,targetTypes:edge.Targets.map(id=>nodes.get(id)?.Record?.ParserType??'unretained')})),
    }:{}),
    sameModelNeighborGraphUnchanged:stockVehicle.size === neighbor.size &&
      [...stockVehicle].every(id => neighbor.has(id)),
    routeComparisons:proof,
    unresolvedProjection:{
      referenceClosureComplete:graph.ReferenceClosureComplete === true,
      traversalComplete:graph.TraversalCompleteWithinPublicProjection === true,
    },
    effectiveBaselineReadBack:false,
    runtimeAssignmentEnabled:false,
    selectiveSuppressionVerified:false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const continuous=process.argv[3]==='--continuous';
  if(process.argv.length!==(continuous?4:3))throw Error('Supply one retained project-private resolved catalogue and optional --continuous');
  const projectPrivate = realpathSync(fileURLToPath(new URL('../.local/', import.meta.url)));
  const filename = realpathSync(process.argv[2]);
  if (!filename.startsWith(projectPrivate + path.sep) || !statSync(filename).isFile() ||
      statSync(filename).size > 64 * 1024 * 1024) throw Error('Bounded project-private retained input required');
  const catalogue = JSON.parse(readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  const vehicles = catalogue.Vehicles?.filter(vehicle => vehicle.Model === 'bati') ?? [];
  if (vehicles.length !== 1) throw Error('Exactly one Bati projection required');
  const result = compareBatiAccelerationRedirect01(vehicles[0].AudioDependencyGraph01,{continuous});
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
