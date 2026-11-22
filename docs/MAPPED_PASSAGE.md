# Driving through a covered passage

The mapped drive follows a single ADDER with the six-layer Bati development voice for 29 model metres. It passes a stationary listener, exits a covered exterior passage and ends with a camera turn. The trajectory and revs are authored. The finite wall, canopy and ground faces come from installed Enhanced collision data decoded with CodeWalker by dexyfex. Reflection losses are assumed. The cache covers part of the exterior and physical distances use one metre per native unit.

## Listening comparison

The first eight seconds contain direct sound. The second take starts at 8.5 seconds and adds the selected single reflections. The full mix starts at 17 seconds. All three use identical dry source samples, camera movement, output gain and surviving mixer controls. The SoundMap replay follows the sample clock and shows the finite faces that supported each selected route.

Compare 12.00–12.25 seconds with 20.50–20.75 seconds. In the full mix the additional reflected signal measured 1.83 dB below the single-reflection mix in the right channel and 12.42 dB below it in the left. Those figures measure the isolated difference. Phase affects the level of the summed mix. After 22.25 seconds, the two takes are sample-identical for the rest of the pass. The source is beyond the mouth of the passage and direct sound continues.

At 20.573 seconds the engine reflection crossed the passage from one side wall to the other. The direct path was 8.115 model metres and the reflection travelled 13.275. Geometry predicted an extra 15.043 ms. The smoothed mixer delays differed by 14.948 ms. Direct sound panned left at −0.502 and the reflected sound panned right at +0.853. Withholding that one route preserved all 6,398 compared states of the other active mixer slots. Subtracting the result recovered the isolated route within 0.000000008 full scale.

At 19.933 seconds an exhaust return struck a wall, the canopy and the opposite wall. Its path measured 14.895 model metres, adding 31.052 ms to the direct arrival. Removing it changed the final stereo samples. Two distinct side walls contributed at once. Several adjacent mesh faces on a façade can support returns from the same wall.

The same performance was also rendered on an open road in the retained catalogue. A rigid rotation and translation preserved the car-to-listener distances and camera-relative pan. The dry PCM was byte-identical. All 290 direct observations agreed within 0.000001 model metres and pan units. The roadside replay contained 272 single reflections and no higher-order return, compared with 738 single, 208 two-bounce and 49 three-bounce returns in the sampled passage replay. These counts cover telemetry frames.

In a stationary comparison the car holds a fixed rev input while the camera turns through 180 degrees. A 23.146 model-metre engine reflection followed wall A, wall B and wall A again. Its pan moved from −0.997 to +0.997 while its finite bounce points stayed fixed.

## Vehicle and surface continuity

The worker considers finite intermediate faces even when their individual single reflections miss. It limits its search to ranked plane sequences and tests the finite contacts, reflecting sides and visibility along every leg. Repeated visits to a wall are eligible. A small set of adjacent coplanar faces can carry a return across a real shared edge during a workset lease. Openings and the ends of the walls still withdraw the route.

A second version adds an independently revving NPC with its own Bati traffic bank, lifetime, source history and path selection. The sum of the two voices reconstructed the combined output within 0.000000008 full scale. The ADDER contribution matched its solo take exactly. The new mixed traffic path is for offline rendering. Live native takeover remains limited to one validated stock ADDER.

## Clocked measurements

The Windows host used a clocked discard sink, 48 kHz stereo and 512-frame blocks. The deadline was 10.67 ms. The timing column below is complete render time for blocks with installed geometry at the requested voice count. The miss column includes startup and every other block in the run. These measurements used the renderer at `4766edb`.

| Route and voices | Installed blocks | Median / p95 / maximum, ms | Whole-run render misses | Ring underflow frames |
| --- | ---: | --- | ---: | ---: |
| Covered, one | 2,461 | 2.65 / 3.73 / 19.45 | 1 / 2,698 | 0 |
| Covered, two | 2,227 | 5.81 / 7.51 / 18.98 | 6 / 2,696 | 0 |
| Covered, five | 11 | 13.33 / 28.72 / 28.72 | 6 / 247 | 384 |
| Passage exit, two | 2,404 | 4.37 / 6.12 / 21.65 | 3 / 2,651 | 0 |
| Passage exit, two, repeat | 2,450 | 4.66 / 6.52 / 21.37 | 3 / 2,700 | 0 |

