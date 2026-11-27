// Operator progress: ceil(94 * 512 / 48000 * 1000 + 250 poll + 250 scheduling margin) to 10 ms = 1510 ms.
// This is not transport freshness, prediction or an audio mute deadline.
export const budget = Object.freeze({ ready:25000, stop:45000, ack:60000, kill:65000, end:70000, statusAge:1510 });
export class Policy {
  constructor(limits=budget) {
    for(const key of Object.keys(budget))if(!Number.isFinite(limits[key])||limits[key]<=0||limits[key]>budget[key])throw Error('Invalid operator budget');
    if(!(limits.ready<limits.stop&&limits.stop<limits.ack&&limits.ack<limits.kill&&limits.kill<limits.end))throw Error('Invalid operator cutoff order');
    this.limits=Object.freeze({...limits}); this.state='waiting'; this.events=[]; this.frame=-1; this.progressAt=-Infinity; this.started=false; this.visible=false; this.armed=false; this.senderAck=false;
  }
  record(at, code) { if(this.events.length<256)this.events.push({at,code}); }
  abort(at,code) { if(this.state==='aborted'||this.state==='complete')return []; this.state='aborted';this.record(at,code);return ['mute','stop']; }
  closed(code,signal,at) {
    if(this.state==='complete'&&(code!==0||signal)){this.state='aborted';this.record(at,'abnormal-exit-after-stop');}
    else if(!['complete','aborted'].includes(this.state))this.abort(at,'unexpected-child-exit');
  }
  tick(at) {
    if(this.state==='aborted'||this.state==='complete')return [];
    if(!this.started&&at>=this.limits.ready)return this.abort(at,'readiness-deadline');
    if(this.started&&at-this.progressAt>this.limits.statusAge)return this.abort(at,'status-progress-expired');
    if(at>=this.limits.ack)return this.abort(at,'normal-stop-unconfirmed');
    if(this.started&&at>=this.limits.stop&&this.state!=='stopping'){this.state='stopping';this.record(at,'operator-bridge-stop-due');}
    return [];
  }
  status(s,at) {
    const due=this.tick(at); if(due.length||['aborted','complete'].includes(this.state))return due;
    const valid=s.type==='status'&&s.beaconFrequencyHz===600&&s.beaconLevel===.44&&s.outputTrim?.db===24&&s.outputTrim?.peakLimit===.5&&s.outputTrim?.rejectedBlocks===0&&(this.started||s.sourceEmitting===false)&&s.listenerMode==='native-orientation-only-in-synthetic-scene'&&['exact','interpolated','predicted'].includes(s.listenerPlayoutMode)&&s.listenerControlDelaySeconds===.1&&Number.isFinite(s.observationAgeSeconds)&&s.observationAgeSeconds>=0&&s.observationAgeSeconds<=.25&&Number.isSafeInteger(s.frame)&&s.frame>=0&&s.paths>0&&s.limited===0&&Number.isFinite(s.peak)&&(this.started||s.peak===0);
    if(!valid){if(this.started)return this.abort(at,'running-status-invalid');this.record(at,'status-not-ready');return [];}
    const advancing=s.frame>this.frame, recent=at-this.progressAt<=this.limits.statusAge;
    if(advancing){this.frame=s.frame;this.progressAt=at;}
    if(!this.started&&this.visible&&this.armed&&this.senderAck&&advancing&&recent){this.started=true;this.state='running';this.record(at,'start');return ['start'];}
    return [];
  }
  line(line,at) {
    if(line.startsWith('Listener terminal ')) {
      try { const s=JSON.parse(line.slice(18,line.lastIndexOf('}')+1));
        if(s.Connection===1&&s.Stage==='connection'&&s.Code==='sender-stop'&&s.Outcome==='deliberate-stop'&&s.Terminal===true&&s.AnotherAttempt===false&&at<this.limits.ack&&this.started&&this.state!=='aborted') {this.state='complete';this.record(at,'receiver-deliberate-stop');return [];}
      } catch {}
      return this.abort(at,'transport-terminal');
    }
    if(line.startsWith('RichAudio shared output:')&&line.endsWith('Maximum 120 seconds; gain 0.2')) {
      const due=this.tick(at);
      if(due.length||['aborted','complete'].includes(this.state)||at>=this.limits.ready){this.record(at,'startup-evidence-rejected');return due;}
      if(!this.visible){this.visible=true;this.record(at,'host-startup-observed');}
    }
    if(line.startsWith('{')) {try{return this.status(JSON.parse(line),at);}catch{return this.abort(at,'malformed-status');}}
    return this.tick(at);
  }
}
