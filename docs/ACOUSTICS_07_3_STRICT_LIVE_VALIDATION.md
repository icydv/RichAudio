# ACOUSTICS-07.3 — Strict live transport and startup validation

## Outcome: first-frame freshness rejection; fail-closed shutdown observed

I've now executed one strict live session on Enhanced 1.0.1158.16 using the reviewed PR #52 implementation. The receiver accepted one connection, then rejected its first observation at **freshness / invalid-age**, with `InvalidDataException` and `HadAcceptedFrame=false`. The host muted/stopped automatically; the bridge stopped with another Start disabled. Neither end reconnected. No beacon emission was enabled and all submitted PCM was silent.

This **fails clean strict-session acceptance**. It establishes terminal failure handling, not successful telemetry, audible startup, camera response or acknowledged deliberate Stop. My original installation has been restored and independently verified. No implementation was changed to force a pass.

## Two separately authorised attempts

My first attempt ended at launcher dispatch. One computer-use launch request returned **"launched app did not expose a targetable window"**. Follow-up inspection found no remaining GTA/RPH process or window and no runtime log. I did not retry under that approval. No bridge or live audio host started, and restoration passed. Whether RPH briefly started and exited is unknown. That stopped attempt remains recorded in the parent result commit and the `previousSeparatelyAuthorisedAttempt` evidence object.

I subsequently requested **one additional attempt with computer control**. I used a fresh sealed manifest, approval receipt, deployment journal and private output directory, preserving the first attempt. RPH was launched visibly through File Explorer, its settings confirmed no startup plugins, and Save and launch was submitted once. Story Mode loaded; I loaded the bridge once, confirmed READY / sending OFF, then started one initially muted host and issued one bridge Start. This was a new authorisation, not automatic recovery from the first attempt. No third attempt was performed.

| Event | First attempt | Additional attempt |
| --- | --- | --- |
| RPH launch requests | 1 | 1 |
| RPH process observed | No remaining process | Yes |
| GTA launches observed | 0 | 1 |
| Bridge loads / activations | 0 / 0 | 1 / 1 |
| Live audio host sessions | 0 | 1 |
| Publisher connection attempts | 0 | 1 |
| Accepted receiver connections | 0 | 1 |
| Automatic reconnects / replacement hosts | 0 / 0 | 0 / 0 |

## Reviewed candidate and configuration

Runtime source is unchanged from `e08ad31d1822b052af169741476d94301b062e21`, the verified open PR #52 head. This result branch is stacked on it. No source, tools or tests changed. The source CI run [40702624532](https://github.com/icydv/RichAudio/actions/runs/40702624532) passed using generated merge `32c84783b2c0612470c83d5c1caaba551ed174eb`; its tree matches candidate tree `998d233acefa5d099dc5370e3142b9062d85d0d9`.

| Component | Verified value |
| --- | --- |
| Enhanced executable version | 1.0.1158.16 |
| RPH runtime version | 1.132.1428.17748 |
| Authentic pinned SDK version | 1.124.1393.17586 |
| SDK SHA-256 | `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0` |
| Host SHA-256 | `42D95BB0433E280A196CBEC602C325F67C6DE605D5F0B4CB44874810FB6EFC43` |
| Bridge SHA-256 | `ABE867C26A715A344A9192779BB3A9CE09959F4EA9019410E62A966C1C4C07DF` |
| First sealed 26-file manifest SHA-256 | `A125096B0C4D71F0F45811AFA400937745AA25B183A927BCFF3A039DE018E76E` |
| Additional attempt manifest SHA-256 | `72BD7127A96DF73A96EFE1EC9D7484DEFE2576CFCE904E6C9E961AEEFEC86D73` |

The SDK pin is compile-time provenance, distinct from the runtime version. Both builds used the selected validation worktree. The host launched that worktree's producer in normal wall-clock mode with required listener input.

Configuration: one original harmonic beacon in the synthetic open-road metric scene, 48 kHz stereo Float32, strict listener pipe, **100 ms spatial and orientation buffers**, 50 ms prediction, 250 ms freshness, 120-second cap. **Experimental orientation was OFF.** My request for a louder harmonic set the fixed host gain to **0.12**, approximately +3.52 dB relative to 0.08, before execution. It was initially muted, without autostart, control exercise, loopback, microphone capture, headless clock or test barriers. The host's Start control was never issued because the transport had already failed.

## Preflight and actual failure evidence

Focused checks passed **645 host assertions** and **63 transport cases**; the pinned-SDK bridge compiled. Synthetic pipe tests used isolated identities. The format-only preflight probe confirmed the previously used endpoint's 48 kHz stereo Float32 support without starting a stream. The additional live host did open that endpoint, but submitted only zero-valued PCM. No live pipe probe, second host or implementation change was used.