One moving voice met the deadline on all 568 covered blocks, with an 8.37 ms maximum. Two moving voices missed two of 569. Both two-voice exit runs finished with installed geometry throughout movement, zero ring underflow and three whole-run render misses. Five active voices had a 13.33 ms median on the eleven covered blocks before the sink starved. The staged five-voice attempt starved before all five reached the installed scene. Five remain unqualified for sustained playback.

Earlier two-car exit runs had lost 320 and 64 frames as larger scenes arrived. The worker now sends large validated exterior windows in groups of up to 96 faces. The producer yields between groups and adopts only a complete window that still matches the original request and lease. On the two successful exits, the largest publication contained 2,122 faces in 23 groups. The maximum measured reconstruction slice was 2.39 ms in one run and 3.81 ms in the other. The callback continued consuming its original audio buffer.

The clocked workload holds independent Bati player and traffic voices through the end of the route and uses a fixed camera. Over the last metre the player had zero third-order paths in both trials. One second-order path remained on 21 of 65 and 21 of 66 moving blocks respectively. The traffic voice continued to reflect. The listening file has its own camera motion and removes the NPC for the solo comparison.

On the moving covered two-voice workload, median stage times were 1.35 ms for synthesis, 0.87 ms for candidate geometry, 1.99 ms for visibility, 0.24 ms for selection, 0.12 ms for path application and 1.48 ms for stereo mixing. Across that interval the maxima were 100 proposals, 49 eligible paths, 46 selected and 46 applied. At five covered voices, visibility was the largest measured median stage at 3.07 ms, followed by synthesis at 2.82 ms. These five-voice figures cover eleven stationary blocks.

Reusing each segment direction across the spatial index preserved the hit and uncertainty records on 1,650 measured queries. Sampling position during emission-time iteration reduced median candidate preparation from 1.944 to 1.293 ms in a paired ten-emitter test. The accepted emission still uses the full pose and the existing discontinuity checks. All 15,000 compared preparations matched.

A separate hardware test on the RTX 2080 Super measured the existing DirectCompute path over 51 actual ray segments and 892 retained supports. All 48 dispatches matched the CPU result. Complete median times were 0.812 ms on CPU and 0.809 ms through DirectCompute. The GPU round trip took 0.464 ms, including 0.014 ms of shader execution. These measurements keep the existing automatic crossover in place.

The offline comparison establishes which paths changed PCM. Audibility on headphones, placement in the running game, default-output latency and sustained Story Mode playback still need a drive.

The [five-vehicle traffic measurements](FIVE_VEHICLE_TRAFFIC.md) follow the same exit with independent vehicle lifetimes and a clocked output recording.

## First Story Mode listening pass

On a stock ADDER with the Bati replacement active, the listener heard a tunnel-like reflection under cover and found the replacement too quiet. A retained live-camera mixer snapshot near the passage mouth confirmed four single reflections and a two-bounce exhaust path. The exhaust return arrived about 44.3 ms after its direct path. The available snapshots leave the mid-pass change in reflections unresolved.

Playback continuity did not pass. The first takeover returned to stock after producer starvation. The second returned to stock near the exit after a file-sharing error. Each return was issued once to the same vehicle. Both intervals had low sampled replacement levels, around −37 dBFS RMS in the producer's voice-mode stereo output. Those levels establish the replacement's digital output only. Relative loudness against the stock engine remains unmeasured.

## One-car continuity retest

Holding the progress file open without delete sharing reproduced a playback failure on the staged host. The updated host preserves the original freshness deadline and publishes atomically to an alternate slot when a sharing violation blocks the primary slot. The switch verifies the session and host identity on both slots. Optional evidence failures are recorded separately from control publication failures. The callback records a bounded in-memory trace of credits, delivered blocks, and ring depth. File and trace evidence is retained off the callback.

The original 224-frame live underflow could not be reproduced on the reconstructed moving-camera route. A development run did expose a separate cold producer stall before the first geometry publication. The previous callback left 64 frames, and the next producer block missed that callback. The one-car source and renderer now warm before playback, and the producer prepares optional SoundMap geometry only when a viewer is available. The acoustic path solver, gain, latency budget and freshness limit are unchanged.

