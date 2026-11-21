# Offline camera-orientation presentation experiment

## Baseline and frozen rules (declared before candidate rendering)

I've verified PR #51 at `5e7d15fa452954e438545d5e1bb535b6a628aab5`, open,
unmerged and clean. This experiment is isolated on
`experiment/acoustics-orientation-presentation`. No live prompt is executed.

I compare exactly two policies: the unchanged 100 ms spatial/orientation
reference and an opt-in 50 ms orientation presentation applied to that SAME
100 ms spatial solution. No position, velocity, path, rate, delay, gain,
filter or PCM-history calculation may change in an ordinary paired block.
The path's own world-space arrival direction is projected onto the selected
listener right vector. The existing 10 ms pan smoothing remains unchanged.

Selection occurs before posting each simulation-worker request. Only already
received observations participate. I freeze that selection across the await;
new same-generation observations wait for the next block. A new generation,
representation, invalid/paused observation or expired freshness at completion
invalidates the selected presentation. It cannot mix new orientation with old
paths. Terminal checks still prohibit submission after shutdown.

The faster history uses existing validated playout with a 50 ms target, 50 ms
prediction ceiling and 250 ms receipt freshness. Prediction holds orientation;
there is no angular extrapolation. Faster data must match the buffered
session, generation, coordinate pair and listener identity. If unavailable,
I use buffered orientation only while that buffered state remains valid.
Diagnostics retain its actual target/time/age and label fallback. Unavailable
spatial state cannot be rescued by a newer orientation. No new handover or
smoothing is included in the initial candidate.

The frozen matrix reuses PR #51 fixtures: fixed orientation, step and smooth
yaw at 0/4/8 ms observation phase offsets, regular 20 Hz and fixed arrival
jitter, missing/expired input, pause/invalid, isolated replacement, emission
tails, Stop/failure and startup. Added cases cover rapid valid reversals,
angle wrap using continuous basis vectors, equivalent-pose coalescing,
monotonic turning across missing updates, buffered moving-listener position,
an urban reflection whose direction differs from direct sound, and four
sources. A controlled asynchronous generation/invalid race is checked
separately; independent test instances do not rearm strict transport.

Acceptance is frozen before candidate measurements:

- Disabled PCM fingerprints must match the saved PR #51 fixtures. Fixed
  orientation must match exactly or have maximum float error <= 1e-8,
  attributable only to equivalent basis arithmetic.
- Across ALL three step phases, the candidate's half-balance window centre
  must lead by more than 30.667 ms (20 ms analysis window plus one 512-frame
  control block). Windows remain fixed at 20 ms, with no fitted offsets.
- Smooth-yaw RMS balance error to the current authored trajectory must be
  lower at all three phases; arrival pan stays bounded and correctly signed.
- No new history misses, clipping, unexplained startup silence or extra
  unavailable spatial blocks. Non-pan controls must be identical.
- During the monotonic static-arrival fallback case, a newly introduced
  backward target-pan step larger than 1e-6 is a software rejection. This is a
  numerical monotonicity criterion, not a human click/audibility threshold.
  Report actual smoothed/PCM behaviour as well as target changes. Correctly
  reached freshness limits may still require silence and the existing dip.
- Session/generation isolation, invalid precedence, emission tails and
  terminal lifecycle checks must hold. No subjective acceptance is possible.

A negative result completes the experiment. I will not tune thresholds,
search delay values or silently enable the candidate in the Windows host.

## Implementation

`orientation-presentation.mjs` owns one bounded 50 ms `ListenerPlayout`, fed
the same already validated messages as the original 100 ms instance. It reuses
the existing interpolation, validation, coalescing, prediction and freshness
rules. It never extrapolates angles. Selected interpolation/held state is
frozen before the worker request and paired with that request's context and
frame. The actual world-space `arrivalDirection` is carried from the existing
solver into streaming control; no reference solver mathematics changed.

