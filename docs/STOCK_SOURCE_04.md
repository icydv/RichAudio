# STOCK-SOURCE-04 — shared source continuity repair

**Source03 was rejected by the user. Source04 is a listening candidate; perceptual acceptance remains PENDING.** All three complaints remain acceptance requirements: sustained/state-transition repetition, exhaust resonance and passing power, and stepped rising pitch across all vehicles, particularly X80 and Lectro. Numerical integrity is not an organic-sound verdict. No subjective listening was performed.

Isolated branch `feature/stock-source-04`, exact base `ba62846dd6155b515e165a57088bea660c68be84`. Source03, its previous audio and all earlier failed acceptance evidence remain unchanged. Work is offline: no GTA, deployment, endpoint, suppression or branch reconciliation.

## Defects established before correction

Source03 did not read contiguous PCM even when following consecutive original intervals. It blended each cycle into the next and also treated each interval as a self-loop. If neighbouring intervals contain a component with phase increment theta, that blend multiplies it by `(1-w)+w*exp(i*theta)`. Alternating components cancel at the blend midpoint. Correct internal clock counters therefore did not establish preserved waveform or resonance.

The reproducible counterexample is continuous 75 Hz PCM split into 50 Hz metadata spans. Source03 outputs almost zero where the original is -0.5; interval RMS falls from .353545 to .230100. In native adjacent-cycle probes, the same morph reduces non-integer-order 20–500 Hz detail by approximately .49–2.20 dB across the four banks. Broad 150–500 Hz power changes only about 0–.33 dB, which explains why broad bass checks missed this particular damage. This is source alteration, not a physical exhaust-resonator measurement.

Other shared defects were unrelated mode clocks and phases, playback of inaudible incoming modes, unmatched interval rates when blending accel/decel/idle, and applying a blended pressure share after an already blended waveform. The latter introduces unintended cross terms between states. Source03 also discarded the retained idle offsets/features and limited moving phrases to eight cycles.

The prior stationary demonstration fell only to operating point .3, then faded the running envelope to silence. Idle weight is zero above .28. It never actually demonstrated settled deceleration-to-idle, regardless of the user's valid perception of an audible handoff.

## One method applied to all four banks

The existing `StockGrainVoice` and `StockVehicleSource` are repaired; there is no parallel synthesizer, per-model workaround or replacement waveform.

- A single reader traverses compatible contiguous original material in chronological order. Adjacent original intervals receive no cycle morph or self-loop seam. A second reader is used only for a necessary noncontiguous splice.
- Splices compare incoming PCM with outgoing original continuation, register the incoming waveform and use complementary bounded weights. Available long runs are retained rather than chopped into eight-cycle phrases. The reader does not splice back to its current position merely because that is the best numerical match.
- Source time advances through the integral of a continuously interpolated native interval-rate curve. Its inverse maps the requested clock to PCM position. This removes piecewise constant resampling-speed jumps at metadata boundaries. Timeline construction is outside the render blocks and cached against the original sample buffer and interval layout.
- Each emitter role has one source-derived rate during mode blending. A previously inactive incoming mode is registered against the outgoing waveform on entry. Exactly inactive voices do not consume silent texture histories. Engine and exhaust retain separate source phases; they are not forced into alignment with one another.
- The eight idle streams now use their original ordered metadata offsets and bound features. The whole verified idle recording is eligible as one recorded operating state, instead of narrowing it to one or two selected cycles. This does not claim recovery of native playback semantics.
- Each state's pressure share is applied inside that state's contribution. Native-peak budgets, event bounds and the existing actual-output checks remain intact.

Moving-source material retains the previous rate/level/spectrum compatibility gates and transient-risk exclusions. A genuinely single-interval pool retains an explicitly counted bounded phase-pair fallback. Finite material and sparse pools cannot supply unlimited independent recorded sustain. No arbitrary pitch jitter, vibrato, noise, chorus, EQ, normalization, limiter or compression is added.

