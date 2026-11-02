# ACOUSTIC-WORLD-02: collision sources and bounded acoustic world preparation

I now have an executable offline collision composition and a real-resource-format foundation feeding my existing acoustic engine. Codex implemented original contact fixtures, rendered private demonstration PCM, exercised explicit original YMAP/YTYP/YBN binaries with my existing trusted CodeWalker parser, and added bounded static preparation plus a separate dynamic overlay. This increment does not establish installed-map coverage or live collision acquisition.

My Bati sound banks, calibration, gains, source expiry, buffers and gameplay renderer remain unchanged. These additions have no gameplay activation and acquire no native ownership. They coordinate with the [vehicle-component contracts](ACOUSTIC_WORLD_02_COMPONENTS.md) and the existing prepared-transient architecture. The previous source-age measurements of approximately 146/204 ms at PCM submission remain the measured live baseline; their included 62.695 ms ring interval is not added again. These offline demonstrations do not update physical speaker latency.

## Collision contract and original sources

The [collision contract](../src/acoustics/collisions/contracts.mjs) preserves the exact session, vehicle generation, model, component, assembly and component generation. Each event also has an event ID, crash ID, ordered sequence/contact ordinal, participant set and optional admitted parent. Primary impacts, glass and secondary debris can coexist without reusing one source identity or replaying an event. A lifetime ledger admits at most 1,024 event identities, 64 crashes and 32 subevents per crash; rejected consumed identities cannot later become substitute events. The demonstration composition allows at most eight event sources.

Occurrence is an interval, distinct from observation, admission and scheduled emission. The authored clock has a maximum two-millisecond occurrence width and 250-millisecond admission age. A finite source duration and positive stationary pose horizon are required. Source disappearance, vehicle generation change and session stop remain distinct from dismount and engine shutdown. Nothing in this ledger infers an engine-off event.

Contact position, unit normal, relative velocity, participants and material confidence are explicit **original authored fixture inputs**. Severity accepts authored effective-mass/normal-closing-velocity energy, an authored contact impulse, or a friction-times-load-times-tangential-speed proxy for scrapes. None is claimed to be measured acoustic sound power. Unknown material remains unknown; it cannot silently select a glass model. The original source has zero output for zero supported severity, bounded dry peak and finite duration. Its deterministic signal and phase are independent of acoustic scene changes.

The motorcycle/barrier and wall-scrape fixtures place contact exactly on the corresponding finite surface. A separately declared five-centimetre radiator offset lies on the exposed side; it is an authored assembly approximation, not an observed GTA attachment. The scrape represents material passing a fixed contact patch. It does not demonstrate a moving impact radiator, live tyre contact, structural simulation or a measured crash impulse.

Original metal/plastic/unknown impacts, glass and friction noise pass through the existing `VehicleAcousticPipeline`, `CausalSimulation` and `StreamingRenderer`. The demonstration prepares genuine finite direct, first- and second-order paths. A conservative aggregate bound includes releasing paths and fractional-history interpolation. The optional late field reuses the existing bounded FDN only for the complete authored analytic tunnel, with explicit diffuse/Sabine assumptions and wet coefficient 0.12. It does not attach generic reverb to open scenes or infer an enclosure from missing geometry.

Short impacts also enter the existing branded prepared-transient kernel and descriptor path. Their complete original waveform, original occurrence and physical propagation are retained. Long scrapes remain continuous sources. Preparation requires source and listener pose horizons, the exact scene session, and tile plus per-surface lifetimes through the entire prepared tail. A source cursor cannot start after its scheduled onset and silently chop the attack. No 75–100 ms retrospective vehicle wait is inserted into this authored event bridge. Native acquisition, clock mapping and coexistence remain separate gates.

## Matched original PCM and measured limits

The final original render receipt is SHA-256 `e605886fe1b24fda6328f17071e2f894c4c9dd40ee799edb5283ee2fafc31aa6`. It binds the recursive source closure, executed Node binary and seven private Float32 stereo WAVs. Each arm has 144,384 frames (3.008 seconds). The [sanitized evidence](../evidence/acoustic-world-02-collisions-world.json) retains all peaks, energies, dry/output/WAV hashes, physical path delays, scheduling, worker costs and memory snapshots. These files are generated demonstrations, not recordings.

