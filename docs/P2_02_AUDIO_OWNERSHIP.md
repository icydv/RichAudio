# P2-02: native audio ownership and stock-source feasibility

**Subsequent P2-03 checkpoint:** [real stock WAVs and private offline playback](P2_03_STOCK_AUDIO_RECONSTRUCTION.md) now establish usable waveform data. This historical P2-02 report's source-access unknown is narrowed; engine-only native suppression, per-instance ownership and crash-safe handoff remain unverified. No native control was exercised by the decoding task.

Offline investigation, 25 October 2026. Target: Enhanced 1.0.1158.16 / RPH 1.132.1428.17748. Based on PR #12, commit `5a997d74d9fe27680f092ab513af219217a3593c`. Fetched main remains `e5fbd8f3502d3e28169a224caa07471e090e368f`; PRs #10, #11 and #12 remain open and unmerged. This review neither reruns the RPM investigation nor makes audio-source research wait for RPM recovery.

## Executive decision

**Stock-source inspection is established. Native per-engine waveform access, selective suppression and crash-safe restoration are not. Full replacement ownership remains BLOCKED.** Native metadata/configuration is the strongest evidenced low-integration direction for affecting stock playback while retaining GTA's own scheduling/mixing. It is a limited path, not independent world acoustics. Locally reconstructed stock material remains a plausible future provider, conditional on decoding, behavioural reconstruction, rights and native isolation. Neither sound packs nor final-mix processing solve native ownership.

Retain native audio by default. Preserve the three responsibilities: Source Sound System acquires or generates an isolated, legitimately usable component; Acoustic World Simulation transforms its paths; Perceptual Rendering/Mixing presents only contributions whose overlap policy is established. No renderer, game mutation, asset export or new game dependency is implemented here. Existing RPH motion telemetry is unchanged; physical RPM and engine load remain unavailable. P2-01 full A–E certification and Phase 3 gates remain in force.

The useful new offline result is an executable **test-only ownership simulation**, including negative controls showing why separate mute/start commands and an exit handler cannot guarantee duplicate-free, crash-safe playback. It does not supply GTA with an atomic selector or self-expiring mute.

## Evidence and confidence

Labels used below: **VERIFIED IN GAME** only for prior actual game observations; **VERIFIED FROM SOURCE/DOCUMENTATION** for inspected declarations/implementation; **OFFLINE TESTED** for file/fixture/simulation checks; **PLAUSIBLE**, **UNVERIFIED**, **UNSUPPORTED** or **BLOCKED** for the corresponding limitation. No native audio-control route was verified in game in this task or the earlier telemetry sessions.

Reused [archive/REL research](../GTA_AUDIO_RESEARCH.md), [Bati trace](../evidence/vehicle-trace.json), [AWC summary](../evidence/bati-awc-summary.json), `Trace-VehicleAudio.ps1` and `Inspect-GameAudio.ps1`. The two traced AWC containers expose 8 player and 4 NPC streams, sampled format codec ID 0 and 48 kHz. Six named player references cover engine/exhaust acceleration, deceleration and idle; NPC references acceleration/idle, with a parent graph and missing direct deceleration references. The Bati-to-default-profile fallback and exhaust channel-binding interpretation remain inferred. No full runtime mount/profile-precedence proof exists.

Reviewed the same upstream source pins as Phase 1, now specifically for decoding, ownership and family boundaries:

