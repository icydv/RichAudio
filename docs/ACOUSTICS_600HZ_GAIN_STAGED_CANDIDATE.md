# 600 Hz audition-level GTA candidate — offline preparation

## Decision

I've prepared an explicit, opt-in level-matching stage for the original beacon that I could hear **"loud and clear"**, with confirmed left/right movement in the prerecorded turning clip. That feedback applied to the **+24 dB audition copies**, not the original PR #59 output. Comfort and artefacts were not independently described.

The new candidate matches those files' **pre-device digital level** within 0.004 dB in the two matched fixtures. It is not bit-identical because the audition had two PCM16 rounding steps. It has not been played, opened through an endpoint or validated in GTA. Windows SoundPlayer and the live WASAPI application can have different mixer gains/processing; their physical loudness equivalence remains unverified.

No GTA/RPH launch, plugin deployment, game-installation mutation, playback, audio capture or live approval occurred during this preparation. The new private review package records exact artifact hashes, fixed invocation, dependencies and a read-only installation baseline. It is a candidate for separate review, not an executable approval.

## Explicit gain staging and limits

The audition was produced by exporting the PR #59 signal through source level 0.44 and master gain 0.20, then applying a fixed **+24 dB = 15.8489319246×** boost to the PCM16 export. Folding that into the old master setting would require approximately **3.169786**, exceeding the existing **0.25** ceiling. I have not increased or bypassed that ceiling.

The candidate's pipeline is:

```text
Original 600 Hz harmonic source, emission level 0.44
→ unchanged propagation, filters, delays, stereo and startup gate
→ explicit fixed +24 dB audition trim, checked against a 0.5 pre-master peak ceiling
→ unchanged PcmRing and WASAPI master gain 0.20 (existing maximum 0.25)
→ owned output, initially muted
```

This new digital trim is deliberately declared; it is not source SPL calibration or an acoustic-model change. It performs a flat multiplication, adds no filter/delay/normalisation/limiter, and can only be selected at startup. Its default is **0 dB**, with a bit-transparent disabled branch. Existing frequency, source-level and master defaults remain **95 Hz / 0.22 / 0.08**.

The only enabled profile is **one harmonic source, synthetic open-road scene, 600 Hz, source level 0.44, required listener input, 100 ms spatial buffer, experimental orientation OFF**. The Windows host additionally requires **master gain 0.20**, initially muted startup, no automatic control exercise, no known-WAV mode and no capture. Other trim values and incompatible configurations are rejected. This is not a general high-gain source mode.

Every enabled 512-frame block is checked in full before any sample is changed or published. A nonfinite value or post-trim Float32 sample above absolute **0.5** rejects the block and terminates the producer; it is never clipped, silently attenuated or retried. The profile also refuses previously limited renderer output. Prior valid queued PCM can remain until existing bounded host shutdown; this preparation does not claim a measured physical emergency-mute latency. Strict transport failures retain their existing immediate mute/stop path.

At the fixed master setting, the pre-master ceiling bounds final PCM near **0.1** full scale, subject only to Float32 rounding. This is a digital ceiling, not a hearing-safety calibration. PcmRing's unity input validation and 0.25 master bound, and the WASAPI gain bound, remain unchanged.

## Implementation and preservation

- `src/acoustics/streaming/beacon-output-trim.mjs`: the fixed-profile validator and bounded two-pass trim. It allocates no per-block sample buffers and retains bounded counters/peaks.
- `tools/Run-Acoustics07.mjs`: validates `--beacon-output-trim-db`, applies the stage after existing DSP/startup/mandatory silence, before Float32 packet publication, and exports trim diagnostics. No state history, event timing, source identity, path or filtering rule changes.
- `src/acoustics/host/Windows/HostProgram.cs`: validates/forwards the exact profile and records trim dB. Disabled trim adds no producer argument. The endpoint backend and controls are unchanged.
- `tools/Prepare-BeaconLiveCandidate.ps1` / `tools/Measure-BeaconLiveCandidate.mjs`: device-free comparison using the real credit-paced producer and actual PcmRing fixture.
- `tools/audio/pcm-ring-replay.mjs`: shares the existing PcmRing replay helper with the PR #59 measurement tool; the old WAV fingerprints remain reproducible.
- `tests/Test-BeaconOutputTrim.mjs`: six focused tests for disabled/default fidelity, profile scope, atomic peak/nonfinite rejection, actual CLI rejection, gain-once semantics and preserved lifecycle behaviour. Host tests add nine profile checks.

The three pinned default PCM fingerprints still match. Acoustic solver/DSP, scene geometry, material handling, Doppler, listener history, startup gate, simulation worker, both 100 ms buffers, 50 ms prediction, camera getters, protocol freshness/deadlines, unsent-expiry handling, strict one-attempt transport and acknowledged Stop are unchanged. The public host cap remains four sources; the enabled trim profile is narrower at one source. Bati and source-synthesis work remain separate.

## Independent audition comparison

The measurement reconstructs the old producer→actual PcmRing 0.20→PCM16→integer +24 dB→PCM16 recipe separately from the new stage. Reconstructed reference SHA-256s must match the **actual auditioned files**:

| Reference | SHA-256 |
| --- | --- |
| Stationary +24 dB | `1A395EE8C25D56DF68A39DF4582573BFE54060FC47B7C9E478C3EE9240920EF5` |
| Turning +24 dB | `B7522B74E515CA404F765B68659B2B7EE0186A9D3792EA40E6CF3855129D8549` |

