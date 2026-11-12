"""Exercise interrupted restoration where original user.ini overlaps a new target."""
from pathlib import Path
import sys,json,hashlib,os,re
sys.dont_write_bytecode=True
import InstallationFixture03C as fixture
R=fixture.R;P=fixture.ROOT;cases=[];run=sys.argv[1] if len(sys.argv)>1 else 'o1';assert re.fullmatch('[a-z0-9]{1,8}',run)
for variant in ['created','multi-block','changed-prefix','changed-identity','changed-intent']:
    module=fixture.load('obs03c_'+variant,R/'tools/native-control/private-profile03c/Manage-Installation.py')
    manager=fixture.package(run+'-obs-'+variant,module)
    original=next(x for x in manager.plan['originalObs'] if Path(x['path']).name=='user.ini')
    target=manager.mapped(original['path']);target.write_bytes(b'AUTHORED ORIGINAL OBS SETTINGS\n'*80000)
    pin=dict(bytes=target.stat().st_size,sha256=module.sha(target))
    for group in ['originalObs','backupOriginals']:
        for item in manager.plan[group]:
            if item['path']==original['path']:item.update(pin)
    manager.plan['backupBytes']=sum(x['bytes'] for x in manager.plan['backupOriginals'])
    manager.plan['reserveRecoveryArchiveBytes']=max(x['bytes'] for x in manager.plan['newGameFiles']+manager.plan['obsFiles'])+max(x['bytes'] for x in manager.plan['backupOriginals'])
    (module.P/'deployment-plan.json').write_text(json.dumps(manager.plan))
    baseline=fixture.inventory(manager);manager.install();fired=[]
    wanted='restore-created' if variant=='created' else 'restore-copy-chunk'
    def fault(phase,path=None):
        if phase==wanted and path==target and not fired:
            fired.append(True);raise OSError('AUTHORED user.ini recovery interruption')
    manager.fault=fault
    try:manager.restore()
    except OSError:pass
    else:raise AssertionError('Fault not reached')
    manager.fault=lambda *args:None
    assert fired and target.stat().st_size<original['bytes']
    if variant in ['created','multi-block']:
        manager.restore();manager.restore();assert manager.verify() and fixture.inventory(manager)==baseline
        cases.append('overlapping-user.ini-'+variant+'-resumes-original-owned-copy-without-rearchival')
    else:
        if variant=='changed-prefix':
            with target.open('r+b') as file:file.write(b'BAD')
        elif variant=='changed-identity':
            replacement=target.with_suffix('.authored');replacement.write_bytes(target.read_bytes());os.replace(replacement,target)
        else:
            path=manager.record_path('restore:'+str(target),'intent');value=module.read(path);value['value']['sha256']='0'*64;path.write_text(json.dumps(value))
        before=fixture.inventory(manager)
        try:manager.restore()
        except AssertionError:pass
        else:raise AssertionError('Changed recovery proof accepted')
        assert fixture.inventory(manager)==before and not (manager.e/'restoration.json').exists()
        cases.append('overlapping-user.ini-'+variant+'-is-preserved-without-target-mutation')
fixture.save(P/('obs-recovery-fixtures-'+run+'.json'),dict(passed=True,count=len(cases),cases=cases,managerSha256=hashlib.sha256((R/'tools/native-control/private-profile03c/Manage-Installation.py').read_bytes()).hexdigest(),scope='Actual multi-block original OBS recovery on authored mock bytes; no real OBS/game files or processes',gameWritten=False,obsWritten=False,gameLaunched=False))
print('PASS '+str(len(cases))+' overlapping original OBS recovery cases')
