"""Exact provenance, watcher readiness and recovery admission regressions."""
from pathlib import Path
import copy,importlib.util,json,os,subprocess,sys,threading,time
from unittest.mock import patch
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];S=R/'tools/native-control/private-profile03d';P=R/'.local/gate-a-shvdne-private-03d'
sys.path.insert(0,str(S));import Package
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
w=load('watchadmit03d',S/'Watch-AuthorizedGame.py');m=load('manageadmit03d',S/'Manage-Installation.py')
T=P/('admission-tests-'+sys.argv[1]);T.mkdir();binary=Path(sys.argv[2]).resolve();cases=[]
def check(name,value):assert value,name;cases.append(name);print('PASS '+name,flush=True)
def refuse(name,action):
    try:action()
    except (AssertionError,FileNotFoundError,ValueError):check(name,True)
    else:raise AssertionError('Accepted '+name)
def save(p,v):
    with p.open('w') as f:json.dump(v,f)
def until(test):
    end=time.monotonic()+5
    while not test():
        assert time.monotonic()<end,'fixture timeout';time.sleep(.01)

check('actual-game-name-selection',w.select_game([dict(Name='GTA5_Enhanced.exe',ProcessId=123)])==123)
for label,rows in [('steam-launcher',[dict(Name='steam.exe',ProcessId=123)]),('rph',[dict(Name='RAGEPluginHook.exe',ProcessId=123)]),('duplicate-games',[dict(Name='GTA5_Enhanced.exe',ProcessId=123)]*2),('missing-game',[])]:
    refuse('discovery-refuses-'+label,lambda:w.select_game(rows))

scope=T/'provenance';scope.mkdir();head='a'*40
policy=dict(parent=Package.PARENT,head=head,experiment='GATE-A-SHVDNE-PRIVATE-03D',changedSources=['authored-fixture.py'])
save(scope/'provenance-policy.json',policy)
def git(*args):
    if args[:2]==('branch','--show-current'):return 'feature/migration-shvdne-01'
    if args[:2]==('rev-parse','HEAD'):return head
    if args[0]=='rev-list':return head+' '+Package.PARENT
    if args[0]=='status':return ''
    if args[0]=='diff-tree':return 'authored-fixture.py'
    raise AssertionError(args)
with patch.object(Package,'PACKAGE',scope),patch.object(Package,'git',git):
    check('exact-committed-transition',Package.provenance()==policy)
    for label,args,bad in [('extra-commit',('rev-parse','HEAD'),'b'*40),('dirty-tree',('status','--porcelain=v1','--untracked-files=all'),' M fixture.py'),('wrong-branch',('branch','--show-current'),'main'),('unexpected-ancestry',('rev-list','--parents','-n','1',head),head+' '+'b'*40),('unexpected-commit-scope',('diff-tree','--no-commit-id','--name-only','-r',head),'changed-production.cs')]:
        with patch.object(Package,'git',lambda *a,key=args,value=bad:value if a==key else git(*a)):
            refuse(label,Package.provenance)
    for label in ['runtime-source','probe-binary','supervisor-binary','audio-resource','dependency']:
        f=scope/(label+'.fixture');f.write_bytes(b'authored baseline')
        manifest=dict(experiment='GATE-A-SHVDNE-PRIVATE-03D',revision='admission-01',head=head,session='e'*32,bindings=[dict(path=str(f),bytes=f.stat().st_size,sha256=Package.sha(f))])
        save(scope/'execution-manifest.json',manifest);save(scope/'deployment-plan.json',dict(session='e'*32));digest=Package.sha(scope/'execution-manifest.json')
        check('binding-valid-'+label,Package.verify(digest)==manifest)
        f.write_bytes(b'authored mutation');refuse('binding-rejects-'+label,lambda:Package.verify(digest))
        f.unlink();refuse('binding-missing-'+label,lambda:Package.verify(digest))
        refuse('stale-manifest-'+label,lambda:Package.verify('0'*64))

scope=T/'actual-readiness';scope.mkdir();child=subprocess.Popen([sys.executable,'-B','-c','import sys;sys.stdin.readline()'],stdin=subprocess.PIPE,text=True)
i=w.query(binary,'--identity',child.pid);session=os.urandom(16).hex()
c=dict(Schema=1,Session=session,Mode='offline-fixture',ProcessId=child.pid,ProcessStartUtcTicks=i['CreationUtcTicks'],Executable=i['Executable'],ExecutableSha256=i['Sha256'],ExpectedIdentity=i,EvidenceRoot=str(scope/'evidence'),ShowUi=False,MaximumLifetimeMs=8000,ExitLeadMs=1000,ExitGraceMs=1000,HeartbeatTimeoutMs=250,StartupTimeoutMs=3000,AcknowledgeTimeoutMs=1000,Restoration=[dict(Path=str(scope/'absent'),Absent=True)])
config=scope/'supervisor-configuration.json';save(config,c);save(scope/'installation.json',dict(passed=True));returned=[]
worker=threading.Thread(target=lambda:returned.append(w.supervise(binary,config,scope)));worker.start()
try:
    until(lambda:(scope/'watcher-ready.json').exists())
    check('actual-watcher-readiness',True)
    manager=m.Installation.__new__(m.Installation);manager.e=scope;manager.plan=dict(session=session,supervisor=dict(binary=str(binary),sha256=Package.sha(binary)))
    bound=Package.read(scope/'supervisor-process.json');original_check=subprocess.check_output
    def output(args,**kw):
        if args[0]=='powershell.exe':return json.dumps([dict(Name='RichAudio.Private03D.Supervisor.exe',ProcessId=bound['pid'])])
        return original_check(args,**kw)
    with patch.object(subprocess,'check_output',output):
        check('exact-native-recovery-monitor',manager.retirement_inactive())
        for field in ['pid','creationUtcTicks','creationFileTime','session','executable','canonicalPath','fileIdentity','sha256']:
            altered=copy.deepcopy(bound);altered[field]=altered[field]+1 if isinstance(altered[field],int) else altered[field]+'wrong';save(scope/'supervisor-process.json',altered)
            refuse('recovery-refuses-'+field,manager.retirement_inactive)
        save(scope/'supervisor-process.json',bound)
    commands=scope/'monitor-commands.jsonl'
    commands.write_text(json.dumps(dict(command='normal-exit-requested'))+'\n')
    time.sleep(.1);child.stdin.write('normal exit\n');child.stdin.flush();child.wait(timeout=4);time.sleep(.1)
    with commands.open('a') as f:f.write(json.dumps(dict(command='verify-restoration'))+'\n')
    worker.join(5);check('actual-watcher-normal-result',not worker.is_alive() and returned==[True])
    # A stale/reused session creates no new ready binding, even after normal closure.
    result=subprocess.run([str(binary),'--monitor',str(config)],capture_output=True,text=True,timeout=4)
    check('reused-session-rejected',result.returncode==3 and 'session evidence already exists' in result.stderr)
finally:
    if child.poll() is None:child.stdin.write('normal cleanup\n');child.stdin.flush();child.wait(timeout=4)
    if worker.is_alive():
        with (scope/'monitor-commands.jsonl').open('a') as f:f.write(json.dumps(dict(command='verify-restoration'))+'\n')
        worker.join(5)
save(T/'result.json',dict(passed=True,checks=cases))
print('PASS',len(cases),'provenance/readiness/recovery checks')
