# ACOUSTICS-03: my bounded surface reconstruction experiment

26 October 2026. **PREPARED at 50%; separate live approval pending.** I've implemented and offline-tested a nine-query observer and deterministic planar reconstruction. I have not deployed it, launched GTA/RPH or collected ACOUSTICS-03 live geometry. This is preparation, not a real-surface PASS. The live, restoration and final-publication stages remain pending.

## Baseline and preservation

PRs #26 and #27 remain open and unmerged. My branch `research/acoustics-03-surface-reconstruction` starts at PR #27's `116166765ec7d7c40d17e52717b681986e99f098`, on the independent acoustics stream. No merge/rebase or source-synthesis ancestry is introduced. The synthesis checkout remains clean at `24e1be70eb75c8f7b43e95fe495d3c71dba5dc42`.

I've reverified **4,857 private research files and 139 link targets**, then separately fingerprinted **256 existing acoustics artifacts**, including the previous private observation, deployment/restoration evidence and built reference observer. No links are traversed. Previous source renderers, telemetry/RPM, native audio ownership, ACOUSTICS-01 mathematics and the historical one-shot adapter remain unchanged.

The previous single hit establishes local point/normal acquisition on Enhanced 1.0.1158.16 with RPH 1.132.1428.17748. It does not establish a wall polygon, physical-unit scale, material, static permanence or audible reflection. Those limits carry forward.

## Shutdown investigation and actual lifecycle correction

The historical [one-shot adapter](../src/acoustics/observation/GeometryObserver.Rph.cs) set READY and unconditionally called `GameFiber.Sleep(600000)`. Its capture fiber closed its record and disabled acquisition but did not end that main wait. Explicit unload interrupted the waiting task; a broad exception handler printed `NOT READY: ThreadAbortException` after FINISHED. The chronological private log and intact record establish that ordering.

