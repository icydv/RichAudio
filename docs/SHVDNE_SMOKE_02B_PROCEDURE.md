# SHVDNE-SMOKE-02B — proposed observation-only execution-01

I authorized offline preparation only. Codex must stop before installation or execution until I provide fresh authorization naming this proposal's final execution-manifest and adapter hashes. Both earlier live authorizations are consumed. No host/IPC, playback, assignment, suppression, reload, additional launch or further stage is included.

The private preparation root is `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\migration-shvdne-01\smoke-02b-preparation`. `deployment-plan.json` enumerates all ten new files; `execution-manifest.json` binds their bytes, prerequisites, validation, rollback baselines and this procedure. The future `execution-01` directory must not exist before installation. All evidence/backups remain in this worktree. The original RPH worktree and unrelated edits remain protected.

## Exact installation scope

The pinned target remains Enhanced **1.0.1158.16**, SHA-256 `b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea`, with retained matching **SHVDNE v1.1.0.6 / API3 3.9.0.0**. API3 SHA-256 is `1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48`; distribution ZIP SHA-256 is `f10da8819fa6814fb0a04553567d2516934eac96b16af06ad8f315f0da00473a`. Earlier basic runtime success is preserved; this diagnostic candidate's live timing is unqualified.

The only proposed new destinations, relative to GTA, are:

| Files | Scope |
| --- | --- |
| `ScriptHookVDotNet.asi`, `ScriptHookVDotNet.ini`, `ScriptHookVDotNet2.dll`, `ScriptHookVDotNet3.dll`, `MinHook.x64.dll` | Original matching distribution bytes |
| `scripts/RichAudio.Shvdne.dll` | New diagnostic adapter |
| `scripts/RichAudio/integration.json`, `scripts/RichAudio/package.json` | Bound diagnostic configuration and descriptor |
| `scripts/RichAudio/payload/playable.json` | Bound transport-only manifest |
| `scripts/RichAudio/payload/runtime/RichAudio.Acoustics.Host.exe` | Bound but **never launched** |

Keeping the validated, disarmed supervisor/package setup preserves the earlier startup context. The host file is not permission to start it. No Node runtime, producer, source bank, profile probe, audio assets or service is installed. Temporarily park only `TrainerV.asi` and `OpenRPF.asi`. Preserve the exact Script Hook V, ASI loader, DirectStorageFix, StraightToStoryMode and original RPH/RichAudio stack. Never launch RPH.

The configuration fixes `startupTiming02B:true`, `transportValidationOnly:true`, `hostEnabled:true`, 20 Hz and 16 vehicles. The script's diagnostic branch ignores arm commands and independently prohibits host publication. Both optional mechanical providers, menu, SoundMap and world warmup are false. Preferences remain stock fallback. Do not change configuration, settings or launch options during the run.

## Preflight, verified backups and installation

1. Revalidate the authorized manifest digest and every input/staged binding. Require branch `feature/migration-shvdne-01`, unchanged reviewed HEAD, exact game/dependency identities, .NET/VC++ prerequisites and Steam app 3240220's existing `-nobattleye` option without an RPH redirect. Require no GTA, RPH or RichAudio host process. Reject reparse points, changed baselines, unexpected ASIs/proxies, an existing `execution-01`, any new-file destination or an existing `scripts` tree. Drift stops installation; do not overwrite, download a substitute or bypass compatibility checks.
2. Create the execution directory once, recording my current authorization and an append-only action journal. Back up all installation/rollback baseline files, including loader logs, Enhanced `settings.xml` and both ASIs. Verify each backup's length/hash before parking an ASI outside GTA. Record every file's original path and every absent destination/directory. Keep unrelated launcher metadata and saves outside restoration operations.
3. Copy only the ten enumerated files with create-new semantics, verifying each destination immediately. Create only declared parents and record completed operations so partial installation can be rolled back. Do not recursively copy a source tree or use an earlier attempt's installer.
4. Launch once through the normal Steam Library route into offline Story Mode with unchanged `-nobattleye`. Record ordinary process identity/creation time. Do not enter Online, save, spawn anything, start a mission, open a console, change audio/settings or inspect GTA process memory.

Allow at most **10 minutes for startup**, **two minutes from playable Story Mode for initialization**, and **60 seconds from the first diagnostic tick**, with an absolute **17-minute ceiling from game-process start**. Respect the earliest deadline. Begin normal exit by 45 seconds into the diagnostic window to leave time for ordinary closure. There is no reload or second launch.

## Bounded capture

