# Installed world import 01

The collision import foundation converts one real installed YBN into private, bounded triangle chunks and a conservative spatial index. It preserves native material identifiers, child transforms and geometry centers. This is verified offline geometry conversion and query support. It does not establish a complete acoustic world or a launch-ready replacement.

The portable result is [world-import-01.json](../evidence/world-import-01.json). Extracted geometry, normalized parser data, parser binaries and local paths remain in ignored private storage.

## Real resource result

The existing trusted local CodeWalker dev46 loaded `apa_ch2_04_0.ybn` from the `mpapartment` patch inside `update/update.rpf`. Its decoded SHA-256 is `4d9a623664896561643b342a4cd9a8f10a0a08e90d76026a19869f36a2da86e5`. The archive SHA-256 before and after extraction matched exactly.

| Measurement | Actual result |
|---|---:|
| Bounds nodes | 7 |
| Decoded vertices | 10,969 |
| Native polygons | 7,375 |
| Native triangle polygons | 5,108 |
| Native box polygons | 1,687 |
| Face triangles reconstructed from boxes | 20,244 |
| Total exported triangles | 25,352 |
| Bounded binary chunks | 4 |
| Degenerate output triangles | 0 |
| Actual parser `GetVertexPos` oracle samples | 48 |
| Maximum oracle difference, native units | 0.000030518 |
| Unsupported sphere polygons | 22 |
| Unsupported capsule polygons | 558 |
| Localized unknown envelope regions | 580 |

All four chunks passed byte-count and SHA-256 checks through the data reader. All 25,352 decoded normals had unit length. A whole-resource query returns all 580 unknown envelopes alongside the supported geometry. An initial query-bounds check found one envelope extending beyond the supported surface bounds; the resource bounds now include unsupported envelopes, with a focused regression test. The corrected index was rebuilt from the second proof's identical normalized input bytes, without repeating the game archive read. Earlier proofs remain intact.

## Geometry and placement rules

The importer adds a geometry's `CenterGeom` before applying its leaf-to-root SharpDX row-vector transforms. It verifies each composite child's parser transform against the actual transformation table, including the parser's second-table or identity fallback. This avoids dropping a child translation or adding the geometry center twice.

This real sample has six nonzero geometry centers and six checked child matrices from `ChildrenTransformation1`; its child matrices are all identity. Nonidentity transforms and nested composition are exercised by the separate authored and synthetic fixtures, not demonstrated by this particular installed resource.

A native box's four indices encode alternating diagonal corners. The converter reconstructs the native edge basis and all eight corners, then emits twelve outward-wound triangles. It preserves rotated and skew geometry instead of replacing it with an axis-aligned proxy. Materials retain their native type, slot, `Data1` and `Data2`; no acoustic absorption coefficients are inferred from those values.

Spheres and capsules remain unsupported surfaces. Their indexed vertices and radius form conservative transformed envelope regions. Queries carry those regions as unknown geometry. Other primitive or unknown families retain explicit missing-coverage labels; a missing surface is never evidence of an unobstructed path.

Raw exports are labelled `resource-root`, `unresolved-static-vs-archetype-local` and `triangle-and-box-surfaces-incomplete`. Native-looking coordinate magnitudes do not establish world placement. No actual YMAP/YTYP entity-to-collision match has been verified for this resource.

The separate qualified reader now binds this exact YBN to the actual CodeWalker-selected dictionary and a native layer-zero bounds-store entry with its cache metadata SHA-256. The complete projection visited 1,571 manifests and 66 cache files, with no interior or conditional map-group membership for this resource. Its exported bounds fit the native cache bounds within an explicit 0.001 native-unit arithmetic tolerance; the largest outside difference is 0.000154496. CodeWalker's `Space` implementation queries exterior YBN bounds directly in its world frame, while interior collision follows a different local-space path. This establishes an exterior/static identity placement in that tool's offline installation model. It does not establish live GTA runtime activation, current streaming state or acoustic coverage. The supplied parser lacks a separate Gen9 selector, which remains a compatibility limitation of the model.

The authored placement resolver handles ordinary `CEntityDef` scale, inverse raw quaternion and translation only when a unique archetype and an explicitly proven archetype-local collision binding are supplied. Resource filename matching is insufficient. It rejects ambiguous bindings, unclassified resource-root geometry and MLO placement. Actual installed DLL metadata confirms the relevant YMAP/YTYP fields; authored tests against that DLL validate four ordinary-entity transform cases, including a deliberately near-unit raw quaternion and a 1,000-unit test point, with a maximum difference of 0.000279553 native units. Raw quaternion inversion preserves the native inverse-length-squared behavior; mirrored placements reverse triangle winding to preserve outward normals. Those are API fixtures, not actual installed entity placement evidence.

