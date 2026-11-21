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
