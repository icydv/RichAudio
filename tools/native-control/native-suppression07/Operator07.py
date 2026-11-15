"""Finite local operator for the approved07 run. No keyboard phase controls."""
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
    def window(self):
        u=ctypes.WinDLL('user32',use_last_error=True);w=self.w;found=[]
        callback=ctypes.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
        u.GetWindowThreadProcessId.argtypes=[w.HWND,ctypes.POINTER(w.DWORD)];u.IsWindowVisible.argtypes=[w.HWND]
        @callback
        def visit(hwnd,_):
            pid=w.DWORD();u.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
            if pid.value==self.pid and u.IsWindowVisible(hwnd):found.append(hwnd)
            return True
        u.EnumWindows.argtypes=[callback,w.LPARAM];assert u.EnumWindows(visit,0)
        assert len(found)==1,'one visible bound application window';return u,found[0]
    def foreground(self,activate=False):
        if not self.alive():return False
        u,h=self.window();u.GetForegroundWindow.restype=self.w.HWND
        if activate:
            u.SetForegroundWindow.argtypes=[self.w.HWND];u.SetForegroundWindow(h)
        return u.GetForegroundWindow()==h
    def normal_close(self):
        assert self.alive();u,h=self.window();u.PostMessageW.argtypes=[self.w.HWND,self.w.UINT,self.w.WPARAM,self.w.LPARAM]
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
    s=read(scope);assert s['candidateName']=='candidate-07' and s['sourceCommit']==plan['SourceCommit'],'new scope/source binding'
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

