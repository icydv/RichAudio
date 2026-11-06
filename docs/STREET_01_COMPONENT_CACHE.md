# STREET-01 shared static geometry

I want repeated local acoustic requests to reuse the same validated static geometry while each new observation keeps its own position, generation and original freshness deadline. Codex implemented the component cache, bounded diagnostics and authored regression tests described here. This change does not establish live GTA activation, whole-world completion or a successful genuine-installation qualification.

## What the original pressure fixture proves

The retained failed qualification reports repeated query misses, rereads and analytic tessellation. Its old per-query keys and entry sizes were not recorded, so the exact historical GTA eviction sequence remains unknown.

Codex reproduced the same computational pressure with entirely original arithmetic geometry before changing the algorithm. In that construction, a wide view contains 17,268 records and is charged 70,730,240 bytes under the old `512 + records × 4096` accounting. It exceeds the unchanged 64 MiB byte limit while remaining below the 32,768-record admission ceiling. Other views charge 33,554,944, 8,598,016, 44,777,984 and 43,532,800 bytes. Repeated queries revisit the same five keys, but these overlapping copies evict each other by bytes. The instrumented baseline records no resource-owner or entry-count cause for that cycle.

This establishes a concrete failure mechanism in the original reproduction. It does not recover unrecorded native per-query geometry or prove that every historical miss had that precise cause. The old implementation also admitted a view before evicting previous views; its retained accounting limit was not a hard cap on transient allocations or process memory.

## Representation and accounting

The replacement stores source components independently of radius and query-view membership:

- A native chunk retains its exact copied binary payload: a 24-byte header and 96 bytes per triangle record.
- Native and analytic components retain six `Float64` bounds values per record, exactly 48 bytes per record.
- Each retained component adds a conservative 4,096-byte metadata charge. An analytic component uses the same packed record representation after the existing tessellator validates the exact requested controls.
- A lazily materialized immutable triangle record, including its bounded ID, shape and whole-triangle panel templates, keeps the existing 4,096-byte boxed-record charge. Selection does not retain a second boxed copy for each radius.
- At most eight query descriptors retain identity and audit metadata, charged 512 bytes each. They retain no geometry arrays, triangle references, scene headers or listener pose.

One LRU pool covers packed components and boxed records. Before admission it evicts enough entries to keep their aggregate accounted retention within `64 MiB − 4096 bytes`; the 4,096-byte reservation covers all eight descriptors. The sum of actual component charges and actual descriptor charges therefore stays within the existing 64 MiB ceiling. The limit was not increased, and boxed geometry was not silently assigned a smaller charge. The previous 32,768-record view ceiling is no longer an admission rule for a duplicated view array, because those arrays are no longer retained; native query, analytic tessellation, resource, active-surface and transport limits remain in force.

These are retained-geometry accounting bounds. JavaScript object overhead, bounded diagnostic metadata, loaded resource indexes, in-flight references, file-read buffers, final scene construction and garbage-collection overlap are not a claim of a 64 MiB process-heap cap. Process memory remains a separate measurement and qualification limit.

## Identities and invalidation

Every native component identity includes its resource-owner binding, chunk identity and expected content hash. The owner binding retains the existing index, receipt, catalogue, archive, current-validation epoch and current-proof inputs. Analytic identities additionally include the complete immutable primitive, including source family, geometry and material fields, and the exact approximation controls. Node and polygon numbers alone are insufficient because the validated index permits different source families with those same numbers.

Every selected chunk is still read and SHA-256 checked for each request that selects it, including a query-descriptor hit and a packed-component hit. A hash match permits reuse of geometry already decoded from those exact bytes. File size and file type checks remain required. A changed byte with its original size and modification time restored still fails. Descriptor hits are reported separately from component hits, decodes and tessellations.

World binding or validation-epoch changes clear the pool. Receipt, index, archive or proof changes, proof withdrawal, resource removal and resource-owner eviction invalidate every packed, analytic and boxed entry for that owner. A boxed record may survive eviction of its packed component as an independently immutable, source-bound record, but a later query must still read and verify the current chunk before using it. Corruption on either a packed hit or a decode miss clears the owner; the normal reader must reload and revalidate the resource before another activation. Owner invalidation removes both representations. Closing the world clears retained components and query descriptors.

