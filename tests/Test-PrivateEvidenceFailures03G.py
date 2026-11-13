from pathlib import Path
import sys,queue,threading,time,json,uuid,shutil,copy,io
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent));sys.dont_write_bytecode=True
from PrivateEvidenceFixture03G import *
from PrivateMediaFixture03G import build
import BaselineReview as b
from DecodeWindows import Snapshot
setup();media=build();T=PACKAGE/'failure-regressions';T.mkdir(exist_ok=True);checks=[]
def check(name,value):assert value,name;checks.append(name);print('PASS '+name,flush=True)
def scenario(name,source='plain',alter=None,review_alter=None,late_flush=False,cancel_detector=False,checkpoint_failure=False,missing_probe=False,processing_expiry=False,review_delay=0):
    f=Fixture('failure-'+name);request=f.request(media/(source+'.mkv'));inputs=queue.Queue();transaction=None;observations=[]
    if alter:alter(f,request)
    def confirm():
        until(lambda:(Path(request['output'])/'candidate.json').exists() or (Path(request['output'])/'failure.json').exists(),6)
        path=Path(request['output'])/'candidate.json'
        if not path.exists():return
        row=dict(command='confirm-independent-review',candidateSha256=tc.sha(path),reviewer='SIMULATED_OFFLINE_REVIEW',notes='Regression fixture, no actual human confirmation',simulatedOfflineReview=True,**{k:True for k in b.REVIEW_FIELDS})
        if review_alter:review_alter(f,request,row,observations)
        time.sleep(review_delay);inputs.put(row)
        if missing_probe:inputs.put(dict(command='cancel'))
    worker=None
    try:
        calls=[]
        def checkpoint():
            calls.append(1)
            if len(calls)>=2:raise RuntimeError('Authored verified-parent loss')
        try:transaction=b.Transaction(request,True,inputs,checkpoint=checkpoint if checkpoint_failure else None)
        except Exception:check(name+'-constructor-refused',True);return
        worker=threading.Thread(target=confirm);worker.start()
        real=b.qpc
        ticks=[0]
        def clock():
            ticks[0]+=1
            if late_flush and (transaction.out/'acceptance.json').exists():return transaction.deadline
            return real()+(12*frequency() if processing_expiry and ticks[0]>10 else 0)
        actual_popen=Context.processes.Popen;children=[]
        def popen(args,**kw):
            child=actual_popen(args,**kw)
            if cancel_detector and any('MarkerBatch.mjs' in str(x) for x in args):children.append(child);inputs.put(dict(command='cancel'))
            return child
        with patch.object(b,'qpc',clock),patch.object(Context.processes,'Popen',popen):code=transaction.run()
        check(name+'-refused',code==3 and not b.acceptance_current(transaction.out,f.session,offline_fixture=True))
        check(name+'-no-assignment-permission',not tc.read(transaction.out/'failure.json')['assignmentPermission'])
        if observations:check(name+'-write-lease-refused',all(observations))
        if children:check(name+'-owned-detector-closed-normally',all(x.poll()==0 for x in children))
    finally:
        if worker:worker.join(7)
        f.close()

for name in ['full-A','full-B','fragment-A','video-gap','audio-gap']:scenario(name,source=name)
scenario('overlap',alter=lambda f,r:r['windows']['B'].update(start=4))
scenario('reused-identity',alter=lambda f,r:r['windows']['B'].update(vehicle='role=B model=bati/F9300CC5 handle=101 token=111'))
scenario('stale-source-hash',alter=lambda f,r:r['windows']['A'].update(expectedSource=dict(sha256='0'*64)))
scenario('expired-before-analysis',alter=lambda f,r:r.update(originQpc=qpc()-81*frequency()))
scenario('insufficient-remaining-margin',alter=lambda f,r:r.update(originQpc=qpc()-int(79.99*frequency())))
scenario('processing-budget-expiry',processing_expiry=True)
scenario('independent-review-budget-expiry',review_delay=21)
scenario('deadline-after-durable-flush',late_flush=True)
scenario('missing-review',review_alter=lambda f,r,row,o:row.update(command='cancel'))
scenario('wrong-review-digest',review_alter=lambda f,r,row,o:row.update(candidateSha256='0'*64))
scenario('known-contamination',review_alter=lambda f,r,row,o:row.update(noKnownContamination=False))
scenario('journal-changed',review_alter=lambda f,r,row,o:Path(r['probeJournal']).write_text('CHANGED JOURNAL\n'))
scenario('missing-probe-durable-ack',missing_probe=True)
scenario('cancel-during-detector',cancel_detector=True)
scenario('verified-parent-loss',checkpoint_failure=True)
def copied_control(f,r):
    p=f.scope/'copied-control.mkv';shutil.copyfile(media/'plain.mkv',p);r['windows']['B'].update(source=str(p),start=3)
scenario('copied-overlapping-control',alter=copied_control)
scenario('traversal-output',alter=lambda f,r:r.update(output=str(f.scope/'..'/'traversal-output')))
def changed_configuration(f,r):
    value=tc.read(f.config_path);value['MaximumLifetimeMs']+=1;p=f.scope/'changed-config.json';save(p,value);r['supervision']['configuration']=str(p)
scenario('changed-supervisor-configuration',alter=changed_configuration)
def wrong_supervisor(f,r):
    row=tc.read(f.scope/'supervisor-process.json');row['creationFileTime']+=1;p=f.scope/'wrong-process.json';save(p,row);r['supervision']['processBinding']=str(p)
scenario('incorrect-supervisor-lifetime',alter=wrong_supervisor)
def stopped(f,r):
    with (f.scope/'monitor-commands.jsonl').open('a') as file:file.write(json.dumps(dict(command='stop'))+'\n')
    time.sleep(.1)
scenario('supervisor-stop',alter=stopped)
def malformed(f,r):
    p=f.scope/'malformed.mkv';p.write_bytes(b'AUTHORED INVALID CONTAINER');r['windows']['A']['source']=str(p)
scenario('malformed-recording',alter=malformed)
def truncated(f,r):
    p=f.scope/'truncated.mkv';data=(media/'plain.mkv').read_bytes();p.write_bytes(data[:len(data)//4]);r['windows']['A']['source']=r['windows']['B']['source']=str(p)
scenario('truncated-recording',alter=truncated)
# A finalized recording cannot be changed while its lease is active; once the
# lease closes, a changed recording must fail its previous snapshot contract.
p=T/('lease-'+uuid.uuid4().hex+'.bin');p.write_bytes(b'authored immutable evidence');snap=Snapshot(p,T);old=dict(snap.description)
try:
    try:
        with p.open('r+b'):pass
    except PermissionError:check('changed-source-during-use-write-prevented',snap.unchanged())
    else:raise AssertionError('Writable source lease')
finally:snap.close()
p.write_bytes(b'changed after closure')
try:Snapshot(p,T,old)
except AssertionError:check('changed-source-before-use-rejected',True)
else:raise AssertionError('Stale evidence reused')
import AdmissionG as admission
with patch.dict('os.environ',{},clear=True):
    try:admission.parent_lease('0'*64,dict())
    except AssertionError:check('missing-authenticated-parent-rejected',True)
    else:raise AssertionError('Missing native parent accepted')
check('real-game-attempt-directory-absent',not (PACKAGE/'execution-01').exists())
save(T/('result-'+uuid.uuid4().hex+'.json'),dict(passed=True,count=len(checks),checks=checks,actualOwnedSupervision=True,gameLaunched=False))
print('PASS',len(checks),'evidence failure/point-of-use regressions')
