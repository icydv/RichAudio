"""Actual disposable processes using the production bridge/client. No GTA/OBS."""
from pathlib import Path
import importlib.util,json,subprocess,sys,time,uuid
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;spec=importlib.util.spec_from_file_location('op07',HERE/'Operator07.py');op=importlib.util.module_from_spec(spec);spec.loader.exec_module(op)

def run(root,bridge_binary,python):
    root=Path(root).absolute();assert not root.exists();root.mkdir(parents=True);tests=[];children=[]
    def check(name,b):tests.append(dict(name=name,passed=bool(b)));print(('PASS ' if b else 'FAIL ')+name,flush=True);assert b,name
    def wait(p,timeout=8):
        end=time.monotonic()+timeout
        while not p.exists() and time.monotonic()<end:time.sleep(.03)
        assert p.exists(),str(p);return p
    flags=subprocess.CREATE_NO_WINDOW
    lua=Path(r'C:\Program Files\obs-studio\bin\64bit\lua51.dll')
    for mode in ['normal','lost','mic']:
        d=root/('recorder-'+mode);(d/'operator').mkdir(parents=True);session=uuid.uuid4().hex
        (d/'operator/activation.lock').write_text(session+' 1 1')
        child=subprocess.Popen([python,'-I','-S','-B',str(HERE.parents[2]/'tests/host/DisposableRecorder07.py'),str(d),str(HERE/'Recorder07.lua'),str(lua),mode],creationflags=flags,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE);children.append(child)
        wait(d/'operator/recorder-state.json');rec=op.LocalRecorder(d,session)
        if mode=='normal':
            check('real Lua VM initially reports inactive',not rec.call('GetRecordStatus')['outputActive']);rec.call('StartRecord');check('frontend recording state read back',rec.call('GetRecordStatus')['outputActive'])
            try:rec.call('SetInputMute')
            except AssertionError:check('arbitrary recorder operation refused',True)
            else:raise AssertionError('arbitrary recording command')
            try:rec.call('StartRecord')
            except AssertionError:check('duplicate start cannot call frontend twice',rec.snapshot()['Starts']==1)
            else:raise AssertionError('duplicate start')
            for label,foreign,expired in [('foreign session',True,False),('expired request',False,True)]:
                cid=uuid.uuid4().hex;op.atomic(d/'operator/recorder-request.json',dict(Session='foreign' if foreign else session,Id=cid,Operation='Start',ExpiresNs=op.qpc()*1000000000//op.frequency()+(-1 if expired else 5000000000)))
                end=time.monotonic()+2
                while time.monotonic()<end:
                    r=op.read(d/'operator/recorder-reply.json')
                    if r.get('Id')==cid:break
                    time.sleep(.02)
                check(label+' rejected by actual Lua path',r['Id']==cid and not r['Accepted'] and rec.snapshot()['Starts']==1)
            rec.call('StopRecord');check('frontend stop verified',not rec.call('GetRecordStatus')['outputActive'])
        elif mode=='lost':
            try:rec.call('StartRecord')
            except TimeoutError:check('lost recorder reply does not resend',rec.snapshot()['Starts']==1)
            else:raise AssertionError('lost recording outcome accepted')
        else:
            try:rec.call('StartRecord')
            except AssertionError:check('extra microphone input blocks recording',rec.snapshot()['Starts']==0)
            else:raise AssertionError('microphone graph accepted')
        rec.close();code=child.wait(12);detail=child.stderr.read().decode();check('disposable Lua recorder exits normally '+mode,code==0)
        if code:raise AssertionError(detail)
    d=root/'bridge';d.mkdir();child=subprocess.Popen([bridge_binary,str(d)],creationflags=flags,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE);children.append(child)
    state_path=wait(d/'operator/state.json');state=op.read(state_path);lock=(d/'operator/activation.lock').read_text().split()
    identity=op.ProcessIdentity(child.pid,int(lock[2]),bridge_binary,op.sha(bridge_binary));check('actual process path/hash/creation bound',identity.alive())
    try:op.ProcessIdentity(child.pid,int(lock[2])+1,bridge_binary,op.sha(bridge_binary))
    except AssertionError:check('reused PID generation rejected',True)
    else:raise AssertionError('wrong PID generation')
    try:identity.foreground(True)
    except AssertionError:check('hidden process cannot receive blind foreground input',True)
    session=state['Session'];seq=0
    def pulse():
        nonlocal seq;seq+=1;op.atomic(d/'operator/capture.json',dict(Session=session,Recording='DISPOSABLE-FIXTURE-NO-LIVE-CAPTURE',ObservedTicks=op.qpc(),Sequence=seq,RecordingActive=True,TimelineReady=True,Foreground=True))
    pulse();time.sleep(.1);state=op.read(state_path);cid=op.command(d,state,'Begin','AUTOMATED DISPOSABLE FIXTURE; not human consent')
    reply=wait(d/'operator/replies'/(cid+'.json'));check('request accepted via actual bounded worker',op.read(reply)['Result']=='accepted start')
    before=reply.read_bytes();time.sleep(.1);check('lost-response reconciliation reads same receipt',reply.read_bytes()==before)
    end=time.monotonic()+3
    while time.monotonic()<end:pulse();time.sleep(.05)
    state=op.read(state_path);check('actual worker advanced typed setup without F keys',state['Stage']!='Dormant')
    late=d/'late-feedback.txt';late.write_text('AUTOMATED stale feedback fixture')
    # A foreign phase command travels through the same real parser and queue.
    bad=dict(Session=session,Id=uuid.uuid4().hex,Phase='other',Generation=state['Generation'],Operation='Review',Profile=state['Profile'],Decision='Normal',Text='AUTOMATED stale phase fixture',Observation='stale',ExpiresTicks=op.qpc()+5*op.frequency(),CaptureReviewed=False,ContextReviewed=False,EvidenceSha256=None)
    op.atomic(d/'operator/commands'/('cmd-'+bad['Id']+'.json'),bad,True);r=wait(d/'operator/replies'/(bad['Id']+'.json'));check('stale phase rejected in external process',op.read(r)['Result'].startswith('rejected'))
    state=op.read(state_path);pulse();stop=op.command(d,state,'Stop','AUTOMATED normal cleanup fixture');wait(d/'operator/replies'/(stop+'.json'))
    end=time.monotonic()+5
    while child.poll() is None and time.monotonic()<end:pulse();time.sleep(.05)
    check('disposable bridge normal exit',child.wait(2)==0);state=op.read(state_path);check('automatic exact-pair retirement through real bridge',state['Finished'] and state['Retired'])
    check('OS identity observes normal process closure',not identity.alive());identity.close()
    check('no native assignment during setup/stop fixture','native-dispatch' not in (d/'operator/journal.log').read_text())
    # Positive conversational feedback traverses the actual client, receipt
    # binding, parser/queue, durable journal and checked controller in a process.
    d=root/'review-bridge';d.mkdir();child=subprocess.Popen([bridge_binary,str(d)],creationflags=flags,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE);children.append(child)
    state_path=wait(d/'operator/state.json');state=op.read(state_path);session=state['Session'];seq=0;pulse();time.sleep(.1);state=op.read(state_path)
    cid=op.command(d,state,'Begin','AUTOMATED conversational integration fixture; no live approval');wait(d/'operator/replies'/(cid+'.json'))
    end=time.monotonic()+45
    while time.monotonic()<end:
        pulse();state=op.read(state_path)
        if state['AwaitingReview']:break
        time.sleep(.05)
    check('external path reaches original B observation',state['AwaitingReview'] and state['Phase']=='B-pre')
    plan=dict(Root=str(d),SourceCommit='AUTOMATED-DISPOSABLE-FIXTURE');plan_path=d/'operator-plan.json';op.atomic(plan_path,plan,True)
    scope=dict(candidateName='candidate-07',sourceCommit=plan['SourceCommit'],operator=dict(plan=dict(sha256=op.sha(plan_path))));op.atomic(d/'scope.json',scope,True)
    op.atomic(d/'transaction.json',dict(status='installed-verified',scopeSha256=op.sha(d/'scope.json')),True);op.atomic(d/'approval.json',dict(scopeSha256=op.sha(d/'scope.json'),label='AUTOMATED FIXTURE; NOT HUMAN CONSENT'),True)
    observation=state['Observation'];receipt=d/'analysis/fixture-receipt.json';op.atomic(receipt,dict(Passed=True,kind='AUTHORED NO-LIVE-CAPTURE FIXTURE'),True)
    evidence={k:state[k] for k in ['Session','Observation','Phase','Generation','Recording','Profile']};evidence.update(Passed=True,Receipt=str(receipt),ReceiptSha256=op.sha(receipt));op.atomic(d/'operator/evidence'/(observation+'.json'),evidence,True)
    text=d/'ordinary-answer.txt';text.write_text('AUTOMATED listening fixture: B sounds normal. No human hearing or live consent asserted.')
    pulse();op.review(plan_path,observation,'ControlNormal',text,True)
    forwarded=op.read(next((d/'listening').glob('*-forwarded.json')));reply=wait(d/'operator/replies'/(forwarded['CommandId']+'.json'))
    check('ordinary answer accepted by actual review bridge',op.read(reply)['Result']=='accepted reviewed decision')
    end=time.monotonic()+5
    while time.monotonic()<end:
        pulse();state=op.read(state_path)
        if state['Phase']=='baseline':break
        time.sleep(.05)
    check('review advances mechanical setup without arming early',state['Phase']=='baseline' and 'armed phase=' not in (d/'operator/journal.log').read_text())
    pulse();state=op.read(state_path);cid=op.command(d,state,'Stop','AUTOMATED integration cleanup');wait(d/'operator/replies'/(cid+'.json'))
    end=time.monotonic()+5
    while child.poll() is None and time.monotonic()<end:pulse();time.sleep(.05)
    check('review integration process retires and exits normally',child.wait(2)==0 and op.read(state_path)['Retired'])
    (root/'result.json').write_text(json.dumps(dict(schema='NativeSuppression07ExternalProcessTests',passed=True,tests=tests,bridgeBinarySha256=op.sha(bridge_binary),operatorSha256=op.sha(HERE/'Operator07.py'),processes='Actual disposable bridge and Lua frontend fixtures; no GTA/OBS',gameLaunched=False,obsLaunched=False,liveQualified=False),indent=2))

if __name__=='__main__':run(*sys.argv[1:])