The primary format/API references are the publisher's [Bounds.cs](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/GameFiles/Resources/Bounds.cs), [Renderable.cs](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker/Rendering/Renderable.cs), [YmapFile.cs](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/GameFiles/FileTypes/YmapFile.cs) and [Space.cs](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/World/Space.cs). Public development source explains the formulas; the installed DLL's metadata and behavior supply the local compatibility evidence. No exact publisher source revision is claimed for dev46.

## Runnable tools and checks

Run `tools/Export-InstalledCollision.ps1` in Windows PowerShell 5.1 with the existing local parser. Supply `-GameRoot`, `-CodeWalkerRoot`, `-Archive` and the exact full catalogue `-EntryPath`. Use `-LoadKeys` when the existing parser needs its normal local key loader. Use `-HashArchive` for before/after SHA-256 verification. The output directory must be a fresh location under this checkout's ignored `.local` directory and outside the game and parser directories. The tool does not copy vendor binaries, upload data, install a plugin or launch GTA.

The original data reader `src/acoustics/world/collision-resource.mjs` loads bounded candidate chunks after checking their bytes and SHA-256. Queries report candidate triangles, explicit unknown regions and unresolved placement. It is ready for further offline integration, with no runtime audio connection.

The portable checks are:

```text
node tests/Test-InstalledCollision.mjs
node tests/Test-InstalledPlacements.mjs
node tests/Test-StaticWorldPlacement.mjs
node tests/Test-WorldWarmup.mjs
```

The separate local parser API check is `tests/Test-CodeWalkerCollisionAdapter.ps1 -CodeWalkerRoot <existing-local-parser-root>` in Windows PowerShell 5.1. It constructs original skew-box and entity fixtures and requires no installed game asset, game launch or audio endpoint. The extractor and test accept their explicit script-path argument when loaded as a ScriptBlock, avoiding changes to the machine's execution policy.

## Resumable whole-install preparation

`tools/Prepare-InstalledCollisionWorld.ps1` runs in PowerShell 7 with the game root, trusted parser root, resolved catalogue path and pinned catalogue SHA-256. `-PlanOnly` indexes every selected YBN without reading archive geometry. The actual complete catalogue produced 10,663 selected entries: 4,337 eligible unconditional exterior resources and 6,326 explicitly deferred resources. No player-position or radius cutoff is applied. This plan run exported zero geometry resources.

Without `-PlanOnly`, a bounded cycle groups pending entries by physical archive and calls the extractor's exact `-EntryListPath` batch API, with at most 256 entries per archive batch. The archive is scanned once per batch and hashed before/after; only matching content hashes qualify per-entry receipts. Partial directories without those receipts are not cache hits. The driver checkpoints qualified batches, preserves individual resource failures, and revalidates existing chunks and source-archive content hashes before reuse. Its default cycle imports at most 16 resources, with a 300-second budget and a 2,048 MiB owned-job memory limit. Larger work remains explicitly pending for the next cycle.

The shared preparation supervisor assigns helpers to a kill-on-close Windows Job before permitting their code to run. Cancellation and deadlines therefore include descendants. Output stays under ignored `.local` storage, rejects linked ancestors and is protected by an exclusive worker lease. Changes to importer source, parser/game bindings, selected resources or derived map classification invalidate the relevant preparation generation. Custom or newly selected entries are added to the full plan. The selected model remains a pinned metadata snapshot; this driver does not independently rediscover undeclared runtime mounts or prove freshness of every manifest archive.

`summary.json`, `manifest.json` and `status.json` distinguish planned, imported, pending, failed and deferred work. `AllSelectedExteriorImported`, `AcousticWorldComplete` and runtime readiness remain separate. The portable tests exercise resume, archive-content invalidation, custom-map/metadata changes, per-resource failures and source qualification. No long installed-world export has been run.

The exact-entry batch API was exercised against the same proven `0x1c0c33c3` YBN in a fresh private output. Its Windows Job supervised run completed in 51.539 seconds within a 300-second/2,048 MiB limit, with one entry and zero failures. Before/after archive hashes matched, and the qualified reader loaded all four new chunks against the stable full catalogue, returning 25,352 triangles and 580 unknown regions. This validates one real batch entry and does not measure all-map export time, memory or coverage.

## Remaining world readiness work

Full installed/custom-map import still needs effective archive and override resolution, actual YMAP/YTYP collision bindings, reliable world-static versus archetype-local classification, instance placement, MLO/interior transforms and portals, active entity-set/time/LOD decisions, additional primitive surfaces, acoustic material mapping and bounded startup/runtime integration. Dynamic objects need a separate update path.

The installed reference catalogue and this single-resource importer are complementary foundations. Neither attests complete installed map coverage. No all-archive geometry export, engine-audio replacement, endpoint access, deployment or GTA launch occurred in this milestone.
