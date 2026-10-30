# ACOUSTICS-08.3.3 — listener startup without geometry

Candidate 08 reached Story Mode, launched the host and accepted 98 native listener packets (97 reached the producer). It did not emit or record the beacon: the required solver confirmation failed. This was a scene initialisation defect. `GeometryHostRelay.Run()` only sent `geometry-config` after a qualified snapshot; `ObservedSimulationInput.prepareSnapshot()` required that configuration before it could map a listener or create an owned source. The operator required a ready solver before emission and sensing, so neither side could progress. Historical Candidate 08 diagnostics and independent restoration evidence remain preserved.

The host now sends `listener-context-config` in the first measured relay transaction carrying a valid listener. This separate context binds the original session/generation, explicit GeometryModel scale/calibration declaration, bounded native region and the original beacon's native placement. It contains no geometry session, collision observation or publisher clock pair. Later `geometry-config` messages attach genuine qualified geometry to that same context and retain the original paired-clock validation.

The engine validates the separate context and the original listener evidence before mapping either pose. Its dedicated conditional direct scene has no tile, surfaces or observation clock. Only the original `beacon-0` source is permitted. The existing retarded-time propagation, distance loss, source direction, arrival pan, Doppler rate, source PCM histories and DSP smoothing process the signal. `unobserved-space-assumed-clear` is an explicit assumption; the environment is never described as verified unobstructed.

Qualified finite observations later add the existing physically valid reflection candidates. Scene replacement retains direct-path rate history and source PCM generations; obsolete reflection controls release through the existing fade. Expiry and withdrawal return to the labelled direct scene while valid listener tracking continues. Listener invalidity or unavailable evidence still withdraws rendering; no listener freshness or geometry validation limit has been relaxed.

Each solver control and SoundMap frame now distinguishes transport acceptance, source-context initialisation, owned-renderer readiness, observed geometry and active reflections. The operator's five-second confirmation requires fresh accepted listener evidence and an emission-ready context. It accepts the explicitly labelled conditional direct mode without requiring sensing. SoundMap publishes no geometry generation for that mode, labels the visibility assumption, and retains it in recording frames, propagation-state events and manifest metadata.

The 600 Hz / 0.44 / guarded +12 dB / host 0.20 profile, headroom limits, quality/GPU settings, menu, passive camera telemetry, two bounded sensing sessions and ten-minute loading allowance remain unchanged. The combined milestone remains **60%**. This offline correction does not establish live audibility, GTA reflection quality or performance under GTA load.

## Shutdown fault

Candidate 08's 352 underflow frames began exactly at producer frame 779264, the end of its produced PCM. Normal stop only muted the output before ending the producer and waiting for listener transport shutdown. A muted consumer still drained the ring during that wait and could report starvation after the producer had legitimately stopped. Shutdown now stops the consumer before ending the producer reader or waiting for the transport; the output loop rechecks stop after waking and before filling. Underflow detection remains strict. A real output error discovered during disposal is retained in the terminal primary/secondary result.

The full-rate fixture exposed another normal-stop blockage: the producer could be waiting to write already-credited stdout PCM after the reader stopped. The reader now continues validating and draining that bounded outstanding output until EOF, without submitting audio, adding to the ring or issuing credits. `drainedShutdownBlocks` discloses this discard. Forced child termination remains a failure rather than a normal result.

## Device-free combined proof

The registered fixture runs actual native `HostProgram.Run`, listener wire transport, `GeometryHostRelay`, Node producer, simulation worker, streaming DSP, existing PCM ring and post-host-gain owned output tap into the actual SoundMap service/recorder. Its output consumer is paced without starting WASAPI; no audio endpoint, GTA process or game file is used. Qualified geometry in this fixture comes from declared deterministic collision observations through the real wire and relay; it is not evidence of GTA surfaces.

The complete A–E run is retained at `.local/listener-startup-proof-0833-05/result.json`, with exact PCM analysis in `corrected/analysis-detailed.json`:

