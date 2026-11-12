# GATE-A-SHVDNE-PRIVATE-01 — independent supervision

I require a stopping procedure that does not depend on Codex noticing another journal row or finishing its current tool call. Codex implemented and device-free tested a separate Windows monitor and a small probe IPC client. **This is offline implementation evidence, not permission to install or launch the private-profile experiment. The existing 10 ms performance classification remains FAILED.** Registration, positive marker identification and cleanup admission remain separate prerequisites.

## Historical control failures remain recorded

The [Stage 1 execution](SHVDNE_SMOKE_01_EXECUTION_01.md) observed normal process absence at approximately 23:34:33 on 11 November, before its conservative 23:34:48 cutoff. A later 23:34:51 recheck did not establish a late actual exit; the separate exit-timing receipt preserves that distinction.

The [Stage 2 execution](SHVDNE_SMOKE_02_EXECUTION_01.md) did not discover its early timing failure until the 00:23:12.054 journal read on 12 November. Normal process absence was observed at 00:23:46.570, inside the attempt's later observation and absolute ceilings. The gap in journal inspection is not a timely independent failure detector.

The [Stage 2B execution](SHVDNE_SMOKE_02B_EXECUTION_01.md) explicitly failed deadline compliance. Its external monitor detected failure at 11:02:43.710172; the 32 records had drained by 11:02:47.660476, before the five-second deadline at 11:02:48.710172. Codex nevertheless delayed the normal quit request until approximately 11:05:29 and its confirmation until 11:05:36.8526275. The 11:03:42.624247 conservative diagnostic cutoff and begin-exit-by-45-seconds rule were also missed. I subsequently confirmed that I had quit; persisted process absence was 11:08:54.6823058. The later exit and exact disk restoration did not repair the earlier procedure failure. Those original reports and raw records are unchanged.

## Implemented boundary

The new files are under `tools/native-control/private-profile/`:

| File | Responsibility |
| --- | --- |
| `SupervisorProtocol.cs` | Current-user named control handles; exact process binding; one manual activation; heartbeat, failure, stop and separate cleanup reports |
| `SupervisorPolicy.cs` | Immutable monotonic deadlines, one-time process-age mapping, latched failure and escalation state |
| `SupervisorMonitor.cs` | Separate executable, exact target metadata/hash validation, independent stop notification, user exit acknowledgments, process-exit observation and read-only restoration verification |
| `SupervisorBuild.ps1` | x64 .NET Framework compilation into a fresh repository-private directory, source/binary hash receipt |
| `SupervisorTests.cs`, `SupervisorTest.ps1` | Authored policy tests and real disposable-process supervision fixtures |

The monitor does not launch its target. It does not invoke game natives, send game input, read game-process memory, start RichAudio's audio host, restore installation files or terminate the target. It has no `Kill`, `TerminateProcess`, `Stop-Process`, close-window or game-quit implementation. The fixture harness can terminate only the disposable processes it created if fixture cleanup fails; that code is not compiled into the supervisor executable.

Before admitting a client, the monitor pins the process ID, process creation UTC ticks, executable path and executable SHA-256. It retains the original process handle for exit observations. It rejects an incorrect identity and rejects attachment more than ten seconds after process creation. Negative process age, backwards QPC and a validation-span UTC/QPC disagreement over 250 ms are rejected. The monitor maps observed process age to QPC once, subtracts that age, and freezes its deadline origin. A late attachment does not receive a new complete lifetime. UTC is not used to renew deadlines after this mapping. The initial mapping remains dependent on trustworthy Windows process-time/UTC metadata; the check is not proof that the wall clock was never adjusted before attachment.

Every session uses fresh current-user named handles. The default `SupervisorProbeClient.TryOpen(session)` also obtains its own PID/creation ticks and requires the monitor's corresponding identity event, preventing accidental connection from another process or a reused PID. A named one-token semaphore is consumed on the explicit manual activation command, before spawning. Disposal, failed spawn, a second client and script reload cannot replenish it. Existing session evidence directories are refused rather than overwritten.

The client checks a mutex held by the independent monitor as well as its stop event. If the monitor disappears, an abandoned or available guard means stop. Keeping an old event handle does not make a dead monitor appear healthy. Only supported script callbacks may react by revoking arming and attempting normal retirement; no native cleanup runs on the monitor thread.

