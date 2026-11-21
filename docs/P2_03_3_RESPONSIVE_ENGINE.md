# P2-03.3: responsive stock-source research prototype

26 October 2026. Stacked on open PR #16 / `ae710742779cd61c38357c82b5d9812bf8fe65bb`; main reviewed at `e5fbd8f3502d3e28169a224caa07471e090e368f`. Earlier PRs remain unmerged. Original references, telemetry/schema, RPM validation, game integration and accepted renderers remain unchanged.

## Decision

**PARTIALLY: I've built synthetic control for holds, slow rises/falls and multiple states, but my listening gate FAILED.** The attempted scheduler is a functional, repeatable research implementation; it is not a convincing sustained engine. I am not promoting any new output to an accepted replacement or claiming that a complete RPM/load synthesiser exists.

Listening notes, in first person:

- Initial five-second hold: **usable, with some repetition**.
- Revised hold after a diagnostic guard correction: **still obviously artificial and obviously repetitive**.
- Slow sweep: **the moving sections and hold are a little artificial, though better than before**.
- Multiple holds/transitions: **artificial during transitions too**.

No further subjective tuning or presence effects followed those results. The current examples explicitly record partial/perceptually failed status. The accepted 19.322-second demonstration and P2-03.2's successful bounded excerpt remain the stronger references.

## Implementation and supported controls

Original `tools/audio/responsive-engine.mjs` is separate from the accepted source renderer. It reuses `cycleSchedule`, PCM validation and bounded sinc interpolation. `Render-ResponsiveEngine.mjs` reads the existing private source manifest plus its extraction metadata, verifies the two deceleration WAV fingerprints against both records, and requires 48 kHz mono PCM16-derived data. No new extraction, parser invocation, dependency or external audio engine is needed.

Nominal synthetic state **0–1 maps linearly to marker-state 14–28**. This range is not assumed from a filename: preparation revalidates the actual contiguous decreasing branches, component pairing, source margins and compatible output-rate coverage at 101 nominal points. Every scheduled cycle is checked again. Unsupported coverage or traversal stops the render; this grid is not a proof of every possible trajectory.

These coordinates are not physical RPM. Zero is not engine-off/idle; one is not calibrated redline. Throttle, load, gear and ignition are not fabricated. Both rising and falling controls use the same deceleration-family cycle bank, always reading forward inside each source cycle. Rising input selects earlier/higher-state source regions rather than reversing waveform samples. This does not model an acceleration load condition.

Control timelines require finite increasing timestamps, finite bounded states, 1–15 seconds of output, at most 64 points, and maximum smoothstep derivative **0.25 normalised units/second**. Actual sweep/step examples peak at 0.225. A common cumulative fractional sample clock chooses cycle length; rounding is carried forward rather than resetting drift each cycle. Both component outputs occupy exactly the same sample interval. Control is sampled at cycle boundaries, so response within a cycle is not sample-by-sample or live-runtime certified.

The scheduler selects nearby prevalidated engine/exhaust **pairs**, rather than independent elapsed-file positions. Requested-state error per component is capped at 2%, paired-state disagreement at 2%, read speeds at **0.95–1.05**, and source-index steps at three records per component. At constant input, a deterministic adjacent walk varies compatible original cycles without adding pitch/gain modulation. This walk is an approximation and has a demonstrated short recurrence; it is not Rockstar's native randomisation law.

There is one engine contribution and one exhaust contribution per sample. Estimated **96-sample / 2 ms convex joins** use the previous source continuation and new interval with weights summing to one. No unbounded grain overlap, old 80 ms window method, reverb, EQ, compression or bass enhancement is used. Common 25 ms file-edge fades are for presentation only.

The preferred research preset retains master 0.2, exhaust gain 0.75 and **engine multiplier 0.35**. Each scenario also writes an unchanged-engine-gain comparison from the same synthesis. This preference is scoped to this Bati research prototype, not all vehicles or a calibrated native mixing rule. Independent engine/exhaust stems remain available. More low-frequency physical presence, radiation and world acoustics remain future requirements; none is claimed here.

## The rejected guard and bounded correction

Version 1 screened a source's natural adjacent-sample step at each marker against a raw 0.1 threshold. Its hold rejected 105 screened choices and used 76 fallbacks, and the sweep stopped before any output was written. The private failure record identifies **output frame 165,228**, synthetic state **0.597884**, marker-state **22.370382**, candidate pair 32.

