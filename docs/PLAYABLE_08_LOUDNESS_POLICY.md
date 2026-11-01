# PLAYABLE-08: modification-aware loudness foundation

1 November 2026. Implemented and tested offline; **disabled, unwired and acoustically uncalibrated**. No vehicle playback, modification reads, native calls, endpoint activation, game deployment or traffic listening occurred. The existing sources, histories, renderer, gameplay selection, gold menu and saved settings are unchanged.

The production module is [loudness-policy.mjs](../src/acoustics/vehicle/loudness-policy.mjs). Its [configuration](../config/vehicle-loudness-policy.json) has `enabled:false`; the accompanying [schema](../config/vehicle-loudness-policy.schema.json) and runtime validator bound all parameters. It needs the existing Node ESM runtime with JSON import attributes, with no additional package or framework. The tested local runtime is Node 24.19.0.

## Reference and proposed treatment

The retained `stock-pressure.mjs` reference remains engine pressure 1, exhaust pressure 10, and common trim 0.25: renderer reference gains are **0.25 and 2.5**, applied once. This is the accepted relative source-pressure adjustment, not ten times a complete vehicle's perceived loudness or a measured SPL relationship. Disabled policy envelopes are exactly 1/1/1.

The following new values are **authored starting points for later listening calibration**. They are attenuation multipliers relative to that reference, not measurements or new accepted calibration:

| Treatment | Engine emission multiplier | Exhaust emission multiplier |
| --- | ---: | ---: |
| Ordinary stock/model fallback | 0.85 | 0.30 |
| Factory performance stock | 0.95 | 0.65 |
| Verified nonstock engine/EMS only | 0.98 | 0.82 |
| Verified nonstock exhaust, with or without EMS | 1.00 | 1.00 |

Classes 4, 6 and 7 are the configurable factory-performance baseline; all other or unavailable classes default conservatively to civilian treatment. This is an authored category rule, not measured power or modification evidence. Explicit hash-keyed model overrides can preserve a particular factory character. No guessed vehicle hashes or model exceptions are shipped. An EMS qualification never lowers a louder model-specific stock **emission target**; the separate bus attenuation can still reduce its complete output below the stock baseline during contention. Uniform amplitude envelopes do not add a low-frequency cut, change source selection or reinterpret a vehicle as modified because it sounds powerful.

Player and NPC vehicles use the same classifier. Unknown, stale, contradictory or foreign-identity modification data use the stock/model fallback. Either independently valid qualification route can succeed when the other slot is unavailable or unreadable.

## Published modification contracts

