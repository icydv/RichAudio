# STREET-01 world completion pass

I am continuing from `58491c7` using my existing genuine collision cache. My earlier STREET-01 reports, cache indexes, receipts, failures and measurement scopes remain historical. This pass does not establish complete installed-world acoustics or observed GTA activation.

## Changes in my normal startup path

Codex separated discovery, decoded geometry, static placement and runtime activation on my existing resource manifest. All 10,663 selected collision sources can enter the bounded potential-geometry queue. A conditional map group, higher collision layer or interior no longer has to be treated as undecodable merely because its live activation is unknown. Potential variants retain separate source identities and conditions; they cannot enter the acoustic scene together through this change. My existing conditional layer-zero exterior scene remains the admitted software model.

The summary now exposes `CoverageStates01` and `GeometryQueue`, while keeping the historical exterior-only counts separate. Cached partial source models, source-only models without supported surfaces, unknown representation counts and complete acoustic resources are distinct. These resource counts are not geographic coverage percentages. Runtime activation remains unobserved for the entire selected denominator.

The first valid normal gameplay observation now reaches the existing preparation worker before a manifest has to be available. That worker can write a bounded initial-observation priority file outside the PCM producer. My preparation queue validates game identity, session, generation, sequence, source age and UTC epoch; holds the first pose for that session; accepts a fresh new session; and rejects malformed, future or stale observations. The supervisor captures the startup epoch synchronously and retains it across its bounded batches. A new priority can preempt after a completed bounded source checkpoint. Before any qualified position exists, the deterministic whole-world queue continues. Priority never supplies activation authority and does not turn preparation into a visited-locations-only map.

The direct Capture-to-supervisor offer also works when the normal audio host is disabled in stock fallback. It copies one immutable pose without file IO or waiting on the game fibre. Background writing requires the validated enabled sidecar and original observation age at most 500 ms. Eight actual adapter/supervisor scenarios pass, including sequence zero, stale input, disabled/cancelled preparation and a busy shared writer lock. A later audio worker preserves the earlier valid same-session priority. This is source verification with authored observations; initial-player timing in GTA remains unqualified.

Codex also corrected actual outer-startup contracts. The resolver now accepts the supervisor's 1,800-second stage budget and receives the exact reference catalogue required by the final binding check. Reference and resolved vehicle metadata both use the explicit Bati filter. A completed geometry receipt no longer bypasses current archive-content validation on warm startup. A same-size, same-time content change withdraws affected cached geometry and writes a source-refresh marker; the ordinary next preparation pass refreshes catalogue/metadata before allowing those sources to decode. File names and timestamps do not become content authority.

Normal scene admission now requires the exact supervisor startup epoch in the manifest and each resource's current archive-validation proof. The archive hash must also match the source-bound conversion receipt. A missing epoch, stale row or malformed proof remains unknown; an explicit pinned offline model remains a conditional static read. Proof publication now occurs only after equal before/after archive hashes. The initial revalidation and each decoded checkpoint clear earlier proof instead of publishing readiness. This ordering correction was made after the genuine warm attempt described below; that attempt cannot qualify the corrected behavior.

PowerShell now reads a compact driver view instead of materializing the full resource manifest. That view is bound to the SHA-256 of the exact published manifest bytes. Missing or stale views stop before counts, continuation or decoding. Metadata publication uses a bounded Windows sharing-error retry, keeps the previous destination intact on persistent failure and retains the pending file. These are preparation-worker operations, outside the PCM producer.

Every owned preparation phase now records wall time, peak Job memory, user/kernel CPU and logical IO accounting, including descendants. Logical transfer bytes are not physical-disk measurements. Cancellation and observed empty-Job closure remain required; no game fibre or PCM callback scans or joins these workers.

## Interior placement and declared rooms

The actual supported metadata reader visits the selected YMAP sources and effective MLO archetypes. It preserves CodeWalker's resolved position, orientation and scale as an explicit matrix rather than applying the regular-entity quaternion rule to an MLO. Source YMAP/YTYP payload hashes stay private and bound to the installation model.

