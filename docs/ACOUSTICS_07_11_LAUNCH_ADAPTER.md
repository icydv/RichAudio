# ACOUSTICS-07.11 — Launch adapter and supervised cleanup

Offline candidate for separate review, **not live authorisation**. Base is draft #62 at `62cf9eb029b2cad77a45b90fe62bdc891e1d0a46`; runtime remains `b5143db8c99decef49a8c9fdf1473f0c3db4840f`. No game/RPH/real audio host launch, deployment, endpoint access, playback, capture, approval or launch token occurred. ACOUSTICS-07.9 remains incomplete with failed Stop timing. ACOUSTICS-05 + BENCHMARK-01 remains **60%**.

## Corrected progress policy

A deterministic replay of the real 94-block × 512-frame / 48 kHz cadence, cached status, 250 ms polls at phase 10 ms and 10 ms ticks reproduces Start at **2010 ms** and the old `status-progress-expired` abort at **4020 ms**. The new operator allowance is `ceil((1002.667 + 250 + 250) / 10) * 10 = 1510 ms`: one producer period, one polling interval and an explicitly assumed 250 ms scheduling margin. This bounded allowance tolerates normal cached replies, every 10 ms polling phase and alternating jitter up to 200 ms. A frozen frame expires; duplicate replies never renew progress. It is not a hard-real-time guarantee under suspension or excessive scheduling delay.

This setting is separate from transport acceptance. No production cadence, source, transport freshness, prediction, connection/write/ACK deadline, acoustic processing or runtime cap changed.

## Concrete adapter and gate

`tools/Run-LaunchAdapter.mjs preflight <private-candidate.json>` only reads/hashes files. `fixture <normal|orphan|producer-stuck|unresponsive>` explicitly substitutes disposable device-free children. There is no fallback to the real executable. Build only the new broker with `pwsh -NoProfile -File tools/operator/Build-Owner.ps1`; never rebuild an old sealed host.

The private candidate binds the exact original executable and bridge, unchanged deployment manifest and all 26 proposed additions, production JavaScript/runtime sources, Node executable, working directory, complete argument vector, clean child environment, fresh private output and all new helpers. The fixed invocation comes from the actual sealed private review; defaults are checked in the bound producer source rather than invented status fields. The sole intentional invocation change is a fresh private output directory.

Profile: open-road; one harmonic source; 600 Hz; source 0.44; explicit +24 dB trim; master 0.20 with existing 0.25 limit; 0.5 pre-master rejection ceiling; initially muted/emission off; required listener; both 100 ms buffers; orientation experiment OFF; Windows default output; 120 s cap; no autostart, capture or control exercise.

The future `live <candidate> <fresh-approval>` entry verifies an unexpired, one-attempt human approval bound to both the candidate SHA-256 and old manifest SHA-256, in the **new package only**, before exclusive one-use launch/host-start markers. No such approval or markers are generated in this preparation. Old approvals remain consumed. The private review provides exact absolute commands. Missing approval is a mandatory future gate, not permission supplied by this report.

Node resolution is pinned by hash and an isolated PATH; NODE_OPTIONS/NODE_PATH are empty. Preflight rejects shadow node.exe files in the known application/current/Windows system search locations. This is an integrity check against accidental drift, not protection against a privileged concurrent filesystem attacker.

## Ownership, deadlines and failures

The native `OwnedTree.cs` broker creates a randomly named Job Object with KILL_ON_JOB_CLOSE, creates the supervisor **suspended**, assigns it to the job and only then resumes it. The worker checks membership in that exact randomly named job through a bounded native query and rejects direct invocation. The host and its separate producer inherit containment before they can run; breakaway is not enabled and the job handle is not inherited. Assignment failure terminates the still-suspended child. The broker never enumerates or kills processes by name/PID, and the adapter never selects GTA/RPH as a child.

The supervisor's monotonic origin is immediately before its host spawn, never readiness/connection. One conditional Start must occur strictly before 25 s; the human Stop cue is at 45 s; absent receiver deliberate Stop aborts at 60 s. Abort writes existing host mute/stop (not normal bridge Stop), then allows at most 3 s before direct-host termination. The independent broker has a 65 s whole-job termination backstop and a 70 s verification bound. Its clock starts slightly earlier, when the contained supervisor is resumed, making those backstops conservative relative to host launch. It also terminates remaining descendants within 3 s of supervisor exit.

A kill request or host exit is not cleanup evidence: the host process exit event and independently queried job accounting must both support exit. The broker retains its job handle until querying **zero active job members**, recording total/peak membership. Detached disposable producers demonstrate that this is not just direct-child cleanup. TerminateJobObject is the disclosed forced fallback for this owned job only. Forced cleanup remains an abort outcome even if exit is verified. Failure to observe zero by the bound reports cleanup unverified. If the broker itself dies, kill-on-close contains its descendants but the missing independent report means cleanup remains unverified. Do not claim otherwise.

UI, chat, evidence-file I/O and listening feedback run outside the deadline worker. Broker reporting occurs after cleanup verification. A blocked UI can miss a visible cue; it cannot postpone broker cleanup. Catastrophic OS stalls/suspension are outside the timing guarantee.

## Stop evidence and executable human sequence

See [the operator card](ACOUSTICS_07_11_OPERATOR_CARD.md). No remote RPH command API exists. Only the human's `RichAudioBeaconStop`, receiver deliberate-stop terminal and separate sender acknowledgement evidence can establish normal Stop. Host stdin Stop, EOF, disposal and termination remain abort paths.

`StopEvidence` accepts sender-first or receiver-first evidence and offline reconciliation after host exit. It records receiver observation time, the receiver's original elapsed value (a different clock), sender observation/occurrence upper bound and later confirmation separately. An on-time local observation gives an upper bound on occurrence; a late confirmation alone provides no historical timing. Historical timestamps require a retained evidence hash; the reconciliation CLI checks that file's hash. A reviewer must verify its host-clock mapping. Missing mapping stays unverified, and a late ACK cannot become on-time. Cleanup never waits for reconciliation. stdout is drained before classifying host closure to avoid the exit/terminal ordering race.

Results separate Start command issued, producer emission observed in status, nonzero submitted PCM (unverified unless supported by the retained host result) and user listening verdict (collected only after shutdown). A stdin write is not playback evidence.

## Validation and preservation

24 focused tests include the exact cadence regression, 75 phase/jitter combinations, freeze, timing/evidence order cases, six inherited real-child cases and six actual Job Object host/producer cases: cooperative shutdown, host abort with detached producer alive, stuck producer, unresponsive host/producer, coordinator disconnect and blocked coordinator. Scaled tests use 0.6/0.7/1.1/1.4/2 s cutoffs and 0.3 s cleanup grace; they prove path/ownership behavior, not actual GTA focus, console delivery or live timing. Full repository gates and final hosted checkout verification accompany the PR.

The new private review contains a separate helper seal, exact entry/invocation, original installation scope, restoration procedure and portable offline evidence. The old seal does not cover new helpers. The prior review package and consumed approvals are preserved byte-for-byte; protected runtime has no diff. No proprietary binaries, absolute personal paths or raw evidence are published.

Remaining live-only uncertainties: real console focus/delivery, actual Windows endpoint availability/format/mixer level, listener readiness before 25 s, live scheduling, genuine frame and Stop ACK timing, audible output/comfort/response, and final restoration of an approved future installation. These require separate review and explicit authorisation for one supervised attempt; this preparation grants none.
