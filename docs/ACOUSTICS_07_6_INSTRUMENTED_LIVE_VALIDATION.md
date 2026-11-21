# ACOUSTICS-07.6 — Instrumented strict live validation

## Outcome

I approved and executed **one** prepared Enhanced Story Mode session using PR #55's unchanged runtime source `7289af939cefdfd62627a1267524a4dce74d2c11`. The first observation was rejected at freshness validation with signed **DecisionAgeMs = 390.0582**, classified **too-old**. The receiver's unchanged permitted interval is **[-2, +250] ms**. Neither end reconnected. I did not enable beacon emission; all submitted owned PCM was zero.

This is an executed failed clean-session validation, with successful fail-closed shutdown and independently verified restoration. It is not an audible startup test or a successful deliberate Stop test. No implementation changes, replacement host, plugin reload, alternative launch or second Start occurred.

| Acceptance item | Result | Evidence boundary |
| --- | --- | --- |
| Strict transport and first-frame acceptance | FAIL | First observation rejected; zero acknowledgements |
| Renderer handoff and startup | NOT OBSERVED | Callback not reached; no listener forwarded |
| Audible continuity and camera response | NOT OBSERVED | Beacon emission never enabled |
| Acknowledged deliberate Stop | NOT OBSERVED | Terminal failure ended the session first |
| Bounded shutdown | PASS | Host/producer exited; bridge stopped and another Start disabled |
| Installation restoration | PASS | Independent baseline checks described below |

## Candidate, preparation and approval

My validation branch starts at the exact reviewed PR #55 head. Parent CI run [40726578252](https://github.com/icydv/RichAudio/actions/runs/40726578252) passed. Its actual generated-merge checkout `5a145774ecee3a1f7939ecb4188929843d44bcd4` has candidate tree `b38474d3cb43fdea76b731ac4b8fdbd64260b4f9`. Runtime source and subsequent result-documentation commit are distinct; this result changes no runtime code.

I built both artifacts in the new validation worktree. Focused local gates passed **648 host assertions** and **69 isolated transport cases**, and the authentic pinned-SDK bridge compiled. I reused the exact-source full offline/handoff CI evidence rather than repeating broad matrices. The prepared approval review included all 26 additions, the reversible executable-selection rename, current installation checks, fixed host invocation, operator commands and restoration scope. Only after my explicit **"I approve"** reply was a fresh manifest-bound approval receipt created. Previous approvals and launch tokens were not reused.

| Item | Verified value |
| --- | --- |
| Enhanced executable | 1.0.1158.16; original signatures valid |
| Local RPH runtime | 1.132.1428.17748; verified again in launcher |
| Compile-time SDK | 1.124.1393.17586 |
| SDK SHA-256 | `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0` |
| Host SHA-256 | `CE9C0004F2A48D9B170145563F0ADC7CBC4B814D66F87BFE00DA044018506856` |
| Bridge SHA-256 | `53777813B601ECE6DA5E4C1116F52817A253FFF96DBA51E6E654B1432406CE24` |
| Fresh sealed manifest SHA-256 | `433E5E466496A461EEDA8A311C3632591905DDA49E4F6BFFD4C917775B03CB66` |

The manifest and binaries remain private. The runtime dependencies were reverified against their previously inspected fingerprints; the bridge is the fresh build. No security settings, original archives, native audio or unrelated applications were altered.

## Fixed configuration and execution

The approved configuration was one original harmonic beacon in the existing **synthetic open-road metric scene**, host gain **0.12**, 48 kHz stereo Float32, initially muted with emission disabled. Both spatial and orientation policies remained **100 ms**; experimental orientation was **OFF**. Prediction remained 50 ms, receiver freshness remained -2 through +250 ms, and host/bridge caps remained 120 seconds. There was no autostart, control exercise, virtual clock, synthetic listener fallback, capture or deliberate fault injection.

The source still requires listener input. The final Node diagnostic's `synthetic-metric` idle label is not evidence that a synthetic listener fallback became audible: it accepted zero listener observations, created zero paths and emitted zero PCM.

One visible File Explorer activation launched RPH. Its settings showed the expected game/runtime versions, **Don't load any plugins on startup**, and an empty startup-script preview. Save and launch was submitted once. Story Mode loaded, the bridge was loaded once and READY / sending OFF was confirmed. One separate host session was then started, followed by one bridge Start within the server's first-connection window.

Console output was redirected for complete private retention. The initial file read did not expose the startup line; it became readable after termination. Therefore immediate console readiness was not positively observed at that operator boundary. The retained connection timing establishes retrospectively that the server was listening and accepted one connection. Neither a bridge acknowledgement nor a valid Node readiness status was obtained; the beacon remained disabled. This visibility limitation must not be presented as a completed readiness gate.

The opened default output was the previously used endpoint, and the actual host accepted its exact 48 kHz stereo Float32 path. Its identity remains private. No endpoint was opened/probed during preparation; only this approved live host session opened it.

| Count | Actual result |
| --- | --- |
| Launch attempts / observed GTA launches | 1 / 1 |
| Bridge loads / activations | 1 / 1 |
| Production host sessions | 1 |
| Publisher attempts / receiver connections | 1 / 1 |
| Bridge observations / missed | 9 / 0 |
| Bridge acknowledged sent | 0 |
| Receiver accepted / rejected | 0 / 1 |
| Host forwarded | 0 |
| Final Node listenerMessages / listenerRejected | 0 / 0 |
| Retries, reloads, replacement producers/hosts | 0 |

