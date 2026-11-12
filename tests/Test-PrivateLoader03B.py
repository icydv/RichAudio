"""Fault-inject the exact03B installer on mapped copies; never mutate live roots."""
from pathlib import Path
import importlib.util, sys, subprocess, json
sys.dont_write_bytecode = True
R = Path(__file__).resolve().parents[1]
P = R/'.local/gate-a-shvdne-private-03b'
spec = importlib.util.spec_from_file_location('manager03b',R/'tools/native-control/private-profile03b/Manage-Installation.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
root = P/'installer-fixtures/actual-root-01'
assert not root.exists()
root.mkdir(parents=True)
manager = m.Installation(root)
manager.game.mkdir(); manager.obs.mkdir()
for x in manager.plan['protectedGame']+manager.plan['originalObs']:
    target = manager.mapped(x['path'])
    if not target.exists(): m.old.copynew(Path(x['path']), target)


def inventory():
    return {str(p.relative_to(root)):m.sha(p) for p in root.rglob('*') if p.is_file() and 'execution' not in p.relative_to(root).parts}


cases=[]
def passed(name):
    cases.append(name); print('PASS '+name, flush=True)


def refused(name, action):
    try: action()
    except AssertionError: passed(name)
    else: raise AssertionError('Unexpected acceptance: '+name)


before=inventory()
assert len(manager.inventory())==49 and manager.preflight()
passed('actual-49-file-inventory-including-authentic-XInput-and-DInput-coexistence')
for name in ['xinput1_4.dll','dinput8.dll','ScriptHookV.dll','OpenRPF.asi']:
    path=manager.game/name; original=path.read_bytes(); path.unlink()
    refused('missing-required-'+name,manager.preflight)
    path.write_bytes(original)
    path.write_bytes(original[:-1]+bytes([original[-1]^1]))
    refused('modified-hash-'+name,manager.preflight)
    path.write_bytes(original)
for name in ['dsound.dll','dinput.dll','OpenIV.asi','wininet.dll','winmm.dll','dxgi.dll','version.dll','UnknownLoader.asi','arbitrary.dll']:
    path=manager.game/name; path.write_bytes(b'AUTHORED UNEXPECTED INVENTORY')
    refused('unexpected-alternative-or-extra-'+name,manager.preflight)
    path.unlink()
path=manager.game/'xinput9_1_0.dll'; path.write_bytes((manager.game/'xinput1_4.dll').read_bytes())
refused('duplicate-proxy-bytes-under-unapproved-alias-rejected-as-inventory-not-assumed-runtime-conflict',manager.preflight)
path.unlink()
for name in ['rpf.cache.disable','ScriptHookVDotNet.log']:
    path=manager.game/name; path.write_bytes(b'AUTHORED STALE FLAG')
    refused('unexpected-configuration-'+name,manager.preflight); path.unlink()
original_game=manager.game; manager.game=manager.scope/'wrong-game'; manager.game.mkdir()
refused('incorrect-game-root-inventory',manager.preflight); manager.game=original_game
bad=root/'bad-runtime.dll';bad.write_bytes(b'AUTHORED BAD RUNTIME')
original_source=manager.plan['newGameFiles'][0]['source'];manager.plan['newGameFiles'][0]['source']=str(bad)
refused('modified-staged-SHVDNE',manager.preflight)
manager.plan['newGameFiles'][0]['source']=original_source;bad.unlink()
original_destination=manager.plan['newGameFiles'][-1]['destination'];manager.plan['newGameFiles'][-1]['destination']=str(manager.game/'wrong.ini')
refused('unapproved-destination-layout-substitution',manager.preflight)
manager.plan['newGameFiles'][-1]['destination']=original_destination
usage=m.shutil.disk_usage
class NoSpace: free=0
m.shutil.disk_usage=lambda _:NoSpace()
refused('insufficient-space',manager.preflight);m.shutil.disk_usage=usage
refused('fixture-cannot-use-real-game-root',lambda:m.Installation(Path(manager.plan['gameRoot'])))
assert inventory()==before
passed('negative-preflights-preserve-complete-fixture-baseline')
manager.install()
passed('nine-game-plus-three-OBS-install-with-unchanged-full-shadow')
ini=manager.game/'scripts/RichAudio.GateAPrivate03.Shvdne.ini';good=ini.read_bytes();ini.write_bytes(b'AUTHORED CORRUPTION')
actions=m.sha(manager.e/'actions.jsonl')
refused('modified-installed-target-refuses-restoration-before-mutation',manager.restore)
assert not (manager.e/'after').exists() and m.sha(manager.e/'actions.jsonl')==actions;ini.write_bytes(good)
backups=m.read(manager.e/'backups.json');backup=Path(backups[0]['backup']);good=backup.read_bytes();backup.write_bytes(b'AUTHORED CORRUPT BACKUP')
refused('corrupt-backup-refuses-restoration-before-mutation',manager.restore)
assert not (manager.e/'after').exists();backup.write_bytes(good)
readonly=manager.game/'xinput1_4.dll';good=readonly.read_bytes();readonly.write_bytes(good[:-1]+bytes([good[-1]^1]))
refused('XInput-readonly-drift-refuses-restoration-before-mutation',manager.restore)
assert not (manager.e/'after').exists();readonly.write_bytes(good)
(manager.game/'ScriptHookVDotNet.log').write_text('AUTHORED runtime log')
evidence=manager.game/'scripts/RichAudio.GateAPrivate03.Evidence';evidence.mkdir();(evidence/('session-'+'a'*32+'.log')).write_text('AUTHORED journal')
profile=manager.obs/'basic/profiles/GateAPrivate03Live01/basic.ini';profile.write_text(profile.read_text()+'\n; AUTHORED runtime change\n')
(manager.obs/'logs').mkdir(exist_ok=True);(manager.obs/'logs/2026-11-12 23-59-59.txt').write_text('AUTHORED OBS log')
manager.restore();assert manager.verify() and inventory()==before
passed('exact-game-OBS-external-log-XInput-DInput-inventory-restored-and-evidence-retained')
extra=manager.game/'arbitrary.dll';extra.write_bytes(b'AUTHORED extra')
refused('post-restoration-independent-verify-refuses-extra-root-DLL',manager.verify);extra.unlink()
result=subprocess.run([sys.executable,'-B',str(R/'tools/native-control/private-profile03b/Manage-Installation.py'),'install'],capture_output=True,text=True)
assert result.returncode!=0 and 'Fresh explicit user approval' in result.stderr and not (P/'execution-01').exists()
passed('live-installer-refuses-without-new-explicit-manifest-approval')
result=subprocess.run([sys.executable,'-B',str(R/'tools/native-control/private-profile03b/Manage-Installation.py'),'install','--approved-manifest-sha256','37ed3488d15c037f79b919ac8ce8b00e0d869d0c891407e2116211125af51338'],capture_output=True,text=True)
assert result.returncode!=0 and not (P/'execution-01').exists()
passed('consumed-PRIVATE03-digest-cannot-install-03B')
with (P/'installation-fixtures.json').open('x',encoding='utf-8') as f:
    json.dump(dict(passed=True,count=len(cases),cases=cases,completeShadowBytes=3122239488,fixtureRoot=str(root),realGameWritten=False,realObsWritten=False,originalInventoryRestored=True,gameOrObsLaunched=False),f,indent=2)
print('PASS '+str(len(cases))+' PRIVATE03B regression cases')
