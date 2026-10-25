# P2-01 controlled Enhanced attempt: selection fixed, startup blocked

Run record: 24–25 October 2026; timestamps below are UTC. This report supersedes the pending-experiment status in the preserved Phase 2.2 investigation. No telemetry or audio source code changed.

## Verified result

The approved temporary filename change selected **Enhanced 1.0.1158.16**. RPH Settings identified that version as supported, and its launcher log reported `Version is supported`. The actual launched process was **GTA5_Enhanced.exe**, with the approved `-nobattleye` argument observed. This confirms the extra GTA5.exe name was causing the observed version-selection problem on this installation. It does not establish RPH's internal probing algorithm or a universal launcher contract.

The old file remains a signed older Enhanced executable extra to the installed Steam depot set. Its creator/purpose remains unknown; the user did not create it. No documented explicit executable-selection configuration was established. The temporary rename is a locally tested discovery mechanism, not a permanent installation recommendation.

**The smoke test failed.** At **2026-10-25T01:54:57.5997543Z**, Windows .NET Runtime event **1026** recorded an unhandled **System.IO.IOException** in RAGEPluginHook.exe. The stack includes FileStream, StreamWriter and File.InternalAppendAllText. The event does not identify the failing path or underlying OS error. Permissions, antivirus, file locking and storage compatibility are unproven explanations; no corresponding changes were attempted.

The launcher last reported finding the Enhanced process and waiting for its window. The game displayed initial legal/loading screens. No Story Mode arrival or successful hook initialization was verified. RichAudio was discoverable as plugin metadata, but startup plugins were disabled and **RichAudio never loaded**. No LSPDFR gameplay plugin was enabled. No Online session was entered. The test stopped at the RPH crash; no further launch or workaround was attempted by the experiment.

## What was and was not measured

| Item | Actual finding |
|---|---|
| Runtime | Authentic staged RPH 1.132.1428.17748; existing approved VC2010 x64 prerequisite retained |
| Deployment | All 26 reviewed additions created without overwrite and hash-verified; original executable content unchanged |
| Selected game | Settings 1.0.1158.16 supported; actual Enhanced process path observed |
| Plugin API binding / load | Not verified; metadata discovery is not execution |
| Live player / NPC samples | **None**; no capture session JSONL |
| RPM ratio, gear, engine state | No live reliability evidence; physical RPM/throttle/load remain unestablished |
| Maximum NPC distance / distant simulation | **Not measured**; no value or lower bound can be claimed |
| Sampling cadence / queue drops / source lifecycle | Offline evidence only; not measured in game |
| Frame time / CPU overhead / stability | No valid baseline or steady-state run; no performance delta available. RPH startup instability observed |
| Tests A–E | Not run; smoke-test prerequisite failed |

The user paused to install a save. On resumption, a different, user-started Enhanced process was at a loading screen. It was closed through the normal game Quit confirmation before restoration; it is not counted as another controlled telemetry test. No forced termination was needed.

## Restoration and evidence

`tools/Invoke-P22Deployment.ps1` pins the frozen approved manifest, checks source/destination hashes and conflicts, uses no-overwrite rename/copy operations, and journals additions. Restore moved all **26 unchanged additions** into ignored development storage, restored **GTA5.exe**, and removed the introduced empty Plugins directory. No proprietary binary is committed.

Restored executable SHA-256:

- GTA5.exe: `FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF`.
- GTA5_Enhanced.exe: `69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5`.

All **32 original non-RPF root files** match their fresh predeployment size/hash baseline, with no additional root files remaining. All **179 RPF paths/lengths/modification timestamps** match; all **10 independently hashed archive samples** match their fresh predeployment SHA-256s. This is not a fresh full-content hash of all 179 archives. No GTA/RPH process remained at the restoration check.

RPH's generated launcher log, INI and startup script were copied, hash-verified and moved outside the game. A newly created empty commandline.txt was preserved outside the game and removed with explicit user approval after the user confirmed they had not created it. No original file was overwritten. The approved shared VC2010 prerequisite remains installed.

Raw logs, screenshots, process evidence, deployment/restoration journals and archive checks remain local under ignored `.local/phase2.2/controlled-attempt-01/` and `evidence/phase2.2/controlled-attempt-01/`. These contain host paths and are intentionally excluded from future commits. The [portable result](../evidence/phase2.2/controlled-attempt-result.json) records the outcome without them.

## Next gate

P2-01 remains **implemented, built and offline-tested; unverified in game**. It is not ready to repeat the same failing startup unchanged. Investigate the RPH append failure from preserved diagnostics and publisher-supported guidance, identify the affected path/error if possible, and prepare a reviewed remedy. Any additional compatibility workaround or redeployment after this failed controlled attempt needs its applicable authorization. Do not change security protections, patch executables, guess offsets or start Phase 3. After a successful hook/plugin smoke test, use the existing A–E protocol and its quantitative acceptance thresholds.
