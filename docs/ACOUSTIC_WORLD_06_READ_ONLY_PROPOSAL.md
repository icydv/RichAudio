# ACOUSTIC-WORLD-06: broad static-discovery viability experiment

**Proposed scope only: blocked from sealing or execution.** I authorize public research and original offline implementation in WORLD06. I have not authorized another installed-resource read, tool/RPH/GTA launch, private capture/key access, export or endpoint operation. Previous archive/ciphertext and external-tool candidates remain consumed. Their approvals are not reused.

My next real experiment should inspect the **whole declared static-world inventory in one bounded batch**, not select one building or depend on where the player has travelled. Its question is whether an available, legitimate Enhanced-capable metadata/archive provider can enumerate the effective base/DLC/custom resource domain and establish usable dependency ownership. It is not another header/tag inspection, GUI startup or claim that a catalogue already contains triangles.

The main unresolved input is a qualified headless provider or existing complete decoded metadata bundle. Reading more encrypted headers cannot supply missing private decryption capability. Codex must not extract keys from a game executable, fetch embedded key assets, launch a normal CodeWalker scan or invent a provider/path to fill that gap. The [feasibility research](ACOUSTIC_WORLD_06_FEASIBILITY.md) explains the static/hybrid route and its present limits.

## Smallest useful experiment: one complete metadata-bundle join

If I can legitimately supply an existing full metadata snapshot, this is the smallest input mode that can answer the broad dependency question without reopening game archives. It is a development experiment, not a manual-export requirement for normal RichAudio use. A future qualified headless reader must obtain the equivalent data automatically.

The frozen input manifest must name every private input path, exact byte length and SHA-256 before approval. No referenced filesystem/archive/tool path is followed. The proposed content is:

1. The declared installation/build/provider/mount-policy identity and the exact source-domain inventory, including explicit absent or unavailable roots.
2. Archive/member index records for every declared archive and nested archive, retaining original name, canonical effective path, type, stored range and source/dependency identity. Retain only world-related names/records in the result; do not extract unrelated audio, scripts, textures or models.
3. All applicable DLC list/setup/content/patch/extra-mount/changeset metadata, not an alphabetically chosen subset.
4. All applicable base/DLC cache records and manifest/YMF dependency/interior/map-group projections, including cache-missing custom resources.
5. Where available, complete YMAP entity and YTYP archetype metadata projections with transform, physics/ownership and activation declarations. A provider must distinguish a decoded relationship from a filename/hash inference. Unknown projections remain missing; no fabricated YMAP-to-YBN relationship is accepted.

No YBN triangle payload is needed for this first join. Its outputs must distinguish **listed**, **metadata-readable**, **dependency-qualified**, **geometry-readable but untested**, and **geometry-decoded**. The last state remains false in this metadata-only experiment. A positive result makes a bulk geometry preparation experiment reviewable; it does not demonstrate full conversion, physical placement or acoustic readiness.

| Proposed fixed bound | Value |
| --- | ---: |
| Input descriptor | One canonical UTF-8 JSON file, at most 65,536 bytes |
| Exact supplied metadata files | At most 128, at most 8 MiB each, at most 512 MiB combined |
| Cumulative content reads | At most 512 MiB plus the 64 KiB descriptor; at most 8,321 direct reads of at most 64 KiB each |
| Streaming normalized records | At most 2,000,000; at most 16 KiB per record; bounded closed fields and dependency arrays |
| Worker | One fixed reviewed decoder/join process; 512 MiB process-memory limit |
| Work deadline | 900 seconds maximum; a limit, not a predicted completion time |
| Termination | Independent cancellation/deadline supervisor; five-second verified child join and a separately bounded shared reader-join budget |
| Private data outputs | At most 256 MiB combined, streaming create-new/checkpointed files |
| Status/diagnostics | 64 KiB stdout and 16 KiB stderr; at most 1 MiB final receipts |
| Game/archive/engine/key access in this input mode | Empty allowlists |

