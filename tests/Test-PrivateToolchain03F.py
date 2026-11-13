"""Fail closed for isolated contract mutations; never modifies admitted runtimes."""
from pathlib import Path
import sys,copy,json,subprocess,uuid
from unittest.mock import patch
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];S=R/'tools/native-control/private-profile03f';sys.path.insert(0,str(S))
import Toolchain as t
import Context
c=t.load(sys.argv[1]);Context.configure(c,True)
P=t.PACKAGE;T=P/'fixtures'/('toolchain-'+uuid.uuid4().hex);T.mkdir(parents=True);checks=[]
def check(name,ok):assert ok,name;checks.append(name);print('PASS '+name,flush=True)
def refuse(name,action,contains=None):
    try:action()
    except Exception as error:
        assert contains is None or contains in str(error),(name,str(error));check(name,True)
    else:raise AssertionError('Accepted '+name)
check('full-retained-contract-load',t.load(sys.argv[1])==c)
check('actual-PowerShell-startup',t.startup(c)['version']=='7.6.9')
check('explicit-WindowsPS-alias-routes-PS7',Context.processes.resolve(['powershell.exe','-NoProfile'])[0]==c['programs']['powershell']['path'])
refuse('unknown-PATH-program',lambda:Context.processes.resolve(['authored-poison.exe']))
refuse('unapproved-Python-absolute-path',lambda:Context.processes.resolve([r'C:\Python312\python.exe']))
refuse('shell-fallback',lambda:Context.processes.options(dict(shell=True)))
refuse('executable-override',lambda:Context.processes.options(dict(executable=r'C:\unexpected.exe')))
for role in ['python','powershell']:
    row=copy.deepcopy(c['programs'][role]);row['path']=str(T/role/'missing.exe')
    refuse('missing-'+role,lambda:t.check(row),'TOOLCHAIN_MISSING')
file=T/'authored-dependency.dll';file.write_bytes(b'original authored fixture');pin=t.pin(file);t.check(pin)
file.write_bytes(b'modified authored fixture');refuse('modified-support-library',lambda:t.check(pin),'TOOLCHAIN_CHANGED')
for role in ['python','powershell']:
    row=copy.deepcopy(c['programs'][role]);row['sha256']='0'*64;refuse('changed-executable-'+role,lambda:t.check(row),'TOOLCHAIN_CHANGED')
# Contract behavior: expensive real file validation already passed above. Mutate
# only an in-memory copy, preserving the complete retained tree and all seals.
def contract_test(name,mutate,contains):
    value=copy.deepcopy(c);mutate(value)
    with patch.object(t,'read',lambda p:value),patch.object(t,'check',lambda p:None):refuse(name,lambda:t.load(sys.argv[1]),contains)
contract_test('incorrect-Python-version',lambda x:x['programs']['python'].update(version=[3,13,0]),'PYTHON_VERSION_ARCHITECTURE')
contract_test('unexpected-canonical-path',lambda x:x['programs']['python'].update(canonicalPath=r'C:\substitution.exe'),'TOOL_IDENTITY_PATH_CHANGED')
contract_test('replaced-file-identity',lambda x:x['programs']['powershell'].update(fileIdentity='wrong'),'TOOL_IDENTITY_PATH_CHANGED')
contract_test('stale-WindowsApps-path',lambda x:x['programs']['python'].update(path=r'C:\Program Files\WindowsApps\Retired\python.exe'),'TOOL_IDENTITY_PATH_CHANGED')
contract_test('unexpected-added-runtime-file',lambda x:x['files'].pop(next(i for i,z in enumerate(x['files']) if Path(z['path']).is_relative_to(Path(x['roots']['python'])))),'UNEXPECTED_RUNTIME_FILES')
for label,row in [('wrong-version',dict(version='5.1.0',path=c['programs']['powershell']['path'],clr='10.0.14')),('wrong-clr',dict(version='7.6.9',path=c['programs']['powershell']['path'],clr='9.0.0')),('wrong-path',dict(version='7.6.9',path='C:\\wrong.exe',clr='10.0.14'))]:
    with patch.object(t.REAL,'run',return_value=subprocess.CompletedProcess([],0,json.dumps(row),'')):refuse('PowerShell-'+label,lambda:t.startup(c),'POWERSHELL_VERSION_PATH')
for label,code,out,err in [('nonzero',23,'','AUTHORED_STARTUP_ERROR'),('empty',0,'',''),('malformed',0,'{','AUTHORED_PARSE_ERROR')]:
    with patch.object(t.REAL,'run',return_value=subprocess.CompletedProcess([],code,out,err)):refuse('startup-'+label,lambda:t.startup(c),'POWERSHELL_STARTUP')