At that point, the engine's natural adjacent step was **0.148320**, but the same cycle's closure gap was only **0.028364**; exhaust values were **0.021618 / 0.008785**. The former measures an existing waveform derivative, not the discontinuity introduced by selecting another source interval. Rejecting it as a splice error biased the source pool and falsely blocked a valid numeric transition. The initial hold and failed-sweep diagnostic are preserved privately.

Version 2 measures the **new interval's first sample versus the previous source's natural continuation**, using their respective read rates. A raw mismatch >0.25 rejects that candidate; the scheduler tries another locally compatible pair, otherwise stops before writing output. At the first cycle, the same check assesses a cycle's own closure. This corrects the metric instead of relabelling natural derivatives as artificial discontinuities. A negative-control test distinguishes a smooth periodic waveform with a steep adjacent derivative from a truly mismatched splice.

All three actual version-2 scenarios needed **zero rejected choices and zero fallbacks**. This is only numerical acceptance. The revised hold was heard and rejected; fixing the guard did not establish better sound quality. There was no attempt to hide the remaining defect with additional smoothing or attenuation.

## Actual scenarios and measurements

| Scenario | Authored control | Frames / cycles | Preferred peak / RMS | Listening |
|---|---|---:|---:|---|
| A hold | Normalised 0.5, marker-state 21, 5 s | 240,000 / 105 | 0.145264 / 0.065925 | Artificial and repetitive |
| B sweep | 0.2 → 0.8 → 0.2 with short holds, 12 s | 576,000 / 244 | 0.154236 / 0.067058 | Moving and held sections still somewhat artificial |
| C multiple states | 0.2 → 0.5 → 0.8 → 0.5 with holds, 14 s | 672,000 / 299 | 0.154205 / 0.065884 | Artificial during transitions too |

All outputs are **48 kHz mono PCM16**, with zero clipped/nonfinite samples, no silent 20 ms windows and exact frame counts. Engine/exhaust and both balances are aligned. No audible-click clearance is claimed merely because numerical bounds passed.

| Diagnostic | A | B | C |
|---|---:|---:|---:|
| Read-speed range | 0.983815–1.007874 | 0.976920–1.021351 | 0.979822–1.021351 |
| Max paired-state error | 0.402% | 0.821% | 0.821% |
| Max requested-state error | 1.638% | 1.919% | 1.919% |
| Max source-index step | 2 | 2 | 2 |
| Max raw join mismatch | 0.077519 | 0.146466 | 0.146466 |
| Distinct source pairs used | **3** | 50 | 48 |
| Interior 200 ms RMS CV | 0.773% | 7.717% | 6.949% |

RMS windows exclude 100 ms at each file edge. Variation in B/C includes intended state changes and is not itself a pumping diagnosis. Window smoothness and stable periods are not perceptual acceptance.

### Confirmed short recurrence

The revised steady hold's source-pair/rounded-cycle-length sequence repeats every **14 cycles**. At the authored marker-rate of 21, that is **32,000 samples / 0.666667 seconds**. Comparing 198,400 interior PCM samples against that lag gives **zero differing samples and zero RMS difference**. This is a directly measured periodic scheduler/output limitation, not a speculative diagnosis from a spectrogram.

Only three local source pairs are available to this hold's selected walk. Its deterministic turning rule and fractional-clock pattern combine into this short repeat. That explains a concrete source of repeated texture, though it is not proven to account for every perceived artificial feature. Merely changing a seed or concealing recurrence with random pitch is not a validated correction. No such tuning was attempted after the listening rejection.

Independent 0.5-second autocorrelation windows at 1, 2, 3 and 4 s show high marker-period correlation (~0.980–0.982). Their strongest retained candidate is ~10.499 Hz, a subharmonic relative to the authored 21 marker coordinate. Harmonic/period ambiguity is retained; that peak is not called crankshaft RPM or a uniquely recovered physical fundamental. Additional waveform windows cover the sweep/transition midpoints. The numeric signal is clearly controlled and strongly periodic, yet the listening result is still a failure of naturalness.

The whole B/C schedule does not repeat globally because the control moves; that does not imply that its held subsections or joins are free of repetition. Joint source-state matching stayed within the prior bounds, but natural phase/timbre through repeated cycles and direction changes is not established.

## Performance, integrity and private pack

