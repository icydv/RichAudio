# Offline 600 Hz beacon and level preparation

## Result

I've prepared an original **600 Hz harmonic beacon** and a measured higher-level candidate through the actual credit-paced streaming producer and the actual host PcmRing gain stage. This is silent offline preparation: I have not launched GTA/RPH, deployed a plugin, opened an audio endpoint, played/captured sound or created a live approval.

My selected candidate is **600 Hz fundamental, source emission level 0.44 and host master gain 0.20**. It measures **3.836814 dB higher in RMS** than the matched 95 Hz / source level 0.22 / master gain 0.12 reference. The existing defaults remain **95 Hz, source level 0.22 and host gain 0.08**. A source level is a dimensionless authored PCM amplitude, not calibrated sound pressure.

The candidate passes the tested frequency, digital headroom, deterministic continuity and lifecycle checks. It has **no listening or device acceptance**. My PR #58 feedback remains unchanged: the earlier beacon was audible without a noticed defect, but too quiet/low to judge stereo direction. These offline numbers do not establish that the new candidate is perceptually loud enough.

## Baseline and controlled decision

I started from verified open PR #58 head `be8e60c71d9c28808b2ca6b866eed7f5ff7d41b5`. Its hosted offline check passed. I created an isolated follow-on worktree/branch, preserving the previous validation branch, binaries, private evidence and consumed approvals.

Before editing I saved original synthetic PCM, metrics and fingerprints for three PR #58 fixtures: one stationary source, one turning listener and the existing bounded four-source fixture. All three Float32 fingerprints remain identical after this change. Their hashes are in `evidence/beacon-600hz-preparation.json`; the regression tests pin them independently of the new source settings.

I initially declared 600 Hz at master gain 0.20 while retaining the original source level. That pilot was **2.183786 dB lower in RMS than the 95 Hz reference**, despite the higher master gain. The 600 Hz frequency-only control at gain 0.12 was 6.620761 dB lower. I retained the negative pilot rather than describing a higher gain setting as proven higher output. Changing source frequency changes the signal's interaction with the existing filters and coherent multipath; this experiment does not isolate one acoustic contribution as the cause.

I then chose one explicit source-level increase: **0.22 to 0.44**, exactly twice the amplitude. This adds 6.020600 dB at the same frequency without changing the acoustic transfer or normalising a recording. The master gain remains the originally selected 0.20. The final source level is bounded by a validated 0..0.5 range; the existing master gain maximum stays 0.25. No parameter search, EQ, compression, added layers, playback-rate change or source relocation was used.

## Implementation

- `src/acoustics/streaming/beacon-frequency.mjs`: validates frequency 20..2000 Hz and dimensionless emission level 0..0.5; retains default constants 95 and 0.22.
- `tools/Run-Acoustics07.mjs`: accepts opt-in `--beacon-frequency-hz` and `--beacon-level` startup settings. It retains the original phase clock, harmonic weights, 10 ms emission ramp, histories and scheduler. Status/final diagnostics identify both settings. Runtime retuning is not introduced.
- `src/acoustics/host/Windows/HostProgram.cs`: validates/forwards the two optional settings and records them in results. Default values append no new producer arguments. Custom settings require the incremental harmonic source; they are rejected for known-WAV playback or other beacon types.
- `tests/host/OfflinePcmGain.cs`: a small device-free sink linked only against PcmRing and the .NET BCL. It consumes original rendered Float32 PCM through the actual ring and its gain multiplication. It links no WASAPI, capture, host entry point or GTA code.
- `tools/Prepare-Beacon600.ps1` and `tools/Measure-Beacon600.mjs`: compile that offline sink and run the production headless replay with one outstanding credit, existing framing/backpressure, source/listener observations and three scenarios. They generate fresh private WAVs, traces, hashes and measurements.
- `tools/audio/beacon-analysis.mjs`: bounded offline spectrum, envelope, schedule and WAV-conversion checks. This is analysis code, not an audio callback or replacement renderer.

