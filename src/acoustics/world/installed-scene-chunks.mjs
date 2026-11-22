import {serialize, deserialize} from 'node:v8';
import {setImmediate} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {requireWorld} from './contracts.mjs';

const facesPerChunk = 96, maximumFaces = 4096, maximumChunkBytes = 2 * 1024 * 1024;
const maximumBytes = 16 * 1024 * 1024;
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Only the face/material portion of the fully validated worker result is
// packed. Indices, GPU geometry, candidate routes and unknown regions still
// take the normal native Worker channel in the same request.
export function packInstalledSceneFaces(prepared) {
  const {scene, packetDigest} = prepared, {surfaces, observationKey} = scene.tile;
  const count = surfaces.length, chunks = [];
  requireWorld(count > 0 && count <= maximumFaces && digest(packetDigest) && digest(observationKey), 'finite surface transfer');
  let bytes = 0;
  for (let offset = 0; offset < count; offset += facesPerChunk) {
    const rows = surfaces.slice(offset, offset + facesPerChunk).map(face => [face, scene.materials[face.id]]);
    const chunk = Uint8Array.from(serialize({packetDigest, observationKey, offset, rows}));
    bytes += chunk.byteLength;
    if (bytes > maximumBytes || chunk.byteLength > maximumChunkBytes) return prepared;
    chunks.push(chunk);
  }
  return {...prepared, scene:{...scene, tile:{...scene.tile, surfaces:[]}, materials:{}},
    packedFaces:{schema:1, count, chunks, bytes, chunkDigests:chunks.map(hash), packetDigest, observationKey}};
}

function freezeData(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) freezeData(value[key]);
    Object.freeze(value);
  }
  return value;
}

// Reconstruction does not grant scene authority. The service takes the
// original worker capability before calling here and adopts only the complete
// result against the original lease, session, generation, catalogue and epoch.
export async function unpackInstalledSceneFaces(packed, {isCurrent = () => true, yieldTurn = setImmediate} = {}) {
  const {packedFaces:header, scene, ...rest} = packed;
  requireWorld(header?.schema === 1 && digest(header.packetDigest) && header.packetDigest === packed.packetDigest &&
    digest(header.observationKey) && header.observationKey === scene.tile.observationKey && header.observationKey === scene.geometryKey &&
    Array.isArray(scene.tile.surfaces) && scene.tile.surfaces.length === 0 && Object.keys(scene.materials).length === 0,
    'bound finite surface transfer header');
  const {count, chunks, bytes} = header;
  requireWorld(Number.isInteger(count) && count >= 1 && count <= maximumFaces && count === packed.metadata.activeSurfaces &&
    Array.isArray(chunks) && chunks.length === Math.ceil(count / facesPerChunk) && Array.isArray(header.chunkDigests) &&
    header.chunkDigests.length === chunks.length && header.chunkDigests.every(digest) && Number.isInteger(bytes) && bytes > 0 && bytes <= maximumBytes &&
    chunks.every(chunk => chunk instanceof Uint8Array && chunk.buffer instanceof ArrayBuffer &&
      chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength &&
      chunk.byteLength > 0 && chunk.byteLength <= maximumChunkBytes) &&
    chunks.reduce((n, chunk) => n + chunk.byteLength, 0) === bytes, 'bounded finite surface chunks');
  const began = performance.now(), surfaces = [], materials = {};
  let activeSliceMilliseconds = 0, maximumSliceMilliseconds = 0;
  for (const [chunkIndex, chunk] of chunks.entries()) {
    if (!isCurrent()) return null;
    await yieldTurn();
    if (!isCurrent()) return null;
    const at = performance.now();
    requireWorld(hash(chunk)===header.chunkDigests[chunkIndex], 'matching finite surface chunk bytes');
    const data = deserialize(chunk);
    requireWorld(data.packetDigest === header.packetDigest && data.observationKey === header.observationKey &&
      data.offset === surfaces.length && Array.isArray(data.rows) &&
      data.rows.length === Math.min(facesPerChunk, count - surfaces.length), 'matching finite surface chunk order and packet');
    for (const row of data.rows) {
      requireWorld(Array.isArray(row) && row.length === 2 && typeof row[0]?.id === 'string' &&
        /^installed01:[0-9a-f]{40}$/.test(row[0].id) && (!surfaces.length || surfaces.at(-1).id < row[0].id) && row[1]?.basis === 'authored-assumption',
        'unique installed face and finite material');
      surfaces.push(freezeData(row[0]));
      materials[row[0].id] = freezeData(row[1]);
    }
    const elapsed = performance.now() - at;
    activeSliceMilliseconds += elapsed;
    maximumSliceMilliseconds = Math.max(maximumSliceMilliseconds, elapsed);
  }
  if (!isCurrent()) return null;
  return {prepared:{...rest, scene:{...scene, tile:{...scene.tile, surfaces:Object.freeze(surfaces)}, materials:Object.freeze(materials)}},
    profile:{chunks:chunks.length, bytes, elapsedMilliseconds:performance.now()-began, activeSliceMilliseconds, maximumSliceMilliseconds}};
}
