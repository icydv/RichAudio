# LOW-LATENCY-01: an opt-in software age experiment

I now have a Bati-only opt-in profile that selects 75 ms of genuine observation history and reduces the prepared producer's credit window from eight blocks to six. Cold startup keeps the original eight-block reserve. The default remains 100 ms/eight blocks. This is an offline implementation, not a GTA or speaker-latency result.

The evidence supports a roughly 25 ms reduction in **observation selection age on the same constructed replay clock**, and a smaller measured ring residence in device-free playback. Actual wall-clock source-pose submission ages have varied in both directions between cold runs. I cannot claim a stable end-to-end improvement, the <100 ms/<30 ms stretch targets, or heavy-load safety.

## The selected profile

| Setting | Default / absent `latencyProfile` | Explicit `low-latency-01` |
| --- | --- | --- |
| Genuine retrospective control history | 100 ms | 75 ms |
| Cold startup | 8 × 512 frames = 85.333 ms capacity | Same |
| Prepared steady producer credits | 8 | 6 = 64 ms maximum outstanding block material |
| Physical SPSC ring | 8 slots / 32,768 PCM bytes | Same |
| Format, block size, WASAPI initialization | Existing 48 kHz stereo Float32 / 512 / shared-mode request | Same |
| Manifest eligibility | Existing supported packages | Strict `PLAYABLE-13`, one player Bati |

These capacity figures are not fixed measured queue delays. Six credits cover completed ring blocks, a partial block and work still in the producer/pipe; they do not create a second queue. The existing 500 ms worker status must first report nonzero engine, exhaust **and** stereo blocks. The host control worker then withholds exactly two returned credits, once. Until that evidence arrives, startup stays at eight. A missing status leaves the larger window intact. There is no arbitrary warmup timer, queue growth, automatic retry or recovery after underflow.

The manifest is owner/hash bound and accepts only named profiles. This does not expose a live delay slider or an environment override. The node credit parser retains the hard eight-block startup cap; the host enforces the smaller prepared window. A fresh owned host starts cold again. Other source banks and multi-vehicle cold admissions are outside this profile's validated scope.

## Where response time remains

| Stage | What the current route does | What this experiment changes |
| --- | --- | --- |
| Native getter and publication | Native operating evidence has before/after acquisition and mapped host-QPC bounds; publication cadence and scheduling are variable | Nothing |
| RPH pose, identity and handoff | Pose timestamps are distinct from the earlier native operating getter; the original 250 ms expiry/identity/generation checks still apply | Nothing |
| Host control worker | A latest-state slot can supersede an older frame; publication/credits signal the wait handle, with a 2 ms main loop | Nothing; the 20 ms `WaitOne` timeout is not an intentional per-packet wait |
| Listener/source selection | Samples only arrived, qualified history using the existing interpolation/forecast limits | 100 → 75 ms retrospective history; no future read or new prediction |
| Source response | `StockVehicleSource` smooths operating position/weights with a 40 ms time constant and running envelope with 25 ms; `StockGrainVoice.next` also smooths its state with 10 ms before the native PCM interval path | Nothing; these response time constants and grain phase are not fixed queues or additive latency measurements |
| Acoustic processing | Existing propagation, source phase, Doppler, direct/early paths, quality and gains | Nothing |
| Node/RA07 | Renders 512 frames (10.667 ms of audio), writes the packet, continues with `setImmediate` when credited | Smaller prepared credit window; no intentional producer sleep |
| Ring and submission | Original `TryWrite`/`FillCore` algorithms; real callback remains allocation-free with respect to this change | Retires two credits on the control worker; no geometry, metadata collection or new work in the real callback |
| Windows / device / speaker | Original shared-mode initialization and actual device scheduling remain | Nothing; physical input-to-ear latency is unmeasured |

The original live 146/204 ms newer/older **native operating endpoint ages at submission** remain a separate result. The 62.695 ms original mean ring residence was already included. Neither a configured 25 ms history reduction nor a measured ring reduction can be added to a source-age statistic a second time. The approximately 22 ms original shared buffer is not a known physical or speaker delay.

