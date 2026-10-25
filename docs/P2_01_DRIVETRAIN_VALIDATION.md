# P2-01 drivetrain getter investigation

**Offline follow-up:** the [cross-framework source review](RPM_SOURCE_INVESTIGATION.md) identifies SHVDNE's independent memory-backed ratio reader, but no verified exact-build alternative or supported RPH correction. The [prepared vendor reproduction](RPH_RPM_VENDOR_REPRO.md) preserves the constant-value evidence without publishing raw captures. RPH motion telemetry remains the primary integration; invalid RPM stays unavailable. No further game launch occurred.

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

**One launch completed; original installation restored. RPM: UNUSABLE as dynamic engine-speed telemetry in the observed conditions. Gear: PARTIALLY VALIDATED for one driven car, not a complete gearbox contract.** The original 0–1 boundary was retained. No trustworthy alternative RPM interpretation or physical calibration was established. [Portable outcome and relative file manifest](../evidence/publication/drivetrain-result.json).

### Configuration and independently observed checkpoints

The test used Enhanced **1.0.1158.16**, RPH **1.132.1428.17748**, DirectStorageFix **1.2** and the same official Alexander Blade XInput ASI loader **1.0.0.2** as the successful recovery. All original source/runtime pins matched. The new RichAudio DLL was built against the authentic pinned SDK and sealed at SHA-256 **C75C44A47F1BF87552CF863E126C8C11BD8095343AD4C8F72C63F93877DDBA37**, source commit **66ea1a938977670556ac6ba3ba702b9a218022af**. The previous known-good DLL was preserved separately and still matches **DBC5F600C37AD7579F49EBA92A352BEE1AAF452F6EF820CEF87B86B8547D5BE0**.

The actual deployment contained **27 final paths**: unchanged approved RPH files and known-working fix/loader, with the new RichAudio DLL and a temporary JSON configuration enabling permission for initially disabled diagnostics. Exact private manifest SHA-256: **FB59838AA32424D6E6C225A0D0AC2EACE56AD815F0000E1653A316E6B0D77AC1**. Its portable counterpart excludes absolute paths. The existing no-overwrite rename and pinned 26-file helper were reused, with independently journalled overlays for the introduced loader, plugin, configuration and fix. No original game file was overwritten. No SDK, ScriptHookV.dll, trainer or additional runtime dependency was installed.

RPH settings positively selected 1158.16 with autoload disabled. The actual Enhanced process included the established `-nobattleye` option. DirectStorageFix reported build 1158.16 and `Init finished` at **16:23:46.153 UTC**. Story Mode and the RPH console were observed, and the rebuilt plugin loaded at **16:25:42.961 UTC**. The user manually entered and operated the same road car throughout the test. The agent did not automate driving, spawn vehicles, force engine/gear states, or access Online. The plugin's existing single-player guards remained active.

### Completed manual scenarios

Rows below describe the actual labelled sidecar windows, including response/setup time, not exactly timed throttle application. Audible revving and a natural shift were **confirmed by the user**; no audio recording or numerical tachometer calibration was made. All 1,683 player diagnostic observations were finite and engine-on, with **raw minimum = maximum = 48.333335876464844** and zero validated RPM ratios.

| Scenario | Diagnostic samples / labelled span | Speed range, m/s | Gear indices | Result |
|---|---:|---:|---|---|
| A_idle | 302 / 42.999 s | 0–0 | 0 | User-confirmed stationary idle; no raw RPM variation |
| B_rev | 525 / 74.556 s | 0–0.03474 | 0, 1 | User confirmed audible stationary revving; raw getter stayed constant |
| C/D acceleration and shifts | 463 / 65.793 s | 0–33.9063 | 1, 2, 3, 4 | Motion recorded; user noticed a natural shift; getter changes consistent with acceleration, RPM unchanged |
| E_decelerate | 282 / 39.992 s | 0–20.6733 | 0, 1, 2 | User confirmed braking to rest/idle; source motion decreased, RPM unchanged |
| F_npc_idle | 111 / 15.691 s | Player 0–0 | Player 0 | Small naturally occurring traffic comparison; no range survey |

There were **12 player gear-getter transitions**, including 1→2→3→4 during the acceleration window and a return to 0 while stopped. Not all 12 transitions were individually corroborated by a synchronized visual/audio reference. Zero is left as an unverified index: it is not silently labelled neutral or reverse. Motorcycle behaviour, reverse, engine-off/start transitions and multiple player vehicle models are **NOT TESTED**. This session provides partial evidence that gear state responds; it does not establish all gear meanings or automatic-transmission internals.

