# PLAYABLE-08: phase qualification and gated production foundations

1 November 2026. Continues draft PR #76 on `feature/playable-01` from
`7b42ab845bbf366afa39574cad72d835f53ef488`.

**GO to request one separately approved phase-marked telemetry session.** Offline
foundations and preparation pass; telemetry qualification remains **INCOMPLETE**.
No PLAYABLE-08
deployment, GTA launch, endpoint activation, audio recording or RichAudio vehicle
playback is authorised by the development request. A concrete new test requires
fresh approval. Loudness and recording foundations may be implemented and tested
offline independently; they do not clear any live acceptance gate.

## Preserve the measured route; reuse the diagnostic

[PLAYABLE-07](PLAYABLE_07.md) and its
[actual live evidence](../evidence/playable-07-live.json) retain 1,869 complete
same-Bati observations and 1,351 distinct raw values between 0.2 and 1.0. The
independent route changes under real operation and includes stationary baseline
and return regions. The phase chronology is missing because the operator started
and stopped capture without advancing labels. No keyboard defect is established.
The original captures and their analysis are not changed or retrospectively
labelled. The earlier PLAYABLE-05 zero remains inconclusive.

The existing 378,880-byte native ASI is the candidate for reuse, SHA-256
`21302b4c5c5fb99f63b7b25dce2fa973117bfb0246f16745d0782f062fe1a69e`.
Its HUD already names the current requested phase and says `Backslash NEXT`.
No rebuild or new native ID is justified by the marker omission. Reuse requires
matching its original build, complete binary fixtures, analysis tests, frozen
source and current installation fingerprints. PLAYABLE-08 proposals must identify
the reused PLAYABLE-07 build truthfully and preserve all earlier artifacts.

## Short operator card for the proposed run

**Plain Backslash advances the phase. The start/stop chord does not advance it.**

1. Stay stationary in the Bati. When READY, press/release
   **Ctrl+Shift+Backslash** once. Release Ctrl and Shift, then tap **Backslash**.
   **Do not start the driving sequence until the HUD reads IDLE.** The read-only
   observer must also record the first ADVANCE and a valid stationary IDLE sample.
2. Hold idle about 12 seconds. Tap **Backslash before each next phase**:
   stationary rev (~12 s), acceleration (~20 s), observable shifts (~15 s),
   deceleration (~20 s), return idle (~15 s). Skip unavailable/unsafe phases by
   advancing their label and report them unobserved. All vehicle actions are manual.
3. At RETURN_IDLE, tap **Backslash** to finish. The chord stops early at any time.
   Do not arm again. Keep GTA focused and unpaused until capture ends; report
   achieved/unobserved actions afterward.

Engine off is optional. The initial OFF label does not prove an off engine. If
ordinary controls can achieve engine off while remaining the valid driver,
observe it briefly before the first advance. Otherwise advance directly to IDLE
and leave engine off unobserved. Gear and actual throttle getters remain
unavailable in the reviewed native set; labels, key events and ratio drops do
not establish a measured gear or throttle value.

The unchanged ASI cannot interlock the operator's driving controls. First-advance
confirmation is a procedural requirement backed by the new session's actual
records, not a claim that motion is programmatically blocked. Observed movement
before that confirmation invalidates the intended procedure. An inability to
advance ends the attempt; it does not justify bypassing gates or another launch.

The same limits apply: 300-second pre-capture waiting deadline, 120 seconds
active, at most 2,400 target attempts and 20 Hz, no catch-up, 250 ms freshness/gap
bound, 12 MiB output and at most five seconds terminal HUD. Cancellation cannot
preempt blocked natives or guarantee recovery from fatal framework faults.
Only the exact owned/hash-verified ASI is proposed; rollback follows normal exit.

Run the existing `tools/Analyze-ShvTelemetry.mjs` unchanged on any authorised
capture. Its predeclared criteria remain the primary analysis. Human review must
account for shifts/load, missing optional states, invalid context, zero values
and unexplained discontinuities. A successful recommendation is limited to a
normalised engine operating-state quantity on the measured vehicle/build/stack,
not physical crankshaft RPM or every vehicle.

## Independent production features and activation order

The implementation separates configuration requests from acceptance facts.
`config/production-features.json` ships with both flags false:

| Flag | Default | Additional requirements before gameplay use |
| --- | --- | --- |
| `modificationAwareLoudness` | false | Qualified telemetry and independent handoff, real production PCM, human vehicle listening, explicit calibration approval; production release additionally requires traffic listening calibration and headroom acceptance |
| `synchronizedAudioRecording` | false | Those telemetry/handoff/playback/listening gates, a new explicit recording start for the current session, and separate selected-endpoint loopback approval |

