from pathlib import Path
import sys,uuid
import Context
from AdmissionF import ROOT,PACKAGE,verify
Context.require();sys.path.insert(0,str(ROOT/'tools/native-control/private-profile03d'))
watcher=Context.load('unchanged03d_watcher_f',ROOT/'tools/native-control/private-profile03d/Watch-AuthorizedGame.py')
windows=Context.load('unchanged_windows_policy_f',ROOT/'tools/native-control/private-profile03e/WindowsBaseline.py')
watcher.PACKAGE=PACKAGE;watcher.subprocess=Context.processes
windows.PACKAGE=PACKAGE;windows.subprocess=Context.processes
def verify_watch(digest):
    value=verify(digest)
    assert windows.compare(windows.read(PACKAGE/'windows-baseline.json'),windows.collect(PACKAGE/'watch-entry-windows'/uuid.uuid4().hex))
    return value
watcher.verify=verify_watch
def main(digest):return watcher.main(digest)
