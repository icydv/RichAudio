# LATENCY-02: shared output periods and callback scheduling

I want the event path to reach the next writable output buffer without waiting behind pre-generated continuous PCM. A nearby verified observation-to-WASAPI-submission target of 20–30 ms is an engineering target, not a measured input-to-ear result. Codex reviewed the current Windows APIs on 2 November 2026. No endpoint was enumerated, activated, queried or started for this research.

The existing route uses a dedicated STA thread, shared 48 kHz stereo Float32, event notification and `GetCurrentPadding`. Its current `IAudioClient.Initialize` requests 200,000 100-ns units of buffer duration; that request is not an observed engine period. It records the returned buffer size, period, stream latency, callback frame extrema and wake intervals. The output thread already joins MMCSS task `Audio` and reverts it on the same thread. This increment does not change that route, its gains or the Windows format.

## Supported API route

[`IAudioClient3.GetSharedModeEnginePeriod`](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient3-getsharedmodeengineperiod) reports default, fundamental, minimum and maximum periods in **frames** for a specified format and client properties. A requested period must be an integer multiple of the fundamental within the returned range. The fundamental is not necessarily the minimum. No fixed 1, 3 or 5 ms capability follows from Windows version or an API declaration.

[`InitializeSharedAudioStream`](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient3-initializesharedaudiostream) selects a shared period and computes its buffer from that request. Supported stream flags include event notification. Initialization can reject format, period, locked format/period, unavailable device or excessive processing cost. Lower callback periods do not remove the application's scheduling work or samples already committed to the engine. No initialization fallback is exercised here.

[`GetCurrentSharedModeEnginePeriod`](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient3-getcurrentsharedmodeengineperiod) can inspect the current format/period, but another client may change them immediately. A later separately authorized experiment should preserve HRESULTs and both requested and observed settings. It should retain the original shared route if a new interface/format/period cannot be qualified, rather than taking exclusive ownership of GTA's endpoint or silently changing sample format.

Microsoft's [low-latency overview](https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/low-latency-audio) distinguishes engine, driver, APO and hardware stages. Driver-supported smaller buffers are conditional capabilities. The nominal event budget should end at the actual `ReleaseBuffer` submission bracket; endpoint padding/presentation and physical output remain additional, separately measured scopes. Existing device-free frame maps do not measure those stages.

## MMCSS and callback work

[`AvSetMmThreadCharacteristicsW`](https://learn.microsoft.com/en-us/windows/win32/api/avrt/nf-avrt-avsetmmthreadcharacteristicsw) associates the **calling thread** with a named task and returns a handle or failure. `Audio`/`Pro Audio` are documented [MMCSS task categories](https://learn.microsoft.com/en-us/windows/win32/procthread/multimedia-class-scheduler-service), not guaranteed wake times. The existing `Audio` registration is already useful evidence of the chosen policy; moving to `Pro Audio` is a hypothesis requiring load measurements, not a known latency saving.

[`AvSetMmThreadPriority`](https://learn.microsoft.com/en-us/windows/win32/api/avrt/nf-avrt-avsetmmthreadpriority) changes relative priority within that task; setting it to critical cannot make unbounded work safe. [`AvRevertMmThreadCharacteristics`](https://learn.microsoft.com/en-us/windows/win32/api/avrt/nf-avrt-avrevertmmthreadcharacteristics) must run on the registering thread. Any future experiment should preserve registration/revert results and failures, without registry edits, process-wide real-time priority or a timer-resolution change disguised as event timing.

My recommended split keeps acquisition, validation, clock mapping, sound/kernel preparation and geometry outside the callback. The callback consumes bounded, preallocated descriptors and already prepared PCM, mixes into the buffer it owns before release, and retains the existing continuous stream and post-mix capture boundary. It must not wait on a worker, allocate, log to a file, load a source, solve geometry or retry a late event. A bounded overflow/late policy must report rejected events rather than fabricate an earlier occurrence or overwrite queued ownership.

## Delay audit and next evidence

| Stage | What can be avoided in the event path | What remains bounded or unavailable |
| --- | --- | --- |
| Source occurrence → observation | A verified event facility could avoid polling cadence | Current Enhanced/RPH occurrence time and complete gunshot multiplicity are unavailable; a receipt bracket is not an event timestamp. |
| Observation → prepared event admission | No 75/100 ms camera-history wait or continuous-PCM FIFO is required for an independently qualified transient | Event identity, sequence, clock uncertainty, scene generation and bounded transport/preparation still require validation. |
| Physical propagation | Do not add the direct distance twice when a kernel already includes it | Qualified geometry determines direct travel time and extra reflected distance. Unobserved installed geometry is not fabricated. |
| Callback scheduling | A prepared event can mix into the next writable owned buffer | Wake phase/jitter and already submitted endpoint padding remain. A smaller supported period can reduce opportunity spacing, not prove a speaker result. |
| New reflection/obstruction solution | Keep direct/event admission separate from worker completion | Use only a qualified retained scene/kernel with explicit validity; missing or stale results need an honest fallback, not a heavy callback query. |

The next authorized device experiment would first query the exact endpoint/format/client properties, then compare the current route against a supported shared period. It needs callback/padding and observation/admission/submission brackets, p50/p95/p99/max, adverse scheduling, simultaneous continuous/event playback, underflow, overload rejection, post-mix headroom and cleanup results. No fixed polyphony target or endpoint period is inferred from this research. The current offline implementation's explicit capacity limits are implementation limits, not endpoint or 20–30 ms acceptance facts.

The primary documentation snapshots are pinned to MicrosoftDocs `sdk-api` commit `656e9656bfaef34dd29cd7ee9e1146aec17e924c` and `win32` commit `ca8274decead49403d70ceeed4af8d4ca74eaf11`; the exact researched files and hashes are in [the research evidence](../evidence/latency-02-acquisition-research.json). Future queries, playback, deployment or native suppression require separate authorization. No such action is approved by this document.
