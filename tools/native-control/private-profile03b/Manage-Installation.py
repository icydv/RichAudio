"""PRIVATE-03B preparation manager. Preflight/verify are read-only.

The inherited installer/restorer is the unchanged, hash-bound PRIVATE03 code.
Only a separately approved 03B manifest permits real installation/restoration.
No operation launches GTA, OBS, a loader, an audio host or the supervisor.
"""
from pathlib import Path
import sys, importlib.util, argparse, json, subprocess, shutil, re
sys.dont_write_bytecode = True
R = Path(__file__).resolve().parents[3]
P = R / '.local/gate-a-shvdne-private-03b'
OLD = R / '.local/gate-a-shvdne-private-03'
spec = importlib.util.spec_from_file_location('retained_install03', OLD / 'Manage-Installation.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
old.P = P  # Its fixture and execution paths belong to the new preparation only.
read, sha, no_links = old.read, old.sha, old.no_links


def windows_prerequisites():
    script = """$n=Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full'; $v=Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64'; @{os64=[Environment]::Is64BitOperatingSystem;netRelease=$n.Release;netVersion=$n.Version;vcInstalled=$v.Installed;vcVersion=$v.Version}|ConvertTo-Json -Compress"""
    return json.loads(subprocess.check_output(['powershell.exe', '-NoProfile', '-Command', script], text=True))


def admit_retirement_processes(rows, bound, expected_path, expected_sha, expected_session):
    """Only a current-session exact supervisor may remain during disk recovery."""
    if not rows:
        return True
    assert len(rows) == 1 and bound, 'Game/runtime/recorder or unbound supervisor still present'
    row=rows[0]
    assert row['Name'].casefold() == 'richaudio.private01.supervisor.exe', 'Only the exact supervisor may remain'
    assert bound['session'] == expected_session and bound['pid'] > 0 and bound['creationUtcTicks'] > 0
    assert row['ProcessId'] == bound['pid'] and row['CreationUtcTicks'] == bound['creationUtcTicks'], 'Supervisor process identity drift'
    assert str(Path(row['ExecutablePath'])).casefold() == str(Path(bound['executable'])).casefold() == str(Path(expected_path)).casefold(), 'Supervisor executable path drift'
    assert bound['sha256'] == expected_sha and sha(Path(expected_path)) == expected_sha, 'Supervisor binary drift'
    return True


class Installation(old.Installation):
    def __init__(self, fixture=None):
        super().__init__(fixture)
        self.contract = read(P / 'loader-contract.json')

    def inventory(self):
        return {p.name.casefold(): p for p in self.game.iterdir()
                if p.suffix.casefold() in ('.dll', '.asi')}

    def check_inventory(self):
        expected = {Path(x['path']).name.casefold(): x for x in self.contract['rootBinaries']}
        actual = self.inventory()
        assert actual.keys() == expected.keys(), 'Unexpected/missing root DLL/ASI inventory: ' + str(sorted(actual.keys() ^ expected.keys()))
        for name, x in expected.items():
            q = actual[name]
            no_links(q)
            assert q.is_file() and q.stat().st_size == x['bytes'] and sha(q) == x['sha256'], 'Modified root binary: ' + str(q)
        for name in self.contract['requiredAbsent']:
            assert not (self.game / name).exists(), 'Forbidden proxy/runtime/cache configuration: ' + name
        return True

    def preflight(self):
        if not self.fixture:
            old.inactive()
            old.selected_launch_options()
            assert subprocess.check_output(['git','branch','--show-current'], cwd=R, text=True).strip() == 'feature/migration-shvdne-01', 'Wrong preparation branch'
            assert subprocess.check_output(['git','rev-parse','HEAD'], cwd=R, text=True).strip() == read(P/'preservation-before.json')['head'], 'Preparation HEAD drift'
            assert windows_prerequisites() == self.contract['windowsPrerequisites'], 'Windows CLR/VC prerequisite drift'
            for x in self.contract['nativeImportCandidates']:
                q = Path(x['path'])
                no_links(q)
                assert q.is_file() and q.stat().st_size == x['bytes'] and sha(q) == x['sha256'], 'Native prerequisite drift: ' + str(q)
        self.check_inventory()
        for x in self.plan['protectedGame'] + self.plan['originalObs']:
            q = self.mapped(x['path'])
            no_links(q)
            assert q.is_file() and q.stat().st_size == x['bytes'] and sha(q) == x['sha256'], 'Changed baseline: ' + str(q)
        assert not (self.game / 'mods').exists() and not (self.game / 'scripts').exists(), 'Expected absent mods/scripts destination roots'
        assert len(self.plan['newGameFiles']) == 9 and len(self.plan['obsFiles']) == 3
        expected = {x['destination'] for x in self.contract['approvedDestinations']}
        assert {x['destination'] for x in self.plan['newGameFiles'] + self.plan['obsFiles']} == expected, 'Destination layout substitution'
        for x in self.plan['newGameFiles'] + self.plan['obsFiles']:
            source = Path(x['source'])
            no_links(source)
            assert source.is_file() and source.stat().st_size == x['bytes'] and sha(source) == x['sha256'], 'Missing/corrupt staged file'
            target = self.mapped(x['destination'])
            self.safe(target)
            if x['kind'] != 'mutable-obs-existing':
                assert not target.exists(), 'New destination already exists'
        assert shutil.disk_usage(self.game).free >= self.plan['minimumGameDriveFreeBytes'], 'Insufficient game-drive space'
        assert shutil.disk_usage(P).free >= self.plan['backupBytes'] + self.plan['reserveCaptureBytes'] + 536870912, 'Insufficient backup/capture space'
        return True

    def retirement_inactive(self):
        script = "@((Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^(GTA5_Enhanced(?:_BE)?|RAGEPluginHook|RichAudio.*|obs64)\\.exe$'}) | ForEach-Object {@{Name=$_.Name;ProcessId=$_.ProcessId;ExecutablePath=$_.ExecutablePath;CreationUtcTicks=$_.CreationDate.ToUniversalTime().Ticks}}) | ConvertTo-Json -Compress"
        value=subprocess.check_output(['powershell.exe','-NoProfile','-Command',script],text=True).strip()
        rows=json.loads(value) if value else []
        if isinstance(rows,dict):rows=[rows]
        bound=None
        if rows:
            assert read(self.e/'installation.json')['passed'], 'No current installation receipt'
            assert read(self.e/'supervisor-configuration.json')['Session'] == self.plan['session'], 'Wrong supervisor configuration'
            bound=read(self.e/'supervisor-process.json')
        return admit_retirement_processes(rows,bound,self.plan['supervisor']['binary'],self.plan['supervisor']['sha256'],self.plan['session'])

    def retirement_scope(self, callback):
        # The unchanged parent calls its module-level guard, including nested verify().
        # CLI execution is single-threaded; always restore the strict preflight/install guard.
        previous=old.inactive
        old.inactive=self.retirement_inactive
        try:return callback()
        finally:old.inactive=previous

    def restore(self):
        return self.retirement_scope(lambda:super(Installation,self).restore())

    def verify(self):
        def verify_originals():
            assert super(Installation,self).verify()
            self.check_inventory()
            if not self.fixture:old.selected_launch_options()
            return True
        return self.retirement_scope(verify_originals)


def bindings(digest):
    manifest = P / 'execution-manifest.json'
    assert re.fullmatch('[a-f0-9]{64}', digest or '') and sha(manifest) == digest, 'Exact 03B manifest digest required'
    for x in read(manifest)['bindings']:
        q = Path(x['path'])
        no_links(q)
        assert q.is_file() and q.stat().st_size == x['bytes'] and sha(q) == x['sha256'], 'Manifest binding changed: ' + str(q)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('operation', choices=['preflight', 'install', 'restore', 'verify'])
    ap.add_argument('--manifest-sha256', help='Read-only verification digest; conveys no live authorization')
    ap.add_argument('--approved-manifest-sha256', help='Only use after explicit fresh live approval')
    args = ap.parse_args()
    if args.operation in ('install', 'restore'):
        assert args.approved_manifest_sha256, 'Fresh explicit user approval of this exact 03B manifest is required'
    bindings(args.approved_manifest_sha256 or args.manifest_sha256)
    manager = Installation()
    getattr(manager, args.operation)()
    print('PASS ' + args.operation + ' (PRIVATE-03B; no application launched)')
