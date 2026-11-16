"""Bounded media-coverage scheduling around the unchanged candidate-08 validator."""
from pathlib import Path
import argparse,ctypes,hashlib,importlib.util,json,os,re,sys,time
from ctypes import wintypes as w
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
capture=module('capture08',HERE.parent/'native-suppression08/Capture08.py')
io=module('io08',HERE.parent/'native-suppression08/Operator08.py')
POLL_SECONDS=.5
MAX_SNAPSHOT_BYTES=134217728
MAX_ATTEMPTS=64
class Refused(Exception):pass
class Deadline(Refused):pass

def shared_source(path):
    # Explicit read/write/delete sharing: the copy never locks out OBS's writer.
    import msvcrt
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    k.CreateFileW.argtypes=[w.LPCWSTR,w.DWORD,w.DWORD,ctypes.c_void_p,w.DWORD,w.DWORD,w.HANDLE];k.CreateFileW.restype=w.HANDLE
    h=k.CreateFileW(str(path),0x80000000,7,None,3,0x80,None)
    if h==ctypes.c_void_p(-1).value:
        code=ctypes.get_last_error()
        if code in [2,3]:raise FileNotFoundError(str(path))
        if code in [32,33]:raise PermissionError(str(path))
        raise OSError(code,ctypes.FormatError(code))
    return os.fdopen(msvcrt.open_osfhandle(int(h),os.O_RDONLY|os.O_BINARY),'rb')

class BudgetAv:
    """Only adds a deadline check between packets; frame values are untouched."""
    def __init__(self,av,check):self.av=av;self.check=check
    def __getattr__(self,key):return getattr(self.av,key)
    def open(self,*args,**kwargs):
        owner=self
        class Container:
            def __enter__(self):self.c=owner.av.open(*args,**kwargs);return self
            def __exit__(self,*exc):self.c.close()
            def __getattr__(self,key):return getattr(self.c,key)
            def demux(self,*streams):
                for packet in self.c.demux(*streams):owner.check();yield packet
        return Container()

def coverage(audio,video,end,review):
    a=audio[-1]['pts']+audio[-1]['duration'] if audio else 0
    v=video[-1]['pts']+video[-1]['duration'] if video else 0
    p=video[-1]['pts'] if video else None
    reasons=[]
    if a+1e-9<end:reasons.append('audio-endpoint-not-reached')
    if v+1e-9<end:reasons.append('video-endpoint-not-reached')
    if p is None or p+1e-9<review:reasons.append('required-video-review-frame-unavailable')
    return dict(complete=not reasons,reasons=reasons,audioEndSeconds=a,videoEndSeconds=v,lastVideoPts=p,requiredEndSeconds=end,requiredReviewFrameSeconds=review)

