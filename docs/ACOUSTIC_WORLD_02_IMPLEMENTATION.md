# ACOUSTIC-WORLD-02 and LATENCY-03: offline implementation result

I've extended my project from engine/exhaust foundations toward complete vehicle audio, and prepared one isolated synthetic endpoint experiment. Codex worked in a separate branch stacked on PR #78 at `f409aabcfd3c3b3e8ee5506e24585c3a5d3bd527`. PRs #76, #77 and #78 remain unchanged. **No endpoint query/playback, GTA/RPH launch, deployment, live recording, installed-map scan, native suppression or merge occurred.**

This increment has executable sources, original private WAV demonstrations, real original resource-format fixtures, cache/runtime guards and an independently reviewed device candidate. Actual endpoint latency, complete installed-world coverage and native replacement remain separate unverified boundaries.

## Complete component model and original sources

The immutable registry describes **48 desired components** across powertrain, road contact, mechanical/structural, signalling and collision families, with category/model applicability, emitter identity, timing, leases, radiator profiles and ownership requirements. The existing qualified running-Bati normalized signal is retained as a narrow genuine input; it is not renamed physical RPM or proof of engine shutdown. All 48 native takeover entries remain **GTA-owned/BLOCKED** until their complete acquisition, suppression, coexistence and independently recoverable lifecycle contracts are verified.

New original fixture sources implement sustained horn, rolling road contact, validated longitudinal/lateral slip and mechanical clunks. High speed alone produces no tyre squeal; unknown turbo configuration/pressure does not generate flutter. A prepared mechanical event retains all 4,800 original samples and routes through the shared transient preparation interface. The waveform extension retains all eight LATENCY-02 delta-kernel PCM hashes exactly.

Source identity includes session, vehicle generation/model, component and assembly. Lifetimes distinguish loss of driver scope from observed shutdown. The new worker's prepare/render transaction freezes the current dry state across its awaited solver, rejects future admission during that transaction and prevalidates stereo storage. Prepared transients require positive source/listener/tile/surface coverage through their complete output window. These are opt-in authored interfaces; existing Bati gameplay, source banks, calibration, operating policies and default source pipeline are unchanged.

Codex rendered 15 matched original component arms plus a full prepared clunk. All preserve dry-source identity/history, with zero affected history frames, limiting or source-cursor resets. The four-source mix uses the same dry excitation in open/street/tunnel geometry:

| Four-source authored scene | Worker median / p95 / p99 / maximum |
| --- | --- |
| Open | 0.318 / 0.487 / 0.552 / 0.577 ms |
| Street | 1.459 / 1.739 / 1.881 / 3.236 ms |
| Tunnel | 2.261 / 2.727 / 2.916 / 3.022 ms |

Each arm has 188 worker samples and no sample above its 10.667 ms source-worker budget. These are source/solver costs, not audio-callback or physical-latency measurements. Distinct PCM and geometric arrivals demonstrate modeled acoustic differences; perceptual realism is unverified. [Component implementation, coverage matrix and limitations](ACOUSTIC_WORLD_02_COMPONENTS.md) retain full source/cost/memory evidence.

## Collision acoustics and resource/world integration

The source-independent collision contract separates contact identity, occurrence uncertainty, relative motion, material confidence, intensity evidence, primary impact, continuing scrape and secondary/debris events. Original fixtures declare their physical inputs explicitly. They do not relabel a speed threshold or synthetic event as an observed GTA collision impulse. Late first processing cannot silently chop off an attack, and complete prepared tails need an adequate qualified horizon.

Seven private original scenes cover motorcycle/barrier, light car/wall scrape, high-energy open/street/tunnel collisions and glass. Source/contact points and explicitly modeled five-centimetre radiator offsets are separate. The same `VehicleAcousticPipeline`, `CausalSimulation` and `StreamingRenderer` implementations render direct and finite reflected arrivals. The matched high-energy tunnel worker costs are median 1.758, p95 2.113, p99 2.584 and maximum 4.230 ms; history faults, limiting, omitted paths and over-budget worker samples are zero in this run. No environment-independent reverb or second renderer was added; dense late reverberation and broader higher-order coverage remain future work.

Codex also constructed deterministic **original RSC7 YMAP v2, YTYP v2 and YBN v43 bytes**, decoded them through the exact existing trusted CodeWalker parser, and connected placement/collision output to finite acoustic geometry. A matched original triangle produces a **3 m / 419.825-frame** reflection and different output PCM with identical dry excitation. Nine parser-negative controls retain malformed/digest/version/page-budget failures. No installed archive, encryption key or private map was read. Enhanced Gen9 layouts, effective installation mount order, MLO activation and arbitrary custom maps remain unqualified; these legacy subset roundtrips do not establish whole-installation support.