`Run-Acoustics07.mjs --experimental-orientation 50ms` is explicitly opt-in and
rejects a non-100 ms spatial buffer. The Windows host does not pass this flag;
no live candidate or deployment package was created. Normal reference PCM
still uses the solver's original pan. The candidate computes
`clamp(dot(arrivalDirection, unit(cross(forward, up))), -1, 1)` for each path.
All existing fractional PCM cursors, propagation rates, gains, filters and
10 ms pan smoothing remain unchanged.

At handoff, the candidate rechecks the captured context against current
session/generation/representation, validity and freshness. It also rechecks
the original selection's receipt freshness: newer valid messages cannot
refresh an old frozen selection. A raced invalidation suppresses that owned
PCM block after DSP advancement; it does not reuse another generation's
orientation, reset source playback or invent geometry. This is an explicit
lifecycle exception to presentation-only processing, tested separately from
the ordinary paired cases. Terminal shutdown still prevents block submission.
Ordinary spatial unavailability follows the original path-release behaviour;
faster orientation cannot rescue a stale or missing path.

Diagnostics record selection policy, held/interpolated mode, contributing
observation sequences, generation, mapped observation times, receipt-clock
times, target and actual orientation time, age, spatial target, selection
frame, worker handoff time and fallback intervals. Session IDs, raw camera
coordinates and payloads are not logged. Detailed per-block diagnostics are
opt-in; counters and timing arrays remain bounded by existing duration caps.

The real simulation worker is used throughout. A headless-only, single-frame
barrier holds an actual worker result before DSP handoff to inject generation,
invalid-state or Stop messages. It is limited to one configured block, has a
500 ms deadline and requires explicit virtual-clock/trace flags. It is not a
new live transport command or an alternative scheduling policy.

## Software verdict: PASS, with a held-orientation tradeoff

All **24 paired cases** pass the frozen software criteria. All **24 disabled
WAV fingerprints** match the baseline saved before implementation from PR #51.
The candidate's fixed-orientation float PCM is **bit-identical**, stronger than
the predeclared 1e-8 tolerance. All normal A/B blocks have identical non-pan
control fingerprints, including source generations, path identities, emission
frames, rates, arrival directions, distances, delays and spectral gains.

| Observation phase | Reference window after observation | Candidate window after observation | Reference / candidate after receipt |
| --- | --- | --- | --- |
| 0 ms | 80–100 ms | 40–60 ms | 54.7–74.7 / 14.7–34.7 ms |
| 4 ms | 76–96 ms | 36–56 ms | 54.7–74.7 / 14.7–34.7 ms |
| 8 ms | 72–92 ms | 32–52 ms | 44–64 / 4–24 ms |

The half-balance window leads by **40 ms in all three phases**, exceeding
the frozen 30.667 ms distinguishability rule. For all phases, the physical PCM
windows are reference **1.58–1.60 s** and candidate **1.54–1.56 s**. These are
window measurements, not exact onset timestamps. The step observations occur
at 1.500/1.504/1.508 s; quantised receipts occur at 1.525333/1.525333/1.536 s.
The selected target reaches those observation times at reference
1.600/1.610667/1.610667 s and candidate 1.557333/1.557333/1.568 s.

As in PR #51, interpolation spreads the declared turn across adjacent 50 ms
observations. Therefore the half-balance window can begin before the selected
target fully reaches the changed observation. Every contributing observation
was already received; this is not future telemetry. No recordings were
shifted, level-normalised or fitted to each other.

Smooth-yaw balance RMS error against the current authored trajectory fell
from **0.13037 / 0.13041 / 0.13045** to **0.08356 / 0.08365 / 0.08370** across
the three phases (approximately 36% lower). The trajectory is evaluated at
`0.9*sin(2*(t-phase))`; the 20 ms energy window's centre is used. These are
dimensionless stereo-balance errors, not angular degrees or listening scores.
The faster policy's median orientation age is about **51.3 ms**, with maxima
of **88–89.3 ms** under the fixed jitter pattern. Predicted positions never
become angular extrapolation: orientation is explicitly held at its real
observation time.

