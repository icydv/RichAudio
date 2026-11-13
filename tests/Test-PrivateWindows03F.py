"""Unchanged exact Windows policy; only approved interpreter and output root."""
from pathlib import Path
import sys
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'tools/native-control/private-profile03f'))
import Toolchain as t
import Context
c=t.load(sys.argv[1]);Context.configure(c,True);run=sys.argv[2]
path=R/'tests/Test-PrivateWindows03E.py'
source=path.read_text().replace('P=w.PACKAGE;T=',"w.PACKAGE=t.PACKAGE;w.subprocess=Context.processes\nP=w.PACKAGE;T=")
sys.argv=[str(path),run]
exec(compile(source,str(path)+' [03F interpreter/output only]','exec'),dict(__file__=str(path),__name__='__main__',Context=Context,t=t))
