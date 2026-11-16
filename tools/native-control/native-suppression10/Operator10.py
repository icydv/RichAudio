"""Finite local operator for the approved08 run. No keyboard phase controls."""
from pathlib import Path
import argparse,ctypes,datetime,hashlib,json,os,re,subprocess,sys,time,uuid
from ctypes import wintypes
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent

DECISIONS=['ControlNormal','Normal','DistinctEngine','MatchedEngine','DonorHorn','Ambiguous','Negative']

def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def shared_bytes(p):
    # Readers explicitly permit atomic rename/delete, as the C# and OBS writers
    # do. CRT text-open sharing otherwise causes Windows ReplaceFile races.
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    k.CreateFileW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE];k.CreateFileW.restype=wintypes.HANDLE
    k.CloseHandle.argtypes=[wintypes.HANDLE];k.GetFileSizeEx.argtypes=[wintypes.HANDLE,ctypes.POINTER(ctypes.c_longlong)]
    k.ReadFile.argtypes=[wintypes.HANDLE,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD),ctypes.c_void_p]
    handle=k.CreateFileW(str(Path(p).absolute()),0x80000000,7,None,3,0x80,None)
    if handle==ctypes.c_void_p(-1).value:
        error=ctypes.get_last_error()
        if error in [2,3]:raise FileNotFoundError(str(p))
        if error in [32,33]:raise PermissionError(str(p))
        raise OSError(error,ctypes.FormatError(error))
    try:
        size=ctypes.c_longlong();assert k.GetFileSizeEx(handle,ctypes.byref(size)) and 0<=size.value<=4194304,'bounded JSON file'
        buf=ctypes.create_string_buffer(size.value);count=wintypes.DWORD()
        assert k.ReadFile(handle,buf,size.value,ctypes.byref(count),None) and count.value==size.value,'complete immutable-handle JSON read'
        return buf.raw
    finally:k.CloseHandle(handle)
def read(p):
    # ReplaceFile can briefly hide a published filename on Windows. Retry only
    # transient opens, outside callbacks; never resend an operation or accept an
    # older phase. Corrupt JSON and a persistently absent file still fail closed.
    until=time.monotonic()+.25
    while True:
        try:return json.loads(shared_bytes(p).decode('utf-8-sig'))
        except (FileNotFoundError,PermissionError):
            if time.monotonic()>=until:raise
            time.sleep(.005)
def private_path(p,root):
    p,root=Path(p).absolute(),Path(root).absolute()
    assert p.is_relative_to(root),'path outside fixed attempt'
    for at in [p,*p.parents]:
        if at.exists():assert not getattr(at.lstat(),'st_file_attributes',0)&0x400,'reparse path refused'
    return p
def atomic(p,obj,exclusive=False):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
    data=json.dumps(obj,ensure_ascii=False,indent=2).encode('utf-8')
    if exclusive:
        with p.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
    else:
        tmp=p.with_name(p.name+'.'+uuid.uuid4().hex+'.new')
        with tmp.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        until=time.monotonic()+.25
        while True:
            try:os.replace(tmp,p);break
            except PermissionError:
                if (p.exists() and getattr(p.stat(),'st_file_attributes',0)&1) or time.monotonic()>=until:raise
                time.sleep(.005) # same immutable publication, never an operation resend
def qpc():
    v=ctypes.c_longlong();assert ctypes.windll.kernel32.QueryPerformanceCounter(ctypes.byref(v));return v.value
def frequency():
    v=ctypes.c_longlong();assert ctypes.windll.kernel32.QueryPerformanceFrequency(ctypes.byref(v));return v.value
