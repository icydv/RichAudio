# RichAudio contributor and agent guidance

## Write in my voice

RichAudio is my project. In public-facing README content, GitHub pull-request titles and descriptions, release notes, milestone reports, experiment write-ups, and other narrative documentation, write about my work in **first-person singular** (I, I've, my, me).

- Say **"I heard RichAudio in GTA"**, not **"the owner heard RichAudio"**.
- Say **"I approved the test"**, not **"the user authorised the test"**.
- Say **"my listening feedback"**, not **"the operator's subjective feedback"**, when the feedback is mine.
- Describe my driving, test participation, supplied materials and decisions in first person.
- Do not imply that I personally ran a tool, wrote a change or inspected evidence when Codex, CI or another executor actually did so. Say **"the test runner"**, **"Codex"**, **"CI"** or name the specific automated component for its actions.
- Preserve technical meanings of *source owner*, *owned process*, *ownership lease*, *user account*, *operator process* and other code/API terms when they do not refer to me as the project creator.

## Evidence and change control

Preserve experimental results, test outcomes, timestamps, numerical measures and their uncertainties. Do not recast unverified claims as verified. Do not rewrite hash-pinned approval receipts, sealed proposals, raw logs, immutable historical commit snapshots or machine-readable evidence simply to change the narrative voice; any repinning/resealing requires a separate reviewed change. Existing historical snapshots remain valid even after a newer first-person documentation revision.

## GPU-first acoustic development

The user's GPU-first directive applies to WORLD13 and subsequent RichAudio acoustic-engine work. Prefer GPU execution for qualified medium and large acoustic workloads when measured complete costs demonstrate a net benefit in CPU overhead, audio deadlines and gameplay impact. Preserve and extend the vendor-neutral DirectCompute visibility backend; do not require an NVIDIA-only library or RTX ray-tracing hardware. The initial target includes RTX 2080 Super and Ryzen 7 5800X, with broader hardware qualification required.

- Assess finite reflection/path solving, geometry occlusion, materials and future environmental reverberation for bounded asynchronous offload. Assess synthesis/DSP only when batching, precision, transfer and synchronization costs justify it.
- Keep WASAPI/PCM callbacks lightweight and deterministic. They must never synchronously wait for GPU completion. Preserve source/history continuity, identical required PCM and acoustic correctness, 48-kHz/512-frame blocks, existing audio latency and quality.
- Evolve Auto toward GPU-preferred execution for qualified medium/large workloads. Keep CPU where it is demonstrably faster or safer, preserve explicit GPU mode, and expose truthful capability, scope, fallback and timing diagnostics. Capability or a fast shader alone does not qualify the complete engine.
- Bound submissions, queues, device-loss/late-result handling, cancellation and cleanup. GPU saturation or game-rendering contention must not create indefinite audio stalls. Do not add PCM buffers, reset source history, reduce paths/quality or insert artificial delay to enable offload.
- Measure submission, upload/transfer/readback, CPU preparation, remaining exact CPU solving, complete acoustic worker and PCM deadlines, source/scene update latency, resource usage, contention and CPU-fallback overhead separately. Retain cold/warm costs, overruns, quantized/unknown measurements and failed attempts.
- CPU-only hosted CI proves functional contracts, not GPU performance. Actual supported hardware, starting with the RTX 2080 Super, must qualify hardware execution and complete-cost benefits. GTA frame-time/FPS claims require separately approved live measurements; no live permission is implied by this directive.
- Scope each increment to the smallest evidence-backed GPU extension. Preserve prior sealed CPU/GPU evidence and finish the current milestone without an unreviewed engine rewrite. Game/resource/endpoint/deployment/contact/merge boundaries remain in force unless explicitly changed by the user.

For README, user-facing docs and PR descriptions, review the text for third-person references to me before publishing. Do not merge or deploy as a side effect of documentation edits.
