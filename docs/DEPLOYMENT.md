# P2-01 deployment boundary and reversible test instructions

**Built candidate, unverified in game. Nothing has been installed. Explicit authorization to install new runtime/game-root files is still required.** This document describes a future manual procedure; neither build nor packaging scripts copy into GTA, launch RPH, alter security/anti-cheat settings or start the game.

## Package

Create a reviewable RichAudio-only archive with `tools/Package-Telemetry.ps1`. `evidence/phase2/package.json` records the actual package location, contents, sizes and SHA-256 hashes. The package contains:

```text
Plugins/
  RichAudio.Telemetry.Rph.dll
  RichAudio.Telemetry.Rph.json
READ_BEFORE_INSTALL.md
manifest.json
```

Only the first two files are proposed for later installation into the game's Plugins directory. The single DLL includes RichAudio core code. **No RPH runtime, SDK DLL, LSPDFR assembly, ASI loader, OpenRPF, acoustic library or Rockstar asset is included.** Do not copy `RagePluginHookSDK.dll` into GTA; it is a compile-time reference, not the supporting runtime.

## Preflight before seeking deployment approval

1. Obtain the exact author-supplied RPH runtime from the [1158.16-supporting official release](https://www.lcpdfr.com/downloads/gta5mods/g17media/52970-lspd-first-response-enhanced-preview/). Inspect the archive without installing it: exact launcher/runtime/proxy versions, SHA-256s, readme and bundled licenses/dependencies. The current report has verified the release claim and SDK only; this runtime inventory is still pending.
2. Prepare a manifest of the specific runtime files required for **standalone RPH**, separated from LSPDFR gameplay files. Do not assume extracting the whole LSPDFR bundle is a standalone installation. If the author's supported configuration requires extra components, resolve and authorize that concrete dependency list first. No blanket proxy-DLL overwrite is acceptable.
3. Verify the session is a supported single-player modding environment. The operator must complete any author-required Story Mode setup through normal supported procedures. Do not bypass anti-cheat, change antivirus/security settings, enter Online or use executable/offset patches. If the runtime cannot run under those constraints, stop and report it.
4. Preserve the current game-root listing/hashes and any existing Plugins/RPH configuration. Keep original archives unchanged. Current inspection found no installed loader/RPH and only a zero-byte OpenIV.asi; do not remove, repair or replace it automatically. OpenRPF is unnecessary for this telemetry test and its coexistence remains untested.
5. Present the runtime manifest and RichAudio package for explicit installation authorization. Only then carry out the approved manual file copies. This phase stops before that step.

## After authorization: smallest controlled test

Install the reviewed RPH runtime using its author's instructions and the approved manifest. Configure it to load no LSPDFR gameplay/plugin by default. First establish that the exact runtime starts the installed 1158.16 Story Mode baseline without third-party gameplay or asset loaders. Save its actual log/version evidence in the development workspace. This standalone behavior has not yet been tested.

Copy just the RichAudio DLL/config into `Plugins`, after confirming neither destination exists. Review the config and set `StoryModeAcknowledged` to true **only for the authorized Story Mode test**. Leave `CaptureEnabled` false so no capture starts automatically. OutputDirectory must remain an absolute path in the separate development workspace; default is `__USER_HOME__\Documents\RichAudio\.local\captures`. Do not set it inside the game/tool folders. Defaults: 20 Hz, 32 sources, census-inspection cap 128, queue 64, soft read budget 2 ms.

Use RPH's documented console plugin loading mechanism to load `RichAudio.Telemetry.Rph.dll` alone. The usual console command is `LoadPlugin RichAudio.Telemetry.Rph.dll`; confirm the runtime's command help if its syntax differs. Run these plugin commands:

```text
RichAudioStatus
RichAudioMark urban_TestA
RichAudioStart
RichAudioStop
```

The plugin fails closed on a different game executable/version, denied config/output path, writer error or failed network-state check. It gates acquisition while paused or network state is active/unknown. These checks do not make an unauthorized environment safe or authorize launching Online with RPH.

## In-game tests A–E — no results yet

For every test, record wall-clock video/reference observations, framework/game versions, capture file, device/settings, scene label and any RPH errors. Use ordinary vehicles and traffic; do not spawn persistent distant traffic solely to manufacture availability.

| Test | Procedure | Check |
|---|---|---|
| A, idle | Stationary player vehicle, 30 s engine off then 60 s idle, known camera mode | Position/velocity, running state and raw ratio behavior; zero is not assumed to mean valid engine-off data |
| B, motorcycle | Three throttle ramps, acceleration/gear-change/overrun cycles, camera changes | Ratio/gear changes vs visible/sound behavior; rotation/basis; acceleration continuity and camera-cut rejection; no RPM-to-crankshaft calibration claim |
| C, nearby NPC | Stationary urban listener, naturally passing traffic for 2 min | Distinct IDs, player/NPC deduplication, entity counts, engine/RPM availability; a returned field is not automatically accurate |
| D, distance | Urban and rural sessions at measured 25/50/100/200/400+ m bands where accessible; retain empty bands | Sampled distance maxima, coverage bias/omissions, freshness and drivetrain plausibility. Follow docs/NPC_STREAMING.md |
| E, lifecycle | Normal travel through streaming boundaries, leave/return to area, pause/resume, stop/restart capture | First/continued/unavailable/termination events, handle index/counter changes, no stale acceleration and no duplicated identity |

Use separate uninterrupted marked captures for cadence. Initial acceptance: >=95% of scheduled samples for a continuously observable selected target arrive within 100 ms; explain missing intervals and any drops. Compare acquisition and processing p95/p99 to the Phase 1 timing targets. A source-cap or read-budget omission is not a game streaming failure.

Measure game performance with paired baseline/capture-enabled/capture-disabled runs on the same route/settings and comparable traffic, at least three passes each. Record external frame-time p50/p95/p99, CPU and memory alongside telemetry acquisition/processing counters. The logger does not measure rendered frame time and its timing fields cannot establish negligible frame impact. Record crashes/hangs and RPH logs; an offline test cannot certify game stability. Start short before a 10-minute run and a later 30-minute turnover stress run.

Stop on instability, unexplained field behavior, sustained drops/budget overrun or output errors. The plugin never changes native audio or vehicle state, so stopping capture needs no audio restoration. Use `RichAudioStop`, inspect status, then RPH's **graceful** UnloadPlugin command. Wait for a valid `session_end` footer; forced termination can lose buffered records. Analyze output with the offline utility and retain raw capture locally.

## Uninstall/rollback after an authorized test

Exit Story Mode and the runtime. Remove only the two RichAudio files listed in the installation manifest, provided their hashes still match the installed package; preserve anything the user edited. Keep captures outside the game for analysis. Restore the prior RPH plugin configuration from the recorded baseline if changed.

If RPH was added solely for this experiment, remove only the runtime files introduced by the separately approved runtime manifest; do not guess which shared proxy/runtime files to delete. Restore previously existing files from the verified baseline rather than deleting them. No RPF archive restoration should be needed because no original archive is replaced. Normal unmodded game startup must follow the operator's supported baseline procedure.

The current package is ready for **review**, not automatically cleared for gameplay. Remaining deployment authorization and runtime preflight are listed in RUNTIME_COMPATIBILITY.md. P2-01 remains built but unverified until these tests actually run and their results are accepted. No Phase 3 work is authorized by a successful build.
