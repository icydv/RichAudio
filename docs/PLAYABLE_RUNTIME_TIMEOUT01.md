# Bati runtime timeout: narrow correction and remaining listening blocker

I heard RichAudio in the approved manual-arming attempt at `34522635a82cf0a8af769ecc4624f841524362df`. It consumed 14.672 seconds of audio before the runtime retired. The original installation was restored; that approval remains consumed. Codex has made no further deployment or launch.

## First-fault evidence and its limits

The retained live RPH log reports a Bati-runtime `TimeoutException`, but does not retain its original message or stack. The stopped host status replaced its running status. My live record alone cannot establish the exact watchdog operands or whether publication was missing, stale, blocked or misobserved. The two render-deadline misses and zero underflow do not identify the timeout's cause.

Codex reproduced the **same explicit status-watchdog exception** through the actual runtime/host/Node/renderer chain, using original-authored procedural PCM and an authored executable identity with a device-free sink. That ordinary run retired after 58.650 seconds with `Bati host status stopped`. Before shutdown, the new first-fault receipt captured a running host, continuing progress, zero underflow and a status file only 2.583 ms old. The captured stack names `GameplayRuntime.RunBati`.

A separate bounded Windows reproduction isolated the unsafe operation: during the same `File.WriteAllText` / `File.Replace` publication pattern, `File.Exists` returned true but `File.GetLastWriteTimeUtc` returned **1601-01-01**, its invalid/unavailable metadata sentinel. The old watchdog interprets that as an expired status and throws immediately. This occurred after 21 probes and one publication in 1.859 ms. The supported false-timeout mechanism is demonstrated; the historical live attempt did not retain enough information to prove that its precise query returned this sentinel.

No evidence attributes the demonstrated race to a blocked status writer, wrong session path, producer death or a render-deadline miss. No fixed fifteen-second runtime limit was introduced or inferred. A second unchanged-policy 90-second authored run completed successfully; the race is schedule-dependent, not a fixed duration.

## Correction

The Bati supervisor now projects each valid publication's **remaining five-second lifetime** onto the monotonic clock. A missing, sentinel, future or unchanged timestamp cannot renew it. A transient invalid metadata read retains only the already established expiry. A genuinely absent/stale publisher still times out; the ten-second startup allowance is unchanged. Explicit OFF/ON starts reset this per-host state, without changing no-revival-after-fault rules.

The host's existing independent producer-progress and source-expiry checks remain unchanged. This is a status-publication check, not a new heartbeat that can legitimise stalled PCM. No audio buffer, source gain, bank mapping, scene lease, rendering quality or native sound policy changed. No metadata/world/GPU/menu implementation was changed for this task.

Before stopping a faulted Bati host, the runtime retains one private `runtime-first-fault.json` receipt, bounded to 16 KiB, containing the original exception type/message/stack, session/PID, status metadata and selected pre-stop progress fields. Malformed or unavailable status cannot replace the primary exception. The receipt is not overwritten during shutdown or treated as playback authority.

## Focused results — including failures

| Check | Actual result |
| --- | --- |
| Status lifetime contracts | 10 checks passed: missing/sentinel/unchanged/future observations cannot extend the five-second lifetime. |
| Atomic publication race with corrected policy, final build | 34,160 probes, 8,683 observations that would trigger the legacy watchdog, **zero corrected false timeouts**. |
| Real chain with deliberately withheld publication, PCM still progressing | Safe watchdog retirement passed; original `Bati host status stopped` and stale status evidence retained before shutdown. Startup allowance/five-second bound unchanged. |
| Real chain with terminated Node producer | Safe retirement passed; first fault `Bati gameplay host exited`, host detail `producer ended`, no revival and bounded closure. |
| Corrected cold 90-second attempt | **Failed early:** producer starvation, 64 underflow frames; retained separately from the timeout. |
| Corrected 90-second attempt without immediate compilation before startup | **Failed:** 145 running samples through 89.635 seconds after nonzero activation, then producer starvation with 192 underflow frames. No status-watchdog timeout. All owned processes joined. |
| Rebuilt prototype components | Authentic-SDK audible plugin and current host compiled with the correction. No payload-bank reads, endpoint, game launch or installation changes. |

The failed duration runs are not relabelled as passes or hidden by subsequent controls. An accelerated publication control also starved its original PCM chain; it is retained as an unsupported scheduling-pressure failure, not used as the race proof or a performance result. Fixture-authoring/compilation and an initial failure-control assertion race are retained privately. The corrected failure control explicitly accepts only the intended terminal failure and verifies its first-fault reason.

The real chain tests use the production loaders and JavaScript producer with authored file-backed PCM/catalogue premises, a privately compiled identity fixture and the existing device-free output route. They read no installed GTA file or proprietary bank. The authored identity executable is never launched. They establish contracts for that fixture workload, not live audibility, physical latency or sustained GTA performance. The existing native producer's unconfirmed live completion/FIFO drain remains separate from the later verified process closure.

## Next decision

**The false status-timeout mechanism is corrected, but the prototype is blocked for another proposed listening attempt because the required corrected 90-second check did not complete.** The separate demonstrated producer-starvation failure is relevant to the intended listening window. Codex stopped without changing audio scheduling, increasing buffering, optimising GPU work, rerunning historical populations or preparing another manual-arming proposal.

Only the affected plugin and host were rebuilt under `.local/playable-15/runtime-timeout-components02`. The previous package, proposals and genuine evidence remain unchanged. A future deployment would need new source pins, plugin/host hashes, package-manifest and pointer/lease bindings, plus fresh approval; no new deployment scope has been issued while the duration criterion is failing. Newer unrelated working-tree changes were preserved.

The reproducible original-only runner is `tools/Test-BatiRuntimeHealth01.ps1`; its default duration is 90 seconds. It retains duration failure and separately runs dead-producer and withheld-publication controls, without automatic retry. The task's raw evidence remains under `.local/playable-15/runtime-timeout01`.

The subsequent [first-underflow correction](PLAYABLE_FIRST_UNDERFLOW01.md) preserves these failed populations, identifies the credit-return dependency and device-free catch-up error, and records a successful corrected 90.240-second authored run. The blocked decision above belongs to this earlier checkpoint.
