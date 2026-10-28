# Offline streaming continuity and responsiveness

I've reproduced and corrected a startup defect through the actual ACOUSTICS-07
producer without opening a Windows audio endpoint. My strict ACOUSTICS-07.3 GTA
validation remains **PENDING / NOT EXECUTED**. This increment earns no live-test
credit; ACOUSTICS-05 + BENCHMARK-01 remains **60%**.

## Scope and preserved baseline

Base: PR #50, `2631b01e0c77ed404610b130b3e6a19e010f9551`, open and unmerged
when inspected. This branch uses a separate worktree. The earlier candidate's
private evidence, sealed deployment and binaries were not rebuilt or replaced.
PR #49's qualified listening result remains historical evidence; it does not
validate PR #50's corrected strict transport.

No GTA/RPH launch, deployment, archive access, endpoint opening, playback,
capture, Windows audio-setting changes or PC interaction occurred. The previous
supervised-test prompt was superseded and was not executed. No new approval
receipt was created. No source-synthesis or Bati code changed.

## Actual implementation

- `tools/audio/headless-stream.mjs` spawns the real `Run-Acoustics07.mjs` process,
  its simulation worker and streaming DSP. It validates RA07 magic, sequence,
  frame count, flags and finite stereo PCM; one outstanding credit bounds the
  pipe and preserves backpressure. It never constructs the C# Windows host.
- An explicit `--headless-clock audio` seam maps the receipt clock to produced
  frames for deterministic accelerated replay. Normal host timing still uses
  the monotonic wall clock. No future observation is sent: each receipt is
  quantised to the next 512-frame boundary, and its actual age is passed through
  the existing envelope validator. This is a synthetic clock model, not a
  measured operating-system IPC latency distribution.
- `CausalSimulation.update` now publishes known source-generation identities
  even when listener input is unavailable. Geometry, source motion, delays,
  interpolation, rate limits and path calculations are unchanged.
- `StartupGate` keeps output silent until current paths have matching PCM
  history. It applies a 480-frame / 10 ms linear output fade once ready.
  History writes and the output clock continue while priming. The 120,000-frame
  deadline is checked at the next block boundary (at most 512 frames later);
  failure ends the producer rather than leaving it indefinitely muted.
  Intentional idle before Start does not consume that deadline. A separate
  delayed-Start regression protects the existing muted-host workflow.
- A listener-driven Windows host now passes `--listener-input required`.
  It cannot expose the synthetic fallback before receiving listener input.
  Generation changes re-prime; ordinary missing observations do not reset clocks.
  Synthetic host operation still supports its original internal listener.
- Optional `--history-diagnostics yes` adds fixed numeric counters for negative
  history, future reads, frame-tag mismatch, generation mismatch, zero-weight
  unavailable taps and affected output frames. Trace records join block-level
  deltas to priming, buffer warmup, generation change, path change, valid steady
  state, unavailable input and emission-tail phases. Path identities and the
  final terminal error distinguish retirement and shutdown. There are no
  per-sample strings or retained per-sample records. Detailed tracing is opt-in.
- `ListenerPlayout({delayMs})` accepts only 100, 75 or 50. Its default remains
  **100 ms**; prediction remains **50 ms**, freshness **250 ms**. Smaller buffers
  are producer-only experimental options, not new host defaults.

The public Windows host cap remains four sources. The transport, RPH camera
getters, acknowledgements, single connection/activation permit, failure mute,
Stop handshake and deadlines are unchanged. Renderer generation-reset tests use
independent renderer instances or isolated producer sessions; they do not rearm
a strict live bridge.

## Reproducible baseline and cause

The deterministic original fixtures use the existing 95 Hz harmonic beacon,
48 kHz stereo, 512-frame blocks, original metre-scale open-road geometry, one
direct path and one finite ground reflection. Source gain, geometry and seeds
are shared across all three policies. No recording is independently normalised.

Twelve fixtures cover stationary playback, a smooth yaw, a 90-degree observation
change, 12/40/22/32 ms arrival jitter, two missing 20 Hz observations, a longer
expired interval, pause/resume, isolated generation/session replacement, emission
stop, controlled producer Stop, unexpected producer failure and late first
listener input. Each regular observation is 50 ms apart. A separate real local
named-pipe regression suite checks acknowledged transport Stop and failure mute;
the headless producer's control Stop alone is not a transport acknowledgement.

Before correction, the late-first-listener case produced sound, then a
low-envelope interval at **0.24–0.30 s**, then sound again. Normal first-listener
warmup also accumulated **5,654** unavailable history taps. The old simulation
returned no source-generation identity while its listener was unavailable.
The DSP therefore tagged genuine new PCM with its previous generation. Once
paths appeared, those tags did not match the requested generation.

