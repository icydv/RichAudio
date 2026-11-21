# MENU-02 recovery preparation

My first MENU-02 attempt remains **startup-aborted and restored**. Codex launched RPH through a UI API that did not supply the game working directory. GTA never started. The timestamp failure during rollback and the separately completed, independently verified restoration remain preserved; no old receipt or approval was reused.

I am preparing one fresh test of my existing F10 sidebar. This recovery changes the operating procedure only. The menu, audio engine, settings schema and retained payload are unchanged.

## Corrected launcher

[Launch.ps1](../tools/menu02-recovery/Launch.ps1) constructs an actual .NET ProcessStartInfo with these explicit properties:

- FileName: the absolute, hash/size/version-verified RAGEPluginHook.exe.
- WorkingDirectory: the absolute verified game directory, pinned by canonical path, volume serial and directory file ID.
- Arguments: explicitly empty, preserving the original intended arguments.
- UseShellExecute: false; CreateNoWindow: false; WindowStyle: Normal.

The executable must be inside that exact working directory. Missing paths, identity drift, unexpected versions and reparse points, including dangling links and ancestors, are refused. There is no shell-directory inference, alternate executable, directory fallback or retry. The only Process.Start is behind the externally pinned manifest, fresh approval/deployment receipts, current deployed fingerprints, closed-process checks and a create-new launch marker. The coordinator additionally requires a living, identity-bound supervisor and rejects terminal/restoration markers.

Codex validated construction with both PowerShell's location and the process current directory deliberately moved elsewhere. An exact preview against the current static installation passes without deployment or Process.Start. **Neither check establishes successful GTA startup or the identity of the later loaded RPH API.**

## Corrected restoration

[Restoration.ps1](../tools/menu02-recovery/Restoration.ps1) accepts the native DateTime produced by default ConvertFrom-Json directly, supports DateTimeOffset, and requires explicit-zone invariant round-trip strings when the value is text. It prevalidates all metadata and both backups before any target mutation.

The helper distinguishes existing originals from originally absent files, accepts only exact original or reviewed candidate states, checks hashes and fixed/reparse-safe paths, preserves permissions, restores timestamps/attributes, and checks process closure before each mutation. Unexpected changes stop restoration. Failure receipts retain partial work; there is no automatic retry.

## Offline evidence

The final focused populations are separate, not a unique pooled total:

| Verification | Result |
| --- | --- |
| Launcher construction, CWD and identity | 36 passing checks |
| Launch receipt, process and protected-state gates | 34 passing checks |
| Actual dangling-reparse regressions | 5 passing checks |
| Production restoration helper on disposable fixtures | 33/33 passing |
| Independent execution of that same restoration suite | 33/33 passing; overlapping population |
| Actual coordinator Preview/Deploy/Rollback on disposable files | 8/8 passing, with external receipt-hash assertions |
| Synthetic monotonic deadline boundaries and invalid operands | 28 passing |

The coordinator fixture compiles an inert executable solely for metadata checks and never executes it. Restoration fixtures use an identified disposable PowerShell child to verify refusal while a process is active; it exits normally. No actual GTA/RPH process, endpoint or asset is involved.

The original October 30 en-GB timestamp failure is reproduced, while en-US also demonstrates lost fractional ticks in the old conversion. Corrected restoration retains exact UTC ticks. Fixtures cover original absence, mixed original/candidate states, hashes, metadata/ACLs, all-target prevalidation, real locked-copy refusal, drift, and explicitly labelled copy/metadata fault injection.

Independent review rejected the first recovery draft because a FunctionsOnly helper import cleared the coordinator's manifest parameters. Its initial seven-case fixture had not independently asserted those bindings. The corrected import explicitly preserves both parameters. The final eight-case fixture verifies ten actual receipts against the nonempty externally supplied hash, plus their approval, metadata and restoration-result backlinks. The unaccepted draft, preview and seven-case results remain intact; none is acceptance evidence for the corrected procedure.

Earlier development evidence remains intact. A 31/32 fixture run used an invalid assumption that a read-shared handle prevents Windows timestamp setters; the corrected test labels metadata injection explicitly. A pure-clock test found a remaining-time display rounding defect from Math.Max overload selection; the double overload is corrected and the original failed log is retained. Review also found and corrected the dangling-link guard in the procedure. None is an observed menu defect or a replacement menu build.

A final terminal blank line was removed from the coordinator for the repository whitespace check. All 2,517 semantic tokens match the retained tested source; the final source hash and read-only preview are separately pinned. No logic or candidate changed.

The file-polling supervisor is source-reviewed; its clock functions pass the 28 checks. Its actual watcher lifecycle and live UI response remain unexecuted. No gameplay performance claim follows from these tests. Existing WORLD13 failures are unchanged, and no engine/performance suite was rerun.

## Exact fresh proposal

The private successor manifest SHA-256 is **4d0194bb15de6d283c8e97b9737b3d5c7122b334b71713918c3c30fb78828581**. It binds executable and directory identities, four procedure-source hashes, both original/proposed payload identities, all 13 phase-specific protected fingerprints, validated restoration evidence, backups and the new single-use transaction.

The retained menu DLL is 88,064 bytes, SHA-256 **8e70ddbbcc5d98b57239c54eb764427f6d055c808b3b9fd616ac71daaa525d0b**. The isolated sidecar remains SHA-256 **15a4ec13441701642a38ceb16eafa74302d91e9163e20a126e86731d9d55a41a**. Neither was rebuilt or changed.

After separate approval, [Invoke-Menu02Recovery.ps1](../tools/Invoke-Menu02Recovery.ps1) permits only the two existing destinations: Plugins/RichAudio.dll and Plugins/RichAudio.Menu.json. It first verifies all 13 originals, exact sources and isolated descriptor/status absence, confirms process closure, and takes two verified byte backups plus metadata. Startup, RPH configuration, original preferences, display settings and unrelated mods remain untouched. No extra Menu02-named plugin is added.

The new transaction is menu02-live-02, which must not already exist. Old live-01 controls and consumed receipts are not eligible. The launch is one RPH start with at most 600 seconds to playable Story Mode, then at most 900 seconds of menu interaction, capped at 1,500 seconds since launch. The independent monotonic supervisor signals expiry; the operator must stop test input and exit normally. It does not kill processes or operate the game.

The test remains the existing sidebar checklist: full height/position, animation/dimming, foreground cursor/click alignment, keyboard/mouse/controller if present, isolated settings and persistence, control capture/release, repeated opening/reversal, basic performance/stability observations and clean shutdown. Playback, map warming, GPU acoustic processing, SoundMap recording and other audio work remain inactive.

Warnings, incompatible loaded API, identity drift, unexpected component/activity, deadline/terminal flags or any needed unreviewed modification stop the attempt without retry. After normal exit, restore both originals and verify bytes, hashes, metadata, permissions, all 13 fingerprints and owned-process closure, with independent read-only verification. Preserve all failures.

## Approval boundary

Fresh read-only preparation verifies GTA Enhanced 1.0.1158.16 and RPH launcher 1.132.1428.17748 against their expected hashes. The actually loaded API remains unresolved without launch; matching launcher/version or an offline test cannot authenticate it.

**No installed file was changed and no GTA/RPH launch occurred during this recovery.** The private manifest is awaiting fresh explicit approval for one temporary deployment, one bounded live attempt and verified rollback. This document grants no deployment, launch, recording or merge permission.
