"""One final full-shadow install/restore using the new03C plan on copied roots."""
from pathlib import Path
import sys,importlib.util,json
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];P=R/'.local/gate-a-shvdne-private-03c';E=P/'install-supervision'
spec=importlib.util.spec_from_file_location('full_install03c',R/'tools/native-control/private-profile03c/Manage-Installation.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
scope=P/'installer-fixtures/full-shadow-01';assert not scope.exists()
manager=m.Installation(scope);manager.game.mkdir(parents=True);manager.obs.mkdir(parents=True)
for item in manager.plan['protectedGame']+manager.plan['originalObs']:
    target=manager.mapped(item['path'])
    if not target.exists():m.base.old.copynew(Path(item['path']),target)
def inventory():
    return {str(q.relative_to(scope)):dict(bytes=q.stat().st_size,sha256=m.sha(q)) for q in scope.rglob('*') if q.is_file() and 'execution' not in q.relative_to(scope).parts}
baseline=inventory();assert manager.preflight()
manager.install();assert m.read(manager.e/'installation.json')['passed']
for item in manager.plan['newGameFiles']+manager.plan['obsFiles']:
    assert manager.pin_ok(manager.mapped(item['destination']),item)
assert not (manager.game/'TrainerV.asi').exists()
assert m.sha(manager.game/'xinput1_4.dll')=='a1a8bde409ed75d94a0439c37cf881bc354b13c2f8cd32e4bef3b10f308f1392'
assert m.sha(manager.game/'dinput8.dll')=='9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d'
evidence=manager.game/'scripts/RichAudio.GateAPrivate03C.Evidence';evidence.mkdir();(evidence/('session-'+'c'*32+'.log')).write_text('AUTHORED offline full-install journal, not runtime data')
(manager.game/'ScriptHookVDotNet.log').write_text('AUTHORED offline SHVDNE log, not initialization evidence')
profile=manager.obs/'basic/profiles/GateAPrivate03CLive01/basic.ini';profile.write_text(profile.read_text()+'\n; AUTHORED mock runtime setting\n')
manager.restore();assert manager.verify() and inventory()==baseline
manager.restore();assert inventory()==baseline
archives=[m.read(q)['value'] for q in (manager.e/'transaction').glob('*-archived.json')]
shadow=next(x for x in archives if x['original'].endswith('mods\\update\\update.rpf'))
assert shadow['bytes']==3122239488 and shadow['sha256']=='d9de412ed396f707a351dec90e521390df212566c41e5b34c6acb22194acec19'
assert 'retainedIdenticalSource' in shadow and not (manager.game/'mods').exists() and not (manager.game/'scripts').exists()
originals=[dict(path=item['path'],bytes=Path(item['path']).stat().st_size,sha256=m.sha(Path(item['path']))) for item in manager.plan['protectedGame']+manager.plan['originalObs']]
assert originals==manager.plan['protectedGame']+manager.plan['originalObs']
result=dict(passed=True,scope='Actual final03C staged nine game/three OBS files and complete3122239488-byte shadow on disposable copied game/OBS/external roots; no game, OBS, native or audio execution',managerSha256=m.sha(R/'tools/native-control/private-profile03c/Manage-Installation.py'),planSha256=m.sha(P/'deployment-plan.json'),fixtureRoot=str(scope),gameFiles=9,obsFiles=3,rootBinaries=len(manager.inventory()),originalFilesRestored=len(baseline),shadowBytes=shadow['bytes'],shadowSha256=shadow['sha256'],exactFixtureInventoryRestored=True,restoreResumeIdempotent=True,actualOriginalHashesUnchanged=True,originals=originals,gameWritten=False,obsWritten=False,gameLaunched=False,obsLaunched=False)
with (E/'full-install-restoration.json').open('x',encoding='utf-8') as file:json.dump(result,file,indent=2)
print('PASS final03C full-shadow copied-root install/restore, exact original inventory and idempotent restore')
