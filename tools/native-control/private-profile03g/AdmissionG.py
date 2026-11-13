"""Exact provenance and authenticated live parent retaining immutable read leases."""
from pathlib import Path
import os,ctypes,re,json,csv
from Shared import ROOT,PACKAGE,tc,Context
PARENT='8840935d42cd3d3f2b0f80e48bc5fcc5de3d6be5'
read,sha=tc.read,tc.sha
def git(*args):return Context.processes.check_output(['git','--no-replace-objects',*args],cwd=ROOT,text=True,stdin=Context.processes.DEVNULL,stderr=Context.processes.PIPE,timeout=2).strip()
def provenance():
    p=read(PACKAGE/'provenance-policy.json')
    assert p['parent']==PARENT and p['preparation']=='GATE-A-SHVDNE-PRIVATE-03G'
    assert git('branch','--show-current')=='feature/migration-shvdne-01' and git('rev-parse','HEAD')==p['head'],'Unapproved branch/HEAD'
    assert git('rev-list','--parents','-n','1',p['head']).split()==[p['head'],PARENT],'Unexpected ancestry'
    assert not git('status','--porcelain=v1','--untracked-files=all'),'Dirty worktree'
    assert sorted(git('diff-tree','--no-commit-id','--name-only','-r',p['head']).splitlines())==sorted(p['changedSources']),'Unexpected commit scope'
    assert sha(ROOT/'.local/gate-a-shvdne-private-03f/execution-manifest.json')=='3189c49f63f6f817626cdef10cca844392c9ecc17cb3fe109ecc767099e65263'
    return p
def parent_pid():
    class Entry(ctypes.Structure):
        _fields_=[('size',ctypes.c_uint32),('usage',ctypes.c_uint32),('pid',ctypes.c_uint32),('heap',ctypes.c_size_t),('module',ctypes.c_uint32),('threads',ctypes.c_uint32),('parent',ctypes.c_uint32),('priority',ctypes.c_long),('flags',ctypes.c_uint32),('name',ctypes.c_wchar*260)]
    k=ctypes.WinDLL('kernel32',use_last_error=True);k.CreateToolhelp32Snapshot.restype=ctypes.c_void_p;k.CloseHandle.argtypes=[ctypes.c_void_p]
    h=k.CreateToolhelp32Snapshot(2,0);assert h not in [None,ctypes.c_void_p(-1).value]
    try:
        e=Entry();e.size=ctypes.sizeof(e)
        first=k.Process32FirstW;first.argtypes=[ctypes.c_void_p,ctypes.POINTER(Entry)];next_=k.Process32NextW;next_.argtypes=first.argtypes
        ok=first(h,ctypes.byref(e))
        while ok:
            if e.pid==os.getpid():return e.parent
            ok=next_(h,ctypes.byref(e))
        raise RuntimeError('Own parent identity unavailable')
    finally:k.CloseHandle(h)
def parent_lease(digest,manifest):
    nonce=os.environ.get('RA03G_NONCE','');assert re.fullmatch('[a-f0-9]{32}',nonce),'Native lease handoff required'
    path=PACKAGE/'runtime-leases'/(nonce+'.json');receipt=read(path)
    assert receipt['nonce']==nonce and receipt['manifestSha256']==digest and receipt['session']==manifest['session']
    assert receipt['toolchainSha256']==manifest['toolchainSha256'] and receipt['bindingsVerified']==len(manifest['bindings'])
    assert receipt['criticalFilesLocked']==len(Context.contract['files']) and receipt['shareMode']=='READ_ONLY_NO_WRITE_OR_DELETE'
    assert receipt['immutableFilesLocked']==len({x['path'].casefold() for x in manifest['bindings']+Context.contract['files']}),'Incomplete immutable input lease'
    assert receipt['pid']==parent_pid()==int(os.environ['RA03G_PARENT_PID']),'Not the verified direct parent'
    binary=Context.contract['programs']['supervisor']['path']
    observed=json.loads(Context.processes.check_output([binary,'--identity',str(receipt['pid'])],text=True,stderr=Context.processes.PIPE,timeout=2))
    expected=Context.contract['programs']['bootstrap']
    assert observed['CreationFileTime']==receipt['creationFileTime'] and observed['Sha256']==expected['sha256']==manifest['bootstrapSha256']
    assert observed['Executable'].casefold()==observed['CanonicalPath'].casefold()==expected['path'].casefold()
    assert observed['FileIdentity']==expected['fileIdentity'],'Parent executable identity changed'
    return receipt
def verify(digest):
    assert re.fullmatch('[a-f0-9]{64}',digest or '') and sha(PACKAGE/'execution-manifest.json')==digest,'Exact fresh03G seal required'
    m=read(PACKAGE/'execution-manifest.json')
    assert m['preparation']=='GATE-A-SHVDNE-PRIVATE-03G' and m['experiment']=='GATE-A-SHVDNE-PRIVATE-03D' and m['revision']=='evidence-batch-01'
    assert not m.get('qualificationOnly',False),'Qualification is not live admission'
    assert m['toolchainSha256']==sha(PACKAGE/'toolchain-manifest.json')
    parent_lease(digest,m)
    assert provenance()['head']==m['head'] and read(PACKAGE/'deployment-plan.json')['session']==m['session']
    assert m['probeSha256']=='fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0'
    assert m['supervisorSha256']=='b88ce28612e85e9362c7279e647d51b10cf23b43c4d663ea4061811728d13020'
    return m
def evidence_worker_closed():
    intent=PACKAGE/'execution-01/evidence-worker-intent.json'
    if not intent.exists():return True
    started=read(intent);assert started['manifestSha256']==sha(PACKAGE/'execution-manifest.json') and started['oneUse']
    nonce=started['nonce'];assert re.fullmatch('[a-f0-9]{32}',nonce)
    lease=read(PACKAGE/'runtime-leases'/(nonce+'.json'));closed=read(PACKAGE/'runtime-leases'/(nonce+'.json.closed.json'))
    assert lease['session']==started['session'] and lease['manifestSha256']==started['manifestSha256'] and lease['pid']==started['pid'] and lease['creationFileTime']==started['creationFileTime']
    assert closed['normalChildClosure'] and closed['exitCode'] in [0,2,3],'Unproven normal analysis-child closure'
    rows=csv.reader(Context.processes.check_output(['tasklist.exe','/fi','PID eq '+str(started['pid']),'/fo','csv','/nh'],text=True).splitlines())
    if any(len(r)>1 and r[1]==str(started['pid']) for r in rows):
        observed=json.loads(Context.processes.check_output([Context.contract['programs']['supervisor']['path'],'--identity',str(started['pid'])],text=True))
        assert observed['CreationFileTime']!=started['creationFileTime'],'Evidence worker still active'
    assert not list((PACKAGE/'execution-01').rglob('pending-detector-closure.json')),'Unproven detector-child closure; preserve for review'
    return True
