from pathlib import Path
import sys,json,uuid,copy
from unittest.mock import patch
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'tools/native-control/private-profile03g'));sys.dont_write_bytecode=True
from Shared import tc,PACKAGE,Context,configure
c=tc.load(tc.sha(PACKAGE/'toolchain-manifest.json'));a=configure(c,True);T=PACKAGE/'fixtures'/('worker-closure-'+uuid.uuid4().hex);T.mkdir();(T/'execution-01').mkdir();(T/'runtime-leases').mkdir();checks=[]
def check(name,value):assert value,name;checks.append(name)
def refuse(name,action):
    try:action()
    except (AssertionError,OSError):check(name,True)
    else:raise AssertionError('Accepted '+name)
tc.save(T/'execution-manifest.json',dict(authored=True));nonce=uuid.uuid4().hex;session=uuid.uuid4().hex
child=Context.processes.Popen(['python','-c','import sys;sys.stdin.readline()'],stdin=Context.processes.PIPE,text=True)
try:
    identity=json.loads(Context.processes.check_output([c['programs']['supervisor']['path'],'--identity',str(child.pid)],text=True))
    intent=dict(session=session,manifestSha256=tc.sha(T/'execution-manifest.json'),nonce=nonce,pid=child.pid,creationFileTime=identity['CreationFileTime'],oneUse=True)
    tc.save(T/'execution-01/evidence-worker-intent.json',intent);tc.save(T/'runtime-leases'/(nonce+'.json'),dict(intent));closed=T/'runtime-leases'/(nonce+'.json.closed.json')
    with patch.object(a,'PACKAGE',T):
        refuse('missing-normal-closure-proof',a.evidence_worker_closed)
        tc.save(closed,dict(normalChildClosure=True,exitCode=0));refuse('active-exact-worker-lifetime-refused',a.evidence_worker_closed)
        child.stdin.write('normal fixture exit\n');child.stdin.flush();assert child.wait(timeout=4)==0
        check('normal-owned-worker-closure-admitted',a.evidence_worker_closed())
        closed.write_text(json.dumps(dict(normalChildClosure=False,exitCode=-1073741819)));refuse('crashed-or-unproven-child-closure-refused',a.evidence_worker_closed)
        closed.write_text(json.dumps(dict(normalChildClosure=True,exitCode=0)));tc.save(T/'execution-01/pending-detector-closure.json',dict(pid=1));refuse('pending-detector-closure-refused',a.evidence_worker_closed)
finally:
    if child.poll() is None:child.stdin.write('normal cleanup\n');child.stdin.flush();child.wait(timeout=4)
# A normal-mode rehearsal is never a substitute for evidence-session admission.
result=Context.processes.run([str(PACKAGE/'Private03G.Toolchain.exe'),'rehearse','--manifest-sha256','0'*64],capture_output=True,text=True)
check('rehearsal-mode-cannot-substitute-for-live',result.returncode==3 and 'isolated qualification mode' in result.stderr)
tc.save(T/'result.json',dict(passed=True,count=len(checks),checks=checks,ownedTargetOnly=True))
print('PASS',len(checks),'worker/recovery lifecycle checks')
