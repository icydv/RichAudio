# STREET-01 Phase 1 early exit

## First live execution

The one-use run on 8 November 2026 reached the normal RPH bridge, gameplay pipe, host and Node producer. The device-free sink consumed 7,381,440 frames by the last host publication. The camera frames and process receipts establish that path even though the run did not retain the RPH entry log or the exact host and Node creation and exit timestamps.

| UTC | Retained observation |
| --- | --- |
| 01:26:13.602 | The coordinator claimed the session. The 8/15/21/25-minute cutoffs were 01:34:13, 01:41:13, 01:47:13 and 01:51:13. |
| 01:26:20.793 | Current source-proof epoch. |
| 01:26:24.493 | Launcher PID 27208 recorded after the one invocation. |
| 01:27:40.828 | First accepted camera frame carried this bridge world-preparation epoch. GTA owner PID 20400. |
| 01:27:41.560 to 01:27:42.971 | The runtime wrote its startup permit. The Node producer, PID 4444, created its single-use claim. Host PID 20844. |
| About 01:27:44 | The installed-world worker first reported ready, 2,969.5 ms into the producer clock. |
| About 01:30:15.475 | Last accepted camera frame, sequence 2714. UTC is estimated from its QPC relative to the last host publication. |
| 01:30:16.812 | Last host status file write. It reported 14,424 received blocks, 7,381,440 consumed frames and zero underflow frames. The exact last consumed block time is unavailable. |
| 01:30:17.031 | Last producer evidence file write. The last retained render is sequence 14446. The final worker snapshot still reports an idle, healthy worker with zero joins. |
| 01:30:24 | The next process snapshot found GTA alive and both the host and Node absent. |
| 01:32:06.869 | The runtime still published stock fallback with its one-attempt budget exhausted. The receipt overwrote earlier fallback status, including any transition reason. |
| 01:32:19.938 and 01:32:22.131 | Two process-absence checks before restoring the four staged targets. |

The stop preceded the approved cutoff and the request to exit. The pinned private settings file retained its prelaunch write time. The evidence does not identify whether the host exited first, the producer exited first, or the runtime stopped the host after a Story readiness change or a supervisor fault. The missing evidence is the initiating transition or exception, the last status probe, the shutdown command acknowledgement, the owning Job disposal decision, and OS exit observations for the exact host and Node lifetimes.

The original host closed its kill-on-close producer Job before sending a producer stop. Node's asynchronous worker join could therefore be cut off by a real host shutdown. The device-free Windows reproduction also found that the old host did not acknowledge the owner's stop command before the owner closed containment. A bounded host stop reader that consumes the UTF-8 preamble and explicitly receives EOF fixed that reproduction. These are demonstrated shutdown defects. The live evidence does not connect either defect to the event that initiated the first exit.

## The empty scene results

All 297 producer publications used catalogue `03a515a1…8be2` and the fresh proof epoch. All had zero surfaces and no selected resource evidence. The 2,714 camera frames stayed around Los Santos International Airport, with X from −1156.058 to −1144.576 and Y from −2940.854 to −2922.275. The closest frame was 2,628.85 native units from the selected exterior anchor. There were no accepted vehicle observations or camera-interior associations.

Four early status samples preceded a local window. All 299 later status samples reported `local-cache-unprepared`, four or five missing exterior results, and one or two withheld placement or activation candidates. None recorded current validation pending, query failure, capacity omission, stale result, or worker failure. The two proof-qualified resources were a distant El Burro Heights exterior and Michael's foyer. The airport results are consistent with that scope. The retained replay admits the same exterior resource at its anchor and the foyer at its captured identity. The catalogue denominator stays at 10,663.

## Changes

