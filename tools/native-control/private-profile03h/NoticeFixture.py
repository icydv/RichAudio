"""Owned disposable target/monitor cleanup, independent of acknowledgment."""
from pathlib import Path
import json,time,uuid,os
from Shared import PACKAGE,Context,tc,ROOT
from MetadataQuery import query

def events(root,session,mode):
    paths=(root/'evidence').glob(('runs/'+session if mode=='normal' else 'failures/*')+'/events.jsonl');result=[]
    for path in paths:
        for line in path.read_text().splitlines():
            try:
                row=json.loads(line);result.append(json.loads(row['payload']) if 'payload' in row else row)
            except ValueError:pass
    return result

def run(mode,show_ui=False,synthetic_ack=False,fault=None,stop_after=12,maximum_wait=75):
    assert mode in ['normal','stop-only'] and not(show_ui and synthetic_ack)
    root=PACKAGE/'fixtures'/('notice-'+mode+'-'+uuid.uuid4().hex);root.mkdir(parents=True);session=uuid.uuid4().hex;request=root/'normal-exit.request';target=None;monitor=None;failure=None;observations=[];ready=False;closed=False;verified=False;result={};began=time.monotonic()
    binary=Context.contract['programs']['supervisor']['path'];output=(root/'stdout.log').open('x');error=(root/'stderr.log').open('x')
    try:
        # Both owner request and target's own monotonic lifetime lead to exit0.
        program="import sys,time;from pathlib import Path;p=Path(sys.argv[1]);end=time.monotonic()+float(sys.argv[2]);\nwhile not p.exists() and time.monotonic()<end:time.sleep(.02)\n"
        target=Context.processes.Popen(['python','-c',program,str(request),str(maximum_wait+8)],stdin=Context.processes.DEVNULL)
        identity=query(binary,'--identity',target.pid)
        config=dict(Schema=1,Session=session,Mode='offline-fixture',ProcessId=target.pid,ProcessStartUtcTicks=identity['CreationUtcTicks'],Executable=identity['Executable'],ExecutableSha256=identity['Sha256'],ExpectedIdentity=identity,EvidenceRoot=str(root/'evidence'),ShowUi=show_ui,MaximumLifetimeMs=120000,ExitLeadMs=5000,ExitGraceMs=60000,HeartbeatTimeoutMs=2000,StartupTimeoutMs=110000,AcknowledgeTimeoutMs=5000,Restoration=[dict(Path=str(root/'absent'),Absent=True)],FailureReason='Disposable STOP-only notice: acknowledge when this text appears, not after a countdown',FailureQpc=0)
        tc.save(root/'configuration.json',config)
        monitor=Context.processes.Popen([binary,'--monitor' if mode=='normal' else '--failure-notice',str(root/'configuration.json')],stdin=Context.processes.PIPE,stdout=output,stderr=error,text=True,creationflags=Context.processes.CREATE_NO_WINDOW)
        if mode=='normal':
            end=time.monotonic()+3;ready_path=root/'evidence/runs'/session/'ready.json'
            while not ready_path.exists():
                assert monitor.poll() is None and time.monotonic()<end,'No fixture readiness';time.sleep(.02)
            admitted=tc.read(ready_path)
            if fault=='empty-query':raise ValueError('Authored empty identity response after monitor readiness')
            actual=query(binary,'--identity',monitor.pid);assert actual==admitted['monitor'] and admitted['configurationSha256']==tc.sha(root/'configuration.json')
        ready=True;cue=time.monotonic();tc.save(root/'ready-cue.json',dict(ready=True,mode=mode,session=session,stopAfterSeconds=stop_after if mode=='normal' else 0,scope='Disposable only; STOP may occur immediately on failure'))
        while monitor.poll() is None and time.monotonic()-began<maximum_wait:
            observations=events(root,session,mode)
            if mode=='normal' and time.monotonic()-cue>=stop_after and not any(e['kind']=='stop-notified' for e in observations):monitor.stdin.write('stop\n');monitor.stdin.flush();cue=float('inf')
            stopped=any(e['kind'] in ['stop-notified','stop-only-notified'] for e in observations)
            if fault=='coordinator-timeout' and stopped:raise TimeoutError('Authored coordinator timeout')
            ack=any(e['kind']=='direct-ack' or e['kind']=='user-command' and e['detail']=='normal-exit-requested' for e in observations)
            if stopped and synthetic_ack and not ack:monitor.stdin.write('normal-exit-requested\n');monitor.stdin.flush();synthetic_ack=False
            if ack and target.poll() is None and not request.exists():request.touch(exist_ok=False)
            if target.poll() is not None and mode=='normal' and not verified and any(e['kind']=='process-exit-observed' for e in observations):monitor.stdin.write('verify-restoration\n');monitor.stdin.flush();verified=True
            time.sleep(.02)
        assert monitor.poll() is not None,'Fixture coordinator wait expired'
    except BaseException as problem:failure=type(problem).__name__+': '+str(problem)
    finally:
        # No acknowledgment is invented. A failed fixture exits normally even
        # when its coordinator timed out, and retains its failed human gate.
        if target is not None:
            if target.poll() is None:request.touch(exist_ok=True)
            try:closed=target.wait(timeout=3)==0
            except Context.processes.TimeoutExpired:closed=False
        if monitor is not None and monitor.poll() is None:
            try:
                if mode=='normal':monitor.stdin.write('stop\n');monitor.stdin.flush();time.sleep(.08);monitor.stdin.write('verify-restoration\n');monitor.stdin.flush()
                monitor.wait(timeout=3)
            except (OSError,Context.processes.TimeoutExpired):pass
        output.close();error.close();observations=events(root,session,mode)
        path=root/'evidence/runs'/session/'result.json'
        if mode=='normal' and path.exists():result=tc.read(path)
        elif mode=='stop-only':result=next((e['detail'] for e in observations if e['kind']=='process-absence'),{})
        exit_code=monitor.poll() if monitor else None
        passed=failure is None and closed and exit_code==(0 if mode=='normal' else 3) and result.get('notificationAcknowledged',False) and not any(result.get(k,False) for k in ['notificationOverdue','acknowledgmentLate','exitDeadlineViolated']) and result.get('journalError') is None
        if mode=='normal':passed=passed and result.get('processExited',False) and result.get('installationRestored',False)
        receipt=dict(passed=passed,mode=mode,scope=str(root),ready=ready,fault=fault,error=failure,result=result,normalTargetClosure=closed,normalMonitorClosure=monitor is not None and monitor.poll() is not None,monitorExitCode=exit_code,targetPid=target.pid if target else None,monitorPid=monitor.pid if monitor else None,headless=not show_ui,actualDirectUserGateQualified=passed and show_ui,syntheticAcknowledgment=not show_ui,forcedTerminationIssued=False,events=observations,gameLaunched=False,obsLaunched=False)
        tc.save(root/'qualification.json',receipt)
    return receipt
