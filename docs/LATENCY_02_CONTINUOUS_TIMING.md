# LATENCY-02: continuous state timing and honest 50 ms recovery

I kept the default 100 ms path and reviewed 75 ms candidate unchanged, and implemented two separate offline research options. One makes 50 ms listener recovery mathematically safe by declining unavailable geometry. The other applies newer observed operating state at the current PCM emission frame, **only inside a positively declared stationary authored world**. Neither option is selected by the live manifest or `Run-Gameplay` route.

The source-state experiment improves control response in that narrow stationary fixture. The 50 ms listener experiment completes the retained trace but produces worse gaps, so I am **not promoting it as an audible or live improvement**. No GTA process, endpoint, installed bank, suppression, recording, deployment or old worktree was changed.

## Defaults and the original failure

Codex replayed the unchanged original engine from the previous worktree beside the new implementation on the same retained source bits and constructed delivery schedule. Default 100 ms PCM is identical (`be5d36be1d842ef47be8ea3b5d48496ac125b687518b550d07156654b5516e92`). Reviewed 75 ms with `camera-source-01` is also identical (`f0fc0b292d4becc25a7250b85ee90db21d499af332fbd3ef2dbd69f0b337da08`). The named profile registry, startup/steady credits, source calibration and WASAPI route are unchanged.

The legacy private 50 ms override still fails at producer frame **612,352 / 12.757333 s**, with both continuity policies. Prediction is followed by interpolation within listener generation 2; the resulting listener step is approximately 113.7035 model units/s against the existing 100-unit/s guard. The adjacent original observations are approximately 65.8 native units/s. This is a reconstruction recovery failure, not proof that the actual camera or Bati moved at that rejected speed. The original [50 ms investigation](LOW_LATENCY_01_50MS_EXPLORATION.md) remains preserved.

## Fixed-clock, arrived-segment recovery

The constructor-only research option is `continuousTimingPolicy='arrived-segments-50'`, with `continuityPolicy='camera-source-01'`. The listener still queries exactly `S = T − 0.050` on the original anchored clock. It does not slow or relabel that clock during motion.

At a requested timestamp, the new policy returns the original interpolation only when both endpoints have already arrived in the same genuine generation. If the right endpoint has not arrived, it reports `awaiting-observed-segment`, with no valid geometry pose. The existing renderer releases unavailable paths. Actual generation cuts remain explicit gaps; the implementation does not manufacture a new generation, clamp a position or silently accept a discontinuity. Exact observed knots remain usable. Original wall-clock freshness, pause, identity and expiry gates remain active.

For an arrived segment, `P(S) = P0 + (S − t0)/(t1 − t0) × (P1 − P0)`. Its raw position slope is checked against the same 100-model-unit/s limit, including after an unavailable interval. With fixed `dS/dT = 1`, each valid segment has that same speed bound. The triangle inequality preserves the bound across valid knots. There is no forecast position to reconcile into a larger step later. The implementation explicitly rejects an invalid raw segment rather than using an unavailable prior output to bypass the guard.

This is an explicit release/reacquire policy, not a claim of uninterrupted motion. Independent dry source/grain history advances only while the original source qualification remains valid. The early prototype without camera/source preservation recreated 394 sources; that combination is now rejected by the constructor. It remains in the first private receipt as negative evidence.

| Final retained replay, all 3,114 blocks | Reviewed 75 ms + camera continuity | Arrived-only 50 ms + camera continuity |
| --- | --- | --- |
| Completed retained input | Yes | Yes |
| Listener forecast blocks | 15 | 0 |
| Explicit awaiting-segment blocks | Not this policy | 476 |
| Source creations | 1 | 3 |
| Two camera near-silent windows | 47.021 / 47.104 ms | 108.021 / 108.021 ms |
| History faults / missing history / limiting | 0 / 0 / 0 | 0 / 0 / 0 |
| External render median / p95 / p99 / max | 2.900 / 5.113 / 5.972 / 22.498 ms | 2.991 / 5.180 / 6.226 / 22.163 ms |
| External blocks over 10.667 ms | 1 | 3 |

With authored 0–15 ms delivery jitter, arrived-only 50 ms waits on 870 blocks and creates three sources, compared with one creation at 75 ms. Omitting every eleventh sequence yields 707 waits, 54 source creations and 54 external deadline misses, versus four creations and four misses for 75 ms. The omissions also worsen the reviewed path; it is not claimed dropout-free. The retained and authored-stress schedules are counterfactual producer deliveries, not an exact reconstruction of unrecorded live Node acceptance.

The recovery guard is satisfied, but the measured availability and source continuity cost are unacceptable for a current replacement. The research option stays unwired to live selection. These measurements do not establish ring starvation, real output underflow or perceptual quality because no sink is used here.

## Current emission state needs coherent geometry

The existing source generates dry PCM for emission frame `T`, while selecting operating and spatial data retrospectively at `S`. Selecting a newer operating observation with timestamp `q ≤ T` is necessary for causality, but by itself does **not** make stale moving geometry physically correct at `T`.

The new `operatingStatePolicy='authored-stationary-emission-01'` therefore requires a separately branded `createAuthoredStationaryEmissionContract(...)`. It positively declares one source/listener pose, zero velocities, fixed orientations, source/session/generation identity and a finite offline horizon. This is authored fixture truth, not an inference from a few quiet live observations. Every accepted observation must agree exactly with that geometry. Source/listener motion, identity/representation changes or horizon exhaustion reject the experimental engine permanently. It cannot resume by replaying older operating state through the legacy path.

