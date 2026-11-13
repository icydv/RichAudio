"""Replay the unchanged03F runtime faults; no old native wrapper is substituted."""
from pathlib import Path
import sys
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'tools/native-control/private-profile03g'));sys.dont_write_bytecode=True
from Shared import tc,PACKAGE,configure
c=tc.load(tc.sha(PACKAGE/'toolchain-manifest.json'));configure(c,True)
path=R/'tests/Test-PrivateToolchain03F.py';source=path.read_text().split("tc=t.pin(P/'Private03F.Toolchain.exe')")[0]
sys.argv=[str(path),tc.sha(PACKAGE/'toolchain-manifest.json')]
source+="\nt.save(T/'runtime-result.json',dict(passed=True,count=len(checks),checks=checks,scope='Unchanged03F runtime-source regression replay under03G roots; native tests are separate'))\nprint('PASS',len(checks),'retained runtime checks')\n"
exec(compile(source,str(path)+' [03G runtime-only output]','exec'),dict(__file__=str(path),__name__='__main__'))
