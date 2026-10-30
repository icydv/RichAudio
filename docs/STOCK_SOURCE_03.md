# STOCK-SOURCE-03 — sustained original vehicle texture

Perceptual acceptance: **PENDING user listening**. No subjective listening was performed. The supplied review is evidence; the STOCK-SOURCE-03 request defines the work. Work stayed offline, without GTA, an audio endpoint, deployment, suppression, or PR #73/#75 reconciliation.

Isolated branch: `feature/stock-source-03`. Verified starting revision: `3fa6649fd687bf524bd3cc9df8847cdf6a0026b4`, unchanged STOCK-SOURCE-02. Prior auditions, acceptance records and evidence remain intact.

## Reproduction and cause

Before modification, the supplied review probe reproduced the old Schafter and Bati corrected-source files sample for sample (432,000 frames each, maximum error zero). Schafter peak correlation was 0.9995545 at 17.895833 ms over 4.85–5.15 s; Bati was 0.9955366 at 25.875 ms. This was a fixed adjacent pair at a held source address, not demonstrated limiter behaviour. The repaired full-period pitch clock worked, but repeatedly read the same tiny excerpt. The previous demonstration also plateaued its controls.

The correction retains that clock, separate recording phases and native PCM. A held state now traverses compatible chronological phrases of genuine cycles, with phase-continuous morphing between cycles. Phrases are selected without replacement; phase-compatible joins are preferred. No noise, vibrato, sample-value randomization, EQ or added oscillator is used. There is no fixed short neighbour pattern.

Compatibility uses original interval duration within approximately 5%, source address within 0.12 of the recording, RMS within 3 dB, and three-band power fractions within 4 dB (0.001 fraction floor). Isolated flagged transient spans and their preceding-context seam reads are excluded. The bound atlas checks source SHA, rate, length and offsets. These are authored reconstruction rules, not recovered native granular semantics, crankshaft RPM or a transient classifier with guaranteed completeness.

During rapid state changes, stale texture fades toward the contemporaneous safe anchor pair, at the same continuously integrated phase, with a 5 ms exponential time constant. It refreshes its phrase plan below 0.001 contribution. A 5 ms time constant is **not** a completed 5 ms fade. The transition audit reports outgoing material-period differences as large as 42%, with maximum continuous excursions above the 5% material-compatibility diagnostic lasting 34.54 ms. This is residual source-template mismatch, not a pitch-clock reset; its perceptual significance remains open.

## What the available recordings support

The same shared player exercises all four original banks: Bati `v_twin_2` at 48 kHz, Lectro `lectro` at 24 kHz, X80 `prototipo` at 32 kHz and Schafter `schafter3` at 24 kHz. Native-rate reference files are copied byte for byte, without source reconstruction or normalization.

Final genuine-asset verification covers 48 moving holds (low/middle/high for both roles and accel/decel), including sixteen 10-second high holds, eight idle holds and four transition programs. High holds occupy 28–55 compatible original intervals; requested clock spread is at most 5.33e-12 Hz and observed phase integration residual is zero. All 24 original PCM memories remain unchanged, with no overreads, nonfinite output or observed risk-span reads.

Only about 0.73–0.97 seconds of compatible high-state material is available per voice. Rearranging that finite material does not create a newly recorded nine-second sustain. Some low-state pools contain only three cycles. Idle retains the earlier long, waveform-matched original-excerpt loop approximation. Bati exhaust is naturally highly periodic; no universal autocorrelation threshold is used to force artificial variation. Source-span occupancy, sequence repetition, cycle innovation, envelope variation, spectral orders and seam-local measurements are retained in the sustain verification evidence.

## Authored vehicle-specific exterior balance

Common source gain remains `1.5956559506856056`; propagated master gain remains `0.7`. No independent normalization, limiter or compression is used. The Schafter keeps its improved previous idle/lift shares and exhaust directivity; only its load balance changes modestly. Other vehicles have their own settings.

The former arbitrary gain-times-share constraint is replaced by a conservative bound on **actual native PCM peak × common gain × maximum role share**, at most 0.98. Smooth convex state weights and source morphs preserve that bound. Actual summed renderer output and transient headroom are checked separately. Raw graph numbers are not interpreted as gain.

