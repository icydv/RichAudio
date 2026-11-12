"""Write initial03B review drafts. Final docs include the subsequently reviewed retirement-guard correction."""
from pathlib import Path
import json
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03b'
plan=json.loads((P/'deployment-plan.json').read_text())
old=(R/'docs/GATE_A_SHVDNE_PRIVATE_03_PROCEDURE.md').read_text(encoding='utf-8-sig')
old=old.replace('# GATE-A-SHVDNE-PRIVATE-03 — proposed live-01 procedure','# GATE-A-SHVDNE-PRIVATE-03B — proposed live-01 procedure',1)
old=old.replace('No loader replacement/download, dsound/xinput proxy, OpenIV.ASI, custom cache flag, cache deletion, gameconfig substitution or executable/archive patch is permitted.', 'Preserve the exact existing XInput and DInput proxies. No loader replacement/download, additional proxy, dsound proxy, OpenIV.ASI, custom cache flag, cache deletion, gameconfig substitution or executable/archive patch is permitted.',1)
old=old.replace('existing dinput8, Script Hook V','existing xinput1_4 and dinput8, Script Hook V',1)
old=old.replace('the new isolated PRIVATE03 DLL','the unchanged isolated PRIVATE03 DLL',1)
old=old.replace('exact ASI inventory, no competing proxy or reparse path','the exact 49-file original root DLL/ASI inventory and identities, no unexpected alternative proxy or reparse path',1)
old=old.replace('expected OpenRPF 0.3 initialization-success log in this session, no unexpected pattern/file/loader errors, no duplicate ASI loader,','expected OpenRPF 0.3 initialization-success log in this session, one intended Enhanced XInput ASI-loader initialization sequence and no contradictory or duplicate ASI/SHVDNE initialization, no unexpected pattern/file/loader errors,',1)
old=old.replace('`direct-handoff-components.json`','the retained PRIVATE03 `direct-handoff-components.json`')
intro='''
This is a new **preparation/package identity**, not a rebuilt resource or probe. The old PRIVATE-03 live-01 approval is consumed and its failed preflight is preserved. The new manifest and fresh fixed supervisor session are independent. The runtime DLL/INI experiment identifier remains PRIVATE-03 because the unchanged probe accepts that identifier; this does not reuse the old session or approval. Probe version stays 0.3.0.0, SHA-256 `5c0ae83682806bd6a5f723ad39758ca5302e1cf7c1d89ddb2be9c41a0a2ebfba`; supervisor remains `2fda83de4372d3eae8a33ac151167c5d046da5a714283a2f34ff86840d5175ca`.

The exact retained XInput hash is `a1a8bde409ed75d94a0439c37cf881bc354b13c2f8cd32e4bef3b10f308f1392`; DInput is `9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d`. Both match the same retained Script Hook V distribution. Enhanced imports XInput; historical logs establish Enhanced-loader ASI initialization. SlimDX has a potential DInput import edge in the preserved RPH dependency stack. Presence, imports, module loading and ASI initialization remain separate claims. No actual conflict was established offline, and no universal coexistence guarantee is claimed. Fresh logs are an admission gate during the one approved experiment, not a second discovery launch. No game-memory or loaded-module inspection is authorized.

The complete inventory and evidence are in `GATE_A_SHVDNE_PRIVATE_03B_LOADERS.md` and the bound `loader-contract.json`. All 49 existing root DLL/ASI names and hashes must match; XInput is now protected/read-only and included in the supervisor's independent restoration checks. Unknown aliases, extra DLL/ASI files, missing binaries and modified hashes fail admission. All expected absent runtime/configuration paths and the original integrity checks remain enforced.
'''
old=old.replace('## Evidence contract',intro+'\n## Evidence contract',1)
commands=r'''
## Exact preparation paths and commands

Work in `C:\Users\Libby\Documents\RichAudio-SHVDNE01` on `feature/migration-shvdne-01`. The preparation root is `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\gate-a-shvdne-private-03b`; its `execution-01` must not already exist. Do not use the old PRIVATE03 manager or old manifest. The finalized digest is in the new `result.json` and exact proposal wording is in the new `FRESH_AUTHORIZATION.txt`.

The read-only preflight was already run successfully against the real GTA directory before this proposal was sealed. Recheck the sealed digest and all entry conditions immediately before any newly approved installation. The `--manifest-sha256` option is read-only integrity checking and grants no live permission. The `--approved-manifest-sha256` option is used only after my explicit fresh approval of the exact new digest; possessing its value is not consent.

```powershell
$taskPython = 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1110-778-0_26.1110.778.0_x64__3k8sg7r9htsxt\dependencies\python\python.exe'
$prepRoot = 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\gate-a-shvdne-private-03b'
$manager = 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\tools\native-control\private-profile03b\Manage-Installation.py'
$manifestSha = (Get-FileHash -LiteralPath (Join-Path $prepRoot 'execution-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
# First compare $manifestSha with my separately approved new03B digest.
& $taskPython -B $manager preflight --manifest-sha256 $manifestSha
# Only after explicit new03B live authorization and all current entry gates:
& $taskPython -B $manager install --approved-manifest-sha256 $manifestSha
& $taskPython -B (Join-Path $prepRoot 'Watch-AuthorizedGame.py') --approved-manifest-sha256 $manifestSha
```

The watcher is started as an ongoing task, before the single normal Steam Library launch. Its metadata-only attachment and supervisor remain responsible for absolute deadlines. It does not launch GTA. OBS is opened normally using the enumerated private profile/scene; no streaming command is permitted. Recordings go only to the new03B `execution-01\capture` directory. Use the new03B copy of `Extract-Capture03.py` for declared capture windows; `ResourceProof03.mjs` and `ResourceMarker.mjs` remain the original bound detector sources.

After verified normal GTA closure, finalized recording, normal OBS closure and the required evidence review:

```powershell
& $taskPython -B $manager restore --approved-manifest-sha256 $manifestSha
& $taskPython -B $manager verify --manifest-sha256 $manifestSha
```

Restoration validates read-only originals, every backup and immutable installed target before removal. It archives recognized mutable/generated files and restores only enumerated originals; the unknown-file preservation rule remains unchanged. An unexpected extra root DLL/ASI is never removed by rollback and final independent inventory verification refuses it. A failure remains a failure after later file recovery. Independently check the retained supervisor's 112 restoration entries after closure, plus the manager's complete exact-set verification. Never call restore while GTA/OBS is present, delete a loader, recursively delete mods/scripts, remove a changed file, or overwrite a read-only archive/cache.

### Exact temporary file inventory

Only the following nine new game files and three OBS files are part of this proposal. Source paths, exact bytes and hashes are in the bound deployment plan. Only TrainerV.asi is parked; both proxy loaders remain installed.

| Destination | Kind | Bytes | SHA-256 |
| --- | --- | ---: | --- |
'''
for x in plan['newGameFiles']+plan['obsFiles']:
    commands+='| `'+x['destination']+'` | '+x['kind']+' | '+str(x['bytes'])+' | `'+x['sha256']+'` |\n'
