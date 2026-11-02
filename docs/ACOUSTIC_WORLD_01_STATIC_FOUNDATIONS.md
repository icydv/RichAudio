# ACOUSTIC-WORLD-01: qualified fixture buildings through my existing Bati renderer

I now have a bounded, fixture-backed static-world increment and a matched private Bati reflection experiment. Codex implemented the new adapters and ran the device-free checks. This does not establish an installed-city acoustic map, actual GTA building placement, live reflections or improved speaker latency. My closed PLAYABLE-15 recordings and their approval artifacts remain unchanged.

## Reused foundations and the exact new boundary

The plan omitted an existing foundation that is already in this branch: `src/acoustics/world/README.md` describes the retained CodeWalker collision adapter, binary chunk/index reader, ordinary `CEntityDef` placements, pinned exterior classification and resumable installed-collision preparation. Those files and their proof gates remain intact. Codex ran the four existing authored collision/placement/classification/warmup suites. No installed importer, archive scan, vendor parser or startup hook was executed or enabled.

The new `fixture-placements.mjs` reuses the existing `placements.mjs` / `collision-mesh.mjs` instance transformation and normal recomputation. It adds a deliberately narrow **original-authored fixture** resource format for finite rectangular panels, rectangular openings, ordinary positive uniform scale, unit-quaternion transforms and bounded nested fixture placements. Nested fixture placement is not a claim to decode GTA MLO transforms, portals or active entity sets. Existing ordinary GTA placement tests still exercise their separate nonuniform scale and inverse-CEntityDef quaternion conventions; the new fixture convention is explicitly authored and must not be substituted for those semantics.

The new format is canonical UTF-8 JSON named `richaudio-authored-static-json-v1`. It is not a binary YMAP, YTYP, YBN or RPF parser. No proprietary geometry or source material is committed. The resources under `tests/fixtures/StaticWorld01.mjs` are wholly original metre-model panels and placements.

## Effective resources, static tiles and unknown coverage

`inventory.mjs` resolves an explicitly supplied resource/mount list by normalized relative path and unique numeric precedence. A winning replacement shadows the lower resource; a tombstone removes it. An unsupported winning resource remains unsupported and cannot revive a supported base file. Ambiguous precedence, duplicate identities and path traversal are rejected. This is tested fixture precedence, not proof of every GTA/mod loader's effective order.

`fixture-placements.mjs` verifies resource bytes, lengths, SHA-256 and canonical schema before decoding. It rejects unsupported fields, malformed/truncated data, duplicate JSON keys, nonfinite coordinates, invalid quaternions, unsupported scale and cyclic archetypes. Each surface retains placement/archetype resource references and its full fixture placement chain. Normals, exact finite bounds, openings and tile containment are checked again on cache load, even when an altered payload has a valid recomputed checksum.

Persistent tiles have their own versioned `richaudio-static-world-tile` contract and `authored-fixture-only` authority. They are not historical ray-cache tiles and contain no invented live observation lease. Changed build/map-family/adapter identity invalidates conservatively. The fixed converter revision `authored-panel-transform-v1` participates in inventory fingerprints and tile validation; old or arbitrary revisions cannot be relabelled current. Decoder, placement-transform or surface-validation semantic changes require bumping this revision. Changed resource scopes invalidate affected tiles; unknown/global scopes invalidate all. An unrelated explicitly scoped fixture change can revalidate geometry without reconstructing it. A scoped archetype cannot supply a placement outside that scope.

Coverage stays `represented-static-fixture-panels-only`, with dynamic-world coverage unknown. Unsupported effective formats, missing archetypes and unsupported tile-boundary crossings are explicit gaps. The adapter does not silently clip a crossing plane into a valid reflector. Doors, destruction, runtime IPL/interior activation, time/LOD selection and dynamic overlays are not implemented by this increment.

## Bounded cache and actual background preparation

`static-cache.mjs` stores immutable, checksum-bound `.rastatic` records only under an explicit ignored `.local` root. Publication flushes a new pending file and uses an atomic no-replace hard link. A nonce-owned filesystem writer lease serializes quota checks across store instances. Interrupted/cancelled pending files remain private and are counted by later quota checks; a crash-retained writer lease is not silently reclaimed. Linked parents/files, content drift, schema mismatch and public output paths are rejected. Disk quota and LRU residency are separate.

`scheduler.mjs` uses an actual `worker_threads.Worker` for placement/tile preparation. The local/source-corridor spatial index ranks the bounded tile list deterministically; at most 16 jobs enter one worker batch. A shared cancellation flag is checked during expansion, a finite wall-clock watchdog can terminate the worker, and cancellation/budget failure joins it and discards partial returned tiles. Pause and already-aborted requests start no worker. This is an explicit offline/control-worker API, not an automatic Story Mode scan.

