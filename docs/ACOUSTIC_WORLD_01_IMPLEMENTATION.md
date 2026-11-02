# ACOUSTIC-WORLD-01 — first offline implementation result

I have started the continuity, static-world and latency implementation on draft PR #77. Codex implemented and tested these changes in a separate checkout, preserving the PLAYABLE-15 branch and closed live approvals. This is an offline candidate, not a completed city map or a claim of uninterrupted live audio. Selective native replacement remains blocked.

## What is implemented

| Track | Implemented result | Remaining boundary |
| --- | --- | --- |
| Camera continuity | Separate opt-in `camera-source-01`; one observation clock, piecewise camera history and independent valid vehicle/grain history | Residual unobserved camera interval stays unavailable; no invented listener pose or live audibility pass |
| Low latency | Opt-in Bati-only `low-latency-01`; 75 ms retrospective delay; original eight-block cold reserve; six steady credits only after genuine source-output health | Cold phase affects submission ages; smaller queue is not an established total-latency reduction |
| Static world | Explicit fixture resource precedence, validated placements, separate versioned static cache, converter revision, scoped invalidation and bounded worker preparation | Authored fixture format only; no new installed scan, binary resource coverage or custom-map certification |
| Building reflections | Genuine retained Bati through the existing solver/renderer, matched open/wall/passage fixtures | No installed GTA building, material or perceptual proof |
| Native ownership | Disabled offline policy, exact identity/restoration rules and preserved P2-02 negative controls | No verified selective engine/exhaust suppression or independent recovery mechanism; no live adapter |

The baseline audio defaults remain 100 ms retrospective delay and eight credits/startup blocks. The original engine/exhaust calibration, source banks, source-expiry gate, history budgets, processing buffers and endpoint policy are unchanged. Geometry adds no PCM queue. The two opt-ins are independent; a future latency comparison must keep continuity policy identical between arms.

## Continuity and retirement

The retained WAV still contains exactly **89.604 and 100.729 ms** internal near-silent windows. The original sealed module and current default produce bit-identical PCM on the same constructed retained-observation replay. Because every live Node acceptance time was not logged, that replay is not called an exact reconstruction of the live WAV.

On that shared replay schedule, `camera-source-01` reduces approximately **89.646/89.917 ms** gaps to **47.167/47.229 ms**. Authored ablations separately demonstrate listener rewarming, loss of vehicle pose history and dry-source pausing. Preserving only one history is insufficient. The combined policy retains one source and advances its grain clock while keeping genuine spatial/Doppler generation resets and the original 50 ms forecast ceiling.

The remaining gap is explicitly unavailable listener history. My binary-OFF dismount feedback remains unresolved: the retained combined scope-loss decision did not prove an engine shutdown. Diagnostics now distinguish scope/identity/expiry loss from an accepted `running=false`, and the opt-in never applies a later false state before its observation time. No ignition-off event, post-dismount trajectory or engine rundown was fabricated. [Detailed continuity result and ablations](ACOUSTIC_WORLD_01_CONTINUITY.md).

## How much delay is established as removed

The common-clock retained replay selects observations approximately **25 ms younger** after changing the retrospective delay from 100 to 75 ms. Device-free production-chain tests also show lower ring residence after the qualified eight-to-six credit transition; nominal pairs measured a roughly **17 ms** median reduction.

These are **not additive end-to-end measurements**. Submission-age results varied between separately cold-started pairs, including a pair that became worse. The first observation-to-render anchor precedes independent prefill/output startup and remains fixed; the final fixture records raw clock/first-submission anchors to investigate that phase. No moving-source clock calibration or relabelling was introduced.

The final source-bound pair measured newer **authored pose** observation age at fake submission of **123.776 → 93.740 ms**, and ring median **72.711 → 55.675 ms**. These are not native operating-state acquisition ages and cannot be substituted for the prior live **146/204 ms** native endpoints. The ring contribution is already included. Earlier contradictory pairs, cold failures, maxima and CPU-contention failures remain in the report. One pair below 100 ms does not establish a robust native-source submission target; the below-30-ms ring target was not achieved.

An immediate six-block cold reserve failed by 64 frames and was rejected. The candidate retains the original eight cold blocks and reduces outstanding credits once, after observed engine/exhaust/stereo output health. Actual severe contention on two owned CPU cores caused fatal starvation in both profiles. No failure was hidden by resuming playback, relaxing freshness or expanding a buffer. [Full distributions, processing costs, failure cases and clock limits](LOW_LATENCY_01.md).

## World foundations and matched reflections

The pre-existing CodeWalker collision/placement/classification/warmup foundation was already in the baseline and remains intact. The new authored-panel adapter reuses its transform code; it does not compete with the renderer or masquerade as a GTA binary decoder. Inventory and cache authority remain fixture-specific. Unknown overrides and unsupported areas never become verified transparent space.

