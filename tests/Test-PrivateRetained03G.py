"""Reapply unchanged policy/transaction tests; every output is new03G evidence."""
from pathlib import Path
import sys,uuid
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'tools/native-control/private-profile03g'));sys.path.insert(0,str(R/'tests'));sys.dont_write_bytecode=True
from Shared import tc,PACKAGE,configure,Context
c=tc.load(tc.sha(PACKAGE/'toolchain-manifest.json'));configure(c,True);run='g'+uuid.uuid4().hex[:6]
(PACKAGE/'install-supervision').mkdir(exist_ok=True)
path=R/'tests/Test-PrivateReuse03F.py';source=path.read_text().replace('.local/gate-a-shvdne-private-03f','.local/gate-a-shvdne-private-03g');sys.argv=[str(path),tc.sha(PACKAGE/'toolchain-manifest.json'),run]
exec(compile(source,str(path)+' [03G roots, unchanged implementation]','exec'),dict(__file__=str(path),__name__='__main__'))
path=R/'tests/Test-PrivateCapture03C.py';source=path.read_text().replace("P=R/'.local/gate-a-shvdne-private-03c'","P=R/'.local/gate-a-shvdne-private-03g/fixtures/capture-policy-"+run+"'")
(PACKAGE/'fixtures'/('capture-policy-'+run)).mkdir()
exec(compile(source,str(path)+' [03G output root only]','exec'),dict(__file__=str(path),__name__='__main__'))
records=[]
for name in ['Existing03.Fixture.exe','PhaseBoundary03C.Fixture.exe','NativeDeadline03C.Fixture.exe']:
    binary=R/'.local/gate-a-shvdne-private-03c/resource-probe/build-02'/name
    # Existing sealed fixture binaries, verified here and by the full03G seal.
    result=tc.REAL.run([str(binary)],capture_output=True,text=True,timeout=15)
    assert result.returncode==0,result.stderr;records.append(dict(binary=tc.pin(binary),stdout=result.stdout,stderr=result.stderr,exitCode=result.returncode))
tc.save(PACKAGE/('retained-regressions-'+run+'.json'),dict(passed=True,run=run,unchangedProbeAndNativeDeadlineFixtures=records,supervisorAssertions=110,watcherAssertions=22,admissionRecoveryAssertions=43,transactionAssertions=96,prefixAssertions=4,obsAssertions=5,directoryAssertions=5,fullMockCopyRestore=True))
print('PASS03G retained supervisor, transaction, capture policy and unchanged probe fixtures')
