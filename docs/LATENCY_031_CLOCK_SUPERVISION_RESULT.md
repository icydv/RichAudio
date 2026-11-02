# LATENCY-03.1: my offline clock and supervisor recovery

The subsequent separately approved one-use endpoint attempt is documented in [my first completed real endpoint result](LATENCY_031_FIRST_ENDPOINT_RESULT.md). This document preserves the preceding offline recovery and its original evidence boundaries.

I've continued my project in a separate branch stacked on PR #79 at `57178c5986b8e82403ceeb9dbf80f2ef2ceaa935`. Codex reproduced both failures from my first endpoint attempt, implemented focused corrections and prepared a fresh candidate from clean operational commit `14e23ee3ca6e2ca0c571a17deafcc6bde38e40e4`.

**This increment is offline. No real endpoint was queried/opened, no GTA/RPH launched, no deployment or live recording occurred, and no merge or native suppression was performed.** My previous candidate/approval remain consumed. The original raw result, missing supervisor receipt and independently passed cleanup remain preserved as historical facts. A new candidate is preparation for fresh approval, not proof that an entire real device run will now pass.

## Why the original clock rejected the retained observations

Codex and an independent reviewer matched all six original clock rows to private raw result SHA-256 `3585fc93e5dcff4984046cde5fa13815cc7d72e0c7c406d3392c7292845b8a32`. The exact final pair advances 3,840 device units at 384,000 units/second: **10.0000 ms**. Its correlated QPC interval is **10.7013 ms**. The **0.7013 ms** residual exceeds the original **0.0418667 ms** budget, reproducing reason 4.

The earlier model treated local query duration and position-unit quantization as a bound on agreement between device time and QPC. Microsoft documents the frequency as nominal and potentially ignoring drift/jitter against QPC; it does not promise agreement to query-resolution precision. [GetFrequency contract](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclock-getfrequency). The retained samples do not isolate hardware position granularity, timestamp latching or OS scheduling as the single cause. A shared-engine wake period is not a device-position accuracy certificate.

The original constructor's bind-clock QPC was not serialized. The fixture explicitly uses the retained Start-before QPC as an admitted epoch before every query. This reproduces the local six-row rejection without inventing the missing original constructor input. Future diagnostics now retain the actual clock-construction QPC.

## New opt-in arrived-position intervals

The legacy three-argument clock constructor remains a reproducible baseline. The new candidate explicitly selects model 31. Normal gameplay continues passing a null event bus.

If an event's timestamp lies between two already arrived, qualified correlated timestamps, monotonic device position bounds it between the two observed positions. Model 31 keeps that whole guarded interval and schedules at its conservative upper bound. It does not interpolate a measured-looking position between observations, extrapolate a future sample or infer an endpoint epoch from PCM release. This is conditional on the documented position/time correlation, not microphone or physical speaker calibration. [GetPosition contract](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclock-getposition).

| Exact retained replay | Outcome |
| --- | --- |
| Original model 30 | Reason 4; 0.7013 ms residual exceeds 0.0418667 ms |
| New model 31 | Arrived guarded interval **[1440, 1922]**, width **482 frames / 10.0417 ms** |
| Selected conservative frame | **1922**, with the interval width reported rather than added again |

The candidate admits at most **512 frames / 10.6667 ms total interval uncertainty**, at most a **20 ms anchor gap**, and requires **three genuinely advancing positive observations**. A separate rolling nominal-rate residual budget of 512 frames plus query guards, over at most 128 anchors, detects gross inconsistency. These are explicit service-admission policies, not calibrated driver accuracy or a changed version of the old query-precision claim. They can stop a future run under sufficiently bad jitter/contention.

An event newer than the latest arrived bracket waits in the existing bounded descriptor storage. Excessive width/gap/margin, stalled positions, timestamp/position regressions, invalid frequency, failed/S_FALSE queries or inadequate history retain rejection. Repeated/startup-zero observations cannot conceal chronology regressions or refresh position-advance health indefinitely. Fine-QPC floor/ceiling checks prevent an event after the newest anchor being mapped early through 100 ns rounding. The additional uncertainty parameter is a one-sided scheduling margin for an already upper-bounded occurrence; these fixtures keep it zero. No unknown symmetric clock offset is hidden in it.

No new PCM queue, fixed retrospective stage, geometry work or source prediction was introduced. Source/session/generation/sequence validation, 250 ms occurrence/observation freshness, lateness bounds, physical direct/reflected travel time and cancellation remain intact. The eight original prepared kernel PCM hashes and the unscaled Bati reference are unchanged. The historical vehicle submission-age baseline of approximately 146/204 ms, including the 62.695 ms ring interval, remains a separate result; this work establishes no new vehicle or speaker-latency saving.

## Original-handle supervision

