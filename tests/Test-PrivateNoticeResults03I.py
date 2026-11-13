"""Read native evidence for actual visible-button actions, including failed actions."""
from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[1];P=R/'.local/gate-a-shvdne-private-03i';T=P/'fixtures'
expected={'final06-normal-01':True,'final06-normal-03':True,'final06-normal-04':True,'final06-stop-01':True,'final06-stop-02':True,'final06-near-01':True,'final06-late-01':False,'final06-no-click':False,'final06-close-01':False,'final06-input-closed':True,'final06-cold-01':False}
rows=[]
for name,accept in expected.items():
    path=T/name/'result.json';d=json.loads(path.read_text());trace=d['trace'];assert d['error'] is None and d['monitorClosed'] and d['normalTargetClosure'] and d['actualUi'] and not d['humanHandoffQualified'],name
    opened=next(x for x in trace if x['kind']=='acknowledgment-window-opened');origin=opened['detail']['originQpc'];freq=opened['frequency'];kinds=[x['kind'] for x in trace]
    accepted=[x for x in trace if x['kind']=='monitor-acceptance-observed'];assert bool(accepted)==accept,name
    handlers=[x for x in trace if x['kind']=='button-handler-entered']
    def elapsed(kind):return [(x['qpc']-origin)/freq for x in trace if x['kind']==kind]
    if accept:
        assert handlers and (T/name/'action.json').exists(),name
        assert all(0<(x['detail']['durableAtQpc']-origin)/freq<5 and 0<(x['detail']['acceptedAtQpc']-origin)/freq<5 for x in accepted),name
        assert len(accepted)==1
    if name.endswith('near-01'):assert 4<elapsed('monitor-acceptance-observed')[0]<5
    if name.endswith('late-01'):assert handlers and elapsed('button-handler-entered')[0]>5 and 'acknowledgment-rejected' in kinds
    if name.endswith('input-closed'):assert 'control-input-closed' in kinds and accept
    if name.endswith('no-click') or name.endswith('close-01'):assert not handlers and elapsed('target-exit-observed')[0]<5 and 'deadline-expired' in kinds
    # The cold attempt had no handler event. Its UI automation call failed;
    # this must remain failed evidence, not a fabricated delivered/late click.
    if name.endswith('cold-01'):assert not handlers and 'deadline-expired' in kinds
    ready=next((x['qpc'] for x in trace if x['kind']=='ui-ready'),None);started=trace[0]['qpc']
    rows.append(dict(case=name,accepted=accept,stagedInducedFailure=d['stagedInducedFailure'],handlerSeconds=elapsed('button-handler-entered'),queuedSeconds=elapsed('transmission-completed'),durableSeconds=[(x['detail']['durableAtQpc']-origin)/freq for x in accepted],monitorSeconds=elapsed('monitor-acceptance-observed'),targetExitSeconds=elapsed('target-exit-observed'),retirementSeconds=elapsed('notice-retirement-completed'),windowReadyFromProcessRecordSeconds=(ready-started)/freq if ready else None,rejections=[x['detail']['reason'] for x in trace if x['kind']=='acknowledgment-rejected'],evidence=dict(path=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest())))
output=P/'visible-ui-qualification.json';assert not output.exists();output.write_text(json.dumps(dict(passed=True,cases=rows,actualVisibleButtonPath=True,automatedOnly=True,humanHandoffQualified=False,coldAttempt='No handler; automation reported foreground window did not report a process id',historicalClickCause='UNPROVEN'),indent=2));print(output)