Hashing and parsing must share one forward input pass: no duplicate content hash pass, source-offset reread or implicit buffered overread is authorized. Runtime/helper files have their own exact operational allowlist and are reported separately from metadata-source IO. The worker must consume bounded records incrementally rather than loading the whole source world or every triangle into memory. Actual source shapes and counts must fit these bounds before a candidate is sealed. Exceeding a count/byte/depth/time limit yields an incomplete or failed result; it does not silently enlarge the scope or truncate a supposedly complete inventory.

## Direct installed-read variant: finite archive/member closure required

If the supplied-bundle mode is unavailable, the same broad question requires a separately sealed headless installed-read variant. My installation-root literal is already known from prior supplied text, but it has not been inspected under WORLD06. A root string is not an archive allowlist or a new access approval.

These logical candidates come from the pinned public reference and prior published metadata descriptions. They are **unverified candidates**, not an executable allowlist or proof that each installed member exists:

| Physical archive candidate | Metadata member candidate |
| --- | --- |
| `update/update.rpf` | `common/data/dlclist.xml`, `setup2.xml`, and an explicitly validated `content.xml` declaration |
| `update/update.rpf` | `common/data/gta5_cache_y.dat` |
| `update/update2.rpf` | `common/data/gta5_cache_y.dat`, if the approved inventory establishes this archive/member |
| `common.rpf` | `data/gta5_cache_y.dat`, as a separately classified base candidate |
| Each exact approved DLC archive | Its exact setup/content/patch metadata and cache-enabled changeset's exact `x64/data/cacheloaderdata_dlc/..._cache_y.dat` member |
| Each exact approved world archive/nested archive | Its exact `_manifest.ymf` members and YMAP/YTYP metadata member identities |
| Each exact approved custom source | Only declared supported loader/mount metadata and world-member identities; unknown loader roots are not searched |

The private allowlist must contain the actual finite archive paths and metadata member paths. DLC/cache names must be derived from authenticated, approved metadata and frozen before payload reads; the ellipsis above never becomes a filesystem wildcard. The current archive set, DLC/custom closure, lengths, byte ranges, parser/provider capability and private destination are not supplied. Therefore there is no direct-read command or executable candidate here.

If a bounded source-domain listing is necessary to establish that finite set, it must be included explicitly in the reviewed broad procedure. A proposed closed listing policy is top-level `.rpf` names at the exact approved installation root and `update` directory, immediate pack-directory names under the exact `update/x64/dlcpacks` root, and exact `dlc.rpf`/declared subpack names inside those packs. It permits at most 4,096 directory/name records, two filesystem levels relative to an approved listing root, and 16 declared subpacks per pack. Custom roots require separate exact literal bindings; they are not guessed. All handles reject links. An independent stop/review freezes discovered archive identities before any newly observed archive is opened. Nested archive-table traversal is separately capped at eight levels and 4,096 archive identities within the same metadata byte/record limits.

Those proposed rules are not a current listing permission or an executable wildcard archive allowlist. The final procedure must bind its actual directory roots/provider and specify whether the entire discovery/read closure is covered by one fresh approval. It must not become an unrestricted recursive installation walk. The scope must define the entire batch and its internal review gates together; no recurring per-building approvals or covert fallback to normal GUI inventory is proposed.

The installed variant may read archive table/name metadata only through a legitimate qualified provider, then only the exact approved metadata members. Physical range mappings, compression/encryption identities and output/decompression quotas must be validated before each read. It must not acquire keys, inspect game executables, extract arbitrary files or infer permission from a parser's ability to open them. Unknown/unreadable encryption stops the relevant source with an explicit capability failure.

## Required broad outputs and decision

The experiment must join every supplied/approved world record across the whole declared domain, with no spawn radius, camera position, visit history or first-building selector. It reports:

