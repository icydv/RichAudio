"""Actual unsigned fixture and watcher-owner exit; no game/system mutation."""
from pathlib import Path
import sys,json,subprocess,time,ctypes,msvcrt,os
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];S=R/'tools/native-control/private-profile03e';sys.path.insert(0,str(S))
import WindowsBaseline as w
P=w.PACKAGE;T=P/('tests-failure-'+sys.argv[1]);T.mkdir();checks=[]
def check(name,value):assert value,name;checks.append(name);print('PASS '+name,flush=True)
def until(predicate):
    end=time.monotonic()+5
    while not predicate():
        assert time.monotonic()<end,'fixture timeout';time.sleep(.01)
unsigned=T/'authored-unsigned.dll';unsigned.write_bytes(b'AUTHORED NONEXECUTABLE TEST FIXTURE\n')
w.save(T/'paths.json',[str(unsigned)])
subprocess.run(['pwsh','-NoProfile','-File',str(S/'Inspect-Windows.ps1'),'-PathsFile',str(T/'paths.json'),'-Output',str(T/'unsigned-signature.json')],check=True)
row=w.read(T/'unsigned-signature.json')[0]
check('real-unsigned-fixture-not-valid',row['signature']['status']!='Valid')
try:w.trusted(row['signature'])
except AssertionError:check('real-unsigned-signature-refused',True)
else:raise AssertionError('Unsigned fixture accepted')

binary=R/'.local/gate-a-shvdne-private-03d/build-review/RichAudio.Private03D.Supervisor.exe'
child=subprocess.Popen([sys.executable,'-B','-c','import sys;sys.stdin.readline()'],stdin=subprocess.PIPE,text=True)
identity=json.loads(subprocess.check_output([str(binary),'--identity',str(child.pid)],text=True));session=os.urandom(16).hex()
c=dict(Schema=1,Session=session,Mode='offline-fixture',ProcessId=child.pid,ProcessStartUtcTicks=identity['CreationUtcTicks'],Executable=identity['Executable'],ExecutableSha256=identity['Sha256'],ExpectedIdentity=identity,EvidenceRoot=str(T/'supervision'),ShowUi=False,MaximumLifetimeMs=3500,ExitLeadMs=1000,ExitGraceMs=1000,HeartbeatTimeoutMs=250,StartupTimeoutMs=700,AcknowledgeTimeoutMs=5000,Restoration=[dict(Path=str(T/'absent'),Absent=True)])
w.save(T/'config.json',c)
# A separate disposable watcher/launcher exits normally after readiness. The
# test operator retains an independent command pipe, standing in for the live
# Form's direct buttons. No production watcher or supervisor code is changed.
script=T/'watcher-owner.py';script.write_text('''import subprocess,sys,json,time
from pathlib import Path
binary,config=sys.argv[1:];c=json.loads(Path(config).read_text());p=Path(config).parent
with (p/'monitor.stdout').open('x') as out,(p/'monitor.stderr').open('x') as err:
 monitor=subprocess.Popen([binary,'--monitor',config],stdin=sys.stdin,stdout=out,stderr=err)
 ready=Path(c['EvidenceRoot'])/'runs'/c['Session']/'ready.json'
 while not ready.exists():
  if monitor.poll() is not None:raise RuntimeError('fixture monitor exited')
  time.sleep(.01)
 (p/'owner-receipt.json').write_text(json.dumps(dict(pid=monitor.pid,ready=True,ownerNormalExit=True)))
''')
owner=subprocess.Popen([sys.executable,'-B',str(script),str(binary),str(T/'config.json')],stdin=subprocess.PIPE,text=True)
def status():
    path=T/'supervision/runs'/session/'status.json';fn=ctypes.windll.kernel32.CreateFileW;fn.restype=ctypes.c_void_p;fn.argtypes=[ctypes.c_wchar_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p]
    handle=fn(str(path),0x80000000,7,None,3,0,None)
    if handle in [None,ctypes.c_void_p(-1).value]:return None
    with os.fdopen(msvcrt.open_osfhandle(handle,os.O_RDONLY),'r') as file:return json.load(file)
try:
    check('watcher-owner-normal-early-exit',owner.wait(timeout=5)==0)
    check('target-not-terminated-by-watcher-exit',child.poll() is None)
    until(lambda:(status() or {}).get('stopRequested'))
    stopped=status();hard=stopped['hardDeadlineQpc']
    check('independent-monitor-stops-after-watcher-owner-exit',stopped['stopReason']=='probe-not-ready-before-startup-limit')
    owner.stdin.write('normal-exit-requested\n');owner.stdin.flush()
    child.stdin.write('normal fixture exit\n');child.stdin.flush();check('target-normal-exit-after-stop',child.wait(timeout=4)==0)
    until(lambda:(status() or {}).get('processExited'))
    check('watcher-exit-does-not-renew-hard-deadline',status()['hardDeadlineQpc']==hard)
    owner.stdin.write('verify-restoration\n');owner.stdin.flush()
    result=T/'supervision/runs'/session/'result.json';until(result.exists)
    check('independent-restoration-after-watcher-owner-exit',w.read(result)['installationRestored'])
    check('no-forced-termination',not w.read(result)['forcedTerminationIssued'])
finally:
    if child.poll() is None:child.stdin.write('fixture cleanup\n');child.stdin.flush();child.wait(timeout=4)
    try:owner.stdin.write('verify-restoration\n');owner.stdin.flush()
    except OSError:pass
w.save(T/'result.json',dict(passed=True,count=len(checks),checks=checks,scope='Owned disposable watcher-owner exit with independent operator pipe; no GTA, no UI visibility claim'))
print('PASS',len(checks),'actual failure/lifecycle checks')