Node's zero rejected count means no envelope reached it, not that it accepted the rejected transport observation. The receiver's rejection counter is an exception-at-validation count, not proof of malformed JSON.

## Complete retained rejection attribution

The full diagnostic was preserved in both private host console output and host-result.json. Public evidence retains the safe scalar structure without payload, session identity, camera position or endpoint identity.

| Diagnostic | Actual value |
| --- | --- |
| Connection / first-frame sequence | 1 / 0 |
| Stage / code / exception | freshness / invalid-age / InvalidDataException |
| Outcome / Terminal / AnotherAttempt | failed / true / false |
| HadAcceptedFrame | false |
| FirstFrame.DecisionAgeMs | 390.0582 |
| FirstFrame.AgeClass | too-old |
| MinimumAgeMs / MaximumAgeMs | -2 / 250 |
| ClockFrequencyAgrees | true |
| ConnectionMs | 17782.1564 |
| HeaderMs | 363.844 |
| PayloadMs | 0.0328 |
| DecodeMs | 22.8697 |
| CallbackMs / AckMs | null / null |
| Sender copy/encoding/pre-write durations | unavailable from bridge export |
| OffendingFrame.FrameOrdinal | 1 |
| OffendingFrame.DecisionAgeMs / AgeClass | 390.0582 / too-old |
| Terminal elapsed | 18170.553 ms |

ConnectionMs and terminal elapsed include waiting for the client and are **not observation age**. HeaderMs measures the blocking first-header-read interval; it can include sender initialization, encoding, write readiness and scheduling. It is not an isolated encoding measurement. PayloadMs covers the short length/payload segment. DecodeMs covers the production decoding path before StateValidator's freshness decision.

This session proves that this particular observation was **too old**, not future-dated. It does not isolate what consumed that time. The approximately 364 ms header wait is useful evidence for the next bounded investigation; it does not establish a serializer defect or justify speculative warmup. The earlier ACOUSTICS-07.3 signed age is still unknown, and PR #49's original rejection remains independently unexplained.

The bridge retained `ready=True requested=False observations=9 missed=0 sent=0 attempts=1 terminal=callback/operation-failed/failed`. Its callback-stage summary is consistent with not receiving the expected frame acknowledgement after receiver rejection. Detailed sender first-frame timing is not exported by this bridge and is not invented here. The receiving host's age-accounting callback was never reached, so PR #55's downstream correction cannot directly explain this failure.

## PCM, listening and shutdown

The host ran for **18.241694 seconds**, then its terminal callback requested mute/stop. Its producer exited with code 0, while the host correctly reported failure. Final records show:

- 1,700 PCM blocks received, zero rejected blocks; 870,400 rendered frames.
- 1,700 idle renderer control updates, zero active paths and startup state **idle**, with no ready frame.
- 869,856 device-submitted frames; submitted peak and RMS both **zero**.
- Zero measured audio underflow frames and no device error, during silent submission only.
- Host outputMuted=true and hostStopped=true; no host emission Start command.

No owned beacon sound played, so listening feedback was not solicited and no subjective PASS is recorded. Camera responsiveness, startup continuity, stepping and physical Stop latency were not assessed. Silent zero-underflow counters do not establish audible playback reliability or headset latency.

The planned 45–60 second bridge Stop was not reached because terminal failure had already ended the session. I did not issue a host-first Stop or label local disposal as acknowledged deliberate Stop. I read retained bridge status, unloaded the bridge, requested normal GTA close and confirmed the game window/process disappeared. No game or unrelated process was killed. The private records preserve the host-launch timestamp and available RPH readiness, terminal, status and unload timestamps; exact sender activation timing beyond those records is unavailable.

## Independent restoration

The newly sealed procedure reversed the temporary GTA5.exe to _GTA5.exe selection rename and preserved the 26 introduced files and generated logs outside the installation. The recurring RPH-generated `ExecuteCode/Code1.cs` file was inspected (three bytes, no reparse point), fingerprinted and copied to private preservation storage; the copy was verified before removing the introduced original and empty directory. No unexpected file was discarded merely to force an inventory match.

Independent final checks verified:

- **32 original root-file SHA-256s**, excluding RPF archives, matched.
- Both original executable signatures were **Valid**.
- **Five original top-level directories** matched.
- All **26 introduced destination paths** and the temporary alias were absent.
- All **179 archive lengths and UTC timestamps** matched, with linked paths rejected.
- **Ten existing sampled archive SHA-256s** matched.
- GTA, RPH, host and the selected Node producer were absent.

This restoration PASS is for the stated root/signature/directory/metadata/sample-hash scope; not every archive was fully hashed. Original research, historical attempt records, private audio and Bati work were preserved.

## Publication and next decision

This is a result-only draft stacked on PR #55. Sanitised evidence is `evidence/acoustics07-6-instrumented-live.json`; full diagnostics, manifests, approval, backups, endpoint identity and logs remain ignored. No runtime, acoustic, transport or deployment implementation was modified to force a pass. Publication screening, Git integrity and final hosted CI checkout/tree verification are recorded with the result PR. No licence, merge or release was added.

The combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**. The next step should be a bounded **offline investigation of the first observation-to-header delay**, using existing publisher timings and a synthetic .NET Framework/AppDomain context where useful. It should also verify immediate console-readiness visibility without opening an endpoint. Preserve all age bounds/deadlines and keep any demonstrated correction separate from claims about the historical sessions. This result authorises no further live attempt.
