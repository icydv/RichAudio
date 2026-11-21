# One-car powertrain output continuity

On the first live drive at `ab6632b` I heard the Bati voice respond to the ADDER's revs. I heard no engine or exhaust with RichAudio muted. I described the resumed voice as choppy and sounding heavily clipped. OBS was closed. The host received no ring underflow and recorded 1,189,760 stale frames across the whole session.

## What the live counters locate

These are deltas between the recorded handoff transitions. A rendered block contains 512 frames. A qualified submission counts PCM that passed the source gate even when the sink gain was zero. The two counters sit on opposite sides of the ring, and snapshots can include queued audio at either boundary.

| Interval | Seconds | Source-tagged blocks rendered | Qualified frames submitted |
| --- | ---: | ---: | ---: |
| Initial voice acknowledged to first mute request | 331.79 | 31,072 | 15,849,088 |
| First mute acknowledged to resume request | 72.54 | 6,798 | 3,421,056 |
| Resume acknowledged to second mute request | 57.42 | 5,385 | 2,466,944 |
| Second mute acknowledged to stock-return request | 63.20 | 5,924 | 2,244,800 |

At the complaint snapshot the cumulative stale count was 401,376. Another 788,384 accumulated by withdrawal, mostly over the following muted interval. A separate three-second muted sample accrued 36,448 stale frames. Muting continued to consume and qualify source PCM. The live files did not retain individual block arrivals, ring publication times, the duration of audible gaps, or an audio recording. The snapshot peak of 0.02498 is a single post-gain measurement. It cannot establish the peak over the drive. Numeric saturation remains unconfirmed.

## How a block gets its deadline

1. On a supported script callback, `PowertrainFrames.Capture` timestamps the camera and vehicle acquisitions on the Windows monotonic performance counter. The deadline is the earlier acquisition midpoint plus one quarter of `Stopwatch.Frequency`. This run reported 10,000,000 ticks per second. The vehicle ID binds the switch generation; gain changes carry a separate increasing revision.
2. The host accepts a current, same-lifetime gameplay frame and indexes its original stamp by listener observation sequence. Its control message carries observation age and remaining lease in milliseconds. Node uses those durations and its own monotonic clock for admission. The gameplay interpolator maps observations into the renderer's 48 kHz audio timeline. Node milliseconds, Windows QPC ticks and sample indices have different origins.
3. The engine can interpolate the operating point and pose using adjacent observations. The older contributing vehicle supplies the source sequence and revision. The private RA07 block carries that sequence plus one; zero means no qualified source tag. After the pipe read the host looks up the **original** observation stamp. Rendering and resume do not renew its deadline.
4. The output callback compares its current Windows QPC tick with that absolute deadline. A current-revision slot can therefore arrive populated and still expire before output. For expired, untagged or prior-revision data the host consumes the slot with zero gain and submits zero-valued samples in its place. Alternating real waveform and zero can interrupt the note and create abrupt edges even with a full ring. A gain revision also flushes delayed source history and resets and primes the WASAPI endpoint with silence before new-revision output is admitted.

The resumed revision can inherit an **aged observation mapping**. The first qualifying audible block must still have a source stamp from the new revision. The retained counters cannot show whether a particular live block arrived late from Node or expired while waiting in the ring. They cannot distinguish those explanations by listening quality alone.

## Reset and resume in the one-car path

The original interpolation query advanced with the number of PCM frames the renderer produced. A WASAPI stop/reset/silent prime advances elapsed time while a boundary callback consumes no ring PCM. Changes in credit lead also change how far the renderer frame counter runs ahead. Keeping that counter as the clock for the control query can select an older observation even after the new gain revision has been acknowledged.

The private control query now advances on elapsed monotonic time anchored to the accepted observation timeline. It looks back 50 ms for interpolation and caps the camera and vehicle queries separately at their respective latest arrived observations. The two acquisitions have distinct timestamps even in the same game callback. Inside an interpolation interval the block still carries the older contributing sample's tag. At an arrived endpoint it can use that genuine sample with its original deadline. The private host retains eight startup credits and retires two after source preparation. Ordinary gameplay timing, the 250 ms source lease and the endpoint reset are unchanged.

