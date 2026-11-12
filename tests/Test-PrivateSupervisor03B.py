"""Authored metadata cases for the exact-supervisor restoration exception; no process launch."""
from pathlib import Path
import sys,importlib.util,copy,json
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];P=R/'.local/gate-a-shvdne-private-03b'
spec=importlib.util.spec_from_file_location('manager03b',R/'tools/native-control/private-profile03b/Manage-Installation.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
plan=m.read(P/'deployment-plan.json');expected=plan['supervisor'];session=plan['session']
row=dict(Name='RichAudio.Private01.Supervisor.exe',ProcessId=999,CreationUtcTicks=123456789,ExecutablePath=expected['binary'])
bound=dict(pid=999,creationUtcTicks=123456789,executable=expected['binary'],sha256=expected['sha256'],session=session)
cases=[]
def allow(name,rows,b):
    assert m.admit_retirement_processes(rows,b,expected['binary'],expected['sha256'],session);cases.append(name)
def deny(name,rows,b):
    try:m.admit_retirement_processes(rows,b,expected['binary'],expected['sha256'],session)
    except (AssertionError,KeyError,TypeError):cases.append(name)
    else:raise AssertionError('Unexpected acceptance: '+name)
allow('no-relevant-process-is-clear',[],None)
allow('only-exact-current-session-supervisor-allowed-after-game-OBS-absence',[row],bound)
for key,bad in [('ProcessId',1000),('CreationUtcTicks',123456790),('ExecutablePath',str(P/'wrong-supervisor.exe'))]:
    x=copy.deepcopy(row);x[key]=bad;deny('wrong-supervisor-'+key,[x],bound)
for key,bad in [('session','f'*32),('sha256','0'*64),('executable',str(P/'wrong.exe'))]:
    x=copy.deepcopy(bound);x[key]=bad;deny('wrong-binding-'+key,[row],x)
deny('missing-current-session-binding',[row],None)
deny('two-supervisors-refused',[row,row],bound)
for name in ['GTA5_Enhanced.exe','GTA5_Enhanced_BE.exe','RAGEPluginHook.exe','obs64.exe','RichAudio.GameplayHost.exe','RichAudio.Unapproved.exe']:
    x=copy.deepcopy(row);x['Name']=name
    deny('still-present-'+name,[x],bound)
    deny('exact-supervisor-does-not-excuse-'+name,[row,x],bound)
manager=m.Installation();original=m.old.inactive
called=[]
def authored_guard():called.append('scoped')
manager.retirement_inactive=authored_guard
manager.retirement_scope(lambda:m.old.inactive())
assert called==['scoped'] and m.old.inactive is original;cases.append('scope-restores-strict-preflight-install-guard')
try:manager.retirement_scope(lambda:(_ for _ in ()).throw(RuntimeError('AUTHORED')))
except RuntimeError:pass
assert m.old.inactive is original;cases.append('exception-restores-strict-preflight-install-guard')
assert m.Installation(P/'installer-fixtures/actual-root-01').verify();cases.append('new-scoped-verify-validates-the-restored-full-shadow-fixture')
with (P/'supervisor-retirement-fixtures.json').open('x',encoding='utf-8') as f:
    json.dump(dict(passed=True,count=len(cases),cases=cases,scope='Authored process metadata and scoped guard, actual retained supervisor binary hash; no process launch, no GTA/OBS writes',supervisorSha256=expected['sha256']),f,indent=2)
print('PASS '+str(len(cases))+' supervisor-retirement metadata cases')
