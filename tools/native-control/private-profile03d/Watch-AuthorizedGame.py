"""One attachment only. Metadata, durable rejection and independent STOP notice.

No game launch, termination, process memory, assignment or admission fallback.
"""
from pathlib import Path
import ctypes,datetime,json,subprocess,sys,time
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from Package import PACKAGE,read,sha,verify

def qpc():
    value=ctypes.c_longlong()
    assert ctypes.windll.kernel32.QueryPerformanceCounter(ctypes.byref(value))
    return value.value

def frequency():
    value=ctypes.c_longlong()
    assert ctypes.windll.kernel32.QueryPerformanceFrequency(ctypes.byref(value))
    return value.value

def write(path,value):
    with Path(path).open('x',encoding='utf-8') as f:
        json.dump(value,f,indent=2);f.flush()
        import os
        os.fsync(f.fileno())

def response(text,expected_type):
    if not text or not text.strip():raise ValueError('Missing supervisor response; no JSON decoding attempted')
    value=json.loads(text)
    if not isinstance(value,expected_type):raise ValueError('Malformed supervisor response shape')
    return value

def query(binary,*args):
    p=subprocess.run([str(binary),*map(str,args)],capture_output=True,text=True,timeout=3)
    if p.returncode:raise RuntimeError('Identity provider exit '+str(p.returncode)+': '+p.stderr)
    return response(p.stdout,list if args[0]=='--discover' else dict)

def select_game(rows):
    assert len(rows)==1 and rows[0]['Name']=='GTA5_Enhanced.exe','Unexpected launcher/runtime; no admission'
    return rows[0]['ProcessId']

def await_ready(process,run,session,configuration_sha,timeout=2):
    began=time.monotonic()
    while True:
        code=process.poll()
        if code is not None:raise RuntimeError('Supervisor exited before readiness; exitCode='+str(code))
        rejections=list(run.parent.parent.glob('rejection-*.json'))
        if rejections:raise RuntimeError('Supervisor rejected admission: '+read(rejections[0])['error'])
        path=run/'ready.json'
        if path.exists():
            value=response(path.read_text(encoding='utf-8-sig'),dict)
            assert value['schema']==1 and value['session']==session and value['configurationSha256']==configuration_sha,'Wrong readiness binding'
            assert value['monitor']['ProcessId']==process.pid,'Wrong monitor PID'
            return value
        if time.monotonic()-began>=timeout:raise TimeoutError('No bounded supervisor readiness response')
        time.sleep(.02)

def relay(process,path,offset):
    if not path.exists():return offset
    with path.open() as file:
        file.seek(offset)
        for line in file:
            command=response(line,dict)['command']
            assert command in ['stop','ack-stop','normal-exit-requested','quit-unresponsive','verify-restoration']
            process.stdin.write(command+'\n');process.stdin.flush()
        return file.tell()

