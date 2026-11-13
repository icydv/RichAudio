"""Unchanged transaction suite applied to the new preparation wrapper/plan."""
from pathlib import Path
import sys
sys.dont_write_bytecode=True
import InstallationFixture03C as fixture
R=fixture.R;P=R/'.local/gate-a-shvdne-private-03e';fixture.ROOT=P/'install-supervision';run=sys.argv[1]
sys.path.insert(0,str(R/'tools/native-control/private-profile03e'))
for name in ['Transactions','Prefix','ObsRecovery','Directories','FullInstall']:
    path=R/'tests'/('Test-Private'+name+'03C.py')
    source=path.read_text().replace('tools/native-control/private-profile03c/Manage-Installation.py','tools/native-control/private-profile03e/Manage-Installation.py').replace('.local/gate-a-shvdne-private-03c','.local/gate-a-shvdne-private-03e').replace('full-shadow-01','full-shadow-'+run).replace('full-install-restoration.json','full-install-restoration-'+run+'.json')
    sys.argv=[str(path),run]
    exec(compile(source,str(path)+' [03E output redirection]','exec'),{'__file__':str(path),'__name__':'__main__'})
print('PASS PRIVATE03E new-plan complete installation/recovery suites')
