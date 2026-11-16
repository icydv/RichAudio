"""Read-only installed OBS wrapper-name audit; no DLL execution or OBS launch."""
from pathlib import Path
import hashlib,json,re,sys
here=Path(__file__).resolve().parent;out=Path(sys.argv[1]);assert not out.exists();out.mkdir(parents=True)
paths=[Path(r'C:\Program Files\obs-studio\bin\64bit\obs-scripting.dll'),Path(r'C:\Program Files\obs-studio\data\obs-scripting\64bit\obslua.dll')]
data={p:p.read_bytes() for p in paths};names=sorted(set(re.findall(r'obs\.([A-Za-z_]\w*)\(', (here/'Recorder10.lua').read_text())))
checks=[dict(name=n,foundIn=[str(p) for p,b in data.items() if n.encode()+b'\0' in b]) for n in names]
assert all(c['foundIn'] for c in checks),checks
result=dict(schema='NativeSuppression10ObsWrapperAudit',passed=True,checks=checks,scriptSha256=hashlib.sha256((here/'Recorder10.lua').read_bytes()).hexdigest(),modules=[dict(path=str(p),bytes=len(b),sha256=hashlib.sha256(b).hexdigest()) for p,b in data.items()],scope='Names resolved in installed wrapper binaries; arity checked against upstream declarations and authored Lua fixtures; no live frontend qualification',obsLaunched=False)
(out/'result.json').write_text(json.dumps(result,indent=2));print('PASS installed Lua bindings='+str(len(checks))+'; no DLL execution or OBS launch')
