# PLAYABLE-09: passive SHV to RichAudio handoff

This increment prepares a separately authorised **passive handoff experiment**. It does not accept the new producer in GTA or enable audio playback. The PLAYABLE-08 result remains restricted to 1,633 genuine engine-running, player-driven Bati observations on the exact reviewed stack. It is a normalised operating-state signal, not physical RPM. The diagnostic artifact's qualification does not transfer to the new ASI.

The implementation uses a small same-process C ABI between an independently running SHV script and the RPH plugin. No second modding runtime, new pipe protocol, memory scan, guessed native mapping, metadata tag or game-memory dereference is introduced. The published revolution native is still dispatched exclusively through SHV's documented script/native interfaces. The seven owned C exports copy bounded records and controls; they never dispatch game natives.

## Source and session provenance

`ShvProducerModule` verifies the actual game process path and kernel creation time, exact reviewed game/framework/loader files, the already loaded ASI path and bytes, loaded SHV/loader paths, the loaded caller assembly, and the seven exports inside that module. File handles deny writes/deletion while pinned. It never loads a different ASI or accepts a forwarded export. The ABI build marker identifies layout, not artifact authenticity. The compiled private build policy pins the newly built producer separately from the accepted diagnostic.

The passive RPH entry additionally requires the actual assembly providing `Rage.Game` to have the reviewed RPH digest and file version. An unexpected extracted/cache assembly fails closed as `actual-rph-runtime-bytes-or-version-unreviewed`; a launcher digest or version string alone does not authenticate it. The installed runtime's opaque metadata cannot establish that actual live assembly identity offline. This gate is deliberately left strict for the authorised experiment.

A strict process-bound lease selects one fresh session and the exact caller artifact. It cannot select a fixture, change scope, enable playback or choose an output directory. `Open` generates a private 256-bit control secret, binds the actual process lifetime/source instance/session and uses generation one. No secret is journalled. One open and begin are allowed; no rebind or reconnect follows retirement. The coordinator must create and receipt the lease only after separately authorised deployment and the actual one-launch process exists. A lease is an ownership/control artifact, **not cryptographic evidence of human approval**. The approval record remains separate.

These checks resist accidental cross-session, stale-artifact and wrong-module use. They are not a sandbox against arbitrary code with the same user/process privileges. Such code can modify the process, read private state or forge same-user files; this work makes no contrary security claim.

## Independent vehicle correspondence

SHV independently obtains its player, ped, current vehicle, driver, model, engine-running state and speed context. RPH independently obtains its own current player, current vehicle, driver, retained SDK wrappers, pose and camera observations. SHV handles are compared only within SHV; RPH pool fields only within RPH. Model and speed similarity cannot issue a binding.

Both frameworks expose supported opaque entity addresses: SHV `getScriptHandleBaseAddress` and RPH `Entity.MemoryAddress`. The composition compares these returned values for vehicle **and** ped without dereferencing them. RPH additionally retains the original wrappers and checks validity and its local pool index, value and eight-bit counter before/after pose acquisition. The independently sampled relationships, model, running state and acquisition intervals must agree. Pose vectors must be finite and have the existing valid speed/basis contract.

I explicitly selected **read-only bounded checks; disclose the wrap limitation**. A completely unobserved full counter-wrap/address-reuse cycle between samples cannot be excluded. The finite counter, opaque address and wrapper are not an immutable lifetime serial. The test does not claim to prove that excluded case. Every **observed** exit, death, invalid wrapper, driver/model/address/counter change, stale interval or session failure retires permanently within the bounded lease. No metadata write, decorator unlock, memory bypass or automatic reacquisition is allowed.

## Clock, raw value and freshness

The existing PLAYABLE-08 validator remains the sole scalar/identity/time admission policy. The new trusted composition supplies its capabilities from actual owned module calls and independently captured RPH witnesses, rather than message flags. The explicit fixture factory remains a fixture factory.

Clock correspondence is measured with host-before → owned export's source QPC → host-after challenges. At least three ordered anchors spanning at least 250 ms are required. Pairwise elapsed intervals bound the measured relative rate; an uncertainty wider than 100 ppm cannot produce a map. There is no equal-frequency, similar-origin or UTC alignment assumption. Maps preserve outward uncertainty, renew through measured anchors and expire within five seconds. A calibration that cannot satisfy the unchanged policy blocks the experiment.

The unchanged limits include 4 ms anchor width, 2 ms maximum future uncertainty, 50 ms full peer skew, 250 ms maximum observation age/continuity/bracket and at least 50 ms between target returns and subsequent calls. RPH pose acquisition rejects a measured batch over 10 ms. These are admission limits after calls return, not promises to preempt a slow call.

The producer retains raw float32 bits and the actual float; the consumer requires exact promoted equality. A target-return record is queued immediately before post-context natives so a later blocked getter cannot erase a known return. The final observation must match the exact return, sequence and acquisition interval. Invalid/zero/nonfinite/out-of-range values remain evidence and cannot become an operating point. No scaling, clamp, speed inference or RPH revolution-getter fallback is used.

The adapter emits one existing `GameplayVehicle.OperatingPoint` per newly accepted observation. It uses the actual RPH pose acquisition midpoint, not a new timestamp on old state, and retains source/map/peer/listener lineage privately. The existing `GameplayWire` validates and serialises the frame. The passive sink has no publisher endpoint or playback host. Genuine source playback, source registry, renderer, gains, Windows host and default lifecycle remain unchanged.

## Autonomous failure closure and bounds

An independent computation-only consumer worker checks expiry at most every 20 ms nominally; every read/use also checks `ValidThroughHostTicks`. A delayed worker cannot authorise an expired read. Complete silence before or after the first observation, shutdown, continuity/identity failure, invalid data, replay or session replacement clears current state and retires permanently. It never repeats a last good value. Worker scheduling latency is not asserted as a hard real-time guarantee.

