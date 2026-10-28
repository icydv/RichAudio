// Reconciliation is independent of process cleanup and never issues commands.
export class StopEvidence {
 constructor(limit=60000){this.limit=limit;this.receiver=null;this.sender=null;}
 receiverObserved(at,reportedElapsedMs=null){this.receiver={observedAtMs:at,reportedElapsedMs,occurrenceUpperBoundMs:at};}
 confirmSender({confirmedAtMs,observedAtMs=null,occurrenceUpperBoundMs=null,evidenceSha256=null}){
  if(!Number.isFinite(confirmedAtMs)||confirmedAtMs<0) return false;
  if(observedAtMs!==null&&(!Number.isFinite(observedAtMs)||observedAtMs<0||observedAtMs>confirmedAtMs))return false;
  // Historical occurrence claims require retained evidence; absent mapping stays unknown.
  if(occurrenceUpperBoundMs!==null&&(!/^[a-f0-9]{64}$/i.test(evidenceSha256??'')||!Number.isFinite(occurrenceUpperBoundMs)||occurrenceUpperBoundMs<0||occurrenceUpperBoundMs>confirmedAtMs))return false;
  if(observedAtMs!==null&&observedAtMs<confirmedAtMs&&!/^[a-f0-9]{64}$/i.test(evidenceSha256??''))return false;
  if(observedAtMs!==null&&occurrenceUpperBoundMs!==null&&occurrenceUpperBoundMs>observedAtMs)return false;
  if(this.sender)return false;
  this.sender={confirmedAtMs,observedAtMs,occurrenceUpperBoundMs,evidenceSha256};return true;
 }
 result(){const s=this.sender,r=this.receiver;const upper=s?.occurrenceUpperBoundMs??s?.observedAtMs;
  return {receiver:r,sender:s,acknowledgedStop:!!(r&&s),onTimeAcknowledgedStop:!!(r&&s&&upper!==null&&upper!==undefined&&upper<this.limit&&r.occurrenceUpperBoundMs<this.limit),timing:!r||!s||upper===null||upper===undefined?'unverified':upper>=this.limit||r.occurrenceUpperBoundMs>=this.limit?'late':'on-time'};
 }
}