| Measurement | Additional attempt result |
| --- | --- |
| Accepted listener observations | 0 |
| Receiver rejected counter | 1 |
| Receiver failure | `freshness / invalid-age / InvalidDataException` |
| Receiver connection / prior accepted frame | 1 / false |
| Receiver terminal / another attempt | true / false |
| Bridge observations / missed / acknowledged frames | 9 / 0 / 0 |
| Bridge retained terminal | `callback / operation-failed / failed` |
| Bridge requested flag after failure | false |
| Host wall duration | 15.151519 s |
| PCM blocks received / rejected | 1,410 / 0 |
| Renderer control updates | 1,410, without a valid listener or active path |
| Startup status / ready frame | idle / none |
| Audio underflow frames / device error | 0 / none |
| Submitted peak / RMS | 0 / 0 |
| Host muted / stopped; producer exit code | true / true; 0 |

The server's age inequality is `-2 <= ageMs <= 250`, evaluated after decoding against the local monotonic clock. This failure attribution establishes that the first observation failed that inequality. The retained diagnostic does **not** contain its actual age, so I cannot tell whether it was stale or future-dated, or attribute it to serialization, scheduling, queueing or clocks. Its 15,086.4564 ms elapsed field includes server connection waiting; it is **not the rejected observation's age**. The server records a terminal exception count, not proof that the JSON or framing was malformed.

The publisher's callback failure is consistent with failure to receive the expected frame acknowledgement after the receiver rejected the observation. Its status does not independently preserve the receiver's freshness reason. I have not equated this rejection with PR #49's unidentified historical error.

## Startup, listening and shutdown boundaries

No owned sound played. Startup priming, louder-level acceptability, camera-responsive stereo, gaps, clicks, lag and audible Stop tails were not evaluated. I did not ask for listening acceptance of a beacon that never emitted. Zero underflows during silent submission do not prove reliable audible playback. A normal producer exit does not override the failed host transport result.

The host terminal callback muted/stopped output at the first rejection and exited well before its cap. The bridge retained `requested=False`, one attempt, zero acknowledgements and another Start disabled. I read its retained status, unloaded it and exited GTA through its normal quit confirmation. Host and selected producer termination were independently checked. No process was killed.

The planned 45–60 second deliberate bridge Stop was inapplicable after terminal failure. **Acknowledged deliberate Stop was not exercised live.** Neither a camera sequence nor a clean-session PASS is claimed. Native audio setters, vehicle spawning, geometry acquisition and game configuration changes beyond the reviewed temporary launch procedure were not introduced.

## Independent restoration and preservation

I reversed the temporary executable-selection rename and preserved all 26 unchanged deployment additions outside the installation. Restoration's directory check correctly stopped when it found an additional `ExecuteCode` folder created during RPH startup. Its sole three-byte `Code1.cs` file was fingerprinted and preserved separately before the empty directory was removed. No code was executed from it. Known generated RPH/loader logs and configuration were also preserved. The initial restoration exception was not ignored.

Independent final checks verified:

- **32 original non-archive root-file hashes** matched.
- Both original executable signatures remained **Valid**.
- **Five original top-level directories** matched exactly.
- All **26 temporary paths** and the executable alias were absent.
- **179 archive lengths and UTC timestamps** matched exactly.
- **Ten existing sampled archive SHA-256s** matched.
- GTA, RPH, host and the selected Node producer were absent.

Both attempts have separate restoration receipts. This PASS covers the specified root, metadata and sampled-hash baseline, not a full content hash of every archive. No unrelated application was terminated or modified. Previous acoustic demonstrations, private source material and Bati research were untouched. Original renderer defaults and historical reports remain intact.

## Publication and historical conclusions

Public evidence is `evidence/acoustics07-3-strict-live-result.json`: sanitised scalars and both attempt outcomes. Private manifests, approvals, logs, coordinates, endpoint identity, binaries, backups and diagnostics remain ignored. Publication screening and Git integrity checks apply to this documentation-only result. The draft PR records the final remote head and actual hosted CI checkout/tree relationship. No licence or PR merge was added.

PR #49's qualified audible result remains valid historical evidence; its first rejection's exact cause remains unknown. PR #50's strict mechanism has now been exercised live and failed closed, but **clean strict-session validation remains incomplete**. PR #51's startup correction and PR #52's experimental orientation remain offline findings, without new perceptual acceptance from this run.

## Next engineering action

My next action should be one **offline cold-start freshness investigation** that measures observation, publication, encoding, receipt, decoding and validation timing using isolated synthetic transport instances. It should distinguish stale from future-dated first observations without relaxing the existing age bounds. This result does not authorise another launch or perform that implementation investigation.

The combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**.
