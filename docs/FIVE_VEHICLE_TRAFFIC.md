# Five vehicles through a mapped passage

Five independently moving vehicles completed a 29 m exit through installed exterior collision with the full reflection model. A warm device-free recording retained all 995,520 stereo frames the Windows host consumed over 20.740 seconds. It had zero ring underflow, 15 complete-render deadline misses and 19 misses through submission to the host pipe. Measurements use 48 kHz stereo, 512-frame producer blocks and the original 10.67 ms block deadline.

## What reached the output

The lead uses the Bati player bank. Four independent voices use the separate Bati traffic bank, with different positions, revs and lifetimes. At 10.240 s in the capture, the lead exhaust reaches the roadside listener after striking a side wall, the canopy and the opposite wall. At 10.581 s the lead engine has a two-wall return on the right. At 12.971 s removing any of the five contributions changes the actual stereo sample. Motion and revs are authored, the finite collision faces come from installed data decoded with CodeWalker by dexyfex, and the material losses are assumptions.

One sample per producer packet was reconstructed from the post-delay path terms and checked against the consumed WAV. All 1,945 comparable probes matched. At 481 probes all five voices were moving with a multi-bounce contribution. The largest number of nonzero reflected terms at one probed sample was 63. The recorded map contains 120 observations. Each observation is tied to its original 512-frame output packet by hash. Between observed blocks the viewer withdraws the rays.

After one vehicle left, its old generation contributed a release at two probes. The four survivors continued through 82 probes before a new generation occupied the recycled slot. The full-detail file render additionally recovered all six lifetime stems. Silencing the old generation's entire dry history left every stereo sample after reacquisition unchanged. That file reproduced byte for byte when the same five-vehicle inputs were fed to the renderer from `1fb13f2`.

All 7,631 sampled source contributions in the captured run had traceable dry-source lifetimes. Of these, 7,629 stayed inside every contributing observation's 250 ms cutoff through callback completion. Two had reflected pressure beyond the cutoff at callback start, by 0.600 ms and 0.443 ms. Their controls were eligible at selection. The measured delay includes time in the acoustic path and the output ring. The witness describes sampled output rather than every intervening stereo frame. The separate live switch remains limited to one known-stock ADDER.

## Where the output first fell behind

On the original cold five-car run, five direct voices were present at block 63. The first full installed scene arrived at block 236, about 1.85 seconds later. The new scene contained 1,205 faces and 74 paths reached the mixer. That block took 28.72 ms, of which propagation accounted for 21.11 ms. Two subsequent blocks also exceeded budget. The preceding callback left 64 frames in the ring. One new 512-frame packet brought that to 576 before the next callback requested 960. The resulting shortfall was 384 frames, or 8 ms.

A separate cold test using the original production code and the new five-car exit reproduced the failure before motion. Its first 68-path installed block took 30.65 ms. The updated renderer took 14.93 ms for the same initial path count and completed the route without underflow.

Sharing a compact spatial index between emitters approximately halved median full path-solving time across four paired passage windows. With ten engine and exhaust emitters, median times changed from 7.78–9.17 ms to 4.14–4.60 ms per block. The 1,440 matched blocks preserved the individual finite contacts, delays, gains and selected routes. Reusing interpolation brackets and rejecting disjoint segment bounds also reduced the median in a later 800-block comparison by 19–33% relative to its then-current baseline. These timings cover the propagation stage only.

For a stationary roadside camera, renewals can also share the existing finite workset when its clipping cube, data bindings and uncertainty remain valid. The worker still computes the current emitter routes. Across paired workset renewals, median producer unpacking and adoption fell from approximately 29 ms to 0.6–0.8 ms. The first publication still pays for the full geometry. A moving driver camera can change the clipping cube and force another full publication.

The automatic backend retained the CPU. On the RTX 2080 Super, one actual 208-leg, 1,380-face batch took a median 2.070 ms on the CPU and 1.816 ms on DirectCompute including submission, synchronization, readback and CPU refinement. The 95th percentile was slower on the GPU for each of the four measured windows. The audio callback remains independent of GPU completion.

## Listening to distance and surface finish