### Raw values, occupancy and interpretation

The new sidecar recorded **13,447 vehicle observations** linked to existing session/tracking identities and production sample sequences. Every diagnostic sequence matched a normal telemetry sample. No raw getter exception or NaN/infinity was observed. SDK-derived classification is retained as evidence, not independent proof of every NPC occupant's presence.

| SDK-derived role | Observations | Engine state | Raw value range | Validated ratio observations |
|---|---:|---|---:|---:|
| Player vehicle | 1,683 | On | Constant 48.3333358765 | 0 |
| Driven non-player | 193 | On | 43.3333396912–50.0000038147 | 0 |
| Non-player, occupants but no reported driver | 445 | On | 36.6666717529–50.6666717529 | 0 |
| Unoccupied | 11,126 | Off | Constant 0 | 11,126 |

The driven-NPC subset covered five model hashes and four distinct raw values. Each model's available readings were constant; two models had only one/four observations, so that limited subset cannot establish a universal rule. Engine-on/occupied state correlated with an out-of-range finite scalar; off/unoccupied state correlated with zero. This does **not** prove that occupancy causes the failure. There was no controlled engine-off/start test on the player car.

**CONFIRMED:** the getter returned finite numbers outside the historical ratio contract; the explicit range rejection is correctly exercised before production serialization; the same unscaled player value persisted despite verified operating-condition changes. These are not reconstructed values from the earlier capture. **UNDETERMINED:** whether the runtime getter reads an incorrect field, the old SDK/runtime integration is responsible, or another Enhanced implementation issue exists. **HYPOTHESIS only:** the model-dependent constant may describe another vehicle parameter. No comparison measured such a parameter and no alternative semantics are claimed. Dividing the constant would still not create an RPM response to revving, so arbitrary normalization is unjustified.

The entire normal capture had 43,034 selected vehicle observations and 8,145 invalid RPM values. Its aggregate RPM availability of roughly 81% is dominated by zero readings on inactive entities and must not be presented as reliable drivetrain coverage. Position and velocity fields were available in all selected observations, but availability alone is not calibrated accuracy. Load and physical crankshaft RPM remain unavailable.

### Timing, volume and output integrity

Both **schema-1 normal telemetry** and **diagnostic-schema-1 sidecar** parsed completely after writer finalisation, with valid headers/footers and no malformed lines. All timings are actual capture measurements; no matched game-performance baseline was obtained.

| Measurement | Actual result |
|---|---:|
| Normal samples / first-to-last sample span | 5,397 / 269.862369 s |
| Normal cadence | 19.995378 Hz |
| Queue drops / missed deadlines / sequence gaps | 0 / 1 / 0 |
| Interval p50 / p95 / p99 / maximum | 55.7561 / 56.6758 / 56.9946 / 112.5041 ms |
| Acquisition p50 / p95 / p99 / maximum | 0.2036 / 0.5266 / 0.6416 / 10.8388 ms |
| Processing p50 / p95 / p99 / maximum | 0.0136 / 0.0181 / 0.0221 / 1.3909 ms |
| Acquisition samples above 2 ms soft budget | 3 / 5,397 (0.05559%) |
| Diagnostic frames / first-to-last span | 1,683 / 239.640439 s |
| Diagnostic observed cadence | About 7.019 Hz; configured 10 Hz is an upper cap, not achieved average |
| Diagnostic preparation p50 / p95 / p99 / maximum | 0.0019 / 0.0031 / 0.0039 / 15.1285 ms |
| Diagnostic queue drops / byte-limit omissions | 0 / 1 |
| Final normal / sidecar sizes | 138,450,420 / 16,766,937 bytes |

The raw sidecar remained below its 16 MiB file cap and 2,400-frame limit. One over-budget frame was deliberately omitted and counted; this is not a queue drop or an interruption-induced loss. Diagnostic-due acquisition p95 was **0.5807 ms**, versus **0.2844 ms** on other frames. These subsets are not randomized and have census/timing differences. Compared with the prior different rural smoke scene, acquisition p95 rose from 0.1825 to 0.5266 ms; this is a descriptive comparison, not a controlled estimate of instrumentation cost. The extra occupancy read and sidecar preparation are real work; neither their small p95 nor whole-game CPU measurements establish zero frame-time impact. The 15.1285 ms preparation outlier and one missed deadline are retained, without inventing their cause. Comparative frame-time/CPU overhead remains **NOT TESTED**.

