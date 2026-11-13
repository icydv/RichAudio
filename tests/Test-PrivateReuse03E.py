"""Reuse byte-identical03D supervisor/watcher and retained lifecycle tests."""
from pathlib import Path
import sys,subprocess,json
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];P=R/'.local/gate-a-shvdne-private-03e';D=R/'.local/gate-a-shvdne-private-03d';run=sys.argv[1]
binary=D/'build-review/RichAudio.Private03D.Supervisor.exe'
scope=P/('supervisor-reuse-'+run);scope.mkdir()
result=subprocess.run([str(D/'tests-review/Disposable03D.exe'),str(scope),str(binary)],capture_output=True,text=True,timeout=40)
(scope/'output.json').write_text(json.dumps(dict(exitCode=result.returncode,stdout=result.stdout,stderr=result.stderr),indent=2));assert result.returncode==0,result.stderr
for kind in ['Watcher','Admission']:
    path=R/'tests'/('Test-Private'+kind+'03D.py')
    source=path.read_text().replace("R/'.local/gate-a-shvdne-private-03d'","R/'.local/gate-a-shvdne-private-03e'")
    sys.argv=[str(path),run,str(binary)]
    exec(compile(source,str(path)+' [03E output redirection]','exec'),{'__file__':str(path),'__name__':'__main__'})
print('PASS unchanged03D supervisor/watcher lifecycle replay; no supervisor rebuilt')
