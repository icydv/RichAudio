# VEHICLE-LIVE-01 device-free integration proof

The corrected V12 and supercharged V8 passed the complete production component chain on 30 October 2026. This is an offline integration result. No GTA/RPH process, WASAPI endpoint, loopback capture or listening session was started. The RPH-format evidence is authored fixture data; actual gameplay getter behavior and physical audibility remain unverified.

The executable proof uses the real strict `StatePublisher` and `VehiclePublisher`, native vehicle/listener named pipes and validation, measured producer relay, PR #74 state adapter and original synthesizer, production acoustic worker, causal path solver, `StreamingRenderer`, RA07 transport, native `PcmRing.Fill`, and `OwnedOutputTap`. It does not replace any stage with a prerecorded loop or a separate spatial mixer. The recorder retains the exact post-gain native submissions, with complete integrity and no gaps.

Run `pwsh -NoProfile -File tools/Test-VehicleLive.ps1` from the integration checkout. Output is a fresh private `.local` directory; playback is never requested. `node --test tests/Test-VehicleLiveProof.mjs tests/Test-VehicleNativeDiagnostics.mjs` checks the physical oracle, PCM analysis, sanitized CI exporter and actual native startup behavior after the fixture has been built. CI retains only `.local/vehicle-ci-evidence/result.json`, an explicit scalar whitelist capped at 64 KiB on success or failure. It preserves native exit, stage, acknowledgement, age and transport counters before lifecycle assertions, including missing or unreadable diagnostic files. Raw errors, paths, pipe/session identifiers, telemetry and PCM remain private. The portable measured result is [vehicle-live-01-device-free.json](../evidence/vehicle-live-01-device-free.json).

## Source binding and complete sequence

The final source-bound run after the strict-listener fixture correction used source digest `01c5561d34820c871f315d89e94f237a283acc3c8722d0e23a635de49fc56138` and native fixture SHA-256 `1382a93b99e047e8d5f72a419b520805bd72424d8976986d92062d66f377d756`. It includes the configurable bounded estimator API, corrected vehicle propagation labels in SoundMap and recording, and bounded native failure diagnostics. The runner hashes the native fixture and all acoustic sources plus the producer, SoundMap and proof code before and after both cases, and rejects source drift during measurement. Its private source manifest contains only repository-relative paths, sizes and hashes.

Each approximately ten-second case includes idle, acceleration, increasing estimated RPM, a gear change, continued acceleration, a pass, deceleration, engine stop, explicit source removal, acknowledged vehicle transport Stop and normal host shutdown. The listener position is fixed while camera orientation changes. Source position follows a continuous authored trajectory over 83 metres with a maximum observed speed below 28 m/s. The normalized getter deliberately stays at 0.5 for both profiles, proving that the documented speed/gear estimate responds to movement even when the getter provides no variation.

The V12 and V8 each accepted 124 vehicle packets and 158 listener packets; both kept eight separate causal component identities and preserved their generation while driving. Mechanical body, exhaust, intake, drivetrain, tyres and aero generated nonzero PCM. The V8 also generated its supercharger layer; the naturally aspirated V12 correctly left induction silent. Exhaust transients remain silent because the available observations do not establish throttle lift, fuel state or real exhaust pops. Gear transitions are synthesized without resetting phase. Source removal releases the independent histories and paths, and the captured tail settles to silence.

The exhaust was spatially separate from the body by 1.594 m for the V12 and 2.725 m for the V8. SoundMap captured the real moving component identities and positions. The actual RPH-format telemetry was retained alongside PCM, including the removal event. Both recording manifests retained `vehicle-conditional-direct`, the explicit `unobserved-space-assumed-clear` assumption and no genuine geometry, with no unrecognized propagation mode. These fixtures do not invent reflective geometry or claim a reflection comparison.

## Digital headroom and measured work

| Measurement | V12 | Supercharged V8 |
|---|---:|---:|
| Pre-host peak | 0.01436380 | 0.01447253 |
| Post-host peak | 0.00287276 | 0.00289451 |
| Pre-host RMS, complete sequence | 0.00081904 | 0.00110758 |
| Synthesis p95 | 1.365 ms | 1.454 ms |
| Acoustic worker p95 | 0.830 ms | 0.867 ms |
| Streaming DSP p95 | 0.256 ms | 0.268 ms |
| Node CPU time | 3.312 s | 2.781 s |
| Native host CPU time | 0.594 s | 0.438 s |
| Producer processing deadline misses | 2 | 3 |
| Paced device-free late wakes | 283 | 283 |
| Maximum device-free wake lateness | 16.010 ms | 16.203 ms |
| PCM underflow frames | 0 | 0 |
| Limited / clipped / nonfinite samples | 0 | 0 |
| Affected source-history frames | 0 | 0 |