The historical diagnostic reproducer retrieves PR #50's original producer and
simulation using Git, applies the deterministic receipt clock and bounded trace,
and attaches the instrumented DSP. All twelve WAV SHA-256s match the baseline
saved before correction. In the late-listener fixture, all **5,654** misses were
weighted **generation-tag mismatches**, affecting **1,428 output frames**, with
first/last affected frames **13,824 / 15,251** (0.288–0.317729 s). There were no
negative, future or frame-tag misses. Fade-out during listener warmup and this
subsequent invalid-history region both contributed to the measured envelope gap.
This is a synthetic reproduction, not attribution of PR #49's IPC rejection.

After correction, all 36 fixture/policy combinations had **zero history misses**
and no clipped samples. The late-listener case had one deliberate initial silent
region, through approximately 0.28 s with the 100 ms policy, followed by playback
without another low-envelope interval. A missing required listener stops at
output frame **120,320** with a visible priming-deadline error and no submitted
audio. History identity is preserved; no observation or source sample is invented.

Steady-state output was already continuous in the valid baseline. This fix
improves startup and generation establishment; it does not claim to repair a
previously demonstrated steady-state dropout. Deliberate stale/pause silence and
generation replacement remain distinct from continuity defects.

## Measured responsiveness and continuity tradeoff

Directional response is measured from PCM using `(rightEnergy-leftEnergy) /
(rightEnergy+leftEnergy)` in fixed, non-overlapping **20 ms** windows. The step
metric is the first window exceeding absolute balance 0.5 after the changed
observation at 1.500 s. Receipt occurs at **1.525333 s** in all policies. Windows
are reported as intervals, not as exact transition instants; their centre has
±10 ms resolution, in addition to the 10.667 ms control-block quantisation.
No fitted offset or post-hoc alignment is applied.

| Presentation policy | PCM half-balance window after observation | After receipt | Missing-update low-envelope interval |
| --- | --- | --- | --- |
| 100 ms reference | 80–100 ms | 54.7–74.7 ms | None |
| 75 ms experimental | 60–80 ms | 34.7–54.7 ms | 1.60–1.62 s |
| 50 ms experimental | 40–60 ms | 14.7–34.7 ms | 1.58–1.62 s |

The existing observation interpolation spreads the declared 90-degree change
between the 1.45 and 1.50 s observations. Consequently this half-balance result
is not a measurement of an ideal instantaneous angular impulse delayed by
exactly the nominal buffer duration. Control is sampled by the simulation
worker before the same block is rendered. The steady source already has PCM
history; listener rotation changes arrival panning rather than adding another
source-to-listener propagation delay.

For the predefined smooth yaw `0.9*sin(2*t)`, stereo-balance RMS error relative
to the current requested orientation was **0.1304 / 0.1030 / 0.0836** at
100/75/50 ms. Relative to the corresponding delayed presentation trajectory,
error was **0.0185 / 0.0192 / 0.0283**. These are dimensionless balance errors,
not angular degrees. The finite ground-reflection arrival direction and existing
pan smoothing also contribute. No angular prediction was introduced.

Orientation age at presentation is the configured delay for interpolated poses;
predicted poses retain their last observed orientation, adding the reported
prediction interval to that age. The evidence records these ages separately
from newest-observation age. The short-gap fixture used **5 / 5 / 144** predicted
blocks respectively; all prediction remained within 50 ms. At 50 ms, ordinary
20 Hz delivery also needs prediction more often. The gap spans observations at
1.50 and 1.55 s, producing a 150 ms spacing between its adjacent observations.
No freshness or prediction bound was relaxed to bridge it.

**Decision:** I am retaining 100 ms. The lower policies improve measured
pre-device response but lose continuity in this supported missing-update case.
They remain opt-in experiments pending actual device/game validation.

These results include observation, quantised receipt, presentation target,
worker control and PCM response clocks. Physical direct time of flight remains
**10/343 = 29.154519 ms**; ground reflection remains **29.731892 ms**, an extra
**0.577373 ms**. This is separate from listener buffering, worker execution,
output queuing and hardware/headset latency. The headless sink measures none
of the latter device latency components.

## Safety, tails and physics checks

Emission stop at the first block at/after 2 s retains delayed source sound;
output is negligible after the source ramp and propagation tail. It is not an
emergency mute. Terminal producer failure ends submission; the unchanged C#
host/transport tests verify immediate owned-output mute/stop on transport failure.
Clean acknowledged Stop is tested separately from malformed/truncated EOF.

The extended tests also run the actual producer's internal synthetic flyby
without a future trajectory or external listener. A Hann-windowed spectral peak
is checked against retarded-time radial-velocity frequency predictions within
0.7 Hz, using 0.1 Hz search steps. Zero-crossing counts were unsuitable for this
multi-path waveform; they can count interference-induced crossings as pitch.
The prior independent streaming/offline geometry, delay and Doppler regressions
remain the numerical reference. No new subjective listening PASS is possible.

## Headless performance

Eight accelerated 15-second runs use both instrumentation orders, with the same
PCM hash for diagnostics on/off. The producer still performs bounded worker
simulation and DSP; the sink grants exactly one block at a time. This is not a
Windows callback benchmark or a wall-clock IPC latency measurement.

