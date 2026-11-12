"""Read back the closed proposal and run its read-only CLI preflight, then index evidence."""
from pathlib import Path
import sys,json,hashlib,subprocess,datetime
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03c'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def pin(p):return dict(path=str(p),bytes=p.stat().st_size,sha256=sha(p))
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def save(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,indent=2)
manifest=P/'execution-manifest.json';digest=sha(manifest);result=read(P/'result.json')
assert result['manifestSha256']==digest and result['outcome']=='READY FOR REVIEW' and not result['liveAuthorized']
cmd=[sys.executable,'-B',str(Path(__file__).with_name('Manage-Installation.py')),'preflight','--manifest-sha256',digest]
command=subprocess.run(cmd,capture_output=True,text=True);assert command.returncode==0,command.stderr
bindings=read(manifest)['bindings']
for x in bindings:assert pin(Path(x['path']))==x,x['path']
assert digest in (P/'FRESH_AUTHORIZATION.txt').read_text() and not (P/'execution-01').exists()
save(P/'sealed-readback.json',dict(passed=True,utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),manifestSha256=digest,bindingsVerified=len(bindings),command=cmd,exitCode=command.returncode,stdout=command.stdout,stderr=command.stderr,readOnly=True,installationInvocations=0,gameLaunches=0,obsLaunches=0,liveAuthorizationInferred=False))
sources=[Path(x['path']) for x in read(P/'source-manifest.json')['files']]
files=sorted({q for q in P.rglob('*') if q.is_file()}|set(sources))
save(P/'evidence-manifest.json',dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),scope='All closed03C development/evidence/fixture/proposal files and new source/docs. Excludes this index and its later readback. No active output writer is indexed.',files=[pin(q) for q in files]))
index=read(P/'evidence-manifest.json')
for x in index['files']:assert pin(Path(x['path']))==x,x['path']
save(P/'evidence-index-readback.json',dict(passed=True,index=pin(P/'evidence-manifest.json'),filesVerified=len(index['files']),manifestSha256=digest,closedInputsOnly=True))
print(json.dumps(dict(passed=True,outcome='READY FOR REVIEW',manifestSha256=digest,manifestBindings=len(bindings),evidenceFiles=len(index['files']),evidenceManifestSha256=sha(P/'evidence-manifest.json'),finalReadOnlyPreflightPassed=True,gameLaunches=0,realGameWrites=0,liveAuthorization=False),indent=2))