The probe-facing API is `RichAudio.GateA.Private01.Supervision.SupervisorProbeClient`:

```csharp
// Open during worker initialization; missing/exception means no activation.
var supervision = SupervisorProbeClient.TryOpen(reviewedSession);

// Every supported tick, including dormant/manual phases:
bool mayContinue = supervision != null && supervision.Heartbeat();

// Consume only after the explicit manual activation command:
bool claimed = supervision != null && supervision.TryClaimActivation();

// After irrevocably disarming, before any normal retirement attempts:
supervision.ReportStopAcknowledged();

// Failures and exact disposable-vehicle cleanup are different events:
supervision.ReportFailure();
supervision.ReportVehiclesRetired();
```

The client must treat a missing monitor, IPC exception or `StopRequested` as revoked permission. `ReportVehiclesRetired()` is appropriate only after both exact disposable lifetimes have positively retired. It is a probe report; the monitor does not independently inspect vehicle entities. No operation in this protocol establishes a previous effective-profile getter or restores a prior custom override.

## Stop and exit procedure

The proposed candidate settings are a **300-second absolute game-process lifetime**, a **60-second exit lead** and a **60-second maximum normal-exit response**, with the private probe's separate **180-second active cap**. These values are design settings, not an approved live manifest. The monitor's planned stop is at process age 240 seconds. Earlier probe failure, lost heartbeat, explicit stop or completed disposable-vehicle retirement requests an earlier stop. The exit deadline is always the earlier of stop-plus-60-seconds and process-age-300-seconds. Neither acknowledgment nor reload moves it.

Proposed heartbeat expiry is 1 second, initial probe-start allowance 120 seconds from process creation, and user notification acknowledgment allowance 5 seconds. Acknowledgments received before a stop condition are ignored; an early console command cannot suppress the later notice deadline. A separate probe stop-acknowledgment is tracked; lack of that acknowledgment after the heartbeat expiry is an escalation. These settings must be sealed with the eventual justified candidate and the actual restoration checks, after the other admission prerequisites are met.

At a stop condition the monitor **sets the probe stop event first**. Its control loop polls at 20 ms and never waits on console output, a UI operation or disk writes. The visible notice has its own UI thread. Console output uses a bounded latest-message worker; blocked or full redirected stdout cannot hold up revocation. Commands use a 64-entry mailbox, with an urgent-stop slot and at most eight normal commands handled per poll. Journal and status writes use a separate bounded worker; an unavailable evidence writer revokes experiment permission. These are implementation bounds, not a real-time Windows scheduling guarantee.

For a future admitted attempt:

1. I must be present and ready to use GTA's normal quit flow. The independent notice must be visible and usable before any manual private-profile activation. A process-specific monitor must attach within ten seconds of process creation; a missing or late monitor means no activation.
2. The monitor's stop notice means immediately stop experimental actions. The probe disarms, reports stop acknowledgment and attempts only supported normal retirement of the disposable vehicles. I begin normal game exit immediately; I do not wait for Codex's next reply or more measurements.
3. The notice button **“I am exiting normally”**, or console command `normal-exit-requested`, records my response. It does not close GTA and is not proof of exit.
4. If normal quit becomes unresponsive, I use **“Normal quit is unresponsive”** or `quit-unresponsive`. The monitor keeps the stop event asserted, reports escalation and continues to observe the exact process. It does not force termination. Any force-termination action requires separate specific authorization; none is provided here.
5. Failure to observe process exit by the fixed deadline latches a compliance failure. No further experiment phase is permitted. Monitoring may continue to disclose the still-running process and pending cleanup, but that continuation is not qualification evidence.
6. Only after process absence may the existing reversible installation procedure restore files. **“Verify installation restoration”** or `verify-restoration` makes the monitor read and independently check the exact configured baseline hashes/lengths and required absences. It performs no restoration itself. Incorrect bytes, remaining temporary files, linked paths or a still-running process cannot pass this check.

The monitor cannot guarantee that I will act on a notice or that GTA will complete normal quit. The enforceable automatic boundary is revocation of further probe actions plus independent deadline/escalation evidence. A hung game remains a failed or pending exit condition, not a successfully bounded attempt. This distinction avoids repeating Stage 2B's mistake of treating emitted stop text as an enforced normal exit.

