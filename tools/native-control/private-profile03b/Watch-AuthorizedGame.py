"""Prepared metadata-only watcher. Does not launch, inject into or terminate GTA.
Starts the retained independent monitor with a visible Form and no console.
"""
from pathlib import Path
import argparse,json,hashlib,subprocess,time,datetime
P=Path(__file__).resolve().parent
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def write(p,v):
 with p.open('x') as f:json.dump(v,f,indent=2)
def metadata():
 script="@((Get-CimInstance Win32_Process -Filter \"Name = 'GTA5_Enhanced.exe' OR Name = 'RAGEPluginHook.exe'\") | ForEach-Object { @{ Name=$_.Name;ProcessId=$_.ProcessId;ExecutablePath=$_.ExecutablePath;CreationUtcTicks=$_.CreationDate.ToUniversalTime().Ticks } }) | ConvertTo-Json -Compress"
 text=subprocess.check_output(['powershell.exe','-NoProfile','-Command',script],text=True).strip()
 if not text:return []
 value=json.loads(text);return value if isinstance(value,list) else [value]
def supervisor_identity(pid,monitor):
 script="Get-CimInstance Win32_Process -Filter 'ProcessId = "+str(int(pid))+"' | ForEach-Object {@{Name=$_.Name;ProcessId=$_.ProcessId;ExecutablePath=$_.ExecutablePath;CreationUtcTicks=$_.CreationDate.ToUniversalTime().Ticks}} | ConvertTo-Json -Compress"
 row=json.loads(subprocess.check_output(['powershell.exe','-NoProfile','-Command',script],text=True))
 assert row['ProcessId']==pid and row['Name'].lower()=='richaudio.private01.supervisor.exe' and row['ExecutablePath'].lower()==str(monitor).lower()
 return row
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--approved-manifest-sha256',required=True);args=ap.parse_args()
 manifest=P/'execution-manifest.json';assert sha(manifest)==args.approved_manifest_sha256,'Fresh explicit approval of exact manifest required'
 for x in read(manifest)['bindings']:assert sha(Path(x['path']))==x['sha256'],x['path']
 plan=read(P/'deployment-plan.json');E=P/'execution-01';assert (E/'installation.json').is_file() and not (E/'watch-intent.json').exists() and not metadata()
 write(E/'watch-intent.json',dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),session=plan['session'],launchPerformed=False,scope='One future normal Steam launch; read-only process metadata only; no retry'))
 began=time.monotonic();found=None
 while time.monotonic()-began<600:
  rows=metadata();assert not any(x['Name']=='RAGEPluginHook.exe' for x in rows),'RPH appeared; do not activate; normal exit required'
  if rows:
   assert len(rows)==1;found=rows[0];break
  time.sleep(.1)
 assert found,'No game observed in startup watcher window; no automatic launch or retry'
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
    with commands.open() as f:
     f.seek(offset)
     for line in f:
      command=json.loads(line)['command'];assert command in ['stop','ack-stop','normal-exit-requested','quit-unresponsive','verify-restoration']
      process.stdin.write(command+'\n');process.stdin.flush()
     offset=f.tell()
   time.sleep(.1)
 write(E/'supervisor-exit.json',dict(exitCode=process.returncode,utc=datetime.datetime.now(datetime.timezone.utc).isoformat()))