- [CodeWalker AWC parser](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/AwcFile.cs) and [REL parser](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/RelFile.cs), commit **485d56bec00262ed7fa472261cce7bbc6202b96e**. Source labels need not match the supplied dev46 binary; that binary's prior parsing observations remain separate evidence.
- [Cfx-maintained stock-native declarations](https://github.com/citizenfx/natives/tree/3432156872baedaf18421bebb238f511468e6b0a), commit **3432156872baedaf18421bebb238f511468e6b0a**. These are community-researched declarations, not Rockstar support guarantees or Enhanced tests. Cfx-only additions are excluded.
- The authentic pinned RPH SDK, file **1.124.1393.17586**, SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0`, inspected with a metadata-only PE/CLI reader from the independent dependency backup, not executed. Its `Vehicle.IsSirenSilent` and `IsSirenOn` have Boolean getter/setter declarations; `HasSiren` is readable. Their implementation bodies are absent. No setter was invoked. The archival development repository was not modified or used as development ancestry.

Source snapshots, SDK inspection scratch work and any private paths stay ignored. No game archive was reopened or rewritten for this review, and no stock PCM was exported or played.

## What is actually accessible?

| Question | Answer / evidence level |
|---|---|
| Inspect stock resources? | **OFFLINE TESTED, prior Phase 1:** RPF/REL/AWC metadata and the representative Bati graph were read. This is structural access. |
| Obtain a usable waveform? | **VERIFIED FROM SOURCE/DOCUMENTATION:** CodeWalker defines codec 0 as PCM, 4 as ADPCM, exposes raw/PCM extraction and WAV assembly. **UNVERIFIED for our stock source playback:** no Bati waveform was decoded/validated/listened to here. |
| Process a source waveform independently? | **OFFLINE TESTED for authored arrays only; PLAUSIBLE for decoded PCM.** Access to samples permits separate processing in principle; no stock engine synthesizer, acoustic renderer or live source timing exists. |
| Selectively suppress native engine/exhaust? | **UNVERIFIED / BLOCKED:** no supported engine-only/exhaust-only per-instance mute/gain or automatic voice handle found. Profile assignment and general silence flags do not establish it. |
| Safely restore native playback? | **UNVERIFIED for engines.** No active-profile getter, engine suppression lease or independently fail-open recovery established. A Boolean setter in another category does not solve this. |
| Do this per vehicle? | **VERIFIED FROM SOURCE/DOCUMENTATION** that profile/priority/siren APIs accept a vehicle. **UNVERIFIED** engine/exhaust isolation across two identical vehicles and handle lifetimes. |
| Preserve horn, doors, tyres and other sounds? | **UNVERIFIED for engine takeover.** The silent native's documented door/horn effects are specifically adverse evidence; no collateral-free replacement is claimed. |

## Route A — native configuration, with GTA retaining playback

| Mechanism | Evidence | Scope and missing guarantee |
|---|---|---|
| [`FORCE_USE_AUDIO_GAME_OBJECT`](https://github.com/citizenfx/natives/blob/3432156872baedaf18421bebb238f511468e6b0a/AUDIO/ForceUseAudioGameObject.md), `0x4F0C413926060B38` | Vehicle/profile-name declaration; selects the named vehicle audio profile | Expected per-instance request, not tested isolation. No previous-profile getter or transaction/lease documented. No engine-only gain, waveform access, engine-only mute or phase handoff guarantee. An empty/invalid profile is not an approved mute. |
| [`_SET_VEHICLE_SILENT`](https://github.com/citizenfx/natives/blob/3432156872baedaf18421bebb238f511468e6b0a/VEHICLE/SetVehicleSilent.md), `0x9D44FCCE98450843` | Community text describes door noise suppression and horn behaviour | Cannot infer engine/exhaust muting. Toggle false is not proof of restoring unknown prior state. Not an acceptable engine ownership mechanism. |
| [`SET_AUDIO_VEHICLE_PRIORITY`](https://github.com/citizenfx/natives/blob/3432156872baedaf18421bebb238f511468e6b0a/AUDIO/SetAudioVehiclePriority.md), `0xE5564483E407F914` | Hint affecting native audio LOD/range/frustum behaviour | Not isolation, propagation physics or voice ownership. Its historical five-granular-vehicle statement is not an Enhanced measurement; raising priority may displace other voices. |
| dat151 granular engine settings / dat54 / dat16 | Parsed references; source labels include engine/exhaust pre/post-submix levels, idle/rev/throttle curves, directional/cone fields, submix references, granular channels/clocks | Authored profile data, not a per-instance runtime mixer API. Shared record edits may affect every user of that profile. Numeric units, registration, mount precedence, component coverage and rollback remain untested. Do not assume zero means mute or a distance field means audibility radius. |
| [`SET_STATIC_EMITTER_ENABLED`](https://github.com/citizenfx/natives/blob/3432156872baedaf18421bebb238f511468e6b0a/AUDIO/SetStaticEmitterEnabled.md) / `LINK_STATIC_EMITTER_TO_ENTITY` | Named-emitter toggle/link declarations | Named environmental emitters are not automatic vehicle engine voices. Linking does not supply a dry buffer, previous binding or engine control. |
| `ENABLE_VEHICLE_EXHAUST_POPS` | Explicit vehicle pop enable/disable declaration | Narrow event-generation control, not continuous exhaust muting or authoritative event notification. No previous-value getter/expiry established; do not fabricate backfires. |
| `SET_VEHICLE_AUDIO_ENGINE_DAMAGE_FACTOR` / `_FORCE_VEHICLE_ENGINE_SYNTH` | Declarations only; latter documented alongside tyre-burst use | No documented independent gain/mute semantics. Not approved substitutes; neither is invoked. |
| RPH `IsSirenSilent`; stock `SET_VEHICLE_HAS_MUTED_SIRENS` / `IS_VEHICLE_SIREN_AUDIO_ON` | Category-specific siren setter and audible-state query; SDK has a silent-state getter/setter too | More concrete component control than engine APIs, but exact Enhanced behaviour, collateral effects and crash recovery remain untested. Audible=false does not distinguish disabled/no siren/muted. Does not transfer engine ownership. |

Selecting an existing stock profile could change audible engine character without reproducing it externally, which avoids a second RichAudio engine copy. It still may change horns, transmission or other profile components. A future separately registered, copied profile might allow more selective metadata changes, but loader compatibility, new-record registration, actual units and preservation of unrelated references must first be established. No REL edit, copied game profile or registration package was created. Do not distribute copied proprietary records or assume an archive redirector supplies runtime transactions.

**Assessment:** source-backed native-control surface, with useful but bounded native-rendered potential. It does not provide arbitrary external per-source acoustics, validated engine suppression or a safe restoration contract. Both same-model sibling isolation and class-wide collateral effects are open questions.

## Route B — native voices, callbacks and PCM taps

The reviewed RPH SDK/native corpus supplies no identified supported interface for enumerating automatic engine/exhaust voices, receiving their dry PCM, inserting arbitrary per-voice/bus DSP, routing those voices to another renderer or receiving their exact onset/stop/phase callbacks. This is a scoped **UNVERIFIED/UNSUPPORTED-in-reviewed-surface** finding, not proof that no private internal mechanism exists.

[`GET_SOUND_ID`](https://github.com/citizenfx/natives/blob/3432156872baedaf18421bebb238f511468e6b0a/AUDIO/GetSoundId.md) allocates an ID for script-controlled playback. `PLAY_SOUND_FROM_ENTITY`, `SET_VARIABLE_ON_SOUND`, `HAS_SOUND_FINISHED`, `STOP_SOUND` and `RELEASE_SOUND_ID` concern the corresponding managed sound lifecycle. `STOP_SOUND` is documented as non-resumable. Neither the allocator nor a network-sound ID conversion enumerates an automatically generated engine voice. Guessing IDs/variables or stopping unrelated sounds is excluded. `SET_VARIABLE_ON_STREAM` names script stream variables, not a native engine PCM stream.

RAGE audio internals, RAVE-authored graph/submix labels and parser classes describe different layers. A submix reference in REL is not an SDK insertion callback. There is no evidence that owning an XAudio2/FMOD/Wwise instance gives access to Rockstar's voices. Windows audio sessions/endpoints are a later mixed-output boundary. No detour, memory address, binary patch, proprietary reverse engineering or interception is implemented or proposed as a supported API.

## Route C — reconstruct installed stock sources locally

| Reconstruction requirement | Established fact | Remaining work |
|---|---|---|
| Container and codec | Prior actual format metadata: 48 kHz, codec 0. CodeWalker `AwcCodecType` maps 0 to PCM, 4 to ADPCM; `GetPcmData` decodes ADPCM and otherwise returns extracted data; WAV output uses 16-bit mono. | Actual byte/sample/endian/channel validation for each supported stream; reject unknown codecs, truncation/encryption/unsupported layout. The writer path is not evidence of every AWC format. No stock export performed. |
| Stream selection | Bati's player graph points to six named engine/exhaust accel/decel/idle streams; NPC graph has four named streams plus parent inheritance. | Runtime bank/profile precedence and native parent/LOD behaviour; the NPC graph is not a simple identical player loop. |
| Loop/grain/phase | Format loop fields, granular-grain/loop chunks and dat54 granular clocks exist in source. | Several grain values remain `Unk*` with speculative comments. No verified crank phase, grain selection law, looping/phase alignment, time stretching or clock-unit mapping. Do not assign semantics from labels/numbers alone. |
| RPM/load behaviour | Metadata separates rev/throttle/idle/accel/decel and limiter/submix relationships. | Exact selection/crossfade/smoothing rules, load inputs and calibration unknown. A whole accel recording is not a native granular engine. Research/decoding can proceed without recovered live RPM. |
| Complete operating states | Existing conventional engine record references ignition/shutdown/intake/transmission; granular references cover other layers. | Correct start/stop, overrun, limiter, shifts and combined component timing need separate reconstruction. Engine/exhaust AWC stems are not guaranteed perfectly dry acoustic radiators. |
| Synchronisation | Existing vehicle/lifecycle snapshots can identify sampled sources and motion. | 20 Hz game snapshots do not supply audio-sample timing or crank phase. Shared clock, event timestamps, latency and native LOD transitions are not established. |
| Native coexistence | None of the decoder/parser paths controls native playback. | Selective suppression, readback and independent restoration are still required before replacement. |

**Assessment: partially feasible/source-supported waveform access; unverified faithful behavioural source reconstruction; blocked live replacement.** A local decoder could reduce the waveform uncertainty without launching GTA, independently of RPM. It must run only against appropriately accessible local copies, export no content to Git/distribution, validate the actual samples and preserve original archive hashes. It must not be marketed as a complete stock-sound provider merely because a WAV opens.

Software-source availability does not establish rights to redistribute CodeWalker code or Rockstar recordings. No project-wide CodeWalker licence grant was located in the inspected tree; do not vendor its parser by assumption. A user-installed local dependency and project-owned parser/source code have different redistribution implications. Local-use/export and any public release rights need a separate review of applicable terms; this report makes no blanket permission claim. No keys, waveforms, REL exports or game geometry are published.

## Route D — independent supplements

Supplements are **PLAUSIBLE only after separation is demonstrated**. An owned distinct event/component needs authoritative occurrence, known timing/radiation and evidence that native audio does not already supply the same contribution. A quieter engine copy is still another direct engine. Delaying/filtering a copy can create comb filtering, apparent echoes or extra energy; it is not automatically a physical reflection. A geometric reflected path additionally needs usable isolated emission, delay/energy accounting and a policy for existing native reflections.

Low-frequency rotor content is not presumed missing: CodeWalker's helicopter metadata includes `RotorLowFreqLoop` as well as rotor/rear-rotor/exhaust and synth references. Additional resonances, tails or blade pulses may already be present. Do not add a generic LF loop, universal reverb tail or invented backfire. No supplementary source meets these separation/timing gates yet; none is implemented. Supplementation cannot silently replace the product's source-ownership goal.

## Route E — final mixed output

[WASAPI loopback](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording) captures a rendering endpoint's mix. Microsoft's [application-loopback sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/) can restrict capture to a process tree on supported Windows builds; that still includes the selected game's mixed dialogue/music/vehicles, not separate native voices. No endpoint capture was opened here.

Whole-mix EQ/dynamics/format translation can be meaningful global effects, but cannot independently move two engines, apply separate path delays/occlusion, remove already baked reverberation, separate source Doppler, or preserve dialogue while targeting only exhaust. Original plus processed output may duplicate playback; suppressing/rerouting the original creates a different endpoint/recovery problem and latency. Feedback capture is another risk. No device changes/APO/virtual driver are proposed. **UNSUPPORTED as an equivalent route to per-source ownership**; it is not the recommended RichAudio foundation.

## Route F — stock/custom source providers, independent of RPH

Design only; no pack SDK, ABI, decoder or renderer is built. A provider supplies source identity/material and declares what it can play; the ownership controller separately decides whether native overlap is acceptable. Providers must not call RPH or encode `Rage.Vehicle` objects in acoustic contracts.

Minimum proposed description: version/provider ID; component category and physical radiator layout; local asset identifier/hash; encoding/rate/channels/sample representation; validated sample/loop/grain/transition bounds; event or continuous operation; ratio versus calibrated physical units; engine/rotor configuration with provenance; directional/band emission metadata; clock/latency/capability declarations; source/event generation; material origin/author and distribution/local-use permissions; native-overlap/suppression requirements; supported operating states and explicit unavailable inputs. Do not infer cylinders, rotor count or calibration from class/filename. Unknown transition/phase data stay unknown.

Owned/licensed WAV material with authored loops is a simpler future source-access problem than reproducing GTA's granular graph, but still cannot take over a vehicle without native suppression. Native-format custom packs inherit GTA's mixing and the same ownership limits; an external provider requires an adapter and rights. Arbitrary community packs are not automatically compatible. Validate bounded decoding/streaming/memory, transitions and asset lifetime offline before any output. The exact RichAudio licence remains unselected; this task adds original test code, no third-party implementation.

## Per-instance and source-family boundaries

Two identical vehicles must retain distinct epoch/handle/generation/component identities; model, class, nearest position or a shared bank name cannot establish a unique source. Recycled handles, player/NPC changes, model swaps, destruction and stream-out retire the old ownership generation. Do not restore a saved setting through a recycled handle onto a new vehicle. A selected profile's shared metadata must not be confused with an instance-owned state. No tested engine/exhaust control satisfies this yet.

| Family / components | Accessible evidence | Unsupported or unknown ownership/input |
|---|---|---|
| Road: engine/intake/exhaust/turbo/transmission/tyres/backfire/auxiliary | Bati references engine/exhaust substreams; conventional record contains other component references; stock pop toggle and vehicle motion exist | Isolated complete dry components, physical RPM/load, genuine backfire callback, per-engine/exhaust gain/phase/restore; preserving tyres/horn/doors is unverified |
| Conventional helicopter: main rotor/tail rotor/turbine/blade interactions | Source-defined `RotorLoop`, `RearRotorLoop`, exhaust/banking/cabin/LF loops, curves/cones and startup/synth references | Physical mapping of every reference to tail/turbine/blade components; dry voices; rotor speed/loading/phase, suppression and update range not measured |
| Tandem rotor: two major rotors and propulsion | Same generic metadata is research input, not a validated tandem model | Need an actual model/geometry/source trace with two rotor radiators and relative phase/loading. Do not invent a conventional tail rotor or equate “rear rotor” with one universally |
| Jet/other aircraft: engine/directional/distant components | Plane settings expose engine/exhaust/idle/distance/propeller references, cones/curves and ignition/gear events | No verified isolated jet PCM/voice, power-to-emission map, per-instance suppression or shock event. A distance loop is authored audio, not proof of physical propagation |
| Gunfire/explosion/backfire and reflections | Script sound IDs exist; stock weapon/vehicle metadata can be researched by family | A script-created sound is not a notification/handle for every native impulse. Actual emission time, body/tail separation, native reflection ownership and event deduplication remain unverified |
| Siren, horn, doors, tyres, ambience | Siren-specific public surface, sound/profile references, named emitters | Siren control does not confer horn/tyre/engine ownership; horns may share controls. Ambient emitter changes may affect a whole named area |

Dominance depends on emitted spectrum/directivity, modulation, path losses and masking, not a fixed hierarchy. High frequencies do not inherently travel farther through air; atmospheric loss often removes detail at range. LF rotor rhythm or exhaust body may dominate a distant scene under suitable conditions, but no arbitrary audibility radius, power boost or infinite source persistence is justified.

## Ownership safety specification

Retain existing state names, adding explicit transition and failed-recovery states. Each transaction binds game/process epoch, source generation, component, provider version/build and a known baseline; leases/acks from another generation are rejected. Asset preparation alone never grants native control.

| State | Entry / permitted action | Exit / failure |
|---|---|---|
| `NativeOnly` | Native unaffected; owned overlapping component silent | Prepare legally usable material and validate identity/capabilities |
| `Prepared` | Owned material ready but inaudible; native still active | No takeover until component isolation, state readback, restoration and handoff timing are proven; otherwise stay native |
| `Transitioning` | Only a supported, verified handoff transaction may act | Need actual native suppression and replacement readiness acknowledgements, not just successful API invocation; timeout aborts |
| `RichAudioOwned` | One verified direct owner for that source component; health/freshness continuously bounded | Missing data, audible native overlap, incompatible build, renderer error, unload or shutdown requests restoration |
| `Restoring` | Retire owned dry contribution and restore the exact known native state using the same lifetime identity | Require readback plus audible evidence appropriate to the mechanism. No generic unmute-all command or restore onto a replacement entity |
| `Failed` | Ownership/recovery could not be certified; no further takeover | Report uncertainty and quarantine source generation; do not declare native sound restored because a finally block ran |

For controller/plugin crash, a normal exit handler cannot run. A persistent mute/profile change fails the fail-open requirement unless an independently verified self-expiring/native-controlled fallback survives the failed component. An external renderer/watchdog that cannot safely call into a dead game adapter is insufficient. A full game exit stops playback, but does not demonstrate seamless restoration during play or persistence semantics on restart. No such crash-safe GTA engine control is established.

Two independently clocked outputs plus asynchronous mute/start commands cannot guarantee both uninterrupted sound and zero simultaneous copies without an atomic/common authority or measured alternative. “Crossfade” is not proof: correlated stems can comb-filter; unrelated stems can alter loudness/timbre. Returning native audio takes precedence over attempting a dubious replacement, but the policy must not be confused with proven ability to restore it. Unknown native suppression means no takeover.

Stream-out terminates the owned component or follows a separately authorised bounded uncertainty policy; it does not grant exact continuing engine state. Known tails must have explicit ownership/lifetime budgets and must not duplicate native tails. Game updates invalidate capability evidence. Engine RPM recovery is independent of establishing these audio-control capabilities.

## Offline validation actually built

`node --test tests/Test-AudioOwnership.mjs` runs the original test-only [simulation](../tests/ownership/OwnershipSimulation.mjs); it is also included in `tools/Test-Offline.ps1`. No product adapter/core/schema changes or live native calls are added.

Two independently generated sine sources plus a separate synthetic horn are evaluated for **4,800 frames at 48 kHz**. One source changes simulated ownership; the sibling/horn stay unchanged. A known phase-identical copied waveform is used only to make sample comparison exact. With the hypothetical common selector, measured duplicate frames **0**, missing-owner frames **0**, maximum mixed-sample error **0**. This is a 100 ms deterministic fixture, not performance/latency/soak evidence.

Fifteen tests cover normal transfer, missing replacement, each missing capability, disappearance, renderer failure/recovery, independent lease expiry, stale/recycled identity, async stale/future/out-of-order data, repeated handoff, wrong build, unconfirmed/native-still-audible suppression, recovery failure, timeout, backward command/sample time and stale telemetry despite a live prepared lease. Its 96-frame TTL is a stress-fixture setting, not a proposed game budget.

Negative controls simulate separate commands: an eight-frame delayed native mute yields **8 overlapping frames**; an eight-frame delayed replacement start yields **8 silent frames**; persistent mute plus a dead renderer leaves **32/32 tested frames silent**. Thus the test explicitly demonstrates why its assumed independent selector/expiry cannot be replaced by an unverified persistent GTA flag. A failed restoration ack remains `Failed`, not a fictional successful return to native state.

The simulation owns both hypothetical renderers and can atomically select them on one clock. It also assumes synchronous, trustworthy failure/overlap feedback; real detection and control would have latency and might lack an isolated measurement at all. GTA has not exposed that mechanism. These results are **OFFLINE TESTED policy logic only**, not in-game audio control, audible quality, stock decoding, real crash recovery or an acoustic renderer. See [fixture boundaries](../tests/ownership/README.md).

## Route decision matrix

No numerical feasibility scores. “Source-backed” below means **VERIFIED FROM SOURCE/DOCUMENTATION**, never Enhanced audio certification.

| Criterion | A Native configuration | B Native stream access | C Local stock reconstruction | D Supplements | E Mixed output | F Custom provider |
|---|---|---|---|---|---|---|
| Stock-file preservation | Native API can avoid asset writes; copied configuration would need separate plan | Would not require asset writes, if a supported tap existed | Read-only originals/local outputs possible | Original files can remain untouched | Original files remain untouched | Owned/licensed material; originals untouched |
| Independent source access | Metadata, not PCM | No identified supported tap | Source-backed decoder path; actual usable stock reconstruction unverified | Needs genuinely distinct usable material | Process/endpoint mix only | Plausible for validated owned PCM, not implemented |
| Per-instance control | Vehicle-parameter APIs source-backed; engine isolation unverified | No automatic voice handle verified | Identifies material/profile, not a unique playing voice | Conditional on verified event/source identity | Unsupported per engine | Contract can identify instances; native control remains separate |
| Duplicate suppression | Native retained for configuration-only; external takeover blocked | Unverified | Not solved by decoding | Separation unverified | Rerouting/latency/duplicate-output problem | Not solved by adding a pack |
| Component separation | Some metadata labels; siren API separate; engine/exhaust mute unknown | Unverified | Partial named stems; granular/procedural coupling unknown | Must prove non-overlap; LF/tails may already exist | Unsupported independent components | Authorable in future content; native overlap still needs proof |
| Timing | GTA retains internal timing; arbitrary handoff unknown | No dry callback/phase clock identified | Grain/loop/event semantics unresolved | Correct alignment and native-tail accounting unresolved | Already spatialised/delayed/reverberant mix | Authored loops/events possible; live clock alignment untested |
| Restoration | Previous profile/lease unknown; siren getter is only a separate lead | Unverified | Native side unchanged by parsing; takeover recovery unresolved | Stop owned layer possible; native overlap not eliminated | Device/session recovery and collateral effects | Owned provider stop is designable; native recovery separate |
| Update resilience | Native mapping plus metadata/mount semantics may change | Private hooks would be fragile and excluded | Decoder/graph/profile changes | Event/native-content changes | OS/output configuration plus game mix changes | Versioned formats/contracts can isolate changes; untested |
| Performance | Unknown native cost/voice competition | Unknown; no credible supported path to benchmark | Decode/cache/grain scheduling/memory costs unmeasured | Extra voices/path work, unknown headroom | Capture/process/output buffering adds latency | Bounded decode/stream/transition budgets needed |
| Licensing | No copied game profiles distributed; proprietary runtimes separate | No authorised hook/library identified | Rockstar content/local-use and parser reuse need review | Each source recording/model needs rights | Captured game content must stay private | Original/licensed content strongest publication path |
| Evidence quality | Source-backed; no live control test | Unverified/unsupported in reviewed public surface | Prior metadata offline tested; decoder source-backed | Plausible, not demonstrated | OS capture documented; per-source goal unsupported | Design only; no pack certified |
| Open-source viability | Original integration code possible; dependencies/assets excluded | No defensible public integration identified | Own code/local dependency possible; never redistribute stock audio by default | Original code/content possible after separation gate | Own code possible but does not meet central goal | Strongest rights-controlled material path, not native suppression solution |

## Smallest future experiment and its gate

**No defensible engine-only takeover experiment is executable from the presently verified surface.** Do not use an invalid/empty profile as a mute, a damage scalar as a gain knob, or `_SET_VEHICLE_SILENT` as a guess. The specific missing capability is a supported, per-instance engine/exhaust control with known original state, component scope, observable success and independently fail-open lifetime/recovery. A vendor-supported dry tap with per-voice ownership would be an alternative. Ask for this contract only with separate permission to contact a maintainer; no inquiry was sent.

The strongest narrowly documented **positive-control candidate is siren isolation**, not an engine transformation. Its future qualification plan is below so that useful source-control research need not wait for RPM. It remains **BLOCKED pending approval and an acceptable recovery plan for a persistent setting**; it does not authorise engine takeover or output playback.

1. Use the previously verified Enhanced/RPH/DirectStorageFix 1.2/XInput-loader 1.0.0.2 combination only after fresh integrity/compatibility checks and a new exact test manifest/approval. Reuse no-overwrite deployment and independent restoration. No additional framework or audio pack is needed. A new source-owned probe would have to be built/reviewed separately; none is provided here.
2. Use two naturally available, stationary same-model emergency vehicles in a quiet Story Mode scene, with manual siren controls. Identify A/B by epoch/full handle/generation. Do not assume model equality is identity. Baseline: A's siren audibly active, lights and engine state known; getter `IsSirenSilent=false` and stock `IS_VEHICLE_SIREN_AUDIO_ON` agree with audible behaviour; B unchanged. If getters/setup disagree, classify SETUP FAILURE and do not mutate.
3. One controlled change, A only: temporarily set `A.IsSirenSilent=true` via the documented RPH property. Do not alter `IsSirenOn`, engine/physics, profile, priority, horn or any other vehicle. Pre-record the exact prior Boolean; a short, bounded restore returns that Boolean, not a guessed default. No replacement is played, so this measures suppression/restoration only.
4. Required evidence: A's siren ceases, B retains its baseline sound, A's lights/engine and unrelated horn/doors/tyre/ambient categories remain as far as the bounded stationary test can establish. Moving tyre sounds and collision preservation would remain NOT TESTED. Record timestamps, target-generation checks, getter readback and private audio/observer notes; an API Boolean alone is not acoustic evidence. No owned source is played, so no duplicate-free future renderer claim is possible.
5. Restore A's captured flag and verify readback, audible siren return under the unchanged siren request, B unchanged, then normal shutdown and complete file rollback. A wrong generation or disappearing entity forbids writes to the new occupant of a handle; record unresolved restoration rather than guessing. Failure to return audibly fails the probe and blocks any further attempt.
6. A plugin crash may leave the mute flag set. Before this experiment can be approved, establish a documented independent recovery path or explicitly approved supervised diagnostic contingency and disclose that it is **not production fail-open**. A finally block/normal timeout alone does not pass the ownership gate. Do not intentionally crash the game or claim crash-safe restoration. If that risk cannot be bounded acceptably, do not run the probe.

This candidate answers whether one public category-specific control works per instance on Enhanced. It cannot prove engine/exhaust isolation; convenience is not grounds to generalise it. The next **first engine transformation** would preferentially keep GTA rendering and examine one supported profile/configuration change after active-profile baseline/restore and collateral-scope evidence are obtained. With no verified baseline getter or engine-component contract now, no executable engine-change procedure or installation package is fabricated. Offline local waveform validation and authored-provider/ownership tests can progress independently of the blocked live control.

## Validation and publication

The new tests run without GTA, RPH, CodeWalker binaries, audio endpoints or copyrighted assets. The complete suite passed: **15 ownership tests, 65 core assertions, 35 drivetrain assertions, 17 parser tests, 3 diagnostic-analyzer tests, 114 Phase 1 checks, 9 configuration assertions and 8 isolated append expectations**. Existing core/analyzer/test programs rebuilt; no adapter/runtime build was needed or substituted for game evidence. [Portable findings](../evidence/publication/audio-ownership-review.json) separate synthetic assumptions from native capabilities.

Privacy checks cover staged content and sanitised history; source clones/helpers and proprietary dependencies remain excluded. No project licence was selected, no old PR was merged, no archival ancestry was imported, and no stock audio/configuration/native state was changed.
