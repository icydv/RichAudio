# P2-03.4 — Controlled cycle-order recurrence experiment

**Result: PARTIAL, 26 October 2026.** I heard the unchanged five-second hold followed by the candidate and found **B less repetitive but still artificial**. Numerical recurrence reduction passed; natural sustained-engine acceptance did not. I stopped the stock-audio experiment at that gate. No sweep, new seed, parameter search, effects or replacement source bank followed. The default remains the reference implementation.

This work is stacked on open P2-03.3 checkpoint `9d108d54510268ab6a33c93aa490701527531138`; previous PRs were not merged. It uses existing private decoded Bati-traced `v_twin_2` material only. There was no GTA/RPH launch, archive access, game-directory write, dependency installation or audio upload. It does not solve live RPM, native suppression, source ownership or Phase 3.

## Why the reference repeats exactly

`cycleSchedule` prepares one exhaust interval nearest in marker-state to each engine interval on the decreasing **14–28** branch, enforcing paired-state and rate bounds. The responsive renderer filters those fixed associations against requested state, rounded cycle length, traversal and splice bounds. At held normalised input **0.5**, requested marker-state is **21**, not physical RPM. Three pairs survive: bank indices **36, 37, 38**.

The reference starts at nearest engine state 37, then uses a bounded adjacent walk. Its turning test is `((imul(k + 1, 1664525) + 1013904223) >>> 0) % 7 === 0`, with zero-based event index `k`. During these 105 events there is no 32-bit overflow. Modulo seven the expression reduces to **(2k + 5) mod 7**, so the extra reversal occurs at **k congruent to 1 mod 7**. Combined with reflection at the three-pair bounds, it produces the observed **14-event selection period**. This finding is specific to this pool/test extent, not a universal long-run period for every state.

The shared fractional clock advances by **48,000 / 21 = 16,000 / 7** samples. Rounded lengths repeat every seven events (2,285 or 2,286 frames). Selection and length patterns align after **14 events = 32,000 frames = 0.666667 seconds**. Reproduction before and after the change matches all four historical hold WAV hashes. The actual interior PCM, independently in each stem and both mixes, has **zero differences across 198,400 samples** at that lag.

## Available, eligible and selected material

These counts concern the two decoded **deceleration** recordings, not all vehicle layers.

| Quantity | Engine | Exhaust |
|---|---:|---:|
| Physically available adjacent marker intervals | 173 | 154 |
| Inside existing 14–28 branch | 70 | 60 |
| Individually compatible with state 21 and both rounded lengths | 4 | 5 |
| Component intervals in the three eligible nearest-state pairs | 3 | 3 |

The branch excludes 103 engine and 94 exhaust intervals. Within it, 66 engine and 55 exhaust intervals fail this hold's requested-state/rate combination. **70** nearest-state pairs are prepared for the whole branch; **67** fail the hold gates. Both schedulers already select all **three** surviving pairs, screen 315 choices and reject **zero** for stitching. Reordering cannot add unique recorded material to this fixed pool.

| Pair | Engine / exhaust source index | Mean marker states | Original lengths, frames |
|---|---|---|---|
| 36 | 106 / 93 | 21.258568 / 21.343925 | 2,275 / 2,249 |
| 37 | 107 / 95 | 21.031433 / 21.051951 | 2,275 / 2,277 |
| 38 | 108 / 96 | 20.826275 / 20.891971 | 2,304 / 2,297 |

Individually eligible engine 109 is associated with exhaust 98 under the nearest-state rule. That exhaust's state **20.510170** is 2.333% below requested 21, correctly failing the 2% gate despite engine 109 qualifying independently. Exhaust 94 and 97 qualify individually without appearing in the selected nearest-pair bank. There are **15** combinations satisfying simple state/rate bounds among the four/five intervals. These are not fifteen validated replacements: alternative associations have not passed a separate pairing/perceptual investigation. Introducing them would change a second variable. No thresholds or associations were widened.

The [numeric evidence](../evidence/publication/cycle-recurrence.json) records all nine individually eligible intervals' coordinates, durations, rates, RMS/peak/DC envelopes, remaining margins and independent nearby period estimates, plus the three selected pairs. Positions remain inside the source files. Selected raw engine RMS is **0.1856–0.1956**, exhaust **0.4383–0.4482**. Nearby half-second autocorrelation windows give marker-neighbourhood peaks around **20.86–21.36 Hz**, with different correlations by component. Those overlapping windows span several original cycles: they do not establish combustion fundamental, physical RPM, phase identity or interchangeability. Numerical compatibility is distinct from perceptual validity.