There is a measurable cost: the jittered turn has **194 held-orientation
blocks**, versus none in the reference. Maximum target-pan block step rises
from **0.01920** to **0.08190**, and maximum smoothed block step from
**0.01919** to **0.05393**. Rapid-turn smoothed block steps are also larger
(0.1590 versus 0.0846). No pan exceeds [-1,1], no left/right inversion or new
monotonic fallback reversal is observed, and the existing smoother remains
stable. This coarser movement may be perceptible; no human or device test
establishes its acceptability. The software PASS is not a sound-quality PASS.

## Fallback, missing input and continuity

In the monotonic missing-update case, faster orientation is unavailable for
**five blocks / 53.333 ms**, from **1.557333 to 1.610667 s**. The valid buffered
orientation is used with its actual older timestamp; its age can reach
**150 ms**. Both policies then reach the same spatial prediction-expired
block, **1.610667–1.621333 s**. Neither policy keeps that spatial path alive.
Fallback introduces **zero backward target-pan or smoothed-pan step** in the
declared monotonic interval. No extra handover or smoothing was needed.

For a 50 ms orientation target plus the unchanged 50 ms prediction allowance,
prediction expiry ordinarily occurs only once the 100 ms target has reached
the newest observation. Both orientations then hold the same latest basis.
This explains this fixture's safe fallback; it is not a proof for arbitrary
observation gaps, future generation changes or all camera movements.

There are **zero history misses and zero clipped samples** across the 48
rendered A/B cases. Startup ready frame/time matches in every pair, normally
frame **5,120 / 106.667 ms**. Low-envelope and spatial-unavailability intervals
match in each pair, including pauses and longer expired gaps. The fixed
short-gap A/B PCM is identical, preserving PR #51's approximately 25%
short-window envelope dip. It is not hidden by holding stale paths or changing
their gains. Multipath stereo redistribution changes expected PCM in turning
scenes; it is not classified as a missing-history defect.

Emission stop retains the original delayed tail. Fixed-orientation emission
stop and failure outputs are identical between policies. In the controlled
Stop-during-handoff test, output ends at frame **73,728 / 1.536 s**, with no
later block submitted. Real endpoint queues and hardware mute latency are
outside this observation. Strict transport acknowledgements, one-use permits,
deadlines, no-reconnect behaviour and host terminal mute remain unchanged.

## Acoustic and lifecycle preservation

The path solver, original ACOUSTICS-06 renderer, geometry/cache, source
generation/priming logic, RPH camera getters, strict transport, Windows backend,
exact-build guards and Bati/source-synthesis branches are unchanged. The sole
causal-control addition carries the solver's existing arrival direction.
Every path's panning is tested independently, including real finite urban wall
reflections whose bearings differ substantially from the direct arrival.

The existing acoustic regressions still check direct/ground timing,
attenuation, material losses, obstruction and moving-source Doppler. The
paired controls prove unchanged rates and PCM-history reads for this experiment,
including a moving-listener case. Direct travel remains **10/343 seconds**;
newer presentation orientation does not add or remove acoustic distance.

Asynchronous tests cover frozen same-generation observations, new generation,
new session, invalid/paused input, stale selections despite fresh later input,
wrong control frame/context and Stop before submission. Ordinary input
validation, near-180-degree rejection and equivalent-pose coalescing remain
intact. These tests never reconnect or rearm a failed strict bridge.

## Bounded overhead

Eight six-second accelerated runs use one/four sources in reference/candidate/
candidate/reference order. All consume the actual framed, credit-paced producer
with one outstanding credit. Each has 563 blocks; no sixteen-source test or
new stress campaign is involved. Detailed tracing is enabled in both policies.

| Workload | Extra orientation work, median | Orientation p95 | DSP median | End RSS |
| --- | --- | --- | --- | --- |
| One source, reference | none | none | 0.0421–0.0422 ms | 68.4–68.6 MiB |
| One source, candidate | 0.0135–0.0137 ms | 0.0271–0.0274 ms | 0.0417–0.0420 ms | 68.9–69.3 MiB |
| Four sources, reference | none | none | 0.1888–0.1926 ms | 77.6–78.6 MiB |
| Four sources, candidate | 0.0163–0.0164 ms | 0.0296–0.0297 ms | 0.1887–0.1916 ms | 78.5–78.7 MiB |

