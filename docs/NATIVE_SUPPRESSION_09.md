# Wait for recorded coverage

The candidate-08 operator sampled too early. Codex traced the decision to `Operator08.py`, `watch_inner`: once `(now-origin_qpc)/freq >= 12`, it launched one immediate extraction of recording seconds 1 through 11. A failed extraction stopped startup. The elapsed recording clock was being used to schedule a supposedly complete prefix without checking which packets had reached disk.

The extractor correctly refused my original prefix. Its 2,609,152 bytes contained 418 audio frames through 8.917333 seconds and 269 video frames through 9.000 seconds, with last video PTS 8.967. The required frame at 10.9 was absent. The file's duration metadata was unset. My finalized recording later contained the fixed interval and passed the unchanged timeline policy. This proves an availability shortfall at inspection; it does not identify a specific encoder, muxer, buffer or filesystem component as its cause.

Codex preserved the original refusal, recording, diagnosis and candidate scope. The startup focus check and NativeMemory initialization succeeded; the probe remained Dormant/unspawned, with no Begin, disposable vehicles or audio assignments. There is still no new native-audio result. Normal process closure and independent disk restoration passed. The retained record leaves the final quit-confirmation attribution unknown; this correction does not rewrite that uncertainty.

## The retained timeline

All times below are UTC on 15 November 2026. The recording origin is retained as QPC 11619646604 at 10,000,000 Hz; the OBS frontend/log difference was -7.913 ms. These clocks do not establish physical AV alignment.

| Event | Retained evidence | Interpretation |
| --- | --- | --- |
| OBS recording-start event | 23:15:31.902 | Recording active, not media admission. |
| Required audio interval | Recording seconds 1 through 11 | Approximately 23:15:32.902 through 23:15:42.902 under the existing clock mapping. Last review request remains 10.9. |
| Readiness plan created | 23:15:44.0355513; elapsed 12.1335513 s | The fixed `>=12` condition scheduled the only snapshot. |
| Prefix created / last written | 23:15:44.1213275 / 23:15:44.1244927 | 2,609,152 bytes, SHA-256 `2063f7b617c56539a0d5e0d8c12b15534c72fe8ffb9f1e75391de6b2791ba9a3`. |
| Extractor refusal receipt | 23:15:45.1039105; elapsed 13.2019105 s | `AssertionError: bounded decode covers requested review frames`. |
| Operator refusal | 23:15:45.261012; elapsed 13.359012 s | No `recorder-ready` or automatic Begin occurred. |

The actual decoder-open instant was not instrumented. It falls after the completed isolated copy and before the failure receipt; a more exact timestamp cannot be recovered. The source OBS recording was still active and growing while the extractor read its isolated immutable copy. The original copier verifies file identity and prefix bytes around copying; it does not lock the writer or prove that future packets already exist. The finalized file has 5,237,452 bytes, audio through 28.501333 seconds and video through 28.566 seconds. Its first-prefix header differs in 173 bytes at offsets 45 through 741 after finalization. Codex's recovery fixture preserves every original prefix byte and appends the actual later packet tail, rather than importing a rewritten finalized header into the earlier snapshot.

## The implemented correction

Codex added a finite media-coverage worker around the existing decoder and full validator. The operator starts it after the existing focus check, keeps its ordinary capture lease fresh and stays unadmitted while the worker inspects newly available bytes. The worker copies through a read-only source handle with read/write/delete sharing; it decodes only an isolated, unchanging snapshot. It reports actual audio/video endpoints and the last video PTS, then requires the exact selected windows, review frames, timestamp continuity and full quality result. Before durable admission it rechecks the original source identity and inspected prefix hash.

The worker reports recording active, media available, required coverage complete and admitted separately. File growth, elapsed time and OBS state schedule inspection; none makes a positive decision. No-growth polls do not decode the same bytes repeatedly. Missing coverage and a temporary sharing failure can wait within the original bound. Invalid timestamps, malformed media, source replacement/overwrite, changed snapshot, stopped/stale/foreign context or exhausted limits refuse progression. A later refusal overrides even a retained positive extraction receipt.

The complete 1–11-second interval and 10.9-second review remain mandatory. Admission must finish before the original recording-second-50 reserve; every attempt uses the original origin. The recorder independently stops by second 60 when no startup admission exists. The active 600-second limit, 450/490/540 cleanup reserves and 780-second total capture ceiling are unchanged. A worker runs outside game callbacks, so coverage waiting cannot create an arm or block the local cleanup callback. Packet-level deadline checks and the independent parent/recorder bounds prevent a slow decoder from granting a late admission; arbitrary OS or native stalls are not a recovery guarantee.

The same small scheduling layer waits for written packets for the already-selected phase windows, at most ten seconds and within the original active deadline. It neither retimes a window nor creates another take. Human review and the existing ten-second arm/confirm mechanism remain separate. A reviewed current answer still precedes adjacent Arm/Apply in one checked callback.

## Offline evidence and remaining uncertainty

The retained-prefix regression rejects 8.917333-second audio, 9.000-second video and the missing review frame. Appending later packets from the same controlled recording passes the unchanged full validator with 480,000 PCM frames for seconds 1–11. Independently muxed audio-first/video-first fixtures remain unadmitted until both tracks qualify. Mutation, disappearance, unexpected stop, timestamp corruption, malformed/truncated container, stale/future content, bounded polling and deadline cases fail closed. Deadline cases use an explicitly authored clock; they are not measurements of decode latency.

The actual bridge integration stays Dormant on incomplete media, admits a later prefix durably through the actual parent eligibility function and then accepts Begin. No audio profile is armed during readiness waiting or Begin. The retained runner tests cover delayed human feedback with no premature arm. The source controller, automatic runner and native adapter are reused directly from candidate-08; its full timeline/extraction/finalization code is unchanged.

Codex also exercised the actual installed OBS writer using a private generated-media collection with monitoring off. The final qualification recording began at 00:11:08.378 UTC on 16 November. Its prefix still lacked required media at elapsed 12.326 seconds; the third snapshot admitted at elapsed 15.235967 seconds, leaving 34.764 seconds of the existing admission budget. Decoded audio reached 11.861333 seconds, video 11.966 seconds and last video PTS 11.933. Three snapshots used 909,312 bytes. OBS recorded once, stopped once, closed normally and had its original settings bytes and metadata restored; actual game settings remained unchanged. The private test receipts retain the exact timestamps, snapshots, writer log and finalized source. An earlier successful draft admitted at 14.762174 seconds. These measurements demonstrate variable packet availability, not a replacement fixed delay.

Failed development fixtures remain retained: the first readiness draft exposed a Windows flush-handle issue; a first OBS fixture assumed the output filename appeared immediately; an external Lua fixture briefly reported an accidental 1090-pixel authored height. Codex corrected those fixture/flush issues and reran the relevant checks. None was a GTA run or audio-selection observation.

Actual OBS generated-media writing is qualified offline. GTA window capture, live game focus under decode load, physical AV alignment, human audibility and native resource selection remain unqualified for candidate-09. My next separately approved run returns directly to BATI baseline → BATI self-control → stock ADDER → BATI return → private root → final BATI. B stays profile-unassigned. Stock ADDER needs an attributable engine/exhaust signature before the private stage. Physical horn observations remain separate from the auxiliary getter. Ambiguous evidence permits only the existing BATI release and cleanup. No silent profile, resource change, new hook or additional assignment is prepared.

The disabled binary and revised scope are generated after the final source commit. Their exact identities and all private validation receipts are retained in the preparation result. Preparation grants no GTA launch or installation; I must approve that complete new scope first.