def watch(plan_path,approval_path,expected_scope):
    plan,root=verify_plan(plan_path,approval_path,expected_scope);io=root/'operator';freq=frequency()
    lock=(io/'activation.lock').read_text().split();session,pid,created=lock[0],int(lock[1]),int(lock[2])
    game=ProcessIdentity(pid,created,plan['Game']['path'],plan['Game']['sha256'])
    focus_policy=read(root/'focus-policy.json')
    assert focus_policy['gamePid']==pid and focus_policy['creationTicks']==created and focus_policy['PauseOnFocusLossDisabled'] and focus_policy['verifiedBy']=='Codex UI observation','background callback prerequisite must be observed before recording'
    assert game.alive(),'approved game alive';game.foreground(True)
    # The private collection loads only the sealed finite Lua recorder. No server,
    # keyboard injection, game launch, microphone, or new OBS plugin is involved.
    obs_child=subprocess.Popen([plan['Obs']['path'],'--profile',plan['ObsProfile'],'--collection',plan['ObsProfile']],cwd=str(Path(plan['Obs']['path']).parent),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
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
    jobs={};sequence=0;started=False;ready=False;stop_sent=False;game_close=False;obs_close=False;finished_at=None;ready_spec=None
    try:
        while True:
            state=read(io/'state.json');assert state['Session']==session,'session changed';now=qpc()
            r=ws.call('GetRecordStatus');active=r['outputActive'] and not r['outputPaused'] and not r['failed']
            focus=game.alive() and game.foreground()
            if not started and not focus:focus=game.foreground(True)
            sequence+=1;atomic(io/'capture.json',dict(Session=session,Recording=recording,RecordingActive=active,Foreground=focus,TimelineReady=ready and r['graphValid'],ObservedTicks=now,Sequence=sequence))
            if not ready and (now-origin_qpc)/freq>=12 and ready_spec is None:
                ready_spec=dict(Root=str(root),Output=str(root/'analysis/recorder-readiness'),Source=str(source),Session=session,Observation='recorder-readiness',Phase='recorder-readiness',Generation='unspawned',Recording=recording,Profile='NONE',ActiveStartSeconds=0,Windows=[dict(Name='ready',StartSeconds=1)],Dependencies=plan['Dependencies']['path'],DependenciesSha256=plan['Dependencies']['sha256'])
                rp=root/'readiness-plan.json';atomic(rp,ready_spec,True);jobs['readiness']=subprocess.Popen([plan['Python']['path'],'-I','-S','-B',plan['CaptureHelper']['path'],str(rp)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if not ready and 'readiness' in jobs and jobs['readiness'].poll() is not None:
                assert jobs['readiness'].returncode==0 and read(root/'analysis/recorder-readiness/receipt.json')['Passed'],'actual AV readiness refused'
                ready=True;event(root,'recorder-ready',recording=recording)
            if ready and not started:
                assert (now-origin_qpc)/freq<50,'pre-roll reserve exceeded'
                focus=game.foreground(True);assert focus,'foreground verified before local begin'
                sequence+=1;atomic(io/'capture.json',dict(Session=session,Recording=recording,RecordingActive=active,Foreground=focus,TimelineReady=True,ObservedTicks=qpc(),Sequence=sequence))
                command(root,state,'Begin','Start the one approved automatic run');started=True;event(root,'automatic-begin-requested')
            if state['AwaitingReview'] and state['Observation'] not in jobs:
                bp=bundle_plan(root,state,source,origin_qpc,plan);path=root/'analysis'/('plan-'+state['Observation']+'.json');atomic(path,bp,True)
                jobs[state['Observation']]=subprocess.Popen([plan['Python']['path'],'-I','-S','-B',plan['CaptureHelper']['path'],str(path)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                event(root,'observation-ready-for-listening',observation=state['Observation'],phase=state['Phase'],profile=state['Profile'])
            for obsid,job in list(jobs.items()):
                if obsid=='readiness' or job.poll() is None:continue
                dest=io/'evidence'/(obsid+'.json')
                if dest.exists():continue
                receipt=root/'analysis'/obsid/'receipt.json';result=read(receipt)
                binding={k:result[k] for k in ['Session','Observation','Phase','Generation','Recording','Profile','Passed']};binding.update(Receipt=str(receipt),ReceiptSha256=sha(receipt))
                atomic(dest,binding,True)
                if not result['Passed']:
                    event(root,'capture-bundle-refused',observation=obsid,error=result.get('Error'))
                    if not stop_sent and not state['Finished']:command(root,state,'Stop','Capture evidence failed; no diagnostic continuation');stop_sent=True
                else:event(root,'capture-bundle-complete',observation=obsid,receipt=str(receipt),reviewImage=result['ReviewImage'])
            if state['Stage'] in ['DispatchReady','ReviewDurable'] and not focus:game.foreground(True)
            if state['Finished'] and not game_close and game.alive():
                event(root,'normal-game-exit-request',retired=state['Retired']);game.normal_close();game_close=True;finished_at=time.monotonic()
            if game_close and game.alive() and finished_at and time.monotonic()-finished_at>15:
                event(root,'normal-game-exit-needs-visible-ui',exception='normal close request has not closed the game; Codex must inspect the exact exit dialog')
                finished_at=None
            deadline=state['Deadline'];closure_due=deadline and now>=deadline+120*freq
            if not game.alive() or closure_due:
                event(root,'record-stop-intent',gameExited=not game.alive(),closureDeadlineReached=bool(closure_due))
                ws.call('StopRecord');stop_sent=True
                until=time.monotonic()+15
                while time.monotonic()<until and ws.call('GetRecordStatus')['outputActive']:time.sleep(.1)
                assert not ws.call('GetRecordStatus')['outputActive'],'record stop unconfirmed; no retry'
                atomic(root/'recording-finalized.json',dict(Session=session,Source=str(source),Bytes=source.stat().st_size,Sha256=sha(source),GameExited=not game.alive(),ClosureDeadlineReached=bool(closure_due)),True)
                ws.close();ws=None;obs.normal_close();obs_close=True
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
    assert scope['candidateName']=='candidate-07' and scope['sourceCommit']==plan['SourceCommit'] and scope['operator']['plan']['sha256']==sha(plan_path),'same sealed review client plan'
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
