# P2-01 drivetrain getter investigation

25 October 2026. Based on the verified recovery in [PR #10](https://github.com/icydv/RichAudio/pull/10), commit `695a1426234735cfcd6c95453dddcef9847b9b9e`. This focused branch stacks on that still-open PR and preserves accepted main through `e5fbd8f`. No acoustic code, new framework, setter, memory offset or game patch is introduced.

## Offline evidence

The original live capture's SHA-256 remains `A77275FF286AEC85BC00D84710DE90C7C1CF35BFBFEF9B5FF8C74B2B3528A36A`. Its 5,621 rejected RPM numbers were **discarded before serialization**. There is no recoverable rejected-value distribution. Every player and driver-present non-player observation failed the same range check; accepted readings were on no-driver entities, whose occupancy was not separately observed. This correlation does not establish its cause.

The old path was `Read(() => (double)v.EngineRevolutionsRatio)` -> finite-value validation in `Field<double>.Observed` -> explicit `<0 || >1` rejection in `RphSource.Read` -> tracker -> schema-1 JSONL. Finite out-of-range numbers became null with `invalid_out_of_range_RPM_ratio`; nonfinite values became null with `invalid_nonfinite_or_orientation`. Neither was retained by the serializer or analyzer. Cast from Single to Double does not rescale the number. The replacement helper preserves these validity decisions and error reasons, while optionally retaining the same single getter result in a private sidecar.

The authentic compile SDK has file version **1.124.1393.17586**, assembly identity `RagePluginHook, Version=0.0.0.0`, and SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`. Its public RPM getter returns **System.Single**, is read-only, and has no managed method body to inspect. `CurrentGear` is a read-only **System.Byte**; `NumberOfGears` is a readable/writable Byte, but this experiment does not invoke its setter or add a gear-count read. The actual runtime is **1.132.1428.17748**. The version difference is recorded, not declared a proven ABI failure; the original plugin resolved and executed the getters.

[Official RPM documentation](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_EngineRevolutionsRatio.htm) describes a 0–1 ratio, with off/idle/maximum reference values, but applies to RPH 0.56. No authoritative changed Enhanced contract was established. The official [historical gear page](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_CurrentGear.htm) returned 404 directly; its indexed documentation describes 1–6. Neither source establishes current reverse/neutral/transition mappings, higher-gear behaviour or motorcycle-specific semantics. The official [old release notes](https://docs.ragepluginhook.net/html/567cc57d-324e-4309-8869-ba0751ce4356.htm) record a past RPM getter regression on a different game version; this demonstrates update sensitivity, not the present cause. No validator relaxation or arbitrary conversion is justified.

## Bounded diagnostics

- Production `CaptureRecord`/`VehicleState` JSONL stays **schema 1**. Historical captures, configurations and fixtures remain readable. The diagnostic adapter input fields are not serialized into it.
- The separate `diagnostics/drivetrain-SESSION.jsonl` uses **DiagnosticSchemaVersion 1**, `DiagnosticOnly=true`, explicit start/sample/end kinds and the same session, telemetry sequence, tracking identity, monotonic seconds and scenario label. Raw numbers are unverified data, never calibrated RPM.
- A raw result records returned/exception/unavailable, finite status, finite numeric value or a nonfinite category with a null numeric value. Exceptions retain type only, not private messages. The original validated RPM and rejection reason are alongside it.
- Model, observed engine state and gear, derived speed, estimated acceleration and role are copied from existing observations. One public `HasOccupants` read is added only on diagnostic-due samples. A missing driver alone does not prove an empty vehicle; roles distinguish player, driven NPC, unoccupied, passenger-only and unknown.
- `AllowRawDrivetrainDiagnostics` defaults false, including when absent from old configuration. `RichAudioDiagnosticsStart` explicitly enables only a permitted temporary configuration; `RichAudioDiagnosticsStop` disables it. Normal telemetry must independently be enabled and pass the existing offline Story Mode/pause gates.
- Planned private configuration: normal capture initially disabled, raw capture initially disabled, 20 Hz telemetry, 10 Hz sidecar, eight selected sources, queue 64, 2 ms soft acquisition budget. Lifetime sidecar caps: **2,400 frames, 240 seconds from first enable, 16 MiB including header/footer**. Toggling does not reset the caps; idle writer shutdown occurs on plugin unload. Diagnostic generation stops at the cap. There is no automatic runtime relaunch.
- Serialization and writes run on a separate bounded-queue worker. Sidecar queue drops and byte-limit omissions are reported in its footer. Preparation time is separately recorded; acquisition timings include the extra occupancy read. No disk writes occur in sample callbacks. Raw output stays in ignored private development storage, outside the game and publication history.

`node tools/Analyze-DrivetrainDiagnostics.mjs PRIVATE_INPUT PRIVATE_REPORT` summarizes raw finite ranges, nonfinite/exception availability, first-32-value frequencies, model/role/engine/scenario grouping, speed ranges and gear-getter transitions. Those transitions still require independent observed gameplay corroboration. It refuses mixed/unknown schemas and does not overwrite a report. Normal capture analysis remains independent.

## One conditional manual experiment

The user has confirmed availability to drive. Before mutation, recheck the known-working RPH/fix/loader pins, both signed original exes and independent old-exe backup, exact original root/archive baselines, absent destinations, no ProcMon filter/process, no game/modding tools, the revised built plugin hash and rollback. Preserve the old known-good DLL independently. Use the same loader/fix versions and existing offline launch configuration; only the plugin/config may differ. The exact actual manifest, launch journal and raw evidence stay private, with a sanitised outcome to follow.

One launch, maximum 12 minutes from game process creation. After Story Mode and explicit plugin load, verify a real player vehicle, then start both captures. The user drives, with concise labels established around actual scenario boundaries:

| Label | Intended observation | Evidence requirement |
|---|---|---|
| A_idle | 15–20 s stationary engine idle; off/start only if naturally available | User-confirmed condition and velocity near zero; do not force engine state |
| B_rev | 15–20 s stationary throttle if possible | User reports controls/condition; compare raw response without normalisation |
| C_accelerate | Normal acceleration on a suitable road | Actual speed/motion plus raw RPM and gear changes |
| D_shift | Seek a naturally occurring shift | User-observed audible/visible shift; getter transitions alone insufficient |
| E_decelerate | Lift/brake back to rest | Confirmed deceleration and idle return |
| F_npc | Small natural traffic comparison during the same capture | Separate roles and engine-state groups; no streaming survey |

The 240-second diagnostic lifetime is an upper bound, not a requirement to extend gameplay. Missing scenarios are NOT TESTED or INCONCLUSIVE. Stop on serious instability. End raw/normal capture, inspect status, unload once for footers and exit normally with user assistance if needed. Restore all actual temporary additions and generated files, both exe names/hashes/signatures, root records/directories, archive metadata and sampled hashes. Do not declare restoration from counts alone. No second launch or A–E streaming certification is implied.

## Runtime result

Pending the conditional experiment. Offline compilation alone is not drivetrain validation. No reliable physical RPM mapping or gear semantics have been established by this diagnostic implementation.
