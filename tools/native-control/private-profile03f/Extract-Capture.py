"""New root/entry only; unchanged03C decoder, timeline and source-integrity rules."""
from pathlib import Path
import sys
import Context
from Toolchain import ROOT,PACKAGE
Context.require();sys.path.insert(0,str(ROOT/'tools/native-control/private-profile03c'))
extractor=Context.load('unchanged_capture03c_f',ROOT/'tools/native-control/private-profile03c/Extract-Capture03C.py')
extractor.P=PACKAGE
def main(args):
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('target',type=Path);parser.add_argument('--start',type=float,required=True);parser.add_argument('--duration',type=float,required=True);parser.add_argument('--offline-fixture',action='store_true');a=parser.parse_args(args)
    value=extractor.extract(a.source,a.target,a.start,a.duration,a.offline_fixture)
    return 0 if value['containerContinuityPassed'] else 2