The .NET Framework [ThreadAbortException contract](https://learn.microsoft.com/en-us/dotnet/api/system.threading.threadabortexception?view=netframework-4.8.1) explains automatic rethrow and finally execution during abort. This supports an expected host-cancellation interpretation; I have not inspected proprietary RPH unload internals or proved exactly which internal abort path was used.

The new separate [surface adapter](../src/acoustics/observation/SurfaceObserver.Rph.cs) uses documented [GameFiber.SleepUntil](https://docs.ragepluginhook.net/html/M_Rage_GameFiber_SleepUntil.htm), with a ten-minute **readiness** expiry and a completion/cancellation predicate. Its signature is present in the pinned authentic SDK and compilation passes. Historical documentation alone is not exact-build behaviour proof.

The predicate reads lifecycle flags only, issuing no queries. Capture closes/flushed-publishes its result before marking completion, allowing main to finish immediately after acquisition rather than lingering. Cancellation ends waiting/running acquisition; consumed claims cannot restart it. Explicit `ThreadAbortException` handling respects host cancellation without `ResetAbort` or a misleading setup-error message. This fixes the unnecessary wait, not just its logging.

[Neutral lifecycle tests](../tests/Test-SurfaceAcquisition.cs) cover claims, competing query permissions, cancellation, completion, no retry, output collisions and JSON roundtrip. A wholly owned .NET test thread independently demonstrates abort/finally semantics without RPH. Actual host task completion and unload ordering still require the approved live session. No offline test certifies all interruption points.

Persistence reserves an attempt with `CreateNew`, writes a new `.partial` file, flushes/closes it, then moves it to the final name. On interruption, a reservation/partial may remain; neither proves a complete batch. A collision never overwrites an old record. No recovery deletes reservations or retries queries. Abrupt process/disk failure remains a limitation.

## One predetermined acquisition: nine parallel rays

Plan ID: `parallel-wall-grid-3x3-v1`. [Neutral plan and collection contract](../src/acoustics/observation/SurfaceAcquisition.cs).

- Sample one on-foot stationary player pose. No programmed player/camera movement.
- Normalised horizontal forward defines ray direction; right is `(forward.Y, -forward.X, 0)`, an explicit query basis rather than a global handedness claim.
- Origins are player position plus **1.0 native Z unit**, lateral offsets `[-0.75, 0, +0.75]`, and vertical offsets `[-0.5, 0, +0.5]`.
- All endpoints are eight native units forward from their own origins. Order is lower row left-to-right, middle row, upper row; center is zero-based order four.
- The only query is `World.TraceLine`, SDK `TraceFlags.IntersectWorld = 1`, explicitly ignoring the original player entity.
- One `RichAudioSurfaceObserve` command and durable claim; actual permission capped at **nine**, below the brief's absolute sixteen. No retry, alternate pass or pattern expansion.
- Yield once between rays. Before each, recheck Story Mode/network guards, same player handle, on-foot state, speed at most 0.25 native units/s and displacement at most 0.05 native units. Ray positions stay fixed to the initial pose.
- Check a one-second acquisition guard before each call. It cannot preempt a synchronous native call already in progress; a saved batch longer than one second fails reconstruction acceptance. This is not a hard real-time guarantee.
- Valid misses remain evidence and the predetermined plan continues. Invalid numerical/API data, cancellation, changed setup or timeout stops early. Only a complete compatible nine-hit grid can support this policy's candidate.

### Intended supervised setup

In offline Story Mode, I will stand on foot roughly **2–5 native units** from a broad, plain exterior wall, facing it approximately square-on. The wall should be visibly clear across the planned 1.5-unit lateral / 1-unit vertical footprint, with extra clearance. Avoid doors, windows, ledges, bollards in that region, moving entities, destructible panels and irregular finishes. Native units are not calibrated metres.

The location is selected and confirmed during supervised setup; no unverified world coordinates are hardcoded. The previous plain-wall arrangement is an example, not a required known location. Visual flatness does not certify collision flatness. No negative-control ray is added: the grid gives two-dimensional support and a central opening check, while original ground-truth fixtures test rejection. Nine rays cannot detect all smaller openings.

## Independent validation and deterministic reconstruction

The private `SurfaceBatch` retains schema, plan ID, ordered IDs/offsets, common session/build, initial pose, start/finish clock, actual call count, completion/error and each `GeometryObservation`. Per-ray data preserves exact query/result fields, nullable unavailable values, provenance, validation/rejection status and timestamp. Confidence stays local point/normal consistency with uncalibrated accuracy; material, extent and permanence are unknown.

The original hit validator runs in the adapter. The [independent JavaScript reconstructor](../src/acoustics/research/surface-reconstruction.mjs) recomputes segment/normal checks without trusting embedded validation flags. It verifies fixed ray geometry, IDs/order, session/build, clock order, player identity and counts. The [private inspector](../tools/Inspect-SurfaceBatch.mjs) accepts regular files below **256 KiB** under ignored `.local`, rejects linked ancestry, and writes only to a fresh private directory. Partial batches retain valid observations but cannot yield a connected polygon.

My original orthogonal least-squares implementation subtracts a nearby anchor, computes centroid and symmetric 3×3 covariance, then finds the minimum eigenvector with bounded Jacobi diagonalisation. [CGAL's PCA manual](https://doc.cgal.org/latest/Principal_component_analysis/index.html) describes this mathematical method; no CGAL code/dependency is copied or linked. Every point receives equal weight. No RANSAC, favourable-subset search or outlier removal is performed.

Rules fixed before live acquisition:

| Screen | Rule and evidence limit |
|---|---|
| Segment membership | Original `16 × 2^-23 × max(1, abs(query components))` arithmetic tolerance |
| Normal length | Original difference from unity at most 0.01; no independent sign flips |
| Coplanarity | Maximum fit residual at most `max(0.01 × 0.5, 4 × maximum query tolerance)` native units |
| Normal agreement | Every returned unit normal within five degrees of fitted normal; fit orientation aligned to first returned normal |
| Intended wall | Absolute fitted normal Z at most 0.2 |
| Rank/conditioning | Second covariance eigenvalue at least `1e-8`; second/largest variance ratio at least 0.01 |
| Identity | All available hit-handle identities agree; mixed known/unknown identities reject the joint candidate |
| Support | All nine valid planned hits required; missing cells or contradictory points/normals reject a connected patch |

The 1% planarity allowance relative to the smallest grid spacing and five-degree normal screen are explicit approximation budgets, **not measured collision-accuracy guarantees**. Arithmetic tolerance accommodates the inherited float screen. Residuals, eigenvalues/conditioning, normal disagreement, spacing and footprint inset are reported. Confidence is an ordinal evidence classification, not an invented probability. Wider spacing gives a longer orientation baseline but larger unknown gaps; neither certifies solidity. Degenerate or needle-like support fails closed.

## Finite candidate and acoustic boundary

Compatible hits are projected into an in-plane basis derived from the fixed lateral direction and fitted normal. Their convex support hull is inset by `max(2 × plane tolerance, 2 × (maximum residual + maximum query tolerance))`. The nonzero-area polygon must remain inside observed support. It is an **artificial interior footprint**, not the wall's real perimeter or building dimensions.

Candidates retain source IDs, provenance/session/build, center/normal/tangents, eigenvalues, RMS/maximum residual, normal agreement, observed hull, inset/area and bounded reuse expiry:

- **Observed:** discrete collision points and normals.
- **Inferred:** local plane and interior footprint under an explicit continuity hypothesis.
- **Unknown:** solidity between rays, sub-grid openings, true edges, complete extent, material, reflectance, permanence and physical scale.
- **Rejected:** a joint patch contradicted by missing/incompatible/degenerate measurements; no forced polygon or alternative cluster.

The candidate is `certifiedAcousticGeometry=false` in native units, with unknown material. Tests demonstrate it cannot enter the existing validated metre-coordinate acoustic tile directly. The ACOUSTICS-01 tile and solver are unchanged.

A separate diagnostic image-source calculation may use the inferred polygon with **hypothetical** source/listener positions two native units in front and 0.2 units either side of its center. It checks side and finite-polygon membership, and returns a **calculated reflection hypothesis only**. Path lengths are native units; physical arrival/delay times, pressure and energy gains are null and path visibility unknown. It certifies neither a clear path nor an audible GTA echo.

## Original synthetic evidence and visuals

[Synthetic results](research/acoustics-03/synthetic-results.json) come from [Build-SurfaceResearchExamples](../tools/Build-SurfaceResearchExamples.mjs), which accepts no live input. All six fixtures are original analytic scenes.

| Scene | Offline result |
|---|---|
| Flat wall `x=4` | Center `(4,0,1)`, normal `(-1,0,0)`, zero residual; eigenvalues `0, 1/6, 0.375`; inset area 1.4504 native units squared |
| Intersecting faces `x=4` and `x+y=4` | Normal inconsistency rejects one merged plane |
| Sampled opening | Eight valid hits and central miss; no connected candidate |
| Controlled position/normal noise | RMS 0.0007081971; max residual 0.0011111113, within fixed budget |
| Unrelated depth outlier | Nine individually valid hits; joint candidate rejected without discarding one |
| Insufficient evidence | Two preserved hits; no finite patch |

The synthetic hypothetical-endpoint path is **4.0199502484 native units**, with no physical milliseconds. A separate independently derived test checks `sqrt(36 + 0.16)` for endpoints three units from the fixture plane.

![Original flat-wall measurements and inferred footprint](research/acoustics-03/flat.svg)

![Original opening example: no inferred polygon](research/acoustics-03/opening.svg)

Additional original [corner](research/acoustics-03/corner.svg), [noisy](research/acoustics-03/noisy.svg), [incompatible](research/acoustics-03/incompatible.svg) and [insufficient](research/acoustics-03/insufficient.svg) diagrams are data-derived. Green hits support a candidate; pink marks a rejected set; blue marks origins; dashed cyan is inferred geometry; hatching is unknown. Height-distinct rays can overlap in the side projection. Flat/opening/corner renders were visually inspected locally. Future live diagrams stay private rather than publishing reconstructive world measurements.

## Tests and environment

I've added **63 Node reconstruction/privacy/visual tests**, **53 neutral acquisition/lifecycle assertions**, and a cross-language C#-JSON-to-JavaScript fitting check. Cases include the six scenes, analytic oblique planes/eigenvalues, translation stability, degenerate support, schema/order/budget, identity/build/session/time mismatch, invalid geometry, gaps/outliers, uncertainty, stale candidates, no certified tile promotion, hypothetical reflections, deterministic output, path/link/size guards, cancellation and output collisions.

Authentic-SDK compilation passes against SDK 1.124.1393.17586, SHA `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`. The full local suite passes: 17 metadata tests, 40 ACOUSTICS-01 tests, 73 ACOUSTICS-02 assertions, the 63 new Node tests and 53 new acquisition assertions/cross-language check, **110 repository checks**, 65 telemetry assertions, nine configuration checks and eight append expectations. Hosted tests need no proprietary SDK/game files. Hosted CI is recorded only after actual readback, never inferred from local compilation.

No dependency is added. Local visual QA used the existing bundled image renderer; no third-party tools are distributed. Project licensing is undecided; our algorithms/tests are original and proprietary SDK/runtime components remain local dependencies.

## Fresh installation preflight and sealed plan

I've freshly measured **32 root-file SHA-256 records, root directories, 179 archive metadata records and ten sampled archive hash calculations**. They match historical evidence. Both original executable signatures are valid; Enhanced remains 1.0.1158.16 and authentic RPH 1.132.1428.17748. Runtime/loader/fix sources and independent obsolete-executable backup match their pins. No relevant runtime/editing/ProcMon process, PROCMON25, alias or destination conflict is present.

The new private seal specifies **27 additions**: the same 25 approved runtime/loader/fix files plus `Plugins/RichAudio.Surface.Rph.dll` and private config. No historical observer or telemetry plugin runs. The temporary obsolete-executable filename change is retained; original contents are never edited and no existing file is overwritten.

Observer SHA: `C3F84AE91653AD88B871BAA9ECD091D4208465D12D72ACC95A6A95AC2C46DF8A`.

Private manifest SHA: `21F5639DE91DE8482374596C99A6F6BFE86CCABE5D87628BA90AD488957DCFAC`.

The private Verify/Begin/Restore helper retains the previously verified procedure with a new seal, observer allowlist, nine-query limit and fingerprints of the **fresh** baseline files. Read-only Verify passes. Begin has not run and requires separate approval. Sources, baselines, signatures, absent paths, processes and diagnostic cleanup are rechecked immediately before any mutation. Every change is journalled first; unexpected content is preserved and blocks cleanup PASS.

After an approved attempt, observe completion/unload/normal quit, preserve private evidence, quarantine the exact temporary additions outside the game, restore original names and independently verify the fresh hash/signature/directory/archive comparisons. Recognised generated files and the fingerprinted empty code template follow the existing narrow procedure; unknown data is not deleted. This is a **prepared restoration method**, not a new restoration PASS before a test occurs.

The proposed single launch reuses validated `-forcesettings -log` and the established offline Story Mode configuration. Autoload must stay disabled. No guessed flags, security changes, unrelated plugin, dependency installation, audio command or world mutation is authorised. No recovery retries.

## Reproduction and privacy

From the repository root, offline:

```powershell
./tools/Test-Offline.ps1
./tools/Build-SurfaceObserver.ps1 -SdkPath $authenticPinnedSdk
node tools/Build-SurfaceResearchExamples.mjs .local/fresh-synthetic-examples
```

After a separately approved acquisition, inspect the closed private batch:

```powershell
node tools/Inspect-SurfaceBatch.mjs .local/acoustics03-runtime/observations/surface-batch.json .local/fresh-surface-diagnostics
```

The output directory must be new with an existing parent. Private diagnostics include a fitted record, optional hypothetical path and SVG; console output is scalar-only. Setup failure without valid pose retains its rejection without an invented view. `.attempt`/`.partial` alone is incomplete evidence. Raw live measurements, sessions, screenshots, logs, installation paths, binaries and assets stay out of Git. Public figures come only from original fixtures. No project licence is selected.

## Approval checkpoint

The communicated checkpoints are **0 → 10 → 25 → 50%**. The first three weighted stages are complete. Weights remain repository 10%, investigation/safety 15%, implementation/tests 25%, supervised acquisition 20%, live validation/restoration/performance 15%, final documentation/publication 15%. A prepared draft PR/CI check does not award the final stage before actual live findings and restoration are documented.

| Gate | Status |
|---|---|
| Repository/ancestry, source review and preservation | PASS |
| Lifecycle correction and original neutral tests | PASS offline; host completion/unload NOT TESTED |
| Fixed plan, synthetic reconstruction, adapter build | PASS offline |
| Fresh installation / restoration readiness | PASS read-only |
| Separate ACOUSTICS-03 live approval | PENDING |
| New live surface and performance | NOT TESTED |
| New normal quit / restoration | NOT TESTED; installation unchanged |
| Scientific outcome | PENDING; no new real GTA surface claim |

My next action is the separate live go-ahead required by this brief. ACOUSTICS-02 approval does not cover it. If approved, I will perform one fixed acquisition, validate offline, classify the actual result honestly and restore independently. No city scanner, sound output, source-synthesis change or further milestone is started while waiting.
