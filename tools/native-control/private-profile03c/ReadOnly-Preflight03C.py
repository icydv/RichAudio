"""Actual-root read-only admission of the final03C proposal; never installs."""
from pathlib import Path
import sys,json,importlib.util,datetime,shutil,hashlib
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03c'
source=Path(__file__).with_name('Manage-Installation.py')
spec=importlib.util.spec_from_file_location('final03c_manager',source);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
manager=m.Installation()
def originals():
    return [dict(path=x['path'],bytes=Path(x['path']).stat().st_size,sha256=m.sha(Path(x['path']))) for x in manager.plan['protectedGame']+manager.plan['originalObs']]
started=datetime.datetime.now(datetime.timezone.utc).isoformat();before=originals()
assert manager.preflight() and manager.verify()
identity_capability={str(q):m.file_identity(q) for q in [manager.game/'xinput1_4.dll',manager.obs/'user.ini']}
after=originals();assert before==after and not (P/'execution-01').exists()
plan=manager.plan
value=dict(passed=True,experiment='GATE-A-SHVDNE-PRIVATE-03C',startedUtc=started,finishedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),scope='Actual GTA/OBS baseline read-only inventory, staged-source, dependency, layout, space and file-identity capability checks. No game/OBS/supervisor launch or installation.',managerSha256=m.sha(source),planSha256=m.sha(P/'deployment-plan.json'),loaderContractSha256=m.sha(P/'loader-contract.json'),rootBinaryCount=len(manager.inventory()),protectedGameFiles=len(plan['protectedGame']),originalObsFiles=len(plan['originalObs']),originalsBefore=before,originalsAfter=after,allOriginalBytesUnchanged=True,existingFileIdentityCapability=identity_capability,gameDriveRequiredBytes=plan['minimumGameDriveFreeBytes'],gameDriveFreeBytes=shutil.disk_usage(manager.game).free,worktreeDriveRequiredBytes=plan['backupBytes']+plan['reserveCaptureBytes']+536870912+plan['reserveRecoveryArchiveBytes'],worktreeDriveFreeBytes=shutil.disk_usage(P).free,reserveRecoveryArchiveBytes=plan['reserveRecoveryArchiveBytes'],selectedLaunchOptions=['-nobattleye'],windowsPrerequisites=manager.contract['windowsPrerequisites'],nativePrerequisiteFiles=len(manager.contract['nativeImportCandidates']),newGameFiles=9,temporaryObsFiles=3,newDestinationsAbsent=True,executionDirectoryAbsent=True,liveAuthorized=False,installationInvocations=0,gameLaunches=0,gameFilesWritten=False,obsFilesWritten=False)
with (P/'real-root-preflight.json').open('x',encoding='utf-8') as f:json.dump(value,f,indent=2)
print('PASS final03C actual-root read-only preflight and unchanged97 originals; recovery archive space included')
