"""Write the separately reviewed03C live protocol; does not authorize or run it."""
from pathlib import Path
import json
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03c'
plan=json.loads((P/'deployment-plan.json').read_text(encoding='utf-8-sig'))
old=(R/'docs/GATE_A_SHVDNE_PRIVATE_03B_PROCEDURE.md').read_text(encoding='utf-8-sig')
body=old[old.index('## Evidence contract'):old.index('## Exact preparation paths and commands')]
body=body.replace('the unchanged isolated PRIVATE03 DLL','the new isolated PRIVATE03C DLL')
body=body.replace('exactly one PRIVATE03 script','exactly one PRIVATE03C script')
body=body.replace('ResourceProof03.mjs','ResourceProof03C.mjs')
body=body.replace('worktree space for verified backups, at least 1 GiB capture reserve and the stated margin','worktree space for verified backups, at least 1 GiB capture reserve, the 512 MiB margin and the explicit recovery archive reserve (`reserveRecoveryArchiveBytes` = 3,149,313,024 bytes; current total worktree minimum 4,788,331,811 bytes)')
body=body.replace('| Complete baseline decision | By 80 seconds of active phase |','| Durable baseline acceptance | Before 80 seconds of active phase |')
body=body.replace('| Sole assignment request | By 100 seconds of active phase |','| Sole assignment dispatch, including final API permission | Before 100 seconds of active phase |')
body=body.replace('By 80 seconds either accept both baselines or stop.','Finish review and issue F10 early enough for its durable acknowledgment before 80 seconds; an unaccepted baseline at that cutoff stops the phase.')
body=body.replace('within ten seconds and by 100 seconds of the active phase.','within ten seconds and early enough for the durable intent acknowledgment and final native API checks before 100 seconds of the active phase. A key press before the cutoff does not reserve dispatch permission.')
body=body.replace('the retained PRIVATE03 `direct-handoff-components.json`','the retained PRIVATE03 `direct-handoff-components.json`')
body=body.replace('No spawn or assignment before these conditions','No spawn or assignment before these conditions')
intro='''# GATE-A-SHVDNE-PRIVATE-03C — proposed live-01 procedure

**Preparation only. I have not authorized this experiment.** My PRIVATE-03 approval is permanently consumed. PRIVATE-03B and its manifest remain preserved; the demonstrated offline gaps require this independently versioned PRIVATE-03C proposal. Neither its draft authorization nor a hash argument grants consent. GTA/OBS remained closed during this preparation.

The final candidate is **0.3.1.1**, SHA-256 `fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0`, with a disabled default INI. Only the new fixed-session explicitly approved runtime INI may enable it later. Runtime identifier is `GATE-A-SHVDNE-PRIVATE-03C`, DLL/INI basename `RichAudio.GateAPrivate03C.Shvdne`, evidence directory `RichAudio.GateAPrivate03C.Evidence`, decorator `RA_PRIVATE03C`. Earlier PRIVATE03/03C build01 binaries are not installed. The supervisor remains SHA-256 `2fda83de4372d3eae8a33ac151167c5d046da5a714283a2f34ff86840d5175ca`.

The complete exact49-file installed loader inventory remains required. Both existing XInput and DInput proxies are preserved. No loader investigation, replacement or additional discovery launch is part of this attempt. All original resources, private horn identifier, stock reference branches, DLC and complete update shadow are unchanged.

The new controller enforces the existing phase limits from one accepted pair-request clock: durable baseline acceptance must occur **before80seconds**, the sole native request must occur **before100seconds**, and normal stop/retirement begins at **140seconds**. The180-second active ceiling remains. The final assignment permission is checked again after the actual API's lifetime/readiness calls and immediately before its only fixed setter. It checks the clock last after supervisor/journal permission. No queued dispatch, pause, cleanup, user delay or file recovery resets a deadline. These checks reject late requests; they cannot guarantee a GTA native returns promptly. Independent supervision and direct normal exit remain mandatory.

Use the new `ResourceProof03C.mjs` for evidence admission. The original complete31-symbol positive rule is unchanged. A qualified12-symbol temporal fragment with at least3transitions in either baseline or the control causes INCONCLUSIVE review. No qualified fragment is weaker than proof of no contamination: shorter, quiet, masked or shifted fragments can escape. A known contamination or missing event overrides PASS. No post-result pitch fitting, window selection, normalization or threshold tuning is permitted.

Use `Extract-Capture03C.py` and its frozen v02 timeline policy for declared windows. Every decoded audio/video frame must have finite PTS. Adjacent and cumulative audio displacement are bounded at2ms; video timestamps increase and frame gaps/durations are bounded at100ms; the selected audio interval must be covered by video. The source hash/size is bound before decode and rechecked afterward. A failed admission produces a refusal receipt and no admitted WAV. Retain predeclared source hashes, sample windows, video event annotations and journal identities before detector output. No reference marker may play during game capture.

The transaction manager installs once and permits only same-attempt file-restoration continuation after verified normal game/OBS closure. Continuation grants no second installation, game launch, activation, pair or native assignment. It requires exact backups, immutable source pins, durable exclusive-create/file-identity proof and exact source-prefix bytes before recognizing interrupted copies. It archives before removal and resumes only proven work. Unproven empty files, replaced identities, hard links, modified prefixes, unknown files, corrupt backups or read-only drift are preserved and refused. Never improvise deletion to recover a failed transaction. If safe recovery is refused, retain all evidence/files and stop for a separate decision.

The prior direct-user text-notice handoff components are preserved. My availability is a current admission gate, not inferred from historical readiness. The monitor must remain continuously visible beside windowed GTA; no headless fixture proves exclusive-fullscreen visibility. On STOP or ESCALATION, I must directly acknowledge within5seconds and begin normal exit. No Codex acknowledgment or script stop receipt substitutes for that direct response. No forced termination is authorized.

'''
tail=r'''
## Exact package and commands

Work only in `C:\Users\Libby\Documents\RichAudio-SHVDNE01`, branch `feature/migration-shvdne-01`. The proposal is `.local\gate-a-shvdne-private-03c\execution-manifest.json`; its exact digest is in `result.json` and `FRESH_AUTHORIZATION.txt`. Verify the digest against my separate explicit approval. `execution-01` must not exist before the new attempt. Do not run the old03B manager or candidate.

```powershell
$taskPython = 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1110-778-0_26.1110.778.0_x64__3k8sg7r9htsxt\dependencies\python\python.exe'
$prepRoot = 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\gate-a-shvdne-private-03c'
$manager = 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\tools\native-control\private-profile03c\Manage-Installation.py'
$manifestSha = (Get-FileHash -LiteralPath (Join-Path $prepRoot 'execution-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
# Read-only, with no live permission implied:
& $taskPython -B $manager preflight --manifest-sha256 $manifestSha
# Only after separate exact03C live approval, current user readiness and every entry gate:
& $taskPython -B $manager install --approved-manifest-sha256 $manifestSha
& $taskPython -B (Join-Path $prepRoot 'Watch-AuthorizedGame.py') --approved-manifest-sha256 $manifestSha
```

Run the watcher as an ongoing task before the single normal Steam Library launch. It never launches GTA. It attaches only to the exact new process and starts the unchanged independent supervisor within its ten-second attach bound. It records the supervisor's exact PID, creation ticks, executable path/hash and new session. An attachment failure stops the attempt, without retry. Open OBS normally only with the enumerated private `GateAPrivate03CLive01` profile/scene; local output is `execution-01\capture`. Inspect the active graph and output before spawning. No microphone or streaming is permitted.

Use only the bound `Read-Status03.ps1 -Path <status.json>` reader when observing the monitor. It shares DELETE so atomic status replacement is not blocked. Never poll its live status with Get-Content or File.ReadAllText.

For each independently declared finalized capture window, use the bound new extractor and proof tool. The following illustrates arguments, not actual window annotations:

```powershell
& $taskPython -B 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\tools\native-control\private-profile03c\Extract-Capture03C.py' <finalized-capture.mkv> <declared-window.wav> --start <seconds-from-first-decoded-audio-sample> --duration <seconds>
& 'C:\Program Files\nodejs\node.exe' 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\tools\native-control\private-profile03c\ResourceProof03C.mjs' baselines <baselineA.wav> <baselineB.wav>
& 'C:\Program Files\nodejs\node.exe' 'C:\Users\Libby\Documents\RichAudio-SHVDNE01\tools\native-control\private-profile03c\ResourceProof03C.mjs' contribution <baselineA.wav> <baselineB.wav> <targetA.wav> <controlB.wav>
```

Source/target files must be within this attempt's `execution-01`. Never use `--offline-fixture` on live evidence. Before F10, manually accept both usable complete baseline events and their provenance in addition to the signal checks. If annotation, extraction or review cannot finish before the phase cutoff, stop; no deadline extension is available.

After normal game exit without saving, verified exact process absence, finalized recording and normal OBS closure, retain the exact supervisor for independent restoration verification. During restore/verify only, the sole allowed relevant process is that bound supervisor. All game/RPH/OBS/host and other RichAudio processes must be absent; preflight/install permit none.

```powershell
& $taskPython -B $manager restore --approved-manifest-sha256 $manifestSha
& $taskPython -B $manager verify --manifest-sha256 $manifestSha
```

An interrupted restoration may invoke the same restore command solely to continue proven file recovery in this same attempt, after rechecking process closure and all recovery guards. Never call install again. No operation renews a gameplay deadline. The supervisor independently verifies its112restoration entries, including all original game/OBS pins and new-file/directory absence. The manager independently verifies the complete exact root DLL/ASI inventory. Only then complete the supervisor's normal restoration verification; never force-close it to bypass that check.

Keep test-vehicle retirement, normal process exit, file restoration, evidence continuity and prior-effective-profile recovery as separate results. Restoring disk files cannot repair a deadline violation. This proposal does not claim prior native-profile restoration or independent recovery of arbitrary native overrides.

## Later live checklist

1. Review the03C manifest, changed-source hashes and procedure; give fresh exact approval only when I am available.
2. Pass read-only preflight and current direct-user/display/input gates; verify fixed session and exact9+3 inventory.
3. Install once, start the watcher, then launch once through normal Steam with existing `-nobattleye`, offline Story Mode and no RPH.
4. Admit fresh loader/SHVDNE/OpenRPF initialization, continuously visible windowed notice and finalized usable zero-microphone/no-streaming capture before requesting a pair.
5. A/B complete horn baselines and independent provenance review before80s; explicit F10; manual F6/F7 sole A request before100s. B remains untouched.
6. Capture A then B under the same conditions; stop/retire by140s. A failure or notice ends progression immediately.
7. Direct acknowledgment within5s; normal exit within60s and before the absolute15-minute process deadline. No save, forced termination, second launch or fallback.
8. Finalize/close OBS, restore only proven manifest-owned files, independently verify exact restoration and retain every result.

## Exact temporary inventory

Only the following nine game files and three OBS settings files are installed. The fixed new session and source identities are in the bound deployment plan. Only TrainerV.asi is parked; both existing proxy loaders stay installed.

| Destination | Kind | Bytes | SHA-256 |
| --- | --- | ---: | --- |
'''
for x in plan['newGameFiles']+plan['obsFiles']:
    tail+='| `'+x['destination']+'` | '+x['kind']+' | '+str(x['bytes'])+' | `'+x['sha256']+'` |\n'
with (R/'docs/GATE_A_SHVDNE_PRIVATE_03C_PROCEDURE.md').open('x',encoding='utf-8',newline='\n') as f:f.write(intro+body+'\n'+tail)
print('Wrote complete03C procedure; no authorization or live execution')
