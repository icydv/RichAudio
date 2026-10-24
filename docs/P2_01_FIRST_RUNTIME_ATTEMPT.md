# P2-01 authorised deployment and first runtime attempt

24 October 2026. **Stopped at RPH's compatibility gate; game-file additions rolled back.** The user explicitly approved the Microsoft prerequisite, the exact 26-file manifest, supported Story Mode launch and conditional A–E testing. This report supersedes earlier statements that no runtime had ever been installed/launched. The earlier readiness reports remain historical evidence.

## Verified outcome

The prerequisite installed successfully. All 26 approved additions were copied without overwriting any destination and their hashes verified. RPH 1.132.1428.17748 ran, displayed its first-run disclaimer and reached Settings. Its Settings window reported **Grand Theft Auto V 1.0.1013.34 Retail NOT SUPPORTED**, rather than the expected Enhanced 1.0.1158.16. The agent stopped there, used Exit without saving/starting the game, and did not retry.

**GTA was not launched by the agent; RichAudio was not loaded; no live player/NPC telemetry was obtained.** Tests A–E were not run because the smoke-test prerequisite failed. No game crash was observed; game stability was not exercised. A bounded Windows Application log query found no matching RPH/GTA crash event. No telemetry JSONL file exists from this attempt.

The 26 introduced files were moved back into ignored development quarantine; the introduced empty Plugins directory was removed. The approved shared Microsoft VC2010 x64 runtime remains installed. This is rollback of the game-file additions, not a claim that the shared prerequisite or every first-run application preference was reverted.

## Execution record

Times below are **Europe/London, BST (UTC+1)** on 24 October 2026. Machine-readable receipts retain UTC timestamps.

| Time | Action | Actual result |
|---|---|---|
| 23:17:30 | Immediate preflight | All 26 destinations absent; source, package and expected Enhanced executable hashes match; installer signature Valid; process running as administrator; no GTA/RPH process found |
| 23:17:36–23:17:40 | Microsoft VC2010 x64 installer | Exit 0, version 10.0.40219.325; both installed MSVCR100/MSVCP100 x64 files have Valid Microsoft signatures |
| 23:18:33 | Approved file deployment | 26 additions verified; CreateNew used to refuse overwrite races; existing files preserved |
| 23:18:51 | RPH launch | Normal initial launch from game root; Settings subsequently reports unsupported 1013.34 |
| 23:20:12 | Rollback complete | 26 unchanged introduced files moved to development quarantine; no GTA/RPH process remained |

The existing Steam `-nobattleye` setting was preserved. The initial RPH launch used no additional arguments. Since the game never started, this attempt does not verify that RPH's launch route applies the Steam option. No antivirus, exclusions, anti-cheat, launcher, graphics, audio or vehicle behaviour setting was changed. No Online access or Phase 3 work occurred.

## Failure evidence and interpretation

| File already present before deployment | Version | SHA-256 |
|---|---|---|
| GTA5.exe | 1.0.1013.34 | FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF |
| GTA5_Enhanced.exe | 1.0.1158.16 | 69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5 |

Both files describe themselves as **Grand Theft Auto V Enhanced** and name `GTA5_Enhanced.exe` as OriginalFilename. Therefore the older file is not established as a Legacy-edition binary simply because its current name is GTA5.exe. Neither executable was renamed, deleted, overwritten or patched.

The UI-reported version matches the older GTA5.exe. **Inference:** executable selection/version discovery may be using that file or another stale target record. No filesystem/process trace established exactly which path RPH read, so this is not a proved root cause. It is also not proof that the authentic RPH build rejects the actual 1158.16 executable: that executable was not loaded in this attempt.

The actual deployed RPH file matches the reviewed official archive and expected version/hash. The telemetry adapter cannot explain the pre-game rejection because it had not been loaded. SDK member binding, DirectStorage behaviour, ASI/OpenRPF coexistence and game scheduling remain untested; none should be named as the observed cause.

Screenshot and accessible UI text were preserved locally. The UI showed a compatibility warning, not a crash dialog. No RPH log file was found in the game root during this attempt. The Restart with logging button was deliberately not used because the user required stopping on a conflict. Microsoft generated two real installer logs from the requested log prefix; their actual paths/hashes are recorded in the installation receipt.

## Measurements and A–E results

| Requested quantity | Verified result |
|---|---|
| Player/NPC position, velocity, RPM ratio, gear, distance, lifecycle | **Unavailable: no live observations** |
| Field accuracy / observed versus estimated reliability | No in-game reliability established; existing model classifications preserved |
| Sampling rate, p95 delay, misses, queue drops | **Not measured in game**; do not substitute offline mock figures |
| Maximum meaningful NPC distance / streamed count / urban-rural coverage | **Unknown**, not zero; no supported entity query ran |
| Game frame-time, incremental CPU, memory trend | **Not measured**; GTA did not run |
| Game crashes / stability | No game crash observed; no game stability exposure or pass |
| A idle, B motorcycle, C nearby traffic, D distant traffic, E lifecycle | **NOT RUN**, blocked by the framework gate |

