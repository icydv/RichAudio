// Opt-in worker boundary. No game/device IO; existing causal solver owns propagation.
import { observationCoordinates, ObservedGeometryFeed, modelPoint, modelDirection, modelVelocity } from '../engine/observed-geometry.mjs';
import { freeze, requireValue, conditionalDirectScene } from '../engine/contracts.mjs';
import { vector, inBox } from '../research/local-geometry.mjs';
import { validateNeutralEnvelope } from './listener-control.mjs';

const id=x=>typeof x==='string' && /^[\w.:-]{1,80}$/.test(x);
export const liveGeometryLimits=Object.freeze({bytes:65536,events:4,groups:2,minimumUpdateMs:50});

// TileObserver uses plugin-relative Stopwatch.Elapsed milliseconds. The listener
// uses raw QPC ticks. Their origins are NOT interchangeable. Require two paired
// readings from a common-rate publisher (or an explicitly controlled fixture).
export class ObservationClock {
  constructor(c) {
    requireValue(c && id(c.id) && c.relation==='paired-same-rate-monotonic' &&
      ['publisher-paired-samples','controlled-fixture'].includes(c.basis) &&
      Number.isSafeInteger(c.frequency) && c.frequency>0 && c.frequency<=1e10 &&
      Array.isArray(c.samples) && c.samples.length===2,'paired observation/listener clock evidence required');
    requireValue(c.delivery && Number.isFinite(c.delivery.maximumMs) && c.delivery.maximumMs>=0 && c.delivery.maximumMs<=10 &&
      id(c.delivery.reference) && (c.basis==='controlled-fixture'?c.delivery.basis==='controlled-fixture':
        c.delivery.basis==='measured-forwarding-upper-bound'),'bounded receiver-to-producer delivery evidence required');
    const [a,b]=c.samples;
    for(const p of c.samples)requireValue(Number.isFinite(p.observationMs) && p.observationMs>=0 &&
      Number.isSafeInteger(p.listenerTicks) && p.listenerTicks>=0 && Number.isFinite(p.uncertaintyMs) &&
      p.uncertaintyMs>=0 && p.uncertaintyMs<=1,'clock sample bounds');
    requireValue(b.observationMs-a.observationMs>=100 && b.observationMs-a.observationMs<=60000 &&
      b.listenerTicks>a.listenerTicks,'ordered clock sample span');
    const offsets=c.samples.map(p=>p.listenerTicks/c.frequency*1000-p.observationMs);
    this.low=Math.max(...offsets.map((x,i)=>x-c.samples[i].uncertaintyMs));
    this.high=Math.min(...offsets.map((x,i)=>x+c.samples[i].uncertaintyMs));
    requireValue(this.high>=this.low-1e-7,'clock samples disagree on common rate/origin');
    this.high=Math.max(this.high,this.low);
    this.frequency=c.frequency;this.id=c.id;this.basis=c.basis;
    this.deliveryMaximumMs=c.delivery.maximumMs;
    this.lastSampleTicks=b.listenerTicks;this.lastNow=-Infinity;this.lastLower=-Infinity;
  }
  now(anchor) {
    requireValue(!anchor?.clockError,anchor?.clockError);
    const m=validateNeutralEnvelope({type:'listener',state:anchor?.state,receiptAgeMs:anchor?.receiptAgeMs});
    requireValue(m.state.clockFrequency===this.frequency && Number.isFinite(anchor.queueAgeMs) &&
      anchor.queueAgeMs>=0 && anchor.queueAgeMs<=250 && m.receiptAgeMs+anchor.queueAgeMs<=250,'clock anchor freshness/frequency');
    const ticks=m.state.observationTicks+(m.receiptAgeMs+anchor.queueAgeMs)*this.frequency/1000;
    requireValue(ticks>=this.lastSampleTicks && ticks-this.lastSampleTicks<=this.frequency*120,'clock evidence horizon');
    let bound=this.deliveryMaximumMs;
    if(this.basis==='publisher-paired-samples'){
      const d=anchor.delivery;
      requireValue(d&&d.basis==='measured-forwarding-upper-bound'&&id(d.reference)&&Number.isFinite(d.maximumMs)&&d.maximumMs>0&&d.maximumMs<=10,
        'per-message measured forwarding evidence required');bound=d.maximumMs;
    }
    const uncertainty=anchor.queueUncertaintyMs??0;
    requireValue(Number.isFinite(uncertainty)&&uncertainty>=0&&uncertainty<=1,'dispatch pairing uncertainty');
    const lower=Math.max(this.lastLower,ticks/this.frequency*1000-this.high-uncertainty),upper=ticks/this.frequency*1000-this.low+bound+uncertainty;
    requireValue(lower>=0 && upper>=lower-1e-7,'observation clock reversed');
    this.lastLower=lower;this.lastNow=upper;return {lower,upper,uncertaintyMs:upper-lower,basis:this.basis,clockId:this.id};
  }
}

