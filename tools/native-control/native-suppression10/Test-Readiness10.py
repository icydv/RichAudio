"""Retained real recording + independently muxed, controlled offline producers."""
from pathlib import Path
import hashlib,importlib.util,json,shutil,subprocess,sys,time
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
def mod(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
gate=mod('gate09',HERE/'Readiness10.py');op=mod('op09',HERE/'Operator10.py')
OLD=Path(r'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-08')
MANIFEST=Path(r'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\gate-a-shvdne-private-03b\capture-dependencies.json')
MANIFEST_SHA='4656785f5833c9f26a5dc4218b8e6e3b3e88008ae46f816c1fa516512671446b'
def run(root,bridge=None):
    root=Path(root);assert not root.exists();root.mkdir(parents=True);checks=[]
    def check(b,s):assert b,s;checks.append(s);print('PASS '+s,flush=True)
    prefix=(OLD/'analysis/recorder-readiness/prefix.mkv').read_bytes();final=(OLD/'capture/2026-11-15 23-15-31.mkv').read_bytes();later=prefix+final[len(prefix):]
    protected={p:op.sha(p) for p in [OLD/'analysis/recorder-readiness/prefix.mkv',OLD/'analysis/recorder-readiness/receipt.json',OLD/'capture/2026-11-15 23-15-31.mkv',OLD/'analysis/readiness-diagnosis/diagnosis.json']}
    class Fixture:
        def __init__(self,name,data=prefix,path=None,session='fixture-session',recording='fixture-recording',phase=False):
            self.root=path or root/name;self.root.mkdir(exist_ok=True,parents=True);self.source=self.root/'source.mkv';self.source.write_bytes(data);self.tick=14000;self.active=True
            self.plan=dict(Root=str(self.root),Output=str(self.root/'analysis/recorder-readiness'),Source=str(self.source),Session=session,Observation='recorder-readiness',Phase='recorder-readiness',Generation='unspawned',Recording=recording,Profile='NONE',ActiveStartSeconds=0,Windows=[dict(Name='ready',StartSeconds=1)],Dependencies=str(MANIFEST),DependenciesSha256=MANIFEST_SHA,Frequency=1000,OriginQpc=1000,AdmissionDeadlineQpc=51000)
            if phase:
                self.tick=31000;self.plan.update(Output=str(self.root/'analysis'/('a'*32)),Observation='a'*32,Phase='baseline',Generation='authored-pair',Profile='BATI',ActiveStartSeconds=1,Windows=[dict(Name='horn',StartSeconds=2),dict(Name='steady',StartSeconds=5)],CoverageRequestedQpc=31000,CoverageDeadlineQpc=41000)
                op.atomic(self.root/'analysis'/('plan-'+self.plan['Observation']+'.json'),self.plan,True)
            self.g=gate.Readiness(self.plan,now=lambda:self.tick,context=self.context)
        def context(self):
            if not self.active:raise gate.Refused('recording-stopped-unexpectedly')
        def append(self):
            with self.source.open('ab') as f:f.write(final[len(prefix):]);f.flush()
            self.tick=31000
    f=Fixture('original-08');s=f.g.step();check(s['State']=='MediaAvailable','original immutable prefix remains rejected as incomplete')
    cov=s['Coverage'];check(abs(cov['audioEndSeconds']-8.917333333333334)<1e-9,'actual original audio ends at 8.917333 seconds')
    check(abs(cov['videoEndSeconds']-9)<1e-9 and cov['lastVideoPts']==8.967,'actual original video ends at 9.000 seconds')
    check('required-video-review-frame-unavailable' in cov['reasons'],'10.9-second review frame is still required')
    early=f.g.work/'attempt-01/candidate.mkv';early_hash=op.sha(early);f.append();s=f.g.step()
    check(s['State']=='Admitted' and s['Durable'],'later append-only bytes from the same controlled recording pass the full unchanged validator')
    check(op.sha(early)==early_hash and s['SnapshotSha256']==op.sha(f.source),'earlier snapshot immutable; admitted bytes exactly inspected later prefix')
    receipt=op.read(s['Receipt']);check(receipt['Windows'][0]['StartSeconds']==1 and receipt['Windows'][0]['Frames']==480000,'original full ten-second PCM contract retained')
    check(any(x['requested']==10.9 for x in receipt['ReviewFrames'][0]['frames']),'full validator retains the exact review-frame request')
    av=gate.capture.old.dependencies(MANIFEST,MANIFEST_SHA)
    plain=Path(r'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\gate-a-shvdne-private-03g\fixtures\authored-media\plain.mkv')
    def mux(name,aend,vend):
        p=root/(name+'.mkv')
        with av.open(str(plain)) as inp,av.open(str(p),'w') as out:
            streams={s.index:out.add_stream_from_template(s) for s in inp.streams}
            for packet in inp.demux():
                if packet.dts is None:continue
                end=aend if packet.stream.type=='audio' else vend
                if float(packet.pts*packet.time_base)>=end:continue
                packet.stream=streams[packet.stream.index];out.mux(packet)
        return p.read_bytes()
    for name,aend,vend,reason in [('audio-first',13,9,'video-endpoint-not-reached'),('video-first',9,13,'audio-endpoint-not-reached')]:
        f=Fixture(name,mux(name,aend,vend));f.tick=31000;s=f.g.step();check(s['State']=='MediaAvailable' and reason in s['Reason'],'independently controlled '+name+' cannot admit one ready track')
    f=Fixture('complete',later);f.tick=31000;check(f.g.step()['State']=='Admitted','complete interval passes with both decoded endpoints')
    f=Fixture('copy-mutation');f.g.copy_hook=lambda source,dest:source.write_bytes(b'!'+source.read_bytes()[1:]);check('changed-during-copy' in f.g.step()['Reason'],'source mutation during copying refused')
    f=Fixture('decode-mutation');original=gate.capture.decode
    def mutate(path,av,requests=()):
        value=original(path,av,requests);path.write_bytes(path.read_bytes()+b'!');return value
    gate.capture.decode=mutate
    try:check(f.g.step()['Reason']=='snapshot-changed-during-decode','snapshot mutation during decode refused')
    finally:gate.capture.decode=original
    f=Fixture('source-disappeared');f.source.unlink();check(f.g.step()['State']=='Refused','source disappearance is a permanent refusal')
    f=Fixture('stopped');f.active=False;check(f.g.step()['Reason']=='recording-stopped-unexpectedly','unexpected recording stop cannot admit finalized bytes')
    f=Fixture('future-finalized',final);check(f.g.step()['Reason']=='media-timestamps-in-future','future-finalized media cannot supply readiness early')
    bad=(plain.parent/'audio-gap.mkv').read_bytes();f=Fixture('timestamp-corruption',bad);f.tick=31000;check('invalid-media-timestamps' in f.g.step()['Reason'],'corrupt timestamps are not treated as a wait')
    f=Fixture('malformed',b'not a Matroska recording');check(f.g.step()['Reason']=='malformed-matroska-header','malformed container is rejected permanently')
    f=Fixture('truncated',prefix[:30]);s=f.g.step();check(s['State']!='Admitted','truncated container cannot admit')
    f.tick=51000;check(f.g.step()['State']=='Refused','truncated/incomplete media does not wait indefinitely')
    f=Fixture('just-before',later);f.tick=50900;check(f.g.step()['State']=='Admitted','complete validation just before original fifty-second admission deadline passes')
    f=Fixture('at-deadline',later);f.tick=51000;check(f.g.step()['Reason']=='preroll-admission-deadline-exceeded','deadline is not renewed by complete media')
    f=Fixture('incomplete-until-deadline');count=0
    while not f.g.done:f.g.step();count+=1;f.tick+=500
    check(count<102 and f.g.latest['State']=='Refused' and f.g.attempts==1,'incomplete stable source uses bounded polling and never redecodes identical bytes')
    f=Fixture('temporarily-unreadable');old_open=gate.shared_source;gate.shared_source=lambda p:(_ for _ in ()).throw(PermissionError('fixture sharing'))
    try:check(f.g.step()['Reason']=='source-temporarily-unreadable','transient sharing failure waits without a false positive')
    finally:gate.shared_source=old_open
    f.tick=31000;f.append();check(f.g.step()['State']=='Admitted','same source can progress after temporary unreadability')
    f=Fixture('stale-status');f.g.context=f.g.live_context;(f.root/'operator').mkdir();op.atomic(f.root/'operator/capture.json',dict(Session='fixture-session',Recording='fixture-recording',RecordingActive=True,ObservedTicks=1),True)
    check(f.g.step()['Reason']=='capture-status-stale','stale recording context cannot admit complete or incomplete media')
    f=Fixture('append-identity');f.g.step();f.source.write_bytes(b'!'+prefix[1:]);check(f.g.step()['Reason']=='source-is-not-append-only','same-size source overwrite is refused')
    f=Fixture('phase-progress',phase=True);check(f.g.step()['State']=='MediaAvailable','fixed phase windows also wait for written media without retiming')
    f.append();f.tick=35000;admitted=f.g.step();check(admitted['State']=='Admitted','later phase bytes pass the unchanged full validator inside the same bound')
    class Completed:
        returncode=0
        def poll(self):return 0
    receipt,result=op.coverage_result(f.root,f.plan['Observation'],Completed())
    check(result['Passed'] and [x['StartSeconds'] for x in result['Windows']]==[2,5],'parent requires durable phase admission and preserves both exact anchors')
    # A full validation receipt may survive a later refusal; it cannot be used
    # to bypass the final source/deadline checks.
    status=op.read(f.g.status_path);status.update(State='Refused',Reason='source-changed-before-admission');op.atomic(f.g.status_path,status)
    receipt,result=op.coverage_result(f.root,f.plan['Observation'],Completed())
    check(not result['Passed'] and op.read(f.g.output/'receipt.json')['Passed'],'parent rejects refused gate while preserving the earlier validation evidence')
    f=Fixture('phase-deadline',phase=True);f.g.step();f.tick=41000;s=f.g.step()
    check(s['Reason']=='fixed-window-coverage-deadline-exceeded' and not op.read(f.g.output/'receipt.json')['Passed'],'phase wait has its own ten-second bound and produces a typed refusal')
    f=Fixture('source-changed-after-validation',later);f.tick=31000;bundle=gate.capture.bundle
    def replace_after(plan):
        result=bundle(plan);f.source.write_bytes(b'!'+f.source.read_bytes()[1:]);return result
    gate.capture.bundle=replace_after
    try:check(f.g.step()['Reason']=='source-changed-before-admission','source mutation after full validation still prevents admission')
    finally:gate.capture.bundle=bundle
    if bridge:
        d=root/'bridge-integration';d.mkdir();child=subprocess.Popen([str(bridge),str(d)],creationflags=subprocess.CREATE_NO_WINDOW,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        until=time.monotonic()+5
        while not (d/'operator/state.json').exists() and time.monotonic()<until:time.sleep(.02)
        state=op.read(d/'operator/state.json');f=Fixture('bridge',path=d,session=state['Session']);s=f.g.step()
        check(s['State']=='MediaAvailable' and op.read(d/'operator/state.json')['Stage']=='Dormant','actual bridge stays Dormant while recording media is incomplete')
        time.sleep(.1);f.append();admitted=f.g.step()
        class Job:
            returncode=0
            def poll(self):return 0
        actual_qpc=op.qpc;op.qpc=lambda:f.tick
        try:eligible=op.readiness_admitted(d,Job(),dict(Session=state['Session'],Recording='fixture-recording'),1000,1000)
        finally:op.qpc=actual_qpc
        check(eligible and admitted['Durable'],'actual parent eligibility function requires the durable full validator result')
        state=op.read(d/'operator/state.json');seq=1
        def pulse():
            nonlocal seq;seq+=1;op.atomic(d/'operator/capture.json',dict(Session=state['Session'],Recording='fixture-recording',RecordingActive=True,Foreground=True,TimelineReady=True,StartupAdmitted=eligible,ObservedTicks=op.qpc(),Sequence=seq))
        pulse();time.sleep(.1);state=op.read(d/'operator/state.json');cid=op.command(d,state,'Begin','AUTOMATED OFFLINE READINESS FIXTURE; not live approval')
        until=time.monotonic()+3
        while time.monotonic()<until:pulse();time.sleep(.05)
        reply=op.read(d/'operator/replies'/(cid+'.json'));check(reply['Result']=='accepted start','unchanged checked runner accepts Begin only after readiness')
        state=op.read(d/'operator/state.json');op.command(d,state,'Stop','AUTOMATED fixture cleanup after readiness')
        until=time.monotonic()+8
        while child.poll() is None and time.monotonic()<until:pulse();time.sleep(.05)
        check(child.wait(2)==0,'integration runner cleans up without user experiment keys')
        journal=(d/'operator/journal.log').read_text();check('armed phase=' not in journal and 'native-dispatch' not in journal,'readiness waiting and Begin do not arm any audio profile')
    for path,digest in protected.items():check(op.sha(path)==digest,'historical evidence unchanged: '+path.name)
    result=dict(passed=True,checks=checks,gameLaunched=False,obsLaunched=False,scope='Retained real media; controlled append-only producer and independently remuxed fixtures; actual bounded bridge/runner with authored game API; no real-game qualification',sources=[dict(path=str(p),sha256=op.sha(p)) for p in [HERE/'Readiness10.py',HERE/'Operator10.py',Path(__file__)]])
    op.atomic(root/'result.json',result,True)
if __name__=='__main__':run(Path(sys.argv[1]),Path(sys.argv[2]) if len(sys.argv)>2 else None)
