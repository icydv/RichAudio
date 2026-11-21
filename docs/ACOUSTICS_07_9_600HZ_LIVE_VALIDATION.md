# ACOUSTICS-07.9 — 600 Hz live listening validation

## Outcome

I've completed the single approved attempt, but **the listening objective was not executed**. The host opened the default Windows endpoint and remained muted with emission disabled throughout. Setup consumed the intended listening window. No host Start command was sent, and every submitted owned audio sample was silent. I have no new judgement of live audibility, level, directional response, startup continuity or audible Stop.

The strict connection accepted, forwarded and consumed **1,626 observations with zero receiver rejections**. Both ends confirmed acknowledged deliberate Stop and exited without a reconnect. Independent installation restoration passed.

**Operator execution failed the timing requirement.** Stop was confirmed at approximately **107.95 host-wrapper seconds**, outside both the 45–60-second target and the before-90-second operational limit. It occurred below the unchanged 120-second runtime cap, but that does not make it compliant. This is an incomplete listening experiment with a procedural failure, not a successful 600 Hz live validation. No further attempt was made.

| Item | Classification | Evidence |
| --- | --- | --- |
| Live audibility and level | NOT OBSERVED | Emission never enabled; submitted peak/RMS both zero |
| Directional listening | NOT OBSERVED | No owned audible signal |
| Audible continuity/startup | NOT OBSERVED | Startup remained idle because emission was off |
| Strict telemetry transport | PASS in this attempt | One publisher attempt, one receiver connection, 1,626 accepted, zero rejected |
| Acknowledged deliberate Stop | PASS | Both terminals report `connection/sender-stop/deliberate-stop` |
| Stop schedule | FAIL | Approximately 108 seconds; missed target and operational limit |
| Bounded host/producer shutdown | PASS | Both exit codes zero; no replacement or forced process termination |
| Installation restoration | PASS | Independent original-file, directory, signature and archive checks |

## Exact candidate and preservation

Runtime source remains PR #60 commit `b5143db8c99decef49a8c9fdf1473f0c3db4840f`. This result branch is stacked directly on that commit and changes no runtime source, renderer, bridge, tests or operator helper. No artifact was rebuilt or substituted.

| Binding | SHA-256 |
| --- | --- |
| Host | `847D5B59464A75DF67D9D2B51E5E444F1DF9D1D934C1CE8AD6F1F6ED20C5BAB7` |
| Bridge | `96EE4100BA2C2CCB2AB75A0664A3047A3BC293D5A8F43A3D37F21D09247EAFAD` |
| Deployment manifest | `64FC1B32CDEAE1877FA82B124EC827F0307005833A6EF36E9F444303E3A71BBA` |

A fresh approval receipt bound this attempt to those artifacts. The sealed operator files, original installation and unused attempt tokens were checked before the 26 temporary additions and reversible executable-selection rename. RPH's visible settings confirmed GTA Enhanced 1.0.1158.16 and RPH 1.132.1428.17748 with plugin autoload disabled. One visible launch reached stable Story Mode; the bridge loaded once and reported READY / sending OFF.

The fixed invocation was:

```text
--scene open-road --beacon harmonic --sources 1
--beacon-frequency-hz 600 --beacon-level 0.44
--beacon-output-trim-db 24 --gain 0.20
--seconds 120 --device default --listener-pipe
```

Both listener buffers remained 100 ms, experimental orientation OFF, prediction 50 ms, receiver freshness [-2, +250] ms, pre-master ceiling 0.5 and master ceiling 0.25. No autostart, synthetic listener fallback, capture, retuning, mixer change, vehicle experiment or geometry acquisition occurred. Native GTA audio and gameplay were not modified by the read-only bridge.

## Console readiness and timing

The approved direct asynchronous capture exposed actual host startup at wrapper **101 ms**. A live `status` response at **17,715 ms** showed 600 Hz, source level 0.44, trim +24 dB, emission false and zero paths before the listener arrived. Startup output follows pipe-thread startup; it is not itself a pipe-bound acknowledgement.

The one real receiver connection was established at receiver elapsed **26,237.3208 ms**, within the unchanged 30-second first-connection window. A later host status at wrapper **33,915 ms** showed two paths, required native-orientation-only listener mode, interpolated playout, 100 ms control delay and emission still false. A sender status subsequently showed **705 acknowledgements**, one attempt and no terminal failure; final acknowledgements increased to 1,626.

