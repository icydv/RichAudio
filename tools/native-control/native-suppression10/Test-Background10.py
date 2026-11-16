"""Production watch CLI + actual OBS/WGC + owned window/compiled bridge; no GTA."""
from pathlib import Path
import array,ctypes,importlib.util,json,os,shutil,subprocess,sys,time,wave
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[2]
def mod(name,p):
    s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
op=mod('production10',HERE/'Operator10.py')
def wait(path,seconds=10):
    until=time.monotonic()+seconds
    while not path.exists() and time.monotonic()<until:time.sleep(.05)
    assert path.exists(),str(path);return path
def pin(p):p=Path(p);return dict(path=str(p),bytes=p.stat().st_size,sha256=op.sha(p))
def foreground_pid():
    u=ctypes.WinDLL('user32');u.GetForegroundWindow.restype=ctypes.c_void_p;p=ctypes.c_ulong();u.GetWindowThreadProcessId(ctypes.c_void_p(u.GetForegroundWindow()),ctypes.byref(p));return p.value
def obs_main_windows(pid):
    u=ctypes.WinDLL('user32');rows=[];callback=ctypes.WINFUNCTYPE(ctypes.c_int,ctypes.c_void_p,ctypes.c_ssize_t)
    u.GetWindowThreadProcessId.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong)];u.GetWindowTextW.argtypes=[ctypes.c_void_p,ctypes.c_wchar_p,ctypes.c_int];u.IsWindowVisible.argtypes=[ctypes.c_void_p]
    @callback
    def visit(hwnd,_):
        owner=ctypes.c_ulong();u.GetWindowThreadProcessId(hwnd,ctypes.byref(owner))
        if owner.value==pid:
            title=ctypes.create_unicode_buffer(1024);u.GetWindowTextW(hwnd,title,len(title))
            if title.value.startswith('OBS '):rows.append(dict(hwnd=int(hwnd),visible=bool(u.IsWindowVisible(hwnd))))
        return 1
    u.EnumWindows.argtypes=[callback,ctypes.c_ssize_t];u.EnumWindows(visit,0);return rows
def deny_new_readers(path):
    # Owned fault injection only: existing OBS write handle keeps working.
    k=ctypes.WinDLL('kernel32',use_last_error=True);k.CreateFileW.argtypes=[ctypes.c_wchar_p,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_void_p,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_void_p];k.CreateFileW.restype=ctypes.c_void_p;k.CloseHandle.argtypes=[ctypes.c_void_p]
    handle=k.CreateFileW(str(path),0x80000000,2,None,3,0x80,None)
    assert handle!=ctypes.c_void_p(-1).value,'owned sharing-fault handle unavailable: '+str(ctypes.get_last_error())
    try:
        with path.open('rb'):pass
    except PermissionError:return k,handle
    k.CloseHandle(handle);raise AssertionError('sharing fault did not actually deny new readers')
