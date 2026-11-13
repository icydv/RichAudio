"""Rehost the unchanged03G evidence fixtures at03H roots, not a live retry."""
from pathlib import Path
import sys,types
R=Path(__file__).resolve().parents[1]
fixture=types.ModuleType('PrivateEvidenceFixture03G');fixture.__file__=str(R/'tests/PrivateEvidenceFixture03H.py')
text=(R/'tests/PrivateEvidenceFixture03G.py').read_text().replace('private-profile03g','private-profile03h').replace('Private03G.Toolchain.exe','Private03H.Toolchain.exe')
text=text.replace('self.w.subprocess=Context.processes','self.w.subprocess=Context.processes;self.w.query=__import__(\'MetadataQuery\').query')
exec(compile(text,fixture.__file__,'exec'),fixture.__dict__);sys.modules['PrivateEvidenceFixture03G']=fixture
source=R/'tests/Test-PrivateWorkflowTiming03G.py'
exec(compile(source.read_text(),str(source)+' [03H roots and metadata query]','exec'),dict(__file__=str(source),__name__='__main__'))
