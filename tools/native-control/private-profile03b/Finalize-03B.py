"""Read back the completed proposal, rerun only its read-only preflight and index closed files."""
from pathlib import Path
import sys,json,hashlib,subprocess,datetime
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03b'
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
assert result['manifestSha256']==digest and not result['liveAuthorized']
command=[sys.executable,'-B',str(Path(__file__).with_name('Manage-Installation.py')),'preflight','--manifest-sha256',digest]
check=subprocess.run(command,capture_output=True,text=True)
assert check.returncode==0,check.stderr
bindings=read(manifest)['bindings']
for x in bindings:assert pin(Path(x['path']))==x,x['path']
assert digest in (P/'FRESH_AUTHORIZATION.txt').read_text()
assert not (P/'execution-01').exists()
save(P/'sealed-readback.json',dict(passed=True,utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),manifestSha256=digest,manifestBindingsVerified=len(bindings),command=command,exitCode=check.returncode,stdout=check.stdout,stderr=check.stderr,mode='Read-only preflight; no approved install/restore argument; no authorization inferred',gameFilesWritten=False,obsFilesWritten=False,applicationsLaunched=False,executionDirectoryAbsent=True))
docs=[R/'docs'/name for name in ['GATE_A_SHVDNE_PRIVATE_03B.md','GATE_A_SHVDNE_PRIVATE_03B_LOADERS.md','GATE_A_SHVDNE_PRIVATE_03B_PROCEDURE.md']]
files=sorted({p for p in P.rglob('*') if p.is_file()}|set(docs)|set(Path(__file__).parent.glob('*.py'))|{R/'tests/Test-PrivateLoader03B.py',R/'tests/Test-PrivateSupervisor03B.py'})
save(P/'evidence-manifest.json',dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),scope='All new03B preparation, fixture, review, seal and readback files plus source/docs; index excludes itself and its later readback. Primary manifest separately binds reviewed operation inputs. No active stdout writer is indexed.',files=[pin(p) for p in files]))
index=read(P/'evidence-manifest.json')
for x in index['files']:assert pin(Path(x['path']))==x,x['path']
save(P/'evidence-index-readback.json',dict(passed=True,index=pin(P/'evidence-manifest.json'),filesVerified=len(index['files']),manifestSha256=digest,closedInputsOnly=True))
print(json.dumps(dict(passed=True,manifestSha256=digest,manifestBindings=len(bindings),evidenceFiles=len(index['files']),evidenceManifestSha256=sha(P/'evidence-manifest.json'),finalReadOnlyPreflightPassed=True,installationInvocations=0,gameLaunches=0),indent=2))
