# Vehicle audio engine increment 02

I’m building the multi-vehicle foundation for RichAudio’s eventual ownership of vehicle sound. This increment covers the normal additive engine and exhaust chain. The authored transmission and brake instruments remain separate from the production observation inputs. Selective native takeover remains disabled.

## Product route

The RPH adapter observes the camera and vehicle pool, then publishes the latest snapshot through the authenticated gameplay pipe. The Windows host checks session, monotonic clock, original expiry and the package’s observation budget. The normal Node producer resolves each model and context against the pinned graph and verified PCM bank. It creates independent source readers and advances them on the common 48 kHz timeline. Each active vehicle contributes its own engine and exhaust positions, direct and reflected paths, delay, Doppler and attenuation. The causal renderer mixes to stereo, and RA07 sequence validation, ring admission and credit return run in the normal Windows host. The benchmark replaces hardware submission with the existing clocked discard sink.

The catalogue fleet policy is selected by the immutable package. It accepts up to 32 observations, ranks qualified voices and keeps five active slots within the existing emitter bound. It can discover a model even if no bank qualifies. Player and NPC lookups match graph links, PCM asset identity and context. The four-state NPC contract accepts alternate stream hashes when the decoded evidence explicitly binds each role to the graph slot. The retained legacy stream identities still match their original roles. Runtime effective-profile readback and other NPC graph shapes remain unqualified.

Sources with the same model can share prepared immutable bank data. Each active lifetime owns its own operating state, grain cursor, pressure history and propagation generation. A generation change, absence or original expiry cannot reuse a former reader. At the voice budget, a virtualized vehicle has no synthesised history until it becomes relevant. Re-entry uses a fresh voice, and existing active vehicles keep advancing. Missing or virtualized observations do not synthesize an engine-off event.

World work stays in the existing preparation worker. The local request includes the ranked fleet emitters within the established spatial limit. Admission and replacement retain the original proof, workset bounds, expiry and unknown-coverage rules. The audio callback only consumes already framed PCM. The retained path-leg optimization, buffer sizes, 512-frame blocks, credit limits, gain and reflection rules are unchanged.

## Reproduction and evidence

Run the following from the repository with PowerShell 7.5 or newer. Use a fresh output directory for each attempt. The driver builds an authored owner, runtime version stub and the actual Windows host. It binds the Node executable, copied production modules and authored fixture assets by SHA-256. The owner and its children run under bounded Windows jobs. Only the original authored stereo output enters the short WAV excerpt. The final driver, host, worker and input receipts stay under the specified private output.

```powershell
./tools/Test-ClockedFleet02.ps1 -OutputDirectory .local/street01/fleet02-new -Blocks 13440 -Population 25
node --test tests/Test-ClockedFleet02.mjs
```

Set `RICHAUDIO_FLEET_BASELINE02` to a frozen source snapshot of `65e1676274caf7d571eed488d762670dc3e36629` to run the paired dry, stereo and source-state checks. Set `-NodeExecutable` on the clocked runner to select the exact Node 22 or Node 24 executable. The driver visits workloads with one, two, three, five, ten and 25 observed vehicles and records the actual active, virtualized and unavailable populations.

The controlled-clock fixture compares two independent renders against the mixed output. It checks exact per-voice dry blocks, source state, late arrival, expiry, recycled identity, virtual relevance and scene renewal. The production-host fixture measures wall-clock delivery with authored PCM and authored geometry. The retained replay uses the production producer and retained geometry separately from the Windows ring benchmark.

Run `node tools/Test-NormalGameplayInteriorReplay01.mjs --exterior --fleet --expect-layer-withheld` for the retained exterior control. The control requires both voices to advance across replacements and requires the unresolved layer to withhold reflections. The separate existing reflection-required replay still checks for a qualified finite reflection.

The hot source path repeatedly queried the end of the same contiguous run of compatible grain intervals. The new lookup indexes the endpoints of internally built, prepared playback plans, including breaks in native sample addresses. The waveform scoring, sample reads, reader order, control arithmetic and RNG remain unchanged. The unprepared and externally supplied reader plans retain their existing traversal.

## Qualification

My live audio qualification remains gated on zero hard processing misses and zero clocked underflow during the sustained workload. The timing evidence retains the maximum and the missed blocks even where the ring absorbs the delay. The authored host results do not establish GTA discovery, actual loaded runtime profiles, WASAPI delivery or playback quality.

### Sustained authored host runs

| Runtime and implementation | Non-silent blocks | Seconds | Render p50 | p95 | p99 | Maximum | Hard misses | Underflow frames |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Node 24.19.0 before indexing | 13,509 | 144.03 | 5.668 ms | 7.462 ms | 8.313 ms | 13.005 ms | 6 | 0 |
| Node 24.19.0 with indexing | 13,457 | 143.53 | 5.649 ms | 7.484 ms | 8.367 ms | 11.804 ms | 2 | 0 |
| Node 22.23.4 with indexing | 13,508 | 144.03 | 5.915 ms | 7.745 ms | 8.620 ms | 17.359 ms | 7 | 0 |

Each run reached 25 discovered vehicles, five active voices, 17 qualified voices outside the render budget and three unavailable models. The renderer reached 20 simultaneous paths. The maximum observed ring occupancy was 4,096 frames and the maximum producer credit batch was eight during prefill. The steady six-block producer window was unchanged. No sink callback deferred a period. Maximum ring admission intervals were 36.629, 46.313 and 46.677 ms respectively.

Node 24 median synthesis at the 25-vehicle plateau was 4.322 ms before indexing and 4.336 ms after. The maximum dropped from 10.503 to 7.860 ms in those two runs. The largest indexed Node 24 overrun spent 5.617 ms in synthesis and 5.164 ms in PCM processing. The largest Node 22 overrun spent 6.715 ms in synthesis and 9.764 ms in PCM processing with 0.252 ms of recorded GC overlap. These wall-clock stage boundaries leave scheduling and renderer work in scope. The timings do not isolate the cause of the PCM spikes.

The authored host runs recorded 279, 262 and 263 scene replacements with zero measured scene validity gaps. The two-voice retained replay reached 607 surfaces and 25 replacements. Both source clocks advanced, and the four direct paths stayed conditional because of unknown coverage. The retained layer authority withheld reflections. The separate one-voice reflection-required replay also failed to establish a reflection at this retained exterior.

The private evidence contains the per-population and per-stage timings, startup preparation, cold and warm history comparisons, GC overlap, host and producer CPU time, ring cadence, and excerpts. The focused source tests match 480 paired blocks against the exact increment-01 source. The two-voice stereo mix agrees with separately rendered voices within 4.66e−10. The local product wire and PCM ring fixtures pass. The older hosted Node 22 affinity timeout occurred before render and the local ownership control passed. The older hosted interior wire assertion predates this branch and passed locally both before and after these changes. The hosted logs lack the raw capture operand needed to distinguish timing-based withholding from a codec problem. [Inherited offline run](https://github.com/icydv/RichAudio/actions/runs/42708011865), [inherited STREET-01 run](https://github.com/icydv/RichAudio/actions/runs/42708011990)