| Workload | Steady DSP median per 512 frames | DSP p95 | Simulation median | End RSS |
| --- | --- | --- | --- | --- |
| 1 source / 2 paths, four runs | 0.0410–0.0417 ms | 0.0507–0.0518 ms | 0.0526–0.0545 ms | 69.2–70.8 MiB |
| 4 sources / 8 paths, four runs | 0.1860–0.2287 ms | 0.2261–0.2785 ms | 0.1449–0.1493 ms | 86.0–87.1 MiB |

Instrumentation changed one-source medians by less than 0.001 ms; four-source
order effects exceeded any consistent instrumentation cost. I make no speedup
claim. Startup DSP is reported separately in the machine-readable evidence.
The owned DSP arrays use **2,881,152 / 11,524,608 bytes** for one/four sources;
the instrumentation holds only a fixed counter object. Per-object allocations
and GC pauses were not measured with a managed allocation profiler.

Two wall-clock-paced, two-second replays tested one and four sources; DSP maxima
were **1.5268 / 2.0883 ms**, with no missing history. Their receipt clock remains
synthetic, even though packet pacing waits on wall time. A separate accelerated
**60-second / 5,625-block**, four-source run took **3.654 s wall / 4.187 s process
CPU**, with DSP median **0.1866 ms**, p95 **0.2253 ms**, max **8.7582 ms** and
simulation median **0.1377 ms**. It had zero missing history and zero limiting.
End RSS was **108.6 MiB**. These end snapshots are not peak memory or proof of
no allocation growth: timing arrays, trace retention and GC are bounded but
still consume memory. No sixteen-source or audio-device stress test was run.

## Reproduction and outputs

From this branch's repository root, with Node available:

```powershell
node tools/Measure-OfflineContinuity.mjs .local/my-continuity-baseline --baseline
node tools/Measure-OfflineContinuity.mjs .local/my-continuity-candidate
node tools/Profile-OfflineContinuity.mjs .local/my-continuity-profile
node --test tests/Test-OfflineContinuity.mjs
./tools/Test-Offline.ps1
```

Every destination must be fresh, ignored and under `.local`; linked parent
paths and overwrite attempts are rejected. Historical reproduction needs PR
#50's full commit available locally; normal current-branch rendering/tests do
not require its Git object or any private recording. `--baseline` retrieves
original source into a private diagnostic directory, never rewrites history.

The completed run saved the original baseline under `.local/continuity-baseline/`,
its matching diagnostic reproduction under `.local/baseline-reproduced/`, and
the **36 candidate WAVs** under `.local/continuity-final/`. For example:

- `startup-100.wav`: corrected late-listener startup.
- `step-100.wav`, `step-75.wav`, `step-50.wav`: matched directional comparison.
- `short-gap-100.wav`, `short-gap-75.wav`, `short-gap-50.wav`: continuity tradeoff.
- `emission-stop-100.wav`: source ramp and delayed tail.

`*-trace.json` and `metrics.json` accompany the WAVs. Profiling is in
`.local/continuity-profile-final/profile.json`. All PCM is original synthetic content,
generated silently and **never played**. Files remain ignored; only original
code, tests and sanitised scalar evidence are published. No licence was selected
and no new dependency or vendor binary was added.

## Validation and preservation

The new focused suite has **16 tests**. Existing producer/playout/causal tests
previously passed **86 tests** during development. The registered offline suite
passed **348 Node tests**, **645 host assertions**, **63 local transport cases**
and the existing geometry/cache/telemetry/configuration/file regressions. After
adding the idle-deadline guard, only affected producer/playout/continuity tests
were rerun: **58/58 passed** (including all sixteen new tests). Hosted CI runs
the complete final registration. Source/transport isolation is checked against
PR #50, not inferred from successful silent PCM.

Preservation covers **590 private files** across the previous ACOUSTICS-07
private/build trees and the ACOUSTICS-06 final demonstration directory, with no
link targets followed. This includes the sixteen historical WAVs and the earlier
candidate binaries. All 590 fingerprints matched after testing. The new worktree does not write to other research branches
or the GTA installation. No live-test approval or binary was silently replaced.
The acoustic engine/geometry, bridge, transport and production telemetry files
are byte-identical to PR #50. Git object integrity passes. Publication screening
found zero findings in the complete staged index; the five previously reviewed historical
GitHub committer identity exceptions are preserved, not new defects.

## Publication and next decision

Branch: `improve/acoustics-offline-continuity`, stacked on PR #50. Publication
and exact-head hosted CI are completed as a separate gate; a passing local test
alone does not fulfil that gate.

The next decision is to review this primed 100 ms candidate for a separately
authorised strict-transport device/GTA validation. That test is not requested or
executed here. Offline continuity and responsiveness evidence do not establish
device reliability, audible acceptance or physical headset latency.
