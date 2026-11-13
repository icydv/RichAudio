"""Only the retained, explicitly qualified toolchain; no PATH-based fallback."""
from pathlib import Path
import sys,os,json,hashlib,subprocess,struct,ctypes,msvcrt
ROOT=Path(__file__).resolve().parents[3];PACKAGE=ROOT/'.local/gate-a-shvdne-private-03f'
REAL=subprocess
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(p,value):
    with Path(p).open('x',encoding='utf-8') as f:json.dump(value,f,indent=2)
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def pin(p):p=Path(p);return dict(path=str(p),bytes=p.stat().st_size,sha256=sha(p))
def identity(path):
    class Info(ctypes.Structure):
        _pack_=4
        _fields_=[('attributes',ctypes.c_uint32),('creation',ctypes.c_uint64),('access',ctypes.c_uint64),('write',ctypes.c_uint64),('volume',ctypes.c_uint32),('high',ctypes.c_uint32),('low',ctypes.c_uint32),('links',ctypes.c_uint32),('indexHigh',ctypes.c_uint32),('indexLow',ctypes.c_uint32)]
    with Path(path).open('rb') as file:
        handle=ctypes.c_void_p(msvcrt.get_osfhandle(file.fileno()));info=Info();buf=ctypes.create_unicode_buffer(32768)
        get=ctypes.windll.kernel32.GetFinalPathNameByHandleW;get.argtypes=[ctypes.c_void_p,ctypes.c_wchar_p,ctypes.c_uint,ctypes.c_uint];get.restype=ctypes.c_uint
        assert ctypes.windll.kernel32.GetFileInformationByHandle(handle,ctypes.byref(info)) and 0<get(handle,buf,len(buf),0)<len(buf)
        canonical=buf.value[4:] if buf.value.startswith('\\\\?\\') else buf.value
        return dict(canonicalPath=canonical,fileIdentity=f'{info.volume:08x}:{info.indexHigh:08x}{info.indexLow:08x}')
def check(item):
    p=Path(item['path'])
    for q in [p,*p.parents]:
        if q.exists() and q.lstat().st_file_attributes&0x400:raise RuntimeError('TOOLCHAIN_LINK '+str(q))
    if not p.is_file():raise FileNotFoundError('TOOLCHAIN_MISSING '+str(p))
    if p.stat().st_size!=item['bytes'] or sha(p)!=item['sha256']:raise RuntimeError('TOOLCHAIN_CHANGED '+str(p))
def load(digest):
    p=PACKAGE/'toolchain-manifest.json'
    if sha(p)!=digest:raise RuntimeError('TOOLCHAIN_CONTRACT_DIGEST')
    c=read(p)
    if c['schema']!='Private03FStableToolchain01' or c['repository']!=str(ROOT):raise RuntimeError('TOOLCHAIN_SCOPE')
    for f in c['files']:check(f)
    for role in ['python','powershell']:
        program=c['programs'][role];expected=ROOT/'.local/toolchains/private03f-01'/role/('python.exe' if role=='python' else 'pwsh.exe')
        if Path(program['path'])!=expected or identity(expected)!={k:program[k] for k in ['canonicalPath','fileIdentity']}:raise RuntimeError('TOOL_IDENTITY_PATH_CHANGED '+role)
    if Path(sys.executable).resolve()!=Path(c['programs']['python']['path']).resolve():raise RuntimeError('UNAPPROVED_PYTHON '+sys.executable)
    if '.windowsapps' in sys.executable.casefold() or '\\windowsapps\\' in sys.executable.casefold():raise RuntimeError('AUTO_VERSIONED_RUNTIME')
    if list(sys.version_info[:3])!=c['programs']['python']['version'] or struct.calcsize('P')*8!=64:raise RuntimeError('PYTHON_VERSION_ARCHITECTURE')
    if not sys.flags.isolated or not sys.flags.no_site or not sys.dont_write_bytecode:raise RuntimeError('PYTHON_ISOLATION_REQUIRED')
    for role in ['python','powershell']:
        directory=Path(c['roots'][role]);expected={str(Path(x['path']).relative_to(directory)).casefold() for x in c['files'] if Path(x['path']).is_relative_to(directory)}
        actual={str(x.relative_to(directory)).casefold() for x in directory.rglob('*') if x.is_file()}
        if actual!=expected:raise RuntimeError('UNEXPECTED_RUNTIME_FILES '+role+' '+str(sorted(actual^expected)[:10]))
    return c
