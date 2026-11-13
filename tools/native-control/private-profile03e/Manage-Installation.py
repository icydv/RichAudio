"""Versioned preparation wrapper; unchanged03D transaction and recovery code."""
from pathlib import Path
import sys,argparse,uuid
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from Admission import ROOT,PACKAGE,verify,provenance,load
import WindowsBaseline as windows
sys.path.insert(0,str(ROOT/'tools/native-control/private-profile03d'))
d=load('retained03d_manager',ROOT/'tools/native-control/private-profile03d/Manage-Installation.py')
P=PACKAGE
d.P=P;d.verify_provenance=provenance
base=d.base
read,sha,no_links=d.read,d.sha,d.no_links
file_identity,prefix_matches=d.file_identity,d.prefix_matches
class Installation(d.Installation):
    def __init__(self,fixture=None):
        d.P=P;d.legacy.P=P;base.P=P;base.old.P=P
        super().__init__(fixture)
    def preflight(self):
        assert super().preflight()
        if not self.fixture:
            expected=windows.read(P/'windows-baseline.json')
            observed=windows.collect(P/'preflight-windows'/uuid.uuid4().hex)
            assert windows.compare(expected,observed)
        return True
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('operation',choices=['preflight','install','restore','verify']);parser.add_argument('--manifest-sha256');parser.add_argument('--approved-manifest-sha256');a=parser.parse_args()
    if a.operation in ['install','restore']:assert a.approved_manifest_sha256,'Fresh explicit PRIVATE03E approval required'
    verify(a.approved_manifest_sha256 or a.manifest_sha256)
    getattr(Installation(),a.operation)()
    print('PASS PRIVATE03E '+a.operation+'; no application launched')