Within that stationary world, `P(T) = P(S)` and listener geometry/orientation are identical for both times. The current source pose is qualified for the whole 512-sample block. The selector uses the newest genuinely delivered source state whose mapped observation time is at or before the **current emission frame**, with original finite lease and a 250 ms maximum age through the last sample. It never applies that newer state to past dry frames. Existing source history, propagation delay and retarded lookup remain in place; emitted state changes travel through the same model paths.

In these fixtures, operating state and vehicle ticks are explicitly authored at the same observation time. A real native getter has its own acquisition interval; the adapter's check that this interval is within 50 ms of the pose does not establish their ordering. That native interval is unavailable to this selector unless separately joined and qualified. No native operating acquisition or live stationary-world qualification is claimed. Moving trajectories remain unqualified; the implementation does not substitute a stale-geometry approximation or slew the clock to make them appear valid.

## Genuine Bati material, authored stationary observations

The device-free benchmark uses unchanged private Bati source banks, profiles and gains. Seven authored operating steps arrive at nominal 20 Hz in a stationary world; a third schedule omits one of those seven observations. Both arms retain the same 75 ms listener policy. Source PCM generation uses the real `StockVehicleSource`, `CausalSimulation` and `StreamingRenderer`.

The measurements below end at the **control argument passed into source generation**. They precede the unchanged 40 ms position/weight smoothing, 25 ms running envelope, 10 ms grain-state response, physical model travel time, PCM queue and output. They are not audible onset or WASAPI submission times.

| Authored observation to first control departure, median / p95 / p99 / max | Reviewed 75 ms | Qualified current emission |
| --- | --- | --- |
| Steady, 7 delivered changes | 29.333 / 32.933 / 33.253 / 33.333 ms | 5.333 / 8.933 / 9.253 / 9.333 ms |
| 0–15 ms jitter, 7 changes | 29.333 / 32.933 / 33.253 / 33.333 ms | 12.000 / 19.200 / 19.840 / 20.000 ms |
| Omission, 6 delivered changes | 28.000 / 33.000 / 33.267 / 33.333 ms | 4.667 / 7.667 / 7.933 / 8.000 ms |

The reviewed path interpolates operating state, so first response is earlier than reaching the exact new value. Steady **first exact value** is 81.333 ms median at 75 ms versus 5.333 ms in the emission-state option. This larger difference is completion of the control transition, not a measured 76 ms removal from audible latency. Dropped observations are excluded from the delivered-change distributions rather than invented as events.

All six runs use one source object with no source-frame gaps, no history/tag/future faults, no missing history and no limiting. Path Doppler rate remains one to floating-point tolerance. The PCM prefix before the first authored operating change is bit-identical across all six runs (`1fa0bd15182148e43de65bd78609c897b8139e94f086a40885ff165da213ba43`), supporting the absence of early or backdated control. The positive stationary horizon covers the padded 3.008 s output, including its last block.

| Source-worker cost, median / p95 / p99 / max | Reviewed 75 ms | Qualified current emission |
| --- | --- | --- |
| Steady | 2.541 / 5.391 / 7.203 / 70.184 ms | 3.136 / 5.825 / 6.935 / 20.224 ms |
| Jitter | 3.045 / 5.706 / 6.830 / 16.171 ms | 2.982 / 5.816 / 6.485 / 15.731 ms |
| Omission | 3.388 / 6.179 / 7.414 / 15.803 ms | 3.408 / 6.655 / 8.254 / 16.510 ms |

Each run has 282 renders and one external deadline miss, including cold source work. The ordered process sampled RSS from roughly 188–256 MB; retained banks, previous runs and metric storage are included, and the samples are not peak allocation measurements or evidence of a profile-specific memory difference. Original dry-source history storage remains unchanged. No queue, device or heavy-contention safety follows from these source-worker measurements.

## Evidence and remaining qualification

Implementation commits: `b364d3f`, with per-candidate lease qualification and authored-clock metadata hardened in `51efefe`. Nine focused tests cover interpolation math, the legacy failure, no future-state use, raw segment rejection after a gap, real generation/expiry boundaries, stationary contract branding, every selected record's finite lease/validity, motion/horizon rejection, source/grain advancement and unchanged static Doppler rate. The final six-arm stationary receipt binds that hardened implementation. The retained replay binds the earlier source version; its default/75 executed modules are unchanged by the opt-in selector hardening. [Sanitized continuous evidence](../evidence/latency-02-continuous.json) carries both source sets, raw receipt hashes and fresh first-departure analysis. Earlier metadata that inferred native acquisition ordering from pose timing is explicitly corrected; its raw receipts remain unchanged. No capture or approval was repinned.

The original live 146/204 ms native endpoint ages at submission already include the 62.695 ms mean ring residence. Neither those numbers nor the source-control figures here can be added together to infer total delay. A live moving-source operating path needs genuinely coherent current emission geometry/time or a separately reviewed approximation; it remains outside this implementation. The priority transient path is separate work and does not inherit the continuous history delay by default.

The replay tools are `Run-Latency02ContinuousReplay.mjs` and `Measure-Latency02Stationary.mjs`. They require explicit private package/input paths and fresh `.local` output, preserve the original package, and never launch GTA or open an endpoint. Any future controlled live comparison still requires new exact review and explicit approval; these constructor-only research options are not an executable live proposal.
