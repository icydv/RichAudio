# MENU-02 offline preparation

I want to validate the existing MENU-01 sidebar in GTA V Enhanced. Codex verified the clean WORLD13 starting checkout at `65a17ca05d19a43b8aa56706f704d1775ab66028`, on `feature/world-13-reliable-ci-render-tails`. The imported menu adapter, layout and transition still match PR #94's exact Git content. This preparation adds a separate menu-only test entry and builder; it does not change the interface or acoustic engine.

Codex has not inspected the installed game, deployed files, launched GTA/RPH, opened an audio endpoint or started recording for MENU-02. I require fresh approval for those protected operations. Current installed GTA/RPH versions, startup configuration, active RichAudio components and game resolution remain unverified. The next approval requested is a bounded read-only compatibility/install inventory. Deployment and one bounded live session need a subsequent exact reviewed proposal.

## Candidate isolation

The regular product entry starts GameplayRuntime and passive listening. The legacy listener entry also starts installed-world warmup. A separate lifecycle entry loads only the existing menu with its settings and recording-availability bridges. The source closure excludes the audio host, vehicle/listener observation, world provider, GPU backend, Node worker and native audio suppression. `PLAYABLE_PRODUCT` keeps the audio-test recording controls locked.

The menu unconditionally starts its existing recording-availability worker. Its sidecar therefore points to a newly created private workspace containing only test preferences, with no SoundMap service descriptor or host-status file. That worker has no recorder address/token to contact. No existing settings or private captures are reused. Output starts disabled, integration starts at `stock-fallback`, and F10 remains the default key. Apply and Reset affect only isolated preferences. Changing quality, acceleration, SoundMap or output preferences cannot start an engine in this candidate. Actual engine acknowledgement remains unavailable and must be reported separately from saved preferences.

The candidate's guard accepts only the explicitly historical compatibility profile: Enhanced `1.0.1158.16` and loaded RPH API FileVersion `1.132.1428.17748`. These values describe its restriction, not the current installation. FileVersion is not distribution authentication: the launcher and actually loaded API must be identified independently. A mismatch stops the candidate; no alternative binary or retry is implied.

The exact private receipt at `.local/menu02-candidate-01/candidate-receipt.json` contains the compiler/SDK hashes, source closure, options, payload hashes and compiler outcome. The first build passed with warnings as errors. Its payload identities are:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `RichAudio.Menu02.Rph.dll` | 88,064 | `8e70ddbbcc5d98b57239c54eb764427f6d055c808b3b9fd616ac71daaa525d0b` |
| `RichAudio.Menu.json` | 233 | `15a4ec13441701642a38ceb16eafa74302d91e9163e20a126e86731d9d55a41a` |
| Isolated initial `preferences.json` | 317 | `0a86d25230b74ebf65c2b804c34d1a5899c1d0095a838bc50858ed9fdf1c7a36` |

The existing non-installed SDK reference is FileVersion `1.124.1393.17586`, SHA-256 `5d439745604a5fedbf8fa401520d4f296c1b6800d77e2923ba3bf9772182c7e0`. Compiling against it is not qualification of the later RPH runtime. The framework compiler SHA-256 is `46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00`. The old compiler is not assumed to produce bit-identical DLLs on rebuild; approval binds the retained DLL hash. A rebuild is a separately identified candidate. No SDK or RPH binary is published in Git.

## Verification and retained failures

Fresh isolated offline checks pass: **1,568 menu**, **59 settings**, and **60 persistence/CAS bridge** checks. All compile/run exits are zero. The existing fixed build outputs and historical evidence were preserved. Recording-service and PCM handoff fixtures were not rerun; their prior integrated evidence remains historical. These checks establish software contracts, not live rendering or sound.