- Source-domain completeness and any omitted, unknown or limit-exceeded roots/archives. “Complete” refers only to that independently defined domain, never an unmeasured installation.
- Every effective logical resource and its base/update/DLC/custom override chain, including ambiguous hash/name collisions, unresolved patch/changeset conditions and missing winners.
- Cache-to-resource and manifest-to-owner joins, uncached custom candidates, ordinary/archetype-local versus world-bound collision declarations, and unresolved interior/static/conditional classifications.
- Full-domain conversion task identities and dependency edges suitable for startup scheduling, selective invalidation and disk-backed spatial indexing. Cache AABBs are scheduling/missing-region metadata, not acoustic surfaces.
- Distinct counts for known supported candidates, unsupported formats, unknown ownership, conditional variants, readable metadata and untested geometry. A fixed processing percentage must not hide the unknown denominator.
- Actual bytes, time, peak memory, per-source failures and cancellation/checkpoint evidence. No preparation-time promise is inferred from a resource count.

A go decision requires a closed qualified source domain and a useful, reproducible dependency graph with honest unresolved partitions. It qualifies only metadata discovery. A follow-on bulk geometry candidate must then test unvisited resources across the supported domain, account for every supported static variant and preserve unknowns. A source blocked by private decoding data, incomplete custom mounts, unsupported Enhanced layout or licensing/provider identity is a genuine blocker, not a reason to repeat narrow synthetic buildings or another encrypted header read.

## Binding, containment and failure requirements

The candidate must bind the exact reader/provider source, binary, compiler/configuration, loaded runtime closure, source inventory descriptor, input paths/lengths/digests, output roots and independent review receipt. Missing hashes remain unknown; they are not zero values or invented expected digests. First-observed source metadata/range hashes may be recorded as such. Archive table hashes or timestamps do not authenticate unread payloads, and no whole-archive hash is claimed unless that separately approved complete read actually occurs. Strong cache reuse later needs qualified resource-content identities or an equivalently trusted change contract.

Read-only no-follow handles must pin input files and their ancestors, refuse nonregular/multiple-link/reparse inputs and write/delete sharing, and verify identity/length stability. Output parents and create-new/checkpoint publication must be separately protected. No source/system ACL changes are permitted. A decoder receives only approved staged buffers or explicit read-only handles, never an unconstrained installation path.

The parent must independently enforce an atomic one-process Job, memory/time/output/data quotas, cancellation, termination and verified joins before accepting any result. Network access, child creation, arbitrary filesystem reads, plugins/configuration autoloading and key loaders must be excluded by the qualified profile. The WORLD05 pure-JS XML containment evidence does not automatically qualify a different native/archive provider, larger streaming workload or private key capability. There is no weaker fallback if the required containment cannot be established.

On failure, retain bounded private diagnostics, consumed identity, actual completed source/range bindings, joined/unknown process state and unqualified partial checkpoints. A missing receipt is not proof of cleanup. Incomplete checkpoints cannot become “world ready”. One approved candidate identity permits one invocation, including preflight failure; absence of a consumed marker never grants a retry. Changed inputs/provider/runtime/scope or another invocation needs a fresh reviewed identity and appropriate explicit approval. Existing evidence and consumed candidates remain intact.

## Inputs still needed before sealing

1. A legitimate Enhanced-capable headless metadata/archive provider, its exact implementation/runtime identity, supported format contract and permitted use/distribution terms. If private decoding capability is required, its availability, provenance and approved access contract must be established separately; no private key path or value is known here.
2. The exact supplied bundle paths/lengths/hashes **or** the finite physical archive/member inventory and explicitly bounded discovery roots required to construct it. No current private capture is opened to obtain these under this prompt.
3. An independently defined installation/build/mount/custom-source domain, plus the meaning and limitations of any historical metadata snapshot. A declaration cannot certify its own completeness or current runtime activation.
4. A fresh private candidate/result location, final byte/count/output limits, qualified containment implementation and independent source/candidate review.

These are the missing inputs for one broad viability experiment, not an instruction for me to operate CodeWalker, Blender or another mapper during normal play. No GTA/RPH launch, native loading-screen change, geometry export, recording, endpoint access, deployment, suppression or merge is authorized by this document.