export class ObservedSimulationInput {
  constructor(simulation,sourceIds){
    this.simulation=simulation;this.sourceIds=sourceIds;this.feed=new ObservedGeometryFeed();
    this.config=null;this.epoch=0;this.lastRevision=0;this.lastUpdate=-Infinity;
    this.context=null;this.contextEpoch=0;this.directScene=null;this.lastAnchor=null;this.poseAccepted=false;this.transportAccepted=false;
    this.stats={configured:0,accepted:0,rejected:0,expired:0,poseRejected:0};
    this.status={mode:'missing-configuration',reason:null};
  }
  clear(reason,mode='rejected',permitDirect=true){
    this.feed.scene=null;this.simulation.replaceScene(permitDirect?this.directScene:null);
    this.status=this.directScene&&permitDirect?{mode:'conditional-direct-only',geometryMode:mode,reason,
      visibilityAssumption:'unobserved-space-assumed-clear',geometryPresent:false}:{mode,reason};
  }
  contextConfiguration(c,now){
    requireValue(c&&Number.isSafeInteger(c.contextEpoch)&&c.contextEpoch>this.contextEpoch&&
      /^[a-f0-9]{32}$/.test(c.listenerSession)&&id(c.build)&&Number.isSafeInteger(c.minimumListenerGeneration)&&c.minimumListenerGeneration>0,
      'listener context identity/epoch');
    requireValue(this.sourceIds.length===1&&this.sourceIds[0]==='beacon-0'&&c.directPath?.mode==='listener-only-conditional-direct'&&
      c.directPath.sourceId==='beacon-0'&&c.directPath.rights==='original-generated'&&
      c.directPath.visibilityAssumption==='unobserved-space-assumed-clear','explicit original beacon conditional-direct authorisation');
    if(this.context?.listenerSession===c.listenerSession)requireValue(c.minimumListenerGeneration>(this.lastListenerGeneration??this.context.minimumListenerGeneration),
      'new context requires a new listener generation');
    const coordinates=observationCoordinates(c.coordinates),lo=vector(c.region?.minNative),hi=vector(c.region?.maxNative);
    requireValue(lo.every((x,i)=>hi[i]>x),'bounded native model region required');
    const corners=[];for(const x of [lo[0],hi[0]])for(const y of [lo[1],hi[1]])for(const z of [lo[2],hi[2]])corners.push(modelPoint(coordinates,[x,y,z]));
    const modelBounds={min:[0,1,2].map(i=>Math.min(...corners.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...corners.map(p=>p[i])))};
    const direct=conditionalDirectScene({calibration:coordinates,modelBounds,listenerSession:c.listenerSession,contextEpoch:c.contextEpoch,
      sourceId:c.directPath.sourceId,visibilityAssumption:c.directPath.visibilityAssumption,engine:c.engine});
    this.coordinates=coordinates;this.owned=null;this.sources(c.sources,now);
    this.context=freeze(structuredClone(c));this.contextEpoch=c.contextEpoch;this.directScene=direct;this.lastAnchor=null;this.poseAccepted=false;
    this.config=null;this.clock=null;this.feed=new ObservedGeometryFeed();this.lastRevision=0;this.lastUpdate=-Infinity;
    this.clear(null,'not-requested');this.stats.configured++;
  }
  listenerTime(anchor){
    requireValue(!anchor?.clockError,anchor?.clockError);
    const envelope={type:'listener',state:anchor?.state,receiptAgeMs:anchor?.receiptAgeMs};
    const old=this.lastAnchor;
    if(old?.session===anchor?.state?.session&&old.sequence===anchor.state.sequence)
      requireValue(JSON.stringify(old)===JSON.stringify(anchor.state),'listener packet identity changed without sequence');
    const m=validateNeutralEnvelope(envelope,old&&old.sequence!==anchor?.state?.sequence?old:null);
    const d=anchor.delivery,fixture=d?.basis==='controlled-fixture';
    requireValue(d&&id(d.reference)&&Number.isFinite(d.maximumMs)&&d.maximumMs>=0&&d.maximumMs<=10&&
      (fixture||d.basis==='measured-forwarding-upper-bound')&&(fixture||d.maximumMs>0),'listener measured forwarding evidence required');
    requireValue(Number.isFinite(anchor.queueAgeMs)&&anchor.queueAgeMs>=0&&anchor.queueAgeMs<=250&&
      m.receiptAgeMs+anchor.queueAgeMs+d.maximumMs<=250,'listener context freshness');
    requireValue(m.state.valid&&!m.state.paused&&m.state.listenerKind==='camera'&&m.state.coordinates==='gta-native-unscaled'&&
      m.state.units==='native-unverified','valid native camera listener required');
    this.lastAnchor=m.state;return m;
  }
  sources(sources,now) {
    requireValue(Array.isArray(sources)&&sources.length===this.sourceIds.length,'owned source count');
    const seen=new Set();
    const checked=sources.map(s=>{
      requireValue(s&&this.sourceIds.includes(s.id)&&!seen.has(s.id)&&s.rights==='original-generated'&&id(s.reference)&&
        Number.isSafeInteger(s.generation)&&s.generation>0&&s.generation<=0xffffffff,'owned native source identity/rights');
      seen.add(s.id);
      const old=this.owned?.find(p=>p.id===s.id);
      requireValue(!old||s.generation>=old.generation,'source generation rollback');
      const positionNative=vector(s.positionNative),velocityNative=vector(s.velocityNative),
        forwardNative=modelDirection(this.coordinates,s.forwardNative),upNative=modelDirection(this.coordinates,s.upNative);
      requireValue(Math.hypot(...modelVelocity(this.coordinates,velocityNative))<=100,'mapped source speed');
      return {...s,positionNative,velocityNative,forward:forwardNative,up:upNative,at:now};
    });
    this.owned=freeze(checked);
  }
  configure(c,now) {
    requireValue(c&&Number.isSafeInteger(c.epoch)&&c.epoch>this.epoch&&id(c.geometrySession)&&
      /^[a-f0-9]{32}$/.test(c.listenerSession)&&id(c.build)&&Number.isSafeInteger(c.interior)&&c.interior>=0&&
      Number.isSafeInteger(c.minimumListenerGeneration)&&c.minimumListenerGeneration>0,'geometry configuration context/epoch');
    if(this.config && c.listenerSession===this.config.listenerSession){
      // A new observation session/interior does not change the native coordinate
      // basis. Fresh configuration replaces geometry without retagging source PCM.
      const changed=JSON.stringify(c.coordinates)!==JSON.stringify(this.config.coordinates)||c.build!==this.config.build;
      requireValue(!changed || c.minimumListenerGeneration>(this.lastListenerGeneration??this.config.minimumListenerGeneration),
        'coordinate/context change requires a new listener generation');
    }
    const coordinates=observationCoordinates(c.coordinates),clock=new ObservationClock(c.clock);
    if(this.context){
      requireValue(c.listenerSession===this.context.listenerSession&&c.minimumListenerGeneration>=this.context.minimumListenerGeneration&&
        c.build===this.context.build&&JSON.stringify(c.coordinates)===JSON.stringify(this.context.coordinates)&&
        JSON.stringify(c.sources)===JSON.stringify(this.context.sources)&&JSON.stringify(c.region)===JSON.stringify(this.context.region),
        'geometry must attach to established listener/source context');
    }else{this.coordinates=coordinates;this.owned=null;this.sources(c.sources,now);}
    this.config=freeze(structuredClone(c));this.clock=clock;this.epoch=c.epoch;
    this.feed=new ObservedGeometryFeed();this.lastRevision=0;this.lastUpdate=-Infinity;
    this.clear(null,'waiting-for-geometry');this.stats.configured++;
  }
  consume(events,anchor,now) {
    requireValue(Array.isArray(events)&&events.length<=liveGeometryLimits.events,'geometry event budget');
    for(const event of events){
      try {
        requireValue(Buffer.byteLength(JSON.stringify(event))<=liveGeometryLimits.bytes,'geometry byte budget');
        if(event.type==='listener-context-config'){this.contextConfiguration(event.configuration,now);continue;}
        if(event.type==='geometry-config'){this.configure(event.configuration,now);continue;}
        requireValue(this.config&&event.epoch===this.epoch,'geometry configuration missing/incompatible');
        if(event.type==='owned-sources'){this.sources(event.sources,now);continue;}
        requireValue(event.type==='geometry' && event.clockId===this.clock.id &&
          event.session===this.config.geometrySession&&event.build===this.config.build&&event.interior===this.config.interior &&
          Number.isSafeInteger(event.revision)&&event.revision>this.lastRevision,'geometry context/revision');
        // A rejected revision cannot be replayed as a newly arrived observation.
        this.lastRevision=event.revision;
        if(event.unavailableReason!==undefined){
          requireValue(id(event.unavailableReason)&&Array.isArray(event.groups)&&!event.groups.length,'unavailable geometry notice');
          this.clear(event.unavailableReason,'unavailable');continue;
        }
        requireValue(anchor?.state?.session===this.config.listenerSession,'listener/geometry session pairing missing');
        const t=this.clock.now(anchor);
        requireValue(t.upper-this.lastUpdate>=liveGeometryLimits.minimumUpdateMs-1e-7,'geometry update rate');
        requireValue(Array.isArray(event.groups)&&event.groups.length<=liveGeometryLimits.groups,'live geometry group budget');
        const observedAt=event.groups.length?Math.max(...event.groups.map(g=>g.FinishedMs)):event.observedAtMs;
        requireValue(Number.isFinite(observedAt)&&observedAt<=t.lower+1e-7,'future/ambiguous geometry timestamp');
        if(!event.groups.length)requireValue(Number.isFinite(event.observedAtMs)&&event.observedAtMs>=0&&
          t.upper<event.observedAtMs+1000,'expired empty observation set');
        for(const g of event.groups)requireValue(t.upper<g.FinishedMs+1000,'stale observation uncertainty/expiry');
        const scene=this.feed.publish({groups:event.groups,coordinates:this.coordinates,region:this.config.region,
          listenerNative:anchor.state.position,context:{session:this.config.geometrySession,build:this.config.build,
            interior:this.config.interior,revision:event.revision,nowMs:t.lower},
          emptyValidUntilMs:event.observedAtMs+1000,materialsByKind:this.config.materialsByKind,
          visibilityAssumption:'unobserved-space-assumed-clear',motionAssumption:'static-during-snapshot',engine:this.config.engine});
        this.simulation.replaceScene(scene);this.lastUpdate=t.upper;this.stats.accepted++;
        this.status={mode:'active',reason:null,revision:event.revision,calibration:'declared-demonstration-scale',
          physicalCalibration:'unverified',geometryKey:scene.geometryKey,clock:t,visibilityAssumption:'unobserved-space-assumed-clear',geometryPresent:true,
          originalObservationTimes:scene.observationModel.evidence.map(e=>({kind:e.kind,finishedMs:e.finishedMs,validUntilMs:e.originalValidUntilMs}))};
      }catch(error){
        if(event?.type==='listener-context-config'){this.context=null;this.directScene=null;this.config=null;this.owned=null;}
        if(event?.type==='geometry-config'){this.config=null;if(!this.context)this.owned=null;}
        this.stats.rejected++;this.clear(error.message);
      }
    }
  }
  prepareSnapshot(snapshot,anchor,now) {
    let time;
    this.poseAccepted=false;this.transportAccepted=false;
    try{
      const context=this.context??this.config;
      requireValue(context&&anchor?.state?.session===context.listenerSession&&
        anchor.state.generation>=context.minimumListenerGeneration,'listener/source session pairing unavailable');
      if(this.context)this.listenerTime(anchor);
      if(this.config)time=this.clock.now(anchor);
      this.transportAccepted=true;
      this.lastListenerGeneration=anchor.state.generation;
      if(this.feed.scene && !this.feed.current({session:this.config.geometrySession,build:this.config.build,
        interior:this.config.interior,nowMs:time.upper})){
        this.stats.expired++;this.clear('original observation lease expired','expired');
      }
      requireValue(snapshot?.listener?.coordinates==='gta-native-unscaled'&&snapshot.listener.units==='native-unverified'&&
        snapshot.session===context.listenerSession&&snapshot.listener.session===anchor.state.session&&
        snapshot.listener.generation===anchor.state.generation&&snapshot.listener.sequence<=anchor.state.sequence&&
        snapshot.listener.observationTicks<=anchor.state.observationTicks,'native pose context required; no synthetic position fallback');
      const s=snapshot.listener;
      const listener={position:modelPoint(this.coordinates,s.position),velocity:modelVelocity(this.coordinates,s.velocity),
        forward:modelDirection(this.coordinates,s.forward),up:modelDirection(this.coordinates,s.up),generation:s.generation,
        valid:s.valid,emitting:false};
      const sources=this.owned.map(s=>({id:s.id,generation:s.generation,
        position:modelPoint(this.coordinates,s.positionNative.map((x,i)=>x+s.velocityNative[i]*(now-s.at))),
        velocity:modelVelocity(this.coordinates,s.velocityNative),forward:s.forward,up:s.up,valid:true,
        emitting:snapshot.emitting,directivity:0.2}));
      this.simulation.observe({time:now,session:snapshot.session,generation:snapshot.generation,listener,sources,paused:snapshot.paused});
      this.poseAccepted=listener.valid&&!snapshot.paused;
      if(this.poseAccepted&&this.directScene&&!this.feed.scene&&this.simulation.scene!==this.directScene)this.clear(this.status.reason,this.status.geometryMode??this.status.mode);
      this.listenerEvidence={session:snapshot.session,generation:s.generation,sequence:s.sequence,
        observationTicks:s.observationTicks,clockFrequency:s.clockFrequency,gameTimeMs:s.gameTimeMs,
        coordinates:s.coordinates,units:s.units,listenerKind:s.listenerKind,velocityKind:s.velocityKind};
    }catch(error){this.stats.poseRejected++;this.clear(error.message,'unavailable-pose',false);}
    return time;
  }
  decorate(control,time,now){
    control.geometry={...this.status,stats:{...this.stats},sourceRights:'original-generated',
      mappedListener:this.simulation.records.at(-1)?.time===now?this.simulation.records.at(-1).listener:null,
      mappedSources:this.simulation.records.at(-1)?.time===now?this.simulation.records.at(-1).sources:null,clock:time??null};
    const context=this.context??this.config,current=this.simulation.records.at(-1)?.time===now?this.simulation.records.at(-1):null,
      bounds=this.simulation.scene?.modelBounds??this.simulation.scene?.tile?.bounds;
    const listenerInRegion=Boolean(bounds&&current?.listener&&inBox(current.listener.position,bounds)),
      sourcesInRegion=Boolean(bounds&&current&&this.sourceIds.every(id=>current.sources[id]&&inBox(current.sources[id].position,bounds)));
    const originalReady=Boolean(this.poseAccepted&&context&&this.owned?.length&&this.simulation.scene&&listenerInRegion&&sourcesInRegion);
    control.readiness={transportAccepted:this.transportAccepted,contextInitialized:Boolean(context&&this.owned?.length),
      rendererReadyForOwnedEmission:originalReady,genuineGeometryPresent:Boolean(this.feed.scene?.tile),
      observedSurfaceCount:this.feed.scene?.tile?.surfaces.length??0,
      emissionUnavailableReason:!this.poseAccepted?'listener-unavailable':!context||!this.owned?.length?'context-unavailable':
        !bounds?'propagation-model-unavailable':!listenerInRegion?'listener-outside-configured-region':!sourcesInRegion?'owned-source-outside-configured-region':null,
      reflectionsActive:control.paths.some(p=>p.order>0),mode:this.simulation.scene?.directPath?'listener-only-conditional-direct':
        this.feed.scene?'conditional-observed-geometry':'unavailable',visibilityAssumption:originalReady?'unobserved-space-assumed-clear':null};
    if(this.simulation.captureSoundMap&&this.simulation.soundMapState){
      this.simulation.soundMapState.coordinateContract=this.coordinates??null;
      this.simulation.soundMapState.listenerEvidence=this.simulation.records.at(-1)?.time===now?this.listenerEvidence:null;}
    return control;
  }
  update(snapshot,anchor,now){
    const time=this.prepareSnapshot(snapshot,anchor,now);
    return this.decorate(this.simulation.update(now,{geometryTimeMs:time?.upper}),time,now);
  }
  async updateAccelerated(snapshot,anchor,now,backend,refreshAnchor=()=>anchor){
    let time=this.prepareSnapshot(snapshot,anchor,now);
    const frame=this.simulation.prepareUpdate(now,{geometryTimeMs:time?.upper});
    if(frame.terminal)return this.decorate(this.simulation.completeUpdate(frame),time,now);
    const current=()=>{
      try{
        if(this.context)this.listenerTime(refreshAnchor());
        if(this.config)time=this.clock.now(refreshAnchor());
        if(this.feed.scene&&!this.feed.current({session:this.config.geometrySession,build:this.config.build,interior:this.config.interior,nowMs:time.upper})){
          this.stats.expired++;this.clear('original observation lease expired during acoustic work','expired');return false;
        }
        return true;
      }catch(error){this.poseAccepted=false;this.stats.poseRejected++;this.clear(error.message,'unavailable-pose',false);return false;}
    };
    if(!current())return this.decorate(this.simulation.update(now,{geometryTimeMs:time?.upper}),time,now);
    const queries=frame.scene.directPath?null:await backend.query(frame.scene.tile,frame.segments,{generation:frame.geometryEpoch});
    if(!current())return this.decorate(this.simulation.update(now,{geometryTimeMs:time?.upper}),time,now);
    let control=this.simulation.completeUpdate(frame,queries);
    if(!current())control=this.simulation.update(now,{geometryTimeMs:time?.upper});
    return this.decorate(control,time,now);
  }
}
