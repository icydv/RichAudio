# Let the software operate the native-audio test

I am the listening reviewer. I approve one bounded run, watch and listen, and tell Codex what changed. The software handles the experiment. No normal phase requires an F-key, a stopwatch, mounting a bike, moving the camera, sounding the horn or acknowledging a cleanup notice.

Candidate-06 remains a stopped test. I reported no sustained change after BATI self-assignment. ADDER was armed but never dispatched after its arm expired; private selection was not reached. I reported normal engine and horn after terminal BATI on the same A, with a camera-context limitation. Its late retirement, short B endpoint and rejected finalized capture remain recorded in [the execution report](NATIVE_SUPPRESSION_06_EXECUTION.md). Automation does not reinterpret those findings or reuse that approval.

## One controller and a finite automatic operator

The candidate-07 copy of `IdleExperiment` retains the existing A-only profile list, lifetime and operating checks, ten-second arm expiry, final dispatch guard, one permitted terminal BATI release and checked deletion arguments. `AutomaticRun` calls that controller; it does not implement another audio switching path. The retained candidate-06 sources and resources are unchanged.

The SHVDNE entry creates the adapter on its first admitted script callback. The local IO worker reads only finite session commands and publishes evidence. It has no controller or native-adapter reference. Game operations run through the SHVDNE callback, with the existing adapter's callback-thread guard. This is not a claim that the callback is the Windows process main thread. The optional Ctrl+Shift+F9 emergency key queues a stop for that same callback; normal operation does not use it.

Every operator command has a session, original observation, phase, exact A/B generation, permitted profile, unique identifier and fresh five-second delivery expiry. This expiry starts when Codex sends the reviewed result, after my answer. It is not a deadline for answering. Duplicate identifiers reconcile the existing result. A durable reviewed-decision record and setter reservation must complete before the runner arms. `Arm()` and `Apply()` then execute in the same callback, with no chat, IO or wait between them. The expiry and final native guard still apply if game calls themselves stall.

Requests, accepted commands, reserved dispatches, native dispatch intents and native returns are separate records. A successful native return does not prove audio-object selection. If a return is lost, the reservation is uncertain and is not resent. The exclusive activation file prevents a script reload from creating another pair or reusing this installation's authority.

## Mechanical actions included in the new proposal

This scope adds explicit player, engine, camera, horn and recording operations that candidate-06 did not authorize:

- One fixed exterior placement around `(1730, 3300, 41.2)`, heading 195. The adapter checks dry ground, bounded slope and occupied space. It may first request one normal player exit from a stationary pre-existing vehicle; it does not adopt that vehicle or apply an engine setter, profile or deletion to it. Streaming focus is taken only from the default player focus, used briefly for the fixed site and cleared before spawning. No traffic is cleared.
- The same disposable A/B pair, protected by model, script ownership and distinct decorator tokens. There are at most two A setup starts, one B start and two A stops solely to match the B comparisons. There is no continuous engine forcing or restart after baseline admission. Unexpected engine loss stops progression.
- Two programmatic A seating requests and bounded normal exits. The B comparison uses a checked local point three metres behind B's origin, on dry ground. Actual player and camera geometry is retained. Only the exact pair may be retired.
- The normal gameplay follow camera, mode 1, relative heading 0 and pitch -8. Both the player position and the rendered/gameplay camera pose must settle and remain within 0.10 m and 0.5 degrees during each selected window. Per-frame finite look/vehicle input clamps expire automatically. Original view modes are saved, restored and read back. The player returns to the original position only if that point is clear.
- A 600 ms vehicle-bound horn request on A at cue+2 seconds, using the retained SDK's `START_VEHICLE_HORN(..., HELDDOWN, false)` route. `IS_HORN_ACTIVE` must witness activity. There is no separate sound sample or horn assignment to B. My hearing and the captured context still determine the audible signature.

