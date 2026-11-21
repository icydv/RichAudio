# P2-03.11: interpolation-support eligibility and source boundary semantics

26 October 2026. **PASS for a research-only bounded reconstruction-support contract.** I've established a defensible distinction between selecting an original interval as a scheduled event and reading adjacent original PCM solely through the existing interpolation filter. Interpretation B is supported for authenticated, contiguous stored-source data under the limits below. It is not a new default, native Rockstar algorithm, ownership verdict or successful transition.

I reproduced the historical interval-92 rejection using the unchanged P2-03.10 checker on the first event only. My separate diagnostic accepts the two inspected target positions under B without changing their source cursor, rate, event extent or clock. I did **not** retry the 15-second trajectory, attempt the later 11.143875-second handoff, generate stock-source audio, change the resampler or launch GTA/RPH. The previous negative finding remains correct for its explicitly tested interpretation.

## Repository and scope

Canonical main was fetched at `e5fbd8f3502d3e28169a224caa07471e090e368f`. PR #24 remained open/unmerged at `c891bd8a1c1508f4065f1fd688084140ec6b3051`; my branch, `research/p2-03-11-interpolation-eligibility`, starts there. Earlier stacked history and the archival unsanitised checkout are preserved; nothing is merged, rebased or rewritten.

The real-source scope is one boundary in the previously decoded player Bati-traced `exhaust_decel` stream: nominal interval 93, preceding interval 92, and isolated output frames 0 and 1. The unchanged historical checker additionally enumerates provider spans for that first event only. Synthetic regressions can exercise historical planners on original fixtures; they are not a retry with Rockstar recordings.

## Actual sampler, not an assumed ideal resampler

The unchanged [sampler](../src/offline-audio/stock-source.mjs) uses 24 windowed-sinc taps. For source position `p`, `base=floor(p)`, phase is `min(127,floor(frac(p)*128))`, and rate bucket is `round(rate*128)`. Its cutoff is `0.9*min(1,1/(bucket/128))`. For tap `k=0..23`:

```text
x = k - 11 - phase/128
w[k] = sinc(pi*x*cutoff) * cutoff * (0.5 + 0.5*cos(pi*x/12))
normalise all w[k] by their sum
y(p) = sum(w[k] * originalPCM[base - 11 + k])
```

`sinc(z)` here means `sin(z)/z`, with the existing near-zero case. Rate and phase quantisation are historical implementation choices; the diagnostic does not change them. Integer-position reads are still filtered, not necessarily the original single sample. Finite support, quantisation and a 0.9 cutoff are not perfect bandlimited reconstruction or a fidelity certification.

The implementation loads **all 24 samples**, including numerically zero coefficients. Positive and negative side-lobes participate in the weighted sum; a negative coefficient is not an independent negative-gain engine event. Tiny floating-point residues are counted as numerically nonzero, not claimed audible. The diagnostic recovers coefficients with original synthetic unit impulses through that same sampler; it adds no alternative kernel. An independent synthetic waveform verifies the dot product against the unchanged implementation.

The sampler itself applies modulo to source indices. My research contract rejects unsupported indices **before** that operation; modulo is never accepted as boundary provenance, implicit looping or padding. A marker boundary inside known PCM differs from an end-of-file wrap or a jump between scheduled regions.