The original harmonic source remains `(sin(phase) + 0.35 sin(2 phase) + 0.15 sin(3 phase)) / 1.5`. The selected one-source fundamental is 600 Hz, with intended harmonics at 1200 and 1800 Hz. Existing multi-source frequency offsets of 7 Hz per source remain unchanged; the public Windows host cap remains four sources. Only one source is selected for the proposed beacon candidate.

The source-level option changes original owned dry PCM amplitude. Master gain is applied separately by the production PcmRing. No gain is inserted into the propagation model and neither quantity is automatically adjusted at runtime.

## Reproduction and outputs

From this branch, using the established Windows .NET Framework compiler and Node environment:

```powershell
./tools/Prepare-Beacon600.ps1 -Output .local/beacon600-new
node --test tests/Test-BeaconFrequency.mjs
./tools/Build-AcousticsHost.ps1 -Tests
./tools/Test-Offline.ps1
```

The output argument must select a fresh ignored local directory. Existing/private historical outputs are not overwritten. The measurement wrapper invokes only the Node producer and the device-free PcmRing fixture; it does not run the Windows host or enumerate endpoints. No new dependency or third-party binary is required.

The final local package is under `.local/beacon-600hz-01/final-comparison/`. It contains **twelve four-second, 48 kHz stereo PCM16 WAVs**, corresponding to stationary, smooth-turn and emission-stop scenarios, with these four settings per scenario:

| Variant | Fundamental | Source level | Master gain |
| --- | --- | --- | --- |
| Previous live-test settings, synthetic replay | 95 Hz | 0.22 | 0.12 |
| Frequency-only control | 600 Hz | 0.22 | 0.12 |
| Source-level control | 600 Hz | 0.44 | 0.12 |
| Selected candidate | 600 Hz | 0.44 | 0.20 |

Example filenames are `stationary-95Hz-level-0.22-gain-0.12.wav` and `stationary-600Hz-level-0.44-gain-0.2.wav`. Matching `turn-...` and `emission-stop-...` files exercise direction changes and delayed source tails. `metrics.json`, per-source-setting traces and `LISTEN-LATER.txt` explain the package. The files were generated and inspected numerically, never opened for playback.

For later authorised listening, the two stationary files compare the complete old/new configurations. The intermediate 600 Hz files separate frequency, emission level and master gain. They are not normalised. These scenes do not represent actual airport/Legion Square geometry or reproduce a recorded live session.

The explicit candidate option suffix is:

```text
--beacon harmonic --beacon-frequency-hz 600 --beacon-level 0.44 --gain 0.20
```

This suffix documents configuration only. It is not a launch instruction, sealed deployment candidate or approval. No live package was produced.

## Measurements

All levels below are Float32 output from the actual PcmRing, before a Windows device. Four seconds means 192,000 frames per WAV. Absolute levels are retained.

| Stationary variant | Peak | RMS | Peak headroom |
| --- | --- | --- | --- |
| 95 Hz, level 0.22, gain 0.12 | 0.001807303 | 0.001144548 | 54.859 dB |
| 600 Hz, level 0.22, gain 0.12 | 0.001042356 | 0.000534067 | 59.640 dB |
| 600 Hz, level 0.44, gain 0.12 | 0.002084712 | 0.001068135 | 53.619 dB |
| 600 Hz, level 0.44, gain 0.20 | 0.003474519 | 0.001780224 | 49.182 dB |

The selected candidate's turning peak was **0.004638383**, leaving **46.672668 dB** of Float32 digital headroom. There were zero clipped or nonfinite samples and zero limiter samples. This headroom is not a sound-pressure or hearing-safety calibration.

For the same 600 Hz / source-level-0.44 signal, master gain 0.12 to 0.20 measured **4.436975 dB**, matching the amplitude-domain prediction within 0.00001 dB. Doubling emission level produces exactly twice the steady Float32 waveform in the tested homogeneous path, rather than rebuilding or normalising it.

