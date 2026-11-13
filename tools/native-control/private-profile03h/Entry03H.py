from pathlib import Path
import sys,argparse,json,time
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).resolve().parent))
from Shared import tc,ROOT,PACKAGE,Context,configure,load
def main():
    parser=argparse.ArgumentParser();parser.add_argument('operation',choices=['rehearse','notice-rehearsal','evidence-session','preflight','install','restore','verify','watch','chain-check','extract','marker']);parser.add_argument('--manifest-sha256',required=True);parser.add_argument('--toolchain-sha256',required=True);parser.add_argument('--qualification',action='store_true');parser.add_argument('--session',action='store_true');parser.add_argument('--request',type=Path);parser.add_argument('--notice-mode',choices=['normal','stop-only']);a,rest=parser.parse_known_args();timings={}
    assert (a.operation=='rehearse')==a.qualification,'Rehearsal and live modes cannot be substituted'
    t=time.monotonic();c=tc.load(a.toolchain_sha256);timings['python-toolchain-point-of-use']=time.monotonic()-t;t=time.monotonic();tc.startup(c);timings['powershell-startup']=time.monotonic()-t
    admission=configure(c,a.qualification)
    if a.qualification:
        assert a.operation=='rehearse';m=tc.read(PACKAGE/'qualification-manifest.json');assert tc.sha(PACKAGE/'qualification-manifest.json')==a.manifest_sha256 and m['qualificationOnly'];lease=admission.parent_lease(a.manifest_sha256,m)
        if m.get('gitPolicyRequired'):assert admission.provenance()['head']==m['head']
    else:m=admission.verify(a.manifest_sha256);lease=admission.parent_lease(a.manifest_sha256,m)
    timings['native']=lease['timings'];print(json.dumps(dict(event='admission-complete',timings=timings)),flush=True)
    def checkpoint():
        if a.qualification:
            admission.parent_lease(a.manifest_sha256,m)
            if m.get('gitPolicyRequired'):assert admission.provenance()['head']==m['head']
        else:admission.verify(a.manifest_sha256)
    if a.operation=='extract':return load('extract_g',ROOT/'tools/native-control/private-profile03f/Extract-Capture.py').main(rest)
    if a.operation=='marker':return Context.processes.run(['node',str(ROOT/'tools/native-control/private-profile03c/ResourceProof03C.mjs'),*rest]).returncode
    assert not rest
    if a.operation=='notice-rehearsal':
        assert a.notice_mode is not None and not (PACKAGE/'execution-01').exists(),'Pre-install notice gate only'
        intent=PACKAGE/'live-01';intent.mkdir(exist_ok=True)
        tc.save(intent/('rehearsal-'+a.notice_mode+'-intent.json'),dict(manifestSha256=a.manifest_sha256,liveSession=m['session'],mode=a.notice_mode,oneUse=True,scope='Direct user gate; no fixture retry'))
        from NoticeFixture import run
        result=run(a.notice_mode,show_ui=True,synthetic_ack=False)
        tc.save(intent/('rehearsal-'+a.notice_mode+'.json'),result)
        assert result['passed'] and result['actualDirectUserGateQualified'],'Direct handoff failed; no installation or launch'
        return 0
    if a.operation=='evidence-session' or (a.operation=='rehearse' and a.session):
        assert a.request is not None and a.request.is_relative_to(PACKAGE/('fixtures' if a.qualification else 'execution-01'))
        from EvidenceSession import run
        return run(tc.read(a.request),a.qualification,a.manifest_sha256,checkpoint)
    if a.operation=='rehearse':
        assert a.request is not None;allowed=PACKAGE/('fixtures' if a.qualification else 'execution-01');assert a.request.absolute().is_relative_to(allowed)
        from BaselineReview import Transaction
        return Transaction(tc.read(a.request),a.qualification,checkpoint=checkpoint).run()
    if a.operation in ['preflight','install','chain-check']:
        from MetadataQuery import query
        import os
        own=query(c['programs']['supervisor']['path'],'--identity',os.getpid())
        assert own['ProcessId']==os.getpid() and own['Sha256']==c['programs']['python']['sha256'] and own['FileIdentity']==c['programs']['python']['fileIdentity']
        chain=load('chain_g',ROOT/'tools/native-control/private-profile03f/Check-ExecutionChain.py');chain.main(c,{},[])
        if a.operation=='chain-check':return 0
    if a.operation=='watch':return 0 if load('watch_g',ROOT/'tools/native-control/private-profile03h/Watch-AuthorizedGame.py').main(a.manifest_sha256) else 3
    if a.operation in ['restore','verify']:admission.evidence_worker_closed()
    module=load('manager_g',ROOT/'tools/native-control/private-profile03f/Manage-Installation.py');module.operate(a.operation,a.manifest_sha256);print('PASS PRIVATE03H '+a.operation);return 0
if __name__=='__main__':
    try:result=main()
    except Exception as error:
        import traceback
        traceback.print_exc();sys.exit(3)
    else:sys.exit(result)
