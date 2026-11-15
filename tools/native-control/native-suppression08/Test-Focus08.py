"""Actual owned windows + production callback/status admission; no GTA/OBS."""
from pathlib import Path
import importlib.util,json,subprocess,sys,time
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('op08',HERE/'Operator08.py');op=importlib.util.module_from_spec(spec);spec.loader.exec_module(op)
root,exe=Path(sys.argv[1]),Path(sys.argv[2]);assert not root.exists();root.mkdir(parents=True);checks=[]
def check(b,name):assert b,name;checks.append(name);print('PASS '+name,flush=True)
class Recorder:
    def call(self,name):assert name=='GetRecordStatus';return dict(outputActive=True,outputPaused=False,graphValid=True,failed=False)
for mode in ['normal','pause-background','stale-background']:
    d=root/mode;d.mkdir();a=subprocess.Popen([str(exe),str(d/'game'),mode]);b=subprocess.Popen([str(exe),str(d/'obs'),'obs'])
    identities=[]
    try:
        until=time.monotonic()+8;state_path=d/'game/operator/state.json'
        while time.monotonic()<until:
            if state_path.exists():
                state=op.read(state_path)
                if state['RuntimeReady']:break
            time.sleep(.1)
        state=op.read(state_path);session=state['Session']
        game=op.ProcessIdentity(a.pid,None,exe,op.sha(exe));obs=op.ProcessIdentity(b.pid,None,exe,op.sha(exe));identities=[game,obs]
        try:
            receipt=op.startup_focus_check(d/'game',session,game,obs,Recorder())
        except AssertionError as e:
            check(mode!='normal','real owned '+mode+' refuses admission: '+str(e))
        else:check(mode=='normal' and receipt['Passed'] and receipt['Transitions']==2,'one owned background transition and return with actual fresh callbacks')
        check(op.read(state_path)['Generation']=='unspawned' and not list((d/'game/operator/commands').glob('*')),'focus check never spawns or dispatches '+mode)
        # A delivered normal-close request is not proof of closure: verify actual
        # process exit below. The fixtures receive no keyboard input.
    finally:
        for identity in identities:
            if identity.alive():identity.normal_close()
        check(a.wait(28)==0 and b.wait(28)==0,'owned windows close normally '+mode)
        for identity in identities:identity.close()
class WrongTarget:
    def foreground(self,activate=False):return False
    def window(self):raise AssertionError('delivered input did not establish exact owned window')
try:op.startup_focus_check(root,'none',WrongTarget(),WrongTarget(),Recorder())
except AssertionError:check(True,'input/focus request without expected foreground state refuses before activation')
else:raise AssertionError('wrong foreground accepted')
op.atomic(root/'result.json',dict(passed=True,checks=checks,gameLaunched=False,obsLaunched=False,runtimeQualified=False,scope='Real disposable WinForms windows/processes + production bridge/runner/operator; authored game counters and recorder state, no real-game audibility claim',artifacts=[dict(path=str(HERE/'Operator08.py'),sha256=op.sha(HERE/'Operator08.py')),dict(path=str(HERE.parents[2]/'tests/host/DisposableFocus08.cs'),sha256=op.sha(HERE.parents[2]/'tests/host/DisposableFocus08.cs'))]),True)
