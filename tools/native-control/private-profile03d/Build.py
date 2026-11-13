"""Compile the03D monitor; historical files and shared protocol stay unchanged."""
from pathlib import Path
import json,subprocess,hashlib,os
ROOT=Path(__file__).resolve().parents[3]
SOURCE=Path(__file__).resolve().parent
PACKAGE=ROOT/'.local/gate-a-shvdne-private-03d'

def build(output):
    output=Path(output).resolve()
    assert output.is_relative_to(PACKAGE) and not output.exists()
    output.mkdir(parents=True)
    original=ROOT/'tools/native-control/private-profile'
    files=[SOURCE/'SupervisorPolicy03D.cs',original/'SupervisorProtocol.cs',SOURCE/'ExactIdentity.cs',SOURCE/'FailureNotice.cs',SOURCE/'SupervisorMonitor03D.cs']
    binary=output/'RichAudio.Private03D.Supervisor.exe'
    compiler=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    common=[str(compiler),'/nologo','/optimize+','/warnaserror+','/langversion:5','/platform:x64','/target:exe','/r:System.Web.Extensions.dll','/r:System.Windows.Forms.dll','/r:System.Drawing.dll']
    subprocess.run(common+['/main:RichAudio.GateA.Private01.Supervision.SupervisorMonitor','/out:'+str(binary),*map(str,files)],check=True)
    receipt=dict(binary=str(binary),sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),sources=[dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in files],authorizedForLive=False)
    with (output/'build.json').open('x') as f:json.dump(receipt,f,indent=2)
    return receipt

if __name__=='__main__':
    import sys
    print(json.dumps(build(sys.argv[1])))
