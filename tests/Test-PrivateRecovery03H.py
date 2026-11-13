"""No UI or game: actual native transport and disposable normal cleanup."""
from pathlib import Path
import sys,json,os,threading,uuid
from unittest.mock import patch
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'tools/native-control/private-profile03h'))
from Shared import tc,Context,configure,PACKAGE
from MetadataQuery import query,response
from NoticeFixture import run
c=tc.load(tc.sha(PACKAGE/'toolchain-manifest.json'));admission=configure(c,True);T=PACKAGE/'fixtures'/('recovery-'+uuid.uuid4().hex);T.mkdir(parents=True);checks=[]
def check(name,value):assert value,name;checks.append(name)
def refuse(name,stdout,stderr=b'',code=0,args=None):
    try:response(stdout,stderr,code,args or ('--identity',str(os.getpid())))
    except (AssertionError,ValueError,UnicodeError,TypeError,KeyError):check(name,True)
    else:raise AssertionError('Accepted '+name)
binary=c['programs']['supervisor']['path'];reference=json.loads(Context.processes.check_output([binary,'--identity',str(os.getpid())],stdin=Context.processes.DEVNULL,text=True,timeout=3))
for threaded in [False,True]:
    for repeat in range(2):
        observed=[];worker=threading.Thread(target=lambda:observed.append(query(binary,'--identity',os.getpid())))
        if threaded:worker.start();worker.join(5);assert not worker.is_alive()
        else:observed.append(query(binary,'--identity',os.getpid()))
        check('actual-complete-identity-'+str(threaded)+'-'+str(repeat),observed==[reference])
for name,data in [('empty',b''),('whitespace',b' \n'),('malformed',b'{'),('null',b'null'),('list',b'[]'),('incomplete',b'{}'),('encoding',b'\xff')]:refuse(name,data)
for key,bad in [('ProcessId',os.getpid()+1),('CreationFileTime',0),('CreationUtcTicks',1),('CanonicalPath','C:\\wrong.exe'),('Sha256','0'),('FileIdentity','wrong')]:
    value=dict(reference,**{key:bad});refuse('wrong-'+key,json.dumps(value).encode())
refuse('unexpected-stderr',json.dumps(reference).encode(),b'provider warning')
refuse('provider-nonzero',json.dumps(reference).encode(),code=3)
check('discover-only-expected-shape',response(b'[]',b'',0,('--discover',))==[])
refuse('discovery-wrong-process',b'[{"ProcessId":1,"Name":"other.exe"}]',args=('--discover',))
from Shared import load
adapter=load('actual_watch_adapter_h',R/'tools/native-control/private-profile03h/Watch-AuthorizedGame.py')
check('production-watch-uses-qualified-query',adapter.original.watcher.query is query)
before=set((PACKAGE/'metadata-queries').glob('*'))
with patch('MetadataQuery.response',side_effect=AssertionError('Authored empty raw-result refusal')):
    try:query(binary,'--identity',os.getpid())
    except AssertionError:pass
    else:raise AssertionError('Refusal swallowed')
created=set((PACKAGE/'metadata-queries').glob('*'))-before;check('one-query-no-retry',len(created)==1)
failed=tc.read(next(iter(created))/'receipt.json');check('failure-raw-files-retained',not failed['accepted'] and failed['normalQueryClosure'] and failed['retries']==0 and Path(failed['stdout']['path']).exists())
class TimedOutQuery:
    pid=999999
    def wait(self,timeout):raise Context.processes.TimeoutExpired('authored query timeout',timeout)
    def poll(self):return None
before=set((PACKAGE/'metadata-queries').glob('*'))
with patch.object(Context.processes,'Popen',return_value=TimedOutQuery()) as start:
    try:query(binary,'--identity',os.getpid())
    except Context.processes.TimeoutExpired:pass
    else:raise AssertionError('Timeout admitted')
    check('timeout-not-retried',start.call_count==1)
timed=tc.read(next(iter(set((PACKAGE/'metadata-queries').glob('*'))-before))/'receipt.json')
check('timeout-preserves-unproven-closure',not timed['accepted'] and not timed['normalQueryClosure'] and not timed['forcedTerminationIssued'] and timed['queryPid']==999999)
for mode,fault,synthetic,max_wait in [('normal',None,True,8),('stop-only',None,True,8),('normal','empty-query',False,4),('normal','coordinator-timeout',False,4),('normal',None,False,1)]:
    value=run(mode,False,synthetic,fault,.15,max_wait)
    check('normal-target-closure-'+mode+'-'+str(fault)+'-'+str(synthetic),value['normalTargetClosure'])
    check('normal-monitor-closure-'+mode+'-'+str(fault)+'-'+str(synthetic),value['normalMonitorClosure'])
    check('correct-result-'+mode+'-'+str(fault)+'-'+str(synthetic),value['passed']==(fault is None and synthetic))
    check('no-human-claim-'+mode+'-'+str(fault)+'-'+str(synthetic),not value['actualDirectUserGateQualified'] and not value['forcedTerminationIssued'])
policy=dict(parent=admission.PARENT,head='f'*40,preparation='GATE-A-SHVDNE-PRIVATE-03H',changedSources=['qualified.py']);tc.save(T/'provenance-policy.json',policy)
def git(*args):return {'branch':'feature/migration-shvdne-01','rev-parse':'f'*40,'rev-list':'f'*40+' '+admission.PARENT,'status':'','diff-tree':'qualified.py'}[args[0]]
with patch.object(admission,'PACKAGE',T),patch.object(admission,'git',git):
    check('exact-new-parent-and-head',admission.provenance()==policy)
    for key,bad in [('branch','main'),('rev-parse','e'*40),('rev-list','f'*40+' '+'e'*40),('status',' M qualified.py'),('diff-tree','unexpected.py')]:
        with patch.object(admission,'git',lambda *args,k=key,v=bad:v if args[0]==k else git(*args)):
            try:admission.provenance()
            except AssertionError:check('refuse-provenance-'+key,True)
            else:raise AssertionError('Accepted provenance drift')
for args in [['notice-rehearsal','--manifest-sha256','0'*64],['notice-rehearsal','--qualification-manifest-sha256','0'*64],['install','--manifest-sha256','0'*64]]:
    refused=Context.processes.run([str(PACKAGE/'Private03H.Toolchain.exe'),*args],stdin=Context.processes.DEVNULL,capture_output=True,text=True,timeout=3)
    check('native-entry-refuses-'+args[0]+'-'+args[1],refused.returncode==3 and not (PACKAGE/'live-01').exists() and not (PACKAGE/'execution-01').exists())
tc.save(T/'result.json',dict(passed=True,count=len(checks),checks=checks,originalEmptyResponseReproduced=False,actualUserHandoffQualified=False,gameLaunched=False,obsLaunched=False))
print(json.dumps(dict(passed=True,checks=len(checks),receipt=str(T/'result.json'))))