The new producer's trimmed Float32 PCM passes through the actual device-free PcmRing with master gain 0.20. Comparison uses corresponding frames without time shifting, fitted gain, normalisation or discarded inconvenient regions. The declared maximum sample-error bound is `(15.8489319246 + 1) / (2 × 32767) + 1e-7 = 0.000257202145`; the first term covers the reference's two rounding steps and the second allows Float32 arithmetic. The predeclared RMS-level tolerance is 0.1 dB. Neither bound was widened after results.

| Measurement | Stationary | Turning |
| --- | --- | --- |
| Frames / rate / channels | 192,000 / 48 kHz / 2 | 192,000 / 48 kHz / 2 |
| Candidate peak | 0.055067420 | 0.073513411 |
| Candidate RMS | 0.028214654 | 0.028215190 |
| Reference RMS | 0.028225592 | 0.028216040 |
| RMS-level difference | -0.00336649 dB | -0.000261454 dB |
| Maximum sample difference | 0.000255425 | 0.000256963 |
| Difference RMS | 0.000127836 | 0.000138257 |
| Candidate peak headroom | 25.1821 dB | 22.6727 dB |
| Pre-master peak | 0.275337100 | 0.367567062 |
| Missing history / rejected trim blocks / limiting | 0 / 0 / 0 | 0 / 0 / 0 |

The measured fundamental remains the **600 Hz bin** in the predefined one-second analysis. All matched non-PCM spatial and lifecycle schedules are identical. The spectral analysis retains the earlier 1 Hz bin spacing and nominal half-bin quantisation uncertainty; it is not hardware clock calibration.

A separate six-second, 120-observation synthetic full-yaw sweep uses the existing **native-orientation-only-in-synthetic-scene** path. It passes without native positions being interpreted as metres: pre-master peak **0.389289320**, final peak **0.077857867**, RMS **0.028368960**, and peak headroom **22.173950 dB**. Clipped samples, nonfinite samples, missing history and rejected trim blocks are all zero. This is a bounded yaw test, not proof that every possible camera/world configuration is safe; the runtime ceiling remains authoritative.

## Reproduction and checks

```powershell
./tools/Prepare-BeaconLiveCandidate.ps1 -Output .local/beacon-live-match-new
node --test tests/Test-BeaconOutputTrim.mjs tests/Test-BeaconFrequency.mjs
./tools/Build-AcousticsHost.ps1 -Tests
./tools/Build-BeaconBridge.ps1 -SdkPath <authentic-pinned-SDK-path>
./tools/Test-Offline.ps1
```

The measurement entry point links the offline sink only against PcmRing and the .NET BCL. It does not run HostProgram or enumerate/probe/open a device. It creates four private original WAVs (two reconstructed audition references and two candidate equivalents), raw Float32 intermediates, traces and scalar results in a fresh ignored directory. No audio is played. The local package is `.local/audition-match-01/measurement/`; scalar public evidence is `evidence/beacon-600hz-audition-match.json`.

The completed local registered runner passes **378 Node tests, zero failures**, **672 host assertions**, **71 transport cases**, and the inherited handoff/expiry/geometry/cache/telemetry gates. The authentic pinned-SDK bridge compiles. Production builds exclude the expiry-test/baseline defines. Final hosted CI and its actual checkout/tree relationship are recorded in the draft PR. No new dependency or licence is introduced.

The two matched four-second candidate replays took roughly 273–278 ms of accelerated sink wall time; their median DSP work including the trim was approximately 0.0452–0.0455 ms per 512-frame block. These are bounded offline observations, not an isolated overhead comparison or device/audio-thread certification.

## Concrete review candidate and proposed later test

The private review package binds the actual new host/bridge binaries, runtime source commit, dependency hashes, current target build, fixed invocation and baseline to a fresh sealed manifest. No approval receipt, deployment journal, launch token or host-start token is created by this task. Previous approvals remain consumed and cannot authorise this candidate.

The fixed option suffix is:

```text
--scene open-road --beacon harmonic --sources 1
--beacon-frequency-hz 600 --beacon-level 0.44 --beacon-output-trim-db 24
--gain 0.20 --seconds 120 --device default --listener-pipe
```

It requires the real bridge input, initially muted with emission disabled. There is no autostart, fallback listener, experimental orientation, audio capture or native GTA sound ownership. The selected default endpoint has not been opened/probed here. The private review contains the exact executable invocation and proposed 26 temporary additions/reversible executable-selection rename; **none has been executed**.

A later separately approved test should allow one launch, bridge activation, host and strict connection. First confirm live console visibility, acknowledgements and valid listener state, then enable the fixed beacon once. Judge startup, camera-driven direction and continuity without changing gain/mixer settings. Begin bridge Stop early enough to target 45–60 host seconds, never wait for chat feedback while that timer runs, and retain the before-90-second operational limit and 120-second caps. Any terminal failure ends that attempt; normal shutdown and independent installation restoration remain mandatory. No native audio changes or world mutations are proposed.

The audition accepted audibility and prerecorded left/right movement, not GTA responsiveness, live continuity or physical gain-path equivalence. Experimental orientation remains OFF; ACOUSTICS-05 + BENCHMARK-01 remains **60%**. This task stops at the concrete review candidate, without a live approval or execution.