## Separate evidence states

| State | Meaning and limit |
| --- | --- |
| `probeStopAcknowledged` | Probe reports that it has disarmed; not vehicle retirement |
| `vehiclesRetiredReported` | Probe reports retirement of both exact test lifetimes; not process exit or profile restoration |
| `processExited` | Retained process handle observed exited; first absence is a conservative timing upper bound |
| `resourceUnload` | Records process-ended status without claiming a separate successful live resource-unload operation |
| `installationRestored` | Every listed file hash/length or absence independently verified after process exit |
| `priorEffectiveProfileRestored` | Always `NOT_CLAIMED` |
| `exitDeadlineViolated` | Latched failure; later cleanup cannot clear it |
| `performance10ms` | Always `FAILED_UNCHANGED` |

A timely process exit remains timely while disk restoration is pending; restoration time is not misclassified as continued game execution. Conversely, vehicle-retirement reports and user exit acknowledgments cannot make a still-running process count as exited.

Evidence includes the input configuration copy/hash, monitor binary hash, bound target identity, one-time clock mapping, a sequenced SHA-256 hash-chain journal, latest status and final result. The chain detects later byte changes and ordering faults; it is not a cryptographic claim about a hostile machine or independent certification of the probe's reports. Pending evidence writes or writer failure are retained as incomplete evidence rather than silently reported as complete.

## Offline build and fixture result

The definitive run is:

```text
C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\gate-a-shvdne-private-01\supervision\build-0a81881b4f4248be854e190d5270b001
```

`qualification.json` records **109 passed assertions**. This includes individual journal-integrity assertions; it is not a claim of 109 independent game scenarios. The suite used authored policy inputs and five real disposable-process scenarios: normal completion, explicit probe failure, hung normal exit, incorrect creation identity, and independent monitor loss. No GTA, game native, RichAudio audio host or audio endpoint ran. Independent source review caught the early-acknowledgment issue; the final build ignores it and adds a targeted regression.

The tests exercised fixed deadline revocation and explicit failure revocation within the fixture's 250 ms observation bound, one-shot activation across disposal/reconnection, different-process rejection, absent/stale heartbeat, negative/late/ambiguous clock mapping, a blocked console writer, bounded command flooding, retained deadline failure, separate cleanup states, incorrect restoration rejection, late restoration after timely process exit, and journal hash chains. The hung target stayed alive until the harness supplied its ordinary exit command. The monitor-loss scenario deliberately ended only the authored fixture monitor, then confirmed that the probe client failed closed while the disposable target stayed alive.

The retained build compiled with warnings as errors using the installed .NET Framework x64 compiler. It references framework assemblies only, with no GTA/SHVDNE/RPH runtime dependency. The probe client source is separately compiled into the experimental SHVDNE probe by its builder.

| Artifact | SHA-256 |
| --- | --- |
| `RichAudio.Private01.Supervisor.exe` | `2fda83de4372d3eae8a33ac151167c5d046da5a714283a2f34ff86840d5175ca` |
| `SupervisorProtocol.cs` | `d0f110d20f1444f08d114cb74c6c0c547c6dace9da8222d1dace3b4e37bc7ebb` |
| `SupervisorPolicy.cs` | `59c1b8b805971e7d83a3be57b578ef7ae57fae9cf7e7ed20f8f230570669718e` |
| `SupervisorMonitor.cs` | `29600e3c1068b108ff770157d6c660e252f9b6f98674c2a088713c7fac0c299b` |

Earlier compilations and fixture results remain in their original sibling directories. `build-receipt.json` pins the definitive source and binary; `fixture.log` and each scenario's configuration, journal, status and output disclose the tests. The deliberately interrupted monitor-loss scenario has no successful final monitor result, as expected.

The visible Windows notification route was compiled, while these automated fixtures used redirected input/output and `ShowUi=false`. Human notice visibility over full-screen GTA, actual user response latency, live probe stop acknowledgment and actual disposable-vehicle retirement remain unqualified. The eventual candidate mode requires `ShowUi=true`; a notice that is not visible/usable must prevent manual activation. This report supplies no live installation package or authorization wording. Registration and marker-identification admission must be resolved separately before any such package is justified.
