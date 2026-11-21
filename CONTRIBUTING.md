# Contributing to RichAudio

## Development branches

I keep verified changes and meaningful live results on the active development branch. Use a short commit subject, push the branch normally, and check that GitHub resolves the commit. Check every outgoing commit for private game assets, recordings, binaries, backups, local evidence and secrets. Merges, tags and releases are separate decisions.

## Evidence and change control

Preserve the results, numerical measurements and limitations of each experiment. Keep immutable receipts and hash-pinned inputs tied to the implementation they verified.

## GPU-first acoustic development

GPU-first development applies to WORLD13 and subsequent acoustic-engine work. Prefer GPU execution for qualified medium and large acoustic workloads when measured complete costs demonstrate a net benefit in CPU overhead, audio deadlines and gameplay impact. Preserve and extend the vendor-neutral DirectCompute visibility backend. Do not require an NVIDIA-only library or RTX ray-tracing hardware. The initial target includes RTX 2080 Super and Ryzen 7 5800X, with broader hardware qualification required.

- Assess finite reflection/path solving, geometry occlusion, materials and future environmental reverberation for bounded asynchronous offload. Assess synthesis/DSP only when batching, precision, transfer and synchronization costs justify it.
- Keep WASAPI/PCM callbacks lightweight and deterministic. They must never synchronously wait for GPU completion. Preserve source/history continuity, identical required PCM and acoustic correctness, 48-kHz/512-frame blocks, existing audio latency and quality.
- Evolve Auto toward GPU-preferred execution for qualified medium/large workloads. Keep CPU where it is demonstrably faster or safer, preserve explicit GPU mode, and expose truthful capability, scope, fallback and timing diagnostics. Capability or a fast shader alone does not qualify the complete engine.
- Bound submissions, queues, device-loss/late-result handling, cancellation and cleanup. GPU saturation or game-rendering contention must not create indefinite audio stalls. Do not add PCM buffers, reset source history, reduce paths/quality or insert artificial delay to enable offload.
- Measure submission, upload/transfer/readback, CPU preparation, remaining exact CPU solving, complete acoustic worker and PCM deadlines, source/scene update latency, resource usage, contention and CPU-fallback overhead separately. Retain cold/warm costs, overruns, quantized/unknown measurements and failed attempts.
- CPU-only hosted CI proves functional contracts, not GPU performance. Actual supported hardware, starting with the RTX 2080 Super, must qualify hardware execution and complete-cost benefits. GTA frame-time/FPS claims require separately approved live measurements.
- Scope each increment to the smallest evidence-backed GPU extension. Preserve prior sealed CPU/GPU evidence and finish the current milestone without an unreviewed engine rewrite. Game/resource/endpoint/deployment/contact/merge boundaries remain in force unless explicitly changed by the user.