The cache binds schema, converter revision, build/map identity and resource digests. Its bounded worker prepares local/source-corridor tiles away from the game and audio callbacks, with cancellation, explicit terminal completion and joined failure handling. No automatic startup inventory or private installed asset was accessed.

Four-second matched renders use bit-identical genuine Bati dry PCM. The empty fixture is output-identical to conditional direct sound. A wall and passage produce four and six finite paths, with peaks **0.05534/0.07222** versus **0.05030** in open space. Reflected delays and band/stereo metrics come from the existing engine. Source histories/calibration are unchanged; cold deadline misses remain reported. [Static contract, worker/cache limits and reflection measurements](ACOUSTIC_WORLD_01_STATIC_FOUNDATIONS.md).

## Native replacement remains blocked

Codex recovered the original P2-02 research from its historical commit, rechecked the retained SDK metadata and pinned public declarations, and preserved the original ownership simulation. The new prototype cannot enable production takeover. Exact session/handle/generation/model, eligible fresh observations, known baseline, component isolation, measured handoff and independently surviving recovery are separate requirements. Failed restoration stays unknown/failed. A copied audio profile remains a research lead, not a verified mute.

A separate review corrected a policy bug that allowed an ineligible observation's fresh timestamp to qualify preparation. Only a new eligible observation can now requalify it; health status alone cannot. The final ownership suite passes 32 tests. [Mechanisms, component boundaries, negative controls and rollback](NATIVE_AUDIO_OWNERSHIP_01.md).

## Validation and independent review

- Expanded `tools/Test-Offline.ps1`: **644 Node executions, zero failures, zero skips**, plus existing GPU/CPU, managed/native host, transport, recording, geometry, settings and telemetry checks.
- After final fixture-only timing metadata and ownership corrections: native host rebuild/tests passed **1,702 assertions and eight shutdown modes**; camera **11 cases/37 assertions**; journal **four profiles/56 assertions**; frame adapter **15 cases/74 assertions**.
- Additional genuine-package gameplay/source/grain/phase/waveform regressions: **55 tests, zero skips**. Final integrated ownership/world/continuity/profile group: **69 tests, zero skips**. These overlap the broad suite and are not added into a unique-test total.
- Exact original `d9fdc90` PCM ring versus current default: **16 matched authored scenarios**, alongside **64 queue exploration scenarios**. No default PCM, credits, queue-depth or fatal-underflow behaviour difference was found under those fixtures.
- Independent reviewers checked continuity, static geometry/cache/workers, native policy and the latency profile/fixture source bindings. Resolved findings include converter-revision invalidation, worker terminal success and ownership eligibility. Original private review receipts are preserved; follow-up reviews are separate receipts.

An additional journal fixture initially completed its four executable cases but could not write its report because this new checkout lacked an old private diagnosis input. Codex copied that retained input byte-for-byte, verified its digest and reran the report successfully. No proposal, approval, test threshold or historical receipt was regenerated to fit an authorization.

The original 15 preserved live-evidence files, totalling **31,926,034 bytes**, were rehashed against preservation manifest `62efb00fa7f5972e3d9211f8f135d1957e2f87e50f3c854b20766de4fc80c001`. Recordings, bank material, derived WAVs, detailed traces and cache data remain private. Publication screening now also rejects the new static-cache extension/header.

The original approved recording-recovery proposal in the preserved PLAYABLE-15 checkout still hashes to `11d6dab69ed6d5cfa44b68f1e2a7001bc48c0ca371b62e86495dd712050a3ddf`. Git's existing `core.autocrlf=true` materialised a CRLF copy in this new checkout (`08316ab7e050e63ffb50e3e684f0fc1539817ce21508e6d24fc20c118d09c4f6`), with identical Git content but different bytes. That new-checkout copy is **not an approved artifact** and was never substituted into an approval binding. Neither copy was edited or repinned; the original LF artifact and closed authorization remain preserved.

## Next controlled boundary

The [future latency A/B proposal](LOW_LATENCY_01_LIVE_AB_PROPOSAL.md) describes **one experiment containing two independently sealed and restored attempts**, with identical continuity policy and unchanged sound settings. It requires new exact deployment candidates, supervision/rollback review and explicit approval covering both arms. Existing one-start session authorization cannot be stretched into two starts or a pointer swap. The present fixture packages are not approved deployment artifacts.

Further installation-derived map work requires separately scoped access to actual supported assets and coordinate/precedence/coverage qualification. Natural post-dismount continuation requires a genuinely observed eligible vehicle lifecycle. Native engine/exhaust takeover requires the missing supported control and recovery contract. None of these boundaries is cleared by the offline results.

No GTA/RPH launch, deployment, real audio endpoint, new live recording, installed archive modification, native suppression or merge occurred. PR #76's results and closed authorizations remain unchanged; PR #77 remains draft.