Vehicle rendering uses a fixed 0.35 renderer gain, zero beacon trim and 0.20 native host gain. The guard rejects any nonfinite, limited or over-0.5 pre-host block before publication; it does not normalize or boost the engine. The measured peaks are digital headroom evidence for this scenario, not SPL or listening-level calibration. No +12 dB beacon profile is inherited.

A separate 12-case near-source calibration matrix complements the complete-chain proof. `tools/Measure-VehicleLiveCalibration.mjs` uses the original synthesizer, independent component emitters, existing `CausalSimulation` and `StreamingRenderer`. For each profile it places the listener 0.01 m from the mechanical, exhaust or intake component in the existing authored direct and analytic tunnel scenes. Each case runs 72 blocks with redline/full-load requests, 100 m/s component excitation, three gear changes and an explicitly authored lift. Source poses stay stationary to isolate digital level; those controls are stress inputs, not purported GTA observations. This matrix does not stand in for the native transport/recording proof.

The matrix measured a maximum pre-host peak of **0.06860984**, leaving **17.252 dB** below the 0.5 ceiling at the fixed 0.35 gain. Up to 100 actual finite paths contributed, with zero limiter activity. Three processing deadline misses occurred in the initial case, whose maximum work time was 14.322 ms. GPU work and physical SPL were not measured. This is a bounded stress matrix rather than proof of every possible geometry or operating state; the runtime ceiling remains enforced. [Portable calibration evidence](../evidence/vehicle-live-01-calibration.json) records the method and all twelve cases; `tests/Test-VehicleCalibration.mjs` repeats the matrix as part of the offline suite.

The direct-only scene selected the CPU path with zero GPU dispatches or GPU results applied. There was no geometry visibility workload to accelerate, so this result is not a GPU throughput measurement. The cold-start processing misses and scheduler wake lateness remain visible; zero underflow does not prove WASAPI timing under GTA load. CPU measurements include the test instrumentation and recording work.

## Source-motion fault found and corrected

The initial broad pipeline checks passed, but a closer physical audit found a receding path rate of 0.8254 even though the source never exceeded 28 m/s. That was excessive for a stationary listener. An initial change to audio-frame prediction improved the minimum only to 0.8428; those first two runs are historical diagnostics, not accepted physical-motion results.

The corrected source keeps one fixed relationship between observation QPC time and the audio frame clock for its lifetime. It interpolates genuinely timestamped poses, predicts at most 100 ms without adding a fixed buffer, and uses independent wall-clock age for the unchanged 250 ms freshness limit. New packet arrivals no longer reset that timing relationship.

The final direct-path rates were 0.92344–1.04396 for the V12 and 0.92346–1.04483 for the V8. The checker now enforces the stationary-listener retarded-time envelope `1 / (1 ± maximumObservedSpeed / 343)`, with a declared 0.015 allowance for finite-time observation correction. It requires both approach and recession behavior and permanently rejects both measured earlier stepping failures. This check exercises the actual worker path rates, not a separate Doppler oscillator.

## Hosted failure and listener-fixture correction

Hosted CI run `40978952924` at head `bf2b1a643753a75fffbfb0aa64ebf13cb2bdb94d` ended when the V12 native fixture returned exit 1. Its retained artifact lacked native diagnostic fields, so the historical cause cannot be recovered. The local full suite had passed before that hosted run; that does not establish hosted success.

A separate deterministic probe demonstrated a fixture defect: the old manual listener sender required ACK 1 even when the unchanged strict receiver correctly returned startup-discard ACK 2 for an observation over 250 ms old. The permanent native regression injects a 350 ms first-observation delay. The old sender fails at ACK 2; the proper same-connection sequence receives ACK 2 and accepts a fresh observation with ACK 1, with one startup discard and zero rejected observations. This reproduction does not identify the earlier CI failure's cause.

The normal fixture now uses the actual strict production `StatePublisher`, starts after actual host readiness, and waits for an acknowledged listener before publishing vehicle evidence. A second native regression delays the first encode by 350 ms: the unchanged publisher expires that unsent observation, sends a fresh one on its single connection, and stops deliberately. No codec warm-up, reconnect, widened freshness limit or production policy change is used. Eight focused checks passed, including partial, unreadable, malformed and oversized diagnostics and preservation of exact scalar failure counts. Both complete-chain profiles then passed with one listener connection, deliberate shutdown, zero transport rejections and zero underflow. Current hosted validation is reported on [PR #75](https://github.com/icydv/RichAudio/pull/75).

## Remaining live evidence

The normalized getter is recorded as a ratio and is not used as measured crankshaft RPM. Engine speed, load and throttle are explicitly estimated; stationary revving and unsupported fuel/overrun state cannot be reconstructed from this evidence. The two original architectures produced different PCM, firing-frequency ranges and induction behavior, but perceptual distinction, level, responsiveness and stock-audio overlap require the new supervised listening test.

Playback remains additive experimental playback. The dedicated candidate requires fresh explicit authorization and reconciliation with the independently corrected acoustic stability source. This proof grants no deployment or endpoint authority and does not reuse an earlier candidate or approval.
