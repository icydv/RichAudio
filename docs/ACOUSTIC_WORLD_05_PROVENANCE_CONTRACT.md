# ACOUSTIC-WORLD-05: my selection and source/export evidence contract

My metadata must help identify the first building without pretending that declarations are proof. This document specifies the proposed metadata boundary and cross-binding rules for the new XML path. It is not a file reader, implemented provenance validator or permission to inspect an installation. Exact runtime/validator identities remain required by the [read-only proposal](ACOUSTIC_WORLD_05_READ_ONLY_PROPOSAL.md).

## M0 selection metadata: closed declarations, no resolution

The proposed M0 descriptor has `schema: 1`, kind `RichAudioWorld05SelectionMetadata`, and exactly these root fields: `schema`, `kind`, `availability`, `tool`, `source`, `selection`, `artifacts`, `permission`, `evidenceRefs`, `transformations`. Its total canonical UTF-8 size is at most 65,536 bytes, depth at most 12. It is a proposed schema, not a claim that the XML decoder or earlier fixture validator accepts it.

| Field | Proposed exact nested fields and meaning |
| --- | --- |
| `availability` | One of `not-established`, `existing-unmodified-xml-exports`, `existing-standalone-raw-exports`; a declaration only |
| `tool` | `referenceId`, `name`, `version`, `executableSHA256`, `sourceCommit`, `officialSource`, `settings`; unknown values remain `null` |
| `tool.settings` | `gen9Reader`, `selectedOnly`, `editMode`, `batch`, `coordinateRewrite`; booleans or `null`, never launch arguments |
| `source` | `edition`, `build`, `acquisitionReceiptSHA256`; the desired edition is Enhanced, but observed identity can remain unknown |
| `selection` | `entityIndex`, `entityGuid`, `archetypeHash`, `physicsDictionary`, `collisionFrame`, `ordinaryExterior`, `isMlo`; exact source values or explicit unknowns |
| `artifacts` | Exactly three role records, described below; missing identities do not authorize search |
| `permission` | `basis`, `declaredUse`, `evidenceSHA256`, `redistribution`; declarations do not grant their own permission |
| `evidenceRefs` | `selection`, `sourceOwnership`, `toolDistribution`, `mountPrecedence`, `coordinates`, `activation`; nullable independent receipt digests |
| `transformations` | Empty for the first direct unedited export subset; any additional transformation stops for revised review |

Each artifact has exactly `role`, `referenceId`, `suppliedFileName`, `bytes`, `sha256`, `source`. Roles are one each of `ymap`, `ytyp`, `ybn`; IDs are bounded opaque tokens. `suppliedFileName` is a filename, not a host path. `source` has exactly `logicalArchive`, `rawMember`, `effectivePath`, `mountId`, `rawDigestBasis`, `rawSHA256`. The original raw member ends in its native extension; an XML supplied filename ends in `.xml`. Logical archive/member identities never become filesystem instructions.

All missing values are explicit `null` or `not-established`, not invented placeholders that look authenticated. Proposed field bounds are: opaque IDs 1–80 ASCII letters/digits/`_.-`; other text 1–160 UTF-8 bytes; source URL/logical identities at most 512 UTF-8 bytes; no NUL/control characters or host paths. Supplied filenames are basenames, without separators, drive prefixes or dot/dot-dot names. Logical identities retain the supplied source spelling and reject absolute paths, dot/dot-dot components and ambiguous separators; canonical effective identity is a separate derived comparison, never an invented source path.

Entity indices are integers 0–4,095; native archetype/physics hashes and entity GUIDs are unsigned 32-bit integers when known. A decoder's smaller entity/structure bound still takes precedence. Declared XML sizes are 1–8 MiB each and at most 24 MiB combined; metadata availability for standalone raw exports needs its own explicitly selected scope. These declarations do not authorize content reads. The initial contained XML path is stricter at 1 MiB each / 2 MiB combined. There are exactly three distinct role/reference records and six nullable evidence references; no additional receipt array or embedded resource bytes are accepted. Collision ownership can explicitly report local, world, embedded or not-established; a local/world transform choice alone never verifies that association.

Sparse arrays, duplicate keys, unknown fields, accessors, extra array properties and prototype keys reject. Hashes are lowercase SHA-256 strings when supplied. M0 may report declared availability or missing facts, but it cannot open/hash/stat references, read tools or resources, launch an exporter, qualify a genuine building or create acoustic authority. Exact private paths belong only in a later separately sealed manifest. A schema or method change requires new review rather than widening the current intake.

## The XML adapter consumes bytes, not provenance commands

The intended adapter boundary is three exact supplied XML buffers plus their expected byte digests/logical identities and an explicit selected ordinary entity/archetype/collision association. Its decoder owns bounded syntax/structure/numeric/geometry checks; no metadata field may request a resource fetch, external XML resolution, key operation, plugin or tool command.

