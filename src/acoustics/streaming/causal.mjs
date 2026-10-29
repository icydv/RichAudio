// Causal adaptation around the unchanged A06 finite-path solver. No future trajectory input.
import { requireValue, validated } from "../engine/contracts.mjs";
import { vector, unit, length, dot } from "../research/local-geometry.mjs";
import { candidatePaths, preparePath, finishPath, pathSegments } from "../engine/paths.mjs";
const FS = 48000;
function state(s) {
  requireValue(s && typeof s === "object", "state required");
  const position = vector(s.position),
    velocity = vector(s.velocity ?? [0, 0, 0]),
    forward = unit(s.forward ?? [0, 1, 0]),
    up = unit(s.up ?? [0, 0, 1]);
  requireValue(
    length(velocity) <= 100 && Math.abs(dot(forward, up)) < 1e-6,
    "state speed/orientation",
  );
  const generation = s.generation ?? 1;
  requireValue(
    Number.isSafeInteger(generation) &&
      generation > 0 &&
      generation <= 4294967295,
    "generation",
  );
  const directivity = s.directivity ?? 0;
  requireValue(
    Number.isFinite(directivity) && directivity >= 0 && directivity <= 1,
    "directivity",
  );
  return {
    position,
    velocity,
    forward,
    up,
    valid: s.valid !== false,
    generation,
    directivity,
    emitting: s.emitting !== false,
  };
}
export class CausalSimulation {
  constructor(
    scene,
    { staleAfter = 0.25, extrapolationLimit = 0.05, historySeconds = 2.5, allowMissingScene = false } = {},
  ) {
    requireValue(validated.scene(scene) || (allowMissingScene && scene === null), "validated A06 scene required");
    requireValue(
      extrapolationLimit >= 0 &&
        extrapolationLimit <= 0.1 &&
        staleAfter >= extrapolationLimit &&
        staleAfter <= 1 &&
        historySeconds >= (scene?.config.maxDelay ?? 2) + 0.1 &&
        historySeconds <= 3,
      "history/age budgets",
    );
    this.scene = scene;
    this.staleAfter = staleAfter;
    this.extrapolationLimit = extrapolationLimit;
    this.historySeconds = historySeconds;
    this.records = [];
    this.candidates = scene ? candidatePaths(scene) : [];
    this.geometryEpoch = 0;
    this.previous = new Map();
    this.processingSettings=null;
    this.prepareSequence=0;this.completedPrepareSequence=0;
    this.epoch = 0;
    this.session = null;
    this.stats = {
      observations: 0,
      updates: 0,
      resets: 0,
      staleUpdates: 0,
      missingPast: 0,
      queries: 0,
      surfaceTests: 0,
      rejectedPaths: 0,
      prunedPaths: 0,
      maximumAgeSeconds: 0,
      sceneReplacements: 0,
    };
  }
  replaceScene(scene) {
    requireValue(scene === null || validated.scene(scene), 'validated replacement scene');
    requireValue(!scene || this.historySeconds>=scene.config.maxDelay+.1,'replacement delay exceeds retained history');
    if (scene?.geometryKey === this.scene?.geometryKey) return;
    this.scene = scene;
    this.candidates = scene ? candidatePaths(scene,this.processingSettings?{maxReflectors:this.processingSettings.maxReflectors}:{}) : [];
    this.geometryEpoch++;
    this.previous.clear(); // Never interpret a new reflector delay as source velocity.
    this.stats.sceneReplacements++;
  }
  setProcessingSettings({pathBudget,maxReflectors,earlyReflections=true}) {
    requireValue(Number.isInteger(pathBudget)&&pathBudget>=1&&pathBudget<=64&&
      Number.isInteger(maxReflectors)&&maxReflectors>=1&&maxReflectors<=16&&typeof earlyReflections==='boolean','bounded acoustic processing settings');
    const rebuild=this.processingSettings?.maxReflectors!==maxReflectors;
    if(rebuild||this.processingSettings?.pathBudget!==pathBudget||this.processingSettings?.earlyReflections!==earlyReflections)this.prepareSequence++;
    this.processingSettings={pathBudget,maxReflectors,earlyReflections};
    if(rebuild&&this.scene)this.candidates=candidatePaths(this.scene,{maxReflectors});
    // Quality/backend changes do not change geometric identity or PCM history.
  }
  observe(snapshot) {
    requireValue(
      snapshot &&
        Number.isFinite(snapshot.time) &&
        snapshot.time >= 0 &&
        snapshot.time <= 86400,
      "observation time",
    );
    requireValue(
      typeof snapshot.session === "string" &&
        /^[\w:-]{1,64}$/.test(snapshot.session),
      "session",
    );
    const generation = snapshot.generation ?? 1;
    requireValue(
      Number.isSafeInteger(generation) && generation > 0,
      "adapter generation",
    );
    const session = snapshot.session + ":" + generation;
    const changing = this.session !== session,
      previous = changing ? null : this.records.at(-1);
    requireValue(
      !previous || snapshot.time - previous.time >= 1 / 240 - 1e-9,
      "duplicate/out-of-order or excessive-rate observation",
    );
    requireValue(
      Array.isArray(snapshot.sources) && snapshot.sources.length <= 16,
      "source budget",
    );
    const sources = {};
    for (const s of snapshot.sources) {
      requireValue(
        typeof s.id === "string" &&
          /^[\w:-]{1,64}$/.test(s.id) &&
          !sources[s.id],
        "source identity",
      );
      sources[s.id] = state(s);
    }
    const listener = state(snapshot.listener);
    if (snapshot.paused) listener.valid = false;
    if (previous) {
      const check = (old, next) => {
        if (
          !old ||
          !next ||
          !old.valid ||
          !next.valid ||
          old.generation !== next.generation
        )
          return;
        const speed =
          length(next.position.map((x, i) => x - old.position[i])) /
          (snapshot.time - previous.time);
        requireValue(speed <= 100 + 1e-6, "undeclared position discontinuity");
        requireValue(
          dot(old.forward, next.forward) > -0.99 &&
            dot(old.up, next.up) > -0.99,
          "orientation discontinuity requires generation",
        );
      };
      check(previous.listener, listener);
      for (const [id, next] of Object.entries(sources))
        check(previous.sources[id], next);
    }
    requireValue(this.epoch < 1000000, "session restart budget");
    if (changing) {
      this.records = [];
      this.previous.clear();
      this.session = session;
      this.epoch++;
      this.stats.resets++;
    }
    this.records.push({ time: snapshot.time, listener, sources });
    while (
      this.records.length > 1024 ||
      (this.records.length > 2 &&
        this.records[1].time < snapshot.time - this.historySeconds)
    )
      this.records.shift();
    this.stats.observations++;
  }
  track(kind, id, now) {
    const keys = [];
    for (const record of this.records) {
      const s = kind === "listener" ? record.listener : record.sources[id];
      if (s)
        keys.push({
          ...s,
          time: record.time,
          generation: this.epoch * 4294967296 + s.generation,
        });
    }
    if (!keys.length) return null;
    const last = keys.at(-1),
      age = now - last.time;
    if (age < -1e-8) throw Error("future observation rejected");
    if (
      age > this.extrapolationLimit + 1e-8 ||
      age > this.staleAfter ||
      !last.valid
    )
      return null;
    if (age > 1e-9)
      keys.push({
        ...last,
        time: now,
        position: last.position.map((x, i) => x + last.velocity[i] * age),
      });
    return { keys, discontinuityGuard: 0.05 };
  }
  prepareUpdate(now, { geometryTimeMs } = {}) {
    requireValue(Number.isFinite(now) && now >= 0, "arrival time");
    this.stats.updates++;
    const prepareSequence=++this.prepareSequence,observations=this.stats.observations;
    const latest = this.records.at(-1), paths=[],sourceGenerations={};
    if (!latest){this.availablePaths=0;
      return {prepareSequence,observations,terminal:{
        frame: Math.round(now * FS),
        paths,
        sourceGenerations,
        stats: { ...this.stats },
        ageSeconds: null,
      }};}
    const age = now - latest.time;
    // Source history identity exists even while the listener presentation buffer
    // warms. Delaying this tag until a listener becomes valid discards real PCM.
    for (const [id, current] of Object.entries(latest.sources))
      sourceGenerations[id] = this.epoch * 4294967296 + current.generation;
    requireValue(age >= -1e-8, "future observation rejected");
    this.stats.maximumAgeSeconds = Math.max(this.stats.maximumAgeSeconds, age);
    const listener = this.track("listener", null, now);
    if (!listener || !this.scene) {
      this.availablePaths=0;
      this.stats.staleUpdates++;
      return {prepareSequence,observations,terminal:{
        frame: Math.round(now * FS),
        paths,
        sourceGenerations,
        stats: { ...this.stats },
        ageSeconds: age,
      }};
    }
    const sources=[],segments=[];
    for (const [id, current] of Object.entries(latest.sources)) {
      const track = this.track("source", id, now);
      sourceGenerations[id] = this.epoch * 4294967296 + current.generation;
      if (!track) continue;
      const source = { track, directivity: current.directivity }, plans=[];
      for (const candidate of this.candidates) {
        if(this.processingSettings?.earlyReflections===false&&candidate.surfaces.length)continue;
        const plan=preparePath(this.scene,source,listener,now,candidate,geometryTimeMs),queries=pathSegments(plan),offset=segments.length;
        segments.push(...queries);plans.push({plan,candidate,offset,count:queries.length});
      }
      sources.push({id,track,plans});
    }
    requireValue(segments.length<=16384,'bounded prepared visibility workload');
    return {prepareSequence,observations,now,age,paths,sourceGenerations,sources,segments,scene:this.scene,geometryEpoch:this.geometryEpoch};
  }
  completeUpdate(frame,queries=null) {
    requireValue(frame.prepareSequence===this.prepareSequence&&frame.prepareSequence>this.completedPrepareSequence&&
      frame.observations===this.stats.observations,'superseded or out-of-generation prepared acoustic frame');
    if(frame.terminal){this.completedPrepareSequence=frame.prepareSequence;return frame.terminal;}
    const {now,age,paths,sourceGenerations,sources}=frame;
    requireValue(frame.scene===this.scene&&frame.geometryEpoch===this.geometryEpoch,'out-of-generation prepared acoustic frame');
    this.completedPrepareSequence=frame.prepareSequence;
    let availablePaths=0;
    for(const {id,track,plans} of sources){
      const eligible=[];
      for(const {plan,candidate,offset,count} of plans){
        const p=finishPath(plan,queries?queries.slice(offset,offset+count):null,this.stats);
        if (
          p.status !== "renderable" ||
          p.generation !== sourceGenerations[id]
        ) {
          this.stats.rejectedPaths++;
          continue;
        }
        if (p.emissionTime < track.keys[0].time - 1e-9) {
          this.stats.missingPast++;
          continue;
        }
        const identity = id + ":" + candidate.id + ":g" + p.generation +
            (this.scene.observationModel && p.order ? ':geometry' + this.geometryEpoch : ''),
          previous = this.previous.get(identity);
        let rate =
          previous && now > previous.time
            ? (p.emissionTime - previous.emissionTime) / (now - previous.time)
            : 1;
        if (!Number.isFinite(rate) || rate < 0.25 || rate > 3) {
          this.stats.rejectedPaths++;
          continue;
        }
        this.previous.set(identity, {
          time: now,
          emissionTime: p.emissionTime,
        });
        eligible.push({
          id: identity,
          sourceId: id,
          generation: p.generation,
          emissionFrame: p.emissionTime * FS,
          rate,
          bands: p.bands,
          pan: p.pan,
          arrivalDirection: p.arrivalDirection,
          distance: p.distance,
          delay: p.delay,
          order: p.order,
        });
      }
      eligible.sort(
        (a, b) =>
          Math.max(...b.bands) - Math.max(...a.bands) ||
          a.id.localeCompare(b.id),
      );
      availablePaths=Math.max(availablePaths,eligible.length);
      const budget=this.processingSettings?.pathBudget??this.scene.config.maxPaths;
      // Explicit quality selection reserves a valid direct contribution rather
      // than allowing stronger reflections to evict its continuous identity.
      if(this.processingSettings){const direct=eligible.findIndex(p=>p.order===0);if(direct>0)eligible.unshift(...eligible.splice(direct,1));}
      this.stats.prunedPaths += Math.max(
        0,
        eligible.length - budget,
      );
      paths.push(...eligible.slice(0,budget));
    }
    // Old path-rate records are bounded independently from telemetry lifetime.
    for (const [id, p] of this.previous)
      if (now - p.time > this.historySeconds) this.previous.delete(id);
    this.availablePaths=availablePaths;
    return {
      frame: Math.round(now * FS),
      paths,
      sourceGenerations,
      stats: { ...this.stats },
      ageSeconds: age,
    };
  }
  update(now,options={}){return this.completeUpdate(this.prepareUpdate(now,options));}
  async updateAccelerated(now,options,backend){
    const frame=this.prepareUpdate(now,options);
    if(frame.terminal)return this.completeUpdate(frame);
    const queries=await backend.query(frame.scene.tile,frame.segments,{generation:frame.geometryEpoch});
    return this.completeUpdate(frame,queries);
  }
}

