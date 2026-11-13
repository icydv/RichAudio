"""One bounded A/B evidence transaction. No keypress, native or assignment API."""
from pathlib import Path
import os,json,time,threading,queue,re,sys
from Shared import ROOT,PACKAGE,tc,Context
from DecodeWindows import Snapshot,decode,save,qpc,frequency,no_links,bounded
REVIEW_FIELDS=['completeHornA','completeHornB','videoOriginReviewed','exactVehicleLifetimesReviewed','noKnownContamination','captureAndTimelineReviewed']
PROCESSING_SECONDS=10
REVIEW_SECONDS=20
PROBE_ACK_SECONDS=5
MINIMUM_MARGIN_SECONDS=10
class Supervision:
    def __del__(self):
        try:self.close()
        except Exception:pass
    def __init__(self,request,allowed):
        self.c=request['supervision'];self.held=[];self.transient_status_reads=[]
        for key in ['configuration','processBinding']:
            lease=Snapshot(self.c[key],allowed);self.held.append(lease)
        self.config=json.loads(self._bytes(0));self.binding=json.loads(self._bytes(1))
        self.session=request['session'];assert self.config['Session']==self.binding['session']==self.session
        assert self.config['Mode']==('offline-fixture' if request['offlineFixture'] else 'candidate')
        bounded(self.config['EvidenceRoot'],allowed)
        ready=Snapshot(Path(self.config['EvidenceRoot'])/'runs'/self.session/'ready.json',allowed);self.held.append(ready);ready.file.seek(0);admitted=json.load(ready.file)
        assert admitted['session']==self.session and admitted['configurationSha256']==self.held[0].sha256,'Supervisor configuration changed after admission'
        assert admitted['monitor']['CreationFileTime']==self.binding['creationFileTime'] and admitted['monitor']['FileIdentity']==self.binding['fileIdentity'] and admitted['monitor']['ProcessId']==self.binding['pid'],'Wrong admitted supervisor'
        if request['offlineFixture']:assert Path(self.config['Executable'])==Path(Context.contract['programs']['python']['path']),'Offline supervision requires owned retained-Python fixture'
        if not request['offlineFixture']:
            plan=tc.read(PACKAGE/'deployment-plan.json');game=next(x for x in plan['protectedGame'] if Path(x['path']).name=='GTA5_Enhanced.exe')
            assert Path(self.c['configuration'])==PACKAGE/'execution-01/supervisor-configuration.json' and Path(self.c['processBinding'])==PACKAGE/'execution-01/supervisor-process.json'
            assert self.session==plan['session'] and self.config['ExecutionManifestPath']==str(PACKAGE/'execution-manifest.json') and self.config['ExecutionManifestSha256']==tc.sha(PACKAGE/'execution-manifest.json')
            assert self.config['Executable'].casefold()==game['path'].casefold() and self.config['ExecutableSha256']==game['sha256']
        self.binary=Context.contract['programs']['supervisor']['path'];self.last=0;self.check(identity=True)
    def _bytes(self,i):self.held[i].file.seek(0);return self.held[i].file.read()
    def check(self,identity=False):
        if identity:
            row=json.loads(Context.processes.check_output([self.binary,'--identity',str(self.binding['pid'])],text=True,stderr=Context.processes.PIPE,timeout=2))
            for actual,key in [('ProcessId','pid'),('CreationFileTime','creationFileTime'),('CreationUtcTicks','creationUtcTicks'),('FileIdentity','fileIdentity'),('Sha256','sha256')]:assert row[actual]==self.binding[key],'Supervisor process identity drift: '+key
            assert row['Executable'].casefold()==row['CanonicalPath'].casefold()==self.binary.casefold()
            assert row['Sha256']==Context.contract['programs']['supervisor']['sha256']
        if not identity and time.monotonic()-self.last<.1:return
        # Atomic supervisor status requires FILE_SHARE_DELETE. No ordinary open.
        import ctypes,msvcrt
        path=Path(self.config['EvidenceRoot'])/'runs'/self.session/'status.json';no_links(path.parent)
        fn=ctypes.WinDLL('kernel32',use_last_error=True).CreateFileW;fn.restype=ctypes.c_void_p;fn.argtypes=[ctypes.c_wchar_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p]
        until=time.monotonic()+.1
        while True:
            handle=fn(str(path),0x80000000,7,None,3,0x00200000,None)
            if handle not in [None,ctypes.c_void_p(-1).value]:break
            error=ctypes.get_last_error()
            self.transient_status_reads.append(dict(error=error,observedQpc=qpc()))
            assert error in [2,3,32] and time.monotonic()<until,'Supervisor status unavailable: '+str(error)
            time.sleep(.005)
        with os.fdopen(msvcrt.open_osfhandle(handle,os.O_RDONLY|os.O_BINARY),'rb') as f:
            info=os.fstat(f.fileno());assert not info.st_file_attributes&0x400,'Reparse supervisor status refused';stamp=info.st_mtime_ns;status=json.load(f)
        assert -100000000<=time.time_ns()-stamp<=1000000000,'Stale supervisor status'
        assert not any(status[k] for k in ['stopRequested','processExited','exitDeadlineViolated','journalError']),'Independent supervisor no longer admits analysis'
        assert qpc()<status['hardDeadlineQpc'],'Absolute session deadline expired'
        self.status=status
        self.last=time.monotonic()
    def close(self):
        for s in getattr(self,'held',[]):s.close()