An active-owner registry contains at most 16 activation tokens and follows actual resource residency. Retiring an owner also retires its token, including tokens referenced by components already evicted for bytes. Temporary references from the current synchronous selection may still materialize their immutable geometry, but cannot hit or repopulate retention after retirement. Re-admitting the same resource identity creates a different token, so an old reference cannot acquire the later activation. This matters when a bounded selection includes more resources than the resident-owner ceiling.

Private packed buffers and typed bounds are never returned. Public handles contain only hashed component identity and record count; selected references contain only hashed identity and record index. Their ownership is checked through private `WeakMap` capabilities. Returned triangle graphs are recursively frozen, returned bounds are copies, and diagnostic snapshots contain no geometry or paths. Source payloads are copied before retention, so mutating the caller's read buffer cannot change cached geometry.

## Static preparation and fresh admission

`prepareStaticWorkset01` accepts bounded listener/source positions and ordinary selection limits to choose immutable source components and prepare reusable records and panel templates. It does not create an observation, scene, timestamp, generation or renewed lease. The worker may complete this static work after the selecting observation expires, then use the prepared components for a later genuine request with that later request's unchanged freshness horizon.

For an original request that is still valid, preparation may return an opaque, one-shot continuation of its completed selection. The worker consumes it immediately for that same request, so materialization does not repeat selection or its already completed current-byte reads. The continuation binds every normalized spatial and workset input, engine options, session, generation and original observation timestamps, plus world and owner-invalidation revisions. It is consumed before materialization and cannot be reused, cloned or applied to a later observation. At most one transient selection exists per world. A subsequent preparation, plain window call, reload, closure or explicit discard invalidates it; a microtask also discards it when the synchronous turn ends. Expired preparation explicitly discards the continuation before reporting static completion. Only immutable source components survive for the next request, which selects and validates current bytes again. Explicit higher-order paths keep their full intermediate-validation route.

Current clipping, distance order, duplicate elimination and reflection selection still run for the current request. Packed coordinates preserve the exact source values. Distance order keeps the existing `Math.hypot` calculation and resource/node/polygon tie-breaks. Boundary-crossing triangles take the existing clipping path; only wholly contained immutable triangles reuse a panel template.

The adaptive radius chain is unchanged. A discardable wide pass may stop only after observing one more **valid, unique, nondegenerate clipped surface** than the actual surface ceiling, or after an existing resource/query capacity condition applies. The witness follows the original selection order; invalid or duplicate panels do not count. Such a discarded pass does not build a tile, spatial index, reflections or acoustic scene. Its omission count is explicitly a lower bound in diagnostics. The final radius, minimum radius and nonadaptive path still complete selection and conservative omitted-region accounting. Explicit higher-order paths retain intermediate full validation so adaptation cannot hide an invalid surface reference.

Only the final selected geometry receives the request's real observation headers and enters the existing fully validated tile, source-bound transfer and gameplay-consumer pathway. Static preparation success or a nonempty internal calculation is not consumer acceptance.

## Bounded evidence

Normal profiles expose numeric descriptor, component, decode, tessellation, panel and materialization counters. Separate diagnostic snapshots retain at most 128 descriptor events, 256 query-history entries, 128 owner-history entries, 128 component events and 256 component tombstones. Stable hashed IDs, byte charges, removal reasons, owner cascades and observed reuse after eviction make descriptor hits distinguishable from component churn. Adaptive-pass evidence reports actual capacity witnesses without presenting a lower-bound count as an exact omission total.

Codex's authored tests cover component identity collisions, exact analytic metadata and triangles, immutable shared data, aggregate retention pressure, bounded histories, restored-mtime corruption, proof revocation, owner eviction, moved poses, clipping, conservative gaps, adaptive scope and source-bound transport. Performance and genuine-installation qualification evidence are recorded separately; the earlier failed evidence remains preserved.
