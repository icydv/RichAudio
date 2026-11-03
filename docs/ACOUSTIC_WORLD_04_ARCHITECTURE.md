# ACOUSTIC-WORLD-04: my installed-world and interior architecture

My next real-world experiment is still read-only and approval-gated. This increment implements offline cache preparation and interior contracts; it does not establish a correctly placed building from my installation. Codex has not read installed archives, reused a consumed endpoint candidate, launched GTA/RPH, opened an audio endpoint, deployed or suppressed native audio.

## Resource discovery and qualification

`qualifyResourceInventory04` consumes an explicitly supplied bounded metadata snapshot. It does not discover directories or inspect an installation. Base, DLC and custom mounts have distinct provenance and an explicit reviewed order. The highest enabled same-path resource wins; an unsupported or deleted winner cannot expose the base resource underneath it. Missing dependencies, unknown spatial scope, cycles and unsupported resources leave affected tiles unqualified.

That order is executable fixture policy, not evidence of GTA's effective mount order. The installed origin remains unqualified even if a caller supplies apparently valid hashes. A future approved discovery adapter must supply:

- Original archive/member identities, enabled mount order and override/deletion evidence, including supported custom maps.
- The selected YMAP entity, YTYP archetype and YBN collision ownership chain, with original transforms retained and applied exactly once.
- Qualified resource-root versus archetype-local coordinates, quaternion conventions, scale and native-world alignment.
- IPL, interior, entity-set, time/LOD and other relevant activation semantics. Unresolved activation stays unknown.
- A separately supervised parser result under the exact Enhanced selector and pinned dependency closure.

The existing importer still blocks installed authority. Neither a name match, a resource header nor an authored parser packet supplies these missing facts. Unsupported collisions and finite surfaces crossing a tile boundary retain explicit gaps. No rectangle, material response or empty space is inferred from missing input.

## Incremental preparation and cache

The tile plan binds the effective resources in its dependency closure, their digests and mount identities, parser/layout, converter revision, bounds, collision bindings and material assumptions. A change to one building invalidates its dependent plans while exact unrelated plans remain reusable. Inventory identity is separately attached to the current scene contexts, so unchanged cached tile content can participate in a newly composed world.

`ResourceTileBuilder04` prioritises the listener and source surroundings and prepares a bounded number of tiles per call. Conversion uses the existing resource importer in a joined worker. The version-4 private cache wraps the existing finite-resource version-3 envelope. File counts, bytes, paths, writes and resident geometry are bounded. Publication is immutable and incomplete publication cannot become a selected tile. Cached content also needs an independently supplied expected artifact digest for reuse; a self-contained checksum proves integrity, not derivation. Without that binding the worker must rederive and compare the artifact.

Static cached geometry does not carry a previous run's session into a new scene: selected contexts bind the current session explicitly. Runtime activation and observation leases are separate from cache persistence. The API has no ordinary gameplay caller and performs no IO on the game fiber, producer/render path or real-time callback. Background preparation can be budget-limited or cancelled; every started worker must exit and join before publication or close completes. Async cache IO does not establish a hard bound on operating-system filesystem completion time.

## Interior support boundary

`createInteriorTopology04` binds original authored topology to an existing validated finite acoustic scene. It keeps resource identities, room IDs, wall/floor/ceiling surface references, planar portal apertures, explicit room/outside endpoints, activation requirements and unknown records. Supported contracts cover base, DLC and custom fixture provenance. The current supported room volume policy is non-overlapping axis-aligned bounds; arbitrary MLO room volumes and actual MLO decoding remain unimplemented.

Fixture room completeness means supplied room metadata and surface-reference availability, not proof that every enclosing wall exists. Partial scene coverage remains unknown even when no exact missing region is available. A shared boundary with another declared room cannot become an outdoor portal.

`createInteriorState04` separately carries session, generation, observation interval, IPL/interior activation and open/closed/unknown doors and windows. State expires independently within one second. A missing state is unknown. It does not edit static cache identities, fabricate room adjacency or default a door to open. A portal must meet a declared room boundary; a floating aperture cannot create an exterior connection.

`planInteriorPropagation04` enumerates bounded candidate routes through explicit known portal edges, including stairs and multiple floors. It retains passive transmission energy and reflection coefficients for the selected open/closed profiles, and existing room surface IDs for later reflection qualification. Indoor-to-outdoor and outdoor-to-indoor fixtures exercise both directions. The coefficients remain authored assumptions; portal-centre polylines are planning candidates, not visibility or travel-time proof.

| Capability | Offline result | Remaining qualification |
| --- | --- | --- |
| MLO rooms and portals | Explicit topology/identity contract and unknown records | Actual MLO resource decoding and room/portal semantics |
| Walls, floors, ceilings | Existing finite surface references and role checks | Real completeness, placement and materials |
| Custom interiors | Declared custom fixture provenance and mount policy | Supported installed custom-map formats and precedence |
| Doors, windows, IPL/interior state | Separate expiring state contract | Exact runtime acquisition and clock/activation evidence |
| Multi-floor and indoor/outdoor transmission | Known-edge route planning and authored band losses | Aperture visibility, diffraction, path geometry and actual propagation validation |
| Reflections across connected spaces | Existing scene surface IDs and passive profile metadata | Renderer integration with qualified portal apertures and real acoustic evidence |

Interior planning returns `acousticRoutingApplied:false` and `rendererVisibilityQualified:false`. The existing renderer is unchanged. The fixtures deliberately retain full wall/floor surfaces alongside apertures; they do not silently cut a hole in the renderer. Full interior acoustic rendering and actual interior compatibility remain unqualified.

## Audio continuity and evidence

The production Bati source, banks, mappings, calibration, buffer sizes, output preferences, freshness and default gameplay route are unchanged. The explicit existing scene setter changes geometry while preserving the source generator, grain cursor and renderer history. Geometry work adds zero fixed PCM frames and creates no map-loading audio queue.

The new continuity tests use the production Bati source class with original authored PCM, never private sound banks. They cover moving sources/listeners across tile boundaries, scene replacement, overrides, missing geometry, cancellation, invalidation and finite scene expiration. A separate joined path exercises supplied original fixture packets through importer, persistent cache, current session contexts, scene worker and renderer. These are device-free integration checks, not real-resource placement, in-game audibility or endpoint timing evidence.

Measured render processing overruns remain findings. The first local 144-call continuity run had p50 0.7333 ms, p99 2.8567 ms and maximum 55.9741 ms, with one call over the 10.6667 ms block budget. A subsequent run after adding the cache-to-renderer test retained another overrun: p50 0.7319 ms, p99 2.9939 ms, maximum 55.0036 ms, one over budget. These observational, order-dependent timings are neither added fixed latency nor a measured audible dropout. Earlier PR #82 overruns and consumed endpoint evidence remain unchanged.

My exact next access boundary is the separate [read-only proposal](ACOUSTIC_WORLD_04_READ_ONLY_PROPOSAL.md). This architecture does not authorise any installed read or runtime action.
