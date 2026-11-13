"""Real notice/target driver. UI actions belong to Computer Use, not this file."""
from pathlib import Path
import sys,json,time,copy,os,datetime
R=Path(__file__).resolve().parents[1];P=R/'.local/gate-a-shvdne-private-03i'
sys.path.insert(0,str(R/'tools/native-control/private-profile03h'))
from Shared import tc,Context,configure
from DecodeWindows import qpc,frequency

def setup(binary):
    c=tc.load(tc.sha(R/'.local/gate-a-shvdne-private-03h/toolchain-manifest.json'))
    c=copy.deepcopy(c);c['programs']['supervisor']=dict(tc.pin(binary),**tc.identity(binary));configure(c,True);return c

def drive(root,mode,binary,fault=None,exit_delay=1.5,staged=False,show_ui=True,synthetic=False):
    root=Path(root).resolve();assert root.is_relative_to(P/'fixtures') and not root.exists();root.mkdir(parents=True)
    assert not(show_ui and synthetic);setup(Path(binary));config_path=root/'configuration.json';target=None;monitor=None;problem=None;records=[];session=__import__('uuid').uuid4().hex
    tc.save(root/'waiting.json',dict(mode=mode,automationOnly=True,humanHandoffQualified=False))
    end=time.monotonic()+180
    while not (root/'launch').exists():assert time.monotonic()<end;time.sleep(.01)
    out=(root/'stdout.log').open('x');err=(root/'stderr.log').open('x');began=time.monotonic()
    def identity(pid):return json.loads(Context.processes.check_output([str(binary),'--identity',str(pid)],stdin=Context.processes.DEVNULL,text=True,timeout=3))
    def collect():
        result=[]
        for path in (root/'evidence').rglob('notice-events.jsonl'):
            for line in path.read_text().splitlines():
                try:result.append(json.loads(line))
                except ValueError:pass
        return result
    try:
        target=Context.processes.Popen(['python','-c',"import time,sys;from pathlib import Path;p=Path(sys.argv[1]);end=time.monotonic()+95;\nwhile not p.exists() and time.monotonic()<end:time.sleep(.01)",str(root/'normal-exit.request')],stdin=Context.processes.DEVNULL)
        i=identity(target.pid)
        config=dict(Schema=1,Session=session,Mode='offline-fixture',ProcessId=target.pid,ProcessStartUtcTicks=i['CreationUtcTicks'],Executable=i['Executable'],ExecutableSha256=i['Sha256'],ExpectedIdentity=i,EvidenceRoot=str(root/'evidence'),ShowUi=show_ui,MaximumLifetimeMs=120000,ExitLeadMs=5000,ExitGraceMs=60000,HeartbeatTimeoutMs=2000,StartupTimeoutMs=110000,AcknowledgeTimeoutMs=5000,Restoration=[dict(Path=str(root/'absent'),Absent=True)],FailureQpc=0,FailureReason='Automated disposable UI delivery test; no GTA')
        if staged:config['FixtureArmPath']=str(root/'arm')
        if fault:config['FixtureDeliveryFault']=fault
        tc.save(config_path,config)
        monitor=Context.processes.Popen([str(binary),'--monitor' if mode=='normal' else '--failure-notice',str(config_path)],stdin=Context.processes.PIPE,stdout=out,stderr=err,text=True,creationflags=Context.processes.CREATE_NO_WINDOW)
        tc.save(root/'started.json',dict(targetPid=target.pid,monitorPid=monitor.pid,session=session,binary=tc.pin(binary),automationOnly=True))
        sent=False;verified=False;stdin_closed=False
        while monitor.poll() is None and time.monotonic()-began<87:
            records=collect();opened=next((r for r in records if r['kind']=='acknowledgment-window-opened'),None)
            if mode=='normal' and (root/'arm').exists() and not sent:monitor.stdin.write('stop\n');monitor.stdin.flush();sent=True
            if opened:
                origin=opened['detail']['originQpc'];age=(qpc()-origin)/frequency()
                # Target exit is independent of acknowledgment. This is a
                # disposable-file request only, never a GTA exit mechanism.
                if age>=exit_delay and target.poll() is None:(root/'normal-exit.request').touch(exist_ok=True)
                if synthetic and not stdin_closed:monitor.stdin.write(('fixture-button-twice' if fault=='duplicate' else 'fixture-button')+'\n');monitor.stdin.flush();synthetic=False
                if fault=='unexpected-exit' and not stdin_closed:monitor.stdin.write('fixture-exit\n');monitor.stdin.flush();stdin_closed=True
            if (root/'command').exists() and not stdin_closed:
                command=(root/'command').read_text().strip();(root/'command').rename(root/'command-consumed');monitor.stdin.write(command+'\n');monitor.stdin.flush()
            if fault=='closed-stdin' and not stdin_closed:monitor.stdin.close();stdin_closed=True
            exit_observed=False
            for path in (root/'evidence').glob('runs/*/events.jsonl'):
                for line in path.read_text().splitlines():
                    try:exit_observed|=json.loads(json.loads(line)['payload'])['kind']=='process-exit-observed'
                    except ValueError:pass
            if target.poll() is not None and mode=='normal' and exit_observed and not verified and not stdin_closed:
                monitor.stdin.write('verify-restoration\n');monitor.stdin.flush();verified=True
            if (root/'close-control').exists() and not stdin_closed:monitor.stdin.close();stdin_closed=True
            time.sleep(.01)
        if monitor.poll() is None:problem='bounded fixture wait expired'
    except BaseException as error:problem=type(error).__name__+': '+str(error)
    finally:
        if staged:(root/'arm').touch(exist_ok=True)
        (root/'normal-exit.request').touch(exist_ok=True)
        if target is not None:
            try:target.wait(timeout=3)
            except Context.processes.TimeoutExpired:problem='unproven target closure'
        if monitor is not None and monitor.poll() is None:
            try:
                if mode=='normal' and not monitor.stdin.closed:monitor.stdin.write('stop\nverify-restoration\n');monitor.stdin.flush()
                monitor.wait(timeout=7)
            except (OSError,Context.processes.TimeoutExpired):problem='unproven monitor closure'
        out.close();err.close();records=collect()
        events=[]
        for path in (root/'evidence').rglob('events.jsonl'):
            for line in path.read_text().splitlines():
                try:
                    item=json.loads(line);events.append(json.loads(item['payload']) if 'payload' in item else item)
                except ValueError:pass
        tc.save(root/'result.json',dict(mode=mode,fault=fault,error=problem,trace=records,events=events,monitorExitCode=monitor.poll() if monitor else None,normalTargetClosure=target is not None and target.poll()==0,monitorClosed=monitor is not None and monitor.poll() is not None,actualUi=show_ui,automatedActions=True,humanHandoffQualified=False,stagedInducedFailure=staged,exitDelaySeconds=exit_delay,gameLaunched=False,forcedTerminationIssued=False))

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('mode');p.add_argument('binary');p.add_argument('--fault');p.add_argument('--exit-delay',type=float,default=1.5);p.add_argument('--staged',action='store_true');p.add_argument('--headless',action='store_true');p.add_argument('--synthetic',action='store_true');a=p.parse_args();drive(a.root,a.mode,Path(a.binary),a.fault,a.exit_delay,a.staged,not a.headless,a.synthetic)
