# RichAudio

## MAJOR MILESTONE — I Heard RichAudio's First Live Bati Audio (1 November 2026)

**On 1 November 2026, I heard my own RichAudio motorcycle engine and exhaust audio running live in GTA V Enhanced Story Mode for the first time.** After all the groundwork, finally hearing it in-game was a major personal and technical milestone. During the supervised Bati session, my audio pipeline submitted **27.832 seconds of 48 kHz stereo PCM** from genuine, changing gameplay telemetry, with **zero reported host playback underflow**. This proves the experimental live vehicle-audio path can produce sound; it doesn't mean the overhaul is finished.

**What I heard, and what I still need to solve:** I thought the sound was good, but noticed what felt like **250–500 ms of latency**. That's my listening estimate, not an objective measurement. The first WASAPI loopback packet carried a discontinuity flag, stopping the recording early: only 32 ms of silent RichAudio PCM and 10 ms of endpoint mix were retained. I didn't change camera mode during this test, so audible camera-transition acceptance remains open. The software fade/shutdown and independent restoration checks passed. **I haven't released a playable public build.**

[Full Stage B result](https://github.com/icydv/RichAudio/blob/feature/playable-01/docs/PLAYABLE_15_STAGE_B_RESULT.md) · [Draft milestone PR #76](https://github.com/icydv/RichAudio/pull/76)

### GTA V looks incredible. Now imagine if it sounded that way.

**I'm building RichAudio as a next-generation audio overhaul for Grand Theft Auto V Enhanced.** My goal is simple: make Los Santos feel as real to your ears as it does to your eyes.

Not just louder sounds. **A world you can hear, feel and believe in.**

> **Project status:** I'm still developing and testing RichAudio. Controlled in-game audio experiments have succeeded, but I haven't released a playable or downloadable sound overhaul. The scenes below describe what I want to build, not shipped features.

## Imagine Los Santos with RichAudio

**A V8 roars to life beside you.** You hear the deep, uneven rumble at idle. As it accelerates past, the sound builds in power, rushes by and echoes off the surrounding buildings.

**A motorcycle screams down a street blocks away.** Even when you can't see it, you can hear it climbing through the revs. Its sound changes naturally as it moves farther away.

**A helicopter passes overhead.** Up close, its rotor beats have incredible weight. Across the city, you might catch only a faint, distant pulse.

**A fighter jet tears across the sky.** Its roar grows as it approaches and fades naturally into the distance — rather than suddenly disappearing.

**Gunfire cracks through an alley.** Echoes bounce between walls. A backfiring exhaust sounds completely different in a tunnel than it does in the open desert.

That's the world I want to create with RichAudio: **a living soundscape where everything has presence, distance and a place in the world.**

## More than a sound pack

I'm designing RichAudio to change **how you experience sound**, not simply swap one recording for another.

I want engines to have depth and character, powerful events to feel powerful, quiet moments to stay quiet, and the environment to shape every sound you hear.

My goal is to enhance the game's **original sounds wherever technically possible**, without permanently editing Rockstar's audio files. I also want to support compatible community-made engine sounds, sirens, exhausts and other audio mods, so players can make the experience their own.

## Built for immersion, designed to grow

My first target is **GTA V Enhanced on PC, in single-player**. My long-term vision covers the whole world: vehicles, aircraft, explosions, weapons, sirens, weather, interiors and more.

I'm also considering potential **FiveM support** in the future, but it isn't confirmed or available. I'm not building RichAudio for GTA Online.

## Where I am now

I've run RichAudio inside GTA V Enhanced Story Mode, collected real vehicle and collision observations, and progressed from an audible camera-fed beacon to **hearing my first live Bati engine/exhaust audio** on 1 November 2026. Development branches also contain a functioning offline acoustic renderer, a Windows audio host, GPU-assisted visibility research, and original V12 and supercharged V8 sound synthesis.

These are controlled research and prototype milestones, **not a finished in-game sound overhaul**. I genuinely heard the Bati audio, but I haven't measured its perceived latency or obtained a complete synchronised recording. Trustworthy engine-state calibration, further live vehicle-audio acceptance, safe coexistence with GTA's original sounds, and measured gameplay performance remain open. See the [development progress](#development-progress) for evidence and limits.

**I haven't released a playable public build yet.**

## Follow the project

If you're interested in where I'm taking RichAudio, watch or star this repository to follow my progress.

For the technical side of my work, see the [roadmap](ROADMAP.md), [architecture](ARCHITECTURE.md), [research](GTA_AUDIO_RESEARCH.md) and [known challenges](RISKS.md).

## Acknowledgements

**[dexyfex](https://github.com/dexyfex)** — creator of **[CodeWalker](https://github.com/dexyfex/CodeWalker)**, the GTA V world viewer and map editor. RichAudio will use CodeWalker to inspect world geometry and help create acoustic maps for modelling how sound is obstructed, reflected and shaped by the environment.

CodeWalker is an independent project; this credit does not imply dexyfex is affiliated with or endorses RichAudio.

---

**RichAudio — Don't just hear the world. Feel its presence.**

*I'm developing RichAudio as an independent fan-made project, not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. I don't distribute Rockstar game files in this repository, and I haven't announced a public software licence or playable release.*

## Development progress

*Progress updated: **1 November 2026**. I use this section to document **verified research and experimental prototypes**, not finished features available to players. Most linked implementation pull requests are **open and unmerged**, so their code is not part of `main`. “In-game” and “offline” refer to different levels of evidence.*

### Verified or partially verified in GTA V Enhanced

- **MAJOR MILESTONE — I heard my first live Bati engine/exhaust audio (1 November 2026):** I heard RichAudio's engine and exhaust output driven by real Bati telemetry during one supervised GTA V Enhanced session. My pipeline produced **490 native/gameplay observations**, **401 changing operating values** and **27.832 seconds of submitted stereo PCM**, with **zero reported host underflow**. I thought the sound was good, although I noticed an estimated **250–500 ms delay** (not yet measured). A first-packet discontinuity stopped the recording, leaving only 32 ms of silent RichAudio PCM and 10 ms of endpoint mix. I didn't test an audible camera-mode change, and direct driver-loss causality remains unproved. Completed software fade/shutdown and independent rollback passed. I consider this a **major breakthrough**, but Stage B is only partially accepted and I haven't released a public build. [Detailed result](https://github.com/icydv/RichAudio/blob/feature/playable-01/docs/PLAYABLE_15_STAGE_B_RESULT.md) · [Draft PR #76](https://github.com/icydv/RichAudio/pull/76).

- **First live vehicle telemetry — verified in-game:** I ran RichAudio in Story Mode and recorded **2,113 samples over 105.6 seconds**, including player and NPC vehicle observations. The normalised RPM getter was not trustworthy, and distant getter results did not prove distant audible traffic. [Runtime milestone](https://github.com/icydv/RichAudio/pull/10).
- **Real-world geometry observations — verified in-game:** I ran controlled collision traces that produced inferred wall and ground patches. An in-game line/HUD debugger displayed **18 valid observations** and supported review, hide and clear without additional scanning. Real surface boundaries, scale, materials and audible reflections remain unverified. [Surface reconstruction](https://github.com/icydv/RichAudio/pull/29) · [Visual debugger](https://github.com/icydv/RichAudio/pull/30).
- **Camera-responsive audio — partial in-game success:** In a supervised test, I heard a harmonic beacon generated from live camera observations delivered to RichAudio's separate audio host; it was **not** a vehicle sound replacement or full spatial/latency certification. I later heard a **600 Hz beacon inside GTA**, but that attempt ended after an output safety-ceiling rejection. The subsequent spatial/level corrections passed offline tests and still require a fresh in-game listening test. [First spatial-audio test](https://github.com/icydv/RichAudio/pull/49) · [Beacon stability milestone](https://github.com/icydv/RichAudio/pull/73).
- **Changing native engine-state candidate — verified in-game, qualification incomplete (1 November):** I ran a bounded Script Hook V Bati experiment that produced **1,869 complete observations and 1,351 distinct raw values** spanning approximately **0.2–1.0**. The signal changed during the ride, but phase markers were not advanced, so stationary revving, acceleration, deceleration and return-to-idle were **not formally qualified**. It is not a calibrated crankshaft RPM, load or redline measurement. [PLAYABLE-07](https://github.com/icydv/RichAudio/pull/76).

### Built and validated outside the game

- **Original vehicle-audio research — offline:** I've investigated GTA vehicle audio containers and engine/exhaust source behaviour, with isolated motorcycle exhaust playback experiments. Seamless, responsive acceleration/deceleration from original recordings is not yet established. [Source research](https://github.com/icydv/RichAudio/pull/25).
- **Causal acoustic rendering — offline:** I've built a renderer that processes original test sound through finite scenes with distance loss, Doppler, obstruction, material filtering and first-/second-order reflections. Observed GTA surface hypotheses can feed the same renderer and PCM pipeline, but scale, materials and continuous in-game coverage remain uncalibrated or unproven. [First acoustic renderer](https://github.com/icydv/RichAudio/pull/47) · [Observed geometry integration](https://github.com/icydv/RichAudio/pull/69) · [Streaming geometry pipeline](https://github.com/icydv/RichAudio/pull/71).
- **Windows audio and GPU foundations — device/offline tested:** I've built a WASAPI host and bounded PCM pipeline that have produced real device output in supervised tests. Hardware DirectCompute visibility work has been measured on an RTX 2080 SUPER with CPU fallback. A separate quality/acceleration/settings overlay has been implemented and tested off-game, **not yet verified as a working in-game menu**. GPU acceleration is not ray tracing on RTX cores. [Audio host](https://github.com/icydv/RichAudio/pull/48) · [GPU and settings](https://github.com/icydv/RichAudio/pull/72).
- **Original V12 and supercharged V8 synthesis — offline:** I've developed two distinct engine profiles that generate separate mechanical, exhaust, induction and other component streams through the acoustic renderer. The one-player vehicle pipeline has passed end-to-end tests from simulated/controlled telemetry transport through synthesis, spatial processing, native PCM and recording, **without a GTA launch or live speaker audition of those vehicle sounds**. RPM and load remain estimates. [Vehicle synthesis](https://github.com/icydv/RichAudio/pull/74) · [Vehicle pipeline](https://github.com/icydv/RichAudio/pull/75).

**My next validation gates:** I need to correct the first-packet recorder fault without hiding real discontinuities, obtain a complete synchronised final-PCM/endpoint capture, objectively locate the perceived audio latency, and repeat a separately approved Bati demonstration with an audible camera transition and deliberate retirement checks. Correctly phase-marked engine-state calibration and reversible, per-source ownership of stock engine audio are also still needed. Stability, physical calibration and release readiness remain open. **No public playable build is available.**

> **Keeping this up to date:** I'll update this section as I validate each milestone, including its date, evidence, limitations and next step. The [pull request checklist](.github/PULL_REQUEST_TEMPLATE.md) prompts this review; it does **not** update the README automatically.
