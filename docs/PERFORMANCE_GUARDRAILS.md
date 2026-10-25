# RichAudio performance and immersion guardrails

**Status:** Engineering design and offline instrumentation, 25 October 2026. No acoustic renderer is operational and no in-game performance claim has been measured.

## Principle

**Maximum perceived presence, minimum necessary work.** Performance must be engineered into the acoustic design, not patched in after simulating the whole world at full fidelity. Crucially, *importance is not the same as proximity*: a distant, powerful jet or helicopter must remain audible when realistic and supported by trustworthy source data.

## What exists today

The P2-01 telemetry prototype implements a limited, read-only acquisition path:
- RPH getters run on the game fiber; background JSONL writing uses a bounded queue.
- Acquisition uses a configurable **soft** budget (default 2 ms), finite source/census limits and a 2 Hz discovery cadence, with requested sampling no higher than 20 Hz.
- The scheduler skips missed deadlines rather than creating a catch-up burst.
- Full queues cause records to be dropped and counted instead of blocking the sampling fiber.
- The offline capture analyzer now reports the declared budget, measured samples, the number/percentage exceeding it, peak acquisition time and how often sampling omitted sources for budget reasons.
- The analyzer **does not enforce** the budget; it measures it. These measurements are available only for captures with valid budget metadata, and are not currently live GTA results.

**Important limitation:** `World.GetAllVehicles()` and individual framework getter calls are not preemptible from our code. A configured 2 ms acquisition budget is **not** a 2 ms upper bound on RPH execution time. The current first-N candidate selection is not a perceptual priority system. Do not imply that either is solved.

## Future acoustic work allocation (not implemented)

1. **Preserve the audible foreground:** Give the player's vehicle and truly dominant nearby sounds sufficient bandwidth, bass, direct sound and timely state updates. Never silently discard physically important transient events.
2. **Protect signature distant events:** A far-away jet, helicopter or large explosion may outrank nearby ambient traffic. Prioritisation must consider plausible audible energy, category, distinctiveness, motion, masking and source-state confidence, not just distance.
3. **Use graduated detail:** Reserve expensive geometry-dependent reflection paths for relevant foreground sources. Use simpler propagation, reused environmental responses and lower update rates for less important sources.
4. **Update acoustics more slowly than playback:** Cache static geometry and reflections, update changing paths at adaptive intervals and interpolate parameters at audio rate. Avoid synchronous game-thread queries from the renderer.
5. **Bound and degrade gracefully:** Work queues, ray/path counts, acoustic cells, memory, GPU use and per-source compute need explicit caps. A sustained overrun should reduce optional detail with hysteresis; retain essential direct sound instead of creating abrupt silence or audible mode-flapping.
6. **Guard audio continuity:** No allocations, disk writes, locks, blocking calls or expensive geometry searches on a real-time audio callback. Missing/expired telemetry must fade safely rather than extrapolating indefinitely.
7. **Avoid false long-range claims:** GTA may not expose distant, unstreamed vehicles. The renderer cannot restore sounds from entities that are not available without an authorised and verified alternate source.

These are design acceptance principles, not implemented quality presets, acoustic algorithms or confirmed integration features.

## Measurement and release gates

Compare **the same scene and settings** with and without RichAudio, after a verified live runtime integration. Test dense city traffic, tunnels and indoor/outdoor transitions, open roads and distant aircraft. Record at least:
- FPS distribution and frame-time p50/p95/p99 and extreme spikes, not just average FPS;
- game main-thread impact, RichAudio worker utilisation, memory use and any GPU contention;
- acquisition, processing and audio-buffer processing time distributions;
- missed telemetry deadlines, capture drops, source omissions, real-time audio underruns, latency and discontinuities;
- audibility and perceived presence in controlled A/B listening tests.

Do not set universal FPS promises from synthetic/offline benchmarks. Proposed preset names such as Performance/Balanced/Ultra are *future UX concepts* until actual CPU and audio quality budgets are validated. User reference hardware (Ryzen 7 5800X, RTX 2080 Super, 32 GB) is useful for one benchmark tier, not proof of broad compatibility.

**Fail-safe policy:** If optional acoustic work cannot stay within measured latency/CPU constraints, reduce complexity or revert to native game playback for that supported source; never degrade essential game functions or falsely report an unproven native audio fallback as implemented.

## How to read the offline analyzer fields

For a capture with valid `session_start.Metadata.AcquisitionBudgetMs > 0`, the report provides:
- `AcquisitionBudgetKnown` / `AcquisitionBudgetMs`: whether there is a trustworthy declared capture budget and its size;
- `AcquisitionBudgetEvaluatedSamples`: sampled frames with valid nonnegative reported acquisition time and a known budget;
- `AcquisitionOverBudgetSamples` / `AcquisitionOverBudgetPercentage`: frames strictly above that declared budget, in absolute count and percent;
- `PeakAcquisitionMs`: greatest valid reported acquisition duration;
- `BudgetPressureSamples`: frames explicitly reporting one or more vehicles omitted by the acquisition budget;
- `BudgetOmitted`: total *reported omissions*, which can exceed the number of frames.

These counters **describe** sampled acquisition, not total GTA performance, and neither infer FPS loss nor guarantee audio output quality. A capture missing budget metadata must show `AcquisitionBudgetKnown=false` and zero evaluated samples; do not treat this as zero overruns.