- **Old implementation / A negative control:** the exact `9e159f8` relay and producer source, compiled into the same device-free host fixture, accepted 34 listener packets and delivered 33 to the producer. A real manual emission request still produced zero PCM, zero paths and no source history. This reproduces the configuration dependency; normal shutdown completed.
- **A — no geometry:** listener/source context and conditional direct readiness appeared before any geometry configuration or collision observations. The reviewed original beacon produced nonzero stereo PCM through the real producer/worker/DSP chain.
- **B — observed geometry:** qualified analytic collision observations passed through actual native sensing/publisher/wire/relay components. Finite reflected paths reached the actual SoundMap service and recording. Replaying captured path controls reproduced all 685,056 captured pre-host samples exactly. Removing only reflections from the matched replay yielded a reflected contribution RMS of **0.02207094** before host gain.
- **C — expiry/withdrawal:** original leases expired and explicit withdrawal was exercised. Reflection controls released while the same source generation **4294967297**, direct path and listener remained operational. There was one initial history reset, zero affected history frames, zero cursor resets and zero path overflows.
- **D — invalid input:** each real native process first emitted nonzero valid PCM, then refused one stale, future, wrong-session, reordered or interrupted packet. Stale/future failed at `freshness/invalid-age`; wrong-session/reordered at `sequence/invalid-sequence`; interruption at `payload/deadline`. Each retained its listener fault as primary, had no secondary failure, muted/stopped the host and made no subsequent submission. No artificial zero tail was appended. Separate actual-worker/DSP tests verify the release to silence after invalid evidence.
- **E — lifecycle:** 116 accepted native packets, 115 producer listener messages and 670 generated blocks; explicit emission Stop settled the captured tail to silence. Host exit 0, joined owned threads, zero ring underflows, no primary/secondary errors and bounded normal shutdown. The owned recording contains **340,992 stereo frames (7.104 seconds)**, complete hashes, zero gaps and exact post-gain byte lineage. One producer block drained during shutdown was validated but never captured/submitted.

Measured Float32 sample amplitudes, using actual captured pre-host and post-host PCM:

| Phase | Pre-host peak | Pre-host RMS | Post-host peak | Post-host RMS |
|---|---:|---:|---:|---:|
| No geometry, conditional direct | 0.11812030 | 0.07060573 | 0.02362406 | 0.01412115 |
| Qualified observed reflections | 0.28249037 | 0.12900580 | 0.05649808 | 0.02580116 |
| Expired, including reflection release | 0.27276230 | 0.07260373 | 0.05455246 | 0.01452075 |
| Expired, settled direct path | 0.11996511 | 0.07214129 | 0.02399302 | 0.01442826 |

The guarded +12 dB stage had zero rejected blocks; the DSP had zero limiter activations and no nonfinite samples. Peak remained below the unchanged **0.5 pre-host ceiling** and **0.1 post-host ceiling**. Post-host samples match actual Float32 multiplication by the unchanged 0.20 gain. These measurements establish processed output, not human audibility.

Timing limits remain visible: this run retained **two processing deadline misses** and **207 late fixture wakes**, with maximum lateness **15.7249 ms**. The paced consumer caught up within its four-block bound on the same 48 kHz clock and had no underflow. This is not a WASAPI callback or GTA-load scheduling guarantee. Recording schema retains its existing WASAPI-oriented capture label; this fixture explicitly declares WASAPI unstarted and proves the real ring/tap's post-gain samples only.

Preliminary failed/incomplete fixture runs remain preserved. They include the initially slow consumer pacing, the credited-stdout shutdown blockage and the stale-input fixture's earlier sequence-first rejection. None is substituted for the complete passing run. No game launch, deployment, audio endpoint, subjective listening or new live verification occurred during this correction.

`tools/Test-Offline.ps1` registers the actual chain and the focused listener-context, operator, SoundMap/recorder and native shutdown regressions. CI fetches the existing history so the exact negative-control source is available. Candidate 09 may only be sealed after the complete chain and required regressions pass and remains subject to fresh explicit authorisation; its [operator sequence](CANDIDATE_09_OPERATOR.md) retains the existing single-attempt boundaries.