There is no new scripted camera or audio-listener override. Visual framing alone is not treated as listener proof. The ordinary gameplay camera path is required, and both possible listener-related positions—the actual player and gameplay/rendered camera—are held fixed between A observations. Normal audible A/B and physical-horn baselines remain gates. Exact internal listener state and live behavior are not claimed from offline fixtures.

## Listening stays conversational

The sequence remains stock BATI baseline → BATI self-control → stock ADDER → BATI return → `ra_ns06_adder_select` → final BATI. I retain one self-control because automatic seating, view and horn operation change the context; it is not a second candidate-06 take. The earlier self-control result stays in the record.

Codex asks one ordinary listening question for the current observation. My original answer is saved verbatim. Codex reviews its fixed capture and context, then attaches that answer to the original observation identifier and sends the appropriate finite reviewed decision. I do not supply identifiers, JSON or in-game evidence keys.

Stock ADDER requires a distinct attributable engine/exhaust timbre, beyond mixed loudness. After a normal BATI reset, the private phase requires the admitted ADDER signature or an attributable donor bus-horn reference. The default-horn getter remains auxiliary. Ambiguity stops progression; silence never counts as a positive answer. Late answers are retained without operating a later phase or restarting a stopped run.

## Deadlines and evidence stay local

The absolute active limit remains 600 seconds from the automatic spawn request. Diagnostic admission requires at least 100 seconds remaining and room for the complete observation before the local second-450 release reserve. Human review time counts. A delayed answer never renews time or starts an arm early.

At second 450 the local runner stops diagnostics and begins the permitted release if needed. It finishes the return capture, waits for a listening result only within the reserve, records an uncertain result by second 490 if necessary, and proceeds through control comparison and retirement. Retirement is forced into its checked path by second 540; expiry at 600 records an unresolved result. None of this depends on a five-second acknowledgment or Codex producing another message. A crashed, blocked or paused runtime cannot be promised recovery; no independent crash-recovery mechanism or forced termination is introduced.

OBS uses its existing private window/loopback profile with one small Lua script loaded through the collection's supported scripting interface. Commands are local files, restricted to recording start and stop. The script checks the profile, collection, WGC source, 30 fps, loopback source and absence of extra sources. Actual recording state and start timestamps are required before spawning. There is no WebSocket listener, microphone or new OBS plugin. The operator processes audio/video outside game callbacks.

All transition, steady, horn and B windows are declared from their first local anchor, without replacement cuts. The new bundle decoder reuses the pinned dependency and internal timestamp checks, decodes once per observation and preserves its immutable prefix, PCM, receipts and context frames. Final verification reproduces used PCM and timestamps against the finalized recording.

The new end contract distinguishes selected-window completeness from shutdown metadata. Every used interval must have complete audio and video. Only after those intervals may the tracks end at different times, by at most 250 ms. The container may include at most one configured 30 fps frame plus 2 ms of timebase rounding beyond the raw longest decoded track end. Raw audio/video/container ends and discrepancies are reported. Timestamps are neither dropped nor retimed. Real muxed and retained OBS recordings exercise this contract. Candidate-06's rejection under its unchanged old validator is preserved.

## Source and qualification

The implementation is confined to `tools/native-control/native-suppression07/`, `tools/Build-NativeAutomatic07.ps1`, its targeted tests and this documentation. The final private build receipt, compiled inspection, test receipts and scope identify the committed source and artifacts. No private archive, recording, backup, binary or asset is committed.

Tests exercise the actual runner and controller with deterministic game fixtures, the real retained SDK's deletion/ground/horn argument helpers, the real bounded worker in disposable processes, the installed LuaJIT VM with an authored OBS frontend, actual muxed media, and disposable installation/restoration files. Those are offline results. They do not qualify live GTA seating, streaming, camera/listener behavior, horn routing, profile selection, suppression or recovery.

This work prepares one new approval boundary. It does not install the candidate, launch GTA or OBS, add a silent profile, change the DLC, introduce a hook, take over production audio, push, merge or release.