The existing pinned [Enhanced NativeDB corpus](https://github.com/alloc8or/gta5-nativedb-data/blob/424fb51b089049a9fbcebcc641500b1d44d255b4/natives_gen9.json) contains the following base-game declarations. The local immutable snapshot SHA-256 is `c58064f5f3b89a0acd58fe3a3497e817311e965b0595776402886949249c5a5e`. These are published community-maintained declarations, not a guarantee of successful reads on the installed Enhanced build.

| Definition | Contract used for research |
| --- | --- |
| `GET_VEHICLE_MOD` / `772960298DA26FDB` | `int(Vehicle,int)`; the selected option index, with -1 denoting stock. |
| `GET_NUM_VEHICLE_MODS` / `E38E9162A2500646` | `int(Vehicle,int)`; number of reported options for that type. |
| `GET_VEHICLE_MOD_KIT` / `6325D1A044AE510D` | `int(Vehicle)`; published getter, without a detailed failure/availability contract. |
| `GET_VEHICLE_CLASS` / `29439776AAA00A62` | `int(Vehicle)`; published class catalogue distinguishes ordinary classes from muscle/sports/super. |

The API maintainers' pinned [mod-type enum](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/SetVehicleMod.md) identifies **exhaust slot 4** and **engine slot 11**. Their [selected-option documentation](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/GetVehicleMod.md) and [option-count documentation](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/GetNumVehicleMods.md) agree with the Enhanced corpus. These files document Rockstar VEHICLE natives exposed by Cfx; the policy does not use CFX-only extensions or require FiveM.

The pinned [SHVDotNet implementation](https://github.com/scripthookvdotnet/scripthookvdotnet/blob/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/source/scripting_v3/GTA/Entities/Vehicles/VehicleMod.cs#L85-L164) independently checks the range -1 through count-1 and treats nonnegative engine indices as upgrade entries. The first nonstock index is **0**, not 1. The policy exposes `emsUpgradeOrdinal=index+1`; that is the ordinal of the reported engine upgrade, not a physical tuning measurement or independent localization check. A future adapter must validate the actual vehicle's reported catalogue before treating its first upgrade as the intended EMS Level 1 route. No SHVDotNet runtime is added.

The [mod-kit setter documentation](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/SetVehicleModKit.md) warns that applying body modifications depends on kit setup. This does not authorise initialization by a diagnostic reader. The module performs no setter or getter. A future qualified read-only adapter must establish trustworthy existing-kit/count/index observations; it must not silently call `SET_VEHICLE_MOD_KIT` or `SET_VEHICLE_MOD` to make a read work. Zero reported options alone cannot distinguish all unsupported/uninitialized/failure cases. Until that adapter is validated, absence of trustworthy metadata means stock fallback. None of these researched identifiers was added to the SHV diagnostic's native set or invoked here.

## Input and lifetime contract

`classifyVehicleLoudness(vehicle, nowSeconds, configuration)` requires an owned opaque identity (`id`, `generation`, unsigned model hash), and `context` of player or NPC. Optional class/category data affect stock treatment only. A qualifying `modification` record must match vehicle ID, generation and model, carry a nonfuture `observedAtSeconds`, and explicitly establish `modKitReady:true`. Each slot supplies `status:'observed'`, `count`, and `index`. Counts are bounded to 0..256 as an input-safety limit, not a claim about every GTA catalogue. Index -1 is stock; a valid index 0..count-1 is installed; count zero/index -1 means no options reported. Invalid or unavailable observations do not become upgrade evidence.

`VehicleLoudnessPolicy.update` accepts at most eight vehicles by default, bounded at 64 by configuration. Include all playing **and releasing** identities. Different generations can coexist. The policy never chooses which vehicles receive voices. The current gameplay producer still has its separate two-source selection limit; this implementation does not establish full audible NPC traffic coverage.

The first update anchors the supplied, already mapped emission/control time to the local emitted-frame clock. Repeated stale timestamps cannot renew the modification deadline. If no further update arrives, the default 0.5-second modification validity expires by emitted frames and the policy smoothly returns to stock. A future game/host clock mapping must be independently qualified; no common native/host time origin is assumed.

## Separate emission and presentation envelopes

`writeEnvelopesInto` fills caller-owned engine, exhaust and bus arrays, at most 512 frames per call. There is no filesystem access or allocation in its sample loop. It uses a 0.2-second first-order transition, bounded positive emission multipliers, and no per-band filtering or source restart.

Persistent category/modification treatment belongs on **newly emitted dry frames before those frames enter source history**. It must not rewrite retained samples, reset cursors or change the amplitude of earlier emissions after a retarded read. The independent bus envelope belongs on the **current propagated vehicle bus**. `applyVehicleLoudnessEnvelopeInto` copies either selected stream into separate caller-owned output; callers must choose the correct envelope/insertion point and must not reapply the reference trim.

The prominence budget distributes at most two weighted units across modification-qualified vehicles. Priorities 0..1 are explicit caller inputs; the same geometry/priority rule must apply to player and NPC sources. A common smoothing coefficient keeps the sum of allocated shares bounded through transfers. The propagated bus gain remains in 0.6..1 by default, so losing prominence never zeroes a voice. It attenuates the **whole vehicle bus**, including its stock contribution, rather than only the modification surplus. For example, a modified performance emission target of 1/1 at bus gain 0.6 becomes 0.6/0.6, below that category's stock emission targets of 0.95/0.65. This explicit, uncalibrated tradeoff needs traffic-listening review; the policy does not promise a preserved stock output floor, perceptual prominence or missing source coverage.

## Headroom and activation

`assessVehicleLoudnessHeadroom` sums explicit, already reference-scaled, propagated, panned and master-scaled **absolute** contribution bounds. Include every direct/reflected and releasing contribution. Its default peak limit is 0.95. It retains gain ceiling **1 for all old and new emission history and bus presentation**, even when the current emission target is quieter. A failed assessment returns `bound-exceeded`; it does not mute traffic or claim a limiter will fix it. Attenuating one component can remove cancellation and increase an actual mixed peak, so the implementation does not use cancellation as headroom evidence. The future composition must retain the existing conservative path/headroom admission checks. This mathematical assessment is not a live clipping measurement.

Both `config/production-features.json` requests remain false. The independent DSP configuration also defaults false. The shared [production activation gate](../src/acoustics/production/activation.mjs) requires actual-live scoped telemetry, qualified handoff, nonzero production PCM and human listening, followed by current-session approval before loudness calibration. Production loudness additionally requires headroom and traffic-listening calibration evidence. The structural gate does not authenticate arbitrary records or grant consent. No host, renderer, producer or menu path is wired to this policy during PLAYABLE-08.

## Offline validation

Run `node --test tests/Test-VehicleLoudnessPolicy.mjs tests/Test-SourcePressureCalibration.mjs tests/Test-StockSource.mjs`.

**18/18 tests passed**, including 13 new policy tests. They cover category/model decisions, installed exhaust or first EMS alternative, unavailable exhaust, NPC/player equality, bad/stale/foreign metadata, frame-based expiry, bounded prominence transfers and the whole-bus baseline tradeoff, block partition invariance, smoothing, nonaliasing, unchanged original source playback/retained history and conservative headroom. The existing pressure/reference tests also passed. Analytical PCM fixtures prove code behavior; they are not listening, current-game modification reads, real traffic loudness, endpoint or live playback evidence.
