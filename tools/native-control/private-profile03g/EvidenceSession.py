"""Admit before cue, then exactly one finalized A/B batch and manual review."""
from pathlib import Path
import json,sys,time,queue,threading
from Shared import PACKAGE,tc
from DecodeWindows import qpc,frequency,save,bounded,no_links
from BaselineReview import Supervision,Transaction
def run(setup,qualification,manifest_digest,checkpoint=None):
    allowed=PACKAGE/('fixtures' if qualification else 'execution-01');root=bounded(setup['sessionEvidence'],allowed);assert not root.exists();root.mkdir(parents=True)
    if not qualification:assert root==PACKAGE/'execution-01/evidence-session','Only one fixed live evidence session'
    guard=None;inputs=queue.Queue(maxsize=4);origin=0
    def reader():
        for line in sys.stdin:
            try:inputs.put(json.loads(line))
            except ValueError:inputs.put(dict(command='invalid'))
        inputs.put(dict(command='cancel'))
    try:
        assert setup['offlineFixture']==qualification
        guard=Supervision(setup,allowed);journal=Path(setup['probeJournal']);no_links(journal)
        if qualification:bounded(journal,allowed)
        else:assert journal.parent==Path(tc.read(PACKAGE/'deployment-plan.json')['gameRoot'])/'scripts/RichAudio.GateAPrivate03C.Evidence'
        text=journal.read_text()
        assert 'dormant;' in text and 'spawn-request' not in text,'Pair already requested; no session reset'
        if not qualification:
            assert journal.parent==Path(tc.read(PACKAGE/'deployment-plan.json')['gameRoot'])/'scripts/RichAudio.GateAPrivate03C.Evidence'
        origin=qpc();freq=frequency();deadline=origin+80*freq
        if not qualification:assert origin+5*freq<=guard.status['sessionStartedQpc']+630*freq,'Insufficient time before latest pair request'
        # Creating the cue does not dispatch a game key or claim probe activation.
        cue=dict(originQpc=origin,frequency=freq,session=setup['session'],manifestSha256=manifest_digest,scope='Conservative pre-pair origin; no deadline reset')
        cue_path=root/'pair-cue.json' if qualification else PACKAGE/'execution-01/pair-cue.json';save(cue_path,cue)
        threading.Thread(target=reader,daemon=True).start()
        print(json.dumps(dict(event='ready-for-single-pair',cue=cue,deadlineQpc=deadline,assignmentPermission=False)),flush=True)
        while True:
            assert qpc()<deadline,'80-second baseline deadline expired awaiting recording';guard.check()
            try:command=inputs.get(timeout=.05);break
            except queue.Empty:pass
        assert command.get('command')=='analyse-baselines','Session cancelled or invalid command'
        request=command['request'];assert request['session']==setup['session'] and request['supervision']==setup['supervision'] and request['probeJournal']==setup['probeJournal']
        assert request['originQpc']==origin and request['frequency']==freq and request['offlineFixture']==qualification,'Cue clock/identity changed'
        save(root/'analysis-request.json',request)
        result=Transaction(request,qualification,inputs,checkpoint).run()
        save(root/'session-observations.json',dict(transientStatusReadsBeforeAnalysis=guard.transient_status_reads,deadlineQpc=deadline,clockReset=False))
        return result
    except Exception as error:
        result=dict(passed=False,eligibleForManualF10Review=False,assignmentPermission=False,error=str(error),originQpc=origin,completedQpc=qpc(),offlineFixture=qualification)
        save(root/'failure.json',result);print(json.dumps(result),flush=True);return 3
    finally:
        if guard:guard.close()
