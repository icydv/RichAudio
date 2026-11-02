# ACOUSTIC-WORLD-01 — Building the installed world into RichAudio's acoustics

**Status: architecture and implementation plan only (2 November 2026).** This document authorises no GTA/RPH deployment, live endpoint, game installation modification, automatic full-install scan or further audio test. No new engine or world-mapping functionality is claimed by this planning change. The first two live Bati results and their approvals remain closed, and [PR #76](https://github.com/icydv/RichAudio/pull/76) stays draft.

## What I am building

I want an idling Bati across a real GTA street to sound physically present: powerful engine and exhaust fundamentals, audible mechanical character, appropriate low-frequency propagation, and real building-dependent early reflections. An open street should not sound like a tunnel; an alley should not sound like an empty runway; switching camera mode should not cut out a still-running motorcycle.

I also want RichAudio to understand **the effective world installed on my PC**, including supported replacement and added maps. When Story Mode begins, it should reuse a **versioned, installation-aware acoustic cache** and prioritise the local area. On a new or changed installation, a separately bounded background/offline build can extend this eventually to *all supported static map coverage on disk*. Full-map coverage does **not** mean the entire world is in RAM, all dynamic geometry is known, or all distant vehicles have telemetry.

The sound and the world map are separate inputs to the **existing** `CausalSimulation` / `StreamingRenderer`. Do not introduce a second acoustic DSP engine.

## Exact live-audio baseline: PLAYABLE-15 attempt 2

The [2 November 2026 recording-recovery live result](PLAYABLE_15_RECORDING_RECOVERY_LIVE_RESULT.md) established:

| Fact | Measured result / limitation |
| --- | --- |
| Actual final RichAudio PCM | 33.212 s (1,594,176 stereo frames at 48 kHz) |
| Selected endpoint loopback | 33.190 s; endpoint mix, not isolated RichAudio |
| Output integrity | No reported host underflow; one worker deadline miss (all-block maximum 35.7461 ms) |
| Sampled newer native interpolation endpoint age at submission | Median 146.043–146.076 ms |
| Sampled older native interpolation endpoint age at submission | Median 203.892–203.921 ms |
| Ring admission to first overlapping submission preparation | Mean 62.695 ms; **already included** in the source-age results |
| Camera generations | 1 → 2 → 3; two near-silent PCM intervals of 89.604 and 100.729 ms around the changes |
| Dismount | I reported **binary OFF**, not a convincing natural engine continuation/rundown |
| Perceptual sound | I thought the Bati itself sounded brilliant; latency remained noticeable but unquantified |
| Missing proof | No reliable PCM/loopback waveform offset; no physical input-to-ear latency or direct driver-loss causality |

**Do not add 62.695 ms to the 146/204 ms source ages, claim speaker latency from them, or treat the approximately 22 ms difference between capture lengths as delay.** Preserve the completed PCM and recordings privately. No sound/DSP/volume/source-bank/buffer setting was changed in this test. An acoustic world update must not silently expand this existing software age or weaken the 250 ms original source-expiry gate.

## Existing foundations — reuse, don't reinvent

- `src/acoustics/vehicle/gameplay.mjs` already owns the Bati/vehicle source pipeline and accepts only qualified, short-lived `conditional-observed-model` live scenes through `setQualifiedScene`. It currently clears source pose brackets on listener-generation changes; the latest audible recording reveals the camera-boundary quiet windows requiring focused analysis.
- `src/acoustics/engine/observed-geometry.mjs`, `src/acoustics/streaming/observed-live.mjs` and `src/acoustics/streaming/simulation-worker.mjs` already connect *qualified current observations* to the original path solver and renderer. The ACOUSTICS-08/08.1 route is beacon-scoped, not yet a working Bati+building-reflection integration. [Current evidence](ACOUSTICS_08_1_RPH_GEOMETRY_RELAY.md) is device-free for the real relay.
- `src/acoustics/research/world-cache-format.mjs`, `world-cache-build.mjs` and `world-cache-store.mjs` implement an **offline, research-only** version-1 tile cache of inferred ray-observed surfaces. It has tiny file/entry budgets and reloads as `historical`, `current:false` and `authoritative:false`. [Cache research](INSTALLATION_AWARE_ACOUSTIC_CACHE.md) does **not** scan YMAP/YTYP/YBN assets or prove compatibility with an installed custom map.
- The renderer already produces genuine first-/second-order reflection-dependent PCM in controlled scenes. Its optional CPU/GPU visibility acceleration and 12/16/32/64-path policies do not imply that real GTA building meshes, materials or late reverberation have been proven. Do not claim RTX ray-tracing cores or blanket Quality/Max deadline safety.

## Design: two separate kinds of world evidence

### A. Installation-derived static-world coverage (new, future)

Discover the **effective** supported assets for one GTA Enhanced build and mod configuration. A read-only, locally authorised inventory should resolve actual resource precedence, including base archives, DLC, supported map overrides and explicit interior/archetype placement, instead of treating every file found as simultaneously active.

Proposed import adapters begin with documented `YMAP` placement records, `YTYP`/MLO archetypes and `YBN` collision geometry. Determine which formats, transforms, offsets, LODs, and container variants can actually be decoded on the exact installed Enhanced build before claiming coverage. Decode/validate coordinates, scale, normals, collision proxies, openings and tile boundaries against controlled known landmarks. Do not infer physically correct material properties from arbitrary labels.

The resulting static tiles have **asset-derived, transformed-and-validated** provenance, finite bounds, confidence and versioned schema. Their authority is limited to the static, effectively installed resources represented by each tile. Unreadable or unsupported assets produce explicit *coverage unknown*, never invented walls. The future derived-geometry cache must have its **own versioned contract**: do not promote the research cache's `historical` tiles or forge 1-second live-observation leases to make them appear current.

### B. Current runtime-world changes (existing relay, to extend)

Door, IPL, interior, destruction, object-streaming and other runtime changes require a bounded dynamic overlay, fresh source/session/generation references and expiration/invalidation. A static YBN cannot prove a presently open doorway is closed; absence of a streamed object cannot prove a static absence. Maintain separate static confidence, dynamic observations and genuinely unknown regions. Valid overlays expire independently of persisted static tiles.

This is also where current on-foot collision observations may corroborate, reject or restrict a static tile. There is no continuous automatic raycast scanner yet.

## Future Story Mode startup: responsive, not a mandatory full-world freeze

1. **Load:** identify the supported effective game build/map configuration and load a small, validated manifest/index off the game/audio threads. Reject incompatible versions or uncertain resource precedence.
2. **Warm the local region:** fetch verified cached tiles around the initial player/listener and likely audible source corridors, prioritising high-detail façades and nearby openings. Allow direct-only sound immediately when geometry is unavailable; label its visibility assumption rather than presenting it as a verified clear path.
3. **Build incrementally:** on cache miss, a separately enabled bounded worker processes missing static assets and publishes atomic, immutable tiles. It obeys measured CPU, memory, disk IO, time and queue budgets; can pause during frame-time pressure, cancel on exit and resume on another run. **No game fiber, WASAPI callback or PCM render callback waits for asset decoding or disk access.**
4. **Extend coverage:** maintain a coarse world index/long-distance connectivity layer plus high-detail near-listener/source tiles. Eventually the full supported static installed world can reside on disk; only bounded local/route-relevant chunks remain in RAM.
5. **Invalidation:** update only affected tiles after a provably scoped map change. Unknown/global overrides invalidate conservatively. Runtime doors/interiors/destruction update the dynamic overlay and relevant path states, not the entire install.
6. **Expose honest status:** distinct `not indexed`, `building`, `cached-unverified`, `static-verified`, `runtime-overridden`, `unsupported` and `failed` states, with tile counts and spatial coverage. Never show "entire map complete" based solely on attempted file discovery.

The optional full-map first build may run **outside GTA** to avoid contending with Story Mode. Routine subsequent launches should reuse valid cache and never need to rebuild everything. Automatic live startup inventory/building is not authorised by this plan and needs separate privacy, budget and actual-runtime approval.

## Acoustic runtime integration contract

Do not modify the existing audio callback. Feed a **qualified acoustic scene snapshot** into the existing worker, sharing source/listener coordinates and original temporal provenance. The scene builder selects relevant static tiles, merges any current runtime overlays, and emits finite, stable direct/early-reflection paths with uncertainty and scene generations. It must preserve source-history identity across tile introduction, evictions, camera changes and nonspatial gameplay events.

- **Camera generation:** invalidate impossible listener velocity and spatial path histories. Reuse the original Bati dry-source/grain/operating history where identity remains valid. In the 2 November capture, new camera generations produced approximately 90/101 ms quiet PCM windows with missing selected source brackets. First reproduce those gaps exactly offline, distinguish invalid listener state from unnecessary source retirement, then shorten only the proven avoidable interval. Never interpolate through teleport or fabricated listener observations.
- **Bati dismount:** driver scope loss, vehicle identity loss, engine-running false and explicit engine-off transitions are different events. The first two Bati runs observed combined RPH model/running-scope retirement, not a proven engine shutoff. If a still-running, independently observed Bati remains audible after dismount, retain it as an eligible sound source through a new separately validated vehicle-lifecycle contract. If source evidence is lost, fade safely and report that as scope loss—not a fabricated ignition shutdown. Only an observed engine shutdown may trigger a physically designed engine-rundown sound.
- **Age/queue budget:** geometry queries/preparation cannot occupy the Bati control path or add a fixed audio-buffer stage. Record observation selection, geometry prepare age, cache-lookup/work durations, path/scene update, source block lineage and PCM submission independently. Compare with the **146/204 ms source-age baseline**, including its queue contribution. Reject stale geometry before use; preserve audio-source freshness and report missed updates.
- **Source audibility:** keep the existing Bati DSP/gains/calibration intact during the first reflection integration. Test the same original dry PCM and identical operating/pose timeline with no buildings, with a qualified wall, across a street and in a narrow passage. Compare direct-only versus reflected PCM at matched levels, inspect first-path delays, band energy, panning, natural low-frequency body and headroom. A more bass-heavy result alone is not success.
- **Distant sounds:** a static whole-world map does not create missing NPC/vehicle telemetry. Treat distant-source availability as its own source-provider and gameplay streaming problem; never synthesise actual unseen vehicles from cached geometry.

## Offline implementation increments and acceptance gates

| Increment | Deliverable | Gate |
| --- | --- | --- |
| AW-01 — Baseline and lifecycle research | Exact offline replay of 2 November camera quiet gaps, selected-source histories and binary-OFF retirement; causality/uncertainty report | Preserve raw-source bits and existing PCM fingerprints; no speculative cause, expiry relaxation or new live attempt |
| AW-02 — Installation inventory | Read-only effective-resource inventory and deterministic, fixture-backed parser/placement adapter for a **small supported subset** | Full provenance and override order; invalid/truncated/unsupported formats fail explicitly; zero installed game writes |
| AW-03 — Real static tiles | Validated geometry transforms, finite surface/support extraction, versioned static cache schema, atomic publication/invalidation, bounded spatial index | Synthetic and controlled fixture map A/B tests for moved/removed building, tunnel, new interior and global override; never mark unknown complete |
| AW-04 — World warmup | Background/cancelable tile scheduler, local-priority near-field loading and coarse distant index with transparent status | File-only tests prove no calls from audio/game callbacks, no extra fixed PCM buffer and bounded memory/IO; startup remains direct-audio-capable |
| AW-05 — Bati reflection proof | Integrate a qualified static or observation-backed finite scene with `StockGameplay` through the **existing** simulation/renderer, preserving source history | Bit-exact matched dry source, genuine geometric path differences, valid wall/no-wall comparisons, camera-generation and expiry tests, unchanged direct-only baseline |
| AW-06 — Controlled live street | One separately reviewed and approved exact-installation/rollback test in an open area and beside real building surfaces | Recorded reflection-dependent PCM and listener feedback, measured performance, zero invented paths, clean source/camera/vehicle lifecycle and exact restoration |
| AW-07 — City-scale | Incremental complete-supported-static-world disk cache, map-mod compatibility matrix, neighbor seams, portals and bounded dynamic overlay | Measured cold/warm starts, partial/invalid resources, map modifications, runtime scene changes and high-load memory/frame-time limits; no "any map" claim without evidence |

AW-01 and AW-02 can be independently prepared offline. AW-05 should be gated on real coordinate/scene validity and the exact camera-baseline investigation; do not rush a huge archive importer ahead of the **first real building reflection audition**.

## Next Codex scope (offline only)

Start with a read-only current-repository inventory and the AW-01/AW-02 boundary. Inspect the latest `PLAYABLE_15_RECORDING_RECOVERY_LIVE_RESULT.md`, `src/acoustics/vehicle/gameplay.mjs`, `src/acoustics/vehicle/pipeline.mjs`, `src/acoustics/streaming/listener-playout.mjs`, `src/acoustics/research/world-cache-*.mjs`, `src/acoustics/engine/observed-geometry.mjs` and the existing native geometry relay. Produce an isolated implementation plan and start deterministic, device-free tests/adapters using **original authored fixtures**. Do not parse or redistribute private GTA assets without a separately scoped owner-approved inventory.

No game deployment, RPH/Steam launch, endpoint access, recording, automatic installed-world scan, third-party archive download, dependency installation, private geometry publication, source-bank rebalance, buffer tuning, runtime refactor or merge is granted by this document. Preserve [the 2 November recorded result](PLAYABLE_15_RECORDING_RECOVERY_LIVE_RESULT.md) and the current working playback path.