`src/acoustics/production/activation.mjs` evaluates reviewed acceptance records
bound to the exact game version/hash, model, provider build, normalised quantity and
SHV identity domain. A current-session permit is separate from configuration.
Fixture records, the incomplete PLAYABLE-07 result, missing stages, wrong scope,
stale session permission and truthy strings cannot clear the gates. This pure
evaluator does not authenticate arbitrary JSON or grant user consent: a future
host must load reviewed digest-bound records through its trusted composition
boundary. It starts no process, endpoint or recording.

The executable order remains:

1. Phase-marked telemetry acceptance.
2. A supported SHV-to-RichAudio handoff, with independently correlated vehicle
   identity, timestamp-domain mapping, sequence/freshness validation and explicit
   fail-closed behaviour. SHV and RPH handles are not interchangeable identities.
3. One Bati producing nonzero engine, exhaust and stereo output through the real
   production chain, under a separately approved integration test.
4. Human acceptance of genuine vehicle listening.
5. Authorised loudness calibration, then expanded vehicle/traffic qualification.
6. Explicit synchronised recording for subsequent objective audio tests.

No new provider handoff or product activation is claimed before those gates pass.
No synthetic RPM, alternate hashes, memory scans or NFSgauge integration is used.

## Modification-aware loudness foundation

See [the policy implementation and provenance](PLAYABLE_08_LOUDNESS_POLICY.md).
The policy must retain the shared engine/exhaust pressure reference (1:10) and
common 0.25 trim. It controls per-vehicle treatment relative to that ceiling;
it does not multiply the entire vehicle's perceived loudness by ten. Stock
civilian, factory performance and actually modified vehicles have distinct,
configurable treatment. Category/appearance alone never proves modifications.
An observed nonstock exhaust OR an observed EMS upgrade qualifies through
independent alternative routes; unknown data falls back conservatively.

Persistent treatment applies to newly emitted dry frames before history insertion,
without rewriting history, resetting cursors or changing original playback.
Smooth common bus prominence may operate after propagation. Delayed louder
history remains in the conservative headroom bound. No filter removes ordinary
traffic's low-frequency body; no policy stage arbitrarily mutes other traffic.
The current product's source-selection limits are not proof of full NPC coverage.
Authored defaults are calibration proposals, not measured acoustic realism.

## Recording, analysis and menu foundation

See [the recording implementation](PLAYABLE_08_RECORDING.md). The existing
`OwnedOutputTap` copies exact post-gain stereo frames around successful WASAPI
buffer submission; the new local sink must reuse that path. Regenerating a
second approximation is not an owned-output recording. Loopback must retain the
selected endpoint's actual mix format with explicit timing/format metadata;
conversion or silent packet materialisation must remain lossless and documented.

Opt-in recording requires bounded duration, disk/file/queue budgets, safe stop,
local lossless WAVs, separate telemetry/events, and explicit clock mapping and
alignment uncertainty. There is no microphone capture, upload or background
recording on menu open. Loopback contains the digital selected-output mix,
potentially other applications, and not the physical speaker/headphone response.

The existing gold menu keeps its layout/preferences and gains a distinct
**Record Audio Test** intent on the existing recording row. It is visibly locked
in the product branch. Its action is separate from SoundMap's older recording
commands and cannot accidentally route to that backend. A future qualified host
bridge must bind it to the new session control; that bridge is not silently
enabled by this UI preparation. No installed menu or saved shortcut is changed.

Offline diagnostics may identify clicks/discontinuities, dropouts/silence,
peaks/clipping, RMS/dynamic range, stereo behaviour, pitch changes, correlation,
possible cancellation and timing anomalies. Findings distinguish measurable
symptoms from subjective quality; no absolute device/acoustic latency is claimed
without a valid common-clock reference and uncertainty bound. Existing source
histories, Doppler, finite reflections and CPU/GPU processing remain intact.

## Validation and next boundary

The [offline feature receipt](../evidence/playable-08-offline.json),
[independent diagnostic preflight](../evidence/playable-08-preflight.json) and
[recording evidence](../evidence/playable-08-recording.json) pin the actual
sources, artifacts, receipts and reviewed manifests.

