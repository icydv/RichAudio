"""Create new preparation data from retained bytes; never modifies the installation."""
from pathlib import Path
import sys, json, hashlib, uuid, subprocess, importlib.util, datetime
sys.dont_write_bytecode = True
R = Path(__file__).resolve().parents[3]
P = R / '.local/gate-a-shvdne-private-03b'
OLD = R / '.local/gate-a-shvdne-private-03'


def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(1048576), b''): h.update(b)
    return h.hexdigest()
def pin(p): return dict(path=str(p), bytes=p.stat().st_size, sha256=sha(p))
def save(p, value):
    with p.open('x', encoding='utf-8') as f: json.dump(value, f, indent=2)


if __name__ == '__main__':
    P.mkdir(exist_ok=True)
    assert not (P / 'deployment-plan.json').exists()
    prior = read(OLD / 'preservation-before.json')
    old_manifest = read(OLD / 'execution-manifest.json')
    assert sha(OLD / 'execution-manifest.json') == '37ed3488d15c037f79b919ac8ce8b00e0d869d0c891407e2116211125af51338'
    for x in old_manifest['bindings']:
        assert pin(Path(x['path'])) == x, x['path']
    # Include every historical03 file, including its failed preflight closure, before any new work.
    historical03 = [pin(p) for p in sorted(OLD.rglob('*')) if p.is_file()]
    save(P / 'preservation-before.json', dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(), historical03=historical03, priorPreservation=pin(OLD / 'preservation-before.json'), head=prior['head'], rphStatus=prior['rphStatus'], rphMenu=prior['rphMenu']))
    plan = read(OLD / 'deployment-plan.json')
    G = Path(plan['gameRoot'])
    # Metadata only: reading VersionInfo does not load these DLLs/ASIs into any process.
    command = "$g=Get-Item -LiteralPath 'D:\\Games\\steamapps\\common\\Grand Theft Auto V Enhanced'; @($g.GetFiles() | Where-Object {$_.Extension -in '.dll','.asi'} | ForEach-Object {@{path=$_.FullName;fileVersion=$_.VersionInfo.FileVersion;productVersion=$_.VersionInfo.ProductVersion;productName=$_.VersionInfo.ProductName;companyName=$_.VersionInfo.CompanyName;originalFilename=$_.VersionInfo.OriginalFilename}}) | ConvertTo-Json -Depth 4"
    metadata = json.loads(subprocess.check_output(['powershell.exe', '-NoProfile', '-Command', command], text=True))
    root_pins = [dict(**pin(Path(x['path'])), identity={k:v for k,v in x.items() if k != 'path'}) for x in sorted(metadata, key=lambda x:x['path'].lower())]
    required = {'xinput1_4.dll':'a1a8bde409ed75d94a0439c37cf881bc354b13c2f8cd32e4bef3b10f308f1392', 'dinput8.dll':'9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d'}
    for name, digest in required.items(): assert next(x for x in root_pins if Path(x['path']).name.lower() == name)['sha256'] == digest
    absent = ['dsound.dll','dinput.dll','OpenIV.asi','wininet.dll','winmm.dll','dxgi.dll','version.dll','rpf.cache.disable','ScriptHookVDotNet.log','ScriptHookVDotNet.ini','scripts','mods']
    assert all(not (G / x).exists() for x in absent)
    seen = {x['path'].lower() for x in plan['protectedGame']}
    for x in root_pins:
        if x['path'].lower() not in seen:
            q = {k:x[k] for k in ('path','bytes','sha256')}
            plan['protectedGame'].append(q)
            plan['readOnlyOriginals'].append(q)
    plan['experiment'] = 'GATE-A-SHVDNE-PRIVATE-03B'
    plan['preparationRevision'] = 'loader-inventory-01'
    plan['session'] = uuid.uuid4().hex
    ini = P / 'explicit-approval-execution.ini'
    with ini.open('x', encoding='ascii', newline='\n') as f:
        f.write('Experiment=GATE-A-SHVDNE-PRIVATE-03\nEnabled=true\nSupervisorSession=' + plan['session'] + '\n')
    for x in plan['newGameFiles']:
        if Path(x['destination']).name == 'RichAudio.GateAPrivate03.Shvdne.ini':
            x.update(source=str(ini), bytes=ini.stat().st_size, sha256=sha(ini))
    capture = P / 'capture-template'
    capture.mkdir()
    for x in plan['obsFiles']:
        source = Path(x['source'])
        target = capture / source.name
        value = source.read_text(encoding='utf-8-sig').replace(str(OLD).replace('\\','\\\\'), str(P).replace('\\','\\\\'))
        with target.open('x', encoding='utf-8', newline='\n') as f: f.write(value)
        x.update(source=str(target), bytes=target.stat().st_size, sha256=sha(target))
    plan['newGameBytes'] = sum(x['bytes'] for x in plan['newGameFiles'])
    plan['minimumGameDriveFreeBytes'] = plan['newGameBytes'] + 536870912
    save(P / 'deployment-plan.json', plan)
    # Copy only operational path-bound text helpers; keep the compiled probe/supervisor/resources unchanged.
    for name in ['Watch-AuthorizedGame.py','Read-Status03.ps1','Extract-Capture03.py','capture-dependencies.json']:
        source = Path(__file__).with_name(name) if name == 'Watch-AuthorizedGame.py' else OLD/name
        with (P / name).open('x', encoding='utf-8', newline='\n') as f: f.write(source.read_text(encoding='utf-8-sig'))
    spec = importlib.util.spec_from_file_location('manager03b', R / 'tools/native-control/private-profile03b/Manage-Installation.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    windows = m.windows_prerequisites()
    assert windows['os64'] and windows['netRelease'] >= 528040 and windows['vcInstalled'] == 1
    # Read the retained parser's function definitions only; do not execute its historical output writer.
    helper = R / '.local/migration-shvdne-01/smoke-01-preparation/Inspect-NativePrerequisites.py'
    ns = {'__file__':str(helper)}
    exec(helper.read_text().split('files=')[0], ns)
    binaries = [G/'GTA5_Enhanced.exe', G/'xinput1_4.dll', G/'dinput8.dll', G/'ScriptHookV.dll']
    binaries += [Path(x['source']) for x in plan['newGameFiles'] if Path(x['destination']).suffix.lower() in ('.dll','.asi')]
    rows = [ns['pe'](p) for p in binaries]
    staged = {Path(x['destination']).name.lower():Path(x['source']) for x in plan['newGameFiles']}
    imports = []
    for row in rows:
        assert row['machine'].lower() == '0x8664' or (row['clrFlags'] is not None and row['clrFlags'] & 1 and not row['clrFlags'] & 2), row['path']
        for name in row['imports']:
            if name.lower().startswith(('api-ms-win-','ext-ms-win-')): continue
            candidates = [staged.get(name.lower()), G/name, Path(r'C:\Windows\System32')/name]
            selected = next((p for p in candidates if p and p.is_file()), None)
            assert selected, 'Missing imported candidate: ' + name
            imports.append(dict(importer=row['path'], name=name, **pin(selected)))
    save(P/'native-prerequisites.json',dict(scope='Static disk PE/import candidates only; no module-load or initialization guarantee', files=rows, imports=imports, passed=True))
    candidates = {x['path']: {k:x[k] for k in ('path','bytes','sha256')} for x in imports}
    contract = dict(schema=1, experiment=plan['experiment'], rootBinaries=root_pins, requiredAbsent=absent,
                    permittedProxyNames=['xinput1_4.dll','dinput8.dll'], windowsPrerequisites=windows,
                    nativeImportCandidates=list(candidates.values()), approvedDestinations=[dict(destination=x['destination']) for x in plan['newGameFiles']+plan['obsFiles']],
                    rolePolicy='Exact installed coexistence preserved; Enhanced XInput path supported by static imports and historical Enhanced ASI initialization. DInput presence is not proof of initialization. No runtime coexistence guarantee or removal permission.',
                    forbidUnexpectedRootDllOrAsi=True)
    save(P/'loader-contract.json',contract)
    print('Prepared 03B plan; root binaries=' + str(len(root_pins)) + '; no game/OBS writes or application launches')
