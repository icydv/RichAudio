# GATE-A-SHVDNE-PRIVATE-03C — marker qualification and attribution admission

I requested further offline engineering before my first authored private horn experiment. Codex preserved the original marker, AWC, full-word detector, PRIVATE03 proof and sealed PRIVATE-03B package. Codex opened no audio endpoint, played no audio, started no capture and launched no GTA/OBS/runtime process. All new audio is deterministic disposable fixture material under `.local/gate-a-shvdne-private-03c/marker/`.

Codex found and demonstrated an attribution gap in the old proof: **no complete 31-symbol match was being treated as a usable marker-free baseline/control even when the recording contained a substantial identifiable marker fragment**. Eight supplied-window examples returned a conditional PASS despite known first/last-half or 30-symbol contamination in baseline B or control B. The full-word detector correctly withheld a full identity; the unsafe inference was in negative-evidence admission. The original results and source remain intact.

Codex added a separately versioned `ResourceProof03C.mjs`. Positive identification still uses the unchanged original full-word detector. The new wrapper only strengthens negative baseline/control admission: a coherent **12-consecutive-symbol** fragment, at the original frequencies/timing/energy gates and with at least **three tone transitions**, makes the window **INCONCLUSIVE**. It never creates a new positive marker identity or an authenticated isolation failure. A full marker in a control defeats conditional signal attribution as before; video/horn-origin evidence must still distinguish a control-origin change from external contamination.

The new wrapper is an experiment evidence tool, separate from the vehicle adapter, acoustic propagation, geometry, synthesis, scheduling, spatial mixing and audio output. It performs no capture, playback, assignment or automatic input. This source change must be included in a new reviewed package; it is not silently substituted into the sealed PRIVATE-03B proposal.

## Frozen parameters and held-out separation

The original detector was frozen before the 90-case qualification. `freeze.json` SHA-256 is `f9cbd49158debff20699cc484421dd7a913612954ab6c549c6bb30fa26500702`. Its immutable source is SHA-256 `50ff5c3334ceea87cffbb39c760eef44a12eb42f9e6f07094ee7a66710aa3280`; original WAV is `ed09f9acaaa4347a4fb04d33483faf08ac129e3be54cf2f5270b6f0a739bbb7c`, and original PCM is `427c34a5bd3083c3597b824ecd4d28e3286ea8ff3d5028a129ddecd16671fb06`.

The full-word detector remains PCM16, 48 kHz, one or two channels, independently measured channels, fixed 660/880 Hz, 40 ms Hann windows, 10 ms alignment hops and 80 ms symbol spacing. It requires all 31 exact symbols of `1111100011011101010000100101100`, tone-to-other-tone energy ratio at least 4, expected-tone energy/power at least 0.55, power at least 0.00000225, at least 50 audible windows, at least 2.8 seconds of capture and zero clipped samples. It performs no pitch fitting, timing fitting or relaxed word-distance search.

The demonstrated old-wrapper gap was development evidence. Codex selected the conservative fragment-review rule and froze its implementation and a disjoint test plan before evaluating that plan. `fragment-freeze.json` SHA-256 is `782b70c8c8d9897bf60531f6653763f2ab729bf3b163e61c060415162a13c4df`. Twelve symbols cover 0.96 seconds at nominal timing; requiring three transitions avoids treating a constant single-tone horn as a fragment. The original tone/power/coherence gates, fixed timing/frequencies and channel policy are unchanged. No parameter was tuned after held-out evaluation.

An additional admission/noise-sensitivity plan was frozen separately before evaluation: `admission-freeze.json`, SHA-256 `a5125b994db02cc4b196aa6c0fa45f5004290c1d008e7d79c0a595d5841857c8`.

## New observations