Maximum measured orientation work was **0.4298 ms**. Simulation medians remain
about 0.063 ms for one source and 0.150–0.153 ms for four. Small DSP differences
are scheduling/JIT noise, not a speedup claim. Owned DSP arrays remain
2,881,152 / 11,524,608 bytes; the experimental playout adds at most 128 retained
observations and bounded control records. RSS is end-of-run, not peak memory
or an allocation-profiler result. No real-time callback or device guarantee is
inferred from accelerated replay.

Virtual receipt/selection/handoff clocks are tied to PCM frames and therefore
do not include worker wall time. Worker execution and process wall/CPU timings
are recorded separately. A real producer uses the original monotonic receipt
clock and revalidates freshness at handoff. These results are not GTA, headset
or physical state-to-ear latency measurements.

## Reproduction and private package

Run from the repository root with the existing Node/.NET development setup:

```powershell
node tools/Measure-OrientationPresentation.mjs .local/new-orientation-reference --baseline
node tools/Measure-OrientationPresentation.mjs .local/new-orientation-comparison
node tools/Measure-OrientationOverhead.mjs .local/new-orientation-overhead
node --test tests/Test-OrientationPresentation.mjs
./tools/Test-Offline.ps1
```

All destinations must be fresh ignored `.local` paths; existing outputs and
linked parent paths are rejected. `--baseline` selects only the disabled
reference. The checked-in original synthetic fingerprints independently verify
its correspondence with the PR #51 baseline saved before implementation.

This run's baseline is `.local/orientation-baseline/`; full paired output is
`.local/orientation-final/` with 48 PCM16 48 kHz stereo WAVs plus private traces,
configuration and metrics. The smaller `.local/orientation-listening-package/`
contains ten WAVs: step, smooth turn, monotonic fallback, reflected turn and
fixed short-gap pairs. `LISTENING-GUIDE.txt` explains comparisons for later.
The files were generated silently and never opened or played. They are local
PC files; access from a phone is not assumed and no listening is requested.
Profiling is `.local/orientation-overhead/overhead.json`.

Original code, synthetic fingerprint fixtures and sanitised scalar evidence
are public. WAVs, raw traces, private paths, identities, approvals and binaries
remain private. No new runtime dependency or project licence was added.

## Verification and publication

The focused orientation suite passes **14 tests**, including the complete
24-case paired matrix and actual worker-result handoff tests. The required
registered offline suite passes **363 Node tests**, **645 host assertions**,
**63 local transport cases** and existing geometry/cache/telemetry/configuration
and file regressions. All **883 protected file fingerprints** match after
testing; Git object integrity passes. Publication screening and exact-head
hosted CI are separately recorded in the draft PR. The default host/capture test constructors do not open devices; their
Start-after-Dispose cases throw before starting a thread. The optional actual
device-starvation test is not invoked.

The protected baseline inventories **883 private/build files**, including
previous candidate binaries and historical audio. No symlink targets are
followed. Publication checks preserve the five previously reviewed historical
GitHub identity exceptions; they are not new defects or permission to rewrite
history.

The draft PR is stacked on PR #51. Its description records the exact commit
and hosted CI readback. If CI reports a generated merge revision, its tested
tree must be compared with the candidate instead of assuming exact-head tests.

## Decision and remaining limits

I've established a reproducible software responsiveness improvement without
changing spatial history or native/game audio. I am keeping the experiment
**disabled by default**, including in the Windows host. Faster held orientation
is a real tradeoff requiring later device and listening evaluation; no physical
head-tracking, HRTF, game-scale calibration or live reliability claim follows.

The previous supervised prompt remains unused. Strict GTA validation remains
**PENDING / NOT EXECUTED**. ACOUSTICS-05 + BENCHMARK-01 remains **60%**. No live
approval is created, reused or requested by this experiment.
