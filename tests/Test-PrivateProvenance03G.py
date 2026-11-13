from pathlib import Path
import sys,json,uuid,copy
from unittest.mock import patch
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'tools/native-control/private-profile03g'));sys.dont_write_bytecode=True
from Shared import tc,PACKAGE,configure,Context
c=tc.load(tc.sha(PACKAGE/'toolchain-manifest.json'));a=configure(c,True);T=PACKAGE/'fixtures'/('provenance-'+uuid.uuid4().hex);T.mkdir();head='a'*40;checks=[]
def save(name,value):(T/name).write_text(json.dumps(value))
def check(name,value):assert value,name;checks.append(name)
def refuse(name,action):
    try:action()
    except (AssertionError,OSError,KeyError,ValueError):check(name,True)
    else:raise AssertionError('Accepted '+name)
policy=dict(parent=a.PARENT,head=head,preparation='GATE-A-SHVDNE-PRIVATE-03G',changedSources=['qualified.py']);save('provenance-policy.json',policy)
def git(*args):return dict(branch='feature/migration-shvdne-01',**{'rev-parse':head,'rev-list':head+' '+a.PARENT,'status':'','diff-tree':'qualified.py'})[args[0]]
with patch.object(a,'PACKAGE',T),patch.object(a,'git',git):
    check('exact-final-transition',a.provenance()==policy)
    for name,key,bad in [('extra-commit','rev-parse','b'*40),('dirty-worktree','status',' M qualified.py'),('wrong-branch','branch','main'),('wrong-ancestry','rev-list',head+' '+'b'*40),('unexpected-scope','diff-tree','production-engine.cs')]:
        with patch.object(a,'git',lambda *args,k=key,v=bad:v if args[0]==k else git(*args)):refuse(name,a.provenance)
    save('toolchain-manifest.json',dict(authored=True));save('deployment-plan.json',dict(session='e'*32))
    master=dict(preparation='GATE-A-SHVDNE-PRIVATE-03G',experiment='GATE-A-SHVDNE-PRIVATE-03D',revision='evidence-batch-01',head=head,session='e'*32,toolchainSha256=tc.sha(T/'toolchain-manifest.json'),probeSha256='fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0',supervisorSha256='b88ce28612e85e9362c7279e647d51b10cf23b43c4d663ea4061811728d13020')
    # This unit isolates metadata/provenance. Immutable byte validation and the
    # authenticated parent are exercised with the actual native CLI elsewhere.
    with patch.object(a,'parent_lease',lambda digest,m:True):
        for key,value in [('head','b'*40),('session','b'*32),('toolchainSha256','0'*64),('probeSha256','0'*64),('supervisorSha256','0'*64)]:
            changed=dict(master,**{key:value});save('execution-manifest.json',changed);refuse('reject-'+key,lambda:a.verify(tc.sha(T/'execution-manifest.json')))
        save('execution-manifest.json',master);check('exact-metadata',a.verify(tc.sha(T/'execution-manifest.json'))==master)
        for digest in ['3189c49f63f6f817626cdef10cca844392c9ecc17cb3fe109ecc767099e65263','0face551c0a95febdefca2c3babaa9d31002e3b946b1ff7ef3dc4a52644a956d']:refuse('historical-approval-'+digest[:8],lambda:a.verify(digest))
with patch.object(Context.processes,'check_output',return_value='bounded\n') as observed:
    check('bounded-git-result',a.git('branch','--show-current')=='bounded')
    check('bounded-git-call',observed.call_args.kwargs['timeout']==2 and observed.call_args.kwargs['stderr']==Context.processes.PIPE and observed.call_args.kwargs['stdin']==Context.processes.DEVNULL)
with patch.object(Context.processes,'check_output',side_effect=Context.processes.TimeoutExpired('owned-git-fixture',2)):
    try:a.git('branch','--show-current')
    except Context.processes.TimeoutExpired:check('git-timeout-propagates-as-refusal',True)
    else:raise AssertionError('Stalled Git admitted')
# Reproduce inherited-input contention with an actual owned review reader and
# actual Git. The successful metadata command has no reason to inherit stdin.
program="""import sys,threading,subprocess,json
t=threading.Thread(target=lambda:sys.stdin.readline());t.start()
try:
 r=subprocess.run([sys.argv[1],'--no-replace-objects','branch','--show-current'],stdin=subprocess.DEVNULL if sys.argv[2]=='null' else None,capture_output=True,text=True,timeout=2)
 result=dict(timedOut=False,code=r.returncode,stdout=r.stdout)
except subprocess.TimeoutExpired:result=dict(timedOut=True)
print(json.dumps(result),flush=True);t.join(5)
"""
for mode in ['inherited','null']:
    child=Context.processes.Popen(['python','-c',program,Context.contract['programs']['git']['path'],mode],stdin=Context.processes.PIPE,stdout=Context.processes.PIPE,stderr=Context.processes.PIPE,text=True)
    row=json.loads(child.stdout.readline());child.stdin.write('normal fixture reader exit\n');child.stdin.flush();assert child.wait(timeout=7)==0,child.stderr.read()
    if mode=='null':check('real-git-with-review-reader-and-null-input',not row['timedOut'] and row['code']==0 and row['stdout'].strip()=='feature/migration-shvdne-01')
    else:check('real-inherited-input-contention-observed',row['timedOut'])
tc.save(T/'result.json',dict(passed=True,count=len(checks),checks=checks))
print('PASS',len(checks),'exact03G provenance/identity cases')
