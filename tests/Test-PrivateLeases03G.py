from pathlib import Path
import sys,json,uuid,time
sys.path.insert(0,str(Path(__file__).resolve().parent));sys.dont_write_bytecode=True
from PrivateEvidenceFixture03G import *
import BaselineReview as b
setup();checks=[];f=Fixture('actual-native-leases')
def denied(path,name):
    before=tc.pin(path)
    try:
        with Path(path).open('r+b'):pass
    except PermissionError:assert tc.pin(path)==before;checks.append(name)
    else:raise AssertionError('Writable leased input: '+name)
def mutation(f,r,row):
    denied(ROOT/'tools/native-control/private-profile03g/MarkerBatch.mjs','runtime-source-write-denied')
    denied(PACKAGE/'qualification-manifest.json','manifest-write-denied')
    denied(PACKAGE/'toolchain-manifest.json','contract-write-denied')
    denied(Path(r['windows']['A']['source']),'recording-write-denied')
    denied(Path(row['output'])/'A.wav','decoded-PCM-write-denied')
    leases=[p for p in (PACKAGE/'runtime-leases').glob('*.json') if not p.name.endswith('.closed.json')]
    active=max(leases,key=lambda p:p.stat().st_mtime_ns);denied(active,'parent-handoff-write-denied')
try:
    result=run_session(f,PACKAGE/'fixtures/media/retained-keyed-30s.mkv',mutate=mutation,manual_ack_delay=0)
    assert result['exitCode']==0,result;checks.append('complete-native-parent-leased-transaction')
    output=Path(result['request']['output']);assert b.acceptance_current(output,f.session,offline_fixture=True);checks.append('durable-probe-ack-receipt-current')
    assert not b.acceptance_current(output,f.session);checks.append('offline-receipt-cannot-admit-live-review')
    assert not b.acceptance_current(output,f.session,now=10**30,offline_fixture=True);checks.append('completed-receipt-still-expires')
    # Opening without writing proves all leases released after normal closure.
    with (ROOT/'tools/native-control/private-profile03g/MarkerBatch.mjs').open('r+b'):pass
    with Path(result['request']['windows']['A']['source']).open('r+b'):pass
    checks.append('source-and-recording-leases-released-on-normal-exit')
finally:f.close()
T=PACKAGE/'fixtures'/('status-stress-'+uuid.uuid4().hex);T.mkdir();f=Fixture('atomic-status-stress')
try:
    r=f.request(PACKAGE/'fixtures/media/retained-keyed-30s.mkv');guard=b.Supervision(r,PACKAGE/'fixtures')
    try:
        for _ in range(1200):guard.last=0;guard.check();time.sleep(.001)
        checks.append('1200-real-atomic-status-reads-without-reader-race')
        transient=guard.transient_status_reads
    finally:guard.close()
finally:f.close()
save(T/'result.json',dict(passed=True,count=len(checks),checks=checks,transientStatusReads=transient,supervisorUnchanged=True))
print(json.dumps(dict(passed=True,count=len(checks),checks=checks,transientReads=len(transient))))
