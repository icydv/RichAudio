# RichAudio

## MAJOR MILESTONE — First Live Bati Audio (1 November 2026)

**RichAudio's own motorcycle engine and exhaust audio was heard in GTA V Enhanced Story Mode for the first time.** In one supervised Bati session, the host submitted **27.832 seconds of 48 kHz stereo PCM** from genuine, changing gameplay telemetry, with **zero reported playback underflow**. This is the first audible in-game demonstration of the vehicle-audio pipeline—not a finished audio overhaul.

**What remains:** The owner reported noticeable **250–500 ms latency** (subjective and not yet measured). A first-packet WASAPI loopback discontinuity cut the recording short, leaving only 32 ms of silent RichAudio PCM and 10 ms of endpoint-mix audio; a live camera-mode transition was not performed. Software fade/shutdown and independent restoration passed. **No playable public release is available.**

[Full Stage B result](https://github.com/icydv/RichAudio/blob/a9e3fa713c1a2877bf3c31fd40c44e16776f53f6/docs/PLAYABLE_15_STAGE_B_RESULT.md) · [Draft milestone PR #76](https://github.com/icydv/RichAudio/pull/76)

### GTA V looks incredible. Now imagine if it sounded that way.

**RichAudio is an ambitious, next-generation audio overhaul for Grand Theft Auto V Enhanced.** Our goal is simple: make Los Santos feel as real to your ears as it does to your eyes.

Not just louder sounds. **A world you can hear, feel and believe in.**

> **Project status:** Experimental development. Controlled in-game audio tests have succeeded, but RichAudio is **not yet a playable or downloadable sound overhaul**. The experiences described below are goals, not shipped features.

## Imagine Los Santos with RichAudio

**A V8 roars to life beside you.** You hear the deep, uneven rumble at idle. As it accelerates past, the sound builds in power, rushes by and echoes off the surrounding buildings.

**A motorcycle screams down a street blocks away.** Even when you can't see it, you can hear it climbing through the revs. Its sound changes naturally as it moves farther away.

**A helicopter passes overhead.** Up close, its rotor beats have incredible weight. Across the city, you might catch only a faint, distant pulse.

**A fighter jet tears across the sky.** Its roar grows as it approaches and fades naturally into the distance — rather than suddenly disappearing.

**Gunfire cracks through an alley.** Echoes bounce between walls. A backfiring exhaust sounds completely different in a tunnel than it does in the open desert.

That's the RichAudio vision: **a living soundscape where everything has presence, distance and a place in the world.**

## More than a sound pack

RichAudio is being designed to change **how you experience sound**, not simply swap one recording for another.

We want engines to have depth and character, powerful events to feel powerful, quiet moments to stay quiet, and the environment to shape every sound you hear.

The goal is to enhance the game's **original sounds wherever technically possible**, without permanently editing Rockstar's audio files. We also want to support compatible community-made engine sounds, sirens, exhausts and other audio mods, so players can make the experience their own.

## Built for immersion, designed to grow

Our first target is **GTA V Enhanced on PC, in single-player**. The long-term vision covers the whole world: vehicles, aircraft, explosions, weapons, sirens, weather, interiors and more.

We're also keeping potential **FiveM support** in mind. That is a future possibility, not a confirmed or available feature. RichAudio is not intended for GTA Online.

## Where we are now

RichAudio has run inside GTA V Enhanced Story Mode, collected real vehicle and collision observations, and progressed from an audible camera-fed beacon to **the first live, owner-heard Bati engine/exhaust audio** on 1 November 2026. Development branches also contain a functioning offline acoustic renderer, a Windows audio host, GPU-assisted visibility research, and original V12 and supercharged V8 sound synthesis.

These are controlled research and prototype milestones, **not a finished in-game sound overhaul**. The Bati audio was genuinely heard, but its perceived latency has not been measured and a complete synchronized recording was not obtained. Trustworthy engine-state calibration, further live vehicle-audio acceptance, safe coexistence with GTA's original sounds, and measured gameplay performance remain open. See the [development progress](#development-progress) for evidence and limits.

**There is no playable public release yet.**

## Follow the project

Interested in where this is heading? Watch or star the repository to follow development.

For the technical side, see the [roadmap](ROADMAP.md), [architecture](ARCHITECTURE.md), [research](GTA_AUDIO_RESEARCH.md) and [known challenges](RISKS.md).

---

**RichAudio — Don't just hear the world. Feel its presence.**

*RichAudio is an independent fan-made project, not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. No Rockstar game files are distributed in this repository. No public software licence or playable release has been announced.*

## Development progress

*Last reviewed: **1 November 2026**. This is a record of **verified research and experimental prototypes**, not a list of features available to players. Most linked implementation pull requests are **open and unmerged**, so their code is not part of `main`. “In-game” and “offline” refer to different levels of evidence.*

### Verified or partially verified in GTA V Enhanced

- **MAJOR MILESTONE — first audible live Bati engine/exhaust demonstration (1 November 2026):** One approved GTA V Enhanced session delivered **490 native/gameplay observations**, **401 changing operating values** and **27.832 seconds of submitted stereo PCM**, with nonzero engine/exhaust output and **zero reported host underflow**. The owner heard the sound and described it as good, but estimated **250–500 ms latency** (unmeasured). The first loopback packet's discontinuity flag stopped capture (32 ms silent RichAudio PCM, 10 ms endpoint mix); no audible camera-mode switch was tested, and direct driver-loss causality remains unproved. Completed fade/shutdown and ownership-verified rollback **passed**. Stage B is only a **partial acceptance**; no public build is released. [Detailed result](https://github.com/icydv/RichAudio/blob/a9e3fa713c1a2877bf3c31fd40c44e16776f53f6/docs/PLAYABLE_15_STAGE_B_RESULT.md) · [Draft PR #76](https://github.com/icydv/RichAudio/pull/76).

- **First live vehicle telemetry — verified in-game:** RichAudio loaded in Story Mode and recorded **2,113 samples over 105.6 seconds**, including player and NPC vehicle observations. The normalised RPM getter was not trustworthy, and distant getter results did not prove distant audible traffic. [Runtime milestone](https://github.com/icydv/RichAudio/pull/10).
- **Real-world geometry observations — verified in-game:** Controlled collision traces produced inferred wall and ground patches. An in-game line/HUD debugger displayed **18 valid observations** and supported review, hide and clear without additional scanning. Real surface boundaries, scale, materials and audible reflections remain unverified. [Surface reconstruction](https://github.com/icydv/RichAudio/pull/29) · [Visual debugger](https://github.com/icydv/RichAudio/pull/30).
- **Camera-responsive audio — partial in-game success:** A supervised test delivered live camera observations to RichAudio's separate audio host and produced an audible harmonic beacon; it was **not** a vehicle sound replacement or full spatial/latency certification. A later **600 Hz beacon was heard inside GTA**, but that attempt ended after an output safety-ceiling rejection. The subsequent spatial/level corrections passed offline tests and still require a fresh in-game listening test. [First spatial-audio test](https://github.com/icydv/RichAudio/pull/49) · [Beacon stability milestone](https://github.com/icydv/RichAudio/pull/73).
- **Changing native engine-state candidate — verified in-game, qualification incomplete (1 November):** A bounded Script Hook V experiment on a Bati produced **1,869 complete observations and 1,351 distinct raw values** spanning approximately **0.2–1.0**. The signal changed during the ride, but phase markers were not advanced, so stationary revving, acceleration, deceleration and return-to-idle were **not formally qualified**. It is not a calibrated crankshaft RPM, load or redline measurement. [PLAYABLE-07](https://github.com/icydv/RichAudio/pull/76).

### Built and validated outside the game

- **Original vehicle-audio research — offline:** GTA vehicle audio containers and engine/exhaust source behaviour have been investigated, with isolated motorcycle exhaust playback experiments. Seamless, responsive acceleration/deceleration from original recordings is not yet established. [Source research](https://github.com/icydv/RichAudio/pull/25).
- **Causal acoustic rendering — offline:** RichAudio renders original test sound through finite scenes with distance loss, Doppler, obstruction, material filtering and first-/second-order reflections. Observed GTA surface hypotheses can feed the same renderer and PCM pipeline, but scale, materials and continuous in-game coverage remain uncalibrated or unproven. [First acoustic renderer](https://github.com/icydv/RichAudio/pull/47) · [Observed geometry integration](https://github.com/icydv/RichAudio/pull/69) · [Streaming geometry pipeline](https://github.com/icydv/RichAudio/pull/71).
- **Windows audio and GPU foundations — device/offline tested:** An original WASAPI host and bounded PCM pipeline have produced real device output in supervised tests. Hardware DirectCompute visibility work has been measured on an RTX 2080 SUPER with CPU fallback. A separate quality/acceleration/settings overlay has been implemented and tested off-game, **not yet verified as a working in-game menu**. GPU acceleration is not ray tracing on RTX cores. [Audio host](https://github.com/icydv/RichAudio/pull/48) · [GPU and settings](https://github.com/icydv/RichAudio/pull/72).
- **Original V12 and supercharged V8 synthesis — offline:** Two distinct engine profiles generate separate mechanical, exhaust, induction and other component streams through the acoustic renderer. The one-player vehicle pipeline has passed end-to-end tests from simulated/controlled telemetry transport through synthesis, spatial processing, native PCM and recording, **without a GTA launch or live speaker audition of those vehicle sounds**. RPM and load remain estimates. [Vehicle synthesis](https://github.com/icydv/RichAudio/pull/74) · [Vehicle pipeline](https://github.com/icydv/RichAudio/pull/75).

**Next validation gates:** Correct the first-packet recorder fault without hiding real discontinuities, obtain a complete synchronised final-PCM/endpoint capture, objectively locate the perceived audio latency, and repeat a separately approved Bati demonstration with an audible camera transition and deliberate retirement checks. Correctly phase-marked engine-state calibration and reversible, per-source ownership of stock engine audio are also still needed. Stability, physical calibration and release readiness remain open. **No public playable build is available.**

> **Keeping this up to date:** Each completed milestone or significant verified event should update this section with its date, evidence, limitations and next step. The [pull request checklist](.github/PULL_REQUEST_TEMPLATE.md) prompts this review; it does **not** update the README automatically.
