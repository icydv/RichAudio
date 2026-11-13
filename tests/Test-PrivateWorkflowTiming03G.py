"""Whole sealed-command shape, explicit reserves, owned supervision and closure."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from PrivateEvidenceFixture03G import *
import statistics
setup();T=PACKAGE/'timing-rehearsals';T.mkdir(exist_ok=True);records=[]
# AB then reversed order, larger captures, and a repeated worst-size run. Full
# capture/review wall waits are used on first/last; others retain explicit budgets.
cases=[(30,False,30,18),(60,True,0,0),(89,False,0,0),(89,True,0,0),(60,False,0,0),(30,True,30,18)]
for duration,reverse,capture_wait,review_wait in cases:
    f=Fixture('timing-'+str(duration))
    try:
        result=run_session(f,PACKAGE/('fixtures/media/retained-keyed-'+str(duration)+'s.mkv'),capture_wait,review_wait,reverse)
        assert result['exitCode']==0,result
        result['probeManualF10AndDurableAckReserveSeconds']=5
        result['fullBaselineBudgetSeconds']=result['budgetedGateSeconds']+5
        result['marginTo80Seconds']=80-result['fullBaselineBudgetSeconds'];assert result['marginTo80Seconds']>=10,result
        records.append(result);print(json.dumps(dict(duration=duration,reverse=reverse,automatedSeconds=result['automatedCriticalSeconds'],fullBudgetSeconds=result['fullBaselineBudgetSeconds'],marginSeconds=result['marginTo80Seconds'])),flush=True)
    finally:f.close()
summary=dict(passed=True,cases=len(records),records=records,worstAutomatedSeconds=max(x['automatedCriticalSeconds'] for x in records),worstFullBaselineBudgetSeconds=max(x['fullBaselineBudgetSeconds'] for x in records),minimumMarginSeconds=min(x['marginTo80Seconds'] for x in records),captureReserveSeconds=30,independentReviewReserveSeconds=20,manualF10AndDurabilityReserveSeconds=5,actualHumanTimingDemonstrated=False,gameContentionDemonstrated=False)
save(T/('timing-'+uuid.uuid4().hex+'.json'),summary);print(json.dumps(dict(passed=True,worstBudgetSeconds=summary['worstFullBaselineBudgetSeconds'],minimumMarginSeconds=summary['minimumMarginSeconds'])))
