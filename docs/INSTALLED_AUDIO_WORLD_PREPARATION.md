# Installed audio/world preparation

This increment reads the actual installation into private, source-bound metadata catalogues. It does not start GTA, open an audio endpoint, decode PCM, suppress native vehicle audio or claim that an acoustic world is ready.

The current measured installation is Enhanced `1.0.1158.16`, executable SHA-256 `b48e80f5fc899eb89e5dcc9f3b68e9551cc8dcfac78b2a940b207e569e9987ea`. It differs from the historical deployment manifest. The supplied CodeWalker dev46 core is SHA-256 `3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8`. No replacement vendor code is included.

## Actual resource inventory

`tools/Build-InstalledAcousticCatalog.ps1` scans base/update archives and the actual ordered `dlclist.xml`, retaining DLC setup/content declarations, all discovered vehicle metadata, and YBN/YMAP/YTYP references. Custom filenames declared as `VEHICLE_METADATA_FILE` are included when their virtual target resolves uniquely. Missing, ambiguous and unsupported declarations remain explicit issues.

The completed metadata run read 173 archives and 103 DLC declarations, producing 1,808 vehicle declarations and 934 unique model names; 13,232 YBN, 19,495 YMAP and 2,739 YTYP references. These references include alternative/patch versions, and are not selected runtime geometry. Sixty-three unresolved registration targets remain visible. Exact extracted-manifest/vehicle-metadata hashes and current executable/parser/source bindings are retained. Archive size/write-time cache validation is labelled separately from content verification.

Optional `-HashArchives` rechecks full archive content hashes. A real full-content run reached its independent 600-second deadline; completed archive caches were retained. It was not reported as complete. Normal startup preparation uses metadata mode rather than hashing every radio/audio payload.

The worker runs outside the game process, with archive/entry/time bounds and cancellation through its private `cancel.request`. An independent parent can terminate only that owned worker. Cache/status publication is atomic; incomplete JSON is quarantined and rebuilt. Fresh run IDs prevent stale status deadlines, and cached entries count against the same aggregate work bound. Private cache reuse is not proof that arbitrary external mod mounts are unchanged.

## Selected CodeWalker installation model

`tools/Resolve-InstalledGameCache.ps1` uses the supplied DLL's real `GameFileCache` implementation to resolve DLC setup order, patched paths, selected resources, vehicle definitions and audio records. The local six-argument API has no explicit Gen9 selector; that capability gap is recorded. Ped loading is disabled. Runtime mount/plugin activation is not observed.

The last raw DLC declaration is not necessarily the highest setup-order level. Selecting `patch2026_01` omitted fourteen independently inventoried model declarations. Selecting the actual final `DlcNameList` level, `mp2026_01_g9ec`, covers every one of the 934 raw declared names. The selected dictionary contains 935 models, 931 matching vehicle audio records and 711 granular records, with zero parser errors. It resolves 10,663 YBN, 5,420 YMAP and 1,707 YTYP entries, 3,893 map archive bindings and 717 patched paths. The ordering model is documented in the [primary GameFileCache source](https://raw.githubusercontent.com/dexyfex/CodeWalker/master/CodeWalker.Core/GameFiles/GameFileCache.cs); actual local API availability was checked separately.

With `-VerifyBankStreams`, the resolver reads actual AWC stream tables without calling `GetPcmData`. It parsed 774 AWC tables and verified 4,258 unique sound-channel links; those appear in 7,090 model-channel uses. Ten ambiguous container channels remain unresolved. A granular record is metadata coverage, not playable source support. Aircraft/rotor/other sound families and banks without a qualified six-state source remain separate work.

Each channel retains full REL stream hash, the CodeWalker-verified 29-bit AWC ID mask, actual container candidates, owning archive/entry, AWC SHA-256, and stream frames/rate/codec. Raw channel volume is retained without invented gain units. Recovered stream names are labelled name-recovery aids; identity uses the actual IDs. Ambiguous containers and masked collisions never select an invented winner.

Example: Prototipo resolves through vehicle `7E8F677F`, granular record `C1CDF10D`, and player sound `4BB86B31`. Channel 0's container `41CA753A` resolves to `mpexecutive/dlc.rpf/x64/audio/sfx/dlc_exec1/prototipo.awc`; full stream `DF7402AA` matches AWC ID `1F7402AA`, 310,495 frames at 32 kHz, codec 0. These are installed metadata/stream-table bindings, not a reconstruction of native granular scheduling.

The `CollisionPlacementIndex` retains all selected manifest interior/map-group memberships and cache bounds rows by hash. Every bounds row includes its cache metadata path and exact hash. Missing keys mean empty membership only when `IndexComplete` is true. The completed index contains 13,032 bound keys; it provides classification evidence to the qualified geometry importer, not triangle/world-space promotion by itself.

## Reproduce without gameplay or playback

From PowerShell 7, supply the actual installation and trusted parser directories:

```powershell
./tools/Build-InstalledAcousticCatalog.ps1 -GameRoot $gameRoot -CodeWalkerRoot $codeWalkerRoot -OutputRoot '.local/installed-catalog'
./tools/Resolve-InstalledGameCache.ps1 -GameRoot $gameRoot -CodeWalkerRoot $codeWalkerRoot -OutputRoot '.local/resolved-catalog' -ReferenceCatalogPath '.local/installed-catalog/catalog.json' -VerifyBankStreams
./tests/Test-ResolvedGameCatalog.ps1 -CatalogPath '.local/resolved-catalog/resolved-catalog.json'
./tests/Test-InstalledAcousticCatalog.ps1
./tests/Test-CatalogLifecycle.ps1
```

The entry scripts own a hidden Windows PowerShell 5.1 worker for the supplied parser. They use the existing trusted-script loading approach and do not change execution policy. All catalogues, metadata projections, cache data and raw parser diagnostics remain in `.local`. Published evidence uses fixed aggregate fields without personal paths, model/geometry dumps or audio assets.

Actual artefact validation checked 935 model hashes, 8,532 channel references, all four previously verified six-channel player banks and 13,032 cache-bound rows. Lifecycle tests cover corrupted cache recovery, interrupted atomic publication, private/reparse path rejection, stale-run deadlines, cancellation and resumed work accounting. These results establish executable preparation, not live RPH compatibility, audible distance, source quality for every model, complete world geometry or selective native replacement.

The combined `Prepare-InstalledAudioWorld.ps1` workflow subsequently passed a real three-stage preparation run in 102.532 seconds using genuine archive caches: installation inventory, verified bank/resource resolution, and a complete selected-YBN classification plan. Source/input bindings were stable. The plan retains 4,337 pending exterior imports and 6,326 blocked resources; it does not export the world during this smoke test. An earlier run correctly refused completion when the world driver changed during execution, and that failed evidence remains private.

An unchanged-input startup resume then completed in 3.897 seconds, checking every stage receipt and artifact digest before reusing all three stages. It spawned no stage worker. This is preparation/cache reuse evidence, not measured startup performance under GTA load.

Whole-installation metadata and a preparation queue do **not** extend audible range. Existing live/reference propagation still has a maximum 2-second path delay, approximately 2.5 seconds of source history by default, a 256-metre local scene/conditional region, and at most 16 emitter histories. The separate existing vehicle-live demonstration remains one attached vehicle. No range, history, scene or live-vehicle-count limit is increased by this increment. Distant source acquisition, long paths across qualified geometry and actual long-range listening remain unimplemented/unverified integration work.