export class StreamingRenderer {
  constructor({
    sourceIds = ["beacon"],
    maxPathsPerSource = 12,
    pathCapacityPerSource = maxPathsPerSource,
    historySeconds = 2.5,
    masterGain = 0.7,
    historyDiagnostics = false,
    generationReleaseGuard = false,
  } = {}) {
    requireValue(
      sourceIds.length >= 1 &&
        sourceIds.length <= 16 &&
        new Set(sourceIds).size === sourceIds.length,
      "sources",
    );
    requireValue(
      Number.isInteger(maxPathsPerSource) &&
        maxPathsPerSource >= 1 &&
        maxPathsPerSource <= 64 &&
        Number.isInteger(pathCapacityPerSource) &&
        pathCapacityPerSource >= maxPathsPerSource &&
        pathCapacityPerSource <= 64 &&
        historySeconds >= 2.1 &&
        historySeconds <= 3 &&
        masterGain >= 0 &&
        masterGain <= 1,
      "DSP budgets",
    );
    this.frame = 0;
    this.generationReleaseGuard = generationReleaseGuard;
    this.historyDiagnostics = historyDiagnostics
      ? {
          beforeStart: 0,
          future: 0,
          frameTag: 0,
          generationTag: 0,
          zeroWeightUnavailable: 0,
          affectedFrames: 0,
          firstFrame: -1,
          lastFrame: -1,
        }
      : null;
    this.masterGain = masterGain;
    // User output is attenuation of the existing calibrated mix, never a gain
    // boost or a source/emission command. Rings keep advancing while muted.
    this.outputGain=1;this.outputTarget=1;this.outputSmooth=1-Math.exp(-1/(.02*FS));
    this.historyFrames = Math.ceil(historySeconds * FS);
    this.maxPathsPerSource = maxPathsPerSource;
    this.pathCapacityPerSource = pathCapacityPerSource;
    this.pathLimit = sourceIds.length * maxPathsPerSource;
    this.pathCapacity = sourceIds.length * pathCapacityPerSource;
    this.sources = new Map(
      sourceIds.map((id) => [
        id,
        {
          id,
          generation: 100001,
          bands: [
            new Float32Array(this.historyFrames),
            new Float32Array(this.historyFrames),
            new Float32Array(this.historyFrames),
          ],
          frames: new Int32Array(this.historyFrames).fill(-1),
          generations: new Float64Array(this.historyFrames),
          low: 0,
          upper: 0,
        },
      ]),
    );
    this.sourceList = [...this.sources.values()];
    // A second bank permits bounded old-path releases while a new path is introduced.
    this.slots = Array.from({ length: this.pathCapacity * 2 }, () => ({
      active: false,
      present: false,
      releaseLeft: 0,
      id: null,
      source: null,
      generation: 0,
      cursor: 0,
      rate: 1,
      correction: 0,
      correctionLeft: 0,
      gain: new Float64Array(3),
      target: new Float64Array(3),
      pan: 0,
      panTarget: 0,
    }));
    // Quality-capable instances reserve their maximum release banks once. The
    // sample loop visits only occupied slots; changing quality never reallocates
    // a source ring or walks a large mostly empty maximum-capacity pool.
    this.activeSlotIndices = pathCapacityPerSource > 12
      ? new Uint32Array(this.slots.length)
      : null;
    this.activeSlotCount = 0;
    this.smooth = 1 - Math.exp(-1 / (0.01 * FS));
    this.stats = {
      frames: 0,
      peak: 0,
      sumSquares: 0,
      limited: 0,
      missingHistory: 0,
      controlUpdates: 0,
      rejectedControls: 0,
      cursorResets: 0,
      pathOverflow: 0,
      maximumControlAgeFrames: 0,
    };
    this.controlFrame = -Infinity;
    this.ownedArrayBytes =
      [...this.sources.values()].reduce(
        (n, s) =>
          n +
          s.bands.reduce((a, b) => a + b.byteLength, 0) +
          s.frames.byteLength +
          s.generations.byteLength,
        0,
      ) +
      this.slots.length * 48 + (this.activeSlotIndices?.byteLength ?? 0);
  }
  setPathBudget(maxPathsPerSource) {
    requireValue(Number.isInteger(maxPathsPerSource) && maxPathsPerSource >= 1 &&
      maxPathsPerSource <= this.pathCapacityPerSource, "DSP active path budget");
    // Existing paths release through accept's ordinary absent-path mechanism.
    // Source identity, ring contents, cursors and all filter histories survive.
    this.maxPathsPerSource = maxPathsPerSource;
    this.pathLimit = this.sources.size * maxPathsPerSource;
  }
  setOutputPreferences({richAudioEnabled=true,outputLevel=1}={}) {
    requireValue(typeof richAudioEnabled==='boolean'&&Number.isFinite(outputLevel)&&outputLevel>=0&&outputLevel<=1,'bounded owned output preference');
    this.outputTarget=richAudioEnabled?outputLevel:0;
  }
  historyReady(control) {
    return (
      control.paths.length > 0 &&
      control.paths.every((p) => {
        const s = this.sources.get(p.sourceId),
          k = Math.floor(p.emissionFrame),
          f = p.emissionFrame - k;
        return (
          s &&
          [k, ...(f > 0 ? [k + 1] : [])].every(
            (index) =>
              index >= 0 &&
              index < this.frame &&
              s.frames[index % this.historyFrames] === index &&
              s.generations[index % this.historyFrames] === p.generation,
          )
        );
      })
    );
  }
  setSourceGeneration(id, generation) {
    const s = this.sources.get(id);
    requireValue(
      s && Number.isSafeInteger(generation) && generation > 0,
      "source generation",
    );
    if (s.generation !== generation) {
      s.generation = generation;
      s.generationFrame = this.frame;
      s.low = 0;
      s.upper = 0;
    }
  }
  accept(control) {
    requireValue(
      control &&
        Number.isInteger(control.frame) &&
        control.frame <= this.frame &&
        Array.isArray(control.paths) &&
        control.paths.length <= this.pathLimit,
      "causal control snapshot",
    );
    requireValue(control.frame >= this.controlFrame, "out-of-order control");
    const counts = new Map(), identities = new Set();
    for (const p of control.paths) {
      requireValue(p && this.sources.has(p.sourceId) && !identities.has(p.id), "path source/identity");
      identities.add(p.id);
      const count = (counts.get(p.sourceId) ?? 0) + 1;
      requireValue(count <= this.maxPathsPerSource, "per-source path budget");
      counts.set(p.sourceId, count);
    }
    this.controlFrame = control.frame;
    this.stats.controlUpdates++;
    for (const [id, generation] of Object.entries(
      control.sourceGenerations ?? {},
    ))
      if (this.sources.has(id)) this.setSourceGeneration(id, generation);
    for (const slot of this.slots) {
      slot.target.fill(0);
      slot.present = false;
    }
    for (const p of control.paths) {
      requireValue(
        this.sources.has(p.sourceId) &&
          typeof p.id === "string" &&
          Number.isSafeInteger(p.generation) &&
          p.generation > 0 &&
          Number.isFinite(p.emissionFrame) &&
          p.emissionFrame <= control.frame + 1e-6 &&
          p.emissionFrame >= control.frame - this.historyFrames &&
          Number.isFinite(p.rate) &&
          p.rate >= 0.25 &&
          p.rate <= 3 &&
          Array.isArray(p.bands) &&
          p.bands.length === 3 &&
          p.bands.every((x) => Number.isFinite(x) && x >= 0 && x <= 1) &&
          Number.isFinite(p.pan) &&
          Math.abs(p.pan) <= 1,
        "invalid path control",
      );
      let slot = this.slots.find((s) => s.active && s.id === p.id),
        fresh = !slot;
      if (!slot) slot = this.slots.find((s) => !s.active);
      if (!slot) {
        this.stats.pathOverflow++;
        continue;
      }
      const desired = p.emissionFrame + (this.frame - control.frame) * p.rate;
      if (fresh) {
        slot.active = true;
        slot.id = p.id;
        slot.source = this.sources.get(p.sourceId);
        slot.generation = p.generation;
        slot.cursor = desired;
        slot.gain.fill(0);
        slot.pan = p.pan;
      }
      const error = desired - slot.cursor;
      if (Math.abs(error) > FS * 0.05) {
        slot.gain.fill(0);
        slot.cursor = desired;
        slot.correction = 0;
        this.stats.cursorResets++;
      } else {
        slot.correction = error / 960;
        slot.correctionLeft = 960;
      }
      slot.rate = p.rate;
      slot.target.set(p.bands);
      slot.panTarget = p.pan;
      slot.present = true;
      slot.releaseLeft = 0;
    }
    for (const slot of this.slots)
      if (slot.active && !slot.present) {
        if (!slot.releaseLeft) slot.releaseLeft = 960;
        // An old-generation release may only read PCM before its generation
        // boundary. Do not let the 20 ms tail cross into another source's tag.
        if(this.generationReleaseGuard && slot.generation!==slot.source.generation){
          const rate=Math.max(.25,slot.rate+(slot.correctionLeft>0?slot.correction:0));
          slot.releaseLeft=Math.max(1,Math.min(slot.releaseLeft,
            Math.floor((slot.source.generationFrame-slot.cursor-1)/rate)));
        }
      }
    if (this.activeSlotIndices) {
      this.activeSlotCount = 0;
      for (let i = 0; i < this.slots.length; i++)
        if (this.slots[i].active) this.activeSlotIndices[this.activeSlotCount++] = i;
    }
  }
  process(inputs, left, right, frames = left.length) {
    requireValue(
      left instanceof Float32Array &&
        right instanceof Float32Array &&
        left !== right &&
        Number.isInteger(frames) &&
        frames > 0 &&
        frames <= 512 &&
        frames <= left.length &&
        frames <= right.length,
      "DSP output buffers",
    );
    const overlaps = (a, b) =>
      a.buffer === b.buffer &&
      a.byteOffset < b.byteOffset + frames * 4 &&
      b.byteOffset < a.byteOffset + frames * 4;
    requireValue(!overlaps(left, right), "overlapping stereo outputs");
    for (let i = 0; i < this.sourceList.length; i++) {
      const s = this.sourceList[i];
      requireValue(
        inputs[s.id] instanceof Float32Array && inputs[s.id].length >= frames,
        "dry source input",
      );
      requireValue(
        !overlaps(inputs[s.id], left) && !overlaps(inputs[s.id], right),
        "overlapping input/output",
      );
      s.input = inputs[s.id];
    }
    const lowK = 1 - Math.exp((-2 * Math.PI * 400) / FS),
      highK = 1 - Math.exp((-2 * Math.PI * 4000) / FS);
    for (let j = 0; j < frames; j++) {
      let affected = false;
      const frame = this.frame + j,
        write = frame % this.historyFrames;
      for (let i = 0; i < this.sourceList.length; i++) {
        const s = this.sourceList[i],
          x = s.input[j];
        requireValue(Number.isFinite(x) && Math.abs(x) <= 1, "invalid dry PCM");
        s.low += lowK * (x - s.low);
        s.upper += highK * (x - s.upper);
        s.bands[0][write] = s.low;
        s.bands[1][write] = s.upper - s.low;
        s.bands[2][write] = x - s.upper;
        s.frames[write] = frame;
        s.generations[write] = s.generation;
      }
      let l = 0,
        r = 0;
      const slotCount = this.activeSlotIndices ? this.activeSlotCount : this.slots.length;
      for (let p = 0; p < slotCount; p++) {
        const slot = this.slots[this.activeSlotIndices ? this.activeSlotIndices[p] : p];
        if (!slot.active) continue;
        const controlAge = frame - this.controlFrame;
        this.stats.maximumControlAgeFrames = Math.max(
          this.stats.maximumControlAgeFrames,
          controlAge,
        );
        if (controlAge > FS * 0.15 && !slot.releaseLeft) {
          slot.target.fill(0);
          slot.releaseLeft = 960;
        }
        let gainMax = 0;
        for (let b = 0; b < 3; b++) {
          if (slot.releaseLeft)
            slot.gain[b] *= (slot.releaseLeft - 1) / slot.releaseLeft;
          else slot.gain[b] += this.smooth * (slot.target[b] - slot.gain[b]);
          gainMax = Math.max(gainMax, slot.gain[b]);
        }
        if (slot.releaseLeft) slot.releaseLeft--;
        slot.pan += this.smooth * (slot.panTarget - slot.pan);
        if (
          gainMax < 1e-9 &&
          slot.target[0] === 0 &&
          slot.target[1] === 0 &&
          slot.target[2] === 0
        ) {
          slot.active = false;
          continue;
        }
        const k = Math.floor(slot.cursor),
          f = slot.cursor - k,
          s = slot.source;
        let x = 0;
        for (let tap = 0; tap < 2; tap++) {
          const index = k + tap,
            weight = tap ? f : 1 - f;
          const diag = this.historyDiagnostics;
          if (index < 0 || index > frame) {
            if (diag && weight > 0) {
              diag[index < 0 ? "beforeStart" : "future"]++;
              affected = true;
            }
            continue;
          }
          const at = index % this.historyFrames;
          if (s.frames[at] !== index || s.generations[at] !== slot.generation) {
            this.stats.missingHistory++;
            if (diag) {
              if (weight === 0) diag.zeroWeightUnavailable++;
              else {
                diag[s.frames[at] !== index ? "frameTag" : "generationTag"]++;
                affected = true;
              }
            }
            continue;
          }
          x +=
            weight *
            (s.bands[0][at] * slot.gain[0] +
              s.bands[1][at] * slot.gain[1] +
              s.bands[2][at] * slot.gain[2]);
        }
        l += x * Math.sqrt((1 - slot.pan) / 2);
        r += x * Math.sqrt((1 + slot.pan) / 2);
        slot.cursor +=
          slot.rate + (slot.correctionLeft > 0 ? slot.correction : 0);
        if (slot.correctionLeft > 0) slot.correctionLeft--;
      }
      if(this.outputGain!==this.outputTarget){
        this.outputGain+=this.outputSmooth*(this.outputTarget-this.outputGain);
        if(Math.abs(this.outputTarget-this.outputGain)<1e-9)this.outputGain=this.outputTarget;
      }
      if(this.outputGain!==1){l*=this.outputGain;r*=this.outputGain;}
      l *= this.masterGain;
      r *= this.masterGain;
      const peak = Math.max(Math.abs(l), Math.abs(r));
      this.stats.peak = Math.max(this.stats.peak, peak);
      if (peak > 0.98) {
        l *= 0.98 / peak;
        r *= 0.98 / peak;
        this.stats.limited++;
      }
      left[j] = l;
      right[j] = r;
      this.stats.sumSquares += l * l + r * r;
      if (affected && this.historyDiagnostics) {
        const d = this.historyDiagnostics;
        d.affectedFrames++;
        if (d.firstFrame < 0) d.firstFrame = frame;
        d.lastFrame = frame;
      }
    }
    this.frame += frames;
    this.stats.frames += frames;
    return frames;
  }
  get activePaths() {
    return this.slots.reduce((n, s) => n + (s.active ? 1 : 0), 0);
  }
}
