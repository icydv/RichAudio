"""Exact directory ownership: preserve existing empty OBS directories and unknowns."""
from pathlib import Path
import sys,json,hashlib,re
sys.dont_write_bytecode=True
import InstallationFixture03C as fixture
R=fixture.R;P=fixture.ROOT;cases=[];run=sys.argv[1] if len(sys.argv)>1 else 'd1';assert re.fullmatch('[a-z0-9]{1,8}',run)
module=fixture.load('directory03c',R/'tools/native-control/private-profile03c/Manage-Installation.py')
manager=fixture.package(run+'-dirs-preserve',module)
profile=manager.obs/'basic/profiles/GateAPrivate03CLive01';profile.mkdir(parents=True)
unrelated=manager.obs/'unrelated-GateAPrivate03CLive01-empty';unrelated.mkdir()
baseline=fixture.inventory(manager);directories=fixture.directories(manager)
manager.install();manager.restore();assert manager.verify() and fixture.inventory(manager)==baseline and fixture.directories(manager)==directories
assert profile.is_dir() and unrelated.is_dir()
cases.append('preexisting-empty-destination-profile-directory-preserved')
cases.append('preexisting-unrelated-matching-name-directory-preserved')
manager.restore();assert fixture.directories(manager)==directories
cases.append('idempotent-restoration-preserves-exact-directory-inventory')
for variant in ['unknown-game','unknown-OBS']:
    module=fixture.load('directory03c_'+variant,R/'tools/native-control/private-profile03c/Manage-Installation.py')
    manager=fixture.package(run+'-dirs-'+variant,module);manager.install()
    unknown=manager.game/'scripts/unknown-empty' if variant=='unknown-game' else manager.obs/'unknown-GateAPrivate03CLive01-empty'
    unknown.mkdir();before=fixture.directories(manager)
    try:manager.restore()
    except AssertionError:pass
    else:raise AssertionError('Unknown directory accepted')
    assert unknown.is_dir() and fixture.directories(manager)==before and not (manager.e/'restoration.json').exists()
    cases.append(variant+'-empty-directory-preserved-without-success-claim')
fixture.save(P/('directory-fixtures-'+run+'.json'),dict(passed=True,count=len(cases),cases=cases,managerSha256=hashlib.sha256((R/'tools/native-control/private-profile03c/Manage-Installation.py').read_bytes()).hexdigest(),scope='Exact owned-directory checks on authored disposable roots, no game/OBS writes or processes',gameWritten=False,obsWritten=False,gameLaunched=False))
print('PASS '+str(len(cases))+' exact-directory ownership cases')
