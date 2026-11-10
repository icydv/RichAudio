# NATIVE-AUDIO-INTERCEPTION-01

## Decision

**C — NOT CURRENTLY VIABLE for supported automatic vehicle-source interception on my Enhanced/RPH stack.** There is public evidence of separate sound objects, externally supplied PCM entering the game mixer, entity-attached scripted playback and final process capture. The reviewed interfaces do not connect a dry automatic engine/exhaust buffer to a vehicle lifetime and component, or conditionally bypass that contribution with independent fail-open semantics. This is a scoped interface finding. Proprietary implementation and unreviewed internal functions remain unknown.

Codex started from `daec881f37a7ece1b1dbda9143885c568d7fc112` on `feature/vehicle-audio-engine`. The retained target is Enhanced 1.0.1158.16 with RPH 1.132.1428.17748. This pass adds source findings and reproducible private receipts. The production PCM engine, source banks, atlas, renderer and native controls remain unchanged. Gate A remains blocked.

## Actual architecture evidence

| Stage | Established evidence and boundary |
| --- | --- |
| Bank format and source material | CodeWalker parses AWC containers, stream formats, granular intervals and REL sound references. My retained bank has actual decoded engine/exhaust PCM and source identities. Parsing a stored stream does not locate the game's live voice or establish that its current source material is dry. My catalogue registry explicitly retains `runtimeSelectionObserved:false`. |
| Vehicle synthesis and sound events | The retained Bati metadata distinguishes granular, conventional, idle synth, auxiliary and NPC references. It leaves coupled routes, four parallel synth/preset references and 17 unknown fields unresolved. Runtime scheduling and the association of all generated voices with those fields remain unobserved. |
| Script-created sounds | The named Gen9 declarations allocate a script sound ID, play a named sound from an entity, set a named sound variable and query whether that script sound finished. They expose no PCM buffer or allocator enumeration of automatic vehicle voices. The Cfx managed wrapper keeps the ID it allocated for its own play request. |
| Game mixer and supplied streams | Cfx source at `5c3065c261fb3ba82032fee6803f247198fec221` implements an external-stream sound and a referenced PCM ring for its own audio entity. One path initializes mono 48-kHz playback and pushes signed 16-bit samples into that ring. This is a concrete input path. It supplies neither an automatic engine/exhaust voice read callback nor that voice's native mixer bypass. The implementation uses build-sensitive internal bindings. |
| Spatial and environmental processing | The same Cfx implementation sets a tracker, position, environment group, category and submix for a sound it creates. The publisher advertises Dolby Atmos and Windows Spatial Sound for Enhanced. Those facts establish spatial output support and a source-backed integration example, without establishing Enhanced's complete internal DSP order, middleware or per-vehicle bus layout. |
| Final device boundary | The Windows process-loopback API selects a process tree's rendered audio. Windows Spatial Audio's object API lets a producing application fill and position its own objects. Neither reviewed contract enumerates another application's GTA vehicles, dry voices or sound components. |