Visible console input and observation took longer than planned. Some immediate screenshots retained the previous frame, and the pending Stop required renewed console focus before its submission was confirmed. These observations do not isolate how much delay came from focus, capture, input delivery or operator orchestration. The host's three recorded commands were `status`, at 17,714, 33,914 and 79,603 wrapper milliseconds. There was **no `start`**. The operator elected to omit listening rather than enable emission late, but still failed to complete Stop before 90 seconds.

Receiver Stop elapsed time was **107,842.8343 ms**; the wrapper observed its terminal line at **107,951 ms** and exited at approximately **107,997 ms**. Host wall duration was **107.9157901 seconds**. These clocks have distinct origins; their differences are not measured physical mute latency. Both sides reported deliberate Stop, rather than EOF, freshness rejection or duration expiry.

## Transport and renderer measurements

| Measurement | Actual value |
| --- | --- |
| GTA/RPH launches / bridge loads / bridge activations | 1 / 1 / 1 |
| Host sessions / publisher attempts / accepted connections | 1 / 1 / 1 |
| Beacon Starts | 0 |
| Sender observations / missed | 1,633 / 0 |
| Sender acknowledged frames | 1,626 |
| Expired unsent before / after encoding | 0 / 1 |
| First sender expiry age, displayed rounded F3 | 372.530 ms |
| Receiver accepted / rejected | 1,626 / 0 |
| First accepted sequence / signed decision age | 7 / 51.6178 ms |
| First-header wait | 382.3136 ms |
| Host forwarded / renderer consumed | 1,626 / 1,626 |
| Renderer control updates / maximum paths | 10,108 / 2 |
| Missing-history taps / limited samples | 0 / 0 |
| Post-trim blocks / rejected blocks | 10,108 / 0 |
| Trim peak before / after | 0 / 0 |
| Submitted PCM peak / RMS | 0 / 0 |
| Measured device underflow frames / audio errors | 0 / none |
| Host / producer exit codes | 0 / 0 |

The sender's expired unsent observation was discarded on the same connection; it was not a receiver rejection or retry. Receiver-side expiry fields are zero because those are sender-local counters, retained separately here. Header wait does not identify serialization as its cause. Sequence 7 reflects the existing latest-observation policy, not seven connection attempts.

The endpoint accepted shared 48 kHz stereo Float32. No capture was performed. Zero underflows while submitting silence do not validate audible playback reliability. Likewise, zero trim rejection with zero signal does not test nonzero live headroom or establish the candidate's live loudness. The earlier offline gain-staging tests remain the relevant nonzero numerical evidence.

## Shutdown and independent restoration

After acknowledged Stop, the bridge was normally unloaded and GTA closed normally. The host, producer, capture wrapper, GTA and RPH were absent before restoration. No process kill, plugin reload, reconnect or second Start was used.

The sealed restoration helper preserved runtime-generated files outside the installation, removed the verified introduced files and restored the original executable name. A separate checker confirmed **32 original root-file hashes, five original directories, Valid executable signatures, absence of all 26 introduced paths and the temporary alias, 179 archive metadata entries and ten sampled archive hashes**. Owned processes were absent. Raw logs, approvals, manifests, backups, endpoint identity and detailed traces remain private; publication includes only this report and sanitised scalar evidence.

## Validation and publication

The unchanged runtime candidate already passed 378 Node tests, 672 host assertions, 71 transport cases and the pinned-SDK bridge build. Its hosted run [40774456703](https://github.com/icydv/RichAudio/actions/runs/40774456703) passed on generated checkout `25f07c0a539afed57d3dd60f5e447614490414f9`, whose tree matches the runtime candidate. These are inherited runtime checks, not newly repeated local test results.

This result branch is `validation/acoustics-07-9-600hz-live`. Publication screening, exact runtime-diff preservation and hosted result-head verification are recorded in the draft PR. Historical PR #58 remains a successful transport/Stop experiment with incomplete directional listening and late 72.8-second Stop; this attempt does not rewrite that result or replace the earlier positive prerecorded audition.

The combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**. Experimental orientation remains OFF. No additional live attempt is authorised.

## Next copy-ready prompt

> Start from the ACOUSTICS-07.9 result PR. Diagnose and correct the operator workflow offline so startup gates and deliberate bridge Stop can reliably complete within the existing 45–60-second target and before-90-second limit. Use device-free fixtures to exercise the same console-capture and stdin controls, account for focus and stale screenshot handling, and preserve the sealed runtime, strict transport, gain profile, buffers and all deadlines. Do not launch GTA/RPH, deploy, open an audio endpoint, play or capture audio, or create live approvals. Publish the bounded workflow evidence and stop for separate review before any new listening attempt.
