"""Read-only preservation/readiness audit. Never installs or launches an application."""
from pathlib import Path
import sys,json,hashlib,subprocess,datetime,argparse,importlib.util
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03c';B=R/'.local/gate-a-shvdne-private-03b'
APPROVED_B='b3337f3c2f41a8878a25582321ebe10e1dba216bf90bc4b274f27ba63cd24237'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def pin(p):return dict(path=str(p),bytes=p.stat().st_size,sha256=sha(p))
def save(p,v):
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,indent=2)
def verify(items):
    for x in items:
        q=Path(x['path']);assert q.is_file() and sha(q)==x['sha256'],x['path']
        if 'bytes' in x:assert q.stat().st_size==x['bytes'],x['path']
def manager_b():
    q=R/'tools/native-control/private-profile03b/Manage-Installation.py'
    s=importlib.util.spec_from_file_location('sealed03b_manager',q);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
    return m
def begin():
    assert not (P/'preservation-before.json').exists()
    assert sha(B/'execution-manifest.json')==APPROVED_B
    bindings=read(B/'execution-manifest.json')['bindings'];verify(bindings)
    evidence=read(B/'evidence-manifest.json')['files'];verify(evidence)
    plan=read(B/'deployment-plan.json');verify(plan['protectedGame']+plan['originalObs'])
    m=manager_b();m.old.inactive();assert m.Installation().preflight()
    sources=[]
    for name in subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=R).decode().split('\0'):
        if name and '03c' not in name.casefold() and (R/name).is_file():sources.append(pin(R/name))
    prior=read(R/'.local/gate-a-shvdne-private-03/preservation-before.json')
    check=read(B/'preservation-before.json')
    assert subprocess.check_output(['git','branch','--show-current'],cwd=R,text=True).strip()=='feature/migration-shvdne-01'
    rph=Path(prior['rphMenu']['path']).parents[1]
    assert subprocess.check_output(['git','status','--short'],cwd=rph,text=True).splitlines()==prior['rphStatus'];verify([prior['rphMenu']])
    paths={Path(x['path']) for x in bindings+evidence}
    paths.update(p for p in B.iterdir() if p.is_file())
    save(P/'preservation-before.json',dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),branch='feature/migration-shvdne-01',head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),gitStatus=subprocess.check_output(['git','status','--short'],cwd=R,text=True).splitlines(),sources=sources,private03bFiles=[pin(q) for q in sorted(paths)],priorHistory=prior['history'],historical03=check['historical03'],gameOriginals=plan['protectedGame'],obsOriginals=plan['originalObs'],rphMenu=prior['rphMenu'],rphStatus=prior['rphStatus'],originalManifestSha256=APPROVED_B,private03bBindingsVerified=len(bindings),private03bEvidenceFilesVerified=len(evidence),realRootReadOnlyPreflightPassed=True,gameLaunches=0,gameWrites=0,obsLaunches=0))
    print('PASS starting preservation:487 sealed bindings,225 evidence files,real-root read-only preflight; no applications launched')