class Transaction:
    def __init__(self,request,qualification=False,input_queue=None,checkpoint=None):
        self.r=request;self.qualification=qualification;self.held=[];self.supervision=None;self.timings={};self.origin=request['originQpc'];self.freq=request['frequency'];self.deadline=self.origin+80*self.freq;self.cancelled=False;self.checkpoint=checkpoint
        assert self.freq==frequency() and 0<self.origin<=qpc(),'Clock origin/frequency invalid'
        assert self.deadline-qpc()>=(PROCESSING_SECONDS+REVIEW_SECONDS+PROBE_ACK_SECONDS+MINIMUM_MARGIN_SECONDS)*self.freq,'Insufficient remaining analysis/review margin'
        self.processing_deadline=qpc()+PROCESSING_SECONDS*self.freq;self.processing=True
        assert request['offlineFixture']==qualification,'Fixture flag cannot admit a live transaction'
        self.allowed=PACKAGE/('fixtures' if qualification else 'execution-01');self.out=bounded(request['output'],self.allowed);assert not self.out.exists();self.out.mkdir(parents=True)
        if not qualification:
            cue=Snapshot(PACKAGE/'execution-01/pair-cue.json',self.allowed);self.held.append(cue);cue.file.seek(0);value=json.load(cue.file)
            assert value['originQpc']==self.origin and value['frequency']==self.freq and value['session']==request['session'] and value['manifestSha256']==tc.sha(PACKAGE/'execution-manifest.json'),'Incorrect conservative pair cue'
        assert set(request['windows'])=={'A','B'} and request['windows']['A']['vehicle']!=request['windows']['B']['vehicle'],'Separate A/B identities required'
        identities=[]
        for role,w in request['windows'].items():
            match=re.fullmatch('role='+role+r' model=bati/F9300CC5 handle=(-?\d+) token=(\d+)',w['vehicle']);assert match,'Exact role/handle/token required'
            handle,token=map(int,match.groups());assert -2147483648<=handle<=2147483647 and handle!=0 and 0<token<=2147483647,'Invalid native handle/token';identities.append((handle,token))
        assert identities[0][0]!=identities[1][0] and identities[0][1]!=identities[1][1],'Reused A/B handle or token'
        self.inputs=input_queue or queue.Queue(maxsize=4);self.reader_started=input_queue is not None
    def check(self,identity=False):
        assert not self.cancelled,'Analysis cancelled'
        assert qpc()<self.deadline,'80-second baseline deadline expired'
        if self.processing:assert qpc()<self.processing_deadline,'10-second evidence-processing budget expired'
        if identity and self.checkpoint:self.checkpoint()
        if self.supervision:self.supervision.check(identity)
    def journal(self):
        path=Path(self.r['probeJournal']);no_links(path)
        if self.qualification:assert path.is_relative_to(self.allowed)
        else:
            expected=Path(tc.read(PACKAGE/'deployment-plan.json')['gameRoot'])/'scripts/RichAudio.GateAPrivate03C.Evidence'
            assert path.parent==expected and re.fullmatch('session-[a-f0-9]{32}\\.log',path.name),'Unbound current probe journal'
        # Probe journal is intentionally append-only and still open for writing.
        with path.open('rb') as f:content=f.read()
        if hasattr(self,'journal_prefix'):assert content.startswith(self.journal_prefix),'Probe journal truncated or changed'
        else:self.journal_prefix=content; (self.out/'probe-journal-prefix.log').write_bytes(content)
        text=content.decode('utf-8');assert text.endswith('\n'),'Incomplete probe journal record'
        spawn=[line for line in text.splitlines() if ' spawn-request model=bati count=2 profile=ra_gapriv01_bati;' in line]
        assert len(spawn)==1 and int(re.search(r' qpc=(\d+)',spawn[0])[1])>=self.origin,'Cue must precede unique pair request'
        assert int(re.search(r' frequency=(\d+)',spawn[0])[1])==self.freq,'Probe clock frequency changed'
        assert not any(x in text for x in ['native-dispatch-attempt','assignment-intent','manual-arm ','probe-fault','stop reason=','identity-lost']),'Probe no longer in baseline phase'
        for role,w in self.r['windows'].items():assert 'sample label=baseline-ready role='+role+' '+w['vehicle'] in text,'Wrong A/B baseline lifetime'
    def start_reader(self):
        if self.reader_started:return
        def read():
            for line in sys.stdin:
                try:self.inputs.put(json.loads(line))
                except ValueError:self.inputs.put(dict(command='invalid'))
            self.inputs.put(dict(command='cancel'))
        threading.Thread(target=read,daemon=True).start()
        self.reader_started=True
    def poll_cancel(self):
        # Review messages may arrive only after the candidate digest is printed.
        while not self.inputs.empty():
            item=self.inputs.get_nowait()
            if item.get('command')=='cancel':self.cancelled=True
            else:raise RuntimeError('Premature or unexpected confirmation')
        self.check()
    def run(self):
        began=time.monotonic();self.start_reader()
        try:
            self.check();self.supervision=Supervision(self.r,self.allowed);self.journal();grouped={};sources={};by_role={}
            t=time.monotonic()
            for role,w in self.r['windows'].items():
                key=str(bounded(w['source'],self.allowed)).casefold()
                if key not in sources:
                    snap=Snapshot(w['source'],self.allowed,w.get('expectedSource'));self.held.append(snap);sources[key]=snap;grouped[key]={}
                grouped[key][role]=w
                by_role[role]=sources[key]
            a,b=self.r['windows']['A'],self.r['windows']['B']
            if by_role['A'].sha256==by_role['B'].sha256:assert a['start']+a['duration']<=b['start'] or b['start']+b['duration']<=a['start'],'Overlapping A/B source windows refused'
            self.timings['source-finalization-identity-and-hash']=time.monotonic()-t;t=time.monotonic();windows={}
            for key,group in grouped.items():windows.update(decode(sources[key],group,self.out,self.poll_cancel))
            self.timings['decode-all-media-and-timeline']=time.monotonic()-t;t=time.monotonic()
            for role in ['A','B']:
                held=Snapshot(windows[role]['output']['path'],self.out,windows[role]['output']);self.held.append(held)
            child=Context.processes.Popen(['node',str(ROOT/'tools/native-control/private-profile03g/MarkerBatch.mjs'),'baselines',windows['A']['output']['path'],windows['B']['output']['path']],stdout=Context.processes.PIPE,stderr=Context.processes.PIPE,text=True)
            while True:
                try:stdout,stderr=child.communicate(timeout=.05);break
                except Context.processes.TimeoutExpired:self.poll_cancel()
            assert child.returncode==0,'Marker CLI failure '+stderr
            self.check(identity=True);self.journal();proof=json.loads(stdout);self.timings['marker-process-total']=time.monotonic()-t;self.timings['detector-computation']=proof['detectorSeconds']
            assert all(x.unchanged() for x in self.held),'Source/output changed after classification'
            candidate=dict(schema='Private03G-IndependentBaselineCandidate01',session=self.r['session'],offlineFixture=self.qualification,originQpc=self.origin,deadlineQpc=self.deadline,windows=windows,proof=proof['result'],automatedChecksOnly=True,accepted=False,timings=self.timings)
            save(self.out/'candidate.json',candidate);self.check();digest=tc.sha(self.out/'candidate.json')
            assert proof['result']['verdict']=='PASS','Marker-negative admission is '+proof['result']['verdict']
            self.processing=False;review_deadline=min(self.deadline,qpc()+REVIEW_SECONDS*self.freq)
            print(json.dumps(dict(event='awaiting-independent-review',candidateSha256=digest,output=str(self.out),deadlineQpc=self.deadline)),flush=True);t=time.monotonic()
            while True:
                self.check();assert qpc()<review_deadline,'20-second independent-review budget expired'
                try:review=self.inputs.get(timeout=min(.1,(self.deadline-qpc())/self.freq));break
                except queue.Empty:pass
            assert review.get('command')=='confirm-independent-review' and review.get('candidateSha256')==digest,'Review absent, cancelled or bound to different evidence'
            assert bool(review.get('reviewer')) and bool(review.get('notes')) and all(review.get(k) is True for k in REVIEW_FIELDS),'Incomplete independent provenance/horn review'
            assert bool(review.get('simulatedOfflineReview'))==self.qualification,'Offline rehearsal cannot claim actual human review'
            self.timings['independent-review-wait']=time.monotonic()-t
            self.check(identity=True);self.journal();assert all(x.unchanged() for x in self.held),'Evidence changed during manual review'
            assert self.deadline-qpc()>=(PROBE_ACK_SECONDS+MINIMUM_MARGIN_SECONDS)*self.freq,'Insufficient final probe-acknowledgement margin'
            # Consumers must check current deadline and absence of failure.json;
            # file existence is never assignment permission. The probe's own F10
            # journal acknowledgement and native80/100-second checks remain final.
            accepted=dict(candidateSha256=digest,review=review,session=self.r['session'],originQpc=self.origin,deadlineQpc=self.deadline,reviewedAtQpc=qpc(),offlineFixture=self.qualification,assignmentPermission=False)
            t=time.monotonic();save(self.out/'acceptance.json',accepted);self.check();self.timings['durable-acceptance-and-post-flush-check']=time.monotonic()-t
            print(json.dumps(dict(event='ready-for-manual-F10',independentReviewDurable=True,assignmentPermission=False,deadlineQpc=self.deadline)),flush=True)
            t=time.monotonic();ack_deadline=min(self.deadline,qpc()+PROBE_ACK_SECONDS*self.freq)
            while True:
                self.check();assert qpc()<ack_deadline,'Manual F10/probe acknowledgement reserve expired'
                try:ack=self.inputs.get(timeout=.05);break
                except queue.Empty:pass
            assert ack.get('command')=='confirm-probe-baseline-ack','No manual probe baseline acknowledgement'
            self.journal();text=Path(self.r['probeJournal']).read_text();lines=[line for line in text.splitlines() if ' baseline-gate-accepted; explicit F6/F7 still required' in line]
            assert len(lines)==1,'Unique probe baseline acceptance not observed'
            stamp=re.search(r' qpc=(\d+)',lines[0]);assert stamp,'Malformed probe baseline acknowledgement'
            assert int(re.search(r' frequency=(\d+)',lines[0])[1])==self.freq,'Probe acknowledgement clock changed'
            accepted_qpc=int(stamp[1]);assert self.origin<=accepted_qpc<self.deadline,'Probe baseline acknowledgement out of window'
            self.check(identity=True);assert all(x.unchanged() for x in self.held),'Evidence changed before probe acknowledgement'
            self.timings['manual-F10-and-probe-ack-wait']=time.monotonic()-t
            result=dict(passed=True,baselineGateQualified=True,eligibleForManualF10Review=True,assignmentPermission=False,durableAcceptance=tc.pin(self.out/'acceptance.json'),probeBaselineAcknowledgedQpc=accepted_qpc,completedQpc=qpc(),elapsedSeconds=time.monotonic()-began,timings=self.timings,transientStatusReads=self.supervision.transient_status_reads,offlineFixture=self.qualification)
            save(self.out/'result.json',result);self.check();assert self.deadline-qpc()>=MINIMUM_MARGIN_SECONDS*self.freq,'Final baseline margin below10seconds';print(json.dumps(result),flush=True);return 0
        except BaseException as error:
            result=dict(passed=False,eligibleForManualF10Review=False,assignmentPermission=False,error=str(error),completedQpc=qpc(),elapsedSeconds=time.monotonic()-began,offlineFixture=self.qualification)
            if not (self.out/'failure.json').exists():save(self.out/'failure.json',result)
            print(json.dumps(result),flush=True);return 3
        finally:
            if 'child' in locals() and child.poll() is None:
                # No game/runtime termination. A bounded detector normally ends;
                # retain an unresponsive owned-child PID rather than force it.
                try:child.wait(timeout=3)
                except Context.processes.TimeoutExpired:save(self.out/'pending-detector-closure.json',dict(pid=child.pid))
            for held in self.held:held.close()
            if self.supervision:self.supervision.close()