The engine already uses recorded grains. A separate steady-rev pass isolates air loss from Doppler and emitter direction. Under the existing authored distance profile, measured 4–16 kHz energy relative to 45–400 Hz was about 2.7 dB lower than the default air-loss control in the far approach window and 0.3 dB lower around the pass. At comparable distances on either side, the rear-facing exhaust gained about 5.2 dB after passing. That direction-dependent gain applies to the exhaust as a whole. Real vehicles vary with source placement, speed, load and tyres. [FHWA propagation guidance](https://www.fhwa.dot.gov/ENVIRonment/noise/noise_barriers/design_construction/design/design03.cfm) · [Measured road vehicle directivity](https://pubmed.ncbi.nlm.nih.gov/40214263/)

The optional surface treatment reduces the coherent pressure of a reflection according to its incidence angle, wavelength and assumed RMS surface height. A matched pass with 12 mm of RMS height variation retained every direct control and the same selected path identities across all 750 blocks. Compared with the original, the isolated reflected signal lost 0.10 dB in the 45–400 Hz band and 2.92 dB at 4–16 kHz. The model does not synthesize the scattered diffuse field. The recorded full-quality clocked runs used the original smooth-surface assumption and gain. [Coherent reflection formulation](https://kerednoslo.github.io/papers/Olson2023.pdf)

## Clocked performance

The table shows complete producer times for uninstrumented runs. The all-moving column uses blocks on which every requested vehicle moved with an admitted multi-bounce route. Whole-run misses include startup, partial population, scene transitions and the final return to rest. A miss can consume already available audio without making the output ring run short.

| Five-vehicle workload | Whole render p50 / p95 / p99 / max, ms | All-moving multi-bounce render p50 / p95 / p99 / max, ms | Whole render / through-write misses | Longest run of render misses | Missing output frames |
| --- | --- | --- | ---: | ---: | ---: |
| Full, cold exit | 5.89 / 7.88 / 9.31 / 14.93 | 6.81 / 8.02 / 10.07 / 12.04 | 6 / 7 | 2 | 0 |
| Full, warm exit | 5.46 / 8.52 / 9.48 / 11.59 | 6.76 / 8.58 / 9.27 / 10.11 | 2 / 4 | 1 | 0 |
| Full, captured exit | 5.30 / 8.62 / 10.29 / 13.04 | 6.73 / 8.81 / 10.85 / 13.04 | 15 / 19 | 2 | 0 |
| Full, 60 s covered, underflow | 6.91 / 9.53 / 11.28 / 14.32 | 7.58 / 9.66 / 11.89 / 14.32 | 31 / 36 | 7 | 256 |
| Full, 60 s covered, repeat | 7.33 / 9.27 / 10.13 / 18.51 | 7.49 / 9.34 / 10.20 / 18.51 | 35 / 42 | 4 | 0 |
| Full, 120 s covered | 7.34 / 9.38 / 10.36 / 17.26 | 7.43 / 9.42 / 10.43 / 17.26 | 86 / 109 | 4 | 0 |
| Ranked, 120 s covered | 5.77 / 7.13 / 8.86 / 19.81 | 5.83 / 7.15 / 8.92 / 19.81 | 16 / 19 | 2 | 0 |

On the 29 m exit the full renderer finished two cold and two warm runs without underflow. The clocked listening capture adds diagnostic work and is reported separately. On a continuously covered five-vehicle route the full renderer completed a 60-second cold run and a warm repeat. Another warm run starved at output frame 1,124,864. Seven consecutive over-budget render blocks included synthesis at 3.75–6.74 ms, propagation at 3.95–6.08 ms and stereo mixing at 2.38–3.04 ms. Scene adoption during those blocks took less than 0.05 ms. The callback requested 960 frames and found 704. That 256-frame shortfall was 5.33 ms.

The full-detail path also completed a 120-second covered run with no underflow. Geometry stayed active on 11,015 blocks with all five vehicles moving. On 10,972 of those blocks, at least one second- or third-order path reached the mixer. There were 86 render and 109 through-write deadline misses. Four full-detail vehicles completed two shorter covered repeats without underflow as well. These are measured workload limits on this machine; an individual successful run does not certify hard real-time delivery.

A separate traffic setting ranks a small number of candidate routes independently for each emitter and still validates the complete finite geometry and visibility of every selected route. It completed a warm 120-second covered run with zero underflow and 16 whole-run render misses. A cold covered attempt underflowed. In the matched five-car file comparison the ranked setting omitted the lead's right-hand two-wall engine route at 0.853 s, retained the wall–canopy–opposite-wall exhaust witness and ended the lead's higher-order tail 64 ms earlier. Direct playback ended at the same sample. The standard listening file and the headline clocked capture use full detail.

## Scope

The earlier 25-second matched passage file and its two-car and stationary-camera references reproduced without sample changes. The staged single-ADDER package remains at `1fb13f2`. The observed listener in the timed traffic recording stands beside the road. A Story Mode driver hears the result from the actual game camera, whose position can also require new geometry. Vehicle observations, game performance and physical audio output in a live traffic scene still require separate qualification.
