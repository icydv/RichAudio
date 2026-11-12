"""Separate exact-provenance watcher entry point; unchanged supervision/launch scope."""
from pathlib import Path
import sys,importlib.util,argparse,subprocess,time,datetime
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from Provenance import ROOT,ORIGINAL,read,sha,verify_manifest,verify_provenance
spec=importlib.util.spec_from_file_location('sealed_watcher03c',ORIGINAL/'Watch-AuthorizedGame.py')
old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
write,metadata,supervisor_identity=old.write,old.metadata,old.supervisor_identity
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--approved-manifest-sha256',required=True);args=parser.parse_args()
    verify_manifest(args.approved_manifest_sha256);provenance=verify_provenance()
    plan=read(ORIGINAL/'deployment-plan.json');E=ORIGINAL/'execution-01'
    assert (E/'installation.json').is_file() and not (E/'watch-intent.json').exists() and not metadata()
    write(E/'watch-intent.json',dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),session=plan['session'],launchPerformed=False,scope='One future normal Steam launch; read-only process metadata only; no retry',approvedManifestSha256=args.approved_manifest_sha256,provenanceHead=provenance['head']))
    began=time.monotonic();found=None
    while time.monotonic()-began<600:
        rows=metadata();assert not any(x['Name']=='RAGEPluginHook.exe' for x in rows),'RPH appeared; do not activate; normal exit required'
        if rows:
            assert len(rows)==1;found=rows[0];break
        time.sleep(.1)
    assert found,'No game observed; no automatic launch or retry'
    assert found['ExecutablePath'].lower()==str(Path(plan['gameRoot'])/'GTA5_Enhanced.exe').lower()
    game=next(x for x in plan['protectedGame'] if Path(x['path']).name=='GTA5_Enhanced.exe');assert sha(Path(game['path']))==game['sha256']
    checks=[dict(Path=x['path'],Bytes=x['bytes'],Sha256=x['sha256'],Absent=False) for x in plan['protectedGame']+plan['originalObs']]
    checks += [dict(Path=x['destination'],Absent=True,Bytes=0,Sha256=None) for x in plan['newGameFiles']+plan['obsFiles'] if x['kind']!='mutable-obs-existing']
    checks += [dict(Path=str(Path(plan['gameRoot'])/x),Absent=True,Bytes=0,Sha256=None) for x in ['mods','scripts','ScriptHookVDotNet.log','rpf.cache.disable']]
    assert 0<len(checks)<=256
    cfg=dict(Schema=1,Session=plan['session'],Mode='candidate',ProcessId=found['ProcessId'],ProcessStartUtcTicks=found['CreationUtcTicks'],Executable=found['ExecutablePath'],ExecutableSha256=game['sha256'],EvidenceRoot=str(E/'supervision'),Restoration=checks)
    cfg.update({k:v for k,v in plan['supervisor'].items() if k in ['ShowUi','MaximumLifetimeMs','ExitLeadMs','ExitGraceMs','HeartbeatTimeoutMs','StartupTimeoutMs','AcknowledgeTimeoutMs']})
    config=E/'supervisor-configuration.json';write(config,cfg);write(E/'process-identity.json',found)
    monitor=Path(plan['supervisor']['binary']);assert sha(monitor)==plan['supervisor']['sha256']
    with (E/'supervisor.stdout').open('x') as out,(E/'supervisor.stderr').open('x') as err:
        process=subprocess.Popen([str(monitor),'--monitor',str(config)],stdin=subprocess.PIPE,stdout=out,stderr=err,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
        identity=supervisor_identity(process.pid,monitor)
        write(E/'supervisor-process.json',dict(pid=process.pid,creationUtcTicks=identity['CreationUtcTicks'],executable=identity['ExecutablePath'],session=plan['session'],sha256=sha(monitor),consoleFreeVisibleForm=True,forcedTerminationAuthority=False))
        offset=0;commands=E/'monitor-commands.jsonl'
        while process.poll() is None:
            if commands.exists():
                with commands.open() as file:
                    file.seek(offset)
                    for line in file:
                        command=old.json.loads(line)['command'];assert command in ['stop','ack-stop','normal-exit-requested','quit-unresponsive','verify-restoration']
                        process.stdin.write(command+'\n');process.stdin.flush()
                    offset=file.tell()
            time.sleep(.1)
    write(E/'supervisor-exit.json',dict(exitCode=process.returncode,utc=datetime.datetime.now(datetime.timezone.utc).isoformat()))
