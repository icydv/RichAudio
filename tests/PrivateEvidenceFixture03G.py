"""Owned targets and the unchanged actual supervisor; no game/OBS/endpoint."""
from pathlib import Path
import sys,time,threading,json,uuid,subprocess
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'tools/native-control/private-profile03g'));sys.dont_write_bytecode=True
from Shared import tc,Context,PACKAGE,ROOT,load,configure
from DecodeWindows import qpc,frequency,save
def setup():
    c=tc.load(tc.sha(PACKAGE/'toolchain-manifest.json'));configure(c,True);return c
def until(predicate,seconds=5):
    end=time.monotonic()+seconds
    while not predicate():assert time.monotonic()<end,'Disposable fixture timeout';time.sleep(.01)
class Fixture:
    def __init__(self,name):
        self.scope=PACKAGE/'fixtures'/(name+'-'+uuid.uuid4().hex);self.scope.mkdir(parents=True);self.session=uuid.uuid4().hex;self.results=[]
        self.w=load('watch_'+uuid.uuid4().hex,ROOT/'tools/native-control/private-profile03d/Watch-AuthorizedGame.py');self.w.subprocess=Context.processes
        self.binary=Path(Context.contract['programs']['supervisor']['path']);self.target=Context.processes.Popen(['python','-c','import sys;sys.stdin.readline()'],stdin=Context.processes.PIPE,text=True)
        i=self.w.query(self.binary,'--identity',self.target.pid)
        self.config=dict(Schema=1,Session=self.session,Mode='offline-fixture',ProcessId=self.target.pid,ProcessStartUtcTicks=i['CreationUtcTicks'],Executable=i['Executable'],ExecutableSha256=i['Sha256'],ExpectedIdentity=i,EvidenceRoot=str(self.scope/'supervision'),ShowUi=False,MaximumLifetimeMs=120000,ExitLeadMs=5000,ExitGraceMs=2000,HeartbeatTimeoutMs=500,StartupTimeoutMs=110000,AcknowledgeTimeoutMs=5000,Restoration=[dict(Path=str(self.scope/'absent'),Absent=True)])
        self.config_path=self.scope/'supervisor-configuration.json';save(self.config_path,self.config)
        self.thread=threading.Thread(target=lambda:self.results.append(self.w.supervise(self.binary,self.config_path,self.scope)));self.thread.start();until(lambda:(self.scope/'watcher-ready.json').exists())
    def request(self,source,duration=6,age=30,reverse=False):
        origin=qpc()-int(age*frequency());journal=self.scope/'probe.log'
        a='role=A model=bati/F9300CC5 handle=101 token=111';b='role=B model=bati/F9300CC5 handle=102 token=222'
        journal.write_text(f'2026-11-13T00:00:00Z qpc={origin+1} frequency={frequency()} spawn-request model=bati count=2 profile=ra_gapriv01_bati; no assignment\n'+f'sample label=baseline-ready role=A {a}\nsample label=baseline-ready role=B {b}\n')
        windows=dict(A=dict(source=str(source),start=3.,duration=duration,vehicle=a),B=dict(source=str(source),start=18.,duration=duration,vehicle=b))
        if reverse:windows=dict(reversed(list(windows.items())))
        return dict(session=self.session,offlineFixture=True,originQpc=origin,frequency=frequency(),output=str(self.scope/'analysis'),probeJournal=str(journal),supervision=dict(configuration=str(self.config_path),processBinding=str(self.scope/'supervisor-process.json')),windows=windows)
    def close(self):
        commands=self.scope/'monitor-commands.jsonl'
        with commands.open('a') as f:f.write(json.dumps(dict(command='normal-exit-requested'))+'\n')
        time.sleep(.05)
        if self.target.poll() is None:self.target.stdin.write('normal fixture exit\n');self.target.stdin.flush();self.target.wait(timeout=4)
        time.sleep(.05)
        with commands.open('a') as f:f.write(json.dumps(dict(command='verify-restoration'))+'\n')
        self.thread.join(5);assert not self.thread.is_alive() and self.results==[True],'Owned supervisor cleanup incomplete'
def run_native(fixture,request,review_delay=0,mutate=None):
    path=fixture.scope/'request.json';save(path,request);digest=tc.sha(PACKAGE/'qualification-manifest.json');began=time.monotonic()
    process=Context.processes.Popen([str(PACKAGE/'Private03G.Toolchain.exe'),'rehearse','--qualification-manifest-sha256',digest,'--request',str(path)],stdin=Context.processes.PIPE,stdout=Context.processes.PIPE,stderr=Context.processes.PIPE,text=True)
    events=[]
    try:
        for line in process.stdout:
            row=json.loads(line);events.append(row)
            if row.get('event')=='awaiting-independent-review':
                if mutate:mutate(fixture,request,row)
                time.sleep(review_delay)
                review=dict(command='confirm-independent-review',candidateSha256=row['candidateSha256'],reviewer='SIMULATED_OFFLINE_REVIEW',notes='Headless fixture; no claim of real independent human review',simulatedOfflineReview=True)
                from BaselineReview import REVIEW_FIELDS
                review.update({key:True for key in REVIEW_FIELDS});process.stdin.write(json.dumps(review)+'\n');process.stdin.flush()
            elif row.get('event')=='ready-for-manual-F10':
                with Path(request['probeJournal']).open('a') as f:f.write(f'2026-11-13T00:00:00Z qpc={qpc()} frequency={frequency()} baseline-gate-accepted; explicit F6/F7 still required\n');f.flush();__import__('os').fsync(f.fileno())
                process.stdin.write(json.dumps(dict(command='confirm-probe-baseline-ack'))+'\n');process.stdin.flush()
        code=process.wait(timeout=5);stderr=process.stderr.read()
        result=dict(exitCode=code,events=events,stderr=stderr,elapsedSeconds=time.monotonic()-began,reviewDelaySeconds=review_delay,request=request)
        save(fixture.scope/'cli-result.json',result);return result
    finally:
        if process.poll() is None:
            process.stdin.write(json.dumps(dict(command='cancel'))+'\n');process.stdin.flush();process.wait(timeout=10)
