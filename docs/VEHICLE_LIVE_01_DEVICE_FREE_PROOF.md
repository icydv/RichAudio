# VEHICLE-LIVE-01 device-free integration proof

The corrected V12 and supercharged V8 passed the complete production component chain on 30 October 2026. This is an offline integration result. No GTA/RPH process, WASAPI endpoint, loopback capture or listening session was started. The RPH-format evidence is authored fixture data; actual gameplay getter behavior and physical audibility remain unverified.

The executable proof uses the real `VehiclePublisher`, native vehicle/listener named pipes and validation, measured producer relay, PR #74 state adapter and original synthesizer, production acoustic worker, causal path solver, `StreamingRenderer`, RA07 transport, native `PcmRing.Fill`, and `OwnedOutputTap`. It does not replace any stage with a prerecorded loop or a separate spatial mixer. The recorder retains the exact post-gain native submissions, with complete integrity and no gaps.

Run `pwsh -NoProfile -File tools/Test-VehicleLive.ps1` from the integration checkout. Output is a fresh private `.local` directory; playback is never requested. `node --test tests/Test-VehicleLiveProof.mjs` checks the physical oracle, PCM analysis and sanitized CI exporter. CI retains only `.local/vehicle-ci-evidence/result.json`, an explicit scalar whitelist capped at 64 KiB on success or failure. Raw errors, paths, pipe/session identifiers, telemetry and PCM remain private. The portable measured result is [vehicle-live-01-device-free.json](../evidence/vehicle-live-01-device-free.json).

## Source binding and complete sequence

The final source-bound run in full offline suite 03 used source digest `0e8cc4b4e1221102e9b29d7169f370a0fcb3f001e8388d0de6bcbf0a3a3c74c7` and native fixture SHA-256 `add5aba7c4673f8ec7ddcc44725692568357e8be74faff2b74eb2c5e7dac13ff`. It includes the configurable bounded estimator API and corrected vehicle propagation labels in SoundMap and recording. The runner hashes the native fixture and all acoustic sources plus the producer, SoundMap and proof code before and after both cases, and rejects source drift during measurement. Its private source manifest contains only repository-relative paths, sizes and hashes.

Each approximately ten-second case includes idle, acceleration, increasing estimated RPM, a gear change, continued acceleration, a pass, deceleration, engine stop, explicit source removal, acknowledged vehicle transport Stop and normal host shutdown. The listener position is fixed while camera orientation changes. Source position follows a continuous authored trajectory over 83 metres with a maximum observed speed below 28 m/s. The normalized getter deliberately stays at 0.5 for both profiles, proving that the documented speed/gear estimate responds to movement even when the getter provides no variation.

The V12 accepted 123 vehicle packets and the V8 accepted 124; both kept eight separate causal component identities and preserved their generation while driving. Mechanical body, exhaust, intake, drivetrain, tyres and aero generated nonzero PCM. The V8 also generated its supercharger layer; the naturally aspirated V12 correctly left induction silent. Exhaust transients remain silent because the available observations do not establish throttle lift, fuel state or real exhaust pops. Gear transitions are synthesized without resetting phase. Source removal releases the independent histories and paths, and the captured tail settles to silence.

The exhaust was spatially separate from the body by 1.594 m for the V12 and 2.725 m for the V8. SoundMap captured the real moving component identities and positions. The actual RPH-format telemetry was retained alongside PCM, including the removal event. Both recording manifests retained `vehicle-conditional-direct`, the explicit `unobserved-space-assumed-clear` assumption and no genuine geometry, with no unrecognized propagation mode. These fixtures do not invent reflective geometry or claim a reflection comparison.

## Digital headroom and measured work

| Measurement | V12 | Supercharged V8 |
|---|---:|---:|
| Pre-host peak | 0.01468113 | 0.01310435 |
| Post-host peak | 0.00293623 | 0.00262087 |
| Pre-host RMS, complete sequence | 0.00082377 | 0.00111480 |
| Synthesis p95 | 1.409 ms | 1.512 ms |
| Acoustic worker p95 | 0.922 ms | 0.972 ms |
| Streaming DSP p95 | 0.370 ms | 0.366 ms |
| Node CPU time | 3.469 s | 3.844 s |
| Native host CPU time | 1.063 s | 0.875 s |
| Producer processing deadline misses | 2 | 2 |
| Paced device-free late wakes | 283 | 282 |
| Maximum device-free wake lateness | 16.391 ms | 15.823 ms |
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

The final direct-path rates were 0.92285–1.04433 for the V12 and 0.92275–1.04374 for the V8. The checker now enforces the stationary-listener retarded-time envelope `1 / (1 ± maximumObservedSpeed / 343)`, with a declared 0.015 allowance for finite-time observation correction. It requires both approach and recession behavior and permanently rejects both measured earlier stepping failures. This check exercises the actual worker path rates, not a separate Doppler oscillator.

## Remaining live evidence

The normalized getter is recorded as a ratio and is not used as measured crankshaft RPM. Engine speed, load and throttle are explicitly estimated; stationary revving and unsupported fuel/overrun state cannot be reconstructed from this evidence. The two original architectures produced different PCM, firing-frequency ranges and induction behavior, but perceptual distinction, level, responsiveness and stock-audio overlap require the new supervised listening test.

Playback remains additive experimental playback. The dedicated candidate requires fresh explicit authorization and reconciliation with the independently corrected acoustic stability source. This proof grants no deployment or endpoint authority and does not reuse an earlier candidate or approval.
