# ACOUSTICS-07.16 — Fresh launch-only attempt preparation

The consumed 07.13 journal/quarantine paths prevented reuse of the sealed 07.12 session helper. Three new filesystem-only helper copies now bind a distinct private attempt's journal, quarantine, observations and independent restoration result. The original candidate/package and historical records are unchanged. A verified human shell and fresh launch-only approval remain required; this preparation grants no live authority.

Base: #67 at `148f76427a2ba9d9686459f711cf80ce1c96dc08`. Runtime remains `b5143db8c99decef49a8c9fdf1473f0c3db4840f`; inherited audio operator source remains `c3f6c81952ceeb63d5db2b1e23378693efabfd02`. No sealed binary was rebuilt. Required offline gates build their own disposable test outputs in this checkout.

## New review record and preserved inputs

The private package's `attempt.json` is a separate `REVIEW_ONLY`, `RPH_LAUNCH_ONLY` record, not a replacement audio candidate. Its SHA-256 is `0B6960B3512044241D45F467567CE25CB7AD9EA399207C72F8BE144E48157207`. The new `review-seal.json` SHA-256 is `8E93414B8899B24B613175F66AA7202AD93778F631B88EC9049F4670F267BB18`.

The original candidate stays SHA-256 `D8E07531B2C80F9F322940A6770B462E7FEDC28DCAF870DFEDA7A13E38981C41`, with all 89 bindings unchanged. The original 26-file manifest remains SHA-256 `64FC1B32CDEAE1877FA82B124EC827F0307005833A6EF36E9F444303E3A71BBA`, referencing the same source bytes and baseline/backups. The original candidate hash does **not** cover the new helper copies. The new record hashes each helper and the four original baseline JSON files/two executable backups; it also rechecks the original candidate's complete binding list. A separate review seal covers the new record, helpers, private review and operator card. All machine-specific locations are private.

## Concrete path ownership

Let `PACKAGE` mean the new private attempt directory, never the old review directory or game installation.

| Path | Readers/writers and behavior |
|---|---|
| `PACKAGE/attempt.json` | All three helpers read its fixed routing and input bindings. No live helper edits it |
| `PACKAGE/state/deployment-journal.json` | Invoke-Session Deploy exclusively creates it before mutation, records intents/completed files/created directories, and subsequently updates only a journal bound to this attempt. Restore reads/updates this same journal |
| `PACKAGE/quarantine/` | Restore moves only enumerated introduced/generated files here with no overwrite. A pre-existing quarantine blocks a fresh deployment; pre-existing targets block restoration before any move |
| `PACKAGE/observations/` | Human/Codex retain invocation, requested directory, time, PID, supported process-context readings or explicit unavailability, startup/console/closure evidence. Evidence uses new files only; no helper launches or controls RPH |
| `PACKAGE/observations/shell-check.txt` | Common approval gate reads the full human-supplied output and requires one PID, Medium SID `S-1-16-8192`, administrator result `False`, and no ambiguous integrity/Boolean result |
| `PACKAGE/fresh-approval.json` | Deploy reads a future, unexpired, one-attempt approval bound to this attempt hash, original candidate/manifest hashes, observed shell PID and shell-evidence hash. No approval file is created in preparation |
| `PACKAGE/restoration/independent.json` | Independent Verify-Original writes a new result only after verifying this attempt's restored journal, original root/signatures/directories/archives/sampled hashes and relevant process absence. It rejects unrelated journals and existing results |

`Invoke-Session.ps1 -Action Verify` now checks fresh attempt output paths as well as sealed inputs and original installation state. `Verify-Original.ps1 -BaselineOnly` is read-only and creates no restoration result. Live Deploy cannot use the fixture bypass; it requires fresh approval and shell evidence. Fixture mode requires both an explicit switch and a labelled root directly under the OS temporary directory, with every fixture game/source/baseline/manifest/candidate inside that disposable root. Fault injection is rejected outside fixture mode. No fixture creates an approval.