| Original scene | Peak amplitude | Stereo squared-sample energy | Qualified paths | Worker median / p95 / p99 / max, ms |
| --- | ---: | ---: | ---: | --- |
| Motorcycle at barrier | 0.00183811 | 0.000337635 | 4 | 0.2711 / 0.8726 / 4.4658 / 6.6490 |
| Same motorcycle contact, open | 0.00129866 | 0.000098650 | 1 | 0.1318 / 0.3402 / 0.9526 / 1.8699 |
| Light fixed-patch wall scrape | 0.00049350 | 0.000185879 | 8 | 0.4241 / 0.8192 / 1.5197 / 7.3046 |
| Three-event crash, open | 0.00091590 | 0.000074036 | 3 | 0.2423 / 0.3681 / 1.2571 / 2.2369 |
| Same crash, street canyon | 0.00091590 | 0.000091857 | 24 | 1.0709 / 1.5156 / 1.9367 / 3.2375 |
| Same crash, tunnel | 0.00091590 | 0.000114702 | 39 | 1.7580 / 2.1126 / 2.5839 / 4.2300 |
| Glass impact, street canyon | 0.00010667 | 0.000001395 | 8 | 0.3593 / 0.4921 / 0.5999 / 0.9729 |

The three crash arms have identical original primary/glass/debris dry hashes and different rendered PCM. Open space has three direct paths; the canyon adds nine first-order and twelve second-order paths; the tunnel has twelve first-order and twenty-four second-order paths. The tunnel's separately measured late energy is `5.3778819486668365e-8`. Relative energy changes follow the authored scene, not an output normalization or gain increase.

All seven arms report zero affected source-history frames, renderer limiting, headroom path omissions and worker samples over the 10.667 ms block duration in this run. Each has 282 worker cost samples. Same-process RSS snapshots range from 69,332,992 to 127,553,536 bytes; they include the process, harness, retained arrays and preceding arms. They are not isolated or peak collision memory. Worker measurements include source/control preparation, rendering and optional late processing; they are not audio callback costs or adverse-load guarantees.

Block admission adds zero software emission lateness to the primary impact and debris, and 256 frames (5.333 ms) to the glass subevent in these authored scenes. The high-energy first output is at frame 10,750 after its frame-10,240 source event, with genuine propagation and waveform onset. Those quantities are not event-to-WASAPI submission, game responsiveness or physical input-to-ear measurements. Functional PCM differences and correct analytic delays do not establish perceptual realism or a physically calibrated crash sound.

## Actual resource-format foundation

The new [explicit byte-array adapter](../src/acoustics/world/CodeWalkerStaticResourceAdapter02.cs) uses the retained trusted CodeWalker public APIs to decode **RSC7 YMAP v2, YTYP v2 and YBN v43**. It accepts an explicit byte array, kind, SHA-256 and provenance. It has no installation path, game root, archive discovery, game keys or file IO API. Compressed inputs and declared decompressed pages are bounded to 16 MiB, with at most 4,096 ordinary entities/archetypes.

Codex checked the upstream [YMAP](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/GameFiles/FileTypes/YmapFile.cs), [YTYP](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/GameFiles/FileTypes/YtypFile.cs) and [YBN](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/GameFiles/FileTypes/YbnFile.cs) implementations as primary research. My executable evidence binds the actual local `CodeWalker.Core.dll` SHA-256 `3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8` and both SharpDX dependencies. Upstream master is research context, not asserted source provenance for that binary.

The test runner constructed wholly original YMAP/YTYP/YBN bytes twice and verified byte determinism. A fixed authored `CBlockDesc` avoids the YMAP editor's current-time export string. The original binaries contain one regular placement, one regular archetype and one finite material-tagged collision triangle. The runner decoded the actual bytes, then independently resolved the placement and collision binding in Node and rendered an original collision through the resulting finite triangle. It also rejected nine wrong-digest/version/page-budget controls.

The final binary/resource receipt is SHA-256 `72d207084c4d212d40ae32562caa676891833cd2d50505d696ee304e381fe780`. The matched dry signal is unchanged; open PCM SHA-256 is `b117597b35a893c2d1d0177c6d7222b418629e8aec95712139f6ada4af4d12e1` and resource-scene PCM is `da27d9db1119e6763aeebb649bde0f857309b7b25365a834904bb6a29c2d80c0`. The decoded triangle produces a three-metre reflected path, 419.8250728862974 frames at 48 kHz and 343 m/s. The finite footprint excludes the surrounding bounding-rectangle corners. No limiting or source-history fault is reported.

The [resource-scene bridge](../src/acoustics/world/resource-scene02.mjs) applies explicit mount precedence, tombstones, regular placement/quaternion transforms, collision-resource links and material assumptions. An archetype's physics-dictionary hash does not by itself prove a YBN link. Native material numbers do not become acoustic coefficients. Missing links, unsupported bounds, unknown activation and missing material qualification remain unqualified rather than clear space. The versioned `richaudio-explicit-resource-static-v2` identity includes effective resource hashes, placement/material bindings, converter revision and coordinate basis; the real-resource cache identity is a foundation, not an implemented whole-installation cache builder.