| Corpus | Result |
| --- | --- |
| 90-case original detector qualification | 18 conservative positives, 49 negatives, 6 invalid-quality cases, 7 partial/interrupted cases and 10 exploratory sensitivity cases |
| Conservative positives | **18/18 detected**, including retained original and AAC192 roundtrip, gains 0.25/0.10/0.05, tested ±0.5% pitch and timing, mild filtering, stereo cases, 44.1/32 kHz roundtrip conversion, noise/reflection and synthetic engine contamination |
| Negatives | **0/49 full-marker false positives**, including each of 31 single-symbol errors, reversed/random words, tones, synthetic engine/siren/impact/noise material |
| Invalid-quality windows | **6/6 INCONCLUSIVE**, including silence, destructive downmix, unsupported rate header, clipping, short capture and truncated WAV |
| Disjoint new-wrapper qualification | **35 held-out cases passed**: 7 new fragment cases blocked, 8 ordinary synthetic negatives admitted, 16 unrelated random temporal words produced no full-marker positives, and 4 additional positive gain cases retained full identification |
| Conservative fragment-review burden | **1/16 unrelated random temporal words** triggered review. It remains INCONCLUSIVE, not a marker-positive verdict. This is a measured false-review burden in authored material, not a GTA-wide rate. |
| Old attribution regression examples | All 12 rechecked examples rejected: the 8 old partial-contamination PASSes became INCONCLUSIVE; the 4 full-marker examples remained FAIL |
| Additional admission/sensitivity tests | **12 cases passed**, including partial target, baseline A, stereo control, quiet/clipped/invalid control and explicit disclosure of the fragment-length limit |

There were **zero full-marker false positives across the 73 negative cases** from the original and disjoint corpora, and zero misses across the 22 predeclared conservative positive cases. These are finite deterministic test counts, not a statistical reliability guarantee.

The exploratory results are preserved rather than hidden. Gains 0.02 and 0.01 of the original became INCONCLUSIVE because the usable-energy gate failed. Tested pitch factors 0.98/1.02 still matched; 0.95/1.05 did not. Timing factor 1.02 matched, while 0.98 and 0.95/1.05 did not. This is a discrete sensitivity sample with alignment effects, not a continuous pitch/timing acceptance guarantee. Synthetic additive broadband-noise tests at +20, +10 and 0 dB whole-window signal/noise RMS detected the marker; −10 dB did not. No live SNR or real acoustic coloration was measured.

The tested 5/15/45 ms interruptions retained enough per-symbol evidence for a complete match. First/last-half and first/last-30-symbol windows did not produce full identity. The new fragment gate blocks those substantial incomplete windows from negative admission. A partial target remains INCONCLUSIVE; the fragment gate never rescues it into a positive result.

Stereo channels remain independently inspected: opposite-phase copies identify on their original channels, while a destructive mono downmix becomes unusable. The planned 48 kHz stereo capture must be retained. Actual rate conversion back to 48 kHz was tested; merely relabeling a 44.1 kHz WAV header is rejected. No normalization, pitch fitting or post-result window selection was added.

## Practical limits and later admission

No authorized unrelated gameplay recording was present among these worktree inputs. The negative corpus uses deterministic synthetic horn-like tones, engine harmonics, siren sweeps, impacts, noise and wrong temporal words. It cannot establish an empirical false-positive rate for all GTA audio, mods, environments or recording chains.

The new gate deliberately does not claim universal contamination detection. An eight-symbol fragment is below its fixed 12-symbol review span and was not flagged. Quiet, pitch/time-shifted, masked or distorted marker material may also escape it. `absent-in-supplied-window` therefore means **no complete word and no qualified fragment in this supplied usable window**, not proof that the recording contains no marker material. Any known or externally observed contamination overrides a conditional signal PASS. Complete declared horn windows, an independently reviewed quiet gap, no reference playback, exact A/B lifetimes, stationary horn origin, capture continuity and manual review remain mandatory. Ambiguity stops progression.

For the proposed stationary horn observations, keep the original fixed parameters and the predeclared capture conditions. Do not fit a favorable pitch/time scale or tune thresholds after hearing GTA. A missing/partial/quiet marker remains INCONCLUSIVE. If actual playback shifts the marker outside the demonstrated conditions, record that result and stop; no retry, fallback or new assignment follows automatically.

The later sequence remains two usable independently reviewed negative baselines, one correctly targeted A request, a complete full-word A observation and an untouched-B control. A positive result would support **one functional authored private horn contribution**. It would not establish complete profile identity, whole native vehicle-audio ownership, engine/exhaust suppression, independent failure recovery or production compatibility.

The marker evidence files are `qualification.json`, `fragment-qualification.json`, `admission-qualification.json` and their three immutable freeze receipts. The new wrapper SHA-256 is `db50d67db76c15138e61e603d0d5eda869db33737886bcaa67de0cdc3d841079`. No existing sealed source, private resource or binary was modified.
