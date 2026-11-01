# PLAYABLE-13 Phase B: startup passed; handoff blocked; restoration passed

On 1 November 2026, the separately authorised passive test deployed the exact approved artifacts once and invoked the existing Enhanced/RPH route once. **Startup PASS. Passive handoff BLOCKED at `measured-clock-map-required`. Restoration PASS.** No retry, second launch, substituted artifact, RichAudio playback or recording occurred. Phase C is not yet eligible.

| Exact deployed artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Passive `Plugins/RichAudio.dll` | 343,040 | `720812a0ff9af2890bcc05da998bca17c6db0746145bd76601480e899f07f8e9` |
| Native SHV producer | 129,024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |

The authorisation named commit `c5635f470c01f446e80bbbaf5a0f28acff06a827` and [its frozen procedure](PLAYABLE_13_LIVE_PROPOSAL.md). Independent preflight passed 207 file checks, including exact artifacts/source pins, all 11 protected files/four settings, stock fallback, disabled flags, absent processes and absent owned paths. Deployment used flushed pending files, exact creation receipts and an ownership-verified original plugin backup.

## What actually ran

Steam Action 11 recorded argument confirmation waiting at 17:31:38 UTC and continuation at 17:31:57. It recorded interstitial waiting/continuation at 17:31:59, process creation at 17:31:59 and completion at 17:32:00. The coordinator dispatched one Continue click. The second modal was not separately seen or clicked; its continuation is established by the retained Steam trace, with the mechanism unobserved.

Enhanced PID 31968 began at 17:32:15.755042 UTC, 46.253 seconds after the launch marker. The startup observer saw the exact process about 358 ms later. The fresh 21-field lease matched its kernel creation time, session and exact caller/producer. RPH entered the passive profile at 17:33:03.074 and reached READY at 17:33:05.662. The previous pre-process Steam boundary was passed in this attempt; this does not establish why PLAYABLE-12 failed.

The owner prepared and mounted the Bati using the existing menu and explicitly confirmed readiness. An earlier general console `SpawnVehicle bati` command was unavailable and spawned nothing. One `RichAudioHandoffStart` command was issued. At 17:35:11.644, the plugin stopped with `measured-clock-map-required`; at 17:35:12.160, its retirement message reported accepted observations **0**, gameplay frames **0**, and no active session. The independent observer saw this terminal about 222.25 seconds after launch, within its conservative 300-second waiting cap.

The journal contains successful functional API-shape admission, source-session opening and 2,233 clock-map events among 2,237 events. The final map was still within its five-second lifetime near failure. The rejection is in the combined clock/map guard for the initial binding interval, before the binding event and native BEGIN. It is inaccurate to describe this as never obtaining any measured map or ordinary five-second map expiry.

The event order and remaining map lifetime support rejection by the interval-mapping arm of that guard. The failed waiting-context timestamps were not journalled: the binding event is written only after successful admission. The exact rejected endpoints and internal mapping check are therefore unavailable. A stale waiting callback context outside the mapping window while the direct clock export continues is a narrow hypothesis, not a measured context age or confirmed console-scheduling cause. The next offline step is to reproduce paused/stale waiting context with an advancing clock export and capture the failed binding operands. If confirmed, evaluate yielding and reacquiring fresh waiting context plus independent RPH brackets after the operator arm. Preserve the 250 ms freshness/50 ms skew limits and original timestamps; do not widen the window or fabricate freshness. No production fix or new artifact was made during this live result.

## Evidence boundaries and retirement

`source-records.bin` is empty. Native target-attempt counters remain **unobserved**, not measured zero. Native BEGIN was not reached, and the active ride, changing engine-state qualification, independent correspondence acceptance, gameplay-frame/camera lineage and dismount challenge were not completed. The numeric zeroes above are the managed accepted/frame counters reported by the actual retirement log.

The source was marked retired and consumer state cleared. The private summary reports `producerCompleted=false`, `nativeFifoDrained=false` and native/audit outcome unobserved. No successful callback completion or FIFO-drain claim follows. The caller's actual retirement log separately reports writer completion within the bound and no live writer worker; this establishes writer join only. The journal retained 774,053 bytes, no dropped events and queue high-water one. No missing engine capture was analysed as if it contained valid telemetry.

No RichAudio host, WASAPI output, loopback, recording or modification-aware loudness was activated. Stock GTA audio remained active. This attempt provides no audible or subjective listening evidence. The existing offline audible/recording candidate remains preserved, but this failed passive test does not qualify it for Phase C.

## Exit and verified rollback

After terminal rejection, normal UI exit was requested through Alt+F4. The exact game lifetime, RPH and relevant owned processes/windows were then observed absent; no force termination was used. No quit-confirmation dialog or numeric process exit code was captured, so those are not claimed.

Ownership/hash/length-verified rollback removed only the owned lease, unchanged producer and passive candidate plugin, and restored the exact 222,208-byte original plugin, SHA-256 `611347ab5828bedf0bd71102e4df125ed13666f6a7e7e3eccbc761a76a7fb657`. All 11 protected files and four settings match. Saved `stock-fallback`, both false production feature flags and absent owned paths/processes were independently verified. All 23 reviewed owned/pending/backup/pointer paths are absent. The supervisor completed without an observer failure; private logs, journal and receipts remain retained.

The one-attempt approval is consumed. Any later passive launch requires a reviewed correction/candidate and fresh explicit approval. Audible playback and recording still require separate approval after genuine passive acceptance. PR #76 remains draft and unmerged.

[Sanitised live evidence](../evidence/playable-13-live-01.json) · [Verified restoration and review](../evidence/playable-13-live-rollback.json) · [Preserved offline preparation](PLAYABLE_13.md).
