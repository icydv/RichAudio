"""Run the unchanged evidence timing cases at the separately versioned03I root."""
from pathlib import Path
import sys,types
R=Path(__file__).resolve().parents[1]
fixture=types.ModuleType('PrivateEvidenceFixture03G');fixture.__file__=str(R/'tests/PrivateEvidenceFixture03I.py')
text=(R/'tests/PrivateEvidenceFixture03G.py').read_text().replace('private-profile03g','private-profile03i').replace('Private03G.Toolchain.exe','Private03I.Toolchain.exe')
text=text.replace('self.w.subprocess=Context.processes',"self.w.subprocess=Context.processes;self.w.query=__import__('MetadataQuery').query")
exec(compile(text,fixture.__file__,'exec'),fixture.__dict__);sys.modules['PrivateEvidenceFixture03G']=fixture
source=R/'tests/Test-PrivateWorkflowTiming03G.py'
exec(compile(source.read_text(),str(source)+' [03I roots and new supervisor]','exec'),dict(__file__=str(source),__name__='__main__'))