The source files under `tools/attempt/` are copied to the private package and separately hashed there. `LaunchOnly.Common.ps1` supplies input/path/hash, original-state, shell-evidence and fresh-approval checks. `Invoke-Session.ps1` performs only explicit Verify/Deploy/Restore actions. `Verify-Original.ps1` independently verifies the correct attempt and baseline. No helper starts GTA/RPH, the audio host or producer, delivers console commands, changes system settings, or kills a process.

## Offline validation

Ten focused checks exercise actual copied helpers in disposable filesystem fixtures:

1. Fresh deployment/restoration routes all 26 additions and generated files to the new attempt; independent verification writes the matching result and refuses overwrite.
2. Existing journal is rejected without modifying it or the mock installation.
3. Existing quarantine blocks fresh deployment without overwrite.
4. Existing quarantine target blocks restoration before executable renaming or file moves.
5. Injected failure after three completed copies leaves a usable attempt journal; restoration and independent verification succeed for precisely those three copies.
6. A modified introduced file remains byte-identical in place; restoration reports failure and creates no success result.
7. An unexpected file remains untouched; original-state/independent verification fail rather than hide incomplete restoration.
8. Independent verification rejects a different/no-journal attempt, historical journal routing, and implicit fixture execution.
9. Changed baseline bytes are rejected against their binding.
10. Synthetic shell output accepts Medium/False and rejects High, administrator True and missing integrity evidence. This does not verify the human's actual shell.

The focused run passed all ten cases. The complete local offline suite passed with these checks registered. A preservation inventory covering 162 historical package/evidence/binding files reports zero changes; synthetic historical records also remain unchanged. Final publication and hosted results are recorded in the PR, against the final published contents. Sanitized source/results only are published; raw fixture paths, shell output and machine evidence stay private.

## Future launch-only decision

First obtain the exact human-window output requested below. The elevated tool shell is not the launcher. Account name, window title, Explorer activation and omission of RunAs are not evidence of a normal token. Require Medium Mandatory Level SID `S-1-16-8192` and role result `False`; High/System or ambiguous output fails. Repeat after switching shells.

```powershell
"PowerShell PID: $PID"
& "$env:SystemRoot\System32\whoami.exe" /groups
([Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
```

Only after observed shell evidence and a separate explicit approval, Codex may run the new package's Verify and read-only baseline checks, then Deploy. The human runs the unchanged exact Start-Process command with explicit game-directory FilePath/WorkingDirectory, no additional arguments and no elevation verb. The private operator card supplies every absolute helper and launch invocation. One launch route/attempt only; no Explorer fallback or retry.

The observation limit is **300 seconds from invocation**, independently of any audio-host clock (there is no host session). Retain invocation/requested directory/time/PID; PID creation alone is not success. Acceptance requires relevant RPH/game startup evidence, stable Story Mode and **one manual bridge load establishing READY with sending OFF**. Actual process context is recorded where supported, otherwise marked unavailable. Do not issue RichAudioBeaconStart or open a publisher connection.

After either outcome, the human closes GTA/RPH normally. Codex checks process absence, runs the new Restore helper, then the independent verifier. Modified/unexpected files stay preserved for review; a failed/missing verifier result is incomplete restoration. No audio host/producer, emission, listening, capture, dependency repair, privilege elevation, system change or runtime modification is included.

The old 07.13 approval remains closed and cannot be reused. At preparation completion, the private package has no approval, journal, quarantine, observation, restoration-result, consumed-marker or launch-token artifact. The only outstanding user evidence is the output from the exact future human shell. A single concrete approval request follows only after that output passes validation.

Original CI cause remains unknown; 07.9 remains incomplete with failed Stop timing; 07.13 remains failed at launch with no listening result; combined ACOUSTICS-05 + BENCHMARK-01 remains **60%**.
