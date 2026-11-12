"""Small authored filesystem fixtures for the actual installation managers.

These fixtures exercise transaction behavior, not GTA resource compatibility.
Every mutable file is beneath a fresh PRIVATE03C disposable package root.
"""
from pathlib import Path
import json,hashlib,copy,importlib.util,sys
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1]
ROOT=R/'.local/gate-a-shvdne-private-03c/install-supervision'

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
def sha_bytes(value):return hashlib.sha256(value).hexdigest()
def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('x',encoding='utf-8') as file:json.dump(value,file,indent=2)

def package(name,module,case='case'):
    scope=ROOT/'mock-packages'/name
    assert not scope.exists();scope.mkdir(parents=True)
    plan=json.loads((R/'.local/gate-a-shvdne-private-03b/deployment-plan.json').read_text())
    contract=json.loads((R/'.local/gate-a-shvdne-private-03b/loader-contract.json').read_text())
    oldgame=Path(plan['gameRoot']);oldobs=Path(plan['obsRoot']);game=scope/'origin-game';obs=scope/'origin-obs'
    def mapped(path):
        q=Path(path)
        if q.is_relative_to(oldgame):return game/q.relative_to(oldgame)
        if q.is_relative_to(oldobs):return obs/q.relative_to(oldobs)
        # Logical external origin only; old.mapped places its bytes beneath the bounded fixture.
        # Keep this path short so the retained external mapping does not double the package path.
        return Path(r'C:\Fixture03CExternal')/sha_bytes(str(q).encode())[:12]/q.name
    originals={}
    for x in plan['protectedGame']+plan['originalObs']:
        payload=('AUTHORED BASELINE '+str(mapped(x['path']))).encode()
        originals[x['path']]=dict(path=str(mapped(x['path'])),bytes=len(payload),sha256=sha_bytes(payload),payload=payload)
    for group in ['protectedGame','originalObs','backupOriginals','readOnlyOriginals','park']:
        plan[group]=[{k:originals[x['path']][k] for k in ['path','bytes','sha256']} for x in plan[group]]
    for index,x in enumerate(plan['newGameFiles']+plan['obsFiles']):
        if hasattr(module,'base'):
            x['destination']=x['destination'].replace('RichAudio.GateAPrivate03.','RichAudio.GateAPrivate03C.').replace('GateAPrivate03Live01','GateAPrivate03CLive01')
        source=scope/'staged'/('%02d-'%index+Path(x['destination']).name)
        source.parent.mkdir(exist_ok=True)
        payload=('AUTHORED STAGED '+str(index)+'\n').encode()+bytes(range(256))*16
        source.write_bytes(payload)
        x.update(source=str(source),destination=str(mapped(x['destination'])),bytes=len(payload),sha256=sha_bytes(payload))
    plan.update(gameRoot=str(game),obsRoot=str(obs),newGameBytes=sum(x['bytes'] for x in plan['newGameFiles']))
    plan['minimumGameDriveFreeBytes']=plan['newGameBytes']+536870912
    plan['backupBytes']=sum(x['bytes'] for x in plan['backupOriginals'])
    plan['reserveRecoveryArchiveBytes']=max(x['bytes'] for x in plan['newGameFiles']+plan['obsFiles'])+max(x['bytes'] for x in plan['backupOriginals'])
    rootpins={Path(x['path']).name.casefold():x for x in plan['protectedGame'] if Path(x['path']).parent==game and Path(x['path']).suffix.casefold() in ['.dll','.asi']}
    contract['rootBinaries']=[rootpins[Path(x['path']).name.casefold()] for x in contract['rootBinaries']]
    contract['approvedDestinations']=[dict(destination=x['destination']) for x in plan['newGameFiles']+plan['obsFiles']]
    contract['nativeImportCandidates']=[]
    save(scope/'deployment-plan.json',plan);save(scope/'loader-contract.json',contract)
    # Redirect this isolated imported module instance, never the sealed sources or real roots.
    module.P=scope
    base=getattr(module,'base',module)
    base.P=scope;base.old.P=scope
    manager=module.Installation(scope/'installer-fixtures'/case)
    manager.game.mkdir(parents=True);manager.obs.mkdir(parents=True)
    for item in originals.values():
        destination=manager.mapped(item['path']);destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(item['payload'])
    return manager

def inventory(manager):
    return {str(path.relative_to(manager.scope)):hashlib.sha256(path.read_bytes()).hexdigest() for path in manager.scope.rglob('*') if path.is_file() and 'execution' not in path.relative_to(manager.scope).parts}

def directories(manager):
    return {str(path.relative_to(manager.scope)) for path in manager.scope.rglob('*') if path.is_dir() and 'execution' not in path.relative_to(manager.scope).parts}