The dedicated integrated menu workflow [run 41863999039](https://github.com/icydv/RichAudio/actions/runs/41863999039) passes **1,568 checks**. Its log binds GitHub test merge `2a30bda` of integrated `65a17ca` into `85646ec`. The original PR #94 menu run [41853033357](https://github.com/icydv/RichAudio/actions/runs/41853033357) remains a separate **1,262-check pass**.

In the **16:22:41 UTC, 4 November 2026** snapshot, broad inherited run [41863999023](https://github.com/icydv/RichAudio/actions/runs/41863999023) has an actual failed required aggregate, despite the workflow summary lagging at queued. Its log records functional success and processing failure. Node22 fails focused control 22, concerning held owned-child identity/affinity/join/PCM, **before timing trials**; it is not a measured deadline miss. Node24 retains **17 hard misses and 55 blocks above 8 ms over 13,440 candidate blocks**, with both timing gates failed. Menu success does not replace these failures. Raw snapshots, job logs and their hashes are retained privately.

The historical changed-WORLD13 run [41854828012](https://github.com/icydv/RichAudio/actions/runs/41854828012) still has both processing jobs and the required aggregate failed, with both functional jobs passing. No original job was cancelled or rerun. Prior timing evidence and seals remain unchanged. This milestone does not revisit engine performance optimisation.

## Required installation changes, pending inventory

The anticipated payload is one new `Plugins/RichAudio.Menu02.Rph.dll` and a temporary `Plugins/RichAudio.Menu.json` pointing to the isolated workspace. Any pre-existing destination is an explicit stop until reviewed. The original RichAudio plugin must be absent from the active session to prevent duplicate F10/input/render handlers. If `startup.rphs` loads it automatically, a narrowly scoped temporary startup edit may be necessary; its exact bytes and rollback cannot be approved before the read-only inventory. Every unrelated mod/startup command remains preserved.

No game executable, RPH distribution, ASI loader, audio asset, device setting or existing RichAudio host/package is part of this candidate's installation. No automatic installation or launch command is supplied. The eventual deployment proposal must bind the exact original paths/hashes and all changed destinations, reject drift/reparse points, and specify a single use.

The requested next read-only inventory is limited to metadata/hashes for `GTA5_Enhanced.exe`, `RAGEPluginHook.exe`, any identifiable RPH runtime API image and existing RichAudio plugin binaries; the contents/hashes of `RAGEPluginHook.ini`, `startup.rphs`, the RichAudio menu/playable/feature configuration files; a non-recursive plugin filename inventory for conflict detection; and the GTA Enhanced display settings XML for resolution/presentation mode. Follow a configuration pointer only to the settings file required to establish the original preference fingerprint, not to audio banks, recordings or world resources. Keep paths, logs and private values local. Do not inspect archives, proprietary resources or captures, launch code, install files or change settings during that inventory. If the loaded API is generated only at launch, retain its identity as unresolved until the separately approved session.

## Proposed one-session live test

After separate approval, allow one RPH/GTA Story Mode launch and at most **15 minutes of interactive validation after playable Story Mode is ready**, followed by clean shutdown and verified rollback. Startup failure, an unexpected warning, incompatible versions, duplicate RichAudio handlers, unexpected audio/recorder/service activity or an unreviewed destination stops the attempt. No automatic retry or substitute candidate is allowed. Game audio remains unchanged; RichAudio playback and all recording remain inactive. Direct visual observation and private still screenshots of the sidebar are part of this proposed test. Video/audio capture, new performance software and graphics hooks are excluded.

1. Record actual viewport resolution, aspect ratio and presentation mode from approved settings/runtime observations. Observe 30 seconds closed, 30 seconds open and 30 seconds closed in the same stationary scene. Use an existing FPS/frame-time display only if already available and approved; otherwise report subjective smoothness and unavailable objective timing separately. Sample process private bytes, working set and handles at these boundaries and after repetitions. This process-level comparison cannot isolate menu cost from the whole game.
2. Open with F10. Observe the complete left-edge panel, 260 ms reversible slide, full viewport height at the actual supported landscape ratio, fixed subtle dimmer, typography, spacing and clipping. Keep the remainder of GTA visible. Do not infer other monitor/resolution configurations from offline previews.
3. Move the mouse over every row and footer; inspect foreground cursor visibility, hotspot/click agreement, hover, edges, duplicate pointers and appearance during opening/closing. Check volume clicks at displayed positions; the existing slider uses 5% click steps and has no drag implementation. Determine actual compositor order before proposing any correction.
4. Navigate with keyboard and an available physical controller, including the existing controller menu chord. Verify fresh-key response, held-key suppression, focus capture and release with no vehicle movement, attacks or unintended gameplay actions. If no controller is available, retain that test as unexecuted.
5. Exercise every quality and Auto/CPU/GPU choice, output enable/level, early reflections, diagnostics, SoundMap, integration mode, saved menu shortcut, Apply, Reset and Back in isolated preferences. Verify pending versus saved values and engine-stopped status. Experimental/unavailable labels must remain accurate. Verify recording controls unavailable without starting or stopping a recording. Rebind once to F6, Apply, close/reopen with F6, then restore F10. Finish with output disabled and stock fallback. No real SoundMap/engine integration is accepted by this test.
6. Perform 20 ordinary open/close cycles and five deliberate rapid reversals, watching frame/layout stability and input release. Compare resource samples before/after and after 30 seconds closed; retain all growth, hitching and uncertainty. Do not claim a leak or zero overhead from one short sample.
7. Check pause-menu and RPH-console transitions, focus loss/return and F10 rejection outside a valid Story context. Observe loading-context loss only if it occurs within the agreed session; otherwise mark it untested. Do not trigger an extra launch or an unapproved loading operation. Close/unload through supported RPH controls, verify cursor/control release and no owned runtime/recording service, then exit normally.

## Rollback to bind after inventory

Before a separately approved deployment, copy each original affected file to a new private backup and retain its exact bytes/hash or original absence. Preserve game/RPH/startup and RichAudio configuration fingerprints. Install only the approved payload into absent or reviewed destinations. After normal exit, verify the installed candidate identities before removing the exact new DLL, restore the original sidecar and any separately approved startup edit byte-for-byte, or remove a sidecar that was originally absent. Rehash every protected original and verify no owned runtime process remains. Drift stops automatic rollback for diagnosis; it never authorises an overwrite of unrelated development state. Keep backups, logs and the isolated test preferences as evidence.

## Acceptance status before live approval

| Requested result | Current evidence |
| --- | --- |
| Sidebar rendering in GTA | Unexecuted; offline layout checks pass. |
| Cursor visibly above the menu | Unexecuted; immutable command order only. |
| Mouse, keyboard and controller | Offline policy checks pass; physical GTA interactions unexecuted. |
| Existing settings | Offline editing/persistence checks pass; real engine changes excluded. |
| Gameplay performance | Unmeasured; construction costs are not GTA frame times. |
| Confirmed live defects/corrections | None observed; existing UI remains unchanged. |
| Original installation restored | No MENU-02 installation change has occurred; live rollback unexecuted. |
| Ready for wider testing | No; bounded compatibility inventory and one approved live test remain. |

The candidate and preparation remain in draft PR #93. This document does not authorise deployment, launch, recording, installed-resource inspection or merge.
