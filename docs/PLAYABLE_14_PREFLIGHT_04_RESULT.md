# PLAYABLE-14: the pinned coordinator refused reuse before deployment

**Decision: BLOCKED — `Existing attempt; no preflight retry.`** The fresh approval requested another passive test using the exact coordinator receipt `8fb6a5e22f9808bc787126d2245d931a7595e649ed47d9ad91bdce50c7d24f66`. Its single preflight invocation exited with code 1 before deployment, launcher invocation, lease creation or operator Start. This is a coordinator reuse guard, not a new GTA/runtime failure or another observation of the earlier source expiry.

The approval was recorded truthfully as attempt 4. The approved `scoped-03` coordinator still hard-codes `live-03` and requires `attempt=3`; its Preflight mode refuses an existing attempt directory before reading the new authorization. The completed third attempt's receipts and capture occupy that directory. The four coordinator files and receipt match their approved hashes. They have no parameter or environment override that safely selects a new attempt. Copying unchanged bytes elsewhere would still address the old directory.

The exact preflight ran once at **20:16:26.7167803 UTC on 1 November 2026** and its terminal result was retained at **20:16:27.1615037 UTC**. The actual exception is from `LiveActions.ps1:59`. All 60 files under the completed `live-03` directory were hashed before and after this invocation and remained unchanged. No old receipt was deleted, renamed or reused, no attempt identity was impersonated, and no fallback coordinator or second preflight was executed. No new live directory was created.

Both approved payloads remain unchanged:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Passive `Plugins/RichAudio.dll` | 361,472 | `ba19342ce5ceac63d179943e22d324819a42a8c8294d7f15e436f3833e01be0f` |
| Native SHV producer | 129,024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |

No game rollback was needed because this approval caused no game write. Independent read-only verification rechecked all 11 protected files, four settings, saved stock fallback/F10, disabled production flags and 27 absent owned paths, together with owned process absence and the candidate/source/package pins. No playback, endpoint access, recording, game/configuration change or forced termination occurred. Native telemetry counters are unmeasured, not reported as measured zero.

## Retained review correction chain

The current integrity review distinguishes an earlier analyst draft from the final published analysis. The third attempt's restoration review at 19:48:51 UTC pinned the handoff analysis then present at its original filename: 18,558 bytes, SHA-256 `41762b86d3c3a14e823ed48218e69f6141a87c25aaeab7ed8f397ee21a7bff6f`. Those exact bytes remain in `independent-handoff-review-draft-01.json`. The final handoff review is 18,576 bytes, SHA-256 `1eccf3a68ee4ca808153d459107902fcd64fad6fa5cece26d3bfa9b32d682781`, as pinned in the published retest evidence.

Exactly three JSON text fields differ: the analyzer hash, a stale sentence about a rejected camera sample replaced with the actual absence of a listener rejection in attempt 3, and cadence prose corrected from “55–56 ms” to approximately 56 ms. Numeric telemetry, counts and completion uncertainty are unchanged. The old restoration review is preserved as a historical snapshot, rather than rewritten to claim that it sealed the later final review. The new integrity review records both versions and their relationship. This correction does not alter the protected game files or the retained raw capture.

## Prepared operational successor

A new, separately reviewed coordinator is prepared only for **attempt 5**, using a new `live-05` evidence directory and authorization identity. Its changes are limited to the attempt/directory references and corresponding helper hash pins. The original `scoped-03` remains unchanged. An unexecuted intermediate `scoped-04` preparation is retained as an obsolete draft; it has no operational receipts and was never run.

The [attempt 5 proposal](PLAYABLE_14_RETEST_05_PROPOSAL.md) binds the concrete successor. No mode of that successor has executed, and no attempt 5 authorization exists. The current approval named the consumed coordinator; the original procedure explicitly ends an attempt on preflight failure, even before capture. Therefore it cannot silently authorize substituting the newly prepared coordinator or retrying this terminal preflight.

This path correction does **not** diagnose or fix the previous `source-silence-or-expiry`. The last genuine live result remains [32 idle frames and incomplete passive qualification](PLAYABLE_14_RETEST_RESULT.md); the exact missing source-to-consumer stage is unresolved. The previously identified Clock/Poll/callback observability gap remains. No audible candidate has advanced under the conditional full-pass approval.

[Sanitised preflight and integrity evidence](../evidence/playable-14-preflight-04.json) retains the genuine failure and binds the independent review. Draft PR #76 includes this result without representing it as a new gameplay test.