Values below are measured exhaust-minus-engine RMS dB through the actual direct-path renderer at fixed front/side/rear positions, using the corrected texture. Positive means more received exhaust energy. These are authored targets, not calibrated native mix semantics. Probe windows and coordinates are in the final mix evidence; the long audition has separately measured state windows.

| Vehicle | State | Engine / exhaust pressure share | Front dB | Side dB | Rear dB |
|---|---|---|---:|---:|---:|
| Bati | idle | .55 / .45 | -2.29 | 1.70 | 5.85 |
| Bati | load | .34 / .66 | 0.01 | 3.98 | 8.14 |
| Bati | lift | .55 / .45 | 0.11 | 4.09 | 8.25 |
| Lectro | idle | .55 / .45 | 0.70 | 4.26 | 8.12 |
| Lectro | load | .53 / .47 | -0.46 | 3.11 | 6.95 |
| Lectro | lift | .43 / .57 | -0.67 | 2.89 | 6.73 |
| X80 | idle | .44 / .56 | -2.99 | -0.17 | 4.86 |
| X80 | load | .41 / .59 | 0.17 | 3.02 | 8.07 |
| X80 | lift | .48 / .52 | 0.23 | 3.08 | 8.10 |
| Schafter | idle | .40 / .60 | -3.31 | 2.28 | 10.15 |
| Schafter | load | .35 / .65 | -2.27 | 3.32 | 11.20 |
| Schafter | lift | .40 / .60 | -1.46 | 4.12 | 12.01 |

Engine directivity remains .1; exhaust values are Bati .45, Lectro .4, X80 .3 and Schafter .35. The Lectro's original exhaust level is already strong, so exhaust-led received energy does not require an exhaust share above .5. Bati and Schafter retain their recorded low/mid exhaust body; X80 retains its different mid-focused source character. No separate intake material was established.

`stock-source-03-mix-initial02.json` and the first `...verified.json` are retained intermediate measurements. **`stock-source-03-mix-new03-corrected-texture-verified-v2.json` is the final calibration**, bound to the rendered code and private sustain atlas hashes.

## Genuine events and environmental returns

The existing graph identifies four discrete X80 `ExhaustPops` samples missing from the six-layer library. Only these four streams were newly decoded; the archive before/after hashes match and raw PCM equals decoded PCM. Their genuine native rates are 32005, 32001, 32002 and 32001 Hz; they are not rounded to 32 kHz. Source files remain private and untouched.

One finite X80 event is explicitly authored at lift: 13.56 s in the stationary program and 5.34 s in each flyby. It is not inferred from a changed operating point or claimed to reproduce native ECU conditions. A declared 0.5 ms attack/3 ms tail envelope treats file edges, and an explicit event gain fits the conservative exhaust-input budget. No looping or automatic retriggering occurs. Bati, Lectro and Schafter `ExhaustPops` fields are null; no generic substitutes were added. Referenced RevsOff assets outside the verified library and parameterized transmission graphs do not establish usable discrete shift samples. No Lectro KERS or independent intake asset was established.

The event joins the exhaust PCM before emitter distance, directivity, retarded-time/Doppler, material filtering and finite reflections. An isolated diagnostic renders that same native event through actual direct, first-order and second-order paths, without a bed or late field. Calculated arrivals and measured received energy are reported independently.

Every vehicle has an open/street pair with identical dry PCM, controls and continuous motion hashes. The street contains the same finite 10 m near-listener section in two bounded coverage tiles; no geometry outside that authored fixture is claimed. Existing first/second-order paths produce exhaust returns. There is no outdoor FDN. A tightly checked `preserveIdenticalReflectors` opt-in retains reflected retarded-rate history across this coverage-only tile switch: surfaces, materials, coordinates and processing settings must be exactly unchanged and complete. Invalid switches reject before mutation; normal geometry replacement behaviour and asynchronous epoch protection remain.