My new metadata revision retains 392 MLO archetypes, 763 declared instances, 1,690 rooms and 2,827 portals after visiting all 5,420 selected YMAP files. Twenty-two unbounded or invalid room boxes remain explicit unknown descriptors. Codex preserved the preceding revision's sixteen projection failures, then changed the adapter to retain those room descriptors without discarding an otherwise usable archetype.

[CodeWalker's manifest processing](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/World/Space.cs) explicitly associates child collision bounds with their parent interior and treats those bounds as local. My placement resolver requires that structured relationship, the selected parent archetype and a hash-bound YMAP instance; a direct physics-dictionary binding is also retained where present. This resolves 558 interior collision references to 1,244 static instance placements. Fifty-six references have no selected instance. These are metadata placements, not observed active interiors.

Declared room adjacency and transformed portal corners remain metadata. No portal is assumed open, no opening is cut into geometry, and no interior variant is admitted to the live acoustic scene without its unresolved runtime state.

## The two previous bounds failures

Codex inspected every retained triangle of both failed resources. Only reconstructed Box corners exceeded the native metadata envelopes: ten repeated triangle vertices in one resource and six in the other, by at most 0.0025749 and 0.0031738 native units. The native indexed surface points themselves fit the unchanged 0.001-unit qualification tolerance.

My old check incorrectly treated the envelope of four native Box indices and the complete reconstructed Box envelope as the same contract. [The public Box interface](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/GameFiles/Resources/Bounds.cs) distinguishes indexed vertices from their derived shape. The new optional index qualifier records native indexed support bounds separately. For retained data, it first reproduces **every original chunk SHA-256** from the exact retained normalizer. It then preserves all reconstructed surfaces and expands their query envelope; it neither clamps coordinates nor widens the tolerance. A changed native point, changed normalizer or mismatched chunk remains rejected.

Both resources pass that new qualification. Their old failed receipts and base chunks remain untouched. This corrects my source-qualification assumption; it does not establish GTA's broad-phase collision behavior, physical coordinate calibration or actual activation.

## Retained completion result

The first genuine completion batch stopped at its 1,800-second budget and joined cleanly. It retained 4,048 newly prepared potential models; its 5,698 currently archive-revalidated rows included 1,650 of the historical exterior resources and two retained failures. Those numbers describe that checkpoint, not a replacement for the historical 4,335 qualified exterior result.

The second bounded batch finished with all **10,663 selected resources prepared as partial source models**, no failed resources and no unattempted eligible resources. The immutable terminal snapshot contains 4,337 exterior models and 6,326 cache-only potential variants. All 10,663 contain Triangle, reconstructed Box or compact analytic support; none is a decoded model containing only unsupported representation. The catalogue denominator remains 10,663. Complete acoustic resources and observed runtime-active resources remain **zero**.

The source indexes retain native triangles, reconstructed Box polygons and compact curved primitives; exact representation counts remain in my private derived audit. Sphere, Capsule and Cylinder records now have compact analytic representations; local queries still use bounded inscribed approximations with explicit error and omission reporting. No unsupported family without a matching compact representation was found in this selected normalized data. This does not remove query-capacity gaps, unknown materials, unresolved placement or activation conditions.

The final referenced cache comprises 39,612 unique index, chunk and receipt files totaling **10,516,412,623 bytes**: 709,136,210 bytes of indexes, 9,791,327,568 bytes of chunks and 15,948,845 bytes of receipts. This excludes normalizers, catalogues, earlier versions, logs and failed attempts. The whole new completion evidence folder was 11,791,186,552 bytes at the derived audit; it is not a cache-only measurement.

| Geometry preparation | Wall time | Decoder batches | Maximum observed child Job memory | Logical reads | Logical writes |
| --- | ---: | ---: | ---: | ---: | ---: |
| First bounded completion batch | 1,802.210 s including deadline cleanup | 53 | 766,873,600 B | 289,581,669,266 B | 20,190,201,341 B |
| Second bounded completion batch | 1,475.044 s | 14 | 702,087,168 B | 243,631,752,291 B | 18,979,403,716 B |

The first batch includes one deadline-ended phase; all its owned processes joined. The second batch has no failed phase and all owned processes joined. These logical IO totals sum owned phase accounting, including descendants and repeated cache/archive validation. They do not measure physical disk traffic or cold storage performance. This pass reused my previous cache, so neither batch is a clean-install cold benchmark.

## Actual normal startup measurements

Codex exercised the existing outer preparation driver, including ordinary installation and current archive validation. Both attempts failed and their receipts remain preserved:

| Attempt | Wall time | Maximum observed Job memory | Logical reads | Logical writes | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Normal control | 571.586 s | 3,148,128,256 B | 75,314,388,967 B | 6,337,300,243 B | PowerShell exhausted memory materializing the full manifest. |
| Normal warm attempt after compact-view change | 277.384 s | 1,784,795,136 B | 51,723,623,938 B | 5,639,534,860 B | Windows returned `EPERM` during final manifest rename in an analytic-upgrade phase. |

The second failure was metadata publication, not demonstrated analytic geometry corruption. The retained pending file and destination were byte-identical; the competing holder, if any, was not identified. The lower observed memory peak came from a different failed attempt and is not a controlled performance acceptance result.

The warm attempt's mutable checkpoint had only 1,429 currently revalidated partial models, including 486 exterior models, with 9,234 rows awaiting current validation. It does not replace the immutable all-resource terminal result. Review also found that this attempt published archive proofs before the final equal-hash decision. Its current-epoch readiness evidence is therefore unqualified independently of the rename failure.

The actual automatic persistent scene service then waited with that exact startup epoch and a retained offline pose for 300.492 seconds. It produced **no qualified nonempty local scene** and joined. The pose was not a new GTA observation. I therefore have no normal warm-start, local-readiness, first-observation-latency or cold-start acceptance result from these attempts.

All original installed/software readers joined by 15:49:30 UTC, before my approved 15:54:25 UTC stop. The derived scene service joined at 15:53:45 UTC. Subsequent work used source, original fixtures and existing derived evidence only; there was no genuine rerun after the proof-ordering and publication fixes.

## Focused verification and remaining qualification

Codex's original fixtures exercise cache-only conditional/layer preparation, unchanged-source failure retention, withheld activation, exact interior bindings and transforms, rejected missing/wrong source relationships, sentinel room descriptors, rotated Box envelopes and corrupt derivations. The actual production geometry driver also completes a zero-decoder authored warm pass and detects an intentionally changed same-size/same-time authored archive before a stale catalogue can launch a decoder. These controls use no game or vendor payload.

An additional deterministic control uses the actual driver and owned helpers with two inert authored archives. It pauses before the final hash: neither arm has a current proof or admitted normal scene then. The unchanged arm publishes proof only after matching final hashes. A same-size/same-time content change in the other arm withdraws the resource, fails and never publishes a current proof at an observed phase. Both owned child processes join. Stale and missing compact-view controls also prevent continuation.

The atomic-publication fixture reproduces a real Windows no-delete-share lock. A changed publication succeeds after the reader releases its handle; a persistent lock fails within its bound while preserving the previous target and pending bytes. Three focused cases pass on each of the actual Node 22 and 24 runtimes. The installer copies the full 145-source closure, including the helper. These source controls do not turn the earlier genuine warm failure into a pass.

My remaining gates include a successful current-source normal warm run, bounded first local-scene availability from a genuine initial observation, observed variant/interior state and complete acoustic/gameplay qualification. I do not infer those results from a derived-cache helper, a local reflection or the presence of a decoded file.

No GTA/RPH launch, deployment, native mutation, endpoint, playback or capture is part of this pass. My full-world and integrated live acceptance gates remain open.