def case(base,host,kind):
    root=base/kind;root.mkdir();(root/'capture').mkdir();profile='NativeSuppression10Offline';obsroot=Path(os.environ['APPDATA'])/'obs-studio'
    target_profile=obsroot/'basic/profiles'/profile;target_scene=obsroot/'basic/scenes'/(profile+'.json')
    assert not target_profile.exists() and not target_scene.exists()
    game=subprocess.Popen([str(host),str(root),kind],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);operator=None;lock=None;samples=[];acted=False;stop_sent=False
    try:
        selector=wait(root/'window-selector.txt').read_text();wait(root/'operator/state.json');state=op.read(root/'operator/state.json');session=state['Session']
        # Establish the genuine OS game-focus prerequisite on our owned window
        # before production entry. OBS does not exist yet and is never activated.
        op.atomic(root/'fixture-window-ready.json',dict(pid=game.pid,selector=selector,foregroundPid=foreground_pid(),fixture=True),True)
        until=time.monotonic()+35
        while foreground_pid()!=game.pid and time.monotonic()<until:time.sleep(.05)
        assert foreground_pid()==game.pid,'owned game fixture must be foreground before production entry'
        old=REPO/'.local/native-suppression-01/candidate-09/capture-settings'
        basic=(old/'basic.ini').read_text().replace('NativeSuppression01Live09',profile)
        basic=basic.replace(r'C:\\Users\\Libby\\Documents\\RichAudio-SHVDNE01\\.local\\native-suppression-01\\execution-09\\capture',str(root/'capture').replace('\\','\\\\'))
        target_profile.mkdir();(target_profile/'basic.ini').write_text(basic)
        import math
        pcm=array.array('h')
        for i in range(48000*4):
            v=0 if kind=='missing-audio' else round(1000*math.sin(2*math.pi*220*i/48000));pcm.extend([v,v])
        tone=root/'owned-audio.wav'
        with wave.open(str(tone),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(48000);f.writeframes(pcm)
        scene=json.loads((old/'NativeSuppression01Live09.json').read_text());scene['name']=profile
        scene['DesktopAudioDevice1'].update(id='ffmpeg_source',versioned_id='ffmpeg_source',settings=dict(is_local_file=True,local_file=str(tone),looping=True,restart_on_activate=False,clear_on_media_end=False))
        scene['sources'][0]['settings']['window']=selector if kind!='wrong-capture' else 'Wrong title:wrongclass:wrong.exe'
        scene['sources'][1]['settings']['items'][0]['scale']=dict(x=2,y=2)
        lua=HERE/'Recorder10.lua';fixture_lua=root/'Recorder10.lua'
        source=lua.read_text();adapted=source.replace(r'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-10',str(root)).replace('NativeSuppression01Live10',profile).replace('Grand Theft Auto V:sgaWindow:GTA5_Enhanced.exe',selector).replace('wasapi_output_capture','ffmpeg_source')
        fixture_lua.write_text(adapted);scene['modules']['scripts-tool']=[dict(path=str(fixture_lua).replace('\\','/'),settings={})];target_scene.write_text(json.dumps(scene,indent=2))
        op.atomic(root/'fixture-bindings.json',dict(productionRecorder=pin(lua),fixtureRecorder=pin(fixture_lua),logicChanged=False,substitutions=['private root/profile','owned WGC window selector','owned deterministic file audio instead of desktop loopback'],gameApi='Authored API observations only; real compiled bridge and runner; no GTA identity/decorator access',host=pin(host)),True)
        python=Path(sys.executable);obs=Path(r'C:\Program Files\obs-studio\bin\64bit\obs64.exe');deps=Path(r'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\gate-a-shvdne-private-03b\capture-dependencies.json')
        plan=dict(SourceCommit='AUTHORED-GTA-OBSERVATIONS-ONLY',Root=str(root),Game=pin(host),Obs=pin(obs),ObsProfile=profile,ObsLogs=str(obsroot/'logs'),Python=pin(python),Dependencies=pin(deps),CaptureHelper=pin(HERE.parent/'native-suppression08/Capture08.py'),ReadinessHelper=pin(HERE/'Readiness10.py'),Finalizer=pin(HERE.parent/'native-suppression08/Finalize08.py'),OperatorSha256=op.sha(HERE/'Operator10.py'),Tools=[pin(p) for p in [HERE/'Operator10.py',HERE/'Readiness10.py',fixture_lua]])
        plan_path=root/'operator-plan.json';op.atomic(plan_path,plan,True)
        scope=dict(candidateName='candidate-10',sourceCommit=plan['SourceCommit'],operator=dict(plan=pin(plan_path)),focusConfiguration=dict(preparedSha256='AUTHORED-FIXTURE-NO-GAME-CONFIGURATION'))
        op.atomic(root/'scope.json',scope,True);digest=op.sha(root/'scope.json')
        op.atomic(root/'configured-focus.json',dict(value=0,preparedSha256=scope['focusConfiguration']['preparedSha256'],fixture=True),True)
        op.atomic(root/'transaction.json',dict(status='installed-verified',scopeSha256=digest,label='DISPOSABLE FIXTURE FILES ONLY; NO GAME INSTALLATION'),True)
        op.atomic(root/'approval.json',dict(scopeSha256=digest,oneRunApproved=True,userPresentConfirmed=True,label='AUTOMATED OFFLINE FIXTURE; NOT HUMAN CONSENT OR LIVE APPROVAL'),True)
        with (root/'stdout.txt').open('wb') as stdout,(root/'stderr.txt').open('wb') as stderr:
            operator=subprocess.Popen([str(python),'-I','-S','-B',str(HERE/'Operator10.py'),'watch','--plan',str(plan_path),'--approval',str(root/'approval.json'),'--scope-sha256',digest],stdout=stdout,stderr=stderr)
            until=time.monotonic()+85
            while operator.poll() is None and time.monotonic()<until:
                origin=op.read(root/'recording-origin.json') if (root/'recording-origin.json').exists() else None
                status=op.read(root/'readiness-status.json') if (root/'readiness-status.json').exists() else None
                events=[json.loads(x) for x in (root/'operator-events.jsonl').read_text().splitlines()] if (root/'operator-events.jsonl').exists() else []
                made=[x for x in events if x['event']=='obs-created'];obs_pid=made[0]['pid'] if made else None
                samples.append(dict(qpc=op.qpc(),foregroundPid=foreground_pid(),obsPid=obs_pid,obsMainWindows=obs_main_windows(obs_pid) if obs_pid else [],readiness=None if status is None else status['State'],reason=None if status is None else status.get('Reason')))
                if kind=='startup-expiry' and origin and not acted:
                    lock=deny_new_readers(Path(origin['Source']));acted=True
                if kind=='startup-expiry' and status and status['State']=='Refused' and lock:lock[0].CloseHandle(lock[1]);lock=None
                if status and status['State']=='MediaAvailable' and not acted:
                    if kind=='lost-identity':(root/'close-fixture').touch();acted=True
                    elif kind=='stale-state':(root/'freeze-game-state').touch();acted=True
                    elif kind=='recording-stopped':op.LocalRecorder(root,session).call('StopRecord');acted=True
                if kind=='background' and (root/'startup-admission.json').exists() and not stop_sent:
                    state=op.read(root/'operator/state.json')
                    if state['ActiveStart'] and state['Phase']=='B-pre':
                        op.command(root,state,'Stop','AUTOMATED background-entry fixture complete; no listening judgment or audio assignment');stop_sent=True
                time.sleep(.05)
            assert operator.poll() is not None,'production operator exceeded owned test bound'
        events=[json.loads(x) for x in (root/'operator-events.jsonl').read_text().splitlines()];admitted=(root/'startup-admission.json').exists()
        assert not any(x['event']=='focus-ui-assistance-needed' for x in events),'no UI focus dependency allowed in fixture'
        assert not any(x['obsPid'] and x['foregroundPid']==x['obsPid'] for x in samples),'OBS became foreground'
        journal=(root/'operator/journal.log').read_text();assert 'native-dispatch' not in journal and 'armed phase=' not in journal,'no authored audible acceptance or audio assignment'
        if kind=='background':
            assert any(x['obsMainWindows'] and not any(w['visible'] for w in x['obsMainWindows']) for x in samples),'hidden OBS main window must be observed; foreground is unavailable without changing that state'
            assert admitted and operator.returncode==0,(root/'stderr.txt').read_text()
            assert any(x['readiness'] in ['Waiting','MediaAvailable'] for x in samples),'first incomplete check must wait'
            replies=[op.read(p) for p in (root/'operator/replies').glob('*.json')];assert any(x['Result']=='accepted start' for x in replies),'real compiled command bridge did not accept Begin'
            assert op.read(root/'recording-finalized.json')['GameExited'] and op.read(root/'finalized-review.json')['Passed'],'production stop/finalization failed'
        else:
            assert not admitted and operator.returncode!=0,'failure fixture admitted startup'
            detail=(root/'stderr.txt').read_text()
            expected={'wrong-capture':'verified private OBS graph','frozen':'frozen-readiness-video','blank':'blank-or-unusable-readiness-video','missing-audio':'all-zero observation','lost-identity':'bound game process exited','stale-state':'actual Story/pause and simulation progression required','recording-stopped':'recording-stopped-unexpectedly','startup-expiry':'deadline'}[kind]
            assert expected in detail,(expected,detail)
        if (root/'recording-origin.json').exists():
            actual_log=Path(op.read(root/'recording-origin.json')['Log']);(root/'retained-obs.log').write_bytes(actual_log.read_bytes())
        result=dict(passed=True,case=kind,productionWatchCliUnmodified=True,obsEverObservedForeground=False,readinessAdmitted=admitted,operatorExitCode=operator.returncode,events=events,observations=samples,gameLaunched=False,gameApiAuthored=True,liveGtaBehaviourQualified=False)
        op.atomic(root/'result.json',result,True);print('PASS full production background path '+kind,flush=True)
        return result
    finally:
        op.atomic(root/'observations.json',dict(case=kind,samples=samples,fixtureOnly=True),True)
        if lock:lock[0].CloseHandle(lock[1])
        (root/'close-fixture').touch()
        game.wait(timeout=5)
        # On failed assertions the operator still receives normal game exit;
        # its own production recorder closure path runs. Never kill or restart.
        if operator and operator.poll() is None:operator.wait(timeout=20)
        made=[]
        if (root/'operator-events.jsonl').exists():made=[json.loads(x) for x in (root/'operator-events.jsonl').read_text().splitlines() if json.loads(x)['event']=='obs-created']
        if made:
            identity=None
            try:identity=op.ProcessIdentity(made[0]['pid'],made[0]['creationTicks'],r'C:\Program Files\obs-studio\bin\64bit\obs64.exe',op.sha(r'C:\Program Files\obs-studio\bin\64bit\obs64.exe'))
            except (AssertionError,OSError):pass
            if identity:
                if identity.alive():
                    rec=op.LocalRecorder(root,session)
                    if rec.snapshot()['RecordingActive'] and not (root/'operator/record-stop-reserved.json').exists():rec.call('StopRecord')
                    op.normal_exit_once(root,identity,'obs');until=time.monotonic()+10
                    while identity.alive() and time.monotonic()<until:time.sleep(.1)
                    assert not identity.alive(),'owned OBS did not close normally'
                identity.close()
        for path in [target_profile,target_scene,Path(str(target_scene)+'.bak')]:
            if path.exists():
                assert path.is_relative_to(obsroot) and not path.is_symlink();dest=root/('retained-'+path.name);assert not dest.exists();shutil.move(str(path),str(dest))

if __name__=='__main__':
    base=Path(sys.argv[1]);host=Path(sys.argv[2]);results=[]
    for name in sys.argv[3:]:results.append(case(base,host,name))
    op.atomic(base/'result.json',dict(passed=True,cases=[dict(case=r['case'],readinessAdmitted=r['readinessAdmitted']) for r in results],productionSources=[pin(p) for p in [HERE/'Operator10.py',HERE/'Readiness10.py',HERE/'Recorder10.lua',HERE/'Test-Background10.py',REPO/'tests/host/BackgroundEntryHost10.cs']],scope='Actual production CLI, real installed OBS frontend/encoder/muxer, WGC owned moving window and owned file audio, real compiled bridge/runner; GTA observations authored, no game launch/installation'),True)