Require normal matching SHVDNE initialization and exactly one production script. Require no RPH activity and no new RPH log bytes. The journal must show `startupTiming02B:true`, `transportCommandState:"diagnostic-disarmed"`, host PID zero, no host-start event and zero publisher/wire-serialization activity. **Never create an arm command, even if the timing gate is clean.** Unexpected host/IPC/output activity immediately stops the attempt for normal exit and restoration.

Keep the first approximately five seconds unpaused and still so the first 32 batches and their worker drains are retained. Inspect `startupTrace02B`: at most eight records drain per diagnostic packet; records are retained once, with ordinals and immutable QPC/CPU/GC fields. Require zero dropped records/faults, a valid callback-thread identity and exact or one-QPC-tick reconciliation between stage sum and the existing full-batch endpoint.

If an early timing failure occurs, record **performance FAIL immediately**. Allow at most five seconds solely for the bounded pending records to drain, then exit normally. Do not start another phase or drive to obtain a nicer result. If no failure occurs, I may pan/hold two views, walk briefly and enter/park/dismount from an existing vehicle during the remaining short window. No spawning, pause or console use. Preserve startup and after-32 aggregate timing separately; do not reset or exclude startup from acceptance.

The four camera-call stages include the SDK's managed return conversion. They are not a split native/managed profiler. The trace also separates post-native camera construction, listener validation, readiness, interior, handles, discovery, getters, identity/bookkeeping, sorting/admission, frame construction, validation and instrumentation/unclassified work. Raw camera acquisition before/after/midpoint and returned-call masks preserve invalid/incomplete paths without invented observations.

The record's `BeginQpc`/`EndQpc` are the original batch measurement endpoints. `PublishQpc`/`TraceTailTicks` disclose subsequent recorder finalization; this tail is not subtracted or relabeled as game work. Inspect it alongside the original overall Tick timing. Probe wall time and maximum probe duration disclose instrumentation boundary effects. CPU stage samples have offset/quantization limits; use `StageMask` to distinguish unmeasured stages. Null/-1 CPU values are unavailable, not zero work. GC changes are process-wide correlation only. Live overhead can differ from authored fixtures.

## Acceptance and engineering stopping rule

Keep separate verdicts:

- **Performance:** PASS only with zero lifetime batches over 10 ms, zero original conservative Tick overruns, zero missed full publication intervals and zero getter failures. Check retained extended record duration through `PublishQpc` against 10 ms as well. Startup failures remain failures even if later samples are fast. Averages do not override a maximum violation.
- **Diagnostic capture:** PASS requires reviewable first-32 records and any retained later budget anomalies, correct stage order/exception masks, bounded drain, no overflow/fault, usable QPC reconciliation and truthful CPU availability/precision. Missing evidence is INCONCLUSIVE; it cannot justify a fix. CPU unavailability must be reported and may leave attribution inconclusive.
- **Scope/lifecycle/restoration:** no host/IPC, endpoint, producer, optional mechanical provider or reload; normal game exit, no orphan, exact restoration and retained evidence/backups.

After this single measurement, classify the result as **A** identifiable computational defect; **B** identifiable initialization defect; **C** scheduling/external-runtime limitation; or **D** still inconclusive. A/B permit a minimal evidence-supported correction proposal, not an automatic implementation or new launch. For C, assess whether a zero-overrun lifetime guarantee is realistic without inventing a computational fix. For D, state the remaining uncertainty and do not automatically design an extensive new campaign. Assess whether separately scoped host/IPC correctness work is worthwhile while retaining performance FAIL. That would require its own reviewed candidate/approval; this diagnostic mode cannot arm it. No acceptance criterion is silently relaxed.

## Normal exit and exact rollback

Exit GTA normally without saving, before the deadline. If ordinary exit is unresolved, do not force termination or remove loaded files. Retain backups and report the unresolved state. No runtime/AppDomain abort, crash injection or Insert key is authorized.

After process closure, archive installed bytes, loader/core logs, complete journals, trace pending/drop/fault counters, payload lifecycle/state files, post-run settings and action receipts with hashes. A final stopped row is best effort during teardown; it cannot substitute for process absence. Restore only this manifest's files/settings: verify approved installed hashes before removal; archive recognized generated files before deleting them; preserve unknown/concurrently changed files for review. Restore both parked ASIs and changed bound logs/settings from their verified originals. Never replace a whole Steam configuration or unrelated save. Remove created directories only when empty, deepest first, without recursive deletion of `scripts`.

Verify all protected originals/settings, destination absence, selected launch options and no game/RPH/host process. Preserve backups and raw failures. The attempt consumes its authorization regardless of outcome; no repeat, host qualification, playback or Gate A action follows automatically.