A single RPH disclaimer-stage process snapshot reported accumulated CPU time 3.390625 s and working set 131,751,936 bytes. This is a startup UI observation, not CPU percentage, peak memory, telemetry cost or game-performance evidence. No frame-time monitor was added.

## Preservation and rollback verification

- All **32 original non-archive root files** have the same paths, sizes and SHA-256s after rollback, with no new non-archive root files left behind.
- All **179 RPF paths, sizes and last-write timestamps** match the pre-deployment inventory. This is metadata comparison, not content hashing of all 179 archives.
- The **ten previously investigated physical archives** were freshly SHA-256 hashed before deployment and after rollback; all match each other and Phase 1. They include the selected audio archives.
- All 26 manifest destinations are absent again; the original zero-byte OpenIV.asi remains zero bytes. No original archive restoration operation was necessary.
- RPH and GTA processes were absent at the post-rollback check. The introduced Plugins directory is absent.
- Microsoft VC2010 x64 remains installed as an approved shared prerequisite; it was not silently uninstalled. Its installer and installed-file signatures/hashes are recorded.

The comparison harness initially compared automatically parsed DateTime values with string timestamps and reported false differences. Canonical UTC round-trip strings were then compared on both sides, yielding zero differences; byte hashes also match. This diagnostic correction involved no game-file changes.

## Evidence and reproducibility

Versioned derived evidence: [result.json](../evidence/phase2.1/live-attempt-20261024/result.json), `preflight (offline backup only)`, `prerequisite installation (offline backup only)`, `deployment receipt (offline backup only)`, `rollback receipt (offline backup only)`, [binary versions](../evidence/phase2.1/live-attempt-20261024/startup-binary-versions.json), [executable descriptions](../evidence/phase2.1/live-attempt-20261024/game-executable-metadata.json), [post-rollback integrity](../evidence/phase2.1/live-attempt-20261024/post-rollback-integrity.json) and `bounded Application events (offline backup only)`.

Raw local diagnostics, intentionally excluded from Git:

- `.local/deployment-P2-01-20261024/rph-unsupported-version.png` — UI screenshot, SHA-256 FF7843559073682833F72B0F27D0932C37BB4A34F0A0C28BB08497451B8E86AD.
- `.local/deployment-P2-01-20261024/rph-unsupported-version-ui.txt` — accessible UI text.
- `.local/deployment-P2-01-20261024/vc2010-install.log.html` and `vc2010-install.log-MSI_vc_red.msi.txt` — actual installer diagnostics; the bare requested `.log` path is a prefix, not an emitted file.
- `.local/deployment-P2-01-20261024/rollback-files/` — unchanged introduced files preserved locally. No proprietary runtime, SDK, installer or game binary is committed or redistributed.

`tools/Invoke-P2Deployment.ps1` implements the executed explicit Install/Rollback operation, pinned to this exact approved manifest. Install refuses conflicts/reparse points and uses CreateNew. Rollback checks ownership/hashes and moves only introduced files into the development workspace. The tool now refuses reinstallation after this recorded mismatch pending a new author-supported target-selection review. It does not launch the game, modify executable identity, install the shared prerequisite, or change security settings. Re-running it is not a substitute for resolving the failure.

Phase 1/export/syntax regression checks were run separately under this attempt; the final check count is in `phase1-regression.json (offline backup only)`. The previously completed 48 offline telemetry assertions and 40 readiness assertions remain preserved in their original reports. No telemetry implementation or compiled plugin changed in this deployment attempt.

## Architectural implications and next gate

Keep the runtime-independent telemetry model and RPH adapter unchanged: this experiment supplies no evidence of an acquisition/data-model error. Preserve the exact executable guard in RichAudio; weakening it would conceal the target mismatch. A preflight that checks only GTA5_Enhanced.exe plus the publisher's supported build is insufficient when the runtime discovers another version.

The next compatibility investigation must establish an **author-documented Enhanced executable selection or supported launch/attach sequence** that works with these unchanged original files, or explain why it cannot. Merely pointing at an authentic runtime download is no longer sufficient readiness evidence. Do not rename/delete the older executable, replace it with the newer one, change signatures/offsets or suppress version checks to force this attempt through. Do not repeat deployment or gameplay testing until the concrete targeting plan is reviewed.

After that gate, recheck the manifest/prerequisite/current filesystem and rerun the standalone smoke test. Actual SDK binding, supported Story Mode launch and any DirectStorage issue must pass before A–E. Long-range source availability remains completely unresolved; no renderer can be justified from the current evidence. **P2-01 remains built and offline-tested, not in-game-verified, and is not ready for A–E on the currently observed RPH target.** Phase 3 remains blocked.
