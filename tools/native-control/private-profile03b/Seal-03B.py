"""Verify preservation and seal the new offline proposal; no live operations."""
from pathlib import Path
import sys, json, hashlib, subprocess, datetime, importlib.util, ast
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03b';OLD=R/'.local/gate-a-shvdne-private-03'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def pin(p):return dict(path=str(p),bytes=p.stat().st_size,sha256=sha(p))
def save(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,indent=2)
def check(x):
    q=Path(x['path'])
    assert q.is_file() and sha(q)==x['sha256'],x['path']
    if 'bytes' in x:assert q.stat().st_size==x['bytes'],x['path']

spec=importlib.util.spec_from_file_location('manager03b',Path(__file__).with_name('Manage-Installation.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
before=read(P/'preservation-before.json');prior=read(OLD/'preservation-before.json');oldmanifest=read(OLD/'execution-manifest.json');plan=read(P/'deployment-plan.json');contract=read(P/'loader-contract.json')
assert not (P/'execution-01').exists() and not (OLD/'execution-01').exists()
for x in oldmanifest['bindings']:check(x)
for x in before['historical03']:check(x)
for group in ['sources','history']:
    for x in prior[group]:check(x)
for x in plan['protectedGame']+plan['originalObs']:check(x)
for x in contract['rootBinaries']+contract['nativeImportCandidates']:check(x)
assert subprocess.check_output(['git','branch','--show-current'],cwd=R,text=True).strip()=='feature/migration-shvdne-01'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()==before['head']
rph=Path(before['rphMenu']['path']).parents[1]
assert subprocess.check_output(['git','status','--short'],cwd=rph,text=True).splitlines()==before['rphStatus'];check(before['rphMenu'])
subprocess.run(['git','diff','--check'],cwd=R,check=True,capture_output=True)
for q in list(Path(__file__).parent.glob('*.py'))+[R/'tests/Test-PrivateLoader03B.py']:
    ast.parse(q.read_text(encoding='utf-8-sig'),filename=str(q))
m.old.inactive();assert m.old.selected_launch_options()==['-nobattleye']
assert m.windows_prerequisites()==contract['windowsPrerequisites']
preflight=read(P/'real-root-preflight-final.json');assert preflight['passed'] and preflight['allOriginalBytesUnchanged'] and preflight['rootBinaryCount']==49 and preflight['managerSha256']==sha(Path(__file__).with_name('Manage-Installation.py'))
assert preflight['loaderContractSha256']==sha(P/'loader-contract.json') and preflight['deploymentPlanSha256']==sha(P/'deployment-plan.json')
tests=read(P/'installation-fixtures.json');assert tests['passed'] and tests['count']==35 and tests['originalInventoryRestored']
retirement=read(P/'supervisor-retirement-fixtures.json');assert retirement['passed'] and retirement['count']==25
resources=read(R/'.local/gate-a-shvdne-private-01/result.json')['artifacts']
for x in resources.values():check(x)
build=read(OLD/'build-01/build-receipt.json')
assert build['candidateSha256']=='5c0ae83682806bd6a5f723ad39758ca5302e1cf7c1d89ddb2be9c41a0a2ebfba'
for x in build['sources']+build['outputs']:check(x)
assert 'Enabled=false' in (OLD/'build-01/RichAudio.GateAPrivate03.Shvdne.ini').read_text()
compiled=read(OLD/'compiled-inspection.json');assert compiled['passed'] and compiled['defaultEnabled'] is False
supervisor=Path(plan['supervisor']['binary']);assert sha(supervisor)==plan['supervisor']['sha256']=='2fda83de4372d3eae8a33ac151167c5d046da5a714283a2f34ff86840d5175ca'
assert read(OLD/'supervisor-fixtures/qualification.json')['checks']==109 and read(OLD/'supervisor-fixtures/qualification.json')['passed']
handoff=read(OLD/'direct-handoff-components.json');assert handoff['directHandoffPassed'] and handoff['independentRestorationVerified'] and handoff['rawCombinedFixturePassed'] is False and handoff['acknowledgmentSeconds']<5
oldplan=read(OLD/'deployment-plan.json');assert plan['session']!=oldplan['session'] and plan['bounds']==oldplan['bounds'] and plan['supervisor']==oldplan['supervisor']
assert len(plan['newGameFiles'])==9 and len(plan['obsFiles'])==3 and plan['park']==oldplan['park']
for x in plan['newGameFiles']+plan['obsFiles']:
    assert sha(Path(x['source']))==x['sha256'] and Path(x['source']).stat().st_size==x['bytes']
for name in ['Read-Status03.ps1','Extract-Capture03.py','capture-dependencies.json']:
    assert (P/name).read_text()==(OLD/name).read_text(),name
assert 'creationUtcTicks=identity' in (P/'Watch-AuthorizedGame.py').read_text()
assert sha(P/'Watch-AuthorizedGame.py')==sha(Path(__file__).with_name('Watch-AuthorizedGame.py'))
restore_count=len(plan['protectedGame'])+len(plan['originalObs'])+sum(x['kind']!='mutable-obs-existing' for x in plan['newGameFiles']+plan['obsFiles'])+4
assert restore_count==112 and restore_count<=256
scene=read(P/'capture-template/GateAPrivate03Live01.json')
def inspect(v):
    if isinstance(v,dict):
        if isinstance(v.get('id'),str):assert v['id'] not in ['wasapi_input_capture','dshow_input','pulse_input_capture','coreaudio_input_capture','monitor_capture']
        for x in v.values():inspect(x)
    elif isinstance(v,list):
        for x in v:inspect(x)
inspect(scene)
assert scene['DesktopAudioDevice1']['id']=='wasapi_output_capture' and len([x for x in scene['sources'] if x['id']=='window_capture'])==1
assert str(P).replace('\\','\\\\') in (P/'capture-template/basic.ini').read_text()
preserved=dict(passed=True,utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),oldApprovedBindingsUnchanged=len(oldmanifest['bindings']),historical03FilesUnchanged=len(before['historical03']),priorSourcesUnchanged=len(prior['sources']),priorHistoricalFilesUnchanged=len(prior['history']),protectedGameFilesUnchanged=len(plan['protectedGame']),originalObsFilesUnchanged=len(plan['originalObs']),exactRootDllAsiCount=49,privateArtifacts={k:dict(v) for k,v in resources.items()},originalRphStatusUnchanged=True,protectedRphMenu=before['rphMenu'],probeUnchanged=True,defaultDisabled=True,supervisorUnchanged=True,detectorAndPriorRollbackEvidenceUnchanged=True,resourceRegenerations=0,archiveRebuilds=0,gameFilesWritten=False,obsFilesWritten=False,gameLaunches=0,profileAssignments=0,audioHostsStarted=0,executionDirectoriesAbsent=True,productionCodeChanged=False,allHistoricalEvidenceUnchanged=True)
save(P/'preservation-after.json',preserved)
docs=[R/'docs'/x for x in ['GATE_A_SHVDNE_PRIVATE_03B.md','GATE_A_SHVDNE_PRIVATE_03B_LOADERS.md','GATE_A_SHVDNE_PRIVATE_03B_PROCEDURE.md']]
# Bind prior immutable operation inputs plus all new review/operation inputs.
# Do not bind mutable live original logs/Trainer as direct inputs: they are restoration pins in the plan.
paths={Path(x['path']) for x in oldmanifest['bindings']}
paths.update(docs);paths.update(Path(__file__).parent.glob('*.py'));paths.update([R/'tests/Test-PrivateLoader03B.py',R/'tests/Test-PrivateSupervisor03B.py'])
paths.update(x for x in P.rglob('*') if x.is_file() and 'installer-fixtures' not in x.relative_to(P).parts)
paths.update(OLD/'live-01-preflight-stop'/x for x in ['authorization.json','blocker.json','result.json','historical-loader-evidence.json','evidence-manifest.json','preflight-command-result.txt'])
paths.add(R/'docs/GATE_A_SHVDNE_PRIVATE_03_LIVE_01.md')
paths.update(Path(x['path']) for x in contract['nativeImportCandidates'])
for x in read(P/'loader-review/distribution-and-history.json')['archives']:
    paths.add(Path(x['path']))
paths.add(Path(read(P/'loader-review/trainer-retained-distribution.json')['archive']['path']))
manifest=dict(schema=1,experiment='GATE-A-SHVDNE-PRIVATE-03B',preparationRevision='loader-inventory-01',kind='independent-fresh-approval-required-single-live-01-proposal',preparedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),branch='feature/migration-shvdne-01',head=before['head'],priorConsumedManifestSha256=sha(OLD/'execution-manifest.json'),candidateSha256=build['candidateSha256'],probeVersion='0.3.0.0-unchanged',supervisorSha256=plan['supervisor']['sha256'],loaderContractSha256=sha(P/'loader-contract.json'),liveAuthorized=False,installed=False,gameLaunched=False,preallocatedSession=plan['session'],maximumGameLaunches=1,maximumPairAttempts=1,maximumAssignmentAttempts=1,controlSetterAllowed=False,reloadsAllowed=0,defaultEnabled=False,limits=plan['bounds'],supervisorRestorationChecks=restore_count,realRootPreflight=pin(P/'real-root-preflight-final.json'),regressionCases=35,supervisorRetirementMetadataCases=25,revisedEvidenceOrder=oldmanifest['revisedEvidenceOrder'],noticeAlternative=oldmanifest['noticeAlternative'],forbidden=oldmanifest['forbidden'],bindings=[pin(q) for q in sorted(paths)])
save(P/'execution-manifest.json',manifest);digest=sha(P/'execution-manifest.json')
authorization=(
f'I authorize one GATE-A-SHVDNE-PRIVATE-03B live-01 attempt using execution-manifest SHA-256 {digest}, unchanged probe SHA-256 {build["candidateSha256"]}, unchanged supervisor SHA-256 {plan["supervisor"]["sha256"]}, and the bound GATE_A_SHVDNE_PRIVATE_03B_PROCEDURE.md. '
'I approve the corrected exact loader inventory, preserving the existing XInput proxy a1a8bde409ed75d94a0439c37cf881bc354b13c2f8cd32e4bef3b10f308f1392 and DInput proxy 9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d with no loader substitutions or removals. '
'I approve the joint functional-resource-resolution/profile-selection evidence order and windowed continuously visible STOP/ESCALATION text notice, subject to current direct-user handoff, dependency, capture and remaining-time gates. '
'Install only the nine enumerated game files and three temporary OBS settings files using the new fixed session configuration; park and exactly restore only TrainerV.asi. Preserve verified OpenRPF 0.3, both existing proxies, Script Hook V, DirectStorageFix, StraightToStoryMode, original archives, rpf.cache and original RPH/RichAudio stack. '
'Launch pinned Enhanced 1.0.1158.16 once through the normal Steam route with existing -nobattleye into offline Story Mode without RPH; permit the stated normal windowed-mode adjustment and local game audio/video capture with no microphone or streaming. '
'After clean fresh loader/capture admission, spawn one disposable Bati pair, obtain usable marker-negative A/B horn baselines, explicitly confirm that review, and manually arm/confirm at most one FORCE_USE_AUDIO_GAME_OBJECT request for ra_gapriv01_bati against A only. Keep B unassigned; perform the stated post horn/control and normal-behaviour observations, then normally retire and exit without saving. '
'Respect ten-minute startup, two-minute initialization subject to earlier cutoffs, latest spawn at process age10:30, three-minute active limit, baseline80s/assignment100s/retirement140s cutoffs, five-second notice acknowledgment, sixty-second normal-exit grace, planned stop14minutes and absolute15-minute process ceiling; no operation resets a deadline. '
'After verified normal process closure restore manifest-owned game/OBS files/settings exactly, independently verify restoration and retain evidence/backups. Stop on any failed phase. I do not authorize silent profiles, native suppression, complete/production takeover, B assignment, retries/fallbacks/resets, reload, extra hooks/patches or compatibility bypass, game-memory inspection, crashes or forced game/runtime termination, another launch or later stages. The prior PRIVATE-03 approval is consumed and is not reused.\n')
with (P/'FRESH_AUTHORIZATION.txt').open('x',encoding='utf-8') as f:f.write(authorization)
result=dict(experiment=manifest['experiment'],preparationRevision=manifest['preparationRevision'],state='PREPARED_FOR_SEPARATE_LIVE_AUTHORIZATION',liveAuthorized=False,originalApprovalConsumed=True,manifest=pin(P/'execution-manifest.json'),manifestSha256=digest,loaderContract=pin(P/'loader-contract.json'),deploymentPlan=pin(P/'deployment-plan.json'),candidateSha256=build['candidateSha256'],supervisorSha256=plan['supervisor']['sha256'],procedure=pin(docs[2]),authorizationDraft=pin(P/'FRESH_AUTHORIZATION.txt'),newFixedSession=plan['session'],probeRebuilt=False,resourcesRegenerated=False,archiveRebuilt=False,realRootPreflightPassed=True,regressionCases=35,supervisorRetirementMetadataCases=25,preservationPassed=True,supervisorRestorationChecks=restore_count,actualLoaderConflictEstablished=False,remainingGates=['Fresh explicit03B live authorization','Current direct-user availability and unchanged display/input conditions','Continuously visible windowed STOP/ESCALATION notice','Fresh single loader/SHVDNE/OpenRPF initialization admission','Actual zero-microphone/no-streaming capture usability','Every remaining-time and stopping gate'],privateResourceLiveQualification='UNTESTED',production10msPerformance='FAIL_UNCHANGED',priorSmoke02BDeadline='FAIL_UNCHANGED',gameFilesWritten=False,obsFilesWritten=False,applicationsLaunched=False,nativeAssignmentExecuted=False,productionCodeChanged=False,localCommitCreated=False,pushed=False)
save(P/'result.json',result)
print(json.dumps(dict(state=result['state'],manifestSha256=digest,bindings=len(manifest['bindings']),loaderContractSha256=manifest['loaderContractSha256'],candidateSha256=result['candidateSha256'],supervisorSha256=result['supervisorSha256'],preservationCounts={k:preserved[k] for k in ['oldApprovedBindingsUnchanged','historical03FilesUnchanged','priorSourcesUnchanged','priorHistoricalFilesUnchanged','protectedGameFilesUnchanged','originalObsFilesUnchanged']}),indent=2))
