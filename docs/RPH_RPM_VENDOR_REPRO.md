# Prepared RPH maintainer reproduction: constant Enhanced RPM getter

Draft for user review, 25 October 2026. **Not submitted to maintainers.** This is a report of a completed prior test; no new runtime experiment was performed while preparing it. Raw captures and private paths are intentionally excluded.

## Problem and expected contract

`Rage.Vehicle.EngineRevolutionsRatio` returned a finite out-of-range constant for one engine-on player car across idle, audible stationary revving, acceleration, shifting and braking. The [historical official documentation](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_EngineRevolutionsRatio.htm) describes a normalised 0–1 ratio. It dates to RPH 0.56; please confirm whether the Enhanced contract has changed and whether this is the supported getter for current Enhanced builds.

## Exact tested environment

| Component | Version / fingerprint |
|---|---|
| Executable | `GTA5_Enhanced.exe`, file version **1.0.1158.16** |
| Executable SHA-256 | `69DA07FF67D05E9DED11289E597E8B8DC5855B0A429C085F37D148DC267CB2C5` |
| RPH runtime | **1.132.1428.17748**, official LSPDFR Enhanced 0.4.9/9695 distribution; standalone plugin, no LSPDFR gameplay loaded |
| RPH SHA-256 | `73F05B3F7973D4731F4151AE061DD3C991065E8BF3ECE51EA1D9AB728B9B42AC` |
| Compile SDK | **1.124.1393.17586**, assembly `RagePluginHook, Version=0.0.0.0`; official `RPH_SDK_3717.zip` |
| SDK SHA-256 | `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0` |
| Required launcher workaround in this tested environment | DirectStorageFix **1.2**, official Alexander Blade XInput loader **1.0.0.2**, to avoid the separately diagnosed launcher-log sharing conflict |
| Observer | RichAudio telemetry source **66ea1a938977670556ac6ba3ba702b9a218022af**, diagnostic opt-in enabled only for this test |
| Observer SHA-256 | `C75C44A47F1BF87552CF863E126C8C11BD8095343AD4C8F72C63F93877DDBA37` |
| Scope | Offline Story Mode; getters only; manual driving; no vehicle setters, handling/audio changes, ScriptHookV.dll, SHVDNE or custom RPM reader |

SDK metadata confirms a read-only Single getter with no implementation body in the SDK. It resolved and executed in the runtime. The SDK/runtime version difference is disclosed, not diagnosed as the cause. The official [SDK developer thread](https://www.lcpdfr.com/forums/topic/154295-rph-sdk/) states the current SDK may be used for Enhanced.

## Minimal acquisition path

The following original RichAudio-style snippet illustrates the relevant read, **not a standalone plugin or an executed new reproduction**. Run reads only in a supported RPH game fiber, after a valid current vehicle has been checked; handle invalidation/getter exceptions as unavailable. Queue copied results to a bounded worker for output, never synchronously write from the game callback.

```csharp
float raw = vehicle.EngineRevolutionsRatio; // Read once; no rescaling.
double copiedRaw = raw;                    // Exact Single-to-Double widening.
byte gear = vehicle.CurrentGear;
bool engineOn = vehicle.IsEngineOn;
Rage.Vector3 velocity = vehicle.Velocity;
// Copy alongside monotonic acquisition time and vehicle lifetime identity.
// Preserve raw separately; reject nonfinite or outside [0,1] for consumers.
```

This is the same one-read path used in the tested diagnostic helper. Printing the widened double with round-trip invariant formatting preserves the recorded `48.333335876464844`; rounding a float for display can hide the exact numeric representation. No setter, memory offset or inferred speed-to-RPM conversion is involved.

## Observations and corroboration

All **1,683** player diagnostic readings: **min = max = 48.333335876464844**, one distinct value, zero getter exceptions/nonfinite values, zero valid 0–1 ratios; engine-on true throughout. The player used one road car. Scenario windows include human response time; they are not precisely timed throttle segments.

| Manual condition | Readings | Speed range, m/s | Gear indices | Independent observation |
|---|---:|---:|---|---|
| Idle | 302 | 0–0 | 0 | User confirmed stationary idle |
| Stationary revving | 525 | 0–0.03474 | 0,1 | User confirmed engine audibly revved while stationary |
| Acceleration / shifts | 463 | 0–33.9063 | 1,2,3,4 | User confirmed at least one natural shift |
| Braking / return to idle | 282 | 0–20.6733 | 0,1,2 | User confirmed stopping and idling |
| Final traffic/idle window | 111 | 0–0 | 0 | Nearby traffic comparison |

There were 12 player gear-getter transitions across the capture; only at least one was manually corroborated. Index 0 is not assigned a neutral/reverse meaning.

Driven non-player subset: **193** readings across five model hashes, four distinct values in **43.33333969116211–50.000003814697266**. Each model's available readings were constant; two models had only one/four observations. Occupants-without-reported-driver subset: 445 out-of-range readings. Unoccupied engine-off subset: **11,126** readings, all zero. Occupancy/engine-state correlation does not establish causation or universal behaviour.

Normal telemetry had **5,397 samples over 269.862 seconds (~19.995 Hz)**, zero queue drops and one missed deadline. The raw sidecar had zero queue drops, one counted byte-limit omission, completed footer and ~7.019 Hz actual cadence (10 Hz upper cap). Every diagnostic sequence joined its normal sample. The observer neither clamped nor divided raw values. Both final files parsed completely. No synchronized audio recording, tachometer calibration or physical crankshaft measurement exists.

## Suggested maintainer reproduction

1. Use a supported, authorised Story Mode installation with the exact executable/runtime versions, current SDK and a getter-only plugin; do not enter Online. Confirm actual exe file version rather than only a patch label.
2. Select one normal combustion road vehicle. Record its lifetime identity/model, engine state, raw getter, gear, velocity and monotonic time at a bounded cadence. Preserve raw separately from validation; do not normalise a bad reading.
3. Observe stationary idle, audible stationary revving, normal acceleration/natural shift and braking. Mark actual conditions and independently confirm audible revs/shift. Do not force engine/gear states or change vehicle behaviour.
4. Compare raw ranges and variation per scenario, then a small driven-NPC and engine-off subset if naturally available. Confirm whether this getter tracks the engine or another quantity. Stop on instability and restore the installation after the single approved experiment.

This procedure is a proposed maintainer reproducer, not an instruction for RichAudio to launch again. A vendor-directed corrected build/API would require fresh provenance and a separately authorised test.

## Questions and limits

- Is this property/0–1 contract supported on Enhanced executable 1.0.1158.16 with RPH 1.132.1428.17748?
- Is there a corrected runtime/SDK or documented public alternate acquisition route? Can the compile SDK above be ruled in/out without changing the test's working integration?
- Is a narrower independent reproduction requested? DirectStorageFix/loader were necessary for our startup and were not independently varied; this test does not exclude their interaction.

One car, one drivetrain launch; no controlled engine-off/start or multiple-player-model test. NPC samples are limited, not a distant-traffic coverage study. Model-dependent values may suggest another field but its identity is **unknown**. No claim of a specific internal RPH offset, ABI defect, permanent bug or changed units is justified. The first recovery capture discarded rejected raw values and cannot reproduce their distribution.

Supporting public evidence: [complete experiment and restoration](P2_01_DRIVETRAIN_VALIDATION.md), [sanitised aggregate measurements](../evidence/publication/drivetrain-result.json), [cross-framework review](RPM_SOURCE_INVESTIGATION.md). No raw captures, coordinates, local paths, logs, dumps, credentials or proprietary files accompany this draft. No issue, email or support message has been sent.