- The existing runtime and host now write separate, bounded lifecycle journals in the private session directory. The runtime records settings and Story transitions, watchdog operands, its last verified host status, the exact owned host lifetime, and the observed exit. The host records stop causes, producer lifetime, terminal producer and worker receipts, and exit or forced containment closure. An externally killed process can still leave its own journal incomplete.
- The discard host asks Node to stop, keeps draining its pipes through shutdown, and waits for bounded graceful exit before releasing the Job. Both owners record forced containment intent before release and then independently observe child exit. A zero OS exit code by itself is insufficient to establish graceful closure.
- The runtime reuses the existing monotonic status lease to tolerate transient metadata observations. The discard host tolerates transient Windows sharing conflicts in the running status writer. Persistent loss still reaches the watchdog. The one-launch policy remains in force.
- Measurement readiness is recorded once, after three distinct fresh samples show the same running player Bati lifetime advancing through synthesis and the exact exterior resource admitted at the consumer. Travel telemetry stays available, with the original deadline and underflow rules in force throughout.

## Operator route

1. I start from a Story Mode save with access to Michael's house and a standard Pegassi Bati 801 already available to my current character. The required model is `bati`, hash `0xF9300CC5`. Story Mode lists it for $10,000 on Southern San Andreas Super Autos when available. I arrange the bike through ordinary gameplay before the one-use session and start as its driver with the engine running. Availability in my save needs my confirmation. [Bati model and acquisition](https://gtacars.net/gta5/bati)
2. I set the in-game waypoint on the south side of **El Burro Boulevard**, matching the public map pin near the road approach at **(1483.00, −2586.00, 48.16)**. I take the adjacent southbound access road toward **(1456.75, −2606.25, 47.53)**, then follow the accessible terrain south-southeast to the lower anchor at **(1475.960, −2717.439, 18.504)**. The public road data puts the last nearby GPS node about 116 native units from the anchor, with about 29 units of descent. The exact anchor has no road waypoint. I use the two map pins side by side and confirm I can safely ride to the lower site in ordinary gameplay before approving the measured session. [Road approach pin](https://fivemad.com/tools/interactive-map#at=1483,-2586,48.16,0&zoom=7) · [Exact anchor pin](https://fivemad.com/tools/interactive-map#at=1475.960,-2717.439,18.504,0&zoom=7) · [Public road-node data](https://github.com/VIRUXE/gtav-coordinate-lookup/tree/main/data)
3. At the lower site I hold the running bike and gameplay camera steady with the map and pause menu closed. The camera must come within 10 native units of the anchor. I wait for the observer to confirm fresh accepted poses, running player attachment, stable source identity and advancing synthesis, and nonempty consumer admission of `9c81f577241cd8290752e4c5`. Once ready I hold briefly, then use a small ordinary movement near the anchor to exercise renewal and propagation.
4. With enough time left, I ride to Michael's Rockford Hills house, using the front entrance. I pause outside, walk into the foyer, hold the camera still, then return outside and hold it again. The retained proxy origin is about **(−807.343, 174.981, 71.163)**. The camera frame, placement match, source proof, consumer admission and withdrawal are separate checks. Dismount and travel can change source eligibility. The foyer check does not require a motorcycle indoors. [Michael's house map pin](https://fivemad.com/tools/interactive-map#at=-807.343,174.981,71.163,0&zoom=7)
5. If the bike or safe approach is unavailable, I leave the session disabled. If readiness is missing at minute 15 or the path fails during the session, I exit normally. Observation stops by minute 21 and leaves four minutes for exit and restoration. Spawning or teleporting would require a separate permission.

## Restoration

The first execution restored the three original RichAudio files and verified that the fourth target was absent. The independent check stopped on GTA's `settings.xml`. The file matched its 5,908-byte content, SHA-256, identity, creation time, attributes and permissions. Its last-write time alone moved from 7 November 22:10:25.189 UTC to 8 November 01:26:59.178 UTC, during game startup and before the producer started. The run retained no writer attribution. It is a GTA-managed file outside the four RichAudio installation targets. Codex made no write to it. A supplemental read-only check verified all other protected rows, four ASIs, ten extra paths and three archive identities.

The disabled successor explicitly carries that newly observed timestamp as a proposed preflight expectation. Its proposed post-exit exception applies to that exact file and only to an in-session change in last-write time, after the content, file identity and other metadata checks succeed. The receipt labels the deviation. No timestamp is restored and no other metadata or identity comparison is relaxed.
