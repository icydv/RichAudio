from pathlib import Path
import importlib.util
from Toolchain import ROOT,PACKAGE,Processes
contract=None
processes=None
def configure(value,fixtures=False):
    global contract,processes
    contract=value;processes=Processes(value,fixtures)
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def require():
    if contract is None:raise RuntimeError('Toolchain admission must precede module startup')
    return contract