| Device-free reconstructed drive | Time in timed phases | Underflow frames | Longest gap after fresh resume | Render misses at 10.67 ms | Unexpected stock returns |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold | 128.48 s | 0 | 0 frames | 0 | 0 |
| Warm with file contention | 128.50 s | 0 | 0 frames | 2 | 0 |

The warm run survived 247 blocked primary publications with Windows error 32. Both runs sampled separate direct and reflected pressure and confirmed applied paths through third order while the camera moved. A separate owned-host disconnect restored stock exactly once. The reconstructed fixture crossed the same mapped opening in both directions. The root cause of the earlier live underflow and continuity on an actual WASAPI endpoint still require a live drive.

## Live continuity retest

The one-car candidate ran in Story Mode for about 265 seconds between the audible handoff and the mute request. The listener could hear a difference in reflections between the covered passage and the open side. Replacement loudness remained too low for the listener. The applied-path trace retained up to three bounces. It reached its 512-record limit before mute. No file-publication error was reported.

The endpoint went short by 96 frames about 21.8 seconds after mute was confirmed. Two preceding 480-frame callbacks reduced the ring to 384 frames. The host flushed the next credit batch 13.33 ms before the failing callback, the producer observed it 5.15 ms before the callback, and the next block had not been admitted when the callback ran. The measured interval identifies a late delivery across the credit and render path. Its precise cause remains unresolved. Recovery returned stock exactly once on the same car. The run ended before resume.

## Bati exhaust and limiter

The one-ADDER development voice now gives the Bati exhaust more pressure on a hard rev and more reach under load as the camera moves away. The exhaust still radiates toward the rear. Distance and air loss still reduce its level and high frequencies. The gameplay master and output level are the same in both comparison takes.

Some live rev observations held a normalized ceiling of 1.0, while others contained genuine dips. The Bati voice follows those dips. A sustained ceiling now produces alternating firing cuts and recoveries with a small change in the grain target. Both engine and exhaust are shaped before propagation, so a wall return follows each cut at its existing path delay. The input is an observed rev ratio. Throttle demand and the firing schedule are inferred for this voice.

In a matched offline render, exhaust RMS rose by 4.8 dB on a covered blip at 3.35 model metres. On the open-road pass it rose 8.9 dB during the pull at 19–21 model metres, and 7.7 dB during held revs at 35–45 model metres. The measured idle level was unchanged at both camera placements. The covered comparison admitted the same number of paths before and after the change. Both the close render and a separate five-voice mix finished without clipping or mixer limiting, with peaks of −15.5 and −14.3 dBFS respectively. The five-voice mix skipped more paths to stay within its existing headroom budget.

The one-car host also passed a short device-free moving-camera check with mute, resume and a separate same-car stock recovery after host loss. The relative balance against native game sounds, the limiter by ear in Story Mode and the earlier muted starvation remain open.

## Live Bati voicing follow-up

The revised voice stayed active for about 123 seconds through a covered rev, an open-road pull and a distant cinematic shot. The listener still found the replacement too quiet. The sampled replacement output was −30.7 dBFS RMS, with an endpoint peak of −12.2 dBFS and no renderer limiting. The recording had a single stereo mix, so the relative level against the stock powertrain remains unmeasured.

The rendered camera reached about 132 model metres from the exhaust at 80 degrees off the rearward exhaust axis. Close to that point the host sampled the direct replacement near −56.5 dBFS with no reflected signal. This shot reached well beyond the 45-metre offline audition. Under cover the selected rev ratio reached the limiter range for several seconds and fell below it afterward. The live trace did not retain individual firing transitions, and the listener gave no separate verdict on the limiter rhythm.

The endpoint reported zero ring underflow and the stock return was requested once after normal withdrawal. The output gate separately substituted 52,416 frames in the audible revision. The longest reported run was 6,656 untagged frames, or about 139 ms. That counter is separate from underruns and does not establish how many interruptions the listener heard.

## Exhaust balance at cinematic distances

