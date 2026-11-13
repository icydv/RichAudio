"""PRIVATE03D exact provenance and native-identity recovery admission.

The historical seal and sources remain untouched. The inherited transaction
algorithm operates only on the separately sealed new plan and execution root.
"""
from pathlib import Path
import sys,importlib.util,argparse,shutil
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from Package import ROOT,PACKAGE,ORIGINAL,provenance as verify_provenance,verify as verify_manifest
P=PACKAGE
spec=importlib.util.spec_from_file_location('sealed_transaction03c',ROOT/'tools/native-control/private-profile03c/Manage-Installation.py')
legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
legacy.P=PACKAGE
base=legacy.base
base.P=PACKAGE;base.old.P=PACKAGE
read,sha,no_links=legacy.read,legacy.sha,legacy.no_links
file_identity,prefix_matches=legacy.file_identity,legacy.prefix_matches

class Installation(legacy.Installation):
    def __init__(self,fixture=None):
        legacy.P=P;base.P=P;base.old.P=P
        super().__init__()
        if fixture:
            self.scope=Path(fixture).resolve()
            assert self.scope.is_relative_to((P/'installer-fixtures').resolve()) and self.scope!=(P/'installer-fixtures').resolve(),'Fixture scope refused'
            self.fixture=fixture;self.game=self.scope/'game';self.obs=self.scope/'obs';self.e=self.scope/'execution'

    def preflight(self):
        # Same admission checks as the sealed03B/03C methods. Only the old
        # historical HEAD comparison is replaced by a stronger exact contract.
        if not self.fixture:
            verify_provenance()
            base.old.inactive();base.old.selected_launch_options()
            assert base.windows_prerequisites()==self.contract['windowsPrerequisites'],'Windows CLR/VC prerequisite drift'
            for item in self.contract['nativeImportCandidates']:
                path=Path(item['path']);no_links(path)
                assert path.is_file() and path.stat().st_size==item['bytes'] and sha(path)==item['sha256'],'Native prerequisite drift: '+str(path)
        self.check_inventory()
        for item in self.plan['protectedGame']+self.plan['originalObs']:
            path=self.mapped(item['path']);no_links(path)
            assert path.is_file() and path.stat().st_size==item['bytes'] and sha(path)==item['sha256'],'Changed baseline: '+str(path)
        assert not (self.game/'mods').exists() and not (self.game/'scripts').exists(),'Expected absent mods/scripts destination roots'
        assert len(self.plan['newGameFiles'])==9 and len(self.plan['obsFiles'])==3
        assert {x['destination'] for x in self.plan['newGameFiles']+self.plan['obsFiles']}=={x['destination'] for x in self.contract['approvedDestinations']},'Destination layout substitution'
        for item in self.plan['newGameFiles']+self.plan['obsFiles']:
            source=Path(item['source']);no_links(source)
            assert source.is_file() and source.stat().st_size==item['bytes'] and sha(source)==item['sha256'],'Missing/corrupt staged file'
            target=self.mapped(item['destination']);self.safe(target)
            if item['kind']!='mutable-obs-existing':assert not target.exists(),'New destination already exists'
        assert shutil.disk_usage(self.game).free>=self.plan['minimumGameDriveFreeBytes'],'Insufficient game-drive space'
        assert shutil.disk_usage(PACKAGE).free>=self.plan['backupBytes']+self.plan['reserveCaptureBytes']+536870912,'Insufficient backup/capture space'
        minimum=max(x['bytes'] for x in self.plan['newGameFiles']+self.plan['obsFiles'])+max(x['bytes'] for x in self.plan['backupOriginals'])
        assert self.plan['reserveRecoveryArchiveBytes']>=minimum,'Insufficient declared recovery archive reserve'
        required=self.plan['backupBytes']+self.plan['reserveCaptureBytes']+536870912+self.plan['reserveRecoveryArchiveBytes']
        assert shutil.disk_usage(PACKAGE).free>=required,'Insufficient worktree space for partial-target recovery archival'
        return True

    def retirement_inactive(self):
        # Only the exact admitted supervisor may wait for disk verification.
        # Discovery names are never process-lifetime evidence; native FILETIME is.
        import subprocess,json
        script="@((Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^(GTA5_Enhanced(?:_BE)?|RAGEPluginHook|RichAudio.*|obs64)\\.exe$'}) | ForEach-Object {@{ProcessId=$_.ProcessId;Name=$_.Name}}) | ConvertTo-Json -Compress"
        text=subprocess.check_output(['powershell.exe','-NoProfile','-Command',script],text=True).strip()
        rows=json.loads(text) if text else []
        if isinstance(rows,dict):rows=[rows]
        if not rows:return True
        assert len(rows)==1 and rows[0]['Name'].casefold()=='richaudio.private03d.supervisor.exe','Game/recorder/notice still present'
        bound=read(self.e/'supervisor-process.json');config=read(self.e/'supervisor-configuration.json')
        assert read(self.e/'installation.json')['passed'] and bound['session']==config['Session']==self.plan['session']
        binary=self.plan['supervisor']['binary']
        assert bound['sha256']==sha(Path(binary))==self.plan['supervisor']['sha256']
        observed=json.loads(subprocess.check_output([binary,'--identity',str(rows[0]['ProcessId'])],text=True))
        assert observed['ProcessId']==bound['pid'] and observed['CreationFileTime']==bound['creationFileTime'] and observed['CreationUtcTicks']==bound['creationUtcTicks'],'Supervisor lifetime changed'
        assert observed['Executable'].casefold()==bound['executable'].casefold()==binary.casefold()
        assert observed['CanonicalPath'].casefold()==bound['canonicalPath'].casefold()==binary.casefold()
        assert observed['FileIdentity']==bound['fileIdentity'] and observed['Sha256']==bound['sha256']
        return True

    def restore(self):
        if not self.fixture:verify_provenance()
        return super().restore()

    def verify(self):
        if not self.fixture:verify_provenance()
        return super().verify()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('operation',choices=['preflight','install','restore','verify']);parser.add_argument('--manifest-sha256');parser.add_argument('--approved-manifest-sha256');args=parser.parse_args()
    if args.operation in ['install','restore']:assert args.approved_manifest_sha256,'Fresh explicit approval of the new provenance manifest is required'
    verify_manifest(args.approved_manifest_sha256 or args.manifest_sha256)
    getattr(Installation(),args.operation)()
    print('PASS '+args.operation+' PRIVATE03D admission-01; no application launched')