Reconstruction by weighted neighbouring samples is supported by [Oppenheim's MIT interpolation lecture](https://ocw.mit.edu/courses/res-6-007-signals-and-systems-spring-2011/resources/lecture-17-interpolation/) and [Julius O. Smith's author-published interpolation theory](https://dsprelated.com/freebooks/pasp/Theory_Ideal_Bandlimited_Interpolation.html). Smith describes [finite windowed-sinc approximation](https://www.dsprelated.com/freebooks/pasp/Windowed_Sinc_Interpolation.html). Those sources justify the DSP distinction, not GTA marker meanings or our particular kernel's quality. [SciPy's official resampling documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.resample_poly.html) also makes boundary extension an explicit choice; I used it as a reference, without installing or using SciPy.

## Where the 2% rule came from

| History | Established constraint | What it did not establish |
|---|---|---|
| `ae710742779cd61c38357c82b5d9812bf8fe65bb`, P2-03.2 [cycle experiment](../tools/audio/cycle-experiment.mjs) | Match deliberately selected engine/exhaust intervals using adjacent-marker means, at most 2% mismatch and 0.95–1.05 relative rates | Separate state tests for every filter tap's metadata interval |
| `9d108d54510268ab6a33c93aa490701527531138`, [responsive research](../tools/audio/responsive-engine.mjs) | Check each selected pair/component against requested state and period-derived rate | A requirement that FIR halo samples become independent scheduled events |
| P2-03.9 | Conservative complete-context eligibility for a whole event | Native scheduling semantics; necessity of that indivisible context policy |
| `c891bd8a1c1508f4065f1fd688084140ec6b3051`, P2-03.10 [read checker](../tools/audio/shared-interval-handoff.mjs) | Explicit candidate interpretation: every supplying provider must pass state/period checks | Evidence that this stricter interpretation was the original rule or a mathematical requirement of interpolation |

The older code already sampled the original full-stream array across markers. Historical use alone does not prove it was correct. Its selection rationale, unchanged linear sampler and bit-exact PCM provenance together support a narrower, testable reconstruction interpretation. I have not changed or retroactively relabelled the prior failures.

## Stored-source continuity and its limits

The source is 48 kHz mono PCM16, codec 0, 374,180 frames. WAV SHA-256:
`574DBB61C486F18848839300C9D72219957258CEEA6B1F93710EB72EF6270F2F`.
PCM payload SHA-256:
`E21A779780B24755250BBA1674E673C6436C3B58E3CC6AEA0E9CDE00D6E5D70F`.

The existing [extractor](../tools/audio/ExtractBati.cs) checked raw bytes against decoded PCM and the WAV data payload. I inspected that code, without running it or accessing archives. The current payload matches the recorded original PCM fingerprint and approved manifest/metadata hashes. Interval 92 ends where 93 starts, at absolute sample 151154. Original samples 151153 and 151154 are adjacent in that same payload. Splitting and rejoining a 128-frame diagnostic view around the marker changes **zero** samples; metadata segmentation does not insert audio, reorder samples or create a splice there.

The marker's adjacent-sample step is 0.020416259765625; the same 128-frame neighbourhood has maximum step 0.03424072265625, RMS 0.28425801511818555 and local slope change 0.002655029296875. These are descriptive scalars, not a new click threshold or proof of inaudibility.

This establishes **contiguous stored PCM and original-index provenance**. It does not prove an unedited microphone capture, interchangeable complete cycles, native phase semantics or Rockstar's granular algorithm. The filter reads neighbouring recorded samples using one active cursor and rate; interval 92 acquires no independently selected period, readhead, gain or event clock. That supports interpolation of this stored sequence. It does not authorise choosing interval 92 as a whole event at state 21.

## Interpretations compared

| Interpretation | Assumptions and support | Contrary evidence / missing proof | Boundary consequence and testability |
|---|---|---|---|
| A: full eligibility for each provider | Every supplying metadata interval is treated as an independently state-constrained source; conservative and detects genuine read dependencies | Original rule/history and FIR mathematics do not require that classification; a neighbour contributes through the same filter, not a new event | Still rejects frame zero at 2.5180%; valid as an additional strict policy, preserved and reproducible |
| B: scheduled eligibility plus bounded reconstruction | Scheduled event keeps every numeric check; a same-original-stream, unit-stride filter halo has separate identity/bounds/provenance checks | Depends on trusted provenance and declared analytical event-state bounds; does not establish native scheduling, arbitrary joins or whole-trajectory validity | Accepts the inspected 92/93 positions; independently tested using original synthetic data; rejects unknown or spliced support |
| C: unresolved | Necessary where provenance, intended source extension or read purpose cannot be established | Not needed to classify this authenticated same-stream target footprint; still appropriate for unknown boundaries/native semantics | Fail closed rather than synthesise padding, exempt another readhead or guess a native contract |

**My decision:** adopt B only as an opt-in **research diagnostic contract** for bounded interpolation of an already eligible scheduled interval. Applying the full 2% rule to each halo provider is an additional policy assumption, not a requirement established by the original rule or filter mathematics. No provider is exempted by identifier, time, zero weight or fade.

## Four-layer contract

1. **Source selection:** verify trusted source/catalogue identity; original interval identity, state and period; analytical requested-state range; at most 2% state error; both applicable rounded-period rate bounds and actual rate 0.95–1.05; exact rounded event clock; source start/end and historical safety margins. Keep the conservative inward eligibility band from P2-03.9. The diagnostic checks a supplied range; a future planner must still derive that range analytically, not sample it sparsely.
2. **Reconstruction support:** enumerate every actual 24-tap load at the unchanged cursor. Every index must be in bounds, known and mapped at unit stride to the same authenticated original stored stream. Adjacent provenance spans may meet only if their original indices also meet; matching sample values alone do not establish this. Reject gaps, file-edge modulo, padding, reordered indices, another asset or unexplained cut. A halo provider's annotation does not create an independent event, but its memory access and mathematical contribution remain recorded.
3. **Context ownership:** identifies future scheduling authority. This module does not change or validate it; passing a support query is no ownership proof. Historical identity/cursor/rate/clock-preservation requirements remain separate.
4. **Source transitions:** independently authorise source relocation, end-to-start wraps, continuation readheads and any mixed/discarded calculation. Passing support validity is no continuity, phase or perceptual proof at a scheduled jump. No transition behaviour is introduced here.

```text
require scheduled_interval_eligible_under_unchanged_limits(event)
for each required read operation:
    if it is not this eligible target's reconstruction: require separate authorisation
    preserve target cursor, rate, source identity and clock
    enumerate all 24 requested indices
    require in-bounds, authenticated same-stream, continuous original mapping
    record loads, nonzero coefficients, actual weighted terms and retained output
do not infer ownership or transition validity from the result
```

The existing 96-frame continuation mixture has a **separate source readhead**. It is not merely the target's 24-tap halo. Historical B rendering computes a reference and overwrites some outputs; discarded calculations still perform reads. My checker refuses to authorise such a continuation operation under this target-only contract, even if its output would be discarded. Any future trajectory study needs a typed, complete read inventory and explicit checks for these operations. No such study was executed here.

Trusted extraction receipts and reviewed metadata are inputs to the proof. Self-supplied matching hashes cannot authenticate arbitrary audio's origin. The bounded CLI pins the previously approved source, PCM, manifest and metadata fingerprints. The generic synthetic-test helper hides its copied PCM/provenance and rejects forged source objects; it is not a security boundary against a malicious caller fabricating a catalogue or provenance claim.

## Initial-boundary diagnostic

Nominal interval 93 spans `[151154,153403)`, length 2249, relative state 21.3439245. Requested state is 21. The first event is `[0,2286)`, fractional clock `0 → 2285.714285714286`, actual read rate **0.9838145231846019**. Nominal state error is **1.6377357143%**; both rounded-period rates are **0.9842450765864332** and **0.9838145231846019**. None changes under B.

These are relative marker-state coordinates, not physical RPM or recovered live engine speed.

Neighbour 92 spans `[148928,151154)`, state 21.5287764, error **2.5179828571%**. Under A it contributes during `[0,12)` and produces the original frame-zero rejection. Under B its last 11 stored samples are reconstruction support at both inspected positions; it is never selected as a separate engine event.

| Quantity | Output frame 0 | Output frame 1 |
|---|---:|---:|
| Source position | 151154 | 151154.98381452318 |
| Requested source indices, inclusive | 151143–151166 | 151143–151166 |
| Quantised phase / rate bucket | 0 / 126 | 125 / 126 |
| Memory loads | 24 | 24 |
| Numerically nonzero coefficients / actual nonzero PCM terms | 23 / 23 | 24 / 24 |
| Positive / negative / zero coefficients | 13 / 10 / 1 | 13 / 11 / 0 |
| Nonzero coefficients and terms from interval 92 | 11 / 11 | 11 / 11 |
| Coefficient sum | 1 | 1.0000000000000004 |
| Presentation fade | 0 | 1/1200 |
| Gain after fade, before any quantisation | 0 | 0.000125 |
| Final nonzero influence coefficients / actual terms | 0 / 0 | 24 / 24 |
| Dot-product difference from unchanged sampler | 0 | 0 |

The first coefficient at frame zero is `−0.00015235103862449166`; the last is zero. At frame one they are `1.6012269075084883e−7` and `−0.00011514849409454217`. All 24 coefficients at both positions are published in the [sanitised numeric evidence](../evidence/publication/interpolation-eligibility.json), derived from synthetic impulses. Individual stock PCM values, weighted stock terms and reconstructed sample values remain private.

“Final influence” means a mathematical dependency after the existing gain, mixing/retention flag and 25 ms presentation fade, **before PCM16 quantisation**; it is not an audibility claim. The fade uses the full historical presentation extent, not an artificial fade at every event endpoint. Silent frame zero does not excuse invalid memory access; frame one demonstrates nonzero neighbouring influence after fading. No new audio file was created from these two scalar queries.

## Implementation and validation

- [Research module](../tools/audio/interpolation-eligibility.mjs): source receipt binding, unchanged selection checks, original-sampler coefficient inspection and bounded support classification. At most 16 isolated queries per call; no event scheduling or rendering.
- [Private diagnostic CLI](../tools/Inspect-InterpolationEligibility.mjs): approved first-event pins, old A rejection and two B queries. It writes diagnostic JSON only to a fresh ignored directory; public, existing and linked outputs fail before source access.
- [26 original synthetic tests](../tests/Test-InterpolationEligibility.mjs): independent impulse constants and arbitrary waveform agreement; negative/zero weights; zero PCM vs nonzero weights; fades/discards; valid adjacent provenance vs gaps, asset changes and splices; selection/state/rate/clock/cursor failures; source protection; deterministic output and private path guards. The unchanged old checker still rejects an independently constructed ineligible neighbour.
- Full [offline suite](../tools/Test-Offline.ps1): **219 Node tests across 15 groups**, including 26 new and 21 historical shared-interval tests; original offline-audio and telemetry builds; 8 extraction/publication guards; 65 telemetry, 9 configuration, 35 drivetrain and 8 append assertions. The final run passed **133 Phase 1 checks**, including the new roadmap link. No game/tool installation is required.
- Preservation: **4,074 protected private files, 106 protected link targets, three accepted preview fingerprints** unchanged; the original twelve decoded sources, manifests and metadata are covered. No links are traversed during inventory checks. Historical `src` and audio-helper files are unchanged; only the new opt-in module is added. Synthetic regression outputs are original fixture data, not newly generated stock previews.
- One measured diagnostic run: preparation **41.9061 ms**, analysis **2.2315 ms**, process RSS **60,538,880 bytes**. It includes old first-event dependency enumeration, source receipt checks and 48 coefficient queries; cache/startup affect timing. This is diagnostic cost, not rendering throughput or real-time certification.

Reproduce privately, using the existing approved extraction only:

```text
node tools/Inspect-InterpolationEligibility.mjs .local/audio-reconstruction/decoded-final/source-manifest.json .local/audio-reconstruction/interpolation-diagnostic-NEW
node --test tests/Test-InterpolationEligibility.mjs
```

The output directory must not exist. The approved hash pins intentionally reject different assets or metadata rather than silently switching source. No archive access or re-extraction is part of this command.

Publication is limited to authored code/tests, scalar evidence, kernel coefficients and technical findings. No stock PCM, per-tap stock values, audio, proprietary metadata blob, tool binary, private absolute path or new licence is included. The eight-file index audit reports zero findings and 32 documentation links resolve. Full-history screening still flags only four existing reviewed GitHub service-committer identities, at `e5fbd8f3502d3e28169a224caa07471e090e368f`, `71466d02189251b2df99a2d69b954473bd1dba4f`, `ec94b546ae4a610dedfb0337706a6f36ec031666` and `00c1fe03242fa2ee4a6f9cff1a481aa5b91da4ca`. These are historical review exceptions, not new private-identity findings or an unqualified automated history pass. Git integrity checks pass; unreferenced local objects are retained without pruning. Hosted CI and final remote commit/PR are independently read back and reported at completion, not presumed green from local tests.

## Progress and next decision

Communicated checkpoints: **0%, 10%, 30%, 50%, 70%, 85%**. Stages 1–5 cover 85%: baseline 10, sampler 20, semantics 20, contract/diagnostic 20, tests/preservation 15. Stage 6 is the remaining 15% for this report, publication audit, PR and hosted CI readback. Final 100% is reserved for verified completion of those steps and reported in the completion message; it means this diagnostic scope is finished, not that transition playback is proven. There is no listening gate or new listening verdict in this milestone.

**One next action:** separately authorise a read-only re-evaluation of the original fixed 15-second trajectory using typed source-selection and bounded reconstruction-support checks, with explicit independent authorisation/validation of every continuation readhead. Preserve all old limits and stop on the first actual invalid read or ownership condition. Do not render audio or infer that the later handoff is resolved before that study. No such re-evaluation is started by this report.