## The single changed variable

Explicit research mode **`recent-seeded-v1`** orders the existing eligible pairs using **xorshift32**, fixed nonzero seed **20261026**, and one draw per event. It chooses among pairs other than the immediately preceding pair, retaining that previous pair last as a safety fallback. A singleton remains available without a retry loop. With three pairs, avoiding both previous pairs would itself force a three-pair permutation, so this test remembers one.

The policy has a 512-event bound, at most 1,024 supplied candidates, no rejection sampling, seed search or uncontrolled randomness. Identical inputs/seed reproduce all four candidate WAVs. Synthetic tests change the seed and independently check the fixed state/timing/rate constraints. Complete schedules remain private. Omitted research settings retain the old algorithm and PCM.

Everything else stays fixed: 48 kHz mono; five seconds/240,000 frames; 105 shared events; state 0.5; mapping 14–28; recordings/pair associations; forward read-rate rules and interpolation; **96-frame/2 ms convex joins**; 25 ms edge fades; engine base gain 0.2 and multiplier **0.35**; exhaust gain 0.15; unchanged-engine-gain comparison. Each output frame has one intentional engine and one exhaust contribution apart from existing bounded continuation blends. No delay, inversion, pitch modulation, noise, EQ, compression or spatial effects were added.

## Rendered-output measurements

`Analyse-CycleRecurrence.mjs` examines PCM independently of schedule IDs. Bounded KMP anchor matching checks **every integer lag from one sample through 96,000 samples/two seconds**, then verifies possible matches across the complete interior, excluding 100 ms at each edge. Both actual searches finish without reaching the anchor cap. Degenerate/capped searches explicitly report incompleteness. Absence of exact periods does not establish absence of near-repetition, longer periods or perceptual defects.

| Measurement | Reference A | Candidate B |
|---|---:|---:|
| Global schedule period within tested event sequence | 14 events | None found |
| Exact interior PCM lags through two seconds, all four outputs | 32,000; 64,000; 96,000 | None found |
| Distinct pairs | 3 | 3 |
| Counts for 36 / 37 / 38 | 30 / 53 / 22 | 33 / 35 / 37 |
| Unique 14-event ID strings / 92 windows | 14 | 91 |
| Most frequent seven-event ID string | 22 occurrences | 4 occurrences |
| Mean interval between pair reuse | 0.141923 s | 0.141923 s |
| Immediate same-pair reuse | 0 | 0 |
| Preferred RMS / peak | 0.065925 / 0.145264 | 0.065628 / 0.145264 |
| Interior 200 ms RMS coefficient of variation | 0.773% | 0.776% |
| Read-speed range | 0.983815–1.007874 | 0.983815–1.008315 |
| Max requested / component state error | 1.638% / 0.402% | 1.638% / 0.402% |
| Max component source-index step | 2 | 3 |
| Max raw splice mismatch | 0.077519 | 0.084204 |
| Rejected choices / fallbacks | 0 / 0 | 0 / 0 |

Order changes which original interval occupies a 2,285-versus-2,286-frame event; the read-speed **rule** remains identical. Output clock/requested state match at every event. Larger candidate index steps and splice mismatch remain within existing limits, without proving inaudibility. Both outputs have zero clipping/nonfinite samples and zero silent 20 ms windows. No independent normalisation was applied.

At the old lag, B has **115,438 differing preferred-mix samples**, RMS difference **0.010688** and normalised correlation **0.986845**. Engine correlation is **0.789318**, exhaust **0.995841**. Strong near-periodicity remains, especially in the exhaust. Independent half-second mix analyses at seconds 1–4 retain a nearest marker-period peak at **2,286 samples / 20.9974 Hz**: B correlation 0.9746–0.9809, A 0.9799–0.9819. This supports stable relative periodicity, not physical RPM. Harmonic periodicity alone is not a defect.

Short motifs remain: B has six distinct two-event strings, with a maximum of 25 occurrences, and one 14-event string occurs twice. This differs from a globally repeated waveform. Longer identifier sequences do not mean more unique material, reduced average reuse or natural sound.

## Listening and stopping decision