def run_session(fixture,source,capture_delay=0,review_delay=0,reverse=False,mutate=None,sealed=False,manual_ack_delay=3):
    import shutil,os
    journal=fixture.scope/'probe.log';journal.write_text('dormant; authored offline journal\n')
    setup=dict(session=fixture.session,offlineFixture=True,sessionEvidence=str(fixture.scope/'session'),probeJournal=str(journal),supervision=dict(configuration=str(fixture.config_path),processBinding=str(fixture.scope/'supervisor-process.json')))
    path=fixture.scope/'setup.json';save(path,setup);master=PACKAGE/('execution-manifest.json' if sealed else 'qualification-manifest.json');began=time.monotonic()
    # Post-seal rehearsal still uses the isolated qualification route; its
    # manifest must bind all final execution inputs and exact committed HEAD.
    digest=tc.sha(master)
    args=[str(PACKAGE/'Private03G.Toolchain.exe'),'rehearse','--qualification-manifest-sha256',digest,'--session','--request',str(path)]
    if sealed:raise AssertionError('Use final qualification manifest explicitly; no mode substitution')
    process=Context.processes.Popen(args,stdin=Context.processes.PIPE,stdout=Context.processes.PIPE,stderr=Context.processes.PIPE,text=True);events=[];cue_at=None;request=None;admission=None
    try:
        for line in process.stdout:
            row=json.loads(line);events.append(row)
            if row.get('event')=='admission-complete':admission=row
            if row.get('event')=='ready-for-single-pair':
                cue_at=time.monotonic();time.sleep(capture_delay)
                capture=fixture.scope/'capture.mkv';partial=fixture.scope/'capture.mkv.part'
                with Path(source).open('rb') as src,partial.open('xb') as dst:shutil.copyfileobj(src,dst);dst.flush();os.fsync(dst.fileno())
                partial.rename(capture)
                request=fixture.request(capture,reverse=reverse);request['originQpc']=row['cue']['originQpc'];request['frequency']=row['cue']['frequency']
                text=journal.read_text();text=text.replace(text.split('qpc=')[1].split()[0],str(request['originQpc']+1));journal.write_text(text)
                process.stdin.write(json.dumps(dict(command='analyse-baselines',request=request))+'\n');process.stdin.flush()
            elif row.get('event')=='awaiting-independent-review':
                if mutate:mutate(fixture,request,row)
                time.sleep(review_delay)
                from BaselineReview import REVIEW_FIELDS
                review=dict(command='confirm-independent-review',candidateSha256=row['candidateSha256'],reviewer='SIMULATED_OFFLINE_REVIEW',notes='Explicit reserved review interval, not an actual user confirmation',simulatedOfflineReview=True,**{k:True for k in REVIEW_FIELDS})
                process.stdin.write(json.dumps(review)+'\n');process.stdin.flush()
            elif row.get('event')=='ready-for-manual-F10':
                time.sleep(manual_ack_delay)
                with journal.open('a') as f:f.write(f'2026-11-13T00:00:00Z qpc={qpc()} frequency={frequency()} baseline-gate-accepted; explicit F6/F7 still required\n');f.flush();os.fsync(f.fileno())
                process.stdin.write(json.dumps(dict(command='confirm-probe-baseline-ack'))+'\n');process.stdin.flush()
        code=process.wait(timeout=5);elapsed=time.monotonic()-began;phase=None if cue_at is None else time.monotonic()-cue_at
        result=dict(exitCode=code,events=events,stderr=process.stderr.read(),totalWallSeconds=elapsed,preCueAdmissionSeconds=None if phase is None else elapsed-phase,phaseWallSeconds=phase,captureReserveActuallyWaitedSeconds=capture_delay,reviewReserveActuallyWaitedSeconds=review_delay,manualProbeAckActuallyWaitedSeconds=manual_ack_delay,automatedCriticalSeconds=None if phase is None else phase-capture_delay-review_delay-manual_ack_delay,budgetedCaptureSeconds=30,budgetedIndependentReviewSeconds=20,budgetedGateSeconds=None if phase is None else phase-capture_delay-review_delay-manual_ack_delay+50,source=tc.pin(source),request=request,qualificationOnly=True)
        save(fixture.scope/'session-cli-result.json',result);return result
    except Exception as error:
        save(fixture.scope/'session-client-error.json',dict(error=str(error),events=events,stderr=process.stderr.read() if process.poll() is not None else '',exitCode=process.poll()))
        raise
    finally:
        if process.poll() is None:process.stdin.write(json.dumps(dict(command='cancel'))+'\n');process.stdin.flush();process.wait(timeout=10)