script=T/'authored-failure.py';script.write_text("import sys,os,json\nprint(json.dumps(dict(cwd=os.getcwd(),path=sys.executable,isolated=sys.flags.isolated)))\nprint('AUTHORED_SCRIPT_FAILURE',file=sys.stderr)\nsys.exit(29)\n")
result=Context.processes.run(['python',str(script)],capture_output=True,text=True)
row=json.loads(result.stdout);check('actual-script-error-and-code-preserved',result.returncode==29 and 'AUTHORED_SCRIPT_FAILURE' in result.stderr)
check('actual-subprocess-executable-cwd-isolation',row==dict(cwd=str(R),path=c['programs']['python']['path'],isolated=1))
ps_script=T/'authored-failure.ps1';ps_script.write_text("[Console]::Error.WriteLine('AUTHORED_POWERSHELL_FAILURE'); exit 31\n")
result=Context.processes.run(['pwsh','-NoProfile','-File',str(ps_script)],capture_output=True,text=True)
check('actual-PowerShell-script-error-preserved',result.returncode==31 and 'AUTHORED_POWERSHELL_FAILURE' in result.stderr)
env=t.environment(c);check('per-child-environment-no-package-path',all('windowsapps' not in env.get(k,'').casefold() for k in ['PATH','PSModulePath','DOTNET_ROOT']))
with patch.dict(t.os.environ,dict(GIT_DIR=r'C:\unapproved-repository',CORECLR_ENABLE_PROFILING='1',DOTNET_STARTUP_HOOKS='unapproved.dll')):
    env=t.environment(c);check('child-injection-environment-cleared',not any(k in env for k in ['GIT_DIR','CORECLR_ENABLE_PROFILING','DOTNET_STARTUP_HOOKS']))
    check('parent-environment-preserved',t.os.environ['CORECLR_ENABLE_PROFILING']=='1')
tc=t.pin(P/'Private03F.Toolchain.exe');check('compiled-launcher-available',tc['bytes']>0)
for args,label in [(['chain-check','--toolchain-sha256','0'*64],'wrong-contract-digest'),(['install','--toolchain-sha256',sys.argv[1]],'qualification-cannot-install'),(['install','--manifest-sha256','0'*64],'install-requires-explicit-approval')]:
    result=subprocess.run([tc['path'],*args],capture_output=True,text=True,timeout=10);check('actual-native-bootstrap-'+label,result.returncode==3 and 'PRIVATE03F_ADMISSION_FAILED' in result.stderr)
# Invoke the compiled bootstrap against malformed contracts in an owned test
# directory via reflection. Only Package is redirected; executable identities
# still refer to the real retained programs. No success/mutation mode is used.
host=T/'BootstrapNegative.cs';exe=T/'BootstrapNegative.exe'
host.write_text('''using System;using System.Reflection;class Fixture {static int Main(string[] a){var t=Assembly.LoadFile(a[0]).GetType("Launcher03F");t.GetField("Package",BindingFlags.Static|BindingFlags.NonPublic).SetValue(null,a[1]);if(a.Length==4)t.GetField("Repo",BindingFlags.Static|BindingFlags.NonPublic).SetValue(null,a[3]);return (int)t.GetMethod("Main").Invoke(null,new object[]{new string[]{"chain-check","--toolchain-sha256",a[2]}});}}''')
Context.processes.run([c['programs']['compiler']['path'],'/nologo','/platform:x64','/out:'+str(exe),str(host)],check=True)
for label,mutate,expected in [
 ('architecture-declaration',lambda v:v['programs']['python'].update(architecture='x86'),'TOOLCHAIN_ARCHITECTURE_DECLARATION'),
 ('missing-Python',lambda v:v['files'].insert(0,dict(c['programs']['python'],path=str(T/'absent-python.exe'))),'TOOLCHAIN_MISSING'),
 ('missing-PowerShell',lambda v:v['files'].insert(0,dict(c['programs']['powershell'],path=str(T/'absent-pwsh.exe'))),'TOOLCHAIN_MISSING'),
 ('binary-replacement',lambda v:v['files'][0].update(sha256='0'*64),'TOOLCHAIN_CHANGED'),
 ('unexpected-path',lambda v:v['programs']['python'].update(path=r'C:\\Python312\\python.exe'),'TOOLCHAIN_MISSING'),
 ('canonical-substitution',lambda v:v['programs']['python'].update(canonicalPath=r'C:\\substituted.exe'),'TOOL_IDENTITY_CHANGED')]:
    scope=T/label;scope.mkdir();v=dict(schema=c['schema'],repository=c['repository'],files=[copy.deepcopy(c['programs']['python']),copy.deepcopy(c['programs']['powershell'])],programs=copy.deepcopy(c['programs']))
    mutate(v);t.save(scope/'toolchain-manifest.json',v)
    result=Context.processes.run([str(exe),tc['path'],str(scope),t.sha(scope/'toolchain-manifest.json')],capture_output=True,text=True)
    check('compiled-bootstrap-'+label,result.returncode==3 and expected in result.stderr)
scope=T/'actual-x86-PE';scope.mkdir();v=copy.deepcopy(c);v['repository']=str(scope);v['files']=[]
for role,name in [('python','python.exe'),('powershell','pwsh.exe')]:
    file=scope/'.local/toolchains/private03f-01'/role/name;file.parent.mkdir(parents=True)
    if role=='python':
        import struct
        payload=bytearray(80);payload[:2]=b'MZ';struct.pack_into('<I',payload,0x3c,64);payload[64:68]=b'PE\0\0';struct.pack_into('<H',payload,68,0x14c);file.write_bytes(payload)
    else:file.write_bytes(Path(c['programs'][role]['path']).read_bytes())
    row=dict(t.pin(file),**t.identity(file),architecture='x64');v['programs'][role]=row;v['files'].append(row)
t.save(scope/'toolchain-manifest.json',v)
result=Context.processes.run([str(exe),tc['path'],str(scope),t.sha(scope/'toolchain-manifest.json'),str(scope)],capture_output=True,text=True)
check('compiled-bootstrap-rejects-actual-x86-PE',result.returncode==3 and 'TOOLCHAIN_ARCHITECTURE' in result.stderr)
t.save(T/'result.json',dict(passed=True,count=len(checks),checks=checks,scope='Real retained startup and subprocess failure; in-memory malformed-contract tests; no admitted runtime modification',gameLaunched=False))
print('PASS',len(checks),'stable-toolchain checks')