Normal output SHA-256: **8800B3C421FF6A06A117D8D62BD03BB9D1A128CD075EB07E68AD161FF4A5571E**. Sidecar SHA-256: **974A4478B5A73EF147C1458B59915D8C5703A57ECDC4ECB6B81B7C1F7CC910CC**. Raw files, exact labels/timestamps, source identities and original logs remain in protected local evidence outside Git; only aggregate findings are published.

### Usage-limit interruption and resumption

The interruption happened **after `RichAudioDiagnosticsStop` and `RichAudioStop`**, outside an active recording period. At 16:30:31 and 16:30:53 UTC the status was capture disabled, zero drops and no writer errors. No unload or quit had yet occurred. The pending step was writer finalisation, followed by normal exit/restoration; all labelled driving observations had already been performed.

At resumption, the same game PID/start time and deployed fingerprints were verified, the visible scene/console responded and a fresh status at **17:08:17.570 UTC** again reported capture disabled with no writer errors. No restart, reload, recording reset or repeat driving occurred. Private fixed-length snapshots preserved the then-open files. Their incomplete final lines and missing footers were pending writer buffers, not evidence that a recording was interrupted: finalisation subsequently produced completely parseable original files. One diagnostic sample that was partial in the snapshot became fully available on closure; snapshots were not substituted for the completed evidence.

The original 12-minute operational launch window was exceeded because the user deliberately kept GTA open through the usage-limit gap. The measured recording remained about 270 seconds and the bounded sidecar about 240 seconds; the longer process lifetime is **not** claimed as a controlled soak test. The user separately approved finalisation. Computer Use was also interrupted by the physical Esc key requested for console access; that stopped automation, not GTA. After continuation, the user entered the one-time unload when automated text input did not reach the console, then exited through the normal quit prompt. No forced termination occurred. RPH logged its known unload `ThreadAbortException`; both writer footers completed. No matching Application 1000/1001/1026 game/RPH/fix failure event was found during this session.

### Restoration, reproducibility and next decision

After normal quit, no GTA/RPH/PlayGTAV process remained. All 27 temporary paths were removed. Seven generated root files and RPH's BOM-only code-template directory were preserved and removed. Both original names and valid Rockstar signatures returned, with hashes:

- `GTA5.exe`: **FD330FAE0C92A52E0B277FBA8A6856C81BD931FC4FCD1D81FBA02772A2A814CF**.
- `GTA5_Enhanced.exe`: **69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5**.

Exact saved comparisons passed for **32 original root files**, **179 archive metadata records**, **10 sampled archive hashes** and original root directory sets. PROCMON25 and diagnostic processes were absent. The original archival checkout and independent backup each still matched all **9,359** saved files; the Git bundle hash also matched. Existing loader preferences/shared prerequisite were retained; no archive, audio, vehicle physics, executable content or security protection was changed. The exact known-working integration and diagnostic configuration are reproducible from private pinned packages, the sealed candidate DLL and journal, subject to the same version/safety gates and new runtime authorisation. Reproducibility does not make RPM reliable.

The next smallest action is an **offline vendor-facing reproduction/SDK-parity review**, retaining the raw-constant evidence and public getter signatures. A read-only public `NumberOfGears` or engine-state getter may provide additional discrete context, but cannot recover engine speed. No independent supported stock-game RPM native was verified; platform-specific natives must not be assumed present in Story Mode. Speed/acceleration estimation cannot explain stationary revving or clutch/wheelspin and must not be relabelled observed RPM. Leave the RPM ratio unavailable for these running-vehicle readings until a verified public API correction or authoritative contract is established. Do not change the loader or repeat this identical experiment without new evidence.

**Engineering answers:** reliable live RPM **no**; normalized-ratio interpretation **not validated**; current value's physical meaning **unknown**; gear behaviour **partially corroborated on one car**; occupied/off-state behaviour **different in observed SDK groups, causality unknown**; full A–E certification **not ready**; Phase 2 **incomplete**. No further GTA work is necessary for this checkpoint. Any additional targeted run needs a specific new hypothesis and authorisation. No Phase 3 or audio implementation occurred.
