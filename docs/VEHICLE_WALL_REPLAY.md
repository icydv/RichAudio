# A moving vehicle beside a finite wall

The private stereo comparison uses the retained Bati engine and exhaust with an ADDER player identity. The vehicle trajectories and listener placement are authored. The finite collision surface and the sampled floor underneath the two centerlines come from the installed Enhanced catalogue, using CodeWalker by dexyfex. The cache covers part of the exterior. Its offline coordinates and ray tests do not establish live placement, road access, wheel contact, or runtime activation.

## What the comparison changes

The file renderer uses the same stock voice registry, gameplay renderer, path solver and stereo mixer as the integrated producer. The two takes have identical dry source PCM, direct-path controls, motion, listener and master gain. The second take enables one first-order wall reflection. The WAVs keep their original relative levels. SoundMap uses the sampled solver paths that contributed to the mix and follows the rendered sample clock.

At the selected moving-engine instant, the direct path is 2.167 model metres and the wall path is 5.281. Their predicted excess travel time is 9.079 ms. At the end of that block the smoothed renderer taps differ by 9.061 ms. The reflected pan is −0.956 and the direct pan is −0.625. The reflected low-band gain is 0.142 against 0.423 direct. Thus the added energy lies further left, and at this delay it can change timbre and localization. A separate fixed-position impulse measured 9.125 ms against a 9.106 ms prediction. Removing the selected polygon withdrew its reflection and preserved the direct solve.

The second comparison adds an independently moving Bati NPC using the retained NPC bank. Its revs increase and it retires at 3.712 s while the ADDER continues. The ADDER's dry PCM matches the solo take sample for sample. The residual between the mixes has RMS 0.01384 immediately before retirement, 0.00234 over the following four blocks, and zero in the sampled window 128 ms later. The replay binds each individual WAV and timeline to the render receipt, including the exact solver frame at the bounce.

## Clocked fleet results

The device-free host consumed 48 kHz stereo in 512-frame blocks, with a 10.67 ms render deadline. The table groups complete producer times by the actual number of voices with the selected wall present. The whole-run counts also include cold startup and direct-only blocks.

| Voices | Reflected blocks | Median / p95 / p99 / maximum (ms) | Reflected misses | Whole-run misses | Ring underflow frames |
| ---: | ---: | --- | ---: | ---: | ---: |
| 1 | 2,240 | 2.19 / 3.30 / 3.96 / 10.08 | 0 | 1 | 0 |
| 2 | 2,377 | 3.42 / 5.10 / 6.02 / 11.43 | 1 | 2 | 0 |
| 5 | 961 | 7.80 / 11.85 / 13.79 / 16.89 | 106 | 109 | 0 |

At five reflected voices the largest median stage was stock synthesis (3.55 ms), followed by propagation (2.98 ms) and PCM processing (0.98 ms). Resolving grain readers and pressure shares once per block preserved PCM and source statistics across 800 matched blocks. In the paired warm-five run, synthesis median fell from 3.90 to 3.58 ms. Both warm runs still starved the sink (64 and 192 frames respectively). A separate fresh-contributor run recorded zero pre-mix stale declines at each population. Its five-voice run stopped after seven reflected blocks with 64 frames of ring underflow. Post-mix stale PCM substitution by vehicle is unmeasured in the ordinary fleet sink.

The offline renderer produced two independent audible tracks in one mix and rendered as many as five active voices in the clocked workload. Two completed the clocked workload without starvation, with a reflected deadline miss in the timing run. Five remain unqualified for sustained real-time playback. The fleet wire accepts up to 32 observations per frame. The live switch still observes and takes over one validated running ADDER. An unrelated vehicle's observation cannot authorize its PCM or a native audio assignment.

## Motion and live scope

The earlier live return to stock after 5.17 s had no per-pose trace. An authored 30-native-unit/s camera movement reproduced the rejection in the actual producer when successive selected poses spanned 68.56 ms and the renderer advanced one 10.67 ms block. The old check calculated 192.82 units/s. The private path now validates raw acquisitions and sampled motion on their respective clocks. It preserves the speed bound and reports track, identity/generation, observation time and render time on a discontinuity. Normal moving playback, declared camera and vehicle cuts, removal and genuine undeclared teleports were exercised offline. The historical failure's exact track remains unknown.

The opt-in one-car package admits retained exterior work through the installed scene service. The ordinary one-car configuration keeps its original direct path. Only one validated vehicle can use the private output tag. A live drive still needs a new approval, successful source and endpoint readiness, verification of world coverage at the driving location, and a listener's judgment.
