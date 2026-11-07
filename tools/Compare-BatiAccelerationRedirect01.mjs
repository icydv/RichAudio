import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exactSource = node => node?.SourceBinding?.State === 'exact-rel-metadata-bytes-sha256' &&
  /^[a-f0-9]{64}$/.test(node.SourceBinding.SHA256);
const recordHash = value => typeof value === 'string' && /^(?:0x)?[a-f0-9]{8}$/i.test(value) ? value.toLowerCase().replace(/^0x/, '') : null;
const vehicleType = 'Dat151Vehicle';
const granularType = 'Dat151VehicleEngineGranular';
const routes = [
  { field: 'EngineAccel', type: 'Dat54GranularSound' },
  { field: 'ExhaustAccel', type: 'Dat54EnvironmentSound' },
];

// The projection can discriminate shared-record edits from field-level redirects.
// The result grants no registration, runtime control or restoration authority.
export function compareBatiAccelerationRedirect01(graph) {
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
  const selectedRoutes = routes.map(({field, type}) =>
    exactEdge(granular, field, root('Sounds.' + field, type)));
  const privateVehicle = Symbol('private vehicle'), privateGranular = Symbol('private granular');
  const privateSounds = new Map(selectedRoutes.map(edge => [edge, Symbol(edge.Field)]));
  const redirect = (edges, replacements) => edges.map(edge =>
    replacements.has(edge) ? {...edge, Targets:[replacements.get(edge)]} : edge);
  const variant = new Map(outgoing);
  variant.set(privateVehicle, redirect(outgoing.get(vehicle), new Map([[vehicleRoute, privateGranular]])));
  variant.set(privateGranular, redirect(outgoing.get(granular), privateSounds));
  for (const [edge, id] of privateSounds) variant.set(id, outgoing.get(edge.Targets[0]) ?? []);

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
    ...variant.get(privateVehicle).filter(edge => edge.Field !== 'EngineGranular'),
    ...variant.get(privateGranular).filter(edge => !selectedRoutes.some(route => route.Field === edge.Field)),
  ];
  const preserved = reachable(otherRoutes, variant);
  const proof = [...privateSounds].map(([edge, privateId]) => ({
    field:edge.Field,
    originalRecordReachableThroughRetainedFields:preserved.has(edge.Targets[0]),
    retainedInboundReferences:graph.Edges.filter(candidate =>
      candidate !== edge && candidate.Targets.includes(edge.Targets[0])).map(candidate => candidate.Field).sort(),
    selectedFieldResolvesToPrivateRecord:variant.get(privateGranular)
      .some(candidate => candidate.Field === edge.Field && candidate.Targets[0] === privateId),
    privateRecordReachableThroughRetainedFields:preserved.has(privateId),
    privateRecordReachableFromNeighbor:neighbor.has(privateId),
  }));
  return {
    scope:'projected REL references only',
    privateRecordCount:2+privateSounds.size,
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
  if (process.argv.length !== 3) throw Error('Supply one retained project-private resolved catalogue');
  const projectPrivate = realpathSync(fileURLToPath(new URL('../.local/', import.meta.url)));
  const filename = realpathSync(process.argv[2]);
  if (!filename.startsWith(projectPrivate + path.sep) || !statSync(filename).isFile() ||
      statSync(filename).size > 64 * 1024 * 1024) throw Error('Bounded project-private retained input required');
  const catalogue = JSON.parse(readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  const vehicles = catalogue.Vehicles?.filter(vehicle => vehicle.Model === 'bati') ?? [];
  if (vehicles.length !== 1) throw Error('Exactly one Bati projection required');
  const result = compareBatiAccelerationRedirect01(vehicles[0].AudioDependencyGraph01);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