The new `StartOwned` route retains the actual native process handle returned by suspended `CreateProcess`, records PID/creation identity through that handle, assigns the job before resume, and retains it through bounded wait/exit-status capture. It queries signaled state before interpreting `GetExitCodeProcess`, so an actual exit code 259 remains a genuine exit value. The old ID-associated wrapper exception is reproduced using exact original source in device-free native fixtures. Existing `Start` callers remain compatible; this increment selects authoritative ownership in the experimental supervisor. [Windows process-handle contract](https://learn.microsoft.com/en-us/windows/win32/procthread/process-handles-and-identifiers), [exit-status contract](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getexitcodeprocess).

Structured post-creation failures preserve original identity, termination/wait evidence and actual thread/process close results. Job/process close failure or unavailable status stays failed/incomplete. Normal exit, execution success and cleanup success are distinct. On this host a job-terminated fixture returned exit code zero; forced/timeout flags independently prevent a pass.

The controller records actual monotonic stop/containment/exit observations, checks chronology across successive observations and fails a late-observed exit rather than hiding it behind a successful wait. It does not invent a Stop/forced-close request that was never sent. Its unchanged production limits are 35-second Stop request, 42-second containment and up to three seconds of exit verification; the timer starts before child creation. The output retains its separate callback-observed 30-second bound.

After a claim, the supervisor attempts a truthful new receipt even if startup, admission, wait, status capture, result reading or cleanup fails. The bounded receipt writer serializes before exclusive creation, performs one explicit write without overwrite/retry, and propagates write/flush/disposal failures. An IO failure can leave parseable bytes containing a proposed passing value: the failed outer invocation still invalidates acceptance. Neither a parsed receipt nor later process absence alone establishes a successful experiment.

## Complete failure and format diagnostics

Future raw rows retain unsigned clock returns, query QPC brackets, effective HRESULT, exact rejection reason, previous observations, pair deltas, old residual/budget, guarded frame interval and current integrity budgets. Post-join decimal strings preserve unsigned values for readers that cannot exactly represent UInt64 JSON numbers. Original exception HRESULTs remain separate from surrogate failed-query markers; a failed query's undefined outputs are identified by its failed-row index.

Event receipts retain supporting interval anchors, bounds, extra margin, effective width and mapping outcome. Expired events that skip mapping have unavailable bounds rather than another event's stale anchors. Requested/mix/current format snapshots include extensible fields, full period replies and query brackets. Instantaneous current format/period snapshots are taken before/after initialization and before Start; they are not guarantees against changes by other shared clients. [Current-period snapshot contract](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient3-getcurrentsharedmodeengineperiod).

Format capture, serialization, original audio loading, kernel preparation and filesystem work remain outside the render callback. Exact shared 48 kHz stereo Float32 rejection still stops without substitution. No endpoint settings or calibration were changed.

## Validation and independent review

| Validation group | Actual result |
| --- | --- |
| Original expanded offline harness | Passed; includes native host/transport, histories, event timing, cancellation, authored recording, geometry/resource and lifecycle regressions |
| Complete Node discovery | **78 files, 828 passed, zero failed/skipped**, with retained genuine catalogue/NPC/gameplay inputs |
| Focused clock | **6,812 assertions passed**, exact private six-row witness plus authored adverse clocks |
| Native process ownership | **126 assertions passed**, actual authored Windows helper processes and original failure reproduction |
| Native supervisor integration | **44 checks passed**, eight original fixture lifetimes independently absent |
| Deterministic supervisor fault policy | **16 checks passed** |
| Managed-fake output diagnostics | **153 checks passed** |
| Final exact-root/worker admission | **21 checks passed**, including copied, drive-relative and root-relative path rejection |

These groups overlap. The final fully-qualified review-root hardening was checked by its exact focused admission rerun after the broad harness; it does not change audio code. The original ring oracle retains 16 original scenarios, 64 queue explorations and 69,087 checks. Private trusted-parser fixtures were explicitly supplied; no installed asset scan occurred. CI lacks my private bank/parser inputs and cannot replace their local evidence.

Clock tests include the actual rejection, authored jitter/100 ppm drift, gross/inconsistent rate, startup/repeated-query regressions, stalls, missing brackets, excessive uncertainty, fine timestamp aliasing and invalid frequencies. One-percent authored drift is rejected at sample 110; the accepted 5,000-sample 100 ppm fixture has at most seven frames of local residual. These exercise policy, not measured device drift. A retained 4,950-iteration warmed pure-clock loop allocated zero managed bytes and took 1.4447 ms total; this is not a real callback benchmark. Twenty-four warmed authored observation/admission/mix iterations also allocated zero managed bytes.

Native tests cover normal/nonzero/early exits including 259/UInt32-max, timeouts, retained-handle termination, job/descendant containment, invalid handles and authored wait/query/close/start failures. Production binaries exclude compile-time fault switches. Receipt tests retain partial/failed IO outcomes and complete byte bounds. Independent reviewers corrected chronology, stale diagnostic, late-wait/deadline, receipt-writing and evidence-binding findings before sealing the candidate.

An initial offline preparation failed during Node command discovery before any candidate directory or Node/compiler execution. Its redirected log is empty because the terminating error escaped to the execution tool; a separate observation receipt records that limitation rather than presenting it as captured raw stderr. The source was corrected, independently reviewed and committed to select one primary application with the original Node hash. The next preparation created the fresh candidate. An unreviewed proposal wording clarification and its initial draft are preserved separately; no approved artifact was changed.

## Exact next boundary

The [new proposal](LATENCY_031_REAL_ENDPOINT_PROPOSAL.md) retains the exact 526-event sequence, eight kernels, original Bati audio, shared-mode initialization and 30/35/42-second limits. It requires the exact private candidate root, all **68 payload/63 source bindings**, one-use markers, an independently bound review and mandatory independent manual postflight.

Proposal SHA-256: `1f50da0effe5716467d54f10d03076dee709391003e32bf90600d4b664ae52bb`

Manifest SHA-256: `3c074154fde2c2502ffd5b996d02451dac51da1ef76513c6ae67b1c182565807`

Independent exact-candidate review SHA-256: `f49a908a7c58f5163a05adaefd87cac95e043f9ca73c47ef768e2ccda9ad6702`

The exact independent review and its digest are bound in the [sanitized offline evidence](../evidence/latency-031-offline-result.json). Real endpoint qualification across the full sequence, nonzero Bati continuity, event-onset submission percentiles, adverse-load reliability and physical speaker output remain **unverified**. The approximately 15.5 ms fake-submission median has not become a real result. I am stopping at preparation for fresh explicit approval; no new endpoint attempt is authorized by this report.
