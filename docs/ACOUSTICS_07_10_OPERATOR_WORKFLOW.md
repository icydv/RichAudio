# ACOUSTICS-07.10 — Offline operator workflow

## Outcome and boundary

I've replaced model-paced host commands with an executable deadline policy and a separate process that owns asynchronous stdout/stderr, persistent stdin and the monotonic launch clock. Device-free child-process tests exercise that same supervisor. A stalled coordinating process cannot postpone its deadlines in the tested case.

This is an **offline tooling result, not a live-ready deployment**. The fixture entry point cannot select a host executable or launch GTA. Reusing the supervisor with the sealed host requires a separately reviewed launch adapter, artifact bindings and owned producer cleanup. No new approval, deployment journal or launch token was created. No audio endpoint was opened, probed or captured; nothing was played.

## Evidenced failure

Base: PR #61, `a1abb28f4f5ae1a8ca86e24a987f492dbe261a2e` (the authoritative full SHA is recorded in the evidence JSON). Runtime remains `b5143db8c99decef49a8c9fdf1473f0c3db4840f`.

| Observation | Existing measured time |
| --- | --- |
| Visible startup | 0.101 wrapper seconds |
| First status request / response | 17.714 / 17.715 seconds |
| Receiver connection | 26.2373208 receiver seconds |
| Valid renderer status request / response | 33.914 / 33.915 wrapper seconds |
| Later status request / response | 79.603 / 79.603 seconds |
| Emission Start | Never sent |
| Receiver deliberate Stop | 107.8428343 receiver seconds |
| Wrapper observed Stop | 107.951 seconds |
| Wrapper exit | 107.9967576 seconds |

The retained sender status showed 705 acknowledgements; final sender and receiver counts were 1,626. Final host/producer exits were zero. These clocks have different origins. Screenshot staleness and a pending console command were observed, but the evidence does not apportion delay among model turns, UI focus, capture or input delivery. The old attempt remains incomplete listening with failed Stop timing.

## Implemented control

`tools/operator/policy.mjs` owns exactly-once Start and terminal decisions. `tools/operator/supervisor.mjs` spawns and retains the child process handle, uses asynchronous redirected streams and writes existing host commands. `tools/Run-OperatorFixture.mjs` runs that supervisor as a separate process, accepting only a closed list of disposable fixture modes. The coordinating test process can stall without stopping the supervisor. No game or audio-device interface is in this tooling.

The clock starts immediately before spawn, not on readiness or connection. The supervisor polls `status` every 250 ms in the real budget. It retains at most 256 policy records; output parsing has a 16 KiB buffered-line and 1 MiB total stdout budget. Public records contain enumerated codes and elapsed times, never raw stdout, endpoint names, coordinates or identities. Unexpected stderr, malformed JSON and transport terminal failures abort. stdout is drained asynchronously, never through a blocking synchronous read.

Readiness requires the actual startup suffix confirming the 120-second cap and master 0.2, plus exported 600 Hz / 0.44 / trim 24 / ceiling 0.5 / no rejected trim blocks, emission disabled, zero pre-Start peak, nonzero paths, native-orientation-only mode, exact/interpolated/predicted playout, 100 ms spatial delay, finite observation age at most 250 ms, and no limiting. Two strictly advancing valid frame statuses must arrive within one second. Repeating cached Node status does not refresh progress. Invalid running status or more than one second without valid frame progress aborts.

The one-second operator status-progress bound is not a replacement or extension of receiver freshness: the unchanged runtime independently enforces freshness and prediction. Status cannot prove current transport acknowledgements or all invocation options. Scene, source count, orientation OFF, both buffers and remaining fixed options must also be bound by the future reviewed launch adapter. They are not invented exported status fields.

An arm and separate confirmation of sender frame acknowledgements are required before automatic gated Start. In the fixture these are explicitly synthetic IPC events. They have no live approval meaning. Terminal state rejects further arming/Start. Only a bounded sender-Stop confirmation may supplement a completed receiver Stop; it cannot restart anything.

## Absolute schedule and normal Stop route

| Cutoff from spawn | Enforced action |
| --- | --- |
| 25 s | If Start has not legally occurred, remain off and abort; readiness exactly at the cutoff is too late |
| 45 s | Emit one local operator bridge-Stop-required event |
| 60 s | Without receiver deliberate Stop, abort with mute + stop through existing host stdin |
| Within 3 s of abort or completed receiver Stop | If the owned direct child has not exited, terminate that retained child handle |
| 65 s | Independent absolute direct-child termination backstop |
| 70 s | Report cleanup unverified if direct-child exit is still unconfirmed |

