# P2-03.5: native granular model investigation

26 October 2026. **Outcome: PARTIAL. Model assessment: important assumptions unverified.** Markers support a relative state/period coordinate, not the proposition that each adjacent interval is a complete interchangeable playback unit. The current scheduler is an experiment, not an established native reconstruction. It omits authored groups/context and graph controls; the omissions are confirmed, but their perceptual contribution remains unknown.

I found the P2-03.4 hold less repetitive but still artificial. No new listening, stock-audio rendering or tuning occurred here. This work is stacked on open PR #18 at `e8618e31ebe70f2459b54b653d3642fd4c9e5c76`; main was fetched at `e5fbd8f3502d3e28169a224caa07471e090e368f`. Earlier PRs remain unmerged, and renderer defaults, telemetry and accepted audio are unchanged.

## Provenance

Reused existing six player streams, extracted metadata, [Bati graph trace](../evidence/vehicle-trace.json), [container summary](../evidence/bati-awc-summary.json), prior reports and private holds. No game/archive access occurred. One previously extracted dat54 XML record was read from the archival checkout's private evidence, without modifying that checkout or importing its history.

The clean local CodeWalker source is pinned to `485d56bec00262ed7fa472261cce7bbc6202b96e`: [AWC structures](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/AwcFile.cs#L2265), [granular graph/channel structures](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/RelFile.cs#L3509). Identity with the installed dev46 binary remains unproven. The earlier blocked reflection check was not retried. Parser declarations do not certify native evaluation.

A new primary historical source is Alastair MacGregor's **The Sound of Grand Theft Auto V**, GDC 2014. The [official catalogue](https://gdcvault.com/play/1021165/The-Sound-of-Grand-Theft) redirected to maintenance. A [mirrored original slide deck](https://gta.com.ua/img/news/sound-of-gta5-gdc2014.pdf#page=18) was visually reviewed on pages 18–20; SHA-256 `10E7C3AEF884499C28B551868FE4BE5CADEC81D1E295A6714A8797F154B0579B`. Its authoring UI shows synchronisation-loop regions, **Loops + Grains** playback, **Walk** selection, and change-rate/window/repeat controls. The runtime slide distinguishes engine/exhaust and exported NPC loops. This supports a richer historical model, but gives no evaluator equations. The mirror is not independently byte-matched to an official download; a 2014 design is not Enhanced 1158.16 verification. Slides/screenshots stay private and are not redistributed.

Observed = stored/source-declared facts; derived = arithmetic/measurement under stated assumptions; hypothesised = plausible role; unknown = no established rule. The [sanitised findings](../evidence/publication/native-granular-model.json) contain summaries and a small candidate matrix, not complete marker tables, PCM or schedules.

## Field semantics

| Field and origin | Type / representation | Evidence, interpretation and falsifier |
|---|---|---|
| Grain `UnkUint1` | uint32, byte 0 | Ordered positions inside PCM: sample addressing supported. Complete grain/window extent unknown. Invalid extents would reject that addressing interpretation. |
| Grain `UnkFloat1` | float32, byte 4 | Reciprocal-period relationship independently corroborated in P2-03.2. Not physical RPM or a loop instruction. Failed held-out spacing/wave correspondence would weaken it. |
| Grain `UnkUshort1/2` | uint16s, bytes 8/10 | Amplitude-like values; parser peak comments tentative. A universal signed-extrema interpretation has counterexamples below. Peak-window/gain law unknown. |
| Grain-chunk `UnkFloat1` | trailing float32 | **1** in all six streams; separate from per-record float. Constant data cannot identify a gain, scale or clock role. |
| Loop counts / references | uint32 counts and index lists | Storage lengths/order observed. Index base, reference meaning and traversal are unverified. Either base can satisfy bounds. |
| Loop style / identifier | uint32 / 32-bit `MetaHash` | Observed style 2, identifier `4C633D07`. Equating style 2 with the historical Walk UI remains a hypothesis; a different enumeration would falsify it. |
| Channel settings | four bytes + float32 | Current names describe output, clock index, two stretch flags and max loop proportion. Old-export name correspondence is inferred from layout; routing/stretch equations unknown. |
| Graph clocks | byte count + float32 pairs | Shared channel references and two pairs observed. Units, phase accumulator and interpolation unknown; no established RPM-to-grain-index map. |
| Graph randomisation / volumes | two float32s / six int16s | Stored values observed. Timing/distribution/gain conversion not established. |

Grain chunks are **4 + 12 × record count** bytes: the four bytes are a trailing scalar, not an initial grain count. Loop chunks have a count, 12-byte headers and 4-byte references. A marker/address can participate in a larger process rather than starting a complete independent grain.

As a bounded test, compare uint16 values / 32,768 with following-interval extrema. Field 1 exactly equals the positive peak in **154/154 exhaust-acceleration intervals**, but only **128/173 engine-deceleration** and **61/154 engine-acceleration** intervals. Literal signed low/high extrema fail generally. These are amplitude-related clues, not an authoritative interval-peak law or permission to normalise grains. Larger peak windows remain possible; none was searched for.

## Groups, clocks and omitted controls

Every nonempty list is a consecutive reference run. Lists are disjoint, with gaps; that does not establish mutually exclusive playback. Both zero- and one-based indexing remain in range for all groups. Group spans below use the existing zero-based hypothesis; raw ordering/disjointness does not depend on it.

| Stream | Groups | Covered references / markers | Group span range |
|---|---:|---:|---:|
| Engine acceleration | 5 | 60 / 155 | 0.416–0.492 s |
| Exhaust acceleration | 5 | 55 / 155 | 0.378–0.493 s |
| Engine deceleration | 6 | 68 / 174 | 0.393–0.547 s |
| Exhaust deceleration | 6 | 80 / 155 | 0.546–0.646 s |
| Each idle component | 0 | 0 / 9 | Not applicable |

These authored regions are not an exhaustive partition. State ranges progress with the source sweep. Operating regions/synchronisation anchors are plausible; exclusive RPM-band switching, interchangeable grains and a traversal sequence are not proven.

Near state 21, eligible engine intervals lie outside all engine groups under both index bases. Most corresponding exhaust intervals lie inside the third exhaust list; full containment of the last eligible exhaust interval depends on the base. Equal group indices therefore cannot be a universal cross-component identity. The current scheduler ignores groups; adding a hard group filter would also require evidence.

Existing record `hash_0346A636` contains clock pairs **(12,50)** and **(11,11)**, moving clock-index bytes 0 and idle bytes 1, with engine/exhaust output bytes alternating 0/1. This supports shared moving control and separate routing, not identical acoustic emission phase. Inspected loop headers contain no explicit clock index; evaluator-internal group behaviour remains unknown.

Old channel floats correspond by layout to `MaxLoopProportion` values **0.5,0.5,1,1,1,1**. Two graph floats correspond to randomisation labels **0.01 / 0.05**; stretch bytes are all zero. Channel volumes are zero except idle engine **−800**. These are observed values with inferred current names, not verified duty cycles, Hz, pitch-jitter amounts or amplitude gains. Our prototype does not evaluate them. Historical authoring controls likewise do not recover window lengths, lateness, loop ownership or clock scaling. Our **96-sample joins are estimated**, not native windows. Nothing here calibrates marker state to physical RPM or fixes the live getter.

## Continuous versus partitioned versus held audio

The state-local engine corridor has **4 consecutive intervals / 9,179 frames / 0.191229 s**; exhaust **5 / 11,414 / 0.237792 s**. Cutting at markers and concatenating in original order reproduces every sample: **zero differences**. Splitting itself loses nothing; independent selection/resetting/retiming/reuse are additional operations.

| Matched-state measurement | Original local source | Reference hold, equal duration | Reordered hold, equal duration |
|---|---:|---:|---:|
| Engine RMS CV | 3.207% | 2.616% | 2.167% |
| Exhaust RMS CV | 0.822% | 1.348% | 1.515% |
| Engine centroid | 1,355.3 Hz | 1,313.3 Hz | 1,333.2 Hz |
| Exhaust centroid | 162.0 Hz | 161.4 Hz | 161.9 Hz |
| Engine normalised spectral flux | 0.3622 | 0.3494 | 0.3729 |
| Exhaust normalised spectral flux | 0.0654 | 0.0572 | 0.0616 |

Uses 4,096-frame Hann spectra through 12 kHz, equally spaced windows (5 engine / 8 exhaust), known stem-gain removal and hold windows centred at 2.5 seconds. Long-hold summaries separately use 32 windows. Original sources retain small state progression, while holds are fixed. Overlap, short observation duration and PCM16 gain quantisation confound causal claims. These are not naturalness scores: **not every envelope/spectral variation measure decreases**.

Phase-normalised consecutive original shapes correlate **0.614–0.755 engine / 0.994–0.999 exhaust**. The analytical grid has 4,096 points, avoiding decimation of eligible intervals; harmonic fractions use all positive-frequency energy rather than normalising tiny low-order leakage to unity. This is analysis-only interpolation, not recovered emission phase. The matched exhaust region is already very similar cycle-to-cycle; reordering cannot invent extensive variation. The full source evolves through different operating states, so its longer-term changes are not a valid fixed-state reference.

Reference/reordered holds follow natural source-index successors in **52/104 and 25/104 engine transitions**, **22/104 and 15/104 exhaust transitions**. Most selections break the longer original sequence while reading forward inside each interval. Lost original ordering/context is confirmed; its perceptual responsibility remains a hypothesis. Natural source engine sample steps already reach **0.1801** locally, so large derivatives alone do not establish clicks. Current joins briefly retain natural continuation rather than making every index break an abrupt step.

Nearby half-second complete-interval windows reach **5.07% engine / 3.83% exhaust** state error; one-second windows **9.74% / 10.68%**. Larger unmodified clips exceed the unchanged 2% gate. This does not authorise a relaxed tolerance. Existing exact/near-repeat findings remain P2-03.4 evidence, not newly rendered results.

## Source-bank and alternative pairing assessment

Available intervals remain **173/154**, within 14–28 **70/60**, individually eligible **4/5**, nearest-paired hold bank **3**. One exhaust choice per engine is not a one-to-one/bijective association; the global map can reuse exhaust intervals. Groups are not an eligibility gate. Prior margin checks pass and splice screening rejected zero choices. Restriction combines genuinely short state-local material with a restrictive association policy.

| Engine | Plausible exhaust indices | Invalid products |
|---|---|---|
| 106 | 93,94,95,96 | 97 |
| 107 | 93,94,95,96,97 | None |
| 108 | 94,95,96,97 | 93 |
| 109 | 96,97 | 93,94,95 |

Of twenty products, **15 are plausible but unverified**, five fail paired-state error. Passes have **0.098–1.724%** paired error; individual read rates are **0.983815–1.017505**. Candidate positions, group-base sensitivity, period/rate agreement, RMS, harmonic descriptors and shape correlation are recorded; no pairing is declared native-supported or adopted.

Engine 109's nearest exhaust 98 fails the target-state gate, while 96/97 alternatives do not. This is avoidable numerical restriction, not demonstrated better sound. Fifteen products add only **one engine and two exhaust intervals**, not fifteen recordings. Negative cross-component shape correlations occur even in original nearest pairs: components differ in spectrum/emission characteristics. This does not justify inversion, delay or correlation-based ranking.

## Model comparison

| Model | Evidence and limitation | Missing assumptions / cost / falsification |
|---|---|---|
| A: repeated short intervals | Functional controls; failed holds/transitions; reordered hold still artificial | Complete-unit interpretation and group omission unresolved. Lowest complexity. Sufficiency already failed listening. |
| B: longer coherent segments | Natural continuous reference; segmentation preserves PCM | Only ~0.19/0.24 s locally qualifies. Longer clips drift; wraps repeat. Simple buffering/separate stems. Reject if target-state bounds or listening fail. |
| C: native-style scheduling | Historical authoring and group/clock structures | Index base, selection/lateness, interpolation and phase laws absent. Highest research cost; do not invent an evaluator. Contradictory native/source evidence can falsify a specific rule. |
| D: phase-continuous cycles | Avoiding unnecessary discontinuities is reasonable | Markers do not establish emission phase; harmonic ambiguity and small bank remain. Moderate analysis/buffering. Better phase metrics without better listening reject sufficiency. |
| E: coherent/granular hybrid | Recorded context and historical loop/grain concept support investigation | Actual combination law unknown. Separate stems/common state remain possible; moderate/high bounded scheduling cost. A controlled context-unit ablation can reject its simplest form. |

**Direction: E, through one small falsification experiment, not a native emulator.** C is not presently reconstructible; B cannot promise indefinite fixed state; D cannot create missing material. Future CPU/latency/audio-thread behaviour is unmeasured. No architecture or runtime adapter is changed.

## Exactly one proposed experiment: exhaust-only coherent-context ablation

Test whether internal per-marker resetting/blending damages a coherent forward source run. Both A/B use the **same five eligible consecutive exhaust intervals**, state **21**, five-second output, gains and bounds. This isolates unit handling without engine/exhaust interference.

- A uses controlled forward traversal with existing per-marker interpolation/rate mapping and 2 ms continuation joins.
- B has identical interval order, boundary times and read-rate mapping, but a continuous cursor internally; omit only internal continuation blends and retain the identical join at each run wrap.
- Hold source material, requested state, clock, gain, sample rate, duration, interpolation and edge fades fixed. No new pairing, wider range, randomisation or effects. Historical/default outputs stay unchanged.
- Verify actual PCM differences and source-path/clock equivalence first. If the distinction vanishes at PCM16 or fails to provide an informative test, cancel listening rather than tune it. The cursor must not become a fixed-rate clip that violates state bounds.
- A clear listening improvement without pitch wander/worse wraps supports larger coherent units. No improvement/worse sound rejects internal continuation blending as a sufficient explanation. A smoother but repetitive block is only partial progress. This does not test every possible hybrid model.

Only ~0.238 seconds of original context is available, so repetition is explicit. This is a narrow diagnostic before any general renderer, not a claim that the entire authored group can hold 21. No new assets/metadata/framework are required. **Not implemented, rendered or played here; a separately authorised follow-up and listening comparison are required.**

## Engineering, tests and preservation

New original tools: `Inspect-GranularModel.mjs` and `audio/granular-model-analysis.mjs`. They inspect six streams, index-base ambiguity, candidate descriptors, segmentation identity, state drift and spectral/envelope texture. They read previous holds and never import a renderer or audio-device API. Allocation/search/input lengths are bounded; candidate matrices cap at 256 products. New private destinations, source/hold fingerprint checks and existing no-overwrite/reparse/isolation guards remain in force.

**14 new original synthetic tests pass**: harmonic/phase ambiguity and a high-order aliasing negative control; marker/group validation; overlapping/invalid references; segmentation identity; unequal/unmatched/excessive matrices; deterministic/amplitude-controlled/silent/corrupt spectra; peak-law counterexamples; immutability; CLI fingerprints and protected paths. Full local regressions pass: **10 recurrence, 18 responsive, 12 cycle, 8 deceleration, 19 stock-audio, 8 extraction guards, 15 ownership, 65 core assertions, 35 drivetrain, 17 parser, 3 diagnostic-analysis, 127 Phase 1, 9 configuration and 8 append expectations**. The Phase 1 count increased from 123 after four new root-document links were checked; it does not represent additional game capabilities. Hosted CI is separate.

Final numeric runs: **437.305 / 427.074 ms**; final RSS **80,523,264 bytes**, not peak/isolated allocation. Timings include reads, validation/descriptors/comparisons, excluding final report writing. Whole-report numeric fields reproduce identically; timing/RSS vary. Earlier lower-resolution diagnostic reports remain private historical work, superseded by these validated measurements. No audio-thread or perceptual performance claim follows.

Fingerprinted **1,175 existing private files** (222,888,194 bytes) and recorded **15 old synthetic-fixture link targets without following them**. An initial refusal to traverse fixture links was retained as a boundary; inventory records the links instead. All entries remain matched. This covers previously verified 12 source WAVs, 46 historical WAVs, 20 P2-03.4 WAVs, manifests, metadata and diagnostics. New original synthetic fixtures/reports are separate. No stock audio output, playback, game/archive access or installation change occurred. PDF/rendered pages remain private; no third-party code, binaries, recordings, slides or workstation paths are published. Licence remains unselected.

Publication screening of ten allowlisted staged files has zero findings; one JSON file and 32 local documentation links validate. Whole-history screening retains four existing identity-review flags, independently checked as the same GitHub service committer on published commits; no new content finding is present. This is a reviewed exception, not an automated all-clear. Git integrity passes; unreachable staging objects are not an integrity error. No raw marker arrays or private diagnostics enter the commit.

```powershell
node tools/Inspect-GranularModel.mjs .local/audio-reconstruction/decoded-final .local/audio-reconstruction/responsive-hold-02 .local/audio-reconstruction/recurrence-candidate-01 .local/audio-reconstruction/NEW-granular-model-analysis
node --test tests/Test-GranularModel.mjs
./tools/Test-Offline.ps1
```

Live RPM, full telemetry certification, native engine-only suppression/ownership, crash-safe handoff, real-time integration and propagation remain separate unresolved gates. No Phase 3 work is introduced.
