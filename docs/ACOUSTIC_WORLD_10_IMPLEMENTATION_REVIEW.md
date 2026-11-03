# ACOUSTIC-WORLD-10 independent implementation review

An independent Codex reviewer examined the audio changes written by a separate implementation agent and the distribution/host changes written by the coordinating agent. This review does not independently review the CodeWalker API adapter authored by the same reviewer, authenticate a vendor DLL, or establish genuine installed geometry. My live game, endpoint, deployment and merge boundary remains closed.

## Audio preparation and ownership

The reviewer found no unresolved correctness issue in the final reviewed `stock-grain.mjs`, `stock-source.mjs`, `source-preparation-budget10.mjs`, `stock-source-preparation10.mjs`, `installed-stock-registry.mjs` and producer startup changes in `Run-Gameplay.mjs`, within the limits below.

Preparation derives loop/interval metadata, features, source-time integration data and bounds before readiness. Branded private tokens bind the bank, assets, options, PCM and metadata. Actual source construction retains fresh frame/phase/state/RNG history; it neither inherits an authored warm source nor advances genuine playback. Exposed per-voice interval/feature arrays are copied, and the shared source-time array is private. Predeclaring empty reader slots preserves their original `undefined` semantics. Gains, engine/exhaust shares and the existing render equations are unchanged.

Separate authored JIT work uses throwaway analytic banks and bounded topology/operating-point combinations. Its generated PCM is discarded. It does not receive a genuine source identity, observation lease or eventual playback cursor. Source construction remains on the existing eligibility path, and the functional checks compare every emitted block, retirement and fresh generation reacquisition.

Review found that the initial eight-bank preparation cap could reject the existing nine-bank Playable01 configuration. The author corrected this with a dedicated preparation-budget error and a startup helper used by the actual producer. Only that error identity permits fallback; errors with a similar message or name do not. Retained plans stay capped at eight banks/64 MiB, with no eviction. A capacity-limited bank is explicitly reported as unprepared and uses the existing immediate cold constructor at genuine eligibility. The regression check confirms eight prepared plans, a ninth cold bank, no source construction during preparation and identical cold PCM afterward.

The limits remain material. Preparation runs synchronously before readiness; it is not a worker with CPU isolation. Activation still checks PCM bytes and serialized metadata. The verified asset loader already validates source PCM, but a capacity-limited bank may defer metadata/content validation until its genuine cold activation. An independent authored probe confirmed that an invalid ninth bank can be reported as unprepared at startup and then fail the original finite-PCM check at activation. Actual validation errors that surface during preparation are never swallowed. This is an existing-cold-path limitation, not a claim that every malformed bank fails before readiness.

The measured zero-miss prepared-path figures do not cover the unprepared cold fallback, which retains possible construction overruns. The tests do not establish deadline safety for maximum-sized private banks or long sessions. No additional queue, phase/reset behavior, calibration or source-bank change was introduced to accommodate fallback. The performance document must keep these scopes distinct and distinguish measured wall/thread-CPU intervals, GC overlap and scheduling uncertainty.

The reviewer independently recomputed the retained portable evidence totals: frozen-04 contains 128 measured processes/19,968 calls; its matched baseline retains 97 misses in 7,680 calls, while prepared-plus-JIT retains zero in 7,680. Frozen-05 repeats 48 prepared-plus-JIT processes/7,680 calls with zero misses. At that check, all frozen-05 trial bindings for the three modified source/preparation modules matched the then-current files. The subsequent typed-budget/fallback revision has different source identities and is not relabelled as that older frozen-05 revision. The portable artifact records 128 passing PCM/lifecycle comparisons for those retained measurements. This check verifies those figures and bindings; it is not a fresh replay of the entire profiling matrix or an independent hash audit of every large raw artifact. New final-revision measurements are coordinated separately.

## Distribution findings and corrections

The initial notice rule accepted any two safe filenames, which did not enforce the notices and third-party review described by the proposal. The coordinating agent corrected it to require CodeWalker attribution, source-boundary and permission notices plus SharpDX's licence; independently reviewed notice completeness and exact third-party obligations are required. If FBX is present, its licence is required. A source-redistribution obligation is incompatible with this source-free packaging profile and therefore blocks it rather than silently discarding the obligation.

The initial CLI checked metadata-file size before an unbounded `readFile`, permitting file growth to exceed the check. It now reads at most 262,145 bytes, compares the observed length and final file identity metadata to the initial size/time, and rejects growth or change. Runtime files/notices use exact bounded handle reads, expected digests, an extra-byte check and pre/post identity checks before any component is published.

The final distribution policy selects exactly three vendor DLLs and my one owned adapter. No directory enumeration or recursive vendor copy chooses extra libraries, GUI files, source or bootstrap assets. Unqualified Core origin, research markers, any unqualified embedded resource and undeclared non-framework references block the policy. Default invocation blocks before touching a supplied software root. Tests package original dummy bytes with simulated review data; they exercise mechanics and exclusions, not Core compatibility or authentic release preparation.

Existing output ancestors are checked before recursive directory creation and again afterward, so a stable linked parent is rejected before that creation can follow it. The final four distribution tests pass after this correction. The pinned receipt remains a trusted external assertion bound to supplied bytes. A caller-provided hash is not a digital signature, publisher authentication, proprietary-data detector or legal clearance. The manifest keeps legal qualification false. The filesystem link checks are pre/post `lstat` checks; they are not atomic Windows no-follow access and do not establish resistance to an adversarial concurrent path swap. This tool is for reviewed owned software staging, and cannot qualify the missing private native containment profile.

## Host readiness boundary

The new host gate waits for producer readiness before either fixture sink or WASAPI startup. Worker preparation and the existing demo lease wait share the same five-second allowance; no block size, reserve, credit window or output queue was enlarged. The review identified a readiness-boundary edge where a ready flag could bypass failure checks after the loop. The coordinating agent added a final common shutdown/stop/reader-end/owner/child/deadline check immediately before sink selection. Source inspection confirms the correction and the unchanged shared deadline. This review does not claim that a source check can eliminate every subsequent concurrent process failure.

The reviewer also checked `WORLD_10_DISTRIBUTION.md` and `ACOUSTIC_WORLD_10_READ_ONLY_PROPOSAL.md` against the implementation. They preserve the unsealed genuine-building boundary, distinguish a trusted review assertion from authenticated publisher/legal proof, exclude the modified research binary from product qualification, and retain the missing public API, capability and native containment prerequisites. The proposal states the current compressed-resource versions, 128-triangle/128-metre scene limits and independently frozen authored-versus-private PCM authority. No new protected-input, launch, endpoint or deployment authority arises from those documents.

## Validation scope

After the distribution corrections, the review runner completed 18 focused tests with zero failures/skips using:

```powershell
node --test --test-reporter=tap --test-concurrency=1 `
  tests/Test-Processing10.mjs tests/Test-SourcePreparation10.mjs `
  tests/Test-CoreDistribution10.mjs
```

Those tests exercise original analytic PCM, original finite-wall reflections, scene-worker cancellation/join behavior, source preparation and dummy distribution data. They open no real audio endpoint and qualify no installed geometry. Host compilation/device-free verification is coordinated separately; reading the host source does not replace those checks.

After the typed-budget/fallback correction, the reviewer reran the expanded source-preparation suite: 13 tests passed with zero failures/skips. Those include the nine-bank capacity case, a counterfeit message error remaining fatal, and invalid prepared PCM remaining fatal. The separate ninth-invalid-bank probe above records the precise deferred-activation limitation. The coordinating agent retains final aggregate and host-build evidence separately.