The normal route is **prebriefed human-assisted RPH console delivery**: load/activate once under a future approval; inspect sender acknowledged-frame status; deliver `RichAudioBeaconStop` at the local 45-second cue; preserve the sender's acknowledged-Stop evidence. The host text independently reports receiver `connection/sender-stop/deliberate-stop`, connection 1, terminal true, AnotherAttempt false. EOF, host Stop, process disposal or a kill never count as that result. The fixture reports normal success only with both receiver terminal evidence and a separate sender confirmation.

There is no supported external RPH command API in this implementation. We cannot guarantee human delivery or console focus. Preparation, briefing and command selection must precede the clock; listening feedback follows shutdown. The supervisor does not wait for chat. The old 33.915-second readiness would now fail the 25-second gate rather than consuming 108 seconds.

The direct-child fallback is intentionally restricted to the retained spawn handle. It never searches all Node processes or targets GTA/RPH. **It does not prove containment or termination of a real host's separate Node producer.** That is a concrete remaining live-readiness blocker: the future adapter must bind and independently verify owned producer cleanup (or a reviewed process containment mechanism), disclose any force termination, and never borrow the consumed approval. The 70-second failure result is not a false assertion of complete cleanup. Normal OS scheduling is assumed; this is not a hard-real-time guarantee under machine suspension.

## Bounded test matrix and results

Ten focused tests cover fixed-profile rejection, exact cutoff races, missing sender evidence, exactly-once Start, cached status, progress expiry, malformed status, immutable terminal state and six real child-process runs. Synthetic terminal lines model the existing schema; they do not prove delivery to RPH or replace the existing genuine pipe/acknowledgement regressions.

For fast wall-clock tests only, the fixture budget is readiness 600 ms, Stop cue 700 ms, ACK 1,100 ms, absolute kill 1,400 ms and reporting limit 2,000 ms. Its graceful exit allowance is 300 ms. These scale **operator** timing, not any production transport deadline. The same policy is also tested at the actual 25/45/60-second boundaries with explicit times.

| Fixture | Observed direct-child exit ms | Result |
| --- | ---: | --- |
| Normal | 890.730 | One Start; modelled receiver Stop and separate synthetic sender confirmation |
| Cached frame | 611.890 | No Start; early abort |
| Missing readiness | 612.514 | No Start; early abort |
| Malformed status | 48.536 | No Start; immediate abort |
| Missing Stop ACK / unavailable delivery | 1,115.579 | Aborted, never labelled normal Stop |
| Blocked child and coordinator | 922.996 | Owned disposable child killed and exit verified while coordinator blocked for 1,600 ms; late arm rejected |

A fault-case test PASS means the abort was correct. It is not listening success. GUI focus is represented only by unavailable Stop delivery; no actual Windows/GTA focus claim is made. The measured timing includes OS/process overhead and is not an audio mute-latency measurement.

Reproduce without any device or game dependency:

```powershell
node --test tests/Test-OperatorDeadlines.mjs
node tools/Run-OperatorFixture.mjs normal
node tools/Run-OperatorFixture.mjs blocked
pwsh -NoProfile -File tools/Test-Offline.ps1
```

The initial full regression invocation under Windows PowerShell 5 stopped at an existing expected-negative tracer stderr test. It did not fail an operator assertion. The registered suite was then invoked using PowerShell 7, matching hosted CI. Final results and checkout verification are recorded in the PR.

## Preservation and review

All 95 inventoried old-package/binary files retained identical SHA-256 values. Host `847D5B59464A75DF67D9D2B51E5E444F1DF9D1D934C1CE8AD6F1F6ED20C5BAB7` and bridge `96EE4100BA2C2CCB2AB75A0664A3047A3BC293D5A8F43A3D37F21D09247EAFAD` match PR #61. Protected `src` has no diff from the preserved runtime. The old sealed helpers and consumed approval are untouched. Regression builds occur only in this new worktree, never over sealed binaries. New operator helper fingerprints are in the scalar evidence JSON and require fresh review; they are not covered by the old seal.

The 600 Hz / 0.44 / +24 dB / master 0.20 profile, 0.5 pre-master rejection ceiling, defaults, strict transport, buffers, freshness, prediction, acoustic processing and runtime caps are unchanged. The combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**.

## Next copy-ready prompt

> Review the ACOUSTICS-07.10 operator tooling offline. Prepare a concrete sealed launch adapter around the tested independent supervisor, bind the unchanged runtime/profile and define independently verifiable cleanup for the owned host and its producer. Retain the prebriefed human RPH Start/Stop route and the 25/45/60/70-second operator budget. Verify sender acknowledgement evidence and visible local Stop cues without relying on chat during the timed session. Do not launch GTA/RPH, deploy, open audio endpoints, play/capture audio or create a live approval. Present the completed candidate and remaining limitations for separate review before any live authorisation.
