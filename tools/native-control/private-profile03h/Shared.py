"""Fixed03H roots over the byte-identical retained03F toolchain implementation."""
from pathlib import Path
import sys,importlib.util
ROOT=Path(__file__).resolve().parents[3]
PACKAGE=ROOT/'.local/gate-a-shvdne-private-03h'
sys.path.insert(0,str(ROOT/'tools/native-control/private-profile03f'))
sys.path.append(str(ROOT/'tools/native-control/private-profile03g'))
import Toolchain as tc
tc.PACKAGE=PACKAGE
import Context
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def configure(contract,fixtures=False):
    Context.configure(contract,fixtures)
    admission=load('AdmissionH',Path(__file__).with_name('AdmissionH.py'))
    sys.modules['AdmissionF']=admission
    return admission
