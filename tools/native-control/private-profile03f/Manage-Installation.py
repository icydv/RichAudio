"""Preserved transactions and identity checks with explicit approved tool calls."""
from pathlib import Path
import sys,json,uuid
import Context
from AdmissionF import ROOT,PACKAGE,provenance,verify
Context.require()
sys.path.insert(0,str(ROOT/'tools/native-control/private-profile03e'))
e=Context.load('retained03e_manager',ROOT/'tools/native-control/private-profile03e/Manage-Installation.py')
P=PACKAGE;base=e.base
e.P=P;e.d.P=P;e.d.verify_provenance=provenance
base.subprocess=Context.processes;base.old.subprocess=Context.processes
e.windows.PACKAGE=P;e.windows.subprocess=Context.processes
read,sha,no_links=e.read,e.sha,e.no_links
file_identity,prefix_matches=e.file_identity,e.prefix_matches
class Installation(e.Installation):
    def __init__(self,fixture=None):
        e.P=P;e.d.P=P;e.d.legacy.P=P;base.P=P;base.old.P=P
        super().__init__(fixture)
    def retirement_inactive(self):
        # Same03D comparisons; its local stdlib import is replaced explicitly.
        script="@((Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^(GTA5_Enhanced(?:_BE)?|RAGEPluginHook|RichAudio.*|obs64)\\.exe$'}) | ForEach-Object {@{ProcessId=$_.ProcessId;Name=$_.Name}}) | ConvertTo-Json -Compress"
        text=Context.processes.check_output(['powershell.exe','-NoProfile','-Command',script],text=True).strip();rows=json.loads(text) if text else []
        if isinstance(rows,dict):rows=[rows]
        if not rows:return True
        assert len(rows)==1 and rows[0]['Name'].casefold()=='richaudio.private03d.supervisor.exe','Game/recorder/notice still present'
        bound=read(self.e/'supervisor-process.json');config=read(self.e/'supervisor-configuration.json')
        assert read(self.e/'installation.json')['passed'] and bound['session']==config['Session']==self.plan['session']
        binary=self.plan['supervisor']['binary'];assert bound['sha256']==sha(Path(binary))==self.plan['supervisor']['sha256']
        observed=json.loads(Context.processes.check_output([binary,'--identity',str(rows[0]['ProcessId'])],text=True))
        assert observed['ProcessId']==bound['pid'] and observed['CreationFileTime']==bound['creationFileTime'] and observed['CreationUtcTicks']==bound['creationUtcTicks'],'Supervisor lifetime changed'
        assert observed['Executable'].casefold()==bound['executable'].casefold()==binary.casefold()
        assert observed['CanonicalPath'].casefold()==bound['canonicalPath'].casefold()==binary.casefold()
        assert observed['FileIdentity']==bound['fileIdentity'] and observed['Sha256']==bound['sha256']
        return True
def operate(operation,digest):
    verify(digest)
    return getattr(Installation(),operation)()
