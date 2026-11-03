# ACOUSTIC-WORLD-08: my integrated headless CodeWalker companion

Base: draft PR #87 at `a376ba6b1690ec4a528cc74ac9f108e1f9ed3c8a`. Earlier PRs and historical private/endpoint evidence remain unchanged.

I now have a working, automatically built and packaged **CodeWalker.Core companion** connected to my existing acoustic inventory, tile cache, startup coordinator, solver, PCM renderer and SoundMap. Codex implemented and tested it using actual native binary resources generated from original authored data. This increment is not another portable mock of parser output.

**A genuine Los Santos building and automatic retail-world coverage are not qualified yet.** No installed resource, existing CodeWalker application, game executable, private capture or real key material was opened. My remaining operational prerequisites are private NG capability provisioning, genuine Enhanced resource/placement evidence and an approved installed-source procedure. The native GTA loading-screen/player-control gate is not implemented. I am not presenting this development integration as the finished seamless installation-wide product.

## Dependency and packaging

I chose to proceed with integration and distribution on my stated project understanding. Codex has not verified a blanket licence or written authorisation. Credit: **CodeWalker by dexyfex**, with the [author's page](https://www.gta5-mods.com/tools/codewalker-gtav-interactive-3d-map), original headers, notices and relevant dependency acknowledgements retained. My free/open-source project decision is recorded in [the dependency notice](../third_party/codewalker08/README.md).

The automated build acquires only the pinned public C# source at `485d56bec00262ed7fa472261cce7bbc6202b96e` and public dependencies. It compiles all **114 Core C# files**, including actual RPF, world metadata and collision readers. It packages the headless executable, Core, pinned SharpDX libraries, supervisor, control modules, prelaunch view, SoundMap assets, corresponding source and notices. A bundled Node runtime is checked against its official release checksum. Users do not separately download or operate CodeWalker.

The RichAudio adaptation adds a bounded memory-table entrypoint to the existing Core parser and rejects malformed counts, names, roots, directory ownership/cycles/depth and unknown encryption before interpretation. It does not replace Core with another RPF implementation. Implicit executable/key bootstrap and the missing embedded-resource accessor throw before attempting that IO. The package contains **no `magic.dat`, proprietary keys, game executables or game assets**. Its protected-bootstrap availability is explicitly false.

Build/package entrypoints:

```powershell
pwsh -NoProfile -File tools/Build-CodeWalkerProvider08.ps1 -OutputRoot .local/fresh-provider08
pwsh -NoProfile -File tools/Package-CodeWalkerProvider08.ps1 -OutputRoot build/fresh-provider08
pwsh -NoProfile -File tools/Test-Offline08.ps1
```

These commands build/test original data; they do not install the mod or authorize game-resource access. The companion's `Start-Preparation08.cmd` runs the packaged control host with an exact independently pinned preparation plan. A missing plan is rejected before resource activity. It is not a GTA launcher.

## Functional reader and preparation path

`CodeWalkerHeadlessProvider08` reads explicit staged originals or inherited read-only source handles, with 64-bit file lengths. The supervisor holds file/ancestor identities without changing source ACLs. Large archives are not copied into memory or hashed in full merely to open their tables. CodeWalker decodes the bounded table/name buffer; subsequent member reads retain exact offsets, lengths and content hashes.

| Implemented path | Actual offline evidence and limits |
| --- | --- |
| RPF7 OPEN, NG and AES | Actual Core reads authored native archives. NG uses wholly original synthetic schedules/tables/LUT; AES uses original synthetic material. Missing/wrong capability and unknown tags fail safely. No Legacy material was substituted for Enhanced evidence. |
| Resource representation | Normal headers and deliberately scrambled stored headers decode. Reconstructed RSC7 headers come from Core's entry flags; original stored bytes and reconstructed parser-buffer hashes stay distinct. Ordinary collision is not decrypted merely because its directory is NG-encrypted. Core's extended-size header peek is refused before source IO outside the admitted table prefix; affected archives remain unsupported. Oversized binary decoded-length declarations are rejected before member reads. |
| Nested archives and large sources | Nested range ownership is retained. A **3,000,000,073-byte authored sparse source** is read through an inherited handle using less than 64 KiB of worker source IO; its whole-file hash remains null. This is a size/range test, not a retail archive. |
| Metadata discovery | Metadata-only mode reads actual CacheDat, PSO YMF and DLC setup/content/list inputs. Candidate paging does not read geometry payloads. Resource mode accepts exact member selections. YMF owner/dependency hashes are retained; they do not fabricate room connectivity. |
| Geometry | Actual Gen9-selected YMAP/YTYP/YBN readers supply placements, archetype metadata and collision vertices/polygons/composites to the existing adapters. Unsupported Meta/primitive/layout/activation families remain unknown. Current finite-scene limits remain in force, including 128 triangles and a 128 m cell extent. Oversized geometry is rejected, never truncated into apparently complete coverage. |
| Catalogue/cache | Provider output creates branded existing WORLD04 inventories and WORLD06 catalogue pages. The existing worker/store/coordinator performs conversion, integrity verification, persistence, progressive residency and full declared-domain preparation before any simulated visit. |

The bounded installation-discovery function can enumerate a separately pinned source domain: base/update RPFs, immediate declared DLC packs and explicitly supported flat custom RPF roots. It does not recursively search a drive, inspect executables or establish mount order by sorting filenames. Its directory checks are trusted-control-host planning checks, **not race-resistant OS directory containment or installed-domain proof**. Physical archive candidates still need native identity pinning and decoded mount semantics. Arbitrary custom loaders, loose/nested custom layouts, conditional DLC changesets and ambiguous winners are not qualified by this increment.

The normal resource result preserves logical archive/member, mount/order, filename hash, held physical source identity, table/header hashes, stored range, nested representation chain and parser-buffer identity. Hash-name association alone does not establish a building or collision coordinate frame. The ordinary authored-reference lane requires a separately branded, pinned original-factory proof. It cannot be selected solely by a decoder's JSON label.

For genuine native static input, the existing importer now has a separate reviewed admission lane. A pinned conversion policy binds the exact source/DTO identities, parser, mounts, materials, coordinate/frame and association controls. The trusted host attaches the measured request/receipt only **after** the reader joins, then checks actual resource bytes and mount orders. A decoder cannot admit itself. Direct scene APIs require immutable branded DTOs parsed from the exact reviewed JSON bytes; changing a normalized vertex while retaining the source hash is rejected.

Per-run PIDs, timing and source-attestation receipts are kept outside the stable conversion, tile-plan and inventory digests. Repeated decoding can therefore reuse the same qualified cache content. Content, frame, association, parser and mount changes remain dependencies. Runtime IPL/interior/door/window state stays separate. Actual MLO collision, rooms/portals and dynamic routing remain unsupported/unqualified until real resources and runtime evidence establish them.

Reviewed native geometry remains **derived and partial**. Where missing coverage is unlocalized, the existing solver refuses to fabricate qualified reflection paths. A review receipt is not a complete-world observation. No existing fallback or geometry-confidence guard was relaxed to make a demonstration pass.

## Demonstrated acoustic chain

The actual original-archive acceptance check performs:

`native RPF → actual Core reader → existing resource conversion → persisted tile → SoundMap → existing causal solver/StreamingRenderer`

It decodes **three native resources and five metadata members**, checks **four independently authored world-coordinate controls**, and publishes **two collision surfaces**. The existing solver selects a first-order path of **4.079215610874228 m**, with propagation delay **0.011892756883015242 s**. An authored dry input remains bit-identical between matched open/reflected arms; the rendered stereo PCM differs across **49,152 frames**. No audio endpoint is opened.

Two **fresh supervised reader invocations** produce different execution receipts but the same original resource catalogue. The restart verifies **one cache hit and zero conversion workers**. Additional native-admission regressions repeat this with fresh execution scopes/receipts under a stable conversion policy, while rejecting stale receipts, wrong scopes, changed content and contradictory mount/frame identities. These tests use original resources, not a claimed genuine building.

SoundMap reuses its existing read-only cache/coverage and actual solver publication services. It shows tile/resource identities, geometry, prepared/unprepared/unknown coverage, source/listener positions and selected path distances/delays. Native reviewed geometry has a distinct derived/partial label. Unknown interior connectivity remains absent. Browser visualization has no renderer authority and supplies no decorative paths, recording or game-control operation.

The RichAudio-owned prelaunch view consumes actual provider/coordinator stages, with indeterminate discovery and **“Warming up acoustic cache — XX%”** only when the qualified workload has a known denominator. Processed partial geometry remains partial at 100%. Token/same-origin controls accept no source paths or launch command; cancellation and explicit partial continuation are bounded. It does not hold GTA's loading screen or claim player-control timing. Cross-launch control-head provisioning and the final normal-launch handoff still require product/runtime qualification; callers currently supply an independently retained checkpoint pin.

## Process and audio reliability

The worker is suspended until a fresh zero-capability AppContainer and atomic one-process kill-on-close Job are independently checked. It receives fixed runtime files, bounded stdin and explicitly inherited source handles. The supervisor enforces Job memory limits, deadlines and retained-output limits; it samples process IO counters and rejects excess, which can overshoot the observed threshold before termination. The backend separately reserves its **64 MiB** archive-source-read budget before each read. Table prefixes are bounded to **8 MiB**, individual resource buffers to **16 MiB**, retained stdout to **8 MiB**, and parser concurrency to one. The default native work deadline is **30 seconds**, with bounded termination/join handling.

Joined stdout/stderr lengths and hashes are bound into the supervision receipt. The trusted receipt digest is also returned over the parent pipe before outputs are accepted. Post-worker substitution of a valid JSON output or receipt fails. Cancellation, timeout, output excess, wrong identity, configuration drift and single-use failures are tested. Source ACLs and game files are not changed. The current `profileScratchWritesDenied` receipt field records configured deny-write ACLs; it does not establish that an actual attempted write was denied. Successful profile deletion HRESULT is retained separately from unproven profile-storage absence. A blanket filesystem/network/LPAC qualification is not claimed by the receipt.

The default Bati source, PCM engine, native Windows audio implementation and calibration are unchanged. No fixed PCM queue, extra output latency, native suppression or source reset was introduced. Existing moving-source, cross-tile, override, missing-geometry, expiry and cancellation tests remain in the inherited suite.

Codex reran the independent device-free profiler with six fresh children and 144 calls each. Maxima were **18.2482–19.8490 ms**, with **one overrun in each child** against the unchanged **10.6667 ms** budget. Instrumented source construction occupied **11.4191–12.3238 ms** in that fresh workload; later blocks had zero overruns in this short sample. Dry PCM/cursors/frame counts matched. The report is retained privately, SHA-256 `c2b32243c52210e2d91b1753e9d51db3a17fe4e7c77f554ea52c7f288e85a3f7`. This does not explain the historical 30–80 ms spikes, infer a GC/scheduler cause or measure physical latency. Those findings remain intact.

## Validation and next boundary

The final default fresh local wrapper passes **37/37 WORLD08 tests across nine files, zero skipped**, **23 actual Core controls**, two byte-identical fresh Core builds, **286 exact ZIP file bindings**, extracted package imports/CLI checks, the actual original binary pipeline and the complete inherited WORLD06/earlier suites. Its private result SHA-256 is `d7d0b1cb12da15e73c4e13d5247f80fc35e128c736af33b777e5572986b30e33`; the package ZIP is `de9e9cd36601f005ef1184ecc4c0df7b570d52d9eaad9f94484fbe934f0f25b8`.

That fresh inherited continuity measurement retains **144 calls**, p50/p99/maximum **0.8062 / 3.2187 / 58.3668 ms**, with **one** overrun above **10.6667 ms**. Its cause remains unexplained. The local hardware GPU check also executed; it does not establish endpoint behaviour or a general processing deadline.

Independent review and sanitized bindings are recorded in [the final evidence](../evidence/acoustic-world-08-result.json). Hosted CI is reported separately on the new stacked draft PR after it actually completes. Earlier development failures and superseded original-only runs are retained privately rather than rewritten as successful attempts. Imported licence files retain their original bytes, with scoped Git attributes preserving their line endings and original final blank lines.

My [next read-only proposal](ACOUSTIC_WORLD_08_READ_ONLY_PROPOSAL.md) targets an actual headless NG metadata-and-collision validation, using this implemented reader. It remains blocked from sealing until the private capability/source identities and additional containment predicates are established. This is an operational input/access boundary, not another request to reconsider my CodeWalker project decision. No consumed header/ciphertext/tool/endpoint approval is reused.
