"""Seal this subtask's resource/probe validation without altering historical files."""
from pathlib import Path
import json,hashlib,wave,datetime
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03c/resource-probe'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def pin(p):return dict(path=str(p),bytes=p.stat().st_size,sha256=sha(p))
def check(x):
    p=Path(x['path']);assert sha(p)==x['sha256'],str(p)
    if 'bytes' in x:assert p.stat().st_size==x['bytes'],str(p)
def save(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,indent=2)
old=R/'.local/gate-a-shvdne-private-03b/execution-manifest.json'
assert sha(old)=='b3337f3c2f41a8878a25582321ebe10e1dba216bf90bc4b274f27ba63cd24237'
for x in read(old)['bindings']:check(x)
build=read(P/'build-02/build-receipt.json')
for x in build['sources']+build['outputs']:check(x)
first=read(P/'build-01/build-receipt.json')
for x in first['sources']+first['outputs']:check(x)
candidate=P/'build-02/RichAudio.GateAPrivate03C.Shvdne.dll'
assert sha(candidate)==build['candidateSha256']=='fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0'
compiled=read(P/'build-02/compiled-inspection.json')
assert compiled['passed'] and compiled['requiredFinalNativePhaseGuard'] and compiled['phaseGuardAfterNativeContext'] and compiled['noPermissiveConstructor'] and compiled['finalCallbackClockLast']
assert 'PASS cases=26 assertions=88' in (P/'build-02/Existing03.log').read_text(encoding='utf-8-sig')
assert 'PASS PRIVATE03C cases=14 assertions=42' in (P/'build-02/PhaseBoundary03C.log').read_text(encoding='utf-8-sig')
assert 'PASS actualAPI native deadline cases=3' in (P/'build-02/NativeDeadline03C.log').read_text(encoding='utf-8-sig')
graph=read(P/'resource-graph-01/test-results.json');assert graph['passed'] and graph['count']==28
actual=read(P/'resource-graph-01/actual-resource-validation.json');assert actual['passed'] and actual['originalPcmSha256']=='427c34a5bd3083c3597b824ecd4d28e3286ea8ff3d5028a129ddecd16671fb06'
resources=read(R/'.local/gate-a-shvdne-private-01/result.json')['artifacts']
for x in resources.values():check(x)
with wave.open(str(R/'.local/gate-a-shvdne-private-01/resource/original-marker/marker.wav'),'rb') as w:
    assert w.getnchannels()==1 and w.getframerate()==48000 and w.getsampwidth()==2 and w.getnframes()==134400
    assert hashlib.sha256(w.readframes(w.getnframes())).hexdigest()==actual['originalPcmSha256']
save(P/'development-attempts.json',dict(attempts=[dict(name='prechange-01 compile',passed=False,reason='Relative forward-slash source paths were interpreted by the old C# compiler as options. No binary created. Retried with absolute paths in prechange-02; initial directory preserved.'),dict(name='PowerShell ReflectionOnly inspector invocation',passed=False,reason='Existing Windows PowerShell execution policy rejected -File. No policy was changed or bypassed. Replaced operational inspection with compiled metadata-only C# inspector using the retained .NET Framework compiler.')],liveOperation=False,oldEvidenceModified=False))
sources=[Path(__file__).parent/name for name in ['Prepare-Probe03C.py','Prepare-Probe03CFinal.py','Build-Probe03C.ps1','Build-Probe03CFinal.ps1','InspectCompiled03C.cs','InspectCompiled03CFinal.cs','Inspect-Compiled03C.ps1','Inspect-Resource03C.ps1','ResourceGraph03C.py','Record-ResourceProbe03C.py']]
sources+=list(Path(__file__).parent.glob('Private*03C.cs'))+[Path(__file__).parent/'AssemblyInfo03C.cs']+list((Path(__file__).parent/'probe-v0311').glob('*.cs'))
sources+=[R/'tests/host/TestGateAPrivate03C.cs',R/'tests/host/TestGateAPrivate03CNativeDeadline.cs',R/'tests/Test-PrivateGraph03C.py',R/'docs/GATE_A_SHVDNE_PRIVATE_03C_RESOURCE_PROBE.md']
receipt=dict(experiment='GATE-A-SHVDNE-PRIVATE-03C',subtask='resource-chain-and-profile-probe',finishedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),passed=True,originalManifest=pin(old),originalProbeSha256='5c0ae83682806bd6a5f723ad39758ca5302e1cf7c1d89ddb2be9c41a0a2ebfba',originalSupervisorSha256='2fda83de4372d3eae8a33ac151167c5d046da5a714283a2f34ff86840d5175ca',candidate=pin(candidate),probeVersion='0.3.1.1',defaultDisabled=True,graphCases=28,inheritedProbeCasesRerun=26,inheritedProbeAssertions=88,newPhaseLifecycleCases=14,newPhaseLifecycleAssertions=42,newActualApiDeadlineCases=3,actualCompiledMetadataPassed=True,resourceArtifactsPreserved=resources,build01AndInputsPreserved=True,old487ManifestBindingsPreserved=True,gameLaunched=False,gameFilesWritten=False,resourceArchivesRebuilt=False,liveNativeInvocations=False,audioEndpointOpened=False,productionEngineChanged=False,freshLiveApprovalRequired=True,changedSourceAndDocFiles=[pin(p) for p in sorted(set(sources))],limitations=['Structural graph/packed byte integrity is not Enhanced runtime registration.','Controller/API deadlines are callback checks; the independent supervisor handles missing heartbeat, and GTA normal exit still requires the later available user.','The immediately-before-native final clock check is not a hard realtime or OS-preemption guarantee.','A complete original horn marker with valid controls establishes one authored contribution, not complete profile identity/ownership/suppression/recovery/production compatibility.'])
save(P/'result.json',receipt)
save(P/'evidence-index.json',dict(files=[pin(p) for p in sorted(P.rglob('*')) if p.is_file()],scope='Resource/probe new03C evidence only; index excludes itself. All original bytes remain historical and unchanged.'))
print(json.dumps(dict(passed=True,candidateSha256=sha(candidate),graphCases=28,probeCases=43,original487BindingsUnchanged=True,resourceArchivesRebuilt=False),indent=2))