I did not query endpoints or try a smaller Windows period. `IAudioClient3` exposes endpoint/format-dependent minimum, maximum and fundamental periods; initialization uses the chosen period to determine the shared buffer and can reject unsupported, locked or excessive-CPU configurations. There is no offline proof of an accepted smaller period on this endpoint. [Microsoft period query](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient3-getsharedmodeengineperiod), [Microsoft shared initialization](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient3-initializesharedaudiostream).

## Original baseline preservation

The sealed PLAYABLE-15 package and its proprietary banks remain unchanged. The retained replay runs the original sealed Node engine and the current default on the same explicitly constructed host-delivery schedule. Their PCM SHA-256 is identical: `be5d36be1d842ef47be8ea3b5d48496ac125b687518b550d07156654b5516e92`. This does not reconstruct the live WAV byte for byte: the exact live acceptance schedule was not retained between sampled producer diagnostics.

The ring fixture also compiles the original `d9fdc90` ring from Git, with a namespace-only change, beside the current default. Sixteen identical load/phase cases agree at every callback on PCM, depth, credits and fatal starvation. A further 64 cases explore 4/5/6/8-block reserves. The focused result contains 69,087 assertions. The real-output `FillCore` algorithm is unchanged.

The actual owned-host comparisons use a **rebuilt current baseline host**, not the immutable original host executable. The additional metadata is instantiated only for `--gameplay-fixture`; it has four bounded 12,000-element timestamp arrays (384,000 payload bytes), no PCM capture, and no real WASAPI callback lock. Its fake submission timestamp is taken immediately after `Fill` returns, at the first callback overlapping a producer block. It is not a speaker timestamp.

## Retained observations on one constructed clock

The retained source bits, source identities and host write-after deliveries are genuine closed-session inputs. The replay admits each delivery before the first following 512-frame block. That block phase is constructed, not an invented claim about unrecorded live Node acceptance. Both arms use legacy `continuityPolicy='baseline'`, so this comparison isolates the latency profile from AW-01 continuity.

The native operating ages below join each selected bracket's endpoint **sequence** to the original journal's `minimumHostTicks`/`maximumHostTicks`. They end at producer selection, before the ring and endpoint. The small ranges preserve native-to-host mapping bounds; the common producer/host offset comes from the retained first-generation mapping. Its tiny numerical spread is internal consistency, not external clock-accuracy certification. Later camera generations remain explicit. No interpolated acquisition timestamp is manufactured.

| Native operating endpoint age at producer selection, ms | Default | Low-latency |
| --- | --- | --- |
| Older: count / median | 3,019 / 142.895–142.928 | 3,023 / 117.948–117.971 |
| Older: p95 / p99 / max | 168.840–168.867 / 177.369–177.396 / 184.231–184.257 | 143.819–143.847 / 153.189–153.216 / 159.333–159.360 |
| Newer: count / median | 3,010 / 85.353–85.380 | 3,010 / 60.297–60.325 |
| Newer: p95 / p99 / max | 111.186–111.212 / 113.552–113.587 / 114.601–114.628 | 86.159–86.186 / 88.614–88.644 / 90.017–90.043 |

Vehicle **pose** selection medians are separately 128.846 → 103.828 ms older and 71.229 → 46.181 ms newer. The earlier private ten-run receipt used the field name `NativePoseSelectionAgeMs`; that historical label means the RPH vehicle pose, not the native operating getter. Its bytes remain preserved. The corrected tool emits separate pose and native operating fields.

The public evidence also includes empirical native-endpoint age CDFs at 5 ms thresholds, preserving lower and upper clock bounds as separate curves. They describe producer selection on this constructed schedule, rather than a measured submission-age or physical-latency CDF.

The same-clock camera quiet windows (both channels ≤1e−6 for at least 20 ms) are 89.646/89.917 ms by default and 68.208/68.417 ms with the latency profile. These are replay windows with legacy continuity; AW-01 is a separate axis. The original retained live WAV remains exactly 89.604/100.729 ms by this near-silence criterion.

## Work, stress and limits

