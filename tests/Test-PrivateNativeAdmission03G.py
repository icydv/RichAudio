from pathlib import Path
import sys,json,uuid,subprocess,copy,hashlib
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'tools/native-control/private-profile03g'));sys.dont_write_bytecode=True
from Shared import tc,PACKAGE,configure,Context
c=tc.load(tc.sha(PACKAGE/'toolchain-manifest.json'));configure(c,True);T=PACKAGE/'fixtures'/('native-admission-'+uuid.uuid4().hex);T.mkdir();checks=[]
def check(name,value):assert value,name;checks.append(name);print('PASS '+name,flush=True)
host=T/'Probe.cs';exe=T/'Probe.exe';host.write_text('''using System;using System.IO;using System.Reflection;class Probe {static int Main(string[] a){var t=Assembly.LoadFile(a[0]).GetType("Launcher03G");if(a[1]=="hash"){Console.WriteLine(t.GetMethod("Hash",BindingFlags.Static|BindingFlags.NonPublic,null,new Type[]{typeof(string)},null).Invoke(null,new object[]{a[2]}));return 0;}t.GetField("Package",BindingFlags.Static|BindingFlags.NonPublic).SetValue(null,a[1]);return (int)t.GetMethod("Main").Invoke(null,new object[]{new string[]{"rehearse","--qualification-manifest-sha256",a[2]}});}}''')
Context.processes.run([c['programs']['compiler']['path'],'/nologo','/platform:x64','/out:'+str(exe),str(host)],check=True)
binary=PACKAGE/'Private03G.Toolchain.exe'
for size in [0,1,3,4096,65535,1048576,8388611]:
    path=T/('hash-'+str(size));data=(bytes(range(251))*(size//251+1))[:size];path.write_bytes(data)
    result=Context.processes.check_output([str(exe),str(binary),'hash',str(path)],text=True).strip();check('CNG-SHA256-identical-'+str(size),result==hashlib.sha256(data).hexdigest())
for kind in ['modified-input','missing-dependency','wrong-python-architecture','stale-contract']:
    scope=T/kind;scope.mkdir();file=scope/'authored-dependency';file.write_bytes(b'authored expected input');row=tc.pin(file)
    contract=dict(schema=c['schema'],repository=str(R),files=[row],programs=copy.deepcopy(c['programs']))
    if kind=='wrong-python-architecture':contract['programs']['python']['architecture']='x86'
    tc.save(scope/'toolchain-manifest.json',contract)
    m=dict(preparation='GATE-A-SHVDNE-PRIVATE-03G',qualificationOnly=True,toolchainSha256=tc.sha(scope/'toolchain-manifest.json'),bindings=[row],session='e'*32)
    if kind=='stale-contract':m['toolchainSha256']='0'*64
    tc.save(scope/'qualification-manifest.json',m)
    if kind=='modified-input':file.write_bytes(b'changed input')
    if kind=='missing-dependency':file.rename(scope/'preserved-removed-dependency')
    result=Context.processes.run([str(exe),str(binary),str(scope),tc.sha(scope/'qualification-manifest.json')],capture_output=True,text=True)
    check('native-refuses-'+kind,result.returncode==3 and 'PRIVATE03G_ADMISSION_FAILED' in result.stderr and not (scope/'runtime-leases').exists())
for args,name in [(['install','--manifest-sha256','0'*64],'installation-without-fresh-approval'),(['install','--qualification-manifest-sha256','0'*64],'qualification-cannot-install')]:
    result=Context.processes.run([str(binary),*args],capture_output=True,text=True);check(name,result.returncode==3 and not (PACKAGE/'execution-01').exists())
tc.save(T/'result.json',dict(passed=True,count=len(checks),checks=checks))
print('PASS',len(checks),'native hash and admission checks')