Waveform matching uses the established [waveform-similarity overlap-add principle](https://www.isca-archive.org/eurospeech_1993/roelands93_eurospeech.html). This implementation is a source-clock reconstruction using the existing PCM infrastructure; the speech literature does not validate engine realism or guarantee inaudible joins.

## Exhaust body, reflected character and passing power

Source04 preserves the native inter-cycle components that the previous morph could cancel. Exhaust-only listening files expose the result. This restores recorded detail; it does not invent a new exhaust resonance or establish that the user's desired punch has been achieved.

The actual previous open passes had loudest 50 ms RMS around -25.5 to -26.7 dBFS, with over 14 dB peak headroom. Extra authored air loss at passing distance was tiny. Existing finite street returns already added about 1.8–4.3 dB of low-band pass energy. There is no evidence that a missing outdoor reverb preset explains the deficit.

All controlled comparisons retain common source gain `1.5956559506856056`, renderer master `.7`, per-vehicle pressure-share profiles, directivity, trajectory, source placement, distance profile and finite geometry. No increase in overall playback level conceals source changes. Controlled new open-pass 50 ms maxima are approximately -25.82/-25.56/-24.86/-26.28 dBFS for Bati/Lectro/X80/Schafter: these are modest level differences, not proof of massive impact.

The previous flyby lifted at 5.32 s, close to the rear exhaust's closest arrival. A **separate labelled driving comparison** keeps load through the pass and lifts at 6.3 s. It uses the same motion and acoustic chain. It is not presented as a source-player-only A/B and does not universally increase every low-band or RMS measure.

Direct propagation, independently causal Doppler, distance colouring, actual finite first/second-order exhaust returns and original PCM histories remain the existing implementation. The street is the same authored ten-metre finite fixture, not Los Santos geometry or a complete street reverberant field. No outdoor FDN is enabled. The supported enclosure/orthogonal-source late-field implementation remains unchanged and its focused tests pass. Longer environmental decay requires valid environment evidence, not an invented reflector or blanket reverb.

## Listening package and validation

Private page: `.local/stock-source-04/audition/index.html`. Each vehicle section includes:

1. Same-gain old/new 24-second source programs: idle, continuous rise, nine-second high hold, deceleration into genuine running idle, then seven seconds of held idle. Both players receive identical controls and settings.
2. New exhaust-only output from the same source run.
3. Original Source03 open/street files beside new controlled open/street files, with original control/motion hashes checked.
4. Separately labelled later-lift open/street performances.
5. Matched-scale source spectrograms, spectra, source-rate/state traces, short near-pass low/mid/RMS/peak measurements and exact fault/timing evidence.

There are 28 new WAVs and eight read-only links to previous flybys. Common page volume, no autoplay or independent normalization. Copyrighted PCM, native references, WAVs and images remain private and uncommitted.

The final **67 focused tests pass**, including new chronological waveform/fractional-order identity at 24/32/48 kHz, single-consumption splice scheduling, actual reader-speed continuity, analytical elimination of independent-clock beating, incoming modes after different silent histories, real held-idle controls and state-share algebra. Existing constant-tone/harmonic/phase/rate, finite/headroom/history, causal propagation, distance and late-field tests remain. No full CI or benchmark matrix was run.

All generated PCM is finite/unclipped; no renderer limiting, PCM-history fault or retarded-path inconsistency was observed. Maximum accepted retarded-frame error is below 8.4e-7 frames. Three complete-block deadline misses are retained: 10.775, 11.074 and 10.968 ms, against 10.667 ms. Initialization is recorded separately; this is not live-device readiness evidence. Nonzero simulation startup `missingPast` counts remain visible and represent omitted pre-observation candidates, distinct from zero PCM-history faults.

Low-correlation splice diagnostics remain substantial: complete source programs count 147/106/227/140 matches below the declared .8 correlation diagnostic across Bati/Lectro/X80/Schafter. They include tiny IIR-weight tails and do not count audible clicks. Conversely, a bound or a best-available match does not certify an inaudible join. Finite source diversity, sparse support, state relationships inferred from interval rates and this residual splice uncertainty remain material limitations.

Evidence: `stock-source-04-defects.json` reproduces the rejected implementation's defects and pass measurements; `stock-source-04-audition.json` records the new comparisons; `stock-source-04-validation.json` records focused tests, artifact bindings and preservation checks. Private measurements contain the detailed listening diagnostics.

**Release remains blocked on the user's listening verdict.** This correction addresses concrete shared reconstruction faults and makes all three complaints directly reviewable. It does not claim every remaining repeat, transition, pitch contour or weakness of impact is inaudible. The next decision is whether this candidate now preserves organic vehicle identity and passing impact; adding effects automatically would not settle that question.
