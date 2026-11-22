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