def event(root,name,**data):
    obj=dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),qpc=qpc(),event=name,**data)
    with (Path(root)/'operator-events.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(obj)+'\n');f.flush();os.fsync(f.fileno())
    print(json.dumps(obj),flush=True)

class LocalRecorder:
    """Finite file protocol to OBS's built-in Lua frontend, with state readback."""
    def __init__(self,root,session):self.root=Path(root);self.session=session;self.issued=set()
    def snapshot(self):
        s=read(self.root/'operator/recorder-state.json');now_ns=qpc()*1000000000//frequency()
        assert s['Session']==self.session and 0<=now_ns-s['ObservedNs']<=2000000000,'fresh exact-session OBS callback'
        return s
    def call(self,name):
        assert name in ['GetRecordStatus','StartRecord','StopRecord'],'finite recording operations only'
        if name=='GetRecordStatus':
            s=self.snapshot();return dict(outputActive=s['RecordingActive'],outputPaused=s['Paused'],outputDuration=s['Frames']*1000/30,outputBytes=s['Bytes'],graphValid=s['GraphValid'],failed=s['Failed'])
        op='Start' if name=='StartRecord' else 'Stop'
        assert op not in self.issued,'never automatically resend a recorder action'
        s=self.snapshot()
        if op=='Stop' and not s['RecordingActive']:return dict(alreadyInactive=True)
        assert not s['Failed'] and (op=='Stop' or s['GraphValid']),'valid recording graph'
        self.issued.add(op);cid=uuid.uuid4().hex
        if op=='Stop':atomic(self.root/'operator/record-stop-reserved.json',dict(Session=self.session,Id=cid),True)
        request=dict(Session=self.session,Id=cid,Operation=op,ExpiresNs=qpc()*1000000000//frequency()+5000000000)
        atomic(self.root/'operator/recorder-request.json',request)
        until=time.monotonic()+5
        while time.monotonic()<until:
            p=self.root/'operator/recorder-reply.json'
            if p.exists():
                reply=read(p)
                if reply.get('Id')==cid:
                    assert reply['Session']==self.session and reply['Accepted'],'bound recorder request refused'
                    break
            time.sleep(.03)
        else:raise TimeoutError('recorder action outcome uncertain; no resend')
        until=time.monotonic()+10
        while time.monotonic()<until:
            if self.snapshot()['RecordingActive']==(op=='Start'):return dict(accepted=True)
            time.sleep(.05)
        raise TimeoutError('recorder result not observed; no resend')
    def close(self):pass

def recording_origin(plan,recorder):
    logs=sorted(Path(plan['ObsLogs']).glob('*.txt'),key=lambda p:p.stat().st_mtime,reverse=True);assert logs,'actual OBS log'
    log=logs[0];matches=re.findall(r'^(\d\d:\d\d:\d\d\.\d\d\d): ==== Recording Start',log.read_text(encoding='utf-8-sig'),re.M);assert len(matches)==1,'one actual recording-start event'
    date=log.name[:10];tz=datetime.datetime.now().astimezone().tzinfo
    start=datetime.datetime.fromisoformat(date+'T'+matches[0]).replace(tzinfo=tz).astimezone(datetime.timezone.utc)
    now=datetime.datetime.now(datetime.timezone.utc)
    if start>now+datetime.timedelta(seconds=1):start-=datetime.timedelta(days=1)
    before=qpc();wall=datetime.datetime.now(datetime.timezone.utc);after=qpc()
    origin=round((before+after)/2-(wall-start).total_seconds()*frequency())
    s=recorder.snapshot();event_qpc=round(s['StartedNs']*frequency()/1000000000)
    assert s['StartedNs']>0 and abs(origin-event_qpc)/frequency()<=.250,'recorder event/log clock disagreement'
    return origin,dict(RecordingStartUtc=start.isoformat(),Log=str(log),LogSha256AtBinding=sha(log),StartedNs=s['StartedNs'],OriginQpc=origin,ClockBracketBefore=before,ClockBracketAfter=after,LogVsFrontendSeconds=(event_qpc-origin)/frequency(),Interpretation='Actual OBS Recording Start event mapped to Windows QPC; decoded media PTS checked separately; physical AV alignment not assumed')

class ProcessIdentity:
    """OS identity/liveness only. Never reads GTA process memory."""
    def __init__(self,pid,creation_ticks,path,digest):
        from ctypes import wintypes as w
        k=ctypes.WinDLL('kernel32',use_last_error=True)
        k.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenProcess.restype=w.HANDLE
        k.CloseHandle.argtypes=[w.HANDLE];k.GetExitCodeProcess.argtypes=[w.HANDLE,ctypes.POINTER(w.DWORD)]
        k.GetProcessTimes.argtypes=[w.HANDLE,ctypes.POINTER(w.FILETIME),ctypes.POINTER(w.FILETIME),ctypes.POINTER(w.FILETIME),ctypes.POINTER(w.FILETIME)]
        k.QueryFullProcessImageNameW.argtypes=[w.HANDLE,w.DWORD,w.LPWSTR,ctypes.POINTER(w.DWORD)]
        self.k=k;self.w=w;self.pid=pid;self.h=k.OpenProcess(0x1000|0x100000,False,pid);assert self.h,'query bound process'
        made,exited,kernel,user=w.FILETIME(),w.FILETIME(),w.FILETIME(),w.FILETIME()
        assert k.GetProcessTimes(self.h,ctypes.byref(made),ctypes.byref(exited),ctypes.byref(kernel),ctypes.byref(user))
        self.creation=(made.dwHighDateTime<<32)+made.dwLowDateTime+504911232000000000
        if creation_ticks is not None:assert self.creation==creation_ticks,'PID generation changed'
        buf=ctypes.create_unicode_buffer(32768);n=w.DWORD(len(buf));assert k.QueryFullProcessImageNameW(self.h,0,buf,ctypes.byref(n))
        self.path=Path(buf.value);assert os.path.normcase(str(self.path))==os.path.normcase(str(Path(path).absolute())) and sha(self.path)==digest,'exact process image'
    def alive(self):
        code=self.w.DWORD();assert self.k.GetExitCodeProcess(self.h,ctypes.byref(code));return code.value==259
    def window(self,visible=True):
        u=ctypes.WinDLL('user32',use_last_error=True);w=self.w;found=[]
        callback=ctypes.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
        u.GetWindowThreadProcessId.argtypes=[w.HWND,ctypes.POINTER(w.DWORD)];u.IsWindowVisible.argtypes=[w.HWND]
        @callback
        def visit(hwnd,_):
            pid=w.DWORD();u.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
            if pid.value==self.pid:
                if visible and u.IsWindowVisible(hwnd):found.append(hwnd)
                elif not visible:
                    text=ctypes.create_unicode_buffer(1024);u.GetWindowTextW(hwnd,text,len(text))
                    if text.value.startswith('OBS '):found.append(hwnd)
            return True
        u.EnumWindows.argtypes=[callback,w.LPARAM];assert u.EnumWindows(visit,0)
        assert len(found)==1,'one visible bound application window';return u,found[0]
    def foreground(self,activate=False):
        if not self.alive():return False
        u,h=self.window();u.GetForegroundWindow.restype=self.w.HWND
        if activate:
            u.SetForegroundWindow.argtypes=[self.w.HWND];delivered=bool(u.SetForegroundWindow(h))
            # One request, then bounded readback. Activation crosses a window
            # message queue and need not be observable synchronously.
            until=time.monotonic()+1
            while delivered and u.GetForegroundWindow()!=h and time.monotonic()<until:time.sleep(.02)
            self.last_focus_request=dict(target=int(h),delivered=delivered,observed=int(u.GetForegroundWindow() or 0))
        return u.GetForegroundWindow()==h
    def normal_close(self):
        assert self.alive();u,h=self.window(visible=self.path.name.lower()!='obs64.exe');u.PostMessageW.argtypes=[self.w.HWND,self.w.UINT,self.w.WPARAM,self.w.LPARAM]
        assert u.PostMessageW(h,0x0010,0,0),'bounded WM_CLOSE request';return True
    def close(self):self.k.CloseHandle(self.h)

def command(root,state,operation,text,decision=None,observation=None,evidence=None,context=False):
    root=Path(root);now=qpc();freq=frequency()
    assert now>=state['Ticks'] and now-state['Ticks']<2*freq,'fresh script callback state required'
    assert not state['Finished'],'stopped feedback remains evidence only'
    if operation=='Review':assert state['AwaitingReview'] and observation==state['Observation'],'exact original listening observation required'
    cid=uuid.uuid4().hex
    obj=dict(Session=state['Session'],Id=cid,Phase=state['Phase'],Generation=state['Generation'],Profile=state['Profile'],Operation=operation,Text=text,
             Decision=decision,Observation=observation or state['Observation'],ExpiresTicks=now+5*freq,CaptureReviewed=evidence is not None,ContextReviewed=context,EvidenceSha256=evidence)
    atomic(root/'operator/commands'/('cmd-'+cid+'.json'),obj,True)
    return cid

def verify_plan(plan_path,approval_path,expected_scope):
    plan=read(plan_path);root=Path(plan['Root']);scope=root/'scope.json';approval=read(approval_path)
    assert sha(scope)==expected_scope==approval['scopeSha256'] and approval['oneRunApproved'] and approval['userPresentConfirmed'],'fresh complete-run approval'
    s=read(scope);assert s['candidateName']=='candidate-10' and s['sourceCommit']==plan['SourceCommit'],'new scope/source binding'
    assert s['operator']['plan']['sha256']==sha(plan_path),'sealed operator plan'
    assert read(root/'transaction.json')['status']=='installed-verified','verified temporary installation required'
    for p in plan['Tools']:
        assert Path(p['path']).is_file() and sha(p['path'])==p['sha256'],'operator dependency identity'
    assert sha(Path(__file__))==plan['OperatorSha256'],'operator source identity'
    private_path(plan_path,root);return plan,root

def fixed_windows(root,state,origin_qpc,freq):
    lines=(Path(root)/'operator/journal.log').read_text(encoding='utf-8-sig').splitlines();windows=[];seen=set()
    for line in lines:
        if not re.match(r'^\d+\|\S+ qpc=\d+ window-declared observation='+re.escape(state['Observation'])+r' ',line):continue
        m=re.search(r'kind=([\w-]+) anchorQpc=(\d+) offsetSeconds=(\d+) durationSeconds=(\d+)',line);assert m,'typed window declaration'
        name=m[1];assert name not in seen,'no replacement window';seen.add(name)
        assert int(m[4])==10
        windows.append(dict(Name=name,StartSeconds=(int(m[2])-origin_qpc)/freq+int(m[3])))
    required={'B-pre':{'B-stability','B-pre'},'B-post':{'B-post'},'baseline':{'horn','steady'}}.get(state['Phase'],{'transition','steady','horn'})
    assert seen==required,'complete declared observation bundle'
    return windows

def bundle_plan(root,state,source,origin_qpc,plan):
    freq=frequency();return dict(Root=str(root),Output=str(root/'analysis'/state['Observation']),Source=str(source),Session=state['Session'],Observation=state['Observation'],Phase=state['Phase'],Profile=state['Profile'],Generation=state['Generation'],Recording=state['Recording'],ActiveStartSeconds=(state['ActiveStart']-origin_qpc)/freq,
        Windows=fixed_windows(root,state,origin_qpc,freq),Dependencies=plan['Dependencies']['path'],DependenciesSha256=plan['Dependencies']['sha256'])

def check_recorder(ws,plan):
    s=ws.snapshot();assert s['Profile']==s['Collection']==plan['ObsProfile'] and s['GraphValid'] and not s['Failed'],'verified private OBS graph, WGC, 30fps, loopback and no extra/microphone sources'

def runtime_sample(root,session):
    s=read(Path(root)/'operator/state.json');now=qpc()
    assert s['Session']==session and 0<=now-s['Ticks']<=2*frequency(),'fresh exact-session script callback, not process liveness'
    assert s['RuntimeReady'] and not s['PauseMenu'] and 0<=now-s['LastSimulationProgressTicks']<frequency(),'actual Story/pause and simulation progression required'
    return s

def normal_exit_once(root,identity,name):
    reservation=Path(root)/(name+'-close-reserved.json')
    if reservation.exists():return False
    atomic(reservation,dict(pid=identity.pid,creationTicks=identity.creation,qpc=qpc()),True)
    identity.normal_close();event(root,'normal-'+name+'-exit-request');return True

def ensure_foreground(root,target,label):
    if target.foreground():return
    if target.foreground(True):return
    # Finite Codex fallback to the existing supported app-control tool. Codex
    # selects its returned exact window; this is never a user settings task.
    # The operator independently verifies OS foreground ownership afterwards.
    _,window=target.window();request=dict(Id=uuid.uuid4().hex,Label=label,Pid=target.pid,CreationTicks=str(target.creation),Path=str(target.path),Window=int(window),ExpiresQpc=qpc()+12*frequency())
    atomic(Path(root)/'focus-request.json',request);event(root,'focus-ui-assistance-needed',request=request)
    while qpc()<request['ExpiresQpc']:
        if target.foreground():
            event(root,'focus-ui-assistance-observed',requestId=request['Id']);return
        time.sleep(.05)
    raise AssertionError('exact foreground not observed after one request and bounded Codex fallback: '+label)

def startup_operating_check(root,session,game,recorder):
    # Observe the operating conditions directly. Never activate OBS or move
    # focus away from the game just to qualify its programmatic recorder.
    samples=[]
    for label in ['game-stable']:
        ensure_foreground(root,game,label)
        start=qpc();previous=None;phase=[]
        while (qpc()-start)/frequency()<2.5:
            assert game.alive() and game.foreground(),'game operating focus lost during startup'
            s=runtime_sample(root,session);r=recorder.call('GetRecordStatus')
            assert r['outputActive'] and not r['outputPaused'] and r['graphValid'] and not r['failed'],'continuous actual recorder state'
            if previous is not None:assert s['CallbackSequence']>previous['CallbackSequence'],'new callbacks during focus check'
            phase.append(dict(stage=label,qpc=qpc(),gameForeground=game.foreground(),callback=s['CallbackSequence'],gameMilliseconds=s['GameMilliseconds'],frames=s['SimulationFrames'],pauseMenu=s['PauseMenu']))
            previous=s;time.sleep(.2)
        elapsed=(phase[-1]['qpc']-phase[0]['qpc'])/frequency()
        simulated=((phase[-1]['gameMilliseconds']-phase[0]['gameMilliseconds'])&0xffffffff)/1000
        assert .5*elapsed<=simulated<=1.5*elapsed and ((phase[-1]['frames']-phase[0]['frames'])&0xffffffff)>0,'supported simulation counters must actually progress'
        samples.extend(phase)
    receipt=dict(Session=session,Passed=True,Samples=samples,Transitions=0,ObsActivationRequired=False,Scope='Actual game identity, callbacks, Story/pause, timer/frame progression, game foreground and recorder graph/state. No OBS window activation. Not an audibility claim.')
    atomic(Path(root)/'startup-operating-check.json',receipt,True);return receipt

def readiness_admitted(root,job,state,origin,freq):
    # This is the sole parent-side readiness transition. A running recorder,
    # elapsed timer or growing file cannot make the next command eligible.
    if job.poll() is None:return False
    status=read(Path(root)/'readiness-status.json')
    assert job.returncode==0 and status['State']=='Admitted',('actual AV readiness refused: '+status.get('Reason',status.get('Error','unknown')))
    assert status['Session']==state['Session'] and status['Recording']==state['Recording'],'readiness session/recording changed'
    assert status['OriginQpc']==origin and status['DeadlineQpc']==origin+50*freq and status['ValidationFinishedQpc']<origin+50*freq and qpc()<origin+50*freq,'unchanged readiness admission deadline'
    receipt=private_path(status['Receipt'],root)
    assert status['Durable'] and sha(receipt)==status['ReceiptSha256'],'durable full-readiness receipt required'
    r=read(receipt)
    for key,value in dict(Session=state['Session'],Recording=state['Recording'],Phase='recorder-readiness',Observation='recorder-readiness',Generation='unspawned',Profile='NONE').items():assert r[key]==value,'full readiness receipt identity differs'
    assert r['Passed'] and r['Windows'][0]['StartSeconds']==1 and r['Windows'][0]['DurationSeconds']==10 and r['Snapshot']['snapshotSha256']==status['SnapshotSha256'],'exact original readiness window and inspected bytes'
    return True

def coverage_result(root,obsid,job):
    # A successful extraction alone is insufficient if the scheduling gate
    # subsequently refuses its source identity or deadline. Keep both receipts.
    root=Path(root);plan=read(root/'analysis'/('plan-'+obsid+'.json'))
    try:
        status=read(root/('coverage-'+obsid+'-status.json'))
        assert job.returncode==0 and status['State']=='Admitted',status.get('Reason','coverage-worker-refused')
        for key in ['Session','Recording','Observation','Phase','Generation','Profile']:assert status[key]==plan[key],'coverage identity changed'
        assert status['Durable'] and status['ValidationFinishedQpc']<status['DeadlineQpc'],'coverage validation exceeded its bound'
        receipt=private_path(status['Receipt'],root);result=read(receipt)
        assert sha(receipt)==status['ReceiptSha256'] and result['Passed'] and result['Snapshot']['snapshotSha256']==status['SnapshotSha256'],'durable exact coverage receipt required'
        for key in ['Session','Recording','Observation','Phase','Generation','Profile']:assert result[key]==plan[key],'full capture identity changed'
        return receipt,result
    except (OSError,AssertionError,KeyError,ValueError) as error:
        result=dict(Passed=False,Error='coverage admission refused: '+str(error),**{key:plan[key] for key in ['Session','Recording','Observation','Phase','Generation','Profile']})
        receipt=root/'analysis'/('coverage-refusal-'+obsid+'.json');atomic(receipt,result,True);return receipt,result

def watch(plan_path,approval_path,expected_scope):
    # All failures retain evidence and use bounded normal closure, including
    # startup refusals before OBS readiness. Never create a second recording.
    plan,root=verify_plan(plan_path,approval_path,expected_scope)
    try:return watch_inner(plan_path,approval_path,expected_scope)
    except Exception as error:
        event(root,'operator-refused',error=type(error).__name__+':'+str(error))
        lock=(root/'operator/activation.lock').read_text().split();session,pid,created=lock[0],int(lock[1]),int(lock[2])
        game=None
        try:game=ProcessIdentity(pid,created,plan['Game']['path'],plan['Game']['sha256'])
        except (OSError,AssertionError) as lost:event(root,'failed-game-identity-unavailable',error=str(lost))
        alive=lambda:game is not None and game.alive()
        state=read(root/'operator/state.json');deadline=state['Deadline']
        # A running session keeps its original OS-clock deadline even if all
        # script callbacks stop. The missing lease invokes the same local stop
        # when callbacks still run; this is not a native recovery guarantee.
        while alive() and deadline and qpc()<deadline and not state['Finished']:
            time.sleep(.2)
            try:state=read(root/'operator/state.json')
            except OSError:pass
        if alive():normal_exit_once(root,game,'game')
        remaining=15
        # Before Begin, stop recording by the original sixty-second ceiling,
        # even if normal game exit still needs confirmation.
        if not deadline and (root/'recording-origin.json').exists():
            origin=read(root/'recording-origin.json');remaining=min(15,max(0,60-(qpc()-origin['OriginQpc'])/origin['Frequency']-1))
        until=time.monotonic()+remaining
        while alive() and time.monotonic()<until:time.sleep(.2)
        if alive():event(root,'normal-game-exit-needs-visible-ui',exception='normal quit confirmation remains an explicit final-exit exception')
        try:
            recorder=LocalRecorder(root,session)
            if recorder.snapshot()['RecordingActive'] and not (root/'operator/record-stop-reserved.json').exists():recorder.call('StopRecord')
        except (OSError,AssertionError,TimeoutError) as e:event(root,'failure-record-stop-unresolved',error=str(e))
        made=[json.loads(x) for x in (root/'operator-events.jsonl').read_text().splitlines() if json.loads(x)['event']=='obs-created']
        if made:
            obs=ProcessIdentity(made[0]['pid'],made[0]['creationTicks'],plan['Obs']['path'],plan['Obs']['sha256'])
            if obs.alive():normal_exit_once(root,obs,'obs')
            obs.close()
        if game is not None:game.close()
        raise

def watch_inner(plan_path,approval_path,expected_scope):
    plan,root=verify_plan(plan_path,approval_path,expected_scope);io=root/'operator';freq=frequency()
    lock=(io/'activation.lock').read_text().split();session,pid,created=lock[0],int(lock[1]),int(lock[2])
    game=ProcessIdentity(pid,created,plan['Game']['path'],plan['Game']['sha256'])
    configured=read(root/'configured-focus.json')
    assert configured['value']==0 and configured['preparedSha256']==read(root/'scope.json')['focusConfiguration']['preparedSha256'],'transaction configured-state evidence; runtime checked separately'
    assert game.alive(),'approved game alive'
    # The private collection loads only the sealed finite Lua recorder. No server,
    # keyboard injection, game launch, microphone, or new OBS plugin is involved.
    obs_child=subprocess.Popen([plan['Obs']['path'],'--profile',plan['ObsProfile'],'--collection',plan['ObsProfile'],'--minimize-to-tray'],cwd=str(Path(plan['Obs']['path']).parent),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    obs=ProcessIdentity(obs_child.pid,None,plan['Obs']['path'],plan['Obs']['sha256']);event(root,'obs-created',pid=obs.pid,creationTicks=obs.creation)
    ws=None;until=time.monotonic()+20
    while time.monotonic()<until:
        try:ws=LocalRecorder(root,session);ws.snapshot();break
        except (OSError,AssertionError):ws=None;time.sleep(.2)
    assert ws is not None,'OBS API unavailable; no pair activation'
    check_recorder(ws,plan);assert not ws.call('GetRecordStatus')['outputActive'],'no pre-existing recording'
    event(root,'record-start-intent')
    start_reserved=root/'record-start-reserved.json';atomic(start_reserved,dict(Session=session,utc=datetime.datetime.now(datetime.timezone.utc).isoformat()),True)
    # If StartRecord's reply is lost, reconcile status, never automatically call it twice.
    ws.call('StartRecord');status=ws.call('GetRecordStatus')
    assert status['outputActive'] and not status['outputPaused'],'recording actually active'
    origin_qpc,origin_evidence=recording_origin(plan,ws)
    paths=list((root/'capture').glob('*.mkv'));until=time.monotonic()+2
    while not paths and time.monotonic()<until:time.sleep(.05);paths=list((root/'capture').glob('*.mkv'))
    assert len(paths)==1,'one capture file';source=paths[0];recording=uuid.uuid4().hex
    atomic(root/'recording-origin.json',dict(Session=session,Recording=recording,Source=str(source),Frequency=freq,**origin_evidence),True)
    startup_operating_check(root,session,game,ws)
    jobs={};sequence=0;started=False;ready=False;stop_sent=False;game_close=False;obs_close=False;finished_at=None;ready_spec=None;resume_focus=set();session_deadline=0;stale_reported=False
    try:
        while True:
            state=read(io/'state.json');assert state['Session']==session,'session changed';now=qpc()
            if state['Deadline'] and not session_deadline:session_deadline=state['Deadline']
            if session_deadline:assert state['Deadline']==session_deadline,'absolute session deadline cannot move'
            stale=now-state['Ticks']>2*freq or not state['RuntimeReady'] or state['PauseMenu']
            if stale and not stale_reported:event(root,'runtime-invalid',state=state);stale_reported=True
            if not started:
                assert game.alive(),'bound game process exited during startup'
                runtime_sample(root,session)
            r=ws.call('GetRecordStatus');active=r['outputActive'] and not r['outputPaused'] and not r['failed'] and r['graphValid']
            if not started:assert r['graphValid'] and not r['failed'],'startup capture graph or recorder failure'
            focus=game.alive() and game.foreground()
            if not started:assert focus,'game must remain foreground after the single startup return'
            sequence+=1;atomic(io/'capture.json',dict(Session=session,Recording=recording,RecordingActive=active,Foreground=focus,TimelineReady=ready and r['graphValid'] and not stale,StartupAdmitted=ready,ObservedTicks=now,Sequence=sequence))
            if not ready and ready_spec is None:
                ready_spec=dict(Root=str(root),Output=str(root/'analysis/recorder-readiness'),Source=str(source),Session=session,Observation='recorder-readiness',Phase='recorder-readiness',Generation='unspawned',Recording=recording,Profile='NONE',ActiveStartSeconds=0,Windows=[dict(Name='ready',StartSeconds=1)],Dependencies=plan['Dependencies']['path'],DependenciesSha256=plan['Dependencies']['sha256'],OriginQpc=origin_qpc,Frequency=freq,AdmissionDeadlineQpc=origin_qpc+50*freq)
                rp=root/'readiness-plan.json';atomic(rp,ready_spec,True);jobs['readiness']=subprocess.Popen([plan['Python']['path'],'-I','-S','-B',plan['ReadinessHelper']['path'],str(rp)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if not ready and (now-origin_qpc)/freq>=50:raise AssertionError('preroll admission deadline exceeded; no Begin')
            readiness_state=dict(Session=session,Recording=recording)
            if not ready and 'readiness' in jobs and readiness_admitted(root,jobs['readiness'],readiness_state,origin_qpc,freq):
                ready=True;event(root,'recorder-ready',recording=recording)
            if ready and not started:
                assert (now-origin_qpc)/freq<50,'pre-roll reserve exceeded'
                focus=game.foreground();assert focus,'foreground verified before local begin'
                runtime_sample(root,session)
                atomic(root/'startup-admission.json',dict(Session=session,Recording=recording,Passed=True,OperatingCheckSha256=sha(root/'startup-operating-check.json'),ReadinessSha256=sha(root/'analysis/recorder-readiness/receipt.json'),qpc=qpc(),RuntimeAudibilityProven=False),True)
                sequence+=1;atomic(io/'capture.json',dict(Session=session,Recording=recording,RecordingActive=active,Foreground=focus,TimelineReady=True,StartupAdmitted=True,ObservedTicks=qpc(),Sequence=sequence))
                command(root,state,'Begin','Start the one approved automatic run');started=True;event(root,'automatic-begin-requested')
            if state['AwaitingReview'] and state['Observation'] not in jobs:
                bp=bundle_plan(root,state,source,origin_qpc,plan);path=root/'analysis'/('plan-'+state['Observation']+'.json');atomic(path,bp,True)
                # Same fixed anchors and validator; wait only for their actual
                # written media within ten seconds and the unchanged deadline.
                bp.update(OriginQpc=origin_qpc,Frequency=freq,CoverageRequestedQpc=now,CoverageDeadlineQpc=min(now+10*freq,state['Deadline']))
                atomic(path.with_name(path.stem+'-coverage.json'),bp,True)
                jobs[state['Observation']]=subprocess.Popen([plan['Python']['path'],'-I','-S','-B',plan['ReadinessHelper']['path'],str(path.with_name(path.stem+'-coverage.json'))],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                event(root,'observation-ready-for-listening',observation=state['Observation'],phase=state['Phase'],profile=state['Profile'])
            for obsid,job in list(jobs.items()):
                if obsid=='readiness' or job.poll() is None:continue
                dest=io/'evidence'/(obsid+'.json')
                if dest.exists():continue
                receipt,result=coverage_result(root,obsid,job)
                binding={k:result[k] for k in ['Session','Observation','Phase','Generation','Recording','Profile','Passed']};binding.update(Receipt=str(receipt),ReceiptSha256=sha(receipt))
                atomic(dest,binding,True)
                if not result['Passed']:
                    event(root,'capture-bundle-refused',observation=obsid,error=result.get('Error'))
                    if not stop_sent and not state['Finished']:command(root,state,'Stop','Capture evidence failed; no diagnostic continuation');stop_sent=True
                else:event(root,'capture-bundle-complete',observation=obsid,receipt=str(receipt),reviewImage=result['ReviewImage'])
            if state['Stage']=='Resume' and state['Observation'] not in resume_focus:
                resume_focus.add(state['Observation']);ensure_foreground(root,game,'feedback-return')
                event(root,'feedback-return-focus-request',observation=state['Observation'])
            if state['Finished'] and not game_close and game.alive():
                normal_exit_once(root,game,'game');game_close=True;finished_at=time.monotonic()
            if started and session_deadline and now>=session_deadline and not game_close and game.alive():
                event(root,'absolute-deadline-normal-exit',state=state);normal_exit_once(root,game,'game');game_close=True;finished_at=time.monotonic()
            if game_close and game.alive() and finished_at and time.monotonic()-finished_at>15:
                event(root,'normal-game-exit-needs-visible-ui',exception='normal close request has not closed the game; Codex must inspect the exact exit dialog')
                finished_at=None
            deadline=session_deadline;closure_due=deadline and now>=deadline+120*freq
            if not game.alive() or closure_due:
                event(root,'record-stop-intent',gameExited=not game.alive(),closureDeadlineReached=bool(closure_due))
                ws.call('StopRecord');stop_sent=True
                until=time.monotonic()+15
                while time.monotonic()<until and ws.call('GetRecordStatus')['outputActive']:time.sleep(.1)
                assert not ws.call('GetRecordStatus')['outputActive'],'record stop unconfirmed; no retry'
                atomic(root/'recording-finalized.json',dict(Session=session,Source=str(source),Bytes=source.stat().st_size,Sha256=sha(source),GameExited=not game.alive(),ClosureDeadlineReached=bool(closure_due)),True)
                ws.close();ws=None;normal_exit_once(root,obs,'obs');obs_close=True
                event(root,'normal-obs-exit-request');break
            if not active and started and not state['Finished'] and not stop_sent:
                command(root,state,'Stop','Recorder stopped unexpectedly');stop_sent=True
            time.sleep(.20)
    finally:
        # Never kill a process, restart a recorder, or resend an uncertain setter.
        if ws is not None:ws.close()
        event(root,'operator-ended',gameAlive=game.alive(),obsAlive=obs.alive(),obsNormalCloseRequested=obs_close)
        game.close();obs.close()
    for obsid,job in jobs.items():
        if job.poll() is None:job.wait(timeout=120)
    result=subprocess.run([plan['Python']['path'],'-I','-S','-B',plan['Finalizer']['path'],str(plan_path)],check=False,creationflags=subprocess.CREATE_NO_WINDOW)
    event(root,'finalized-analysis-finished',exitCode=result.returncode)

def review(plan_path,observation,decision,text_file,context):
    plan=read(plan_path);root=Path(plan['Root']);io=root/'operator';state=read(io/'state.json');text=Path(text_file).read_text(encoding='utf-8-sig').strip();assert 0<len(text)<=1024
    feedback=dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),Observation=observation,Decision=decision,Text=text,ContextReviewed=context,Forwarded=False)
    target=root/'listening'/('feedback-'+uuid.uuid4().hex+'.json');atomic(target,feedback,True)
    if state['Finished'] or not state['AwaitingReview'] or state['Observation']!=observation:
        print(json.dumps(dict(retained=str(target),forwarded=False,reason='late or previous-phase feedback')));return
    scope=read(root/'scope.json');transaction=read(root/'transaction.json');approval=read(root/'approval.json')
    assert transaction['status']=='installed-verified' and transaction['scopeSha256']==sha(root/'scope.json')==approval['scopeSha256'],'same still-active approved installation'
    assert scope['candidateName']=='candidate-10' and scope['sourceCommit']==plan['SourceCommit'] and scope['operator']['plan']['sha256']==sha(plan_path),'same sealed review client plan'
    evidence_path=io/'evidence'/(observation+'.json');e=read(evidence_path)
    for k in ['Session','Observation','Phase','Generation','Recording','Profile']:assert e[k]==state[k],'evidence and current observation binding'
    assert e['Passed'] and sha(private_path(e['Receipt'],root))==e['ReceiptSha256'],'complete fixed evidence required'
    cid=command(root,state,'Review',text,decision,observation,sha(evidence_path),context)
    feedback.update(Forwarded=True,CommandId=cid,EvidenceSha256=sha(evidence_path));atomic(target.with_name(target.stem+'-forwarded.json'),feedback,True)
    print(json.dumps(dict(retained=str(target),forwarded=True,command=cid)))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);s=p.add_subparsers(dest='mode',required=True)
    w=s.add_parser('watch');w.add_argument('--plan',type=Path,required=True);w.add_argument('--approval',type=Path,required=True);w.add_argument('--scope-sha256',required=True)
    r=s.add_parser('review');r.add_argument('--plan',type=Path,required=True);r.add_argument('--observation',required=True);r.add_argument('--decision',choices=DECISIONS,required=True);r.add_argument('--text-file',type=Path,required=True);r.add_argument('--context-reviewed',action='store_true')
    a=p.parse_args()
    if a.mode=='watch':watch(a.plan,a.approval,a.scope_sha256)
    else:review(a.plan,a.observation,a.decision,a.text_file,a.context_reviewed)