def supervise(binary,config,e):
    """Reusable by disposable-process tests; never retries attachment."""
    c=read(config);run=Path(c['EvidenceRoot'])/'runs'/c['Session'];process=None;failure_at=qpc();rejection=None
    out=e/'supervisor.stdout';err=e/'supervisor.stderr'
    with out.open('x') as stdout,err.open('x') as stderr:
        try:
            process=subprocess.Popen([str(binary),'--monitor',str(config)],stdin=subprocess.PIPE,stdout=stdout,stderr=stderr,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
            write(e/'supervisor-started.json',dict(pid=process.pid,startQpc=failure_at,attachmentNumber=1))
            ready=await_ready(process,run,c['Session'],sha(config))
            actual=query(binary,'--identity',process.pid)
            assert actual==ready['monitor'],'Monitor changed after readiness'
            write(e/'supervisor-process.json',dict(pid=process.pid,creationUtcTicks=actual['CreationUtcTicks'],creationFileTime=actual['CreationFileTime'],executable=actual['Executable'],canonicalPath=actual['CanonicalPath'],fileIdentity=actual['FileIdentity'],session=c['Session'],sha256=actual['Sha256'],forcedTerminationAuthority=False))
            write(e/'watcher-ready.json',ready)
            offset=0
            while process.poll() is None:
                # Conservative last-known-alive origin for unexpected monitor loss.
                failure_at=qpc();offset=relay(process,e/'monitor-commands.jsonl',offset);time.sleep(.02)
            if not (run/'result.json').is_file():raise RuntimeError('Supervisor exited without complete restoration result')
            result=read(run/'result.json')
            assert result['processExited'] and result['installationRestored'],'Incomplete supervision result'
        except Exception as error:
            rejection=str(error)
            # Persist original stderr/exit code without replacing it with JSONDecodeError.
            write(e/'watcher-failure.json',dict(error=rejection,observedQpc=qpc(),stopOriginQpc=failure_at,pid=process.pid if process else None,exitCode=process.poll() if process else None,stdout=out.read_text(errors='replace'),stderr=err.read_text(errors='replace'),attachmentRetried=False))
            if process is not None and process.poll() is None:
                try:process.stdin.write('stop\n');process.stdin.flush()
                except (OSError,BrokenPipeError):pass
            # An existing rejection has its own persistent stop-only notice.
            # Otherwise start a stop-only notice, never a second attachment.
            if not list(Path(c['EvidenceRoot']).glob('rejection-*.json')) or process is None or process.poll() is not None:
                c.update(FailureQpc=failure_at,FailureReason=rejection)
                failure=e/'failure-notice-configuration.json';write(failure,c)
                with (e/'failure-notice.stdout').open('x') as fo,(e/'failure-notice.stderr').open('x') as fe:
                    notice=subprocess.Popen([str(binary),'--failure-notice',str(failure)],stdout=fo,stderr=fe,stdin=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
                    write(e/'failure-notice-started.json',dict(pid=notice.pid,role='STOP only; no binding, lease or retry'))
                    notice.wait()
                    write(e/'failure-notice-exit.json',dict(exitCode=notice.returncode))
            if process is not None:process.wait()
        finally:
            if process is not None and process.poll() is not None:
                write(e/'supervisor-exit.json',dict(exitCode=process.returncode,utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),stdout=out.read_text(errors='replace'),stderr=err.read_text(errors='replace'),originalRejection=rejection))
    return rejection is None and process.returncode==0

def main(digest):
    verify(digest);plan=read(PACKAGE/'deployment-plan.json');e=PACKAGE/'execution-01'
    binary=Path(plan['supervisor']['binary'])
    assert (e/'installation.json').is_file() and not (e/'watch-intent.json').exists() and not query(binary,'--discover')
    write(e/'watch-intent.json',dict(session=plan['session'],manifestSha256=digest,launchPerformed=False,attachmentLimit=1))
    began=time.monotonic();found=None;rows=[]
    watch_utc_ticks=621355968000000000+time.time_ns()//100
    try:
        while time.monotonic()-began<600:
            rows=query(binary,'--discover')
            if rows:
                pid=select_game(rows)
                before=qpc();found=query(binary,'--identity',pid)
                age_ms=(621355968000000000+time.time_ns()//100-found['CreationUtcTicks'])/10000
                assert 0<=age_ms<=10000,'Late/ambiguous discovery; no admission'
                hard=before+int((900000-age_ms)*frequency()/1000);break
            time.sleep(.05)
        assert found,'No game observed; no launch/retry'
        game=next(x for x in plan['protectedGame'] if Path(x['path']).name=='GTA5_Enhanced.exe')
        assert found['Executable'].casefold()==game['path'].casefold() and found['CanonicalPath'].casefold()==game['path'].casefold() and found['Sha256']==game['sha256']
    except Exception as error:
        failed=qpc();write(e/'discovery-failure.json',dict(error=str(error),qpc=failed,rows=rows,admitted=False))
        # Even failed discovery has an immediate visible stop path. The watch
        # start is a conservative lower bound, never a replacement identity.
        c=dict(Schema=1,Session=plan['session'],Mode='candidate',ProcessId=rows[0]['ProcessId'] if rows else 0,ProcessStartUtcTicks=watch_utc_ticks,Executable=str(Path(plan['gameRoot'])/'GTA5_Enhanced.exe'),ExecutableSha256='',EvidenceRoot=str(e/'supervision'),ShowUi=True,Restoration=[dict(Path=str(e/'never-restored'),Absent=True)],FailureQpc=failed,FixedHardDeadlineQpc=failed+max(0,int((900-time.monotonic()+began)*frequency())),FailureReason='Discovery failed: '+str(error))
        path=e/'discovery-stop-configuration.json';write(path,c)
        subprocess.run([str(binary),'--failure-notice',str(path)],check=False)
        return False
    checks=[dict(Path=x['path'],Bytes=x['bytes'],Sha256=x['sha256'],Absent=False) for x in plan['protectedGame']+plan['originalObs']]
    checks += [dict(Path=x['destination'],Absent=True,Bytes=0,Sha256=None) for x in plan['newGameFiles']+plan['obsFiles'] if x['kind']!='mutable-obs-existing']
    checks += [dict(Path=str(Path(plan['gameRoot'])/x),Absent=True,Bytes=0,Sha256=None) for x in ['mods','scripts','ScriptHookVDotNet.log','rpf.cache.disable']]
    c=dict(Schema=1,Session=plan['session'],Mode='candidate',ProcessId=found['ProcessId'],ProcessStartUtcTicks=found['CreationUtcTicks'],Executable=found['Executable'],ExecutableSha256=found['Sha256'],ExpectedIdentity=found,EvidenceRoot=str(e/'supervision'),Restoration=checks,FixedHardDeadlineQpc=hard,ExecutionManifestPath=str(PACKAGE/'execution-manifest.json'),ExecutionManifestSha256=digest)
    c.update({k:v for k,v in plan['supervisor'].items() if k in ['ShowUi','MaximumLifetimeMs','ExitLeadMs','ExitGraceMs','HeartbeatTimeoutMs','StartupTimeoutMs','AcknowledgeTimeoutMs']})
    write(e/'process-identity.json',found);config=e/'supervisor-configuration.json';write(config,c)
    assert sha(binary)==plan['supervisor']['sha256']
    return supervise(binary,config,e)

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--approved-manifest-sha256',required=True)
    sys.exit(0 if main(parser.parse_args().approved_manifest_sha256) else 3)