def acceptance_current(output,session,now=None,offline_fixture=False):
    try:p=bounded(output,PACKAGE/('fixtures' if offline_fixture else 'execution-01'))
    except (AssertionError,OSError):return False
    if (p/'failure.json').exists() or (p/'pending-detector-closure.json').exists():return False
    try:
        r=tc.read(p/'result.json');a=tc.read(p/'acceptance.json');c=tc.read(p/'candidate.json')
        valid=r['passed'] and r['baselineGateQualified'] and a['offlineFixture']==offline_fixture and a['session']==session==c['session'] and a['candidateSha256']==tc.sha(p/'candidate.json') and r['durableAcceptance']==tc.pin(p/'acceptance.json') and r['probeBaselineAcknowledgedQpc']<r['completedQpc']<a['deadlineQpc'] and (qpc() if now is None else now)<a['deadlineQpc']-MINIMUM_MARGIN_SECONDS*frequency() and c['proof']['verdict']=='PASS'
        if not valid:return False
        for window in c['windows'].values():
            tc.check(window['output']);tc.check(window['source']);assert tc.identity(window['source']['path'])=={k:window['source'][k] for k in ['canonicalPath','fileIdentity']}
        return (qpc() if now is None else now)<a['deadlineQpc']-MINIMUM_MARGIN_SECONDS*frequency()
    except (OSError,ValueError,KeyError,TypeError,AssertionError,RuntimeError):return False