The local player completed both preferred previews successfully. **My comparison: “Less repetitive but still artificial.”** I did not separately confirm clicks, wandering or ghosting; their absence must not be inferred. B's separate engine/exhaust WAVs were rendered but not auditioned in this comparison. The unchanged-gain mix has no new listening acceptance.

The natural-hold gate failed, so **the optional stock sweep was not rendered or played**. No second seed/candidate or subjective tuning followed. Numeric repeats verify determinism/timing only. B does not replace the accepted 19.322-second reference, P2-03.2 excerpt or default renderer.

Decision **2**: recurrence improved, but artificiality remains; investigate the cycle model before another synthesis experiment. This proves an avoidable scheduler recurrence existed and its removal was insufficient. The pool is small, but does **not** prove the original assets as a whole insufficient. Missing native granular semantics, cycle interpretation, phase continuity, repeated stitching, alternative pairing and component texture remain hypotheses. The next useful step is a read-only comparison of marker/group semantics and continuous source material, not further randomisation or effects. No new milestone/runtime test starts here.

## Preservation, performance and tests

Twelve original decoded WAVs, **46 historical WAVs**, manifest and metadata match their existing fingerprints before and after work. All four default WAVs still match PR #17, and all four candidate WAVs match an independent repeat. A wholly original synthetic fixture also matches PCM from the unmodified PR #17 renderer. Private material/schedules/logs remain ignored; no game files were accessed.

Timed repeats: A **32.785 ms preparation / 73.253 ms render**, including **3.042 ms** scheduling/boundary checks; B **32.360 / 74.188 ms**, including **3.100 ms** scheduling. Render excludes WAV encoding, metering and disk writes; scheduling excludes sample synthesis. Process RSS **74,952,704 / 74,637,312 bytes** is not renderer allocation/peak memory. Whole-process user/system CPU: **79/31 ms** A, **63/31 ms** B. Initial pre-instrumentation renders: A 74.893 ms, B 75.970 ms. These single offline observations are not a statistical benchmark or audio-thread certification.

**Ten new synthetic tests pass**, covering legacy recurrence, independent PCM period search and negative controls, capped/silent inputs, bounded deterministic selection, singleton exhaustion, bad settings, historical default PCM, fixed clock/state/rates and independently recomputed joins/gains/separation. The full suite also passes: 18 responsive, 12 cycle-evidence, eight deceleration, 19 stock-audio, eight extraction/publication guards, 15 ownership, 65 core assertions, 35 drivetrain assertions, 17 metadata-parser, three diagnostic-analysis, 122 Phase 1, nine configuration and eight append-semantics checks. CI is separate from local execution/listening and never requires stock assets. No third-party dependency or public licence was added.

Publication review covers twelve explicitly staged source/documentation/metadata files: zero index-screening findings, two valid JSON documents and fourteen valid local documentation links. Whole-history screening retains four pre-existing identity-review flags; manual inspection confirms the same GitHub service committer on already published commits, without new sensitive-content findings. This is a reviewed exception, not an automated all-clear. Git integrity passes with the same harmless dangling objects. Private paths, recordings, exact schedules and helper binaries remain excluded. Production telemetry and accepted source renderers are unchanged.

## Private reproduction

Use existing P2-03 private inputs and a **new destination** on every command. These repository-relative paths refer to ignored local work, not published recordings.

```powershell
node tools/Render-ResponsiveEngine.mjs .local/audio-reconstruction/decoded-final/source-manifest.json examples/responsive-engine-scenarios.json A_hold .local/audio-reconstruction/new-recurrence-A
node tools/Render-ResponsiveEngine.mjs .local/audio-reconstruction/decoded-final/source-manifest.json examples/recurrence-hold.json A_hold .local/audio-reconstruction/new-recurrence-B
node tools/Analyse-CycleRecurrence.mjs .local/audio-reconstruction/new-recurrence-A .local/audio-reconstruction/new-recurrence-analysis-A
node tools/Analyse-CycleRecurrence.mjs .local/audio-reconstruction/new-recurrence-B .local/audio-reconstruction/new-recurrence-analysis-B
node --test tests/Test-CycleRecurrence.mjs
./tools/Test-Offline.ps1
```

Each render writes separate stems, preferred/unchanged-gain mixes and `analysis.json`. The analyst verifies fingerprints/layout before measuring. Existing, linked and unprotected destinations remain rejected. No proprietary recordings or exact schedules enter CI/Git.