The device-free fixture ran the real host and producer with retained Bati material. It offered the same authored callback schedule to both builds (50 ms intervals with 90 ms every ninth tick), changed revs while muted, and modeled one 20 ms silent prime per output boundary. The live run had no per-callback driving trace to replay. A completed baseline and corrected run each delivered 117 observations over approximately 7.65 seconds of sustained resumed playback.

| 48 kHz output measurement | Tested baseline behavior | Corrected replay |
| --- | ---: | ---: |
| Stale frames in the sustained resume window | 232,128 | 0 |
| Longest consecutive substitution after the first qualified resumed output | 3,840 frames (80 ms), expired in the ring | 0 frames |
| Longest consecutive substitution including the guarded transition | 9,280 frames (193.3 ms), previous revision | 4,928 frames (102.7 ms), previous revision |
| PCM ring underflows | 0 | 0 |

The explicit endpoint prime is separate from those gate counts. Some baseline runs returned to stock early when progress expired. In the completed baseline, revision 4 block 1453 used observation 254. It was 216.871 ms old at payload receipt, spent 0.0021 ms before ring publication and 59.982 ms in the ring. At 276.855 ms it was replaced with zeros. Corrected revision 4 block 1404 used observation 247. It arrived at 94.683 ms, spent 0.0025 ms before publication and 29.184 ms in the ring, and was accepted at 123.869 ms. All these durations come from differences on the 10 MHz host QPC. They end at the output decision and do not measure speaker latency.

Mute now completes when the endpoint has reset **and** a fresh muted-revision block has been submitted. A reset previously could acknowledge mute while progress still described the prior voice revision. The real-process fixture also checks that muted output stays silent, resume accepts the updated operating point with no extra GTA assignments, genuine observation expiry withdraws the voice, and release or owned-host exit results in exactly one stock return on the bound car.

For a live comparison, listen through the initial transition and then drive under varying load. A sustained gap labelled `StaleOnArrival` points upstream of the host PCM reader. `StaleBeforeEnqueue` points to host admission wait; `StaleInRing` identifies frames that reached the ring in time but lost their remaining budget there. For `Untagged`, check the producer's per-phase reason to separate unavailable listener or vehicle state from already-silent stereo PCM. If the gate shows continuous, qualified, nonzero output while I still hear breakup, investigate distortion and playback downstream of the measured decision.

## Level and high revs

In the live session I found the Bati voice much too quiet. The retained source bank's six engine and exhaust samples each peak near 0.794 full scale. The player source blends idle, acceleration and lift material with a retained source gain of 1.596. The acoustic renderer applies separate engine/exhaust pressure gains (0.25 and 2.5), source directivity, path attenuation, a gameplay master of 0.175 and the private output level of 0.8. The host voice gate is unity while open. The emitter offsets in this development voice are authored Bati offsets applied to the observed ADDER pose. The original session did not retain the modeled emitter-to-camera distances, phase-wide levels or my physical listening level.

A controlled render at normalized ratio 0.72 held the material and settings fixed. Dry engine/exhaust RMS was 0.139/0.322. Left-channel RMS was 0.0407 at an authored seat position, 0.0223 in close chase, 0.0118 in far chase and 0.00585 at the longest test distance. These authored positions exercise the near/far response. No renderer limiting occurred in the tested positions, and this comparison found no unintended scale factor. Gain is unchanged.

The live record has individual submitted ratios including 0.4473 near the complaint and 0.6367 at withdrawal. Neither is a high-rev trajectory. This Bati grain source smooths its operating point with a 40 ms time constant and has no authored limiter-bounce event. A sustained authored ratio of 1 settled at an engine interval rate of about 39.5 Hz. That explains steady output for steady input; the live data cannot tell why my sustained rev sounded steady.

In an approved drive, hold high revs for about three seconds while the voice is on. The private producer summary pairs the accepted raw ratios with the selected and smoothed ratios and grain rates, and retains sampled dry/stereo levels and direct-path distances by revision. Flat raw values direct investigation toward the getter or its sampling cadence. Variation lost at selection or after smoothing identifies the corresponding renderer stage. If interval rates vary but I still hear no limiter cue, inspect the retained material and its event coverage. Check the short-distance dry-to-rendered level and the submitted peak before changing gain.
