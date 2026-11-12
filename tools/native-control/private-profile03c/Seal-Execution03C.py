"""Seal a new independently reviewable proposal. No authorization or execution."""
from pathlib import Path
import sys,json,hashlib,datetime
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03c';B=R/'.local/gate-a-shvdne-private-03b'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def pin(p):return dict(path=str(p),bytes=p.stat().st_size,sha256=sha(p))
def save(p,v):
    with p.open('x',encoding='utf-8') as f:json.dump(v,f,indent=2)
ready=read(P/'readiness-receipt.json');plan=read(P/'deployment-plan.json')
assert ready['outcome']=='READY FOR REVIEW' and not ready['liveAuthorized']
assert sha(B/'execution-manifest.json')==ready['original03bManifestSha256']=='b3337f3c2f41a8878a25582321ebe10e1dba216bf90bc4b274f27ba63cd24237'
assert not (P/'execution-01').exists() and not (P/'execution-manifest.json').exists()
assert pin(Path(ready['candidate']['path']))==ready['candidate'] and ready['candidate']['sha256']=='fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0'
for x in read(P/'source-manifest.json')['files']:assert pin(Path(x['path']))==x,x['path']
paths={Path(x['path']) for x in read(B/'execution-manifest.json')['bindings']}
paths.add(B/'execution-manifest.json');paths.add(B/'result.json');paths.add(B/'FRESH_AUTHORIZATION.txt')
paths.update(Path(x['path']) for x in read(P/'source-manifest.json')['files'])
# Bind closed development evidence and operation inputs, not mutable copied install roots.
paths.update(q for q in P.rglob('*') if q.is_file() and 'installer-fixtures' not in q.relative_to(P).parts)
for x in plan['newGameFiles']+plan['obsFiles']:paths.add(Path(x['source']))
for x in read(P/'resource-probe/result.json')['resourceArtifactsPreserved'].values():paths.add(Path(x['path']))
manifest=dict(schema=1,experiment='GATE-A-SHVDNE-PRIVATE-03C',revision='offline-readiness-01',kind='fresh-approval-required-single-live-01-proposal',preparedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),branch='feature/migration-shvdne-01',head=ready['gitHead'],preserved03bManifestSha256=ready['original03bManifestSha256'],candidate=ready['candidate'],candidateSha256=ready['candidate']['sha256'],probeVersion='0.3.1.1',defaultEnabled=False,supervisorSha256=plan['supervisor']['sha256'],loaderContract=pin(P/'loader-contract.json'),deploymentPlan=pin(P/'deployment-plan.json'),readiness=pin(P/'readiness-receipt.json'),sourceManifest=pin(P/'source-manifest.json'),procedure=pin(R/'docs/GATE_A_SHVDNE_PRIVATE_03C_PROCEDURE.md'),fixedSession=plan['session'],limits=plan['bounds'],baselineDurableBeforeMs=80000,assignmentDispatchBeforeMs=100000,normalRetirementMs=140000,maximumGameLaunches=1,maximumPairAttempts=1,maximumProfileAssignments=1,controlSetterAllowed=False,reloadsAllowed=0,installationAttempts=1,fileRecoveryContinuation='Only proof-bound same-attempt disk restoration after normal process closure; never gameplay retry or a deadline reset',privateProfile='ra_gapriv01_bati',privateProfileJoaat='dd89929d',native='4F0C413926060B38',markerFullWordDetectorUnchanged=True,negativeFragmentReview='12 consecutive nominal symbols with>=3transitions: INCONCLUSIVE only',captureTimelinePolicy='Private03C-capture-timeline-02',liveAuthorized=False,installed=False,gameLaunched=False,noAutomaticRepeat=True,bindings=[pin(q) for q in sorted(paths)])
save(P/'execution-manifest.json',manifest);digest=sha(P/'execution-manifest.json')
authorization=(
f'I authorize one GATE-A-SHVDNE-PRIVATE-03C live-01 attempt using execution-manifest SHA-256 {digest}, probe v0.3.1.1 SHA-256 {ready["candidate"]["sha256"]}, unchanged supervisor SHA-256 {plan["supervisor"]["sha256"]}, and the bound GATE_A_SHVDNE_PRIVATE_03C_PROCEDURE.md. '
'I approve the reviewed strict phase gates, conservative fragment-negative admission, capture timeline/source-integrity checks and proof-bound same-attempt file-restoration continuation; this grants no installation or gameplay retry. '
'Install only the nine enumerated new game files and three temporary OBS settings files using the new fixed session. Park and exactly restore only TrainerV.asi. Preserve both exact existing XInput/DInput proxies, OpenRPF0.3, Script Hook V, DirectStorageFix, StraightToStoryMode, original archives, rpf.cache and original RPH/RichAudio stack. '
'Launch pinned Enhanced1.0.1158.16 once through the normal Steam route with existing -nobattleye into offline Story Mode without RPH. Permit the stated normal windowed-mode adjustment and local game audio/video capture with no microphone or streaming. '
'Subject to current direct-user handoff, continuously visible STOP/ESCALATION text notice, clean fresh initialization/capture admission and remaining-time gates, spawn one disposable Bati pair. Obtain complete usable marker-negative A/B horn baselines, explicitly confirm their independent review and durable acceptance before80seconds, then manually arm/confirm at most one FORCE_USE_AUDIO_GAME_OBJECT request for ra_gapriv01_bati against A only, with actual dispatch before100seconds. Keep B unassigned. Perform the stated post horn/control and normal-behaviour observations; begin normal retirement by140seconds. '
'Respect ten-minute startup, two-minute initialization subject to earlier cutoffs, latest pair request at process age10:30, three-minute active ceiling, five-second direct notice acknowledgment, sixty-second normal-exit grace, planned stop14minutes and absolute15-minute process ceiling. No operation resets a deadline. Exit normally without saving. '
'After verified normal game/OBS process closure, restore manifest-owned files/settings exactly, allowing only proven continuation of the same file-recovery transaction, independently verify restoration and retain evidence/backups. Preserve and stop for review on unproven or changed recovery state. Stop on any failed phase. '
'I do not authorize silent profiles, native suppression, complete/production takeover, B assignment, assignment retries/fallbacks/resets, reload, extra hooks/patches or compatibility bypass, game-memory inspection, crashes or forced game/runtime termination, another launch or later stages. The prior PRIVATE-03 approval remains permanently consumed; PRIVATE-03B is not reused.\n')
with (P/'FRESH_AUTHORIZATION.txt').open('x',encoding='utf-8') as f:f.write(authorization)
result=dict(experiment=manifest['experiment'],revision=manifest['revision'],outcome='READY FOR REVIEW',state='PREPARED_NOT_AUTHORIZED',liveAuthorized=False,manifest=pin(P/'execution-manifest.json'),manifestSha256=digest,preserved03bManifestSha256=ready['original03bManifestSha256'],candidate=ready['candidate'],probeVersion='0.3.1.1',supervisorSha256=plan['supervisor']['sha256'],loaderContract=pin(P/'loader-contract.json'),sourceManifest=pin(P/'source-manifest.json'),readiness=pin(P/'readiness-receipt.json'),procedure=manifest['procedure'],authorizationDraft=pin(P/'FRESH_AUTHORIZATION.txt'),counts=ready['counts'],defaultDisabled=True,resourcesRegenerated=False,archivesRebuilt=False,productionChanged=False,realGameWrites=False,gameLaunches=0,obsLaunches=0,profileAssignments=0,audioEndpointsOpened=0,oldApprovalConsumed=True,newApprovalGranted=False,commitsCreated=[],pushed=False,nextUserAction='When available, review the bound03C procedure and send the exact fresh authorization text only when ready to watch the visible notice and perform the controlled sequence.',runtimeQualification='UNTESTED; one functional contribution only, full ownership/suppression/recovery/production compatibility remain unqualified')
save(P/'result.json',result)
print(json.dumps(dict(outcome=result['outcome'],manifestSha256=digest,candidateSha256=ready['candidate']['sha256'],supervisorSha256=plan['supervisor']['sha256'],bindings=len(manifest['bindings']),liveAuthorized=False),indent=2))
