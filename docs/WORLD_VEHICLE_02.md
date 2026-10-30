# WORLD-VEHICLE-02 — genuine Bati NPC source

Verified scope: **Bati NPC only**. Other NPC models were not assessed. This increment adds source-state support, not live traffic attachment or perceptual acceptance.

## Installed contract and decoding

The cached, digest-pinned installation resolves Bati vehicle `F9300CC5` through granular record `61F3BD06`. Player sound `0346A636` and NPC sound `D7852424` are separate `Dat54GranularSound` definitions. The NPC record has six channel slots but only four active streams:

| Slot | State | AWC stream ID | Frames | Rate |
|---|---|---|---:|---:|
| 0 | engine acceleration | `1F7402AA` | 123810 | 48000 |
| 1 | exhaust acceleration | `03AB9171` | 122455 | 48000 |
| 2–3 | explicitly unused | zero | — | — |
| 4 | engine idle | `1D18B9A1` | 40350 | 48000 |
| 5 | exhaust idle | `179DDCAA` | 40350 | 48000 |

The exact installed container is `x64/audio/sfx/streamed_vehicles_granular_npc.rpf/v_twin_2_npc.awc`, payload SHA256 `06091f1b58d3e28dbf768b66a1f5c5a7cbfc5d0fb9021a582de100aaa16110dc`. All four streams decode as mono PCM0 at48kHz. Raw and decoded PCM agree; WAV PCM agrees; Float32 round-trip error is zero. Archive before/after hashes match. No player material was re-extracted. Raw REL channel volumes remain uninterpreted and unapplied.

The existing decoder now has a bounded representative `-Npc` mode requiring one explicit Bati request and exact expected AWC payload hash. It records game/parser provenance and four states, retaining all original granular metadata. Its full-entry path matcher now handles an exact archive-relative path, and its explicit script-path argument supports the existing trusted ScriptBlock invocation. The initial failed path-resolution attempt remains private; it extracted no audio. No source-asset fault was found.

## Source and registry changes

`loadStockNpcAssets` validates four required layers, original PCM hashes, native format and strictly ordered original offsets. It forbids a concealed deceleration layer. Player loaders continue to require their original six-state contract.

`StockVehicleSource` uses the same reader, original chronological PCM, waveform-matched splices, continuous role-local clock and incoming-state alignment for two modes per emitter. Whole recorded idle remains eligible for texture progression. Engine/exhaust clocks remain independent. NPC playback has no deceleration voice, synthetic replacement, exhaust event, EQ or added noise.

**Authored lift policy:** load/lift flags do not select absent material. The acceleration recording follows the requested operating point as it falls, then blends into idle below operating point.28, becoming fully idle at.08 or below. Existing40ms state/position smoothing and25ms running-envelope smoothing remain. The caller must provide the falling operating point; this source does not invent vehicle motion or an RPM law. This is not a reconstruction of Rockstar's native deceleration scheduling. Native interval rates are not crankshaft RPM or measured acoustic fundamentals.

The registry accepts a separate optional NPC library with matching game-executable and parser hashes. An NPC request checks all four active IDs and role assignments, actual archive/entry paths, AWC digest, native formats/counts and the two explicitly unused slots. It never falls back to a player library. NPC graphs are resolved on explicit lookup; no NPC fleet enumeration was added. Exact Bati player and NPC mappings are both verified and independent. Missing, ambiguous, swapped-role, mismatched and unsupported definitions reject.

## Focused validation and local audio

Twenty focused tests pass, with no skipped genuine-asset checks. They include native Bati acceptance/rejections, game/parser/archive identity, context independence, real idle/rise/hold/lift/idle operation, separate emitter output, recorded interval diversity, PCM bounds and the actual moving-source finite-street renderer. Limiting, missing history, cursor resets, rejected controls, path overflow and affected-history frames remain zero. Existing player full-event emitted PCM hashes still match all four published waveforms.

Analytical four-state harmonic fixtures retain100/125Hz fundamentals and second harmonics through the transitions at24/32/48kHz. The declared fitted-waveform residual RMS tolerance is`1e-4`. This checks pitch/phase integrity; it does not certify that real joins are inaudible. Existing chronological and player-transition checks also pass. Earlier fixture failures used a fractional final frame count and a non-idle test operating point; the frame count was rounded and the scenario now requests actual idle. Production integrity thresholds were not relaxed.

Private page: `.local/world-vehicle-02/audition/index.html`, with original mono WAV links and two diagnostic mixes:

- `native-acceleration.wav`:2.5seconds of original finite acceleration material, no looping, state control, resampling or propagation; peak.7383133.
- `reconstructed-states.wav`:4.1seconds of authored idle/rise/hold/falling-state/idle; peak.7412819.

Both use source calibration1, equal.5 engine/exhaust shares, the approved exterior10× ratio and.25 common trim, and.7 master equivalent. No normalization or limiting occurs. These are different operating performances, not an identical-state A/B or native in-game performance claim. The files are dry to expose source behavior. Existing acoustic processing and pressure calibration remain unchanged; actual causal/street propagation is verified separately by the focused test. No subjective listening by the assistant occurred; **perceptual acceptance is PENDING**. All original source files and earlier auditions remain unchanged. Sanitized evidence is `evidence/world-vehicle-02.json`.

## Remaining live work

Live NPC attachment still needs per-instance context/identity and operating-state telemetry, emitter placement, owned generation/history integration, additional genuine source-family validation and native-audio ownership/restoration work. No scheduling, long-range traffic or citywide mix was implemented. Lectro/X80 stepping remains open and untouched. No GTA launch/deployment, endpoint, native suppression, world export, PR73/75 changes or next development phase occurred.
