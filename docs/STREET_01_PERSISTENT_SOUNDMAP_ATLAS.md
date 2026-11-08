# Persistent SoundMap collision atlas

SoundMap opens a prepared GTA V Enhanced collision atlas before it has a listener. I can inspect the whole world, orbit, pan, zoom, choose a collision layer and follow the camera when telemetry becomes available. The atlas never supplies collision surfaces or sound paths to the acoustic renderer.

The previous viewer called the installed acoustic scene worker for a 24-unit view, capped at 512 surfaces and 16 resident resources. A change of 16-unit camera cell, interior proxy or observation lease discarded that view. The worker could recompute and transfer overlapping geometry while the browser rebuilt and sorted projected polygons. The persistent atlas removes those constraints from the world display. The normal producer still owns its 4,096-surface admission bound, original source and observation leases, current layer and activation checks and PCM delivery path.

## Preparing and opening the atlas

From the workspace, run the offline builder with the retained manifest, resolved catalogue and final static audit:

```powershell
node tools/soundmap/build-atlas01.mjs PRIVATE_ROOT MANIFEST CATALOG FINAL_STATIC_AUDIT FRESH_OUTPUT
```

All inputs and output must be under the supplied private `.local` root. The builder only reads derived files. It checks the catalogue, executable and parser identities in the retained records, then verifies index, receipt, original index for analytic extensions, and individual collision chunk hashes. It refuses to publish a manifest for an incomplete build. It uses the known native exterior coordinates and exact retained interior matrices; a resource with no qualified placement does not appear at a guessed location. The output includes source hashes, owner/instance runs, original material IDs, placed unknown-region bounds and unlocated coverage records. Private derived files stay out of Git.

Each 256-native-unit XY cell owns precomputed indexed mesh pages. The detailed level preserves native triangles (Float32 positions and explicit material tags), with pre-tessellated supported analytic surfaces at the recorded approximation tolerance of up to 0.25 native units in resource space. The two reduced levels select existing faces by spatial bin, dominant normal axis and activation class. This reduction can leave visible holes or omit small features at overview scale; it does not join unrelated surfaces, interpolate missing terrain or assert that a gap is clear. Shape family, activation and coverage labels describe the retained collision data; they are not a street map or a complete visual model of GTA's textured assets.

The ordinary SoundMap launcher finds the atlas when `.local/soundmap/world-atlas.json` contains `{"file":"PATH_RELATIVE_TO_DOT_LOCAL/atlas.json","sha256":"EXACT_ATLAS_MANIFEST_SHA256"}`. The path and pin may also be supplied explicitly:

```powershell
node tools/soundmap/server.mjs --root . --port 17833 --view-only --world-atlas PATH_TO_ATLAS_JSON --world-atlas-sha256 EXACT_SHA256
```

Open the printed loopback address. This starts the existing viewer in read-only mode and does not start a game, a vehicle host or an audio device. The `--view-only-map` qualification entry point instead requires an explicit atlas identity, its existing authenticated source receipt, matching catalogue and game bindings, and the original shared session cutoff. A fresh live qualification must pin the new atlas and launcher; earlier proposals do not carry over.

## Viewer and authority

WebGL2 uploads indexed vertex and index buffers in bounded batches, depth-tests world meshes, and culls against each cell's true world bounds. The overview stays in memory. Visible and nearby cells request detail from disk; heading or velocity raises the priority of adjacent cells. A complete detailed cell replaces its overview only after all of its pages upload. The 192 MiB detailed-buffer budget includes active reservations and allows old groups to be evicted by least-recent use under pressure. Missing or damaged detailed pages fall back to available lower detail, with a separate page error. Browser and driver allocation can be higher than the vertex/index accounting.

Teal denotes the layer-zero static model. Conditional groups, higher layers and placed interiors have distinct colors and can be isolated. These are source and activation categories, not active acoustic obstruction claims. The original observation lease and a unique match against the full catalogue are required to display a source-bound interior proxy association. That association withdraws when the proxy changes, disappears or expires; the placed interior mesh stays available as static context. Portal and door state remain unknown. Without a fresh session source receipt, the entire atlas is labelled retained source evidence. The ordinary solver view and replay remain available independently. An acoustic path or admitted surface can overlay the atlas only with an exact matching catalogue and native coordinate alignment.

The prior live stop's `source-proof-unavailable` label was produced by the legacy adapter whenever the scene service's `failed` flag was set. The evidence has fresh cameras and matching before/after installation identities but no underlying worker failure reason. A shortened replay of the final 160 recorded camera poses completed 480 snapshot checks, with no terminal fault and a verified worker join. This rules out a deterministic failure from those retained inputs alone under that replay schedule; it cannot reconstruct the missing live worker error. The adapter now separates worker timeouts/exit, rejected messages, cache access or integrity failures and metadata proof loss, retaining the last binding, request, timings, memory and closure result. The atlas path does not start the legacy visual scene worker, and page delivery/integrity has separate diagnostics.

## Retained-data qualification

The offline build verified **10,663** partial resource artifacts and **101,988,424** indexed source triangles. It placed **10,601** resource models across **1,553** atlas cells, including **745** distinct retained interior instances and **1,212** resource-to-instance placements. It left **62** placements unresolved. The detailed level holds **185,692,675** triangles after placing instances and triangulating analytic surfaces. It draws supported collision, including terrain and structural geometry where present. Of the **662,764** retained analytic records, **662,039** were tessellated, **81** in placed resources were unavailable under the atlas checks, and **644** were unplaced. Neither visual coverage nor runtime activation is complete.

| Level | Triangles | Bytes on disk |
|---|---:|---:|
| World overview | 1,280,572 | 69,463,604 |
| Medium | 13,408,520 | 547,379,772 |
| Detailed | 185,692,675 | 4,049,315,220 |

The private atlas totals 4,681,031,700 bytes including provenance and index. The build took 459.85 s with sampled peak Node resident memory of 435 MiB. An independent readback checked all 4,145 mesh files (5,689 indexed pages) against the pinned manifest and confirmed all three triangle counts. Its manifest SHA-256 is `902fccde7e2735ba6fe69e9b792b940882fd84e5f71b1f941fe20061c982ad6d`.

The local browser fixture exercises the real application and localhost mesh transport with genuine retained geometry and injected camera frames. It does not claim a fresh installed identity check or live GTA activation. It verifies the whole-world view with no camera; urban detail, nearby scope crossings and revisits; rural, mountain, industrial, freeway, tunnel and island views; and an injected Michael's-house proxy association with prompt withdrawal. The RTX 2080 Super rendered through ANGLE/D3D11; the overview took approximately four seconds, and the 20 FPS target held in the traversal samples. An instrumented run observed no empty WebGL frame submissions over the covered traversal. These counts are triangles submitted for visible atlas cells, not acoustic workset surfaces or the number of unobscured triangles after depth testing.

The historical live session reported up to 512 acoustic workset surfaces, 41 recovered display gaps and a 1.78-second longest sampled gap. The atlas replay uses different timings and geometry granularity. It shows that motion no longer triggers a full world reset, but does not measure a gameplay frame-time improvement. GTA contention, additional runtime activation and door/portal state still require separately approved live observation. `AcousticWorldComplete` remains false.