| Component | Implemented/offline-tested | Live-qualified or production-ready? |
| --- | --- | --- |
| Unchanged SHV diagnostic | Original build and complete 48-case/51,703-assertion binary evidence reused; 30 unchanged analyser tests retained | Real changing PLAYABLE-07 data preserved; phase qualification still incomplete |
| New first-advance observer/proposal | 49 checks using copied actual ABI fixture records and labelled negative controls; terminal captures and stale/invalid input fail closed | No PLAYABLE-08 run yet; readiness is not a driving interlock or provider acceptance |
| Loudness policy | 18 tests: 13 new policy cases plus five original pressure/source cases | Disabled, not wired to gameplay, modification reads and acoustic defaults unvalidated live |
| Recording/session/tap | Actual complete host compiles; 105 C# tests execute the real PCM fill path with fake renderer/loopback interfaces | Actual endpoint backend compiled only; no Windows endpoint, host or microphone started |
| Recording analysis | 17 known-signal/format/negative controls; bounded spectrum/envelope/correlation/index/event diagnostics | No real GTA recordings or audible-output acceptance; aligned stems and real clock mapping still required for conditional measurements |
| Production activation | 18 cross-stage/scope/session/fixture rejection checks | Shipped requests false; structural checks do not grant permission or authenticate arbitrary records |
| Menu and product bridge | 1,305 model/input/drawing checks; controlled preview inspected; authentic-SDK compiled product has one lifecycle entry pair/plugin identity | Installed menu untouched; Record Audio Test stays locked and requires a future qualified host command bridge |
| Existing host regression | 1,702 original no-device host/ring/framing checks against final changed sources | Does not establish hardware callback timing or listening |

The recording defaults are 120 seconds and 128 MiB per session, with a hard
256 MiB configuration ceiling, fixed queues, local storage/disk checks and
explicit incomplete/fault results. Lossless WAV format and padding, render
commit/cancel, queue overflow, disk errors, cancellation before endpoint startup,
tap replacement, diagnostic admission across stop/deadline and clock uncertainty
were tested without opening an endpoint. The callback still performs no file
writing. No microphone or automatic upload is added to the new local route.

Offline analysis includes bounded Hann-window FFT bands/centroid, waveform/RMS/
stereo measurements, candidate clicks/pitch changes, known-stem correlation,
envelope-similarity lag and recorded starvation/overrun facts. PCM32 decoding
retains low bits in Float64, with duration/memory limits checked before decoded
allocation. Missing alignment, missing reference activity or missing recorded
events produce unavailable/candidate results, not fabricated latency or source
phase conclusions. Real loopback activation and physical speaker response remain
unproven.

The current output exposes its selected render endpoint ID without opening a
device in its constructor/getter. A future host adapter must bind that same ID,
explicit endpoint approval and mapped telemetry/render diagnostics before
recording. No default-device or guessed-index fallback is implemented for capture.

The final independent preflight rechecked 11 protected runtime files, four saved
shortcut/settings fingerprints, 37 prior pins, 59 preserved PLAYABLE-07 files,
three frozen native-probe inputs and original/copied capture files. All match.
Stock fallback remains selected; probe/staging paths, timeout overrides and
relevant game/host/fixture/launcher processes are absent. No system software,
runtime, playback package or original recording was installed/replaced.

Prepared private manifests are under `.local/playable-08/candidate`: installation,
rollback, multi-state proposal and preparation receipt. The installed target is
only the reused ASI, staged with create-new semantics as
`RichAudio.OperatingState.Shv.asi.playable08.pending`, then verified and renamed
without overwrite. The installation receipt must establish ownership. Removal
requires normal game exit plus exact path/owner/hash match; captures are retained.

For the read-only first-advance observer, the supervisor creates a fresh ownership
receipt for the exact new game PID **and process creation FILETIME**, unique
capture directory, approved candidate, launch time and current observation.
`tools/Observe-ShvFirstAdvance.mjs --ownership <fresh08-session-ownership.json>
--output <new08-first-advance.json> --timeout-ms 30000` polls at 5 Hz and opens no
device. It refuses old sessions, terminal/partial-terminal captures, malformed
raw results, invalid identity/timing or motion before confirmation. It ends on
the first confirmed IDLE bracket or a bounded failure, with no automatic retry.
It cannot prevent the operator driving; the short operator card is essential.

Next: review these exact artifacts and request fresh approval for one deployment,
one RPH-route Story Mode launch and one bounded operator-controlled capture only.
Run the unchanged primary analyser on that result. If accepted, document its
limited normalised-signal scope and prepare the smallest independently validated
handoff. Product deployment/playback, loudness activation and audio recording
remain separate gates and are not included in the telemetry approval.
