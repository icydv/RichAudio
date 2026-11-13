"""Build only separately versioned private binaries; no historical overwrite."""
from pathlib import Path
import subprocess,sys,json,hashlib
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03i'
def build(name,fixtures=False):
    output=P/('fixtures' if fixtures else 'supervisor')/name;assert not output.exists();output.mkdir(parents=True)
    files=[R/'tools/native-control/private-profile03d/SupervisorPolicy03D.cs',R/'tools/native-control/private-profile/SupervisorProtocol.cs',R/'tools/native-control/private-profile03d/ExactIdentity.cs',Path(__file__).with_name('SupervisorMonitor03I.cs'),Path(__file__).with_name('FailureNotice03I.cs'),Path(__file__).with_name('NoticeDelivery.cs')]
    compiler=Path(r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe');assert hashlib.sha256(compiler.read_bytes()).hexdigest()=='46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00'
    binary=output/'RichAudio.Private03D.Supervisor.exe';args=[str(compiler),'/nologo','/optimize+','/warnaserror+','/langversion:5','/platform:x64','/target:exe','/main:RichAudio.GateA.Private01.Supervision.SupervisorMonitor','/r:System.Web.Extensions.dll','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/out:'+str(binary)]+(['/define:SUPERVISION_FIXTURES'] if fixtures else [])+list(map(str,files))
    subprocess.run(args,check=True)
    receipt=dict(binary=str(binary),sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),sources=[dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in files],fixtures=fixtures,liveAuthorized=False)
    with (output/'build.json').open('x') as f:json.dump(receipt,f,indent=2)
    print(json.dumps(receipt))
    return receipt
if __name__=='__main__':build(sys.argv[1],'--fixtures' in sys.argv)
