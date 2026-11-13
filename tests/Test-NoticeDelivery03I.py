"""Bounded disposable-process regressions; synthetic envelopes are not UI clicks."""
from pathlib import Path
import sys,json,time,threading,uuid
sys.path.insert(0,str(Path(__file__).resolve().parent))
from PrivateNoticeFixture03I import drive,P

def run(mode,fault=None,exit_delay=7,synthetic=True):
    root=P/'fixtures'/('regression-'+uuid.uuid4().hex)
    binary=P/'fixtures/build-06/RichAudio.Private03D.Supervisor.exe'
    errors=[]
    def worker():
        try:drive(root,mode,binary,fault,exit_delay,False,False,synthetic)
        except BaseException as e:errors.append(repr(e))
    thread=threading.Thread(target=worker);thread.start()
    deadline=time.monotonic()+20
    while not (root/'waiting.json').exists():assert time.monotonic()<deadline and not errors;time.sleep(.02)
    (root/'launch').touch()
    if mode=='normal':
        while not (root/'started.json').exists():assert time.monotonic()<deadline;time.sleep(.02)
        (root/'arm').touch()
    thread.join(100);assert not thread.is_alive() and not errors,errors
    data=json.loads((root/'result.json').read_text());trace=data['trace'];kinds=[x['kind'] for x in trace]
    assert data['error'] is None and data['normalTargetClosure'] and data['monitorClosed'],data
    assert 'button-handler-entered' not in kinds,'Synthetic fixture must not claim a click'
    accepts=[x for x in trace if x['kind']=='monitor-acceptance-observed']
    expected=fault in [None,'duplicate'] and synthetic
    assert bool(accepts)==expected,(mode,fault,kinds)
    if expected:
        origin=next(x['detail']['originQpc'] for x in trace if x['kind']=='acknowledgment-window-opened')
        assert len(accepts)==1 and 0<(accepts[0]['detail']['acceptedAtQpc']-origin)/accepts[0]['frequency']<5
    if fault=='duplicate':assert any(x['kind']=='acknowledgment-rejected' and x['detail']['reason']=='duplicate-acknowledgment' for x in trace)
    if fault in ['wrong-session','wrong-notice','wrong-generation','malformed-message']:
        assert any(x['kind']=='identity-verification' and not x['detail']['valid'] for x in trace)
    if fault=='receiver-closed':assert 'transmission-failed' in kinds
    if fault in ['slow-persistence','missing-response','malformed-response','delayed-receiver']:
        assert any(x['kind']=='acknowledgment-rejected' for x in trace)
    if fault=='unexpected-exit':assert data['monitorExitCode']==23
    if exit_delay>60:
        assert any(x['kind']=='normal-exit-deadline-violation' for x in data['events'])
    return dict(path=str(root/'result.json'),mode=mode,fault=fault,passed=True,actualUi=False,exitDelay=exit_delay)

if __name__=='__main__':
    results=[]
    for mode in ['normal','stop-only']:
        results.append(run(mode,None,1.5))
    for fault in ['wrong-session','wrong-notice','wrong-generation','malformed-message','receiver-closed','duplicate','delayed-receiver','slow-persistence','missing-response','malformed-response','closed-stdin','unexpected-exit']:
        results.append(run('stop-only',fault))
    results.append(run('stop-only',None,7,False))
    results.append(run('stop-only',None,60.3))
    path=P/'fixtures'/('delivery-regressions-'+uuid.uuid4().hex+'.json')
    path.write_text(json.dumps(dict(passed=True,cases=results,humanHandoffQualified=False),indent=2))
    print(path)
