# CI-RECOVERY-01: my unsent-expiry investigation and correction

I required PR #80 to stay at `247e3bc0f07374c0e9cf28b9cd0f65958c3615c5`; Codex continued in a separate stacked branch. This change concerns device-free expiry fixtures and their diagnostics. **Production transport, audio generation/rendering, source freshness and all completed LATENCY-03.1 results remain unchanged.**

## What I can establish about the original failure

Codex retrieved and retained the complete decoded logs for failed [run 41517354511](https://github.com/icydv/RichAudio/actions/runs/41517354511) and passing [run 41486724046](https://github.com/icydv/RichAudio/actions/runs/41486724046). The five relevant inputs were identical between their heads: the expiry script, native fixture, `StatePipe.cs`, offline harness and workflow. The later head changed only endpoint-result documentation/evidence.

The failed run passed `none-1/2/3`, then threw `Case failed; no retry: domain-1` at the combined assertion. Its receiver/sender JSON was read before that assertion but printed only afterward. No artifact was uploaded. The earlier child wait/exit checks and JSON reads had completed, but the individual connection, attempt, acceptance, rejection and outcome operands were not retained.

**The exact failed operand and cause of that historical run cannot be recovered from the available evidence.** I have not labelled it flaky or claimed that a later reproduction reveals missing historical data. Both original runs and their statuses remain untouched.

The passing run does retain a useful cold-start comparison:

| Passing historical case | Accepted / rejected | First unsent expiry age | First cold encode |
| --- | ---: | ---: | ---: |
| `domain-1` | 14 / 0 | 416.4256 ms | 381.5319 ms |
| `domain-2` | 17 / 0 | 277.2377 ms | 259.4054 ms |
| `domain-3` | 17 / 0 | 275.3769 ms | 258.6472 ms |

Those expired observations were correctly withheld. They were not accepted late or retimestamped.

## The fixture assumption reproduced independently

An independent agent compiled the exact original fixture and production source blobs from `247e3bc`. Three nominal cold-AppDomain runs passed, accepting 16 frames each with zero rejections. Codex and the reviewer then used controlled device-free scheduling to distinguish codec preparation from transport behavior.

The adverse comparison pinned only authored fixture children to one already-allowed CPU and added three normal-priority authored CPU workers for a bounded 2,200 ms. It changed no machine-wide scheduling, volume or game settings.

| Matched independent comparison | Accepted / rejected | Result |
| --- | ---: | --- |
| Original fixture under contention | 0 / 1 | First encode 1,369.0492 ms; unsent observation expired at age 1,455.1212 ms; receiver `header/deadline/TimeoutException`, sender `payload/operation-failed/IOException` |
| Fixture-only codec preparation before transport, same contention | 9 / 0 | Both outcomes `deliberate-stop`; first encode 0.1863 ms, decode 0.0898 ms, decision age 15.8357 ms |
| Current corrected fixture under contention | 20 / 0 | Both outcomes `deliberate-stop` |
| Current causal negative under contention | 0 / 1 | Original header deadline and failed sender outcome retained; expired unsent age 789.4888 ms |

In the original adverse failure, connection and attempt counts remained one. The exact failed predicates were acceptance greater than zero, rejection count zero, receiver deliberate stop and sender deliberate stop. **Both child exits were zero.** A clean child exit therefore could not replace transport-outcome assertions.

The production receiver begins its 750 ms first-header deadline after connection. The old positive fixture started that connection before cold codec work had completed. Correctly suppressing an observation older than 250 ms does not renew an outstanding header deadline. With enough cold preparation cost, the receiver must terminate. This establishes a reproducible fixture scheduling assumption; it does not establish the original hosted failure's missing cause or a production transport race.

## Focused correction

The success fixture now performs a discarded original synthetic protocol encode/decode/copy round trip in the relevant AppDomain **before** `StatePublisher.Start` or receiver startup. The prepared bytes are never published. Actual test observations are generated afterward with their original QPC timestamps, sequence and identity. Preparation/start brackets and the unpublished warm-up state are checked explicitly.

The tenth default case, `domain-late`, deliberately withholds first encoding until the receiver has actually reached its terminal state. A bounded fixture-only named event establishes that ordering; it does not rely only on a requested sleep. Assertions require zero accepted frames, one rejection, one connection/attempt, the original header deadline/timeout, a failed sender outcome and the matching expired original observation. The receiver's finished QPC must lie inside the held encoding bracket. A missing signal, changed outcome or invalid chronology fails the fixture.

Existing 350 ms before/after-encoding cases continue proving unsent stale suppression. The original 900 ms late case remains. Historical `-Baseline` compilation keeps the deliberately unchanged old transport, including its cold path; controlled `before`, `after` and `late` cases still distinguish the old behavior. Its older timing type has no `ObservationTicks` member, so instrumentation preserves that absence rather than supplying a substitute.

No production file changed. These limits remain byte-for-byte unchanged: **250 ms maximum freshness, -2 ms future bound, 750 ms header deadline, 1,000 ms startup budget, four startup stale discards and one strict connection attempt**. The correction does not promise successful production startup under unbounded CPU starvation.

## Failure diagnostics that survive the throw

Codex selectively reused the project's previously reviewed diagnostic work from `d1cfd4ac07fb46b90efd7c88fcebd05932c7bf89`, preserving this branch's newer baseline compilation exclusions and transport contracts.

- Every case retains named failed predicates, exact sender/receiver outcomes and counters, original clock integers, expiry decisions, process exits, missing/invalid record states and cleanup failures before throwing.
- Source transport exceptions retain their existing stage/code/type category. Fixture and wrapper exceptions additionally retain HRESULTs. Arbitrary exception messages, stacks, paths, pipe/session names and payloads are excluded from publication.
- Private child-record input is capped at 64 KiB. Each fixture captures at most 32 publication records and 32 pre-first-wire encoding candidates. The public projection retains bounded prefixes with explicit counts/omissions; it never labels later encodes with an obsolete first-frame timestamp.
- Public output is capped at 16 KiB. Independent review demonstrated an allowed 16,566-byte projection that previously threw before printing any operands. The corrected publisher emits a compact **failed** record with the original failed predicates, decisive counters/outcomes, process status, original first-event timing and explicit omitted sections. Diagnostic overflow cannot turn into success.
- Required local/hosted retention failure is also a test failure. Console evidence precedes retention attempts, and original failures survive secondary IO/cleanup errors.
- CI always attempts upload of only the fresh reserved directory's sanitized JSON, using the already-reviewed pinned action and seven-day retention. It never uploads raw child files, audio or private assets, and upload cannot override a failing test step.

## Validation and evidence limits

The root ten-case suite and an independent ten-case suite passed, including both expected-terminal cases. Independent review checked 358 original-timestamp, identity, preparation and causal-order assertions. Controlled historical pre-fix `before/after/late` cases also passed their expected rejection checks.

The final diagnostic projection suite passed **107 PowerShell checks and 11 native record checks**. The independent 16,566-byte stress record now produces a 9,397-byte compact failure with all 24 original failed predicates plus the explicit size-failure predicate, before the exception and in both durable destinations. Maximum-field stress with 64 distinct bounded failure labels measured 15,351 bytes, or 15,550 bytes after both retention destinations failed, below the unchanged 16 KiB output cap. Neither positive transport data nor a retention failure can override a failed diagnostic-size requirement.

The complete local `Test-Offline.ps1` harness passed, including native host/transport/recording-fixture, waveform, source-history, camera, continuity, ownership and acoustic-world regressions. That local run preceded the later oversized-diagnostic hardening; the final focused projection tests and the new PR's complete CI qualify that final helper. The PR description links exact-head CI results and final review receipts. An unavailable or failed check must not be treated as passed.

All original failed observations remain retained, including the diagnostic size-bound finding. A historical-baseline compatibility compile initially exposed its missing old timestamp field; the corrected conditional instrumentation passed in a new output directory. An independent adverse probe initially used a renamed executable inconsistent with its AppDomain assembly identity; those failed records remain separate from the corrected probes. Neither development error is presented as a production defect.

[Sanitized results and evidence hashes](../evidence/ci-recovery-01-result.json) contain the measured case outcomes and preserved-log bindings. Complete original logs, raw fixture records and review receipts remain private.

Codex reverified all **78 files** in the consumed LATENCY-03.1 candidate, all **68 payloads**, all **63 protected source bindings**, and the clean original PR #80 worktree. The endpoint raw-result SHA-256 remains `ac69bacc6d7f3bd42668aec103d9110521485d53848bcd3c15edc8e274d3f0f5`; its complete supervisor receipt remains `4e87c4bcaec3af52cdbbe8ca294461fb367e5c128c79e989d1ce9b296c341aa8`. The candidate remains consumed. No endpoint, GTA/RPH, deployment, live recording, native suppression, retry of the endpoint experiment or merge occurred.

## Practical blockers to actual GTA integration

1. **Authoritative event acquisition:** the production acquisition capability remains blocked. There is no verified exact Enhanced/RPH adapter supplying original shot/contact timestamps, identity and multiplicity. Polling or hit notifications cannot be relabelled sample-accurate emission events.
2. **Native ownership:** all 48 vehicle-component takeover rows remain blocked/native-owned. Selective per-instance suppression, original state recovery and independently proven crash restoration are still missing. Replacement direct blasts cannot safely duplicate GTA's native sounds.
3. **Gameplay timing and coexistence:** ordinary gameplay intentionally retains a null event bus. The isolated successful synthetic endpoint run does not qualify GTA-to-host priority transport, clock provenance/uncertainty, cancellation, moving generations, simultaneous continuous/transient demand or full-tail scene validity. Physical speaker latency and live throttle response remain unmeasured.
4. **Effective installed acoustic world:** mount/override ordering, Enhanced/Gen9 resource compatibility, geometry scale/material qualification, persistent supported-world coverage and private installation access are unqualified. Runtime cross-tile scene unions, progressive Story Mode preparation and dynamic doors/destruction also remain incomplete. Undiscovered geometry remains unknown.
5. **Observed component physics:** real wheel slip/load, collision identity/contact/material/impulse, turbo pressure-release behavior and many other component events remain unavailable or unqualified. Current authored sources and collision demonstrations do not establish those observations.
6. **Integrated performance and validation:** moving listener/source histories and prepared path horizons must remain valid through full event tails while bounded map preparation runs asynchronously. Existing defaults/calibration stay intact. Further endpoint or GTA validation needs a separately reviewed candidate and fresh approval; this CI correction grants no live authorization.
