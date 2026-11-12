"""Materialize only the new development proposal; no installation or application launch."""
from pathlib import Path
import json,hashlib,uuid,sys
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03c';B=R/'.local/gate-a-shvdne-private-03b'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def save(p,value):
    with p.open('x',encoding='utf-8') as f:json.dump(value,f,indent=2)
assert sha(B/'execution-manifest.json')=='b3337f3c2f41a8878a25582321ebe10e1dba216bf90bc4b274f27ba63cd24237'
assert not (P/'deployment-plan.json').exists() and not (P/'execution-01').exists()
build=read(P/'resource-probe/build-02/build-receipt.json');binary=P/'resource-probe/build-02/RichAudio.GateAPrivate03C.Shvdne.dll'
assert sha(binary)==build['candidateSha256'] and not build['defaultEnabled']
plan=read(B/'deployment-plan.json');contract=read(B/'loader-contract.json')
plan['experiment']='GATE-A-SHVDNE-PRIVATE-03C';plan['preparationRevision']='offline-readiness-01';plan['session']=uuid.uuid4().hex
runtime=P/'explicit-approval-execution.ini'
with runtime.open('x',encoding='ascii',newline='\n') as f:f.write('Experiment=GATE-A-SHVDNE-PRIVATE-03C\nEnabled=true\nSupervisorSession='+plan['session']+'\n')
for x in plan['newGameFiles']:
    name=Path(x['destination']).name
    if name=='RichAudio.GateAPrivate03.Shvdne.dll':
        x.update(source=str(binary),destination=str(Path(x['destination']).with_name('RichAudio.GateAPrivate03C.Shvdne.dll')),bytes=binary.stat().st_size,sha256=sha(binary))
    elif name=='RichAudio.GateAPrivate03.Shvdne.ini':
        x.update(source=str(runtime),destination=str(Path(x['destination']).with_name('RichAudio.GateAPrivate03C.Shvdne.ini')),bytes=runtime.stat().st_size,sha256=sha(runtime))
capture=P/'capture-template';capture.mkdir()
for x in plan['obsFiles']:
    source=Path(x['source']);name=source.name.replace('GateAPrivate03Live01','GateAPrivate03CLive01');target=capture/name
    content=source.read_text(encoding='utf-8-sig').replace('GateAPrivate03Live01','GateAPrivate03CLive01').replace(str(B).replace('\\','\\\\'),str(P).replace('\\','\\\\'))
    with target.open('x',encoding='utf-8',newline='\n') as f:f.write(content)
    x.update(source=str(target),destination=x['destination'].replace('GateAPrivate03Live01','GateAPrivate03CLive01'),bytes=target.stat().st_size,sha256=sha(target))
plan['newGameBytes']=sum(x['bytes'] for x in plan['newGameFiles']);plan['minimumGameDriveFreeBytes']=plan['newGameBytes']+536870912
plan['reserveRecoveryArchiveBytes']=max(x['bytes'] for x in plan['newGameFiles']+plan['obsFiles'])+max(x['bytes'] for x in plan['backupOriginals'])
plan['recoveryPolicy']='One installation attempt; durable exclusive-create/identity proof, archive before removal, same-attempt resumable file restoration after verified process closure; no new launch/activation/deadline. Unproven, replaced, changed, linked or corrupt state is preserved and refused.'
contract['experiment']=plan['experiment'];contract['approvedDestinations']=[dict(destination=x['destination']) for x in plan['newGameFiles']+plan['obsFiles']]
save(P/'deployment-plan.json',plan);save(P/'loader-contract.json',contract)
# The metadata-only watcher derives this new plan/session/check list from its local path.
for name in ['Watch-AuthorizedGame.py','Read-Status03.ps1']:
    with (P/name).open('x',encoding='utf-8',newline='\n') as f:f.write((B/name).read_text(encoding='utf-8-sig'))
print('Prepared new03C fixed session and exact9+3 proposal; candidate='+build['candidateSha256']+'; no game/OBS writes')
