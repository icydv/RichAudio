# PLAYABLE-08: isolated SHV operating-state handoff preparation

This is tested **offline preparation**, not an installed integration. Guided live 02 supports a restricted engine-running normalized operating state for the Bati on the recorded game/framework stack. It does not establish a SHV-to-RPH identity handoff, transport authentication, production PCM, listening, engine-off/restart behavior, actual gear/throttle or physical RPM. The diagnostic capture's `providerValid=false` and analyzer's broader `providerQualified=false` remain unchanged. See [the actual restricted evidence](../evidence/playable-08-guided-live.json).

The new [validator](../src/acoustics/host/Handoff/ShvOperatingStateHandoff.cs) returns only an `offline-candidate`. Every candidate and its composition report `LiveHandoffReady=false`; `MeasuredRpm=false`. There is no live capability issuer, transport, native call, file access, endpoint or playback call in this module. The current host build enumerates `Windows`, `Transport`, recording and geometry source directories, and does not include the new `Handoff` directory. Existing diagnostic ASI, RPH producer, protocol, renderer, source history, gains, menus and feature flags are unchanged.

## Existing boundary and intended smallest substitution

`GameplayVehicle.OperatingPoint` already carries a normalized scalar. The future substitution should replace only that scalar for the independently correlated current player-driven Bati. RPH remains the independently observed pose/listener provider. No authored RPM conversion, shared native-handle namespace or replacement of vehicle/source histories is needed.

The present RPH producer still reads `Vehicle.EngineRevolutionsRatio`; this preparation does not repair or enable that path. Existing gameplay transport uses a current-user pipe ACL, expected peer PID checks and session/freshness checks. Those identify its existing game-to-owned-host process channel; they do not identify a newly added SHV producer or prove a correspondence between SHV and RPH vehicles. The legacy `vehicle/state-adapter.mjs` authored RPM mapping is not used.

The candidate contains the exact raw bits and promoted float, source sequence/generation/target ticks, complete mapped acquisition interval, host-local vehicle ID/generation, host clock frequency, conservative valid-through timestamp and pinned scope. It is not a `GameplayVehicle`, frame, activation receipt or authorization.

The input contract is typed float32 promoted exactly to double, suitable for a future reviewed typed/binary representation. **Diagnostic JSON is not this wire format.** Its round-trippable float32 decimal can be `0.200000003`; parsing that directly as double does not equal the exact promoted float `0.20000000298023224`. No diagnostic JSON parser or direct capture replay adapter is implemented. A future parser must parse the actual reported scalar as float32, verify that its bits agree with the independently reported raw bits, then promote it exactly. It must not ignore the reported value and manufacture agreement by reconstructing it solely from the bits. The tests use explicit typed offline inputs and reject diagnostic decimal-as-double input.

## Composition and identity ownership

All types are internal. `OfflineComposition` owns a private issuer token and can issue three typed capabilities:

| Capability | Bound information | Current provenance |
|---|---|---|
| `SourceCapability` | Exact diagnostic/game/SHV/loader/RPH hashes, versions, Bati model, ephemeral session, fixed source generation, source/host clock frequencies | Explicit offline fixture composition only |
| `BindingCapability` | That particular source lease, SHV-local player/ped/vehicle/driver identity and independently supplied host-local player/ped/current-vehicle/driver ID and generation; bounded host-time lifetime | Authored fixture ground truth; **not real vehicle correlation** |
| `ClockCapability` | That particular source lease, corresponding source anchor and host anchor bracket, bounded drift and expiry | Authored fixture map; **not a measured live handshake** |

Capabilities from another composition, or another source lease in the same composition, cannot be substituted. Raw DTOs and `authenticated:true` assertions cannot mint them. The issuer token is an API ownership boundary, not a security sandbox against hostile full-trust code in the same process. There is deliberately no constructor/factory that issues an authenticated live source or binding.

Each SHV pre/post context must independently say the player is eligible and its local driver equals its local player ped; its own player/ped/vehicle/model identities must stay stable and match the binding. Host pre/post contexts must independently have their own driver equal their own ped and current vehicle equal their own vehicle, with stable host-local identities/generation matching the binding. SHV integers are never compared with host IDs. Model and scalar speed do not infer a binding.

`Eligible` is a context assertion meaning independently observed valid/living current player/current driver, offline, unpaused, not loading/switching and foreground. It is **not authenticated by this validator**. The future trusted composition must collect and substantiate those facts through authenticated observation routes before it can issue a real binding. A unique current-player-driver role, independently sampled with overlapping bounded intervals and guarded lifetimes, is a possible correlation strategy to investigate. Its physical correspondence and entry/exit/change/reuse failure handling remain live-unproven; same model and speed alone are insufficient. No new native IDs or independent correlation method have been added here.

The exact diagnostic ASI hash `41361aa281493e1cc54fe196161aafc4a93ce002bfe0bb9da2effbc742465484` is pinned. Changing the producer to add a handoff does not inherit qualification automatically. The future producer's bytes, observation route, source process identity/creation lifetime and trusted composition must be separately reviewed and bound to separately authorized handoff evidence.