[CodeWalker AWC parser](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/AwcFile.cs), [Pinned Gen9 declarations](https://github.com/alloc8or/gta5-nativedb-data/blob/424fb51b089049a9fbcebcc641500b1d44d255b4/natives_gen9.json), [Cfx script playback wrapper](https://github.com/citizenfx/fivem/blob/5c3065c261fb3ba82032fee6803f247198fec221/code/client/clrcore/External/Audio.cs), [Cfx stream and mixer implementation](https://github.com/citizenfx/fivem/blob/5c3065c261fb3ba82032fee6803f247198fec221/code/components/extra-natives-five/src/NuiAudioSink.cpp).

[Publisher's Enhanced audio description](https://store.steampowered.com/app/3240220/Grand_Theft_Auto_V_Enhanced/), [Microsoft process-loopback sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/), [Microsoft spatial-object rendering](https://learn.microsoft.com/en-us/windows/win32/coreaudio/render-spatial-sound-using-spatial-audio-objects).

The inspected Cfx files also include wave-pack overlay lifetime management, game-audio state, a vehicle-cloth crash fix and DirectSound capture handling. Those concern assets, state, fault handling and capture devices respectively. Their names supply no vehicle source interception contract. Cfx's documented submix example routes voice. Its Enhanced voice system is a separate implementation target. A Cfx source symbol or legacy build branch cannot be invoked as an RPH SDK API or certified for my Enhanced executable. [Wave-pack source](https://github.com/citizenfx/fivem/blob/5c3065c261fb3ba82032fee6803f247198fec221/code/components/gta-core-five/src/PatchAudioWavePackOverlay.cpp), [FiveM voice documentation](https://docs.fivem.net/docs/scripting-manual/voice/).

## Candidate interception boundaries

| Boundary | What it retains | Missing capability |
| --- | --- | --- |
| Individual dry or near-dry voice | This is the desired point for RichAudio's physics. A useful contract would retain PCM, rate, emission clock, voice generation, owner lifetime, component and source pose before game attenuation, Doppler and environment processing. | No reviewed supported callback supplies that tuple for automatic engine/exhaust. Buffer ownership, lifetime, format, dry-stage placement and thread deadlines are also unavailable. |
| Per-vehicle or per-component premix bus | A genuinely isolated, identified bus could work if all contents share a meaningful emitter and its upstream processing is known. | No reviewed bus contract identifies the selected vehicle and component. A bus shared by two moving Batis loses the separation needed for distinct propagation. |
| Post-spatial stream or spatial output object | It may expose producer-supplied audio with some positional context in a system that the producer owns. | GTA may already have applied gain, pitch, Doppler, occlusion or environment processing. An output object can aggregate voices. The reviewed external Windows APIs expose no GTA semantic association or bypass. Reapplying physics would require known upstream effects. |
| Process or endpoint loopback | Windows can capture rendered audio for diagnostics. | Capturing copies output. It leaves the native playback path in place and provides no engine/exhaust isolation. A sum `A+B` is also consistent with `(A+D)+(B-D)`, so the mix alone cannot uniquely recover the original source stems. |

Process capture must also account for the process tree. My gameplay runtime starts the Windows audio host and that host starts Node. Including a game process tree could therefore include a future RichAudio descendant's output. Process inclusion/exclusion changes capture selection, not selective native muting. Existing `OwnedOutputTap` records RichAudio's own output and has a different scope from game loopback.

## Identity, bypass and fail-open contract

The repository already separates source generation from propagation. `StockVehicleSource` supplies per-source PCM. `VehicleAcousticPipeline` prepares paths and sends independent input buffers to `StreamingRenderer`, which retains source generation and history. `GameplayHost` consumes stereo RA07 blocks through its sequence-checked ring and credit window. This accepts known source material and metadata. An intercepted stream would need an independently qualified input adapter, calibration and clock association. Post-mix RA07 output cannot recover the original input identities.

A voice handle, bank hash, profile name, script sound ID, position or waveform match alone does not identify the tuple of game session, full entity lifetime, voice lifetime and component. Two identical vehicles can use the same bank and event names. Voice pooling can recycle an ID independently of entity recycling. Unknown owners and components must stay on the native route.

The required bypass is at the game's **contribution commit point**. It must select exactly one contribution for the same source interval, using native output whenever a complete, validated and correctly timed replacement is unavailable. Copying a source buffer and separately muting it creates two independent actions. A healthy worker heartbeat also does not prove that the correct PCM reached the output timeline. Pending RichAudio buffers and propagation tails require a defined handback policy, since native playback can otherwise resume while queued replacement sound continues.

| Failure | Required behavior and current evidence |
| --- | --- |
| Host termination, stalled worker or missing PCM | The surviving engine-side decision must use original audio at its next defined commit boundary. There is no verified callback or deadline contract for this operation. |
| Controller or RPH AppDomain loss | The authority must still execute independently of the failed domain. The retained SDK declares game fibers and named AppDomains, but provides no qualified native contribution authority. |
| Invalid, deleted or recycled vehicle or voice | Reject old routing keys. A source that GTA itself retired must stay retired. Existing RichAudio identity tests cover its own inputs, while the native voice association is missing. |
| Routing component hangs or fails | A persistent detour or stopped callback may prevent the original path itself from executing. A watchdog or exception handler cannot establish continued game audio or process safety. No reviewed engine-owned fallback covers this boundary. |
| Unrelated sources and components | Leave native sound intact and never infer a global vehicle/category mute from one targeted contribution. |

## Timing and universal compatibility

The unchanged output period is 512/48,000 seconds, approximately 10.667 ms. Float32 mono input is 2,048 bytes per block. Two engine/exhaust inputs require 4,096 bytes per block or 384,000 bytes per second for one copy. These are byte counts, independent of game callback timing. Actual native acquisition, conversion, cross-thread transfer, clock alignment, selection and output costs are unmeasured because the input contract is absent. Game native quantum size and sample format must be observed before assuming a 512-frame match.

The two retained one-Bati discard runs measured 6.021 ms and 6.710 ms maxima with zero hard misses and underflows. Their arithmetic margins against the block period are 4.645 ms and 3.956 ms. Those are observed render margins, with no allowance certified for a new callback or GTA load. The five-voice trials remain failed. A valid time-sensitive callback would need preallocated bounded storage and a ready-or-native decision, with geometry, discovery, disk access, logging and blocking IPC kept outside it. No such callback was measured here.

A source-stage interface could let the game keep custom bank selection and synthesis. That is a useful architectural reason to prefer it. Universal compatibility still depends on voice/entity/component classification, sample format, upstream DSP and lifetime support. Neither the current bank reconstruction nor a generic callback proves coverage of all DLC, add-on, NPC, unoccupied, aircraft, watercraft or rail sources. FiveM source and policy compatibility must be qualified independently.

## Alternatives and recommendation

| Route | Practical position |
| --- | --- |
| Private profile plus reconstructed sources | Most existing offline implementation. Still blocked on effective baseline, registration, selective semantics and independent recovery. |
| Supported source interception extension | Best long-term semantic fit. Requires the missing native voice observation and contribution-selection contract. This is the priority maintainer question. |
| Custom source registration | Cfx demonstrates supplying PCM to a sound that the extension owns. Useful as an output integration route, while automatic native vehicle sound remains present. |
| Independently expiring engine/exhaust control plus existing synthesis | The smallest potential first-alpha route. It avoids acquiring all native PCM, provided the game itself enforces per-lifetime component isolation and return to stock. No reviewed supported control supplies that today. |

Codex added no hook, replacement backend or new routing fixture. A simulated selector would repeat the authored authority evidence without resolving the actual runtime boundary. The existing policy, independent-source and renderer tests passed 51 cases on each of Node 22.23.4 and 24.19.0, including the paired PCM control against the starting commit. The retained reference-SDK inspection reproduced its prior receipt byte for byte. Source copies, hashes and regression receipts remain private under `.local/street01/native-interception01`.

The next discriminator is a maintainable, exact-build provider contract. The maintainer needs to identify a read-only voice observer first, including the PCM stage, lifetime, semantic identity, clock and callback budget. Only then is an observe-only two-Bati test justified. It would compare distinct existing owners, idle/load changes and naturally occurring retirement, retain unknown classifications and leave all native output intact. PCM access is itself capture and needs separate approval. If no observer exists, ask about an engine-owned expiring engine/exhaust route before extending the profile or metadata work.

[Focused unsent questions](NATIVE_AUDIO_INTERCEPTION_01_QUESTIONS.md)
