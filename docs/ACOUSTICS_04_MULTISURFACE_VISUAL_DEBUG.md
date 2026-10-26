# ACOUSTICS-04: my bounded multi-surface tile and visual debugger

26 October 2026. **PASS for one bounded, supervised Enhanced diagnostic experiment, including independent restoration.** I've acquired eighteen valid observations and reconstructed separate inferred wall and ground patches. Ordinary world lines and the RPH text HUD worked on the target build: rays, hit markers, white normal indicators and yellow inferred outlines were visible. Display controls kept the count at eighteen. This is not continuous world discovery, certified acoustic geometry or an audio engine. No audio, native muting, source-synthesis or RPM changes are included.

## Continuity and progress

I've started `research/acoustics-04-multisurface-visual-debug` at PR #29's `b9ba543a3af8cf716318da37701df07ed849fccc`, after verifying #29 remains open/unmerged. PRs #26/#27 remain preserved. There is no merge, rebase or source-synthesis ancestry import. The independent synthesis checkout remains clean at `24e1be70eb75c8f7b43e95fe495d3c71dba5dc42`.

The in-game tested source is preparation commit `58240b627f7a13c9fefe0af5baff1cf2a32cf1c0`, built into the sealed observer below. The subsequent result commit changes only this report, README and sanitised scalar evidence. Exact final commit and completed hosted CI readback are recorded on [PR #30](https://github.com/icydv/RichAudio/pull/30); the preparation's green run alone is not proof of the final revision.

Communicated checkpoints before final publication are **0%, 10%, 25%, 50%, 55%, 60%, 65%, 70% and 85%**. Stages 1–3 accounted for 50%; separately approved live testing brought the result to 70%; independent validation/performance/restoration to 85%. At that checkpoint the remaining 15% covered final documentation, publication screening and verified GitHub/CI readback. Only after those checks may the final report communicate 100%. No earlier launch approval was reused for this test.

PR #28 is open on a parallel README branch. I've deliberately copied its reviewed bottom progress section and maintainership template from `4f9419e2202877e18a4d0540677d10819c16e2a8`, retaining its five prior results and adding this explicitly pending preparation. I've corrected the older introductory statement that live telemetry had not yet run. No PR #28 history is merged. Final reconciliation remains necessary when those PRs are integrated.

## Drawing research and exact limits

The pinned authentic SDK `1.124.1393.17586`, SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`, contains `Game.FrameRender`, `GraphicsEventArgs.Graphics` and `Graphics.DrawText(string,string,float,PointF,Color)`. Static PE metadata inspection and compilation establish these signatures, not runtime behaviour. The online [FrameRender documentation](https://docs.ragepluginhook.net/html/E_Rage_Game_FrameRender.htm) describes tick-gathered queued drawing, with possible flicker; a cached search result was available while direct retrieval returned 404. These are historical v0.56 docs, not Enhanced certification. [Graphics methods](https://docs.ragepluginhook.net/html/Methods_T_Rage_Graphics.htm) also list text drawing.

I've selected ordinary [DRAW_LINE](https://www.lcpdfr.com/resources/nativedb/index/graphics/draw_line-r958/), hash `0x6B7256074AE34680`: six world-coordinate floats and four RGBA integers. The live game-fiber presentation loop submits only bounded lines copied from a snapshot. The separate RPH FrameRender callback submits bounded HUD text. No `RawFrameRender`, DirectX hook, debug-only native, polygon, texture, extra framework or unmanaged resource is used. Historical `Rage.Debug.DrawLine` presence does not establish its underlying retail implementation, so I have not selected it.

The ordinary [GET_INTERIOR_FROM_ENTITY declaration](https://github.com/citizenfx/natives/blob/master/INTERIOR/GetInteriorFromEntity.md), hash `0x2107BA504071A6BB`, identifies an interior handle (zero outdoors). This is a base-game native declaration in the community reference, not a Cfx-only extension. Its exact-build invocation remains a live guard: failure stops acquisition rather than substituting guessed context. Generic Enhanced support is not exact-build proof.

If drawing throws, it is disabled and reported unavailable; no alternative native or hook is tried. Console status and the private offline replay remain available. A silent/no-op implementation would require direct visual confirmation to detect. **Compilation and a nonthrowing call cannot prove visible output.** In this run I separately observed the actual world primitives and HUD. World lines can still be depth-occluded or faint at some viewing angles; inferred outlines are not displaced off their measured plane to make them artificially visible. No projection-based live markers or fallback screen-origin points are fabricated. Transparent fills and reflection paths remain deferred.

## Predetermined experiment: two groups, eighteen queries

Plan `wall-ground-two-groups-v1`; exactly one optional `wall` claim and one optional `ground` claim, each at most nine queries. There is no third live group. The atomic, monotonic claim gate cannot reset, including after failed setup. Each claim reserves a private attempt file before querying. The configuration requires a fresh, empty private `tile-evidence` directory under ignored `.local`; reload cannot silently create a fresh budget in that same experiment directory.

Both groups sample one stationary, on-foot pose. Use horizontal forward normalised as `d`, right `(d.Y,-d.X,0)`, row-major order, one world-only `World.TraceLine` per ray ignoring the original player. Preserve the original player identity, speed ≤0.25 native units/s, displacement ≤0.05 and Story Mode/network guards before each call. Yield between calls, stop if the one-second group guard expires; a synchronous call cannot be preempted. A saved duration over one second rejects reconstruction. No retries or favourable subset selection.

| Group | Origin offsets from the sampled player pose | Endpoint |
|---|---|---|
| Wall | right `[-.75,0,.75]`, Z `1+[-.5,0,.5]` | eight native units forward |
| Ground | right `[-.75,0,.75]`, forward `[-.75,0,.75]`, Z `+1` | eight native units downward |

The two manually selected poses must share session/build/interior/generation and remain within 16 native units of the first pose. Interior change, departure or loss of a valid player invalidates the tile and disables subsequent capture without rescanning. Camera movement, pause, showing, hiding, clearing or replay never claims a group. Ground fitting does not require a vertical normal: arbitrary orientations are supported; intended query direction does not prove the observed surface category. Independent review will verify that the resulting groups actually represent a wall and ground.

### Commands and supervised sequence

After separate deployment/launch approval, I will select offline Story Mode, stand on foot on a broad, simple pavement/road beside a plain exterior wall, approximately 2–5 native units away, facing squarely towards it. Avoid traffic, steps, doors, windows, ledges, vegetation and moving/destructible objects across the nine rays. Native units are uncalibrated; appearance does not establish material or collision planarity. I may manually reposition between groups inside the same local exterior tile, remaining stationary for each command.

1. `LoadPlugin RichAudio.Tile.Rph.dll` — initialise only; no queries, display off.
2. `RichAudioTileShow` — READY HUD; zero rays until acquisition.
3. `RichAudioTileWall` — consume the fixed wall group once; actual rays accumulate as issued, then validated hits and any inferred outline remain for review.
4. `RichAudioTileStatus` — inspect unchanged counters. `RichAudioTileHide`, `RichAudioTileClear` and `RichAudioTileShow` affect presentation only. Show replays the retained evidence for 60 seconds.
5. After reviewing the wall and confirming a suitable ground footprint, `RichAudioTileGround` — consume the fixed ground group once. No programmed movement.
6. Review the combined tile and repeat only display/status controls, checking that the total stays at eighteen or the lower actual stopped count.
7. `RichAudioTileStop` — cooperative cancellation, detach drawing and flush final snapshot/metrics. Verify CLOSED before a normal game quit. Explicit unload is only needed if normal completion fails, after preserving evidence.

The observer lifetime is bounded at fifteen minutes, and each Show has a sixty-second visibility timeout. Pause suppresses display without replenishing claims. Nothing automatically starts another group or extends the budget. Initial launcher checks were text-only. I subsequently explicitly authorised live screen viewing for the supervised check. Transient game views were used to inspect the results; **no screenshot or recording files were saved to the research outputs or published**. Public visual demonstrations contain original synthetic geometry only.

## Geometry and immutable presentation contracts

[DiagnosticTile.cs](../src/acoustics/observation/DiagnosticTile.cs) keeps query gating, group provenance, inference and presentation contracts independent of RPH. Existing one-hit and ACOUSTICS-03 adapters, renderers and maths remain unchanged. Nine compatible hits are required for a connected candidate; misses remain unknown support and do not establish actual edges. There is no automatic clustering or merging. Two corner faces remain separate candidates rather than being flattened together.

The original hit rules are retained: finite bounded coordinates; recorded segment membership with `16 × 2^-23 × max(1,|query coordinates|)` arithmetic tolerance; normal-length deviation ≤0.01; common available entity identity; fixed ray/row/order/timestamps/player checks. Returned normal orientation is not independently flipped per point. Point and normal remain observations, not a material classification.

Each group uses original orthogonal least-squares covariance/Jacobi fitting, bounded to 48 iterations. Second eigenvalue ≥`1e-8`, second/largest ratio ≥0.01; every normal within five degrees; maximum residual ≤`max(.005,4 × maximum arithmetic tolerance)`. The footprint is the convex projected support inset by `max(2 × planeTolerance,2 × (maximumResidual+maximumPositionTolerance))`, with numerical containment checks. These conservative research screens do not certify solidity, edges, physical scale, permanence or acoustic reflection. The ACOUSTICS-03 wall-only family restriction is not applied to this separate orientation-independent fitter.

Candidates have group/source IDs, session, exact build, generation, interior, native units, inferred-only status, explicit unknown material/permanence and observed time. At most two are retained; no proximity-based merge or unrestricted cache exists. Current validity expires after one second. Historical records remain replayable, visibly labelled as historical with a separate current-candidate count. Invalidation removes inferred outlines from the presentation snapshot while retaining actual recorded rays/hits. It never triggers a scan. Source-generation support is deliberately one bounded experiment, not robust persistence across reloads or streaming.

The immutable snapshot owns copied structs/arrays; presentation cannot change the observations or fit. Maximum **192 line primitives**, two patches, eighteen records and twenty bounded rejection strings. A complete original synthetic wall/ground example uses **104 lines**. Styles:

| Style | Evidence meaning |
|---|---|
| Blue complete segment | exact query endpoints after a hit/miss return; not a planned/unexecuted ray or an API reservation that throws |
| Green three-axis cross | validated returned hit, no displacement |
| White solid short line | returned measured normal |
| Yellow wire outline | inferred support inside the observed hull, no solid fill |
| White separated dashes | fitted normal, distinct from each measured normal |
| Red HUD reason | invalid/missing/rejected result; no invented red hit coordinate |
| Grey HUD annotation | unknown support between rays/beyond footprint, material/scale/permanence |

No acquisition API is reachable from the snapshot/presentation classes. The sole collision site is inside the explicitly commanded capture routine. The world loop reads the immutable lines; the HUD reads the same snapshot and bounded freshness metadata. The offline HTML/SVG replay consumes those exact exported primitives, not another interpretation of geometry. Invalid projection/coordinates fail closed. No per-frame file writes, fitting, collision queries or unbounded queue exists. Per-frame text/native marshaling still allocates bounded temporary objects; no zero-allocation or real-time claim is made.

## Independent checks, synthetic evidence and reproduction

The independent [JavaScript inspector](../src/acoustics/research/tile-inspection.mjs) rechecks source observations without trusting embedded validation, fits each plane separately, rebuilds the expected inset polygon from source points, and checks every ray, cross, normal, outline, count and expiry against the saved snapshot. It checks combined session/interior/locality too. The replay cannot supply its own polygon as proof of the expected polygon.

Original [C# tests](../tests/Test-DiagnosticTile.cs) cover all seven requested scene types, copied snapshots, source endpoints, normal direction, bounds, invalid coordinates, immutable expiry, cancellation, duplicate groups, concurrent claims and 10,000 replay/control iterations without additional query permissions. [Node tests](../tests/Test-TileReplay.mjs) independently check analytic planes, malformed evidence, projection failure, serialization/escaping, private paths and the separation of capture/drawing call sites. Static separation checks complement execution tests; they are not proof of an arbitrary future edit's call graph.

`./tests/Test-DiagnosticTile.ps1` builds only the neutral core, creates original fixtures under a fresh ignored `.local/tile-fixtures-*` directory, runs **164 assertions**, and checks planes/outlines/snapshot primitives independently in JavaScript, including the private inspector's complete write/readback path. `node --test tests/Test-TileReplay.mjs` passes **14 tests**. The public [synthetic SVG](figures/ACOUSTICS_04_SYNTHETIC_TILE.svg) and [rotatable HTML replay](figures/ACOUSTICS_04_SYNTHETIC_REPLAY.html) contain only independently generated original scene data. They are not GTA screenshots or live results. The SVG has been visually reviewed locally. Orthographic replay is a declared display projection, not a camera reconstruction. The local test browser is unavailable, so no full browser verification or installation occurred; inline replay rotation/hide/show executes against an original bounded canvas/DOM stub instead. No screenshot was captured.

`./tools/Test-Offline.ps1` also passes the retained suites: 17 metadata tests; 40 synthetic acoustics tests; 73 one-hit assertions; 63 surface/paths tests; 53 acquisition/lifecycle assertions plus independent C#/JS readback; 114 Phase-1 checks; 65 telemetry assertions; 9 configuration and 8 append-semantics checks. No proprietary SDK/game resource is needed on hosted runners. SDK compilation is a separate local-only check via `./tools/Build-TileObserver.ps1 -SdkPath <local-authentic-sdk>`; no third-party binary is committed.

After an approved run, `node tools/Inspect-DiagnosticTile.mjs .local/<evidence-directory> .local/<fresh-analysis-directory>` writes private independent results and HTML/SVG to a new directory. Regular inputs are capped at 256 KiB, linked ancestry/public paths/overwrites are rejected. Raw observations, inferred polygons, session IDs and machine diagnostics remain private. Public results will contain only necessary scalar evidence.

## Sealed preflight, preservation and restoration

Fresh read-only verification passes: original **32 root files**, **179 archive metadata records**, **10 sampled archive hashes**, original executable signatures/hashes, independent obsolete-executable backup, original package fingerprints, absent deployment targets and no relevant runtime/tools/PROCMON25. The current game is Enhanced `1.0.1158.16`; RPH `1.132.1428.17748`, DirectStorageFix `1.2`, official XInput loader `1.0.0.2` remain the proven candidate dependencies. They are not newly installed.

I've independently re-fingerprinted **4,857 protected private files / 139 link targets** and **473 prior acoustics artifacts**, without following links. All remain unchanged, as do synthesis ancestry and historical renderers. New outputs are confined to a new ignored private directory.

The revised sealed plan contains **27 temporary file additions**: the same 25 approved runtime/loader/fix files plus the new observer DLL/config instead of the prior experiment's observer pair. No concurrent telemetry plugin, audio plugin or extra loader is deployed. The separately approved reversible executable-selection rename would move the obsolete `GTA5.exe` to `_GTA5.exe`, leaving executable contents unchanged, to select `GTA5_Enhanced.exe`. The established offline configuration and single-launch arguments `-forcesettings -log` are retained. Settings must show the correct Enhanced build and no automatic plugin load before launch.

Sealed ready manifest SHA-256: `321365EF908B187A78AF933CCFA73B9A4FB23073D92F8F98EB427A91BD556FB5`. An earlier unused preparation seal is retained privately as superseded after final fail-closed checks; it is not authorised for deployment.

Observer candidate SHA-256: `5B3D653C767D0021B26A3349BC65840DA9FB12C3DAE9525FE280490AF4C0482A`.

Private helper Verify passed without mutation. After my separate explicit approval, Begin verified the fresh baseline/seals, recorded intent before each rename/addition, used CreateNew, hashed every file and did not overwrite originals. Restore subsequently ran after GTA/RPH/PlayGTAV exited: it reversed the filename, preserved only known introduced/generated files privately, removed known empty created directories, and independently rechecked root names/hashes/signatures, directories, archive metadata/sample hashes and absence of all 27 paths. No unexpected modification remained. No driver or security setting was introduced. A discrepancy would have blocked further work.

## Actual supervised runtime result

I separately approved this exact two-group experiment. The launcher showed RPH `1.132.1428.17748` and Enhanced `1.0.1158.16`; startup script preview and the saved startup script were empty. The previously approved `-nobattleye` Story Mode launch option was rechecked without change. RPH was started once with the approved settings/log arguments. Screen control was interrupted by Escape during launch, before observer loading or measurement. On resumption, the same running Enhanced process was retained; there was no restart or second launch.

The RPH log confirms actual observer initialisation and READY, beyond assembly discovery. The initial HUD showed zero observations/hits/patches, and only the session reservation existed. After the two separately entered acquisition commands, the saved evidence and the live status agreed on **18 calls / 18 records / 2 inferred candidates**, with drawing available. No retry or additional group ran. Camera review did not trigger a scan.

| Live checkpoint | Outcome and evidence |
|---|---|
| Exact Enhanced/RPH selection and Story Mode | PASS — launcher text, running module version, startup log and supervised game view |
| New observer initialised | PASS — plugin READY log, private reservation and zero-count HUD |
| Wall group | PASS — 9/9 valid hits, one predominantly vertical candidate |
| Ground group | PASS — 9/9 valid hits, one horizontal/gently sloping candidate |
| World primitives and HUD | PASS — visible blue rays, green crosses, white normals, yellow inferred outlines and uncertainty/status text |
| Snapshot truthfulness | PASS — all 105 primitives independently recomputed/matched to saved observations and inferred support |
| Hide / show / clear / replay | PASS — supervised controls, final live counter 18, byte-identical final versus acquisition snapshot |
| Stop and normal quit | PASS — CLOSED log, flushed final JSON, detached drawing, normal quit confirmation, no forced termination |
| Independent restoration | PASS — exact fresh manifests, original names/hashes/signatures, 27 paths absent, no relevant runtime/tool/filter remains |

My actual feedback was: **“yes I can see the markers”**, then **“yes I can see both”** after the combined wall/ground question, and **“yes it worked, didnt notice anything wrong”** after the display-control/performance question. These are bounded visual observations, not an FPS benchmark or an audio listening result. The yellow outlines were fainter/angle-dependent on the wall, but visible from the later oblique view. No geometry/presentation parameters were tuned during the run.

The observer was stopped with `RichAudioTileStop`; final metrics explicitly record `Stopped=true`, `DrawingUnavailable=false` and `ActualCalls=18`. The final snapshot is byte-identical to the ground-result snapshot, so show/hide/clear/replay did not alter its geometry. Its current-candidate count expired to zero while historical inferred outlines remained explicitly labelled. No automatic reacquisition occurred. Interior changes, candidate replacement, moving acquisition, negative live targets and all failure paths remain **offline tested only**, not live-certified here.

Independent primitive matching validates the data submitted for drawing, not a pixel-calibrated GPU reconstruction or visibility of every segment. The snapshot contains both continuous measured and dashed fitted-normal indicators; all were submitted using the prescribed styles. Depth occlusion, render-mesh versus collision-mesh differences and viewing angle can affect visibility. No stronger universal visibility claim follows from this one scene.

## Independent geometry and measured performance

The public [scalar evidence](../evidence/acoustics-04-multisurface-summary.json) excludes all raw GTA positions, normals, polygons and session identifiers. Private full records, original query/result data, closed snapshots, independent analysis and generated HTML/SVG replay remain under ignored `.local` storage.

| Measured property | Wall | Ground |
|---|---:|---:|
| Valid hits / planned calls | 9 / 9 | 9 / 9 |
| Maximum orthogonal fit residual, native units | 0.00000965820 | 0.00249017 |
| Fit RMS, native units | 0.00000682938 | 0.00111368 |
| Maximum normal disagreement | 0.000327135° | 1.50730° |
| Retained plane tolerance, native units | 0.005 | 0.005 |
| Inferred footprint vertices | 4 | 5 |
| Inferred footprint area, native units² | 1.45075 | 2.19223 |
| Individual trace min–max, ms | 0.0464–1.5001 | 0.0440–0.0544 |
| Total trace CPU duration, ms | 1.8933 | 0.4269 |
| Acquisition clock duration, ms | 113.5542 | 112.7053 |
| First reconstruction, ms | 19.9744 | 0.0294 |
| Tile update, including defensive repeated fit, ms | 0.8442 | 0.0185 |
| Snapshot generation, ms | 0.0785 | 0.0354 |

Acquisition duration includes the bounded yields and excludes the subsequent reconstruction. The first fit includes uncontrolled initial-use overhead; the later ground fit is not an equivalent warmed comparison, and no optimisation claim follows from their timing difference. The five-vertex ground footprint follows its measured hull rather than forcing a perfect rectangle. Ground is measurably imperfectly planar but passes the original limits. Neither candidate is merged with its perpendicular neighbour or promoted to a known acoustic material.

Across **13,225 world-submission ticks**, CPU submission averaged **0.05812 ms**, maximum **12.1231 ms**. Across **13,229 HUD callbacks**, mean submission was **0.006300 ms**, maximum **1.4251 ms**. There were **883,293 line submissions**, not collision queries. These aggregates mix READY/partial/full snapshots (zero through 105 primitives); they do not isolate the cost of one full tile. The maximum remains relevant and is not hidden by the mean. The final managed-heap snapshot was **10,891,104 bytes**, process-wide CLR memory, not isolated plugin or peak allocation.

These are CPU submission observations, not GPU time, whole-frame latency, FPS, audio-thread suitability or real-time certification. RPH reported a pre-existing RTSS/D3D12 compatibility warning; no settings or software were changed to suppress it. Its effect was not isolated, so no causal attribution or universally stable overlay claim is made. The existing quadratic reflection-solver limitation remains; reflection calculations did not run on the drawing path.

## Verified restoration and retained uncertainty

After the normal quit, GTA, RPH and PlayGTAV were absent. Original `GTA5.exe` and `GTA5_Enhanced.exe` names, hashes and valid signatures were restored. The independent receipt matches **32 original root files, 179 archive metadata records and 10 sampled hashes**, and all **27 introduced paths are absent**. Known generated logs/configuration were preserved privately outside GTA; there were no unexpected files requiring removal. PROCMON25 and diagnostic/game-file tools were absent. The protected **4,857 private files, 139 link targets and 473 prior acoustics artifacts** remain unchanged, as does the separate synthesis checkout.

The game is closed and restored. A bounded inferred footprint is not a verified complete wall/road, between-ray solidity, calibrated metres, permanent map geometry or acoustic reflection. This run did not test interior transitions, arbitrary scenes, large tile caches, moving acquisition, continuous discovery, rendered acoustics, RPM or native sound ownership.

## Publication and next decision

The preparation publication screen had zero findings, and its completed hosted CI passed. The final documentation/evidence revision requires its own screening, commit/PR readback and completed hosted CI before those gates are claimed. Full reachable-history screening retains exactly the four previously reviewed GitHub committer-identity exceptions; these are not newly introduced findings and no history is rewritten to hide them. Git integrity checking reports no corruption; existing dangling objects are preserved. Raw geometry, private paths, SDK/RPH/loader/fix binaries, audio, recordings and logs are excluded. No licence is selected. PR #30 remains stacked on open PR #29; no previous PR is merged or rebased.

**Exactly one recommended next milestone:** bounded local-tile maintenance along one short manually walked path, with predefined acquisition stops/query limits, explicit expiry/invalidation and truthful replay. It needs a new offline design and separate live approval. No continuous scanner, new source synthesis, acoustic output or later milestone begins automatically.
