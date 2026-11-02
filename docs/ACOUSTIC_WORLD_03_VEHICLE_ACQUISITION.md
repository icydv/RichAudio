# ACOUSTIC-WORLD-03: my read-only vehicle observation adapters

I now have separate read-only candidates for six vehicle operating levels and the last reported collision contact. Codex implemented their bounded capture, reference-SDK compilation and deterministic replay. **All executed captures in this increment use original authored API fixtures. No GTA/RPH getter, real endpoint or native mutation was executed.** My ordinary gameplay route and its disabled event bus remain unchanged.

The new code is a callable acquisition boundary, not another sound generator or renderer. It does not turn a getter declaration, a polled level change or a last-contact report into an accurately timed native event.

## Declaration evidence and target limits

Codex read the explicitly retained reference SDK as PE metadata without executing it: SHA-256 `1f8a8a88a511d8c6d4aacd196e72b5192970b730f4070606d8bfac63ed722d45`, version `1.131.1424.17745`. Sixteen selected declarations have RVA zero. The new binding compiles against that reference; it does not establish behavior on the previously retained `1.132` Enhanced target profile. No installed build or proprietary game asset was inspected.

The earlier metadata inspector correctly refused this reference because it pins a different, older SDK hash. That inspector and its old evidence were not modified. The new PE-only inspection is a separate receipt, SHA-256 `a5ac233543a058645e9bd21e1975ed2c6535de5e69d562d48275cf5271b89dc6`.

Primary declaration/documentation sources:

- [`IS_HORN_ACTIVE`](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/AUDIO/IsHornActive.md), pinned community-maintained native declaration `0x9D6BFC12B05C6121`. Its description concerns a horn sound currently playing, not a button press, exact activation time or original horn-enabled setting. It is not an Enhanced/RPH runtime guarantee.
- [RPH `IsEngineStarting`](https://docs.ragepluginhook.net/html/P_Rage_Vehicle_IsEngineStarting.htm), retrieved preliminary documentation for version 0.56. The reference SDK also declares `IsEngineOn`, `EngineRevolutionsRatio`, `CurrentGear` and inherited `Speed`. Direct requests for the corresponding engine-on, ratio and gear pages returned 404 during this investigation; the metadata declarations and compile result are the retained evidence, not a silently substituted documentation guarantee.
- [RPH `GetLastCollision(out Vector3, out Vector3, out string)`](https://docs.ragepluginhook.net/html/M_Rage_Entity_GetLastCollision_2.htm), retrieved preliminary version-0.56 documentation and matching reference signature. It exposes the last collision's point, normal and material name, without a contact ID, event multiplicity, occurrence clock or impulse.
- [RPH wheel properties](https://docs.ragepluginhook.net/html/Properties_T_Rage_VehicleWheel.htm), including `IsTouching` and `LastContactPoint`. These are old declaration-level opportunities; a last point does not supply qualified wheel slip, dynamic load, material confidence or a new contact event. No quantitative tyre adapter is invented from body speed.
- [`IS_VEHICLE_IN_BURNOUT`](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/IsVehicleInBurnout.md) and [`GET_VEHICLE_DOOR_ANGLE_RATIO`](https://github.com/citizenfx/natives/blob/c00e0ed83d06dcba2457424ba254fbaa7a05bf7e/VEHICLE/GetVehicleDoorAngleRatio.md) remain coarse-state research surfaces. Neither supplies a physical slip amount or an impact event.

## Implemented coverage

| Field / family | New executable boundary | What remains unavailable |
| --- | --- | --- |
| Horn playing | Read-only named-hash getter; independently bracketed Boolean | Button activation/release time, pattern multiplicity, verified component mount and native suppression/restoration |
| Engine on / starting | Read-only RPH flags, even while the engine-on flag is false | Physical ignition/shutdown cause, exact event time and shutdown waveform trigger |
| Revolutions | Unmodified raw `EngineRevolutionsRatio` | Exact-target scale and physical crankshaft RPM; a raw value of 50 remains 50 |
| Gear / drivetrain | Raw signed framework gear index | Number of shifts between polls, clutch/shaft dynamics, physical clunk timing or intensity |
| Speed / road contact | Unmodified raw entity speed | Wheel slip, load, rolling-contact material, friction and acoustic power |
| Last collision | Exact out-parameter method binding with bounded finite raw point/normal and an opaque bounded material label | New collision identity, occurrence, multiplicity, contact impulse, qualified coordinate space/material coefficients and source emission pose |
| Turbo / induction | Coverage remains explicitly unavailable | Boost pressure, pressure release, compressor surge and configured hardware behavior; acceleration is not turbo flutter |

Every payload reports `runtimeVerified=false`, `mayGenerateAudio=false` and `nativePrimary=true`. Source/component emission mounts remain unavailable. Neither a current vehicle position nor a last-contact position is promoted to an event occurrence origin.

A returned Boolean or finite number alone does not establish a functioning Enhanced getter: an unsupported invocation may return a default without throwing. Future runtime qualification must correlate controlled known state changes with the declared return and verify the exact loaded API, rather than treating a successful call or an all-false trace as proof.

## Timing, identity and lifecycle

The state sampler retains a caller-owned session/vehicle-generation lease and checks the retained pool value, index, counter, model and player-driver relationship before and after its getters. Same-model vehicles cannot share a lease. Pool-counter wrap and exact runtime lifetime semantics remain unverified and therefore cannot confer production audio authority.

Each of the six getters has its own QPC before/after bracket. The batch is not an atomic snapshot. The 10 ms acquisition limit is an observational service-admission gate checked after calls; it cannot preempt a stalled native call or guarantee a 10 ms game-fiber deadline. A slow query stops further getters and quarantines that batch. Capture performs no geometry work, transport wait, file IO or audio processing. Each sampler is bounded to 4,096 records and keeps no growing history.

Replay verifies the exact source context, ordering, clock frequency/provenance, finite raw data and freshness. The 250 ms limit remains inclusive and is anchored to the original capture-before timestamp, not the later batch end. Missing/invalid getter data clears only that field's comparison history. A quarantined batch does not restart an audio source or advance its renderer; these modules have no audio-source or renderer access. Expired, recycled, disappeared or scope-lost contexts are terminal and require a new explicit lifetime.

Two differing qualified levels produce an **observed level difference**, with a comparison window from the previous getter's acquisition-before to the current getter's observation-after. The actual occurrence remains null. The window is conditional on getter-current-state semantics, which are not qualified on Enhanced; it is not asserted as a measured physical-event interval. The number of intermediate changes remains unknown. Initial active horn/running values seed state without manufacturing an onset, and equal polls do not prove that no intermediate event occurred.

Observed engine-on false is a valid level while driver scope remains valid. Dismount/scope loss, disappearance and rejected post-query identity are separate retirement reasons and never create an engine-off or shutdown-sound event. No valid engine phase or source history is restarted by these acquisition modules.

Last-contact capture is a separate payload with its own query bracket. A false report leaves point, normal and material unavailable; finite raw normals are retained without invented normalization. Unsupported/path-like material labels remain unavailable/invalid, and no acoustic coefficients are inferred. Repeated equal positions do not prove one persistent collision, while changed positions do not prove new collisions. No deduplication key or impact trigger is fabricated.

## Device-free evidence

The focused Node suite passes 24 replay/contract cases. The C# authored-API runner passes 1,039 assertions, including 1,000 bounded nominal fake captures. It also exports actual C# fixture packets and validates their horn/gear/engine-level changes, scope retirement and last-contact histories through the JavaScript parser/replay. The optional retained-reference build compiles both RPH bindings without loading or executing the resulting DLL or SDK getters.

One retained fake-getter run measured sampler cost p50/p95/p99/max **0.0006 / 0.0029 / 0.0042 / 0.0070 ms** across 1,000 captures. The post-run managed-memory snapshot was 2,161,680 bytes. These are authored in-process API costs and an uncollected memory snapshot, not GTA native-call cost, peak memory, audio callback work or event-to-speaker latency. The independent query and lifecycle regressions are more important than those nominal microbenchmarks.

The first compile exposed an uninitialized authored-fixture field under warnings-as-errors. Codex explicitly initialized that fixture field and retained the first failed output directory; no operational candidate was repaired or regenerated under an old approval.

## Next evidence boundary

The candidate RPH binding has no plugin entry point, registration or automatic fiber, and is excluded from ordinary builds unless its dedicated compilation symbol is supplied. The actual gameplay event bus remains disabled. Existing acquisition/ownership policy cannot be overridden by optimistic caller flags.

Real getter evidence requires a separately reviewed supervised Story Mode acquisition candidate: one explicitly selected Bati lifetime; read-only horn/engine/gear/raw speed and last-contact fields; bounded sampling, query-cost and independent-stop supervision; original per-getter clocks and all failures retained; no audio endpoint, native suppression, automatic source rendering or installed-map scan. That future candidate must establish exact loaded API/build identity and handle lifecycle behavior, and must never ask a polling interval to stand in for actual event timing. This document grants no live authorization and is not an executable/hash-pinned live proposal.