Decoded output must preserve raw stored `CEntityDef` rotation, position and XY/Z scale; actual archetype/physics identities; child/composite row-vector matrices; geometry centers; finite vertices/triangle indices; and packed native material identities. Declared source identity and decoder-derived identity must agree. Unsupported geometry, multiple/ambiguous matches, MLO placement, missing dependency evidence and unknown collision ownership remain explicit failures or unqualified inspection states. A decoder cannot determine an archive owner from an XML filename.

The separately reviewed offline-comparison admission layer, not a declaration or parser success flag, must bind:

1. **Source to export:** original raw archive/member identity and independently qualified ownership/acquisition evidence to the exact supplied file's bytes/hash. A named archive, file stat or matching basename cannot substitute for that evidence.
2. **Export to decoded data:** exact XML byte digest, decoder/profile/runtime identity, selected entity and structural limits to the returned DTO and diagnostics.
3. **Decoded data to tile:** the existing dependency/mount selection, transform/material assumptions and coverage model to a versioned integrity-checked tile and its selective invalidation bindings.
4. **Tile to scene/evidence:** the existing joined worker, renderer and read-only SoundMap state, with no source restart, extra PCM queue or visual invention of reflection paths.

`rawDigestBasis` distinguishes `not-measured`, `stored-member-bytes` and `standalone-raw-resource`. An XML SHA-256 is never a stored-member hash, a standalone raw-resource hash or a whole archive hash. Unknown native digests stay `null`; a complete archive digest is not requested or inferred. The explicit source/capture scope determines which of those facts can actually be established.

## Geometry, confidence and authority remain separate

For the archetype-local case, centers and child/composite matrices compose before entity scale, inverse ordinary stored quaternion and translation. Explicit world collision uses its collision world coordinates without repeating entity placement. No second Blender transpose or duplicated placement may be inserted. Either mode needs independent ownership evidence. Unsupported shared geometry and embedded drawable bounds cannot be relabelled local to pass.

Full 3D calibration should include at least four independently sourced non-coplanar local/world correspondences, with vertical variation, provenance and tolerances. Independent CodeWalker calculations can verify transform interpretation against the source buffers; they do not establish physical metres or live Story Mode activation. Self-generated expected coordinates are authored regression evidence. Native collision material IDs remain identities; acoustic reflection/transmission coefficients need explicit confidence and assumption labels.

A successfully parsed genuine-looking XML may be displayed as **unqualified supplied inspection geometry**, clearly separated from solver-authoritative surfaces. Provenance, supported placement, calibration, mount/activation evidence and independently reviewed execution are separate gates. Missing room/portal/door information remains unknown, even though an ordinary exterior is the initial target. No field such as `verified: true`, a schema-valid hash or a copied fixture label can admit supplied geometry by itself.

## Alignment with the implemented WORLD05 APIs

[`decodeCodeWalkerXmlBuilding05`](../src/acoustics/world/codewalker-xml05.mjs) accepts only `resources` and `selection`. Each resource has `id`, `kind`, `xml` buffer, `expectedSHA256`, `logicalArchive`, native-extension `logicalMember` and nullable `sourceSHA256`. Selection has exact `ymapId`, `ytypId`, `ybnId`, `entityIndex`, `archetypeHash`, `physicsDictionary`, `collisionFrame` and `associationEvidenceSHA256`. Its returned association remains declared/unverified; no M0 host path, exporter command or full fixture contract is passed into it. XML digest and nullable raw-source digest remain distinct.

[`pinXmlReviewPolicy05`](../src/acoustics/world/xml-evidence05.mjs) takes separate canonical policy bytes and an independently supplied expected SHA-256. This trusted-control-host input is not discovered inside XML or M0 metadata. The policy binds exact XML/DTO identities, evidence/decoder/review digests, and provenance, permission, association, coordinate, precedence and activation receipt digests. `admitXmlBuilding05` checks those bindings, at least four non-coplanar independently sourced vertex controls, supported finite geometry, bounds, static activation and explicit authored acoustic material assumptions; it returns a nonserializable admission token.

The implemented authority is **`offline-static-comparison-only`**, including its reviewed-export lane. Witness flags for genuine resource, installed world and runtime activation remain **false**. Receipt hashes and a trusted host pin bind selected evidence; the API does not itself establish legal permission, historical acquisition truth or a native runtime observation. Hashing my own metadata is not independent review. The proposed M0 descriptor is not an implemented input of either API, and complete XML evidence/policy is intentionally a later stage rather than a prerequisite to report unknown availability.

The current request supplies no real descriptor or resources. These proposed rules must be matched to the final implementation revision and independently reviewed before a real-input candidate can be sealed. Earlier sealed B0/B1 documents remain historical scopes; this new contract does not rewrite their evidence or make their missing validator executable.