The Schafter stationary tunnel comparison uses the existing finite tunnel and supported analytic-enclosure late field, with separate early/late stems. The prior orthogonal original-engine/exhaust late-send correction remains in place. This is an authored enclosure, not observed Los Santos geometry or acoustic calibration.

## Distance and listening package

Each vehicle has an 18-second source program: idle, rise, **nine seconds of fixed high load (4.5–13.5 s)**, lift, stop and tail. Each also has close engine/exhaust/combined files and complete 10.3-second open/street flybys. Schafter source-player A/B uses the same controls, gain and previous fixed .4/.6 balance; the final vehicle mix is a separately labelled comparison. Original references retain their unmodified levels.

For each vehicle, the identical held .95 source and fixed bearing are rendered at 2/10/25/50/100/200 model metres. The preserved authored distance profile is `[.0001,.01,.1]` dB/m; Schafter also exposes unchanged physical-default `[.0001,.001,.01]`. These are explicit model/presentation assumptions, not measured atmospheric calibration. Listening files retain spreading and relative levels. Only labelled diagnostic plots compensate the known distance/master gain, exposing relative spectral/detail change independently of overall attenuation. No distance reverb is introduced.

From 2 to 200 m, relative 4–10 kHz versus 40–400 Hz power falls by 5.20–6.14 dB across the four banks, while the normalized adjacent-sample detail measure also falls. These establish modelled relative colouring rather than simply lower distant absolute energy; recognition and the desired distance impression still require listening.

Private output: `.local/stock-source-03/audition/listen.html`, with clearly separated vehicle sections, common volume, no autoplay, one player at a time, matched spectrogram scales, state/window levels and native references. Sibling `distance/` holds the distance programs. Copyrighted WAV/PCM and plots remain local and uncommitted. The page is designed for human comparison; numerical integrity is not perceptual acceptance.

## Focused validation and next decision

The 57 focused tests passed: existing constant-tone/harmonic/rate/phase tests, ten-second analytical cycle variation, state mixing, risk-span exclusion, finite native events, actual propagation, PCM history, finite reflections, identical-world coverage switching, distance presentation and existing source-driven late-field stability. No full CI or benchmark matrix was run.

The all-four timed render completed with no deadline misses; slowest complete 512-frame block was 7.541 ms against a 10.667 ms budget. Instrumented offline timing does not establish live GTA/device capacity. Final measured levels, headroom, source-player A/B statistics, distance changes and calculated event returns are in `evidence/stock-source-03-audition.json`. Source hashes bind those results to this implementation.

Renderer PCM-history fault counters are zero. The separate simulation `missingPast` counter is not zero: it counts candidate emissions before the program's first motion observation at time zero (99–132 startup queries per open flyby, also retained in evidence). Those paths are omitted instead of inventing earlier motion/audio; the flyby therefore begins with causal travel-time silence. Finite street/tunnel geometry also rejects out-of-support or otherwise invalid reflection candidates. These solver counters are not concealed as zero PCM faults. Accepted-path retarded-frame consistency error is below 8.4e-7 output frames. Initial construction/file writing is outside block deadlines and does not establish startup or live-device readiness.

All 36 package integrity/comparison checks pass. The Schafter same-mix source-only hold correlation over 5.5–12.5 s changes from 0.99972 to 0.95487 at the strongest 12–40 ms lag; strongest 120–800 ms correlation changes from 0.99637 to 0.89507. This is descriptive evidence against the frozen waveform, not an acceptance threshold. At the same gain the new hold RMS is 0.66 dB higher as a consequence of the different genuine material/morphs; that difference is disclosed and not normalized away. The page includes both whole-file and short-window measurements. Actual isolated pop energy is nonzero for direct/first/second orders (0.73861/0.48591/0.04053 sum of squared digital samples); first above-threshold arrivals follow calculated earliest arrivals by about 37–40 microseconds, including sample-grid/edge-envelope effects.

The next decision is listening: whether the Schafter hold no longer freezes objectionably, whether each original identity survives the phrase reconstruction, whether the exterior balance is right, and whether source-template changes or seams remain audible. Sparse pools, finite source diversity, idle loop approximation and brief rapid-transition template mismatch remain explicit limitations. More synthesis features are not the next automatic step.
