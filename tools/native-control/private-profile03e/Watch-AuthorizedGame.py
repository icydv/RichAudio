"""Reuse the byte-pinned03D watcher; replace only preparation admission/root."""
from pathlib import Path
import sys,argparse
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from Admission import ROOT,PACKAGE,verify,load
import WindowsBaseline as windows
import uuid
sys.path.insert(0,str(ROOT/'tools/native-control/private-profile03d'))
watcher=load('retained03d_watcher',ROOT/'tools/native-control/private-profile03d/Watch-AuthorizedGame.py')
def verify_watch(digest):
    value=verify(digest)
    assert windows.compare(windows.read(PACKAGE/'windows-baseline.json'),windows.collect(PACKAGE/'watch-entry-windows'/uuid.uuid4().hex))
    return value
watcher.PACKAGE=PACKAGE;watcher.verify=verify_watch
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--approved-manifest-sha256',required=True)
    sys.exit(0 if watcher.main(parser.parse_args().approved_manifest_sha256) else 3)