The ten-run retained replay records actual external render wall time; it does not run a real-time sink. Each run has 3,114 blocks. The stress schedules add bounded 0–15 ms delivery jitter, omit every eleventh sequence, delay early deliveries by 100 ms, or inject a 35.7461 ms CPU spin every 97th render. The observation clock is still constructed. The deliberate spin's missed deadlines are not a live underflow test. These are measurements on a shared offline machine, not a controlled throughput comparison between profiles.

| Schedule / profile | Render median / p95 / p99 / max, ms | External deadline misses |
| --- | --- | --- |
| Retained / default | 2.184 / 4.405 / 5.635 / 69.949 | 1 |
| Retained / low-latency | 2.936 / 5.444 / 6.738 / 25.880 | 2 |
| Jitter / default | 2.902 / 5.272 / 6.540 / 18.533 | 1 |
| Jitter / low-latency | 2.856 / 4.997 / 6.039 / 21.644 | 1 |
| Missing / default | 2.800 / 4.900 / 5.866 / 17.112 | 1 |
| Missing / low-latency | 2.835 / 4.832 / 5.833 / 21.704 | 4 |
| Cold delivery / default | 2.885 / 5.032 / 6.148 / 17.445 | 1 |
| Cold delivery / low-latency | 2.784 / 4.853 / 5.790 / 21.906 | 1 |
| Injected CPU / default | 2.814 / 5.262 / 33.406 / 43.069 | 34 |
| Injected CPU / low-latency | 2.809 / 5.376 / 34.081 / 43.348 | 33 |

The first retained run sampled RSS at 298.6 MB; later low-latency/stress runs sampled up to 358.6 MB. These are decimal process bytes including retained banks, decoded WAV, trace arrays and previous runs. Sampling every 128 blocks misses allocations; after-run RSS can exceed that sampled maximum. They do not demonstrate that the profile allocates that difference. Source-history storage remains 11,558,912 bytes in the actual Bati fixture; physical ring storage remains 32,768 bytes.

In the authored production-ring scheduler, four blocks fail every tested 35.7461 ms heavy-work phase; five, six and eight pass that authored case. All four fail the unsupported 75 ms stalls. Five blocks are therefore not hidden as a failure. A real cold six-block Node/ring run nevertheless failed after 14 blocks with 64 missing frames before source playback. That negative result is why the final profile preserves eight-block cold startup and qualifies the one-way steady transition on genuine PCM evidence.

The real owned host/Node/RA07/private Bati source/ring fixture feeds the same 120 stationary/rev/moving operating and pose values at nominal 20 Hz in both arms, after independent cold 40 Hz feeds until nonzero output. Real timestamps and startup phases necessarily differ. Preliminary normal runs had zero underflow, but their pose-age direction varied: one pair improved newer median 155.587 → 139.812 ms; a later pair worsened 110.392 → 124.013 ms. Ring medians consistently fell around 72 → 55 ms, while all-lifetime ring tails could worsen (92.993 → 100.347 ms in the later pair). The prepared-only candidate median/p95/p99/max there were 54.840/60.735/62.003/63.110 ms, with 638 admitted blocks.

The first producer observation anchor is bound before prefill and fake-sink start. Different cold phases can persist in the audio/host mapping; the preliminary aggregates cannot quantify their contribution retrospectively. I do not add the configured 25 ms to the observed ring improvement or call the sum a measured latency reduction. The final fixture retains the first valid pose clock mapping and first submission separately to expose this phase.

The final source-pinned pair passes 18 actual-chain checks and uses `camera-source-01` in **both** arms; its 120-value feed has no camera-generation change. Each new private package binds 36 host compilation sources, 71 current code inputs and 141 payloads. Build/preparation tools and before/after source hashes are retained. Both arms produced nonzero genuine Bati PCM, had zero underflow and one all-block worker deadline miss. Cold-to-nonzero status was 1,537.817/1,460.082 ms. These include process loading, startup phase and the 500 ms status cadence; they are not first-audible latencies.