The one-car development package can select the previous Bati voicing, a road mix or a louder alternative. Both new mixes shape the loaded exhaust from the existing grain waveform. A band-pass contribution gives the firing pulses more body, and a fast envelope adds attack when a pulse rises above its local average. The body radiates more broadly than the upper exhaust note. For reflections the solver uses the direction of the first leg leaving the tailpipe. Distance still reduces level and high-frequency detail.

The high cinematic shot was about 132 model metres from the old rendered exhaust and 80 degrees off its axis. The vehicle bridge had taken the native matrix's right vector as the forward vector. On the highway that axis was nearly perpendicular to the direction of travel. Reconstructing the physical tailpipe puts the camera about 131 model metres away and 20 degrees off the rear axis. The bridge now reads the native outputs in forward, right, up, position order. [Native signature](https://github.com/citizenfx/natives/blob/master/ENTITY/GetEntityMatrix.md)

The matched cinematic comparison preserves the old rendered bearing. At the observed rev ratio of 0.945, settled exhaust RMS measured −58.0 dBFS with the previous voicing, −26.8 with the road mix and −19.4 with the louder alternative. All three used the same source performance and playback gain. The highway chase comparison uses the reconstructed rear axis. Headphone balance against live game traffic still needs an attended drive.

The mixer reserves pressure for ordinary paths before sharing the remaining headroom across boosted exhaust returns. A bounded producer report records each retained firing cut and catch with its source and producer sample positions. This makes the limiter schedule observable beyond the initial high-rev diagnostic window.

In the covered reconstruction all three mixes admitted every path across 18,443 offers. At the held rev the exhaust retained four first-order returns, four second-order returns and two third-order returns. The road mix also blends some original exhaust pressure back in as a hard rev settles, giving the opening blip more contrast against the held note.

## Live road mix test

The one-car road mix was prominent during the covered blip and audible from the high cinematic camera. The listener found the playback choppy and unnatural, with smoother sound as the camera receded. The limiter was difficult to distinguish by ear.

The farthest rendered camera sample was about 174 model metres from the corrected tailpipe at 11 degrees off its rear axis, with a selected normalized rev ratio of 0.873. The nearby producer sample measured −27.4 dBFS direct with no admitted reflection. Under cover the mixer applied paths through third order. The producer recorded 37 firing cuts and 37 catches. The live recording has a single mixed audio track, so it cannot isolate the replacement or identify the cause of the choppiness.

Road stayed active for 112.8 seconds. The endpoint peaked at −8.2 dBFS, with zero renderer limiting, ring underflow and stale PCM frames. The output gate substituted 58,880 frames. Its longest reported run was 9,216 untagged frames, or 192 ms. The switch withdrew Road after host output progress expired and restored the stock ADDER once on the same car. The timeout and the driver's report of unnatural playback remain unresolved.

## Reproducing the Road interruptions

Two independent offline tests reproduced defects. A small below-limiter rev variation repeatedly switched the dry source into its deceleration grains and withdrew Road's loaded exhaust shaping. The same input went from a 12.81 dB spread in 20 ms exhaust levels to 1.31 dB once a cumulative decline was required to classify lift. Pitch still follows the observed ratio. The limiter selects the same cut and catch samples, and a sustained lift still drops the exhaust level.

An abrupt far-camera cut also discarded the emitter's pressure history. A controlled render at 174 model metres lost about 492 ms of nonzero reference audio before the host. A separate clocked reproduction expired the stock-switch progress lease after the submitted observation sequence stalled. The private one-car path now reseats the listener's arrival cursors while preserving the continuing emitter's history. A fresh control lease can identify a silent block. Nonzero audio remains required for engagement, and retiring a source or changing the output revision still discards its old pressure.

The far highway witness had no admitted reflected paths and no qualified collision in the listener's local workset. The measured position was also outside the installed service's source request range on one axis. That shot retains distance, radiation and air loss. A matched covered-to-open reconstruction admitted finite wall returns under cover and reduced reflected energy past the opening while the direct signal continued.

The device-free fixture can retain paired PCM before and after the host gate with producer block offsets, deadlines and substitution reasons. The switch records the accepted publication and individual progress fields at withdrawal. The original drive lacked synchronized PCM at those boundaries, so the exact lost audio in its longest substitution interval remains unidentified.
