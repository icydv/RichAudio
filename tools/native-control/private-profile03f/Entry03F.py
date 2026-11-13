from pathlib import Path
import sys,argparse,json
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import Toolchain as tc
def main():
    parser=argparse.ArgumentParser();parser.add_argument('operation',choices=['chain-check','preflight','install','restore','verify','watch','extract','marker']);parser.add_argument('--toolchain-sha256',required=True);parser.add_argument('--manifest-sha256');a,rest=parser.parse_known_args()
    c=tc.load(a.toolchain_sha256);ps=tc.startup(c)
    import Context
    Context.configure(c,a.operation=='chain-check')
    if a.operation=='chain-check':
        module=Context.load('chain_check_f',Path(__file__).with_name('Check-ExecutionChain.py'));return module.main(c,ps,rest)
    from AdmissionF import verify
    verify(a.manifest_sha256)
    if a.operation in ['preflight','install']:
        # Actual non-live entry points must work before any installation intent.
        module=Context.load('admission_chain_f',Path(__file__).with_name('Check-ExecutionChain.py'))
        module.main(c,ps,[])
    if a.operation in ['preflight','install','restore','verify']:
        assert not rest
        manager=Context.load('manager_f',Path(__file__).with_name('Manage-Installation.py'));manager.operate(a.operation,a.manifest_sha256);print('PASS PRIVATE03F '+a.operation);return 0
    if a.operation=='watch':
        assert not rest
        module=Context.load('watcher_f',Path(__file__).with_name('Watch-AuthorizedGame.py'));return 0 if module.main(a.manifest_sha256) else 3
    if a.operation=='extract':return Context.load('extract_f',Path(__file__).with_name('Extract-Capture.py')).main(rest)
    if a.operation=='marker':
        return Context.processes.run(['node',str(tc.ROOT/'tools/native-control/private-profile03c/ResourceProof03C.mjs'),*rest]).returncode
    raise RuntimeError('unsupported operation')
if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        import traceback
        traceback.print_exc();sys.exit(3)
