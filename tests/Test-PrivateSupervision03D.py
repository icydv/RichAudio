"""Focused regression on metadata and owned disposable processes only."""
from pathlib import Path
import copy,importlib.util,json,os,subprocess,sys,time
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];S=R/'tools/native-control/private-profile03d';P=R/'.local/gate-a-shvdne-private-03d'
sys.path.insert(0,str(S))
import Build
spec=importlib.util.spec_from_file_location('watch03d',S/'Watch-AuthorizedGame.py');watch=importlib.util.module_from_spec(spec);spec.loader.exec_module(watch)
run=sys.argv[1];T=P/('tests-'+run);T.mkdir();cases=[]
receipt=Build.build(P/('build-'+run));binary=Path(receipt['binary'])
def check(name,value):
    assert value,name
    cases.append(name);print('PASS '+name,flush=True)
def wait_for(predicate,seconds=4):
    until=time.monotonic()+seconds
    while not predicate():
        if time.monotonic()>until:raise TimeoutError('fixture condition')
        time.sleep(.01)
def write(p,v):
    with p.open('x') as f:json.dump(v,f)
def target():return subprocess.Popen([sys.executable,'-B','-c','import sys;sys.stdin.readline()'],stdin=subprocess.PIPE,text=True)
def close(p):
    if p.poll() is None:p.stdin.write('normal exit\n');p.stdin.flush()
    assert p.wait(timeout=4)==0
def identity(pid):return json.loads(subprocess.check_output([str(binary),'--identity',str(pid)],text=True))
def config(child,scope):
    i=identity(child.pid)
    return dict(Schema=1,Session=os.urandom(16).hex(),Mode='offline-fixture',ProcessId=child.pid,ProcessStartUtcTicks=i['CreationUtcTicks'],Executable=i['Executable'],ExecutableSha256=i['Sha256'],ExpectedIdentity=i,EvidenceRoot=str(scope/'evidence'),ShowUi=False,MaximumLifetimeMs=5000,ExitLeadMs=1000,ExitGraceMs=1000,HeartbeatTimeoutMs=250,StartupTimeoutMs=1000,AcknowledgeTimeoutMs=100,Restoration=[dict(Path=str(scope/'absent'),Absent=True)])

# Missing/malformed outputs are explicit failures, never empty JSON decoding.
for text in ['', '  ', '{', '[]']:
    try:watch.response(text,dict)
    except (ValueError,json.JSONDecodeError):check('response-refusal-'+repr(text),True)
    else:raise AssertionError(text)

for field in ['ProcessId','CreationFileTime','CreationUtcTicks','Executable','CanonicalPath','FileIdentity','Sha256']:
    scope=T/field;scope.mkdir();child=target()
    try:
        c=config(child,scope);expected=c['ExpectedIdentity']
        expected[field]=expected[field]+1 if isinstance(expected[field],int) else expected[field]+'-wrong'
        path=scope/'config.json';write(path,c)
        with (scope/'out').open('x') as out,(scope/'err').open('x') as err:
            monitor=subprocess.Popen([str(binary),'--monitor',str(path)],stdin=subprocess.PIPE,stdout=out,stderr=err,text=True)
            comparison=Path(c['EvidenceRoot'])/'runs'/c['Session']/'identity-comparison.json'
            wait_for(comparison.exists)
            wait_for(lambda:bool(list(Path(c['EvidenceRoot']).glob('rejection-*.json'))))
            row=json.loads(comparison.read_text())
            check('strict-field-'+field,field in row['failedFields'] and row['observed']['ProcessId']==child.pid)
            check('no-binding-'+field,not (comparison.parent/'ready.json').exists() and child.poll() is None)
            close(child);check('rejected-monitor-normal-close-'+field,monitor.wait(timeout=4)==3)
            check('original-stderr-'+field,'exact monitored process differs' in (scope/'err').read_text())
    finally:close(child)

# Actual replacement between discovery and attachment: new lifetime is refused.
scope=T/'replacement';scope.mkdir();first=target();old=config(first,scope);close(first);second=target()
try:
    c=copy.deepcopy(old);c['ProcessId']=second.pid
    path=scope/'config.json';write(path,c)
    monitor=subprocess.Popen([str(binary),'--monitor',str(path)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
    wait_for(lambda:bool(list(Path(c['EvidenceRoot']).glob('rejection-*.json'))))
    row=json.loads((Path(c['EvidenceRoot'])/'runs'/c['Session']/'identity-comparison.json').read_text())
    check('replacement-not-admitted',{'ProcessId','CreationFileTime','CreationUtcTicks'}.issubset(row['failedFields']))
    close(second);check('replacement-normal-exit',monitor.wait(timeout=4)==3)
finally:close(second)

# Old policy/protocol scenarios run against the replacement, including actual
# guard loss, single activation, heartbeat, process exit and disk restoration.
original=(R/'tools/native-control/private-profile/SupervisorTests.cs').read_text()
original=original.replace('p.Acknowledge()','p.Acknowledge(1000)').replace('p.UserNormalExit()','p.UserNormalExit(1850)')
original=original.replace('if(mode=="wrong-identity")c.ProcessStartUtcTicks++;','c.ExpectedIdentity=ExactIdentity.Capture(childId);if(mode=="wrong-identity"){c.ProcessStartUtcTicks++;c.ExpectedIdentity.CreationUtcTicks++;}')
original=original.replace('if(mode=="wrong-identity"){Check(watcher.WaitForExit','if(mode=="wrong-identity"){File.WriteAllText(release,"fixture normal exit after rejected attachment");Check(watcher.WaitForExit')
original=original.replace('Check(!child.HasExited,"identity rejection does not terminate target");','Check(child.ExitCode==0,"identity rejection preserves normal target exit");')
original=original.replace(' static void PolicyTests(){',' static void PolicyTests(){var late=Policy();late.RequestStop(1010,"fixture");late.UserNormalExit(1061);Check(late.NotificationOverdue,"late acknowledgment cannot erase missed deadline");')
source=T/'InheritedSupervisorTests.cs';source.write_text(original)
compiler=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe';harness=T/'Disposable03D.exe'
files=[S/'SupervisorPolicy03D.cs',R/'tools/native-control/private-profile/SupervisorProtocol.cs',S/'ExactIdentity.cs',S/'FailureNotice.cs',S/'SupervisorMonitor03D.cs',source]
cmd=[str(compiler),'/nologo','/optimize+','/warnaserror+','/langversion:5','/platform:x64','/target:exe','/define:SUPERVISION_FIXTURES','/r:System.Web.Extensions.dll','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/main:SupervisorTests','/out:'+str(harness),*map(str,files)]
subprocess.run(cmd,check=True)
fixtures=T/'inherited';fixtures.mkdir()
result=subprocess.run([str(harness),str(fixtures),str(binary)],capture_output=True,text=True,timeout=40)
write(T/'inherited-output.json',dict(exitCode=result.returncode,stdout=result.stdout,stderr=result.stderr))
check('inherited-real-process-policy-protocol',result.returncode==0)
write(T/'result.json',dict(passed=True,checks=cases,binary=receipt,scope='offline owned disposable processes; no GTA/OBS/audio'))
print('PASS',len(cases),'03D checks plus inherited checks')
