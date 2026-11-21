// Original offline acoustic contracts; no game or device dependency.
import {
  coordinateSpace,
  cacheStatus,
  vector,
  unit,
  sub,
  length,
  cross,
  dot,
} from "../research/local-geometry.mjs";
export const bounds = Object.freeze({
  sources: 16,
  // Absolute opt-in ceilings. Scene defaults below retain the original budget.
  paths: 64,
  reflectors: 16,
  keys: 4096,
  duration: 60,
  delay: 2,
  speed: 100,
  pcmFrames: 4000000,
});
const scenes = new WeakSet(),
  tracks = new WeakSet(),
  sources = new WeakSet();
export const validated = Object.freeze({
  scene: (x) => scenes.has(x),
  track: (x) => tracks.has(x),
  source: (x) => sources.has(x),
});
export const requireValue = (ok, message) => {
  if (!ok) throw Error(message);
};
export const freeze = (x) => {
  if (x && typeof x === "object") {
    for (const v of Object.values(x)) freeze(v);
    Object.freeze(x);
  }
  return x;
};
const id = (x) =>
  requireValue(
    typeof x === "string" && /^[\w.:-]{1,80}$/.test(x),
    "bounded identity required",
  );
export function material({
  reflection,
  transmission = [0, 0, 0],
  basis = "authored-assumption",
  reference = "illustrative-v1",
} = {}) {
  id(reference);
  requireValue(
    ["authored-assumption", "measured"].includes(basis),
    "material provenance",
  );
  for (const a of [reflection, transmission])
    requireValue(
      Array.isArray(a) &&
        a.length === 3 &&
        a.every((x) => Number.isFinite(x) && x >= 0 && x <= 1),
      "three energy coefficients required",
    );
  requireValue(
    reflection.every((x, i) => x + transmission[i] <= 1 + 1e-12),
    "reflection plus transmission exceeds energy budget",
  );
  // This bounded complementary-band approximation supports monotonically decreasing spectra.
  for (const a of [reflection, transmission])
    requireValue(
      a[0] >= a[1] && a[1] >= a[2],
      "nonincreasing band coefficients required",
    );
  return freeze({
    reflection: [...reflection],
    transmission: [...transmission],
    absorption: reflection.map((x, i) => 1 - x - transmission[i]),
    basis,
    reference,
    scattering: "not-modelled",
  });
}
export function acousticScene(tile, materials = {}, options = {}) {
  const { observationModel = null, ...engineOptions } = options;
  if (observationModel) {
    requireValue(observationModel.kind === 'conditional-observed-model' &&
      observationModel.visibilityAssumption === 'unobserved-space-assumed-clear' &&
      observationModel.motionAssumption === 'static-during-snapshot' &&
      observationModel.calibration?.basis === 'declared-demonstration-scale' &&
      Number.isFinite(observationModel.calibration.metresPerNativeUnit) &&
      observationModel.calibration.metresPerNativeUnit > 0 &&
      ['live-snapshot','historical-replay'].includes(observationModel.mode),
    'explicit observed-model assumptions required');
    requireValue(tile.coverage === 'partial', 'observed coverage must remain partial');
  }
  const c = {
    ...tile,
    now: tile.createdAt,
    listener: tile.listenerAnchor,
    maxListenerMove: 0,
  };
  requireValue(
    tile.coordinateSpace === coordinateSpace && cacheStatus(tile, c).valid,
    "validated metre geometry required; no implicit GTA scale",
  );
  const config = {
    soundSpeed: 343,
    referenceDistance: 1,
    airDbPerMetre: [0.0001, 0.001, 0.01],
    order: 1,
    maxPaths: 12,
    maxReflectors: 8,
    maxDelay: 2,
    updateHz: 40,
    ...engineOptions,
  };
  requireValue(
    Number.isFinite(config.soundSpeed) &&
      config.soundSpeed >= 250 &&
      config.soundSpeed <= 450,
    "sound speed",
  );
  requireValue(
    Number.isFinite(config.referenceDistance) &&
      config.referenceDistance > 0 &&
      config.referenceDistance <= 10,
    "reference distance",
  );
  requireValue(
    [0, 1, 2].includes(config.order) &&
      Number.isInteger(config.maxPaths) &&
      config.maxPaths >= 1 &&
      config.maxPaths <= bounds.paths,
    "path/order budget",
  );
  requireValue(
    Number.isInteger(config.maxReflectors) &&
      config.maxReflectors >= 1 &&
      config.maxReflectors <= bounds.reflectors,
    "reflector budget",
  );
  requireValue(
    Number.isFinite(config.maxDelay) &&
      config.maxDelay > 0 &&
      config.maxDelay <= bounds.delay &&
      [20, 40, 80, 100].includes(config.updateHz),
    "delay/update budget",
  );
  requireValue(
    Array.isArray(config.airDbPerMetre) &&
      config.airDbPerMetre.length === 3 &&
      config.airDbPerMetre.every(
        (x) => Number.isFinite(x) && x >= 0 && x <= 1,
      ) &&
      config.airDbPerMetre[0] <= config.airDbPerMetre[1] &&
      config.airDbPerMetre[1] <= config.airDbPerMetre[2],
    "air band loss",
  );
  const checked = {};
  for (const s of tile.surfaces)
    checked[s.id] = materials[s.id] ? material(materials[s.id]) : null;
  requireValue(
    tile.surfaces.every((s) => s.motion === "static" || (observationModel && s.motion === "unknown")),
    "moving reflectors require another propagation model",
  );
  const result = freeze({
    version: 1,
    tile,
    materials: checked,
    config,
    coordinateSpace,
    geometryKey: tile.observationKey,
    generation: tile.version,
    observationModel: observationModel ? structuredClone(observationModel) : null,
  });
  scenes.add(result);
  return result;
}
export function trajectory(keys, { discontinuityGuard = 0.05 } = {}) {
  requireValue(
    Number.isFinite(discontinuityGuard) &&
      discontinuityGuard >= 0.05 &&
      discontinuityGuard <= 1,
    "discontinuity guard",
  );
  requireValue(
    Array.isArray(keys) && keys.length >= 1 && keys.length <= bounds.keys,
    "trajectory count",
  );
  const out = keys.map((k, i) => {
    requireValue(
      Number.isFinite(k.time) &&
        k.time >= 0 &&
        k.time <= bounds.duration &&
        (!i || k.time > keys[i - 1].time),
      "trajectory timestamp",
    );
    requireValue(
      Number.isSafeInteger(k.generation ?? 1) && (k.generation ?? 1) > 0,
      "trajectory generation",
    );
    const forward = unit(k.forward ?? [0, 1, 0]),
      up = unit(k.up ?? [0, 0, 1]);
    requireValue(
      Math.abs(dot(forward, up)) < 1e-8,
      "listener orientation must be orthogonal",
    );
    return {
      ...k,
      position: vector(k.position),
      forward,
      up,
      valid: k.valid !== false,
      generation: k.generation ?? 1,
    };
  });
  requireValue(out[0].time === 0, "trajectory must start at zero");
  for (let i = 0; i < out.length; i++) {
    const a = out[i],
      b = out[i + 1];
    const v =
      b && a.generation === b.generation
        ? sub(b.position, a.position).map((x) => x / (b.time - a.time))
        : [0, 0, 0];
    requireValue(
      length(v) <= bounds.speed,
      "unlabelled teleport or excessive velocity",
    );
    if (a.velocity)
      requireValue(
        length(sub(vector(a.velocity), v)) < 1e-6,
        "velocity disagrees with position trajectory",
      );
    a.velocity = v;
    if (b)
      requireValue(
        dot(a.forward, b.forward) > -0.99 && dot(a.up, b.up) > -0.99,
        "orientation discontinuity",
      );
  }
  const result = freeze({ version: 1, keys: out, discontinuityGuard });
  tracks.add(result);
  return result;
}
export function pose(track, t) {
  const keys = track.keys;
  let lo = 0,
    hi = keys.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (keys[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = keys[lo],
    b = keys[lo + 1];
  const u = b ? Math.max(0, Math.min(1, (t - a.time) / (b.time - a.time))) : 0;
  let valid = a.valid;
  for (let i = Math.max(0, lo - 1); i <= Math.min(keys.length - 2, lo + 1); i++)
    if (
      keys[i].generation !== keys[i + 1].generation &&
      Math.abs(t - keys[i + 1].time) <= track.discontinuityGuard
    )
      valid = false;
  const continuous = b && a.generation === b.generation;
  const position = continuous
    ? a.position.map((x, i) => x + (b.position[i] - x) * u)
    : [...a.position];
  const forward = continuous
    ? unit(a.forward.map((x, i) => x + (b.forward[i] - x) * u))
    : a.forward;
  const up = continuous
    ? unit(a.up.map((x, i) => x + (b.up[i] - x) * u))
    : a.up;
  const right = unit(cross(forward, up));
  return {
    position,
    velocity: continuous ? a.velocity : [0, 0, 0],
    forward,
    up,
    right,
    valid,
    generation: a.generation,
  };
}
export function ownedSource({
  id: identity,
  pcm,
  sampleRate = 48000,
  track,
  directivity = 0,
  rights = "original-generated",
} = {}) {
  id(identity);
  requireValue(
    sampleRate === 48000 &&
      pcm instanceof Float32Array &&
      pcm.length > 0 &&
      pcm.length <= bounds.pcmFrames,
    "bounded mono 48k PCM required",
  );
  requireValue(
    ["original-generated", "licensed-owned"].includes(rights),
    "explicit source rights required",
  );
  requireValue(
    Number.isFinite(directivity) && directivity >= 0 && directivity <= 1,
    "directivity",
  );
  requireValue(tracks.has(track), "validated source trajectory");
  for (const x of pcm)
    requireValue(
      Number.isFinite(x) && Math.abs(x) <= 1,
      "nonfinite or excessive dry PCM",
    );
  // Copy once off the processing path. The renderer subsequently owns its immutable-use bands.
  const result = Object.freeze({
    id: identity,
    pcm: new Float32Array(pcm),
    sampleRate,
    track,
    directivity,
    rights,
  });
  sources.add(result);
  return result;
}
