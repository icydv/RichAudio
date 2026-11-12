"""Record actual-root admission and before/after pins; no installation authority."""
from pathlib import Path
import importlib.util,sys,json,datetime,shutil
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03b'
spec=importlib.util.spec_from_file_location('manager03b',Path(__file__).with_name('Manage-Installation.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
manager=m.Installation()
def originals():
    return [dict(path=x['path'],bytes=Path(x['path']).stat().st_size,sha256=m.sha(Path(x['path']))) for x in manager.plan['protectedGame']+manager.plan['originalObs']]
began=datetime.datetime.now(datetime.timezone.utc).isoformat();before=originals()
assert manager.preflight();assert manager.verify();after=originals();assert before==after
assert not (P/'execution-01').exists()
receipt=dict(experiment='GATE-A-SHVDNE-PRIVATE-03B',startedUtc=began,finishedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),passed=True,scope='Actual real GTA root read-only preflight, not a synthetic root or installation',gameRoot=str(manager.game),managerSha256=m.sha(Path(__file__).with_name('Manage-Installation.py')),loaderContractSha256=m.sha(P/'loader-contract.json'),deploymentPlanSha256=m.sha(P/'deployment-plan.json'),rootBinaryCount=len(manager.inventory()),protectedGameFiles=len(manager.plan['protectedGame']),originalObsFiles=len(manager.plan['originalObs']),originalsBefore=before,originalsAfter=after,allOriginalBytesUnchanged=True,selectedLaunchOptions=['-nobattleye'],windowsPrerequisites=manager.contract['windowsPrerequisites'],nativePrerequisiteFiles=len(manager.contract['nativeImportCandidates']),newGameFiles=9,temporaryObsFiles=3,destinationsAbsent=True,modsAndScriptsAbsent=True,executionDirectoryAbsent=True,gameDriveRequiredBytes=manager.plan['minimumGameDriveFreeBytes'],gameDriveFreeBytes=shutil.disk_usage(manager.game).free,worktreeDriveRequiredBytes=manager.plan['backupBytes']+manager.plan['reserveCaptureBytes']+536870912,worktreeDriveFreeBytes=shutil.disk_usage(P).free,applicationsLaunched=False,installationInvocations=0,gameFilesWritten=False,obsFilesWritten=False)
with (P/'real-root-preflight-final.json').open('x',encoding='utf-8') as f:json.dump(receipt,f,indent=2)
print('PASS actual-root read-only preflight; '+str(len(manager.inventory()))+' exact DLL/ASI files; original bytes unchanged')
