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

The device-free Windows host used 48 kHz stereo, 512 frames and a 10.67 ms deadline. Times below cover whole producer blocks with installed geometry and the requested voice count. The misses column counts every producer block in the run, including startup and workset changes. These measurements used source revision `411789e`.

| Route and voices | Installed blocks | Median / p95 / maximum, ms | Whole-run render misses | Ring underflow frames |
| --- | ---: | --- | ---: | ---: |
| Covered, one | 2,465 | 2.74 / 3.77 / 18.63 | 1 / 2,700 | 0 |
| Covered, two | 2,459 | 5.98 / 7.63 / 20.11 | 7 / 2,696 | 0 |
| Covered, five | 5 | 13.79 / 33.22 / 33.22 | 3 / 237 | 192 |
| Passage exit, two | 727 | 4.81 / 7.30 / 20.64 | 3 / 969 | 320 |
| Passage exit, two, repeat | 705 | 4.81 / 7.14 / 20.11 | 3 / 947 | 64 |

One moving voice met the deadline on all 569 covered blocks, with a 7.47 ms maximum. Two moving voices missed two of 569. The two-voice covered run completed without starvation. In both exit attempts the ring ran short around a larger geometry publication. The respective worker-to-producer handoffs took 42.50 and 50.69 ms. How much time went to scheduling, deserialization and garbage collection within that interval remains unresolved. Two staged five-voice attempts also ended before five moving voices reached the installed scene. An earlier build rendered 27 five-voice moving blocks with third-order paths at a median 11.81 ms. Five-voice real-time playback remains unqualified.

On the moving covered two-voice workload, median stage times were 1.54 ms for synthesis, 0.84 ms for candidate geometry, 1.83 ms for visibility, 0.23 ms for path selection, 0.16 ms for application and 1.15 ms for stereo mixing. Across that interval there were at most 104 proposals, 47 eligible paths, 45 selected and 45 applied. Those values are maxima across blocks.

Reusing each segment direction across the spatial index preserved the hit and uncertainty records on 1,650 measured queries. Sampling position during emission-time iteration reduced median candidate preparation from 1.944 to 1.293 ms in a paired ten-emitter test. The accepted emission still uses the full pose and the existing discontinuity checks. All 15,000 compared preparations matched.

A separate hardware test on the RTX 2080 Super measured the existing DirectCompute path over 51 actual ray segments and 892 retained supports. All 48 dispatches matched the CPU result. Complete median times were 0.812 ms on CPU and 0.809 ms through DirectCompute. The GPU round trip took 0.464 ms, including 0.014 ms of shader execution. These measurements keep the existing automatic crossover in place.

The offline comparison establishes which paths changed PCM. Audibility on headphones, placement in the running game, default-output latency and sustained Story Mode playback still need a drive.
