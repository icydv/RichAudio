"""Reuse retained transaction regressions on the versioned03D entry point.

The source tests are read, never modified. All outputs are redirected to03D.
The full run copies original files into disposable roots before any mutation.
"""
from pathlib import Path
import json,sys
sys.dont_write_bytecode=True
import InstallationFixture03C as fixture
R=fixture.R;P=R/'.local/gate-a-shvdne-private-03d'
sys.path.insert(0,str(R/'tools/native-control/private-profile03d'))
fixture.ROOT=P/'install-supervision'
run=sys.argv[1]
for name in (['FullInstall'] if '--full-only' in sys.argv else ['Transactions','Prefix','ObsRecovery','Directories','FullInstall']):
    path=R/'tests'/('Test-Private'+name+'03C.py')
    source=path.read_text().replace('tools/native-control/private-profile03c/Manage-Installation.py','tools/native-control/private-profile03d/Manage-Installation.py').replace('.local/gate-a-shvdne-private-03c','.local/gate-a-shvdne-private-03d')
    source=source.replace('full-shadow-01','full-shadow-'+run)
    source=source.replace('full-install-restoration.json','full-install-restoration-'+run+'.json')
    sys.argv=[str(path),run]
    exec(compile(source,str(path)+' [03D redirection]','exec'),{'__file__':str(path),'__name__':'__main__'})
print('PASS03D inherited transaction, prefix, OBS, directory and full-shadow suites')