The stationary fundamental is the **600 Hz bin** in a predefined one-second Hann-windowed spectral analysis from 1–2 seconds, with 1 Hz bin spacing and nominal half-bin quantisation uncertainty. The intended 1200/1800 Hz harmonics are distinguished from nearby off-tone bins. Independently decoded exported PCM16 also retains the 600 Hz fundamental. This is digital sample-clock validation, not hardware oscillator calibration.

Every exported WAV was read back: RIFF/PCM16 format, two channels, 48 kHz, 192,000 frames, four-second duration and bounded quantisation error passed. The stationary candidate WAV peak/RMS were approximately **0.003479110 / 0.001780935** after PCM16 rounding. Maximum conversion error was **0.00001525024**, within half an integer step plus Float32 rounding. Waveform zero crossings and quantised zero samples are not classified as gaps.

## Continuity, acoustics and controls

The non-PCM spatial schedule, including path fingerprints, identities, delays, presentation times, listener modes and startup state, is identical across each matched comparison. Both direct and finite ground-reflected paths remain present. No acoustic solver, material filter, obstruction, Doppler, interpolation, listener-control, startup-gate or worker module was changed. Existing motion/geometry/oracle tests provide the unchanged broader regression coverage.

Startup becomes ready at frame **5120** in these synthetic fixtures. The preceding intentional silent warmup is retained. The stationary candidate has **100 consecutive nonzero-energy 20 ms steady windows**, with identical minimum and maximum RMS 0.001808101. All compared producer runs reported **zero missing-history reads** and **zero limiting**.

Tests cover initially disabled emission, Start, producer emission mute/resume, emission-stop tails and terminal Stop. The original exponential emission ramp can leave extremely small nonzero tails; tests bound the late-tail energy relative to the steady window instead of incorrectly requiring mathematical zero. Producer emission mute is distinct from the host's immediate output mute, whose existing device-free terminal-mute regression remains intact. Missing/stale listener input and terminal input failure retain the same path/lifecycle schedule and exit behaviour at both frequencies.

Strict single-attempt transport, acknowledgements, acknowledged Stop, the one-use bridge, freshness/deadlines, 100 ms buffers and 50 ms prediction remain unchanged. The camera getters, WASAPI backend, gain ceiling, game integration and Bati/source-synthesis histories were not edited. Four-source checks show no path overflow or new missing history; no sixteen-source campaign was run.

## Validation, cost and limitations

Nine focused Node tests pass, including pinned default fingerprints, deterministic 600 Hz output, actual CLI rejection, spectral/WAV checks, source-level scaling, matching spatial controls, controls/tails and stale/terminal behaviour. The host suite passes **663 assertions** including the new option-validation/forwarding cases. The completed registered offline runner passes **372 Node tests, zero failures**, **71 transport cases**, existing handoff/expiry/geometry/cache/telemetry gates and the newly registered production replay/PcmRing measurement.

The final measured four-second replays took approximately **273–364 ms** of accelerated sink wall time each. DSP medians were approximately **0.042–0.049 ms per 512-frame block** across those runs. Full per-case simulation/DSP timings are retained. These are small process-level observations, with startup, worker, IPC and scheduling effects; there is no controlled performance-improvement claim, physical latency measurement, callback certification or device-reliability conclusion. The gain fixture processes at most ten seconds of bounded PCM and uses a 512-frame block and the existing bounded ring.

Public scalar evidence is `evidence/beacon-600hz-preparation.json`. Source code and fixtures are original. Generated PCM/WAVs, intermediate failed development outputs, raw traces and machine-specific logs stay ignored/private. No proprietary game audio, vendor binaries, credentials or private installation information is published. Existing reviewed historical identity exceptions remain unchanged. Final published head, draft PR and actual hosted CI checkout/tree readback are recorded in the PR.

The combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**. PR #58's transport/Stop success and incomplete directional listening outcome remain accurate. This task ends after offline publication; a later audible/device/GTA experiment requires separate review and approval.