def environment(c):
    e=dict(os.environ);cache=PACKAGE/'runtime-cache';cache.mkdir(exist_ok=True)
    for k in list(e):
        if k.upper().startswith(('GIT_','DOTNET_','COMPLUS_','CORECLR_','COR_PROFILER','COR_ENABLE_PROFILING')) or k.upper() in ['PYTHONPATH','PYTHONHOME','NODE_OPTIONS','NODE_PATH']:e.pop(k,None)
    ps=Path(c['programs']['powershell']['path']).parent
    e.update(TEMP=str(cache),TMP=str(cache),PSModulePath=str(ps/'Modules'),PSModuleAnalysisCachePath=str(cache/'PSAnalysisCache'),DOTNET_ROOT=str(ps),DOTNET_MULTILEVEL_LOOKUP='0',PATH=r'C:\Windows\System32',PYTHONDONTWRITEBYTECODE='1',GIT_OPTIONAL_LOCKS='0')
    return e
def startup(c):
    ps=c['programs']['powershell']
    command="[ordered]@{version=$PSVersionTable.PSVersion.ToString();path=(Get-Process -Id $PID).Path;home=$PSHOME;clr=[Environment]::Version.ToString();policy=(Get-ExecutionPolicy).ToString()}|ConvertTo-Json -Compress"
    r=REAL.run([ps['path'],'-NoLogo','-NoProfile','-NonInteractive','-Command',command],cwd=ROOT,env=environment(c),capture_output=True,text=True,timeout=15)
    if r.returncode:raise RuntimeError('POWERSHELL_STARTUP '+str(r.returncode)+' '+r.stderr)
    if not r.stdout.strip():raise RuntimeError('POWERSHELL_STARTUP_EMPTY_RESPONSE '+r.stderr)
    try:row=json.loads(r.stdout)
    except ValueError as e:raise RuntimeError('POWERSHELL_STARTUP_MALFORMED_RESPONSE '+r.stdout+' '+r.stderr) from e
    if row['path'].casefold()!=ps['path'].casefold() or row['version']!=ps['version'] or row['clr']!=ps['clr']:raise RuntimeError('POWERSHELL_VERSION_PATH '+str(row))
    if tuple(map(int,row['version'].split('.')[:2]))<(7,5):raise RuntimeError('POWERSHELL_75_REQUIRED')
    return row
class Processes:
    def __init__(self,c,fixtures=False):self.c=c;self.fixtures=fixtures
    def resolve(self,args):
        if not isinstance(args,(list,tuple)) or not args:raise RuntimeError('EXPLICIT_ARGUMENT_VECTOR_REQUIRED')
        name=str(args[0]);aliases={'python':'python','python.exe':'python','pwsh':'powershell','pwsh.exe':'powershell','powershell.exe':'powershell','git':'git','git.exe':'git','node':'node','node.exe':'node','tasklist.exe':'tasklist','fsutil.exe':'fsutil'}
        role=aliases.get(name.casefold())
        if role:item=self.c['programs'][role];check(item);name=item['path']
        else:
            matches=[x for x in self.c['programs'].values() if str(x['path']).casefold()==name.casefold()]
            if matches:check(matches[0]);name=matches[0]['path']
            elif self.fixtures and Path(name).is_absolute() and Path(name).is_relative_to(PACKAGE/'fixtures'):pass
            else:raise RuntimeError('UNAPPROVED_SUBPROCESS '+name)
        values=[name,*args[1:]]
        if name.casefold()==self.c['programs']['python']['path'].casefold() and '-I' not in values[1:]:values[1:1]=['-I','-S','-B']
        return values
    def options(self,kw):
        if kw.get('shell'):raise RuntimeError('SHELL_FALLBACK_FORBIDDEN')
        if kw.get('executable'):raise RuntimeError('EXECUTABLE_OVERRIDE_FORBIDDEN')
        kw['env']=environment(self.c);kw.setdefault('cwd',ROOT);return kw
    def run(self,args,**kw):return REAL.run(self.resolve(args),**self.options(kw))
    def check_output(self,args,**kw):return REAL.check_output(self.resolve(args),**self.options(kw))
    def Popen(self,args,**kw):return REAL.Popen(self.resolve(args),**self.options(kw))
    def __getattr__(self,k):
        if k in ['PIPE','DEVNULL','STDOUT','CREATE_NO_WINDOW','CalledProcessError','TimeoutExpired']:return getattr(REAL,k)
        raise AttributeError('Unsupported subprocess API '+k)