The source waits at most 300 seconds from callback start, runs at most 120 seconds, attempts at most 2,400 targets with a 50 ms minimum interval, and has a 128-record FIFO. Each attempt has at most two 256-byte rows plus one terminal row. The private asynchronous evidence writer separately enforces a 128-item queue, maximum 4,801 source rows and 12 MiB aggregate budget. Queue loss, journal failure or a budget failure blocks qualification. Known consumed raw rows remain audit data even if a later peer read fails.

Retirement is **not callback completion**. A separate source-completed flag is published only after the callback's final audit attempt. Stop precedes a maximum 500 ms drain. An unfinished or blocked native retains an unobserved outcome; an empty queue does not prove completion. The writer's summary cannot self-certify that the caller observed its thread join within the completion bound. That observation is separate.

Startup file verification and filesystem flushing can block. Native exceptions, fatal faults, forced process termination, an RPH fiber abort, a blocked native or an OS call may prevent complete evidence/cleanup. Bounds do not guarantee forced recovery. Normal process exit is required before ownership-verified rollback; there is no hot unload of a pinned module and no automatic second launch.

## Validation and next gate

The final frozen compiled-component matrix passed **32 cases / 22,464 assertions**. Its 120.448-second case made 1,929 actual fake-SDK target calls, accepted 1,928 observations, reached native active-timeout code 3 and independently retired the consumer at its active deadline. That is actual compiled component execution with labelled fixture inputs; neither the installed SHV nor RPH/GTA runtime was executed.

| Offline check | Result |
| --- | --- |
| Actual native producer → bounded ABI → trusted composition → existing validator → consumer → adapter → existing gameplay codec | 32 cases / 22,464 assertions |
| Unchanged PLAYABLE-08 validator regression against the extended validator | 68 cases / 250 assertions |
| Clock calibration and autonomous expiry controls | 13 cases / 43 assertions |
| Gameplay adapter and exact scalar/timestamp lineage | 14 cases / 63 assertions |
| Actual journal, strict process lease, raw bytes and ordinal admission | 8 cases / 65 assertions |
| Default product against original conditional source with identical other inputs | 655 method bodies and metadata equivalent |

Earlier incomplete offline attempts are retained. One stopped on a real foreground setup refusal before that case's callback. Queue-full assertions initially assumed a full FIFO must already have retired at four seconds; diagnostics showed state Active, 128 queued records and 67 target attempts at 4,003 ms, followed by the next scheduled capture's actual QueueFull retirement. The final fixture waits on that actual event within its own eight-second bound. No producer limit or qualification criterion was relaxed, and the earlier attempts are not represented as full passes.

| Proposed artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `RichAudio.OperatingState.ShvHandoff.asi` | 129,024 | `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40` |
| Temporary passive `Plugins/RichAudio.dll` | 328,192 | `c97acbcb6af255a0497c28f8349d8be3447f53c6dc5e31a0d567a7ebbc76743d` |

**GO: request one separately authorised passive handoff experiment with these exact bytes. BLOCKED: actual handoff acceptance, gameplay PCM, human listening, loudness calibration and recording.** The game installation and saved settings remain unchanged by this offline increment. Preparation is not deployment permission.

The build/validation and critical-review receipts are indexed in `evidence/playable-09-offline.json`. The exact candidate and installation/rollback proposal are in `evidence/playable-09-candidate.json` and the private candidate directory. All fixture inputs are explicitly labelled; actual compiled producer execution with a fake SDK is not actual SHV, RPH, GTA, a live identity proof or audio evidence.

The existing toolchains are MSVC 14.44.35207 with Windows SDK 10.0.26100.0 and the x64 .NET Framework C# 5 compiler. No new software is installed. `Build-ShvHandoff.ps1` requires the four reviewed source digests recorded in the native build receipt and refuses existing build/evidence outputs. `Build-PassiveShvHandoffBridge.ps1` requires the private preservation baseline, authentic SDK and final native receipt. Rebuilding creates new artifact/receipt identities; it cannot silently replace the approved proposal.

Focused controls can be reproduced with PowerShell 7 using `tools/Test-ShvHandoffComposition.ps1`, `tools/Test-ShvGameplayFrameAdapter.ps1` and `tools/Test-ShvHandoffJournal.ps1`. `tools/Test-ShvHandoffPipeline.ps1` uses the preserved final native build receipt and creates a new isolated output. Its owned positive fixture window must stay foreground; the intentional negative-foreground window must not be activated. No foreground-reader substitution, key injection or shortened duration is needed. A setup refusal remains a failed/incomplete attempt. The full suite includes an actual 120-second case.

The passive profile conditionally routes the existing single RPH entry to this telemetry-only composition. It never constructs `GameplayRuntime`; settings cannot start an audio host from it. Its legacy capture method and `EngineRevolutionsRatio` call are absent from the passive compiled profile. The normal product profile retains its prior behaviour. The gold menu source and locked Record Audio Test intent are preserved. This temporary console-operated profile does not initialise the menu or its settings/recorder/SoundMap workers: an existing recorder endpoint must not be contacted merely by starting a telemetry experiment. Rollback restores the original plugin and menu lifecycle. Loudness and synchronised recording feature flags remain false; there is no endpoint capture, PCM generation, microphone or upload.

See `PLAYABLE_09_LIVE_PROPOSAL.md` for the one-launch procedure and acceptance boundary. Passive candidacy requires the final offline suite and critical review to pass. Live handoff acceptance, actual gameplay PCM, human listening, loudness calibration and recording remain separate gates. The upstream RPH report remains retained and unsubmitted; no exhausted RPH investigation is reopened.
