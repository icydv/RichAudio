"""Only read-only tools and authored disposable fixtures; never GTA or OBS."""
from pathlib import Path
import sys,os,json,uuid,ctypes,ast,wave,struct,time,threading
import Toolchain as tc
import Context
def own_modules():
    handles=(ctypes.c_void_p*1024)();needed=ctypes.c_uint();kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    enum=kernel.K32EnumProcessModules;enum.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_uint,ctypes.POINTER(ctypes.c_uint)];enum.restype=ctypes.c_int
    assert enum(ctypes.c_void_p(-1),handles,ctypes.sizeof(handles),ctypes.byref(needed)) and needed.value<=ctypes.sizeof(handles)
    name=kernel.K32GetModuleFileNameExW;name.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_wchar_p,ctypes.c_uint];name.restype=ctypes.c_uint
    result=[]
    for h in handles[:needed.value//ctypes.sizeof(ctypes.c_void_p)]:
        text=ctypes.create_unicode_buffer(32768);assert name(ctypes.c_void_p(-1),h,text,len(text));result.append(text.value)
    return sorted(set(result),key=str.casefold)
def main(c,ps,args):
    assert not args
    root=tc.PACKAGE/'fixtures'/('chain-'+uuid.uuid4().hex);root.mkdir(parents=True)
    records=[]
    def check(name,value):
        assert value,name;records.append(name)
    check('explicit-retained-Python',Path(sys.executable)==Path(c['programs']['python']['path']))
    check('correct-working-directory',Path.cwd()==tc.ROOT)
    check('isolated-stdlib',not any('windowsapps' in p.casefold() for p in sys.path))
    for file in Path(__file__).parent.glob('*.py'):ast.parse(file.read_text());check('parse-'+file.name,True)
    result=Context.processes.run(['pwsh','-NoLogo','-NoProfile','-NonInteractive','-File',str(Path(__file__).with_name('Probe-PowerShell.ps1')),'-Output',str(root/'powershell.json')],capture_output=True,text=True)
    check('real-PowerShell-script-startup',result.returncode==0)
    observed=tc.read(root/'powershell.json');check('retained-PowerShell-canonical-path',observed['path'].casefold()==c['programs']['powershell']['path'].casefold());check('execution-policy-unchanged',observed['policy']=='RemoteSigned')
    check('PowerShell-cmdlets-retained',all(str(Path(x['modulePath'])).casefold().startswith(c['roots']['powershell'].casefold()) for x in observed['cmdlets']))
    check('legacy-fsutil-resolves-only-qualified-System32',observed['fsutilPath'].casefold()==c['programs']['fsutil']['path'].casefold())
    for role,args_,key in [('git',['git','--version'],'version'),('node',['node','--version'],'version')]:
        value=Context.processes.check_output(args_,text=True).strip();check(role+'-actual-startup-version',value==c['programs'][role][key])
    result=Context.processes.run(['node','--check',str(tc.ROOT/'tools/native-control/private-profile03c/ResourceProof03C.mjs')],capture_output=True,text=True);check('unchanged-marker-script-parsing',result.returncode==0)
    capture=Context.load('capture_chain_f',Path(__file__).with_name('Extract-Capture.py'));av=capture.extractor.dependencies();check('retained-PyAV-startup',av.__version__==c['pyavVersion'])
    pcm=root/'authored-stereo.wav'
    with wave.open(str(pcm),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(48000);f.writeframes(b'\0'*(48000*3*4))
    # Decoder fixtures use the exact extractor entry, restricted to its fixture root.
    fixture=tc.PACKAGE/'capture-fixtures'/root.name;fixture.mkdir(parents=True);source=fixture/'input.wav';source.write_bytes(pcm.read_bytes())
    decoded=capture.extractor.extract(source,fixture/'window.wav',0,3,True);check('actual-unchanged-capture-decoder',decoded['containerContinuityPassed'])
    proof=Context.processes.run(['node',str(tc.ROOT/'tools/native-control/private-profile03c/ResourceProof03C.mjs'),'baselines',str(fixture/'window.wav'),str(fixture/'window.wav')],capture_output=True,text=True)
    check('actual-marker-CLI-invocation',proof.returncode==0 and json.loads(proof.stdout)['schema']=='RichAudioPrivate03CBaselineReview')
    native_modules=own_modules();check('no-auto-versioned-Codex-module-dependency',not any('windowsapps' in p.casefold() for p in native_modules+observed['modules']))
    for module in native_modules+observed['modules']:
        check('loaded-module-bound-'+Path(module).name,any(x['path'].casefold()==module.casefold() for x in c['files']))
    supervisor=Context.processes.check_output([c['programs']['supervisor']['path'],'--identity',str(os.getpid())],text=True);identity=json.loads(supervisor)
    check('supervisor-real-metadata-startup',identity['ProcessId']==os.getpid() and identity['FileIdentity']==c['programs']['python']['fileIdentity'])
    result=Context.processes.run([c['programs']['supervisor']['path'],'--invalid-fixture-command'],capture_output=True,text=True);check('supervisor-early-error-preserved',result.returncode==3 and 'SUPERVISION_NOT_READY' in result.stderr)
    manager=Context.load('manager_chain_f',Path(__file__).with_name('Manage-Installation.py'));watch=Context.load('watch_chain_f',Path(__file__).with_name('Watch-AuthorizedGame.py'));check('manager-watcher-exact-source-import',hasattr(manager,'Installation') and hasattr(watch,'main'))
    # The actual watcher supervises only this owned stdin-controlled fixture.
    # It cannot activate the candidate: offline-fixture mode, unrelated process,
    # fresh disposable session, and ShowUi false are explicit in this config.
    child=Context.processes.Popen(['python','-c','import sys;sys.stdin.readline()'],stdin=Context.processes.PIPE,text=True)
    identity=json.loads(Context.processes.check_output([c['programs']['supervisor']['path'],'--identity',str(child.pid)],text=True))
    session=uuid.uuid4().hex;scope=root/'supervision';scope.mkdir();commands=scope/'monitor-commands.jsonl';returned=[]
    config=dict(Schema=1,Session=session,Mode='offline-fixture',ProcessId=child.pid,ProcessStartUtcTicks=identity['CreationUtcTicks'],Executable=identity['Executable'],ExecutableSha256=identity['Sha256'],ExpectedIdentity=identity,EvidenceRoot=str(scope/'evidence'),ShowUi=False,MaximumLifetimeMs=8000,ExitLeadMs=1000,ExitGraceMs=1000,HeartbeatTimeoutMs=250,StartupTimeoutMs=4000,AcknowledgeTimeoutMs=1000,Restoration=[dict(Path=str(scope/'absent'),Absent=True)])
    tc.save(scope/'configuration.json',config)
    def supervise():
        try:returned.append(watch.watcher.supervise(Path(c['programs']['supervisor']['path']),scope/'configuration.json',scope))
        except Exception as error:returned.append(str(error))
    worker=threading.Thread(target=supervise);worker.start()
    try:
        until=time.monotonic()+4
        while not (scope/'watcher-ready.json').exists():
            assert worker.is_alive() and time.monotonic()<until,'Disposable watcher startup failed';time.sleep(.01)
        check('actual-watcher-and-supervisor-startup',True)
        commands.write_text(json.dumps(dict(command='normal-exit-requested'))+'\n');time.sleep(.05)
        child.stdin.write('normal fixture exit\n');child.stdin.flush();check('owned-fixture-normal-exit',child.wait(timeout=3)==0)
        time.sleep(.05)
        with commands.open('a') as f:f.write(json.dumps(dict(command='verify-restoration'))+'\n')
        worker.join(4);check('actual-watcher-and-supervisor-controlled-exit',not worker.is_alive() and returned==[True])
        result=tc.read(scope/'evidence/runs'/session/'result.json');check('no-forced-termination-in-chain-admission',not result['forcedTerminationIssued'])
    finally:
        if child.poll() is None:child.stdin.write('normal fixture cleanup\n');child.stdin.flush();child.wait(timeout=3)
        if worker.is_alive():
            with commands.open('a') as f:f.write(json.dumps(dict(command='normal-exit-requested'))+'\n'+json.dumps(dict(command='verify-restoration'))+'\n')
            worker.join(5)
    tc.PACKAGE.joinpath('chain-checks').mkdir(exist_ok=True)
    output=tc.PACKAGE/'chain-checks'/(root.name+'.json');tc.read(tc.PACKAGE/'toolchain-manifest.json')
    with output.open('x') as f:json.dump(dict(passed=True,checks=records,count=len(records),python=dict(path=sys.executable,version=sys.version,bits=struct.calcsize('P')*8),powershell=observed,pythonModules=native_modules,fixtureRoot=str(root),gameLaunched=False,obsLaunched=False),f,indent=2)
    print(json.dumps(dict(passed=True,checks=len(records),receipt=str(output))));return 0