| Final actual device-free pair, ms | Default | Low-latency |
| --- | --- | --- |
| All-lifetime ring count | 692 | 692 |
| Ring median / p95 / p99 / max | 72.711 / 88.638 / 90.859 / 94.160 | 55.675 / 67.485 / 75.666 / 91.787 |
| Older pose count; median / p95 / p99 / max | 77; 170.031 / 188.530 / 203.693 / 203.800 | 78; 140.684 / 171.699 / 175.537 / 186.234 |
| Newer pose count; median / p95 / p99 / max | 76; 123.776 / 140.960 / 141.500 / 141.684 | 74; 93.740 / 124.319 / 125.232 / 125.326 |
| All-block worker maximum / deadline misses | 26.457 / 1 | 27.174 / 1 |
| Final host / worker-reported RSS, decimal MB | 41.161 / 238.842 | 41.288 / 185.381 |

The pose-age rows cover the full lifetime wherever a sampled bracket is available, including the cold feed and shutdown fade; they are not a main-feed-only statistic. Brackets are sampled every eighth producer block. The reported worker maxima/misses cover all worker blocks.

The prepared candidate's 638 admitted blocks have ring median/p95/p99/max **55.296/60.700/61.527/62.013 ms**. The host observed prepared-source status 483.729 ms after the first fake submission and completed its two-credit retirement 529.653 ms after that submission, 45.924 ms after the status. This is an observed event transition, not a warmup timer.

For the final pair, the source-to-audio mapping plus first fake submission gives a clock phase of **45.005 ms default and 47.841 ms candidate**. Valid sampled interpolation offsets have 76/74 observations and a numerical spread of 2.91e−8 ms; that says they are internally constant, not that physical clock or callback timing is accurate to that precision. The fake submission point is after `Fill`, and its intra-callback sample position is not separately timestamped. The changed phase and discrete endpoint selection prevent treating the roughly 30 ms pose-median difference as an isolated profile effect. The final pair is encouraging device-free evidence alongside the earlier adverse pairs, not a stable native-input-to-ear result.

For an ideal paced interpolated target, phase plus the selected history delay is 145.005 → 122.841 ms in this pair, a 22.164 ms algebraic change after the 2.835 ms phase difference. This is not an actual sample or endpoint median: the first-overlap 20 ms callbacks and the older/newer endpoint phases change those distributions. Ring residence is implicit in the audio/submission clock relationship and cannot be freely added to the 25 ms same-replay selection effect.

A severe **actual CPU contention** experiment restricted only its owned harness, host and Node to logical-CPU affinity mask `3` (two of 16 logical processors) and ran two busy workers there during the six-second main feed. Both arms reached fatal producer starvation: 64 missing frames by default and 128 with the candidate. Affinities were restored and workers joined before cleanup. This is negative overload evidence; neither arm was silently resumed, and the candidate is not claimed safe under this load.

## Reproduction and next comparison

The source entry points are `tools/Test-LowLatencyProfile.ps1`, `tests/Test-LowLatency01.mjs`, `tools/Prepare-LowLatency01Fixture.ps1`, `tools/Test-LowLatencyActualChain.ps1` and `tools/Benchmark-LowLatency01.mjs`. Private preparation requires the retained Bati package, rechecks its original bindings, creates a fresh copy, and pins host compilation sources, build/preparation tools, copied code and every resulting payload. It does not produce a deployable live candidate. No installed private asset is published.

The sanitized [offline evidence](../evidence/low-latency-01-offline.json) binds the private receipts, clock scopes, percentile/CDF points and failures. The [future A/B experiment proposal](LOW_LATENCY_01_LIVE_AB_PROPOSAL.md) requires new exact deployment candidates and supervision review, followed by fresh explicit approval for both independently restored attempts. I have not approved or run either attempt in this work.

The implementation is commit `be5ed5c484dcd5ad54c7dba9f14415952d0735df`. The final actual-chain validation receipt is `ca63a66429e70703a2d4e9c703cb802be69105e9139482957c4529261501ab34`; its result is `699c6d7224c73a686686f9ce0d07fc774aa7d59753bf38ecc625dde87eeb0f7f`. The public evidence carries the exact private fixture manifest/host/preparation hashes. They are fixture provenance, not permission to deploy.