The new bounded spatial index supports up to 262,144 declared tiles. Nearby preparation uses the existing separate worker/cache; its local scene publishes one exact qualified primary tile. Other prepared tiles remain cached. Sparse unions, overlaps without layer resolution, wrong cached tile identities/bounds and unsupported winning resources cannot become verified empty space. A separate finite dynamic overlay retains unknown affected regions after expiry and validates full removed geometry footprints and conflicting updates. It does not turn stale door/destruction observations into a restored static fact. These are offline runtime interfaces, without a live Story Mode bootstrap or whole-world installation writer.

[Collision, actual-format fixtures and runtime report](ACOUSTIC_WORLD_02_COLLISIONS_WORLD.md) details the supported subset, matched PCM, material/pose assumptions and remaining live/world boundaries.

## Isolated output and graceful burst policy

The new output factory uses the existing shared-mode WASAPI implementation with a separate experimental session. The normal gameplay route retains its literal-null event bus. Prewarming, bank/cache IO, source generation and geometry remain outside the output callback.

The experimental clock uses actual `IAudioClock` position/frequency and correlated QPC observations after activation; no endpoint epoch is inferred from the first release. Events wait only when they lack an arrived qualified clock bracket. Original identity, uncertainty, generation and occurrence/observation freshness remain mandatory. The route records owned writable frames, padding/wake/query brackets, full callback allocation/cost samples, successful release acknowledgements and available endpoint-reported stream-position crossings. Physical speaker output is unmeasured.

The opt-in protected-tail profile preserves active event tails instead of stealing them. In a matched deterministic 2,816-arrival stress case, the original/default policy acknowledges 496 onsets with 16 subsequent capacity cuts; the new profile acknowledges 480 with zero cuts. Continuous PCM has zero underflow in both. All 89 nominal events are acknowledged with identical PCM across profiles. The original PR #78 bus and current default are PCM-identical in both comparison scenarios. This is a loss/admission trade-off under deliberate overload, not a guarantee that every burst is audible.

[Output/clock implementation](LATENCY_03_OUTPUT_CLOCK.md) includes the supported `IAudioClient3` ABI, queried period constraints, observed-clock uncertainty and buffer-failure cleanup. Managed fake clients and pure clock fixtures pass 6,998 assertions. They do not establish actual endpoint support or translate the earlier fake-submission median into a real result.

## Exact first-device proposal

The [first-device proposal](LATENCY_03_REAL_ENDPOINT_PROPOSAL.md) is complete and independently reviewed. It selects one unchanged shared-mode initialization, 526 original synthetic events over a target 28-second sequence and the unchanged retained Bati PCM bed. It selects no smaller period, captures no audio, acquires no GTA event and suppresses no native sound.

Proposal SHA-256: `0cfcb4577178186ef41e493bb660aa29ebce69956782c980e5d998b1818b2c79`

Independent review SHA-256: `bb3cc1f50fcab2bb0e60e7bf1455331c2e79b1518c4a45685ebf318a951c6c36`

Candidate manifest SHA-256: `58f92cdc399a86e86e70587f6124cb837eaa82d604e86c7ec327b05296640432`

All 65 payload and 60 source bindings, the historical endpoint identity, original input hashes and unconsumed state passed independent verification. The reviewer ran only `--validate`. The exact private `proposal.md` bytes are authoritative for this candidate; a differently materialized checkout copy is not automatically interchangeable. No attempt marker or result directory has been created.

Fresh explicit approval remains required. The candidate consumes one attempt, admits the exact independently supervised child lifetime and closes its owned process job on timeout. Mandatory independent **manual postflight** input rehash and process-lifetime verification complete acceptance after the helper exits; the helper's success status alone is insufficient. Any unexpected binding difference stops without regeneration, substitution or retry. Actual period/callback/latency values remain unavailable until that separately approved test.

## Regression and review

The expanded offline harness passed, including native host, transport, device-free recording, original resource byte parsing, source histories, geometry, ownership, cancellation and default-ring regressions. The complete 78-file Node run passed **828 cases with zero failures and zero skips**, using the existing private genuine catalogue/NPC and nine-model gameplay inputs. The original-ring oracle retains 16 exact-original scenarios, 64 queue explorations and 69,087 checks. These groups overlap.

Independent reviewers checked component/collision source and complete WAV/source bindings, all three original resource byte roundtrips, the observed clock and callback ABI, failure cleanup, per-phase measurement/accounting, one-use worker admission and the exact candidate/proposal. Review findings and prior exploratory outputs remain preserved; guards were corrected with deterministic negative tests. The first integrated Windows PowerShell parser invocation encountered its file execution policy; the runner now uses a process-local policy for that trusted original-fixture subprocess, without changing machine policy or any operational candidate file.

[Sanitized integration evidence](../evidence/latency-03-world-02-result.json) binds final logs, measurements and independent reviews without publishing private recordings, installed assets, endpoint identities or process identifiers. CI status is reported on the draft PR. Passing offline/CI tests does not establish native event acquisition, safe complete vehicle suppression, installed-map coverage, physical power calibration or low-latency speaker output.
