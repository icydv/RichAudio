"""Replay retained lifecycle and transaction assertions in new disposable roots."""
from pathlib import Path
import sys,json,subprocess,uuid
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];P=R/'.local/gate-a-shvdne-private-03f';S=R/'tools/native-control/private-profile03f'
sys.path.insert(0,str(S));sys.path.insert(0,str(R/'tests'))
import Toolchain as tc
import Context
c=tc.load(sys.argv[1]);Context.configure(c,True)
run=sys.argv[2];binary=Path(c['programs']['supervisor']['path'])
scope=P/'fixtures'/('supervisor-'+run);scope.mkdir(parents=True)
harness=R/'.local/gate-a-shvdne-private-03d/tests-review/Disposable03D.exe'
result=subprocess.run([str(harness),str(scope),str(binary)],capture_output=True,text=True,timeout=45)
tc.save(scope/'output.json',dict(exitCode=result.returncode,stdout=result.stdout,stderr=result.stderr));assert result.returncode==0,result.stderr
for kind in ['Watcher','Admission']:
    path=R/'tests'/('Test-Private'+kind+'03D.py')
    source=path.read_text().replace("R/'.local/gate-a-shvdne-private-03d'","R/'.local/gate-a-shvdne-private-03f/fixtures'")
    # Invoke the real unchanged watcher using only admitted executable paths.
    if kind=='Watcher':
        source=source.replace("run=sys.argv[1];T=", "w.subprocess=Context.processes\nrun=sys.argv[1];T=")
    sys.argv=[str(path),run,str(binary)]
    exec(compile(source,str(path)+' [03F disposable output]','exec'),dict(__file__=str(path),__name__='__main__',Context=Context))
import InstallationFixture03C as fixture
fixture.ROOT=P/'fixtures'/('installation-'+run)
for name in ['Transactions','Prefix','ObsRecovery','Directories','FullInstall']:
    path=R/'tests'/('Test-Private'+name+'03C.py')
    source=path.read_text().replace('tools/native-control/private-profile03c/Manage-Installation.py','tools/native-control/private-profile03f/Manage-Installation.py').replace('.local/gate-a-shvdne-private-03c','.local/gate-a-shvdne-private-03f').replace('full-shadow-01','full-shadow-'+run).replace('full-install-restoration.json','full-install-restoration-'+run+'.json')
    sys.argv=[str(path),run]
    exec(compile(source,str(path)+' [03F wrapper and disposable output]','exec'),dict(__file__=str(path),__name__='__main__'))
print('PASS retained supervisor/watcher/transaction assertions; unchanged production binaries')