**Enhanced/Gen9 layouts, effective installation mount order, conditional/MLO/time/weather/entity-set activation, exact native coordinate scale and installation material calibration remain unverified.** The executable parser subset is not proof that every installed Enhanced or compatible custom-map resource has that format. The original fixtures do not discover real buildings, tunnels, interiors, doors or live destruction. No private installed map bytes were read. A future explicit-resource adapter test needs separate installation-access authorization and format/mount validation.

## Bounded static runtime and separate dynamic overlay

My [runtime foundation](../src/acoustics/world/runtime02.mjs) adds a spatial index with a 262,144-tile ceiling, bounded 128-metre cells, at most 4,096 unique query candidates, eight resident tiles and at most eight selected tiles in one background preparation. The ten-thousand-tile regression visits fewer than sixteen references in at most 27 nearby cells. This is a bounded-work functional check, not a full-world memory or throughput benchmark.

The existing separate fixture-static disk store and joined background warmup worker prepare nearby geometry asynchronously, prioritizing the listener before distant sources. Cache reads must match the selected world digest, tile ID and exact bounds. A same-world cache key cannot substitute another tile. Geometry IO, parsing and scene preparation are control/background work, never the GTA game fiber or audio render callback. Loading adds no fixed PCM queue and does not reset source objects. This prototype is not wired into Story Mode startup.

The runtime may cache surrounding tiles but publishes **one exact qualified tile containing the listener**. It never fills the rectangle between noncontiguous tiles with verified empty geometry. Overlapping tile volumes require explicit layer resolution; unknown primary tiles withdraw the prepared scene. Cross-tile acoustic unions and the scalable installed-world cache writer remain unqualified. A retained scene applies only within its qualified bounds while a replacement is prepared.

The separate bounded dynamic overlay stores at most 32 exact session/world/generation objects with 250 ms leases. Original stationary replacement panels can represent authored door/open/destruction changes. Removed base surfaces must exist, and their entire finite extent must fit the declared affected region. Conflicting surface removals or overlapping object regions require a priority resolver and are rejected. An expired or moving object removes its superseded static panels and leaves the affected region unknown; it cannot restore a closed door or leave an unobserved hole clear. Composition creates an immutable existing-engine scene on a control worker and never modifies the static cache. Actual moving reflectors and native door/destruction acquisition are not implemented.

Independent peer review found and closed three qualification errors: noncontiguous-tile gap filling, same-world cross-tile cache substitution, and a tiny dynamic region erasing an entire wall. Reciprocal source review also closed attack truncation and insufficient prepared source/listener/tile/surface horizons. Narrow negative regressions retain each trigger. Earlier receipts remain unchanged.

## Validation and next integration boundary

The focused device-free runner passes **23 tests**: seven collision/source tests, nine runtime/overlay tests, four resource-scene tests and three waveform-hook tests. The waveform extension keeps all eight prior LATENCY-02 delta PCM hashes unchanged. The coordinated PR reports the broader native host, transport, recording, source-history, camera, continuity and default Bati regressions separately.

```powershell
node --test tests/Test-CollisionAcoustics02.mjs tests/Test-WorldRuntime02.mjs tests/Test-ResourceScene02.mjs tests/Test-PreparedWaveform02.mjs
node tools/Render-CollisionAcoustics02.mjs --output .local/world-02/<fresh-original-demo-directory>
# Optional local trusted parser dependency; original in-memory fixtures only:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Test-StaticResources02.ps1 -CodeWalkerRoot <reviewed-CodeWalker-directory> -OutputRoot <fresh-absolute-private-world-02-directory>
```

The reference RPH declarations offer credible `GetLastCollision` contact position/normal/material polling research, but no independently verified collision event identity, complete contact multiplicity, occurrence clock or impulse on my exact Enhanced/RPH stack. The [component research and ownership matrix](ACOUSTIC_WORLD_02_COMPONENTS.md) preserves those limits. Original authored scenes are a working development path, not a substitute for that missing acquisition evidence. Every component stays native-owned until safe selective suppression, accurate replacement timing and independent restoration/failure recovery are demonstrated.

My next implementation step is a separately qualified resource/mount and contact-event adapter, followed by explicit runtime scene-generation integration. No GTA/RPH launch, endpoint access, deployment, game recording, native suppression, proprietary asset extraction or merge occurred for this increment.