The default limits are 128 resource descriptions, 256 KiB per input resource, 4 MiB resource bytes, 512 expanded placements, 64 panels per tile, 64 indexed tiles, 256 KiB tile bodies, and at most eight resident cached tiles. The prototype index is intentionally small; it is not a city-scale index.

All decode, cache IO and scene construction stay outside game fibers and PCM callbacks. The gameplay integration accepts an in-memory, branded fixture scene only after session/world-digest/generation checks. Its finite 60-second default is an **offline experiment horizon**, not a forged one-second live observation. Only the fully specified authored finite experiment enters the existing solver as `complete-synthetic`; the persistent contract never labels the installed or runtime world complete. Unknown fixture tiles cannot produce a qualified reflective scene. Explicit invalidation, expiry or out-of-bounds poses return to the existing direct fallback without adding a PCM queue.

## Matched private Bati reflection experiment

Codex rendered the same four-second authored operating/pose timeline through `StockGameplay`, its existing `CausalSimulation` and `StreamingRenderer`: conditional direct baseline, qualified empty fixture, one wall across the authored street, and a narrow two-wall passage. The source was the retained private Bati banks, not an original tone or replacement synthesizer. All WAVs and detailed reports remain ignored and private.

All four runs produced the same dry-source SHA-256 and kept one source object plus the original renderer history arrays. The qualified empty fixture's output was bit-identical to the original conditional-direct case. Wall and passage cases produced different PCM and actual finite first-order reflection paths. This establishes geometry-dependent PCM in an authored model; it does not establish perceived quality or actual building-dependent sound in GTA.

| Four-second matched case | Paths | Peak | RMS of difference from empty fixture |
| --- | ---: | ---: | ---: |
| Conditional direct / qualified empty fixture | 2 | 0.05030214 | 0, output bit-identical |
| Authored wall | 4 | 0.05533878 | 0.00446249 |
| Authored narrow passage | 6 | 0.07221899 | 0.01114125 |

The direct engine/exhaust path delays were approximately 11.922/12.322 ms. Wall reflections were 26.194/28.004 ms; passage reflections ranged 19.787–22.894 ms. These are the existing solver's model propagation delays, not telemetry, physical speaker or input-to-ear latency. A separate analytic-distance test checks the wall's finite reflection point and distance; an opening test checks that the existing visibility query leaves the authored hole open.

The pressure calibration remains engine 0.25, exhaust 2.5, master 0.175, with the accepted 10:1 exhaust-reference change and common 0.25 trim. Original source banks, source expiry, retrospective control delay, ring and endpoint buffers remain unchanged. Every case kept 11,558,912 bytes of renderer source history, zero limited samples, zero missing-history samples and zero headroom path omissions. Offline complementary-band energy analysis is descriptive; it adds no render EQ and is not calibrated sound pressure.

The source-pinned run's mean processing was approximately 2.34/2.62/2.62/2.76 ms for baseline/empty/wall/passage, with **one observed block deadline miss per case**. Maxima were 74.94/21.44/16.96/20.13 ms against 10.667 ms per 512 frames. Cold/JIT/scheduling effects were included rather than discarded. These short serial offline renders do not prove GTA/Windows scheduling, perceptual smoothness or universal deadline safety, and no buffer was enlarged to hide misses.

The offline stereo analysis also retains left/right RMS and correlation for each completed WAV in [sanitized fixture evidence](../evidence/acoustic-world-01-static-fixtures.json). These values describe channel interaction, not verified perceived direction or real-street panning.

## Verification and next gate

Run the new original fixtures with `node --test tests/Test-AcousticWorld01.mjs`. The focused suite passes 25 tests, including actual worker start/pause/cancel/budget/join, scoped invalidation, tampered cache validation, cross-instance writer quota, resource precedence, finite transforms and opening/reflection geometry. The four preserved original collision/world suites also pass.

For the private matched-source experiment, run `node tools/Test-AcousticWorld01.mjs --private-package <exact-existing-private-Bati-package>`. It verifies every existing package binding, pins the current acoustic source files, writes new private offline WAVs, compares all dry PCM and checks the unchanged direct-only output. It opens no endpoint and launches no game. Source material stays private; this command does not authorize a new live audition.

The next world step needs a separately supported importer/coverage contract connecting the retained private collision foundation to qualified finite acoustic surfaces. Actual installation precedence, resolved world coordinates, resource scope, materials, unknown regions and runtime changes must be proven before a fixture adapter can be replaced by a real-world provider. My first live street reflection test still requires a new hash-pinned candidate, review and explicit approval. PR #76 and the original game installation remain untouched by this work.
