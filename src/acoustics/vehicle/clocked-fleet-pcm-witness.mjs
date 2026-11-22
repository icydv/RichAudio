// The private discard producer samples one frame from the actual stereo sum.
// Path terms arrive after the history tag, filtering, pressure and pan stages.
export class ClockedFleetPcmWitness {
  constructor(maximumBlocks, maximumPaths) {
    this.maximumBlocks = maximumBlocks;
    this.paths = new Array(maximumPaths);
    this.left = new Float64Array(maximumPaths);
    this.right = new Float64Array(maximumPaths);
    this.firstTap = new Int32Array(maximumPaths);
    this.secondTap = new Int32Array(maximumPaths);
    // Source PCM rings support at most three seconds. Include the current block.
    this.dryHistory = new Array(Math.ceil(3*48000/512)+1);
    this.pathCount = 0;
    this.bindings = new Map();
    this.rows = [];
  }
  path(slot, left, right, frame) {
    if (this.pathCount === this.paths.length) throw Error('PCM witness path capacity exceeded');
    const index = this.pathCount++;
    this.paths[index] = slot;
    this.left[index] = left;
    this.right[index] = right;
    this.firstTap[index] = this.secondTap[index] = -1;
    if (left === 0 && right === 0) return;
    const k = Math.floor(slot.cursor), fraction = slot.cursor-k;
    const s = slot.source, historyFrames = s.frames.length;
    for (let tap=0;tap<2;tap++) {
      const read = k+tap, weight = tap ? fraction : 1-fraction;
      if (weight === 0 || read<0 || read>frame) continue;
      const at=read%historyFrames;
      if (s.frames[at]!==read || s.generations[at]!==slot.generation) continue;
      const gain=slot.gain;
      if (weight*(s.bands[0][at]*gain[0]+s.bands[1][at]*gain[1]+s.bands[2][at]*gain[2])===0) continue;
      if(tap===0)this.firstTap[index]=read;
      else this.secondTap[index]=read;
    }
  }
  output(frame, outputGain, masterGain, limiterGain, localLeft, localRight) {
    Object.assign(this, {frame, outputGain, masterGain, limiterGain, localLeft, localRight});
  }
  controlDeadline(snapshots, leftSequence, rightSequence, observationTicks) {
    const latest=snapshots.at(-1).frame;
    let deadline=Math.min(observationTicks+Math.floor(latest.listener.clockFrequency/4),latest.validThroughTicks||Infinity);
    for(let i=snapshots.length-1;i>=0;i--){
      const frame=snapshots[i].frame, sequence=frame.listener.sequence;
      if(sequence<leftSequence)break;
      if(sequence===leftSequence || sequence===rightSequence)deadline=Math.min(deadline,frame.validThroughTicks||Infinity);
    }
    return deadline;
  }
  stereo(left, right) {
    left += this.localLeft;
    right += this.localRight;
    if (this.outputGain !== 1) { left *= this.outputGain; right *= this.outputGain; }
    left *= this.masterGain;
    right *= this.masterGain;
    const peak = Math.max(Math.abs(left), Math.abs(right));
    if (peak > .98) { left *= .98 / peak; right *= .98 / peak; }
    return [Math.fround(left), Math.fround(right)];
  }
  record(engine, packet) {
    if (this.rows.length >= this.maximumBlocks) { this.pathCount = 0; return null; }
    const current = new Map(), nextBindings = new Map(), groups = new Map(), dryInputs = new Map();
    const block = packet.readUInt32LE(4);
    const snapshot = engine.snapshots?.at(-1)?.frame;
    const frequency = snapshot?.listener?.clockFrequency;
    for (const voice of engine.slots) {
      if (!voice.source) continue;
      const sourceId = 'stock:slot' + voice.index + ':engine';
      const generation = engine.pipeline.lastControl.sourceGenerations?.[sourceId];
      if (generation === undefined) continue;
      if (generation % 4294967296 !== voice.generation) throw Error('PCM witness voice generation mismatch');
      const key = voice.index + '/' + generation;
      const v = voice.vehicle;
      const owner = {slot: voice.index, rendererGeneration: generation, id: v.id, generation: v.generation,
        moving: v.velocity?.some(value=>Math.abs(value)>.00001)??false,
        model: v.model, context: v.context, acquisition: v.acquisition01 ?? null};
      current.set(key,owner);
      nextBindings.set(key,owner);
      if (Number.isSafeInteger(v.observationTicks) && Number.isSafeInteger(frequency) && frequency>0) {
        // vehiclesAt uses the older bracket's observationTicks. The latest and
        // right source observations of this contiguous acquisition are newer.
        const deadline = v.clockedDryDeadlineQpc ?? Math.min(v.observationTicks+Math.floor(frequency/4),snapshot.validThroughTicks || Infinity);
        dryInputs.set(key,{observed:v.observationTicks,deadline,
          selectionAgeMs:v.clockedSelectionAgeMs??null,selectionMarginMs:v.clockedSelectionMarginMs??null});
      }
    }
    const historyLength=this.dryHistory.length;
    const previous=this.dryHistory[(block+historyLength-1)%historyLength];
    if(previous?.block===block-1)for(const [key,meta] of previous.dryInputs){
      const voice=this.bindings.get(key);
      if(voice && !dryInputs.has(key) && !current.has(key) &&
        engine.pipeline.renderer.sources.get('stock:slot'+voice.slot+':engine')?.generation===voice.rendererGeneration)
        dryInputs.set(key,meta); // Residual filter pressure with zero new input.
    }
    this.dryHistory[block%historyLength]={block,dryInputs};
    let sumLeft = 0, sumRight = 0, reflectedPaths = 0, unboundPaths = 0;
    const nonzeroPathsByOrder = [0,0,0,0];
    const owners = new Array(this.pathCount);
    for (let i = 0; i < this.pathCount; i++) {
      const l = this.left[i], r = this.right[i], path = this.paths[i];
      sumLeft += l;
      sumRight += r;
      const slotIndex = /^stock:slot([0-4]):/.exec(path.source.id)?.[1];
      const key = slotIndex + '/' + path.generation;
      const owner = current.get(key) ?? this.bindings.get(key);
      if (owner) nextBindings.set(key, owner);
      if (l === 0 && r === 0) continue;
      nonzeroPathsByOrder[Math.min(3,path.witnessOrder)]++;
      if (!owner) { unboundPaths++; continue; }
      owners[i] = key;
      let group = groups.get(key);
      if (!group) {
        group = {...owner, active: current.has(key), left: 0, right: 0, paths: 0,
          reflectedPaths: 0, presentMultiBouncePaths: 0, releasingPaths: 0, presentLeft: 0, presentRight: 0,
          oldestDryObservationQpc: null, earliestDryDeadlineQpc: null, unknownDryTaps: 0,
          dryDeadlineByPath: {direct:null,reflected:null,release:null},limitingTap:null};
        groups.set(key,group);
      }
      group.paths++;
      const pathKind=path.present?(path.witnessOrder>0?'reflected':'direct'):'release';
      for(const inputFrame of [this.firstTap[i],this.secondTap[i]])if(inputFrame>=0){
        const inputBlock=Math.floor(inputFrame/512);
        const entry=this.dryHistory[inputBlock%historyLength];
        const meta=entry?.block===inputBlock?entry.dryInputs.get(key):null;
        if(!meta){group.unknownDryTaps++;continue;}
        if(group.earliestDryDeadlineQpc===null || meta.deadline<group.earliestDryDeadlineQpc ||
          meta.deadline===group.earliestDryDeadlineQpc && inputFrame<group.limitingTap.inputFrame)
          group.limitingTap={inputFrame,flightFrames:this.frame-inputFrame,kind:pathKind,
            observedQpc:meta.observed,deadlineQpc:meta.deadline,selectionAgeMs:meta.selectionAgeMs,
            selectionMarginMs:meta.selectionMarginMs};
        group.oldestDryObservationQpc=Math.min(group.oldestDryObservationQpc??Infinity,meta.observed);
        group.earliestDryDeadlineQpc=Math.min(group.earliestDryDeadlineQpc??Infinity,meta.deadline);
        group.dryDeadlineByPath[pathKind]=Math.min(group.dryDeadlineByPath[pathKind]??Infinity,meta.deadline);
      }
      if (path.witnessOrder > 0) { group.reflectedPaths++; reflectedPaths++; }
      if (path.present) { group.presentLeft += l; group.presentRight += r; if(path.witnessOrder>=2)group.presentMultiBouncePaths++; }
      else group.releasingPaths++;
      group.left += l;
      group.right += r;
    }
    this.bindings = nextBindings;
    const [l,r] = this.stereo(sumLeft,sumRight);
    const packetLeft = packet.readFloatLE(16), packetRight = packet.readFloatLE(20);
    const packetMatches = this.frame === 512 * block && packetLeft === l && packetRight === r;
    const contributors = [];
    const scale = this.outputGain * this.masterGain * this.limiterGain;
    for (const [key,group] of groups) {
      group.left *= scale;
      group.right *= scale;
      // A sub-ULP path sum, exact cancellation or output mute cannot qualify a
      // contributor. Repeat this sample's original accumulation order with
      // just this generation's terms removed, including the final Float32 cast.
      let withoutLeft = 0, withoutRight = 0;
      for (let i = 0; i < this.pathCount; i++) if (owners[i] !== key) {
        withoutLeft += this.left[i];
        withoutRight += this.right[i];
      }
      const [omittedLeft,omittedRight] = this.stereo(withoutLeft,withoutRight);
      if (omittedLeft === l && omittedRight === r) continue;
      const present = group.presentLeft !== 0 || group.presentRight !== 0;
      delete group.presentLeft;
      delete group.presentRight;
      contributors.push({...group, present, withoutLeft: omittedLeft, withoutRight: omittedRight});
    }
    this.pathCount = 0;
    const activeContributors = contributors.filter(v=>v.active && v.present).length;
    const row = {block, frame: this.frame, packetLeft, packetRight, packetMatches, activeContributors,
      nonzeroPathsByOrder: scale === 0 ? [0,0,0,0] : nonzeroPathsByOrder,
      reflectedPaths: scale === 0 ? 0 : reflectedPaths, unboundPaths, contributors};
    this.rows.push(row);
    return row;
  }
  summary() {
    const qualified = this.rows.filter(r=>r.packetMatches && !r.unboundPaths);
    return {
      file: 'clocked-contributors.jsonl', framesSampled: this.rows.length,
      packetMismatches: this.rows.filter(r=>!r.packetMatches).length,
      unboundNonzeroPaths: this.rows.reduce((n,r)=>n+r.unboundPaths,0),
      maximumActiveContributors: qualified.reduce((n,r)=>Math.max(n,r.activeContributors),0),
      fiveContributorSamples: qualified.filter(r=>r.activeContributors===5).length,
      scope: 'First stereo frame of each producer packet. Omitting an attributed generation changes at least one Float32 channel. Each nonzero delay tap is joined to its emitted block and oldest vehicle control bracket. Its cutoff is the earliest of that observation plus 250 ms and the original left, right and latest frame leases. Filter and synthesis state can contain earlier history. Releases retain their original generation. Callback capture verifies the sampled frames at submission.'
    };
  }
}
