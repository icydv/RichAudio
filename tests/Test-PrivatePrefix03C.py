"""Demonstrate actual interrupted multi-block copies and proof-bound prefix recovery."""
from pathlib import Path
import sys,json,hashlib,re
sys.dont_write_bytecode=True
import InstallationFixture03C as fixture
R=fixture.R;P=fixture.ROOT;cases=[];run=sys.argv[1] if len(sys.argv)>1 else 'p1';assert re.fullmatch('[a-z0-9]{1,8}',run)
for variant in ['exact-prefix','changed-prefix']:
    module=fixture.load('prefix03c_'+variant,R/'tools/native-control/private-profile03c/Manage-Installation.py')
    manager=fixture.package(run+'-prefix-'+variant,module);baseline=fixture.inventory(manager)
    item=manager.plan['newGameFiles'][0];source=Path(item['source']);source.write_bytes(source.read_bytes()*600)
    item.update(bytes=source.stat().st_size,sha256=module.sha(source))
    manager.plan['reserveRecoveryArchiveBytes']=max(x['bytes'] for x in manager.plan['newGameFiles']+manager.plan['obsFiles'])+max(x['bytes'] for x in manager.plan['backupOriginals'])
    (module.P/'deployment-plan.json').write_text(json.dumps(manager.plan))
    target=manager.mapped(item['destination']);fired=[]
    def fault(phase,path=None):
        if phase=='install-copy-chunk' and path==target and not fired:
            fired.append(True);raise OSError('AUTHORED multi-block interruption')
    manager.fault=fault
    try:manager.install()
    except OSError:pass
    else:raise AssertionError('Fault not reached')
    manager.fault=lambda *args:None
    assert fired and target.stat().st_size==1048576 and target.stat().st_size<item['bytes']
    assert manager.recorded('install:'+str(target),'created')==module.file_identity(target)
    cases.append(variant+'-has-durable-exclusive-create-identity-and-one-of-multiple-blocks')
    if variant=='exact-prefix':
        expected=module.sha(target);manager.restore();assert manager.verify() and fixture.inventory(manager)==baseline
        archives=[module.read(p)['value'] for p in (manager.e/'transaction').glob('*-archived.json')]
        found=next(x for x in archives if x['original']==str(target))
        assert found['bytes']==1048576 and found['sha256']==expected and 'archive' in found and module.sha(Path(found['archive']))==expected
        cases.append('exact-proven-partial-prefix-archived-before-removal-and-exact-baseline-restored')
    else:
        with target.open('r+b') as file:file.write(b'BAD')
        before=fixture.inventory(manager)
        try:manager.restore()
        except AssertionError:pass
        else:raise AssertionError('Changed prefix accepted')
        assert fixture.inventory(manager)==before and target.exists() and not (manager.e/'restoration.json').exists()
        cases.append('changed-partial-prefix-is-preserved-without-any-target-mutation')
fixture.save(P/('prefix-fixtures-'+run+'.json'),dict(passed=True,count=len(cases),cases=cases,managerSha256=hashlib.sha256((R/'tools/native-control/private-profile03c/Manage-Installation.py').read_bytes()).hexdigest(),scope='Actual multi-block authored mock copies; no real game/OBS files or processes',gameWritten=False,obsWritten=False,gameLaunched=False))
print('PASS '+str(len(cases))+' proof-bound multi-block prefix cases')