## Conservative timing and value policy

These bounds are authored validation choices, not measured transport guarantees or native API specifications.

| Check | Policy |
|---|---|
| Quantity / target / model | Normalized engine operating state; `F9DDA40BC293A61E`; Bati `F9300CC5` only |
| Running scope | SHV raw engine BOOL exactly `1` in both contexts; host running true in both |
| Scalar | Exact `uint32` float bits decoded and promoted to double must equal the supplied scalar; finite and `>0..1` |
| Observed restricted run | `.20000000298023224..1`, no zero; the wider `>0..1` review band is not proof of unseen values or engine states |
| Zero / invalid return | Preserve supplied raw evidence, reject and retire; no zero replacement, clamp, remap, retry or last-good output |
| Scalar speed | Finite `0..100` m/s as authored context sanity only; never RPM, throttle or cross-framework identity |
| Source and host acquisition brackets | Ordered complete pre/target/post and host pre/post intervals; each spans at most 250 ms |
| Sequence / generation | Starts at 1, strictly contiguous; generation fixed for the source lease, positive and within exact integer range |
| Rate / continuity | Next target starts at least 50 ms after the previous target returned; next source pre-context starts at most 250 ms after that return |
| Receipt freshness | The full mapped source interval and full host peer interval must each be no more than 250 ms old and no more than 2 ms in the future |
| Independent peer skew | Worst endpoint pairing between source and host acquisition intervals at most 50 ms; matching midpoints alone cannot pass |
| Map / binding | Each lifetime at most 5 seconds; full source/host intervals covered by binding; mapped upper endpoint covered by map expiry |
| Clock anchor / drift | Host anchor bracket width at most 4 ms; drift bound 0..100 ppm; explicit positive source and host frequencies up to 1 GHz |

A map means the source anchor corresponds to an instant inside the supplied host anchor bracket. Equal frequencies or a DTO claiming an offset do not establish this relationship. No such live mapping is measured here. For source interval `[s0,s1]`, source anchor `sa`, source frequency `fs` and host frequency `fh`:

```text
d0 = (s0 - sa) * fh / fs
d1 = (s1 - sa) * fh / fs
e  = max(abs(d0), abs(d1)) * driftPpm / 1,000,000
mapped = [ floor(hostAnchorBefore + d0 - e),
           ceil (hostAnchorAfter  + d1 + e) ]
```

The whole source pre-to-post interval, including native return and acquisition duration, is mapped. Arithmetic uses bounded decimal deltas and outward rounding. Source ticks farther than 5.502 seconds from the anchor are refused rather than extrapolated indefinitely. Host receipt time must be at or after the completed anchor bracket and at or before map expiry. Map renewal does not reset source sequence/generation. The pinned frequencies cannot change through renewal.

The candidate's `ValidThroughHostTicks` is the minimum of: oldest mapped/source-or-peer acquisition endpoint plus 250 ms, clock expiry, and binding expiry. A future downstream consumer must recheck this bound **on every use**, using the bound host clock domain, and synchronously discard all candidates when the session retires. This is still a candidate bound, not permission to render it.

Validation runs only when an observation arrives. There is **no autonomous silence/missing-message watchdog**, expiry callback, `get-last-good` operation or renderer integration. A continuity gap can be rejected when the next observation arrives; this does not demonstrate timely detection while the stream is absent. A future runtime needs an independently bounded silence timeout and downstream expiry enforcement. Any rejected arrival permanently retires this validator and returns no candidate. There is no reset/reconnect/rebind method. Concurrent arrivals are serialized through a short computation-only lock.

## Device-free verification and remaining work

Run `pwsh -NoProfile -File tools/Test-ShvOperatingStateHandoff.ps1`. It uses the already installed .NET Framework x64 C# 5 compiler, compiles only the new validator and its fixture, and writes an isolated private validation receipt. It installs nothing. The tests cover explicit nonzero offsets and unequal clock frequencies, drift/outward rounding, full-interval uncertainty, peer skew, binding coverage, source continuity, exact raw promotion, zeros/NaN/infinity/out-of-range data, driver and identity transitions, producer/framework scope mutations, foreign/missing capabilities, rate violations, replay, concurrency and permanent retirement. The portable [receipt](../evidence/playable-08-handoff-preparation.json) identifies the exact tested files; fixture evidence is not an actual-live handoff acceptance record.

Before any new live approval request, build, offline-validate and review the minimal producer and trusted composition. The subsequent exact bounded live handoff test requires separate authorization. No deployment or launch is requested or authorized here. That test must authenticate the actual source and owned host, substantiate independent current-player-driver correspondence without shared handles, measure clock mapping uncertainty, demonstrate stale/silence/replay/generation/identity-change failure closure and bind the exact producer bytes. The diagnostic candidate remains preserved. Actual production PCM, listening, loudness/traffic calibration and recording gates remain later stages; this module grants none of them.