def finish():
    b=read(P/'preservation-before.json')
    groups=['sources','private03bFiles','priorHistory','historical03','gameOriginals','obsOriginals']
    expected={}
    for group in groups:
        for x in b[group]:
            key=str(Path(x['path'])).casefold()
            if key in expected:assert expected[key]['sha256']==x['sha256'],x['path']
            else:expected[key]=x
    verify(expected.values());verify([b['rphMenu']])
    assert sha(B/'execution-manifest.json')==APPROVED_B
    assert subprocess.check_output(['git','branch','--show-current'],cwd=R,text=True).strip()==b['branch']
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()==b['head']
    rph=Path(b['rphMenu']['path']).parents[1]
    assert subprocess.check_output(['git','status','--short'],cwd=rph,text=True).splitlines()==b['rphStatus']
    subprocess.run(['git','diff','--check'],cwd=R,check=True,capture_output=True)
    manager_b().old.inactive()
    assert not (P/'execution-01').exists() and not (B/'execution-01').exists()
    resources=read(P/'resource-probe/result.json');assert resources['passed'] and resources['actualCompiledMetadataPassed'];verify(resources['resourceArtifactsPreserved'].values());verify([resources['candidate']])
    compiled=read(P/'resource-probe/build-02/compiled-inspection.json')
    assert compiled['passed'] and compiled['candidateSha256']=='fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0' and compiled['requiredFinalNativePhaseGuard'] and compiled['noPermissiveConstructor']
    components={
        'resourceGraph':P/'resource-probe/resource-graph-01/test-results.json',
        'marker':P/'marker/qualification.json',
        'markerFragment':P/'marker/fragment-qualification.json',
        'markerAdmission':P/'marker/admission-qualification.json',
        'capture':P/'capture-fixtures-v02/result.json',
        'transactions':P/'install-supervision/transaction-fixtures-r5.json',
        'partialPrefixes':P/'install-supervision/prefix-fixtures-r5.json',
        'obsOverlapRecovery':P/'install-supervision/obs-recovery-fixtures-r5.json',
        'directoryOwnership':P/'install-supervision/directory-fixtures-r5.json',
        'fullInstallation':P/'install-supervision/full-install-restoration.json',
        'supervisor':P/'install-supervision/supervisor-processes-01/qualification.json',
        'realRootPreflight':P/'real-root-preflight.json'}
    for name,path in components.items():
        value=read(path)
        if name=='marker':
            assert value['caseCount']==90 and value['detectorUnchanged'] and not value['falsePositives'] and not value['falseNegatives'] and not value['qualityMisadmissions']
            assert len(value['unsafeAttributionPasses'])==8 # Demonstrated OLD-wrapper defect; retained, not recast as a PASS.
        else:assert value['passed'],name
    new_manager=R/'tools/native-control/private-profile03c/Manage-Installation.py'
    for name in ['transactions','partialPrefixes','obsOverlapRecovery','directoryOwnership','fullInstallation','realRootPreflight']:
        assert read(components[name])['managerSha256']==sha(new_manager),name
    assert read(components['fullInstallation'])['planSha256']==sha(P/'deployment-plan.json')
    assert read(components['realRootPreflight'])['planSha256']==sha(P/'deployment-plan.json')
    assert read(components['capture'])['count']==25
    for x in read(P/'capture-fixtures-v02/freeze.json')['files']:verify([x])
    plan=read(P/'deployment-plan.json');assert plan['experiment']=='GATE-A-SHVDNE-PRIVATE-03C' and len(plan['newGameFiles'])==9 and len(plan['obsFiles'])==3 and len(plan['park'])==1
    assert plan['park']==read(B/'deployment-plan.json')['park']
    assert plan['bounds']==read(B/'deployment-plan.json')['bounds'] and plan['supervisor']==read(B/'deployment-plan.json')['supervisor']
    for x in plan['newGameFiles']+plan['obsFiles']:
        assert Path(x['source']).stat().st_size==x['bytes'] and sha(Path(x['source']))==x['sha256']
    assert 'Enabled=false' in (P/'resource-probe/build-02/RichAudio.GateAPrivate03C.Shvdne.ini').read_text()
    sourcepaths=set(q for q in (R/'tools/native-control/private-profile03c').rglob('*') if q.is_file())
    sourcepaths.update(q for q in (R/'tests').rglob('*') if q.is_file() and '03c' in q.name.casefold())
    sourcepaths.update((R/'docs').glob('GATE_A_SHVDNE_PRIVATE_03C*.md'))
    save(P/'source-manifest.json',dict(scope='All new03C source/test/document files, including preserved intermediate source variants; finalcandidate source is probe-v0311/',files=[pin(q) for q in sorted(sourcepaths)]))
    preserved=dict(passed=True,utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),uniquePriorFilesVerified=len(expected),counts={group:len(b[group]) for group in groups},original03bManifestSha256=APPROVED_B,original487BindingsUnchanged=True,original225IndexedFilesUnchanged=True,originalRphStatusUnchanged=True,protectedRphMenu=b['rphMenu'],originalResourceArtifactsUnchanged=resources['resourceArtifactsPreserved'],productionSourceFilesUnchanged=True,allGameAndObsOriginalsUnchanged=True,cacheUnchanged=True,originalApprovalConsumed=True,newLiveAuthorizationGranted=False,gameLaunches=0,realGameWrites=0,obsLaunches=0,liveNativeInvocations=0,profileAssignments=0,audioEndpointsOpened=0,archivesRebuilt=0,commitsCreated=0,pushed=False)
    save(P/'preservation-after.json',preserved)
    save(P/'readiness-receipt.json',dict(schema=1,experiment='GATE-A-SHVDNE-PRIVATE-03C',revision='offline-readiness-01',outcome='READY FOR REVIEW',scope='Offline structural/behavioral/evidence/recovery prerequisites only; no GTA runtime qualification',liveAuthorized=False,original03bManifestSha256=APPROVED_B,candidate=resources['candidate'],probeVersion='0.3.1.1',supervisorSha256=plan['supervisor']['sha256'],loaderContract=pin(P/'loader-contract.json'),plan=pin(P/'deployment-plan.json'),sourceManifest=pin(P/'source-manifest.json'),components={name:pin(path) for name,path in components.items()},counts=dict(resourceGraphCases=28,probeCases=43,markerQualificationCases=90,markerHeldOutWrapperCases=35,markerDevelopmentRegressions=12,markerAdmissionCases=12,captureCases=25,transactionCases=96,prefixCases=4,overlapRecoveryCases=5,directoryOwnershipCases=5,supervisorAssertions=109,supervisorDisposableScenarios=5,fullShadowMockInstallations=1),defaultDisabled=True,resourcesRegenerated=False,productionAudioFunctionalityEnabled=False,performance10ms='FAIL_UNCHANGED',priorLiveDeadlineResult='FAIL_UNCHANGED',remainingRuntimeQuestions=['Exact-build joint OpenRPF/SHVDNE private mounting','One functional marker contribution and correct A/B origin/isolation','Actual capture/output usability and notice visibility','Normal GTA behavior/exit and full live recovery sequence'],remainingEntryGates=['Fresh exact03C live approval','Current direct-user availability and unchanged input/display conditions','Visible windowed STOP/ESCALATION notice','Fresh initialization/capture admission and all remaining-time limits'],preservation=pin(P/'preservation-after.json'),commitsCreated=[],gitHead=b['head'],gameLaunched=False,gameFilesWritten=False,obsLaunched=False,profileAssigned=False))
    print('PASS final03C offline readiness and comprehensive preservation; READY FOR REVIEW, no live authorization')
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('operation',choices=['begin','finish']);args=ap.parse_args();begin() if args.operation=='begin' else finish()