with (R/'docs/GATE_A_SHVDNE_PRIVATE_03B_PROCEDURE.md').open('x',encoding='utf-8',newline='\n') as f:f.write(old+'\n'+commands)
report='''# GATE-A-SHVDNE-PRIVATE-03B — preparation correction

I requested this correction after my authorized PRIVATE-03 live-01 stopped at the real-root preflight. Codex corrected the external loader inventory and completed a successful **read-only real-root preflight**. This work stops before installation or live execution. The consumed approval and all historical evidence remain preserved.

The omission was the existing Enhanced XInput proxy, not an observed runtime incompatibility. Codex verified both installed proxies and Script Hook V against the same retained distribution, inspected all 49 current root DLL/ASI files, preserved relevant prior initialization evidence and distinguished static imports from actual initialization. The full inventory, authentic-distribution evidence, exact hashes and limits are in [the loader report](GATE_A_SHVDNE_PRIVATE_03B_LOADERS.md). No actual competing-loader conflict was established. DInput is not declared inactive: SlimDX has a static DInput import edge, while RPH remains excluded from the proposed experiment.

Codex made the correction in a new `tools/native-control/private-profile03b/Manage-Installation.py`, separate from every sealed PRIVATE03 file. It inherits the unchanged installer/restorer and replaces only the admission and complete-inventory verification layer. It pins both proxies, all other existing root DLL/ASI identities, current .NET/VC prerequisites and 39 static native import candidates; rejects unknown names, alternative proxies, aliases and modified bytes; checks all original integrity guards, branch/HEAD, selected Steam option, inactive processes, absent destinations, no reparse paths and available space. XInput and the previously unbound root DLLs are protected read-only originals and part of the independent supervisor restoration list. No arbitrary extra DLL is admitted.

The actual-root receipt is `.local/gate-a-shvdne-private-03b/real-root-preflight.json`. It passed against `D:\\Games\\steamapps\\common\\Grand Theft Auto V Enhanced`, with 49 exact root binaries, 68 protected game/dependency/log files, 29 original OBS files and 39 native prerequisite files. Before/after hashes and lengths match. Mods/scripts, all new destinations and `execution-01` were absent. Selected launch options remain `-nobattleye`; .NET release533509 and VC x64 v14.50.35719.00 matched. Required free space was 3,662,151,687 bytes on the game drive and 1,639,018,787 bytes on the worktree drive; the receipt records 75,962,736,640 and 652,007,256,064 free bytes respectively. Available space is time-dependent and must be checked again before any future install.

The targeted regression runner passed **35 cases**. Its copied installation originated from the actual complete inventory, including XInput and DInput. Cases cover the valid inventory, each missing/modified principal loader, unexpected proxies and DLL/ASI files, a copied XInput alias, stale runtime/cache configurations, wrong root, staged SHVDNE corruption, destination substitution, insufficient space, bounded fixture paths, no mutation on negative preflight, nine-game/three-OBS installation with the unchanged full shadow, changed target/corrupt backup/read-only XInput rollback refusal, exact original restoration, post-restore extra-file refusal and new approval boundaries. All fixture mutations were confined under the new preparation's `installer-fixtures`; no game or OBS application ran. The test source and `.local` result are retained. Prior failed and successful tests were not rewritten.

This is a new preparation/package candidate with a fresh fixed session and manifest. The disabled PRIVATE03 probe stays version0.3.0.0, SHA-256 `5c0ae83682806bd6a5f723ad39758ca5302e1cf7c1d89ddb2be9c41a0a2ebfba`. Codex did not rebuild it, the private resources, or the 3.12GB shadow. The same runtime experiment identifier is required by the unchanged probe; only the separately approved new configuration would enable it. The probe has no negative XInput restriction, so correcting the external binding does not require native/controller changes.

The supervisor remains SHA-256 `2fda83de4372d3eae8a33ac151167c5d046da5a714283a2f34ff86840d5175ca`. Codex verified its unchanged bytes, source/test evidence, 109 prior assertions and five disposable scenarios. The new watcher derives 112 independent restoration checks, below256. All stopping limits are identical. My successful direct STOP/ESCALATION text-cue acknowledgment component remains 1.4600283s and normal fixture exit1.5852303s. The raw combined UI fixture remains failed, exactly as recorded; component evidence and independent restoration are distinct. Current availability and unchanged display/input conditions must still pass before any live execution, and the notice must remain continuously visible beside windowed GTA. No new rehearsal, supervisor execution or GTA shutdown claim is made by this correction.

Codex verified the original resource-manifest, DAT151, DAT54, AWC, marker WAV, private DLC, shadow, disabled probe/default INI, supervisor, detector and rollback evidence hashes. The comprehensive preservation receipt is `.local/gate-a-shvdne-private-03b/preservation-after.json`. It rechecks the old 390 bindings, the prior source/history baselines, every file under the old PRIVATE03 preparation including the consumed-approval closure, all original game/OBS pins and the protected RPH menu edit. No production synthesis, historical evidence, original RPH working tree, base archive or rpf.cache was changed.

The finalized preparation identity and hashes are in `.local/gate-a-shvdne-private-03b/result.json`; its execution manifest binds this report, the complete procedure, new helpers, regression/read-only receipts, loader evidence, unchanged private artifacts and retained operational inputs. The independently versioned evidence index is produced only after its inputs close. Exact proposed authorization text is `FRESH_AUTHORIZATION.txt`. It is a draft for my separate decision, not an authorization record. No local commit, push, merge, tag or publication occurred; unrelated migration changes remain intact.

The next live procedure remains the original functional marker experiment: one normal RPH-free launch; clean fresh loader/SHVDNE/OpenRPF and zero-microphone/no-streaming capture admission; one disposable Bati pair; usable independently marker-negative A/B horn baselines; explicit baseline review; at most one manually armed/confirmed private request to A; unchanged B control; bounded post observations; normal retirement and exit without saving; exact and independently checked restoration. Latest pair request is10:30 process age, active limit3minutes, baseline80s, assignment100s, retirement140s, planned stop14minutes, absolute15minutes, notice acknowledgment5s and normal exit grace60s. No deadline resets.

The false preflight blocker is removed. Remaining questions require the separately authorized experiment: exact-build joint OpenRPF/SHVDNE private mounting, private horn contribution/selection and A/B isolation, live capture usability, normal behavior and GTA shutdown/restoration timing. Existing 10ms performance and prior diagnostic deadline FAILs remain unchanged. Full suppression, complete ownership, prior-effective-profile recovery and production integration remain unqualified. No additional loader-discovery launch is proposed. If a fresh admission phase fails, stop normally without a retry or fallback.
'''
with (R/'docs/GATE_A_SHVDNE_PRIVATE_03B.md').open('x',encoding='utf-8',newline='\n') as f:f.write(report)
print('Wrote new03B report and complete procedure; historical03 docs unchanged')
