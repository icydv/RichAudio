"""Real early-exit/malformed-response fixtures; no game or UI is started."""
from pathlib import Path
import importlib.util,json,os,subprocess,sys,threading,time
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];S=R/'tools/native-control/private-profile03d';P=R/'.local/gate-a-shvdne-private-03d'
sys.path.insert(0,str(S));spec=importlib.util.spec_from_file_location('watcher03d',S/'Watch-AuthorizedGame.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
run=sys.argv[1];T=P/('watcher-tests-'+run);T.mkdir();binary=Path(sys.argv[2]).resolve();cases=[]
def write(p,v):
    with p.open('x') as f:json.dump(v,f)
def check(name,ok):assert ok,name;cases.append(name);print('PASS '+name,flush=True)
stub=T/'ResponseFixture.cs'
stub.write_text(r'''using System;using System.IO;using System.Diagnostics;using System.Web.Script.Serialization;
class ResponseFixture {static int Main(string[] a){
 if(a[0]=="--failure-notice"){using(var child=Process.Start(new ProcessStartInfo(@"BINARY", "--failure-notice \""+a[1]+"\""){UseShellExecute=false,CreateNoWindow=true})) {child.WaitForExit();return child.ExitCode;}}
 var c=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(a[1]));
 string dir=Path.GetDirectoryName(a[1]), mode=File.ReadAllText(Path.Combine(dir,"fixture-mode"));
 Console.Error.WriteLine("AUTHORED_ORIGINAL_REJECTION "+mode);Console.Error.Flush();
 if(mode=="early-exit")return 17;
 if(mode=="malformed"){string run=Path.Combine((string)c["EvidenceRoot"],"runs",(string)c["Session"]);Directory.CreateDirectory(run);File.WriteAllText(Path.Combine(run,"ready.json"),"{");}
 Console.ReadLine();return 19;
}}'''.replace('BINARY',str(binary)))
fake=T/'RichAudio.ResponseFixture.exe'
subprocess.run([str(Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),'/nologo','/r:System.Web.Extensions.dll','/out:'+str(fake),str(stub)],check=True)
for mode in ['early-exit','malformed','missing-response']:
    scope=T/mode;scope.mkdir();(scope/'fixture-mode').write_text(mode)
    child=subprocess.Popen([sys.executable,'-B','-c','import sys;sys.stdin.readline()'],stdin=subprocess.PIPE,text=True)
    i=w.query(binary,'--identity',child.pid)
    c=dict(Schema=1,Session=os.urandom(16).hex(),Mode='offline-fixture',ProcessId=child.pid,ProcessStartUtcTicks=i['CreationUtcTicks'],Executable=i['Executable'],ExecutableSha256=i['Sha256'],ExpectedIdentity=i,EvidenceRoot=str(scope/'evidence'),ShowUi=False,Restoration=[dict(Path=str(scope/'absent'),Absent=True)])
    config=scope/'config.json';write(config,c)
    def close():
        if child.poll() is None:child.stdin.write('normal fixture exit\n');child.stdin.flush()
    timer=threading.Timer(3,close);timer.start()
    try:
        check('failed-not-admitted-'+mode,not w.supervise(fake,config,scope))
        row=json.loads((scope/'supervisor-exit.json').read_text())
        check('actual-exit-code-'+mode,row['exitCode']==(17 if mode=='early-exit' else 19))
        check('original-stderr-'+mode,'AUTHORED_ORIGINAL_REJECTION '+mode in row['stderr'])
        check('no-secondary-jsondecode-'+mode,'JSONDecodeError' not in row['originalRejection'])
        check('stop-only-notice-'+mode,(scope/'failure-notice-started.json').is_file() and not (scope/'watcher-ready.json').exists())
        check('one-attachment-'+mode,json.loads((scope/'supervisor-started.json').read_text())['attachmentNumber']==1)
        child.wait(timeout=5)
    finally:timer.cancel();close();child.wait(timeout=5)

# Already-expired failure origins must not acquire a fresh exit/ack window.
for age,label in [(6,'missing-ack'),(61,'exit-overrun')]:
    scope=T/label;scope.mkdir();child=subprocess.Popen([sys.executable,'-B','-c','import sys;sys.stdin.readline()'],stdin=subprocess.PIPE,text=True)
    i=w.query(binary,'--identity',child.pid)
    import ctypes
    frequency=ctypes.c_longlong();ctypes.windll.kernel32.QueryPerformanceFrequency(ctypes.byref(frequency))
    c=dict(Schema=1,Session=os.urandom(16).hex(),Mode='offline-fixture',ProcessId=child.pid,ProcessStartUtcTicks=i['CreationUtcTicks'],Executable=i['Executable'],EvidenceRoot=str(scope/'evidence'),ShowUi=False,Restoration=[dict(Path=str(scope/'absent'),Absent=True)],FailureQpc=w.qpc()-age*frequency.value,FailureReason='authored overdue failure')
    config=scope/'config.json';write(config,c)
    notice=subprocess.Popen([str(binary),'--failure-notice',str(config)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
    time.sleep(.15);child.stdin.write('normal exit\n');child.stdin.flush();child.wait(timeout=4)
    check('stop-only-normal-close-'+label,notice.wait(timeout=4)==3)
    events=[json.loads(line) for p in (scope/'evidence').rglob('events.jsonl') for line in p.read_text().splitlines()]
    last=events[-1]['detail']
    check('deadline-retained-'+label,last['notificationOverdue'] and (age!=61 or last['exitDeadlineViolated']))
write(T/'result.json',dict(passed=True,checks=cases))
print('PASS',len(cases),'watcher/stop-only process checks')