Initial version-2 renders took **74.800 / 159.698 / 190.795 ms** for A/B/C; independent repeats took **73.415 / 164.981 / 185.279 ms**. Preparation took approximately 32–34 ms per first run. Render timers exclude source preparation, WAV encoding, metering and disk writes. Recorded process RSS was ~73.1 / 97.6 / 106.0 MB, not isolated renderer allocation or certified peak memory. Whole-process CPU figures are recorded separately.

Scheduled interpolation calls, including boundary screening/continuation blends, were **501,228 / 1,201,848 / 1,405,180**. Each uses the existing bounded 24-tap interpolator. The source bank, candidate scan, controls, allocation lengths and cycle count are bounded; cost does not scale with total archive size. Repeated rendering is byte-identical for all **12 scenario WAVs** on this local setup. A faster-than-duration offline render is not real-time callback, thread-safety or latency certification.

Each private scenario directory contains:

- `engine.wav`: engine stem at the preferred preset gain.
- `exhaust.wav`: separate exhaust stem.
- `mix_exhaust_led.wav`: heard primary preview.
- `mix_reference_gain.wav`: unchanged engine gain, same scheduler; prepared but not separately auditioned.
- `analysis.json`: source hashes, controls, timings and bounded source/cycle schedule.

`Analyse-ResponsiveEngine.mjs` creates a **new** private numeric report with RMS, independent period candidates, schedule/PCM recurrence and correspondence metrics. It does not play or modify audio. Stock-derived diagnostic reports and detailed schedules stay private.

Reproduce with the existing P2-03 private inputs and a new destination for each command:

```powershell
node tools/Render-ResponsiveEngine.mjs .local/audio-reconstruction/decoded-final/source-manifest.json examples/responsive-engine-scenarios.json A_hold .local/audio-reconstruction/NEW-hold
node tools/Render-ResponsiveEngine.mjs .local/audio-reconstruction/decoded-final/source-manifest.json examples/responsive-engine-scenarios.json B_sweep .local/audio-reconstruction/NEW-sweep
node tools/Render-ResponsiveEngine.mjs .local/audio-reconstruction/decoded-final/source-manifest.json examples/responsive-engine-scenarios.json C_steps .local/audio-reconstruction/NEW-steps
node tools/Analyse-ResponsiveEngine.mjs .local/audio-reconstruction/NEW-hold .local/audio-reconstruction/NEW-hold-diagnosis
# Explicit local playback only; CI never invokes an audio device:
.\build\audio\PlayPrivatePreview.exe .local\audio-reconstruction\NEW-hold\mix_exhaust_led.wav
```

The original manifest/metadata, twelve source WAVs, 19.322-second accepted reference, rejected grain demo, earlier isolation/balance candidates and P2-03.2 previews remain fingerprint-matched. No installed archive was opened, so no new archive-integrity claim is made. All output paths remain under ignored private storage; source/output reparse checks, path containment, no-overwrite, size and fingerprint guards are retained. No game/RPH launch, game write, plugin deployment, new dependency or endpoint capture occurred.

## Tests and next decision

Eighteen new original-fixture tests cover analytic signal periodicity, constant/rising/falling/multiple controls, derivative limits, actual domain endpoints, corrupt metadata, sample format, exhaustion, rate/state matching, natural-derivative versus splice-mismatch controls, local fallback/stop, source immutability, deterministic PCM, component addition/headroom, known short-loop detection, source hashes and existing/unprotected/reparse output rejection. The local suite passed these plus **12 cycle tests, 8 deceleration tests, 19 stock-audio tests, 8 extraction/publication guards, 15 ownership tests, 65 core assertions, 35 drivetrain assertions, 17 parser tests, 3 diagnostic-analyser tests, 122 Phase 1 checks, 9 configuration assertions and 8 append expectations**. Hosted CI is reported separately. Tests certify those mechanics, not realistic sound; the known repetition is detected rather than disguised by a passing test.

**Next: one controlled steady-hold ablation that removes the measured 14-event recurrence while holding source material, requested pitch, gain and joins fixed.** It would test a specific known scheduling limitation; it would not guarantee naturalness. Phase-continuous state-local texture and the adequacy of the small compatible source bank still require listening. Do not automatically perform that experiment here or expand to a generic engine.

Wider state coverage, actual physical RPM, throttle/load response, real shift events, native per-instance ownership and real-time audio remain unsupported. Natural sustained source playback must pass before propagation or presence effects could justify further integration. No Phase 3 work is authorised or implemented. Public code and synthetic fixtures contain no Rockstar audio, private paths, proprietary binaries or extracted metadata blobs; no licence is selected.