class Readiness:
    def __init__(self,plan,now=io.qpc,context=None,copy_hook=None):
        self.plan=plan;self.now=now;self.context=context or self.live_context;self.copy_hook=copy_hook
        self.root=Path(plan['Root']);self.source=capture.old.checked_path(Path(plan['Source']),self.root)
        self.output=capture.old.checked_path(Path(plan['Output']),self.root)
        self.startup=plan['Phase']=='recorder-readiness';self.freq=plan['Frequency'];self.origin=plan['OriginQpc']
        assert self.freq>0
        if self.startup:
            assert plan['ActiveStartSeconds']==0 and plan['Observation']=='recorder-readiness' and plan['Generation']=='unspawned' and plan['Profile']=='NONE','fixed pre-activation identity'
            assert plan['Windows']==[dict(Name='ready',StartSeconds=1)],'fixed 1..11 interval only'
            self.deadline=self.origin+50*self.freq
            assert plan['AdmissionDeadlineQpc']==self.deadline,'unchanged 50-second admission reserve'
        else:
            profiles={'B-pre':'NONE','B-post':'NONE','baseline':'BATI','0':'BATI','1':'ADDER','2':'BATI','3':'ra_ns06_adder_select','4':'BATI','release':'BATI'}
            assert plan['Phase'] in profiles and plan['Profile']==profiles[plan['Phase']] and plan['Generation']!='unspawned' and re.fullmatch('[a-f0-9]{32}',plan['Observation']),'fixed audio-observation binding'
            names={'B-pre':{'B-stability','B-pre'},'B-post':{'B-post'},'baseline':{'horn','steady'}}.get(plan['Phase'],{'transition','steady','horn'})
            assert {x['Name'] for x in plan['Windows']}==names and len(plan['Windows'])==len(names),'original declared windows only'
            self.deadline=plan['CoverageDeadlineQpc']
            assert self.deadline<=plan['CoverageRequestedQpc']+10*self.freq and self.deadline<=self.origin+round((plan['ActiveStartSeconds']+600)*self.freq),'coverage waiting cannot extend phase or session bounds'
        for window in plan['Windows']:capture.old.check_window(window['StartSeconds'],10,plan['ActiveStartSeconds'])
        self.required_end=max(x['StartSeconds']+10 for x in plan['Windows']);self.review_end=max(x['StartSeconds']+9.9 for x in plan['Windows'])
        assert not self.output.exists(),'one committed readiness bundle'
        suffix='readiness' if self.startup else 'coverage-'+plan['Observation']
        self.work=self.root/('analysis/'+suffix+'-attempts');self.work.mkdir(exist_ok=False,parents=True)
        self.status_path=self.root/(suffix+'-status.json');self.done=False;self.attempts=0;self.bytes=0
        self.source_id=None;self.previous_size=0;self.previous_hash=None;self.polls=0
        self.av=None;self.started=self.now();self.status('RecordingActive',reason='awaiting-usable-media')
    def check(self):
        if self.now()>=self.deadline:raise Deadline('preroll-admission-deadline-exceeded' if self.startup else 'fixed-window-coverage-deadline-exceeded')
    def live_context(self):
        s=io.read(self.root/'operator/capture.json');now=self.now()
        if s['Session']!=self.plan['Session'] or s['Recording']!=self.plan['Recording']:raise Refused('capture-session-or-recording-changed')
        if not s['RecordingActive']:raise Refused('recording-stopped-unexpectedly')
        if not 0<=now-s['ObservedTicks']<=2*self.freq:raise Refused('capture-status-stale')
    def status(self,state,**data):
        obj=dict(schema='NativeSuppression09ReadinessStatus',State=state,Session=self.plan['Session'],Recording=self.plan['Recording'],Observation=self.plan['Observation'],Phase=self.plan['Phase'],Generation=self.plan['Generation'],Profile=self.plan['Profile'],OriginQpc=self.origin,DeadlineQpc=self.deadline,ObservedQpc=self.now(),RemainingSeconds=max(0,(self.deadline-self.now())/self.freq),Attempts=self.attempts,SnapshotBytes=self.bytes,**data)
        io.atomic(self.status_path,obj);self.latest=obj;return obj
    def fail(self,reason,**data):
        self.done=True
        if not self.startup and not (self.output/'receipt.json').exists():
            self.output.mkdir(exist_ok=True,parents=True)
            io.atomic(self.output/'receipt.json',dict(schema='NativeSuppression09CoverageRefusal',Passed=False,Windows=[],Error=reason,**{k:self.plan[k] for k in ['Session','Recording','Observation','Phase','Generation','Profile']}),True)
        return self.status('Refused',Reason=reason,**data)
    def copy(self):
        self.check();self.context()
        with shared_source(self.source) as f:
            before=os.fstat(f.fileno());sid=list(capture.old.identity(before))
            if before.st_nlink!=1 or not 0<=before.st_size<=capture.old.MAX_BYTES:raise Refused('source-size-or-link-invalid')
            if self.source_id is not None and sid!=self.source_id:raise Refused('source-identity-changed')
            self.source_id=sid
            if self.previous_hash is not None and (before.st_size<self.previous_size or capture.old.prefix_hash(f,self.previous_size)!=self.previous_hash):raise Refused('source-is-not-append-only')
            if before.st_size==self.previous_size:return None
            if self.attempts>=MAX_ATTEMPTS or self.bytes+before.st_size>MAX_SNAPSHOT_BYTES:raise Refused('bounded-snapshot-budget-exceeded')
            self.attempts+=1;self.bytes+=before.st_size
            folder=self.work/('attempt-%02d'%self.attempts);folder.mkdir();dest=folder/'candidate.mkv';began=self.now();digest=hashlib.sha256();f.seek(0);left=before.st_size
            with dest.open('xb') as out:
                while left:
                    self.check();block=f.read(min(left,1048576))
                    if not block:raise Refused('source-shortened-during-copy')
                    out.write(block);digest.update(block);left-=len(block)
                out.flush();os.fsync(out.fileno())
            if self.copy_hook:self.copy_hook(self.source,dest)
            after=os.fstat(f.fileno());current=self.source.stat();sha=digest.hexdigest()
            if sid!=list(capture.old.identity(after)) or sid!=list(capture.old.identity(current)):raise Refused('source-identity-changed-during-copy')
            if not before.st_size<=after.st_size<=capture.old.MAX_BYTES or capture.old.prefix_hash(f,before.st_size)!=sha:raise Refused('source-prefix-changed-during-copy')
            if capture.old.sha(dest)!=sha:raise Refused('isolated-snapshot-changed')
            self.previous_size=before.st_size;self.previous_hash=sha
            record=dict(Source=str(self.source),SourceIdentity=sid,SourceBytesBefore=before.st_size,SourceBytesAfter=after.st_size,Snapshot=str(dest),Sha256=sha,CopyStartedQpc=began,CopyFinishedQpc=self.now(),ReadWriteDeleteSharing=True,CommittedReadinessSnapshot=False)
            io.atomic(folder/'copy.json',record,True);return dest,record
    def step(self):
        if self.done:return self.latest
        attempt=None
        try:
            self.check();self.context();self.polls+=1
            if self.polls>101:raise Refused('bounded-poll-count-exceeded')
            try:attempt=self.copy()
            except PermissionError:return self.status('Waiting',Reason='source-temporarily-unreadable')
            if attempt is None:return self.status('Waiting',Reason='waiting-for-new-source-bytes')
            path,record=attempt;before=capture.old.sha(path)
            with path.open('rb') as header:magic=header.read(4)
            if magic!=b'\x1aE\xdf\xa3':raise Refused('malformed-matroska-header')
            if self.av is None:self.av=capture.old.dependencies(self.plan['Dependencies'],self.plan['DependenciesSha256'])
            av=BudgetAv(self.av,self.check)
            try:audio,video,pcm,pictures,total=capture.decode(path,av,())
            except self.av.error.EOFError as error:
                io.atomic(path.parent/'coverage.json',dict(State='Waiting',Reason='incomplete-container-at-eof',Error=str(error)),True)
                return self.status('Waiting',Reason='incomplete-container-at-eof')
            finally:
                if capture.old.sha(path)!=before:raise Refused('snapshot-changed-during-decode')
            self.check();self.context()
            cov=coverage(audio,video,self.required_end,self.review_end)
            verdicts=[capture.old.validate(audio,video,x['StartSeconds'],10,fixture=False) for x in self.plan['Windows']]
            # Coverage-only failures may progress. Invalid timestamps cannot.
            invalid=[r for verdict in verdicts for r in verdict['reasons'] if r not in ['no-audio-frames','insufficient-video-frames','video-does-not-cover-declared-audio-window']]
            if invalid:raise Refused('invalid-media-timestamps: '+','.join(invalid))
            elapsed=(self.now()-self.origin)/self.freq
            if max(cov['audioEndSeconds'],cov['videoEndSeconds'])>elapsed+.250:raise Refused('media-timestamps-in-future')
            io.atomic(path.parent/'coverage.json',dict(State='RequiredCoverageComplete' if cov['complete'] else 'MediaAvailable',Coverage=cov,Timelines=verdicts,InspectedQpc=self.now(),RecordingElapsedSeconds=elapsed),True)
            if not cov['complete']:return self.status('MediaAvailable',Reason=','.join(cov['reasons']),Coverage=cov)
            self.status('RequiredCoverageComplete',Coverage=cov,Candidate=str(path),CandidateSha256=before)
            self.check();self.context()
            # Full validator reads exactly the inspected immutable bytes, not a
            # newly sampled live file. Its original code/policy are unchanged.
            final_plan=dict(self.plan,Source=str(path));plan_path=path.parent/'full-validation-plan.json';io.atomic(plan_path,final_plan,True)
            original_decode=capture.decode
            def budget_decode(source,av_arg,requests=()):return original_decode(source,BudgetAv(self.av,self.check),requests)
            try:
                capture.decode=budget_decode
                result=capture.bundle(plan_path)
            finally:capture.decode=original_decode
            self.check();self.context()
            if not result['Passed']:raise Refused('full-readiness-validation-failed: '+result.get('Error','unknown'))
            if result['Snapshot']['snapshotSha256']!=before or capture.old.sha(path)!=before:raise Refused('committed-snapshot-not-inspected-bytes')
            receipt=self.output/'receipt.json'
            for file in self.output.iterdir():
                if file.is_file():
                    with file.open('r+b') as f:os.fsync(f.fileno()) # FlushFileBuffers needs a writable handle; no bytes are written.
            with shared_source(self.source) as live:
                stat=os.fstat(live.fileno())
                if list(capture.old.identity(stat))!=self.source_id or list(capture.old.identity(self.source.stat()))!=self.source_id or stat.st_size<record['SourceBytesBefore'] or capture.old.prefix_hash(live,record['SourceBytesBefore'])!=before:raise Refused('source-changed-before-admission')
            self.check();self.context();self.done=True
            return self.status('Admitted',Receipt=str(receipt),ReceiptSha256=capture.old.sha(receipt),SnapshotSha256=before,SourceIdentity=self.source_id,Coverage=cov,ValidationFinishedQpc=self.now(),Durable=True)
        except FileNotFoundError as e:return self.fail('source-or-required-context-disappeared',Error=str(e))
        except Deadline as e:return self.fail(str(e))
        except Refused as e:return self.fail(str(e))
        except Exception as e:return self.fail('snapshot-decode-or-integrity-failed',Error=type(e).__name__+':'+str(e))
    def run(self):
        while not self.done:
            self.step()
            if not self.done:time.sleep(min(POLL_SECONDS,max(0,(self.deadline-self.now())/self.freq)))
        return self.latest

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('plan',type=Path);args=parser.parse_args()
    result=Readiness(io.read(args.plan)).run();print(json.dumps(result),flush=True);sys.exit(0 if result['State']=='Admitted' else 1)
