# PLAYABLE-08: scoped engine-state qualification and gated production foundations

1 November 2026. Continues draft PR #76 on `feature/playable-01` from
`7b42ab845bbf366afa39574cad72d835f53ef488`.

**The guided live test passes all seven frozen criteria across 1,633 complete
genuine observations. Restricted engine-running Bati signal evidence is accepted
for preparing the next handoff experiment.** The first attempt remains
INCOMPLETE and preserved separately. Two individually approved diagnostic
deployments/launches are complete; neither approval permits another test. GTA
exited normally and the owned probe was removed after each attempt.

**GO for offline handoff preparation; actual handoff, playable audio, listening,
loudness activation and recording remain BLOCKED.** No RichAudio audio host,
recording/loopback endpoint or microphone was activated. Loudness/recording requests remain
false and the installed game retains stock fallback. Further deployment or launch
requires a new exact candidate, validation and explicit authorisation.

## Guided live result and restricted acceptance

After the first attempt established the usability problem below, the guided HUD
revision was compiled and validated offline. The operator explicitly authorised
its exact 380,416-byte artifact separately. The
[guided live record](../evidence/playable-08-guided-live.json),
[independent cleanup](../evidence/playable-08-guided-rollback.json) and
[restricted acceptance](../evidence/playable-08-engine-state-acceptance.json)
bind that actual result. The source capture and the analyser still say
`providerValid:false` / `providerQualified:false`: neither automatically grants
qualification. The separate acceptance is the reviewed, narrowly scoped decision
after real provenance, unchanged primary criteria and the human report agree.

| Measured fact | Guided actual result |
| --- | --- |
| Route | One actual ASI load, script registration, main callback and later unregistration through the existing RPH launch route |
| Scope | Protected Enhanced `1.0.1158.16` executable; installed SHV `3889.0/1158.13`; Bati `F9300CC5`, current local player as driver, offline Story Mode, engine-running observations only |
| Observations | 1,633 complete declaration/raw-return/context triplets; 836 distinct raw bit patterns; raw `0.20000000298023224..1.0` without transformation |
| Phase chronology | START OFF, six manual ADVANCE events through RETURN_IDLE, then plain-Backslash FINISH; operator-stop after 91.9985 seconds |
| Initial idle | 263 observations over 14.7600852 seconds, speed zero, exact raw `0.2` |
| Return idle | 237 observations over 13.2956572 seconds, speed zero, exact raw `0.2` |
| Acceleration | Independent speed quarter delta +29.01069 m/s and raw ratio quarter delta +0.329007 |
| Deceleration | Independent speed quarter delta −13.32540 m/s and raw ratio quarter delta −0.321840 |
| Primary decision | `candidate-consistent`; all seven criteria true; zero quality failures, zero evidence gaps; independently reproduced without changing the analyser |
| Boundaries | All target starts before the active deadline, maximum 20 Hz retained; no native failure, null result, running zero, missing outcome or invalid identity bracket recorded |

The operator confirmed completing the phases, including slowdown and stationary
return to idle. This corroborates the separately marked independent observations;
it does not supply missing gear/throttle measurements. Every pre/post
engine-running raw value was 1. The OFF label never proves engine off. Of the
315 REV-labelled observations, 309 have both acquired speeds at or below
0.10 m/s and span raw `0.2..1.0`; six briefly move faster, up to 0.8534 m/s.
Those samples remain intact. No W/S actuation association, actual throttle or
measured gear is inferred from labels, speed or ratio drops.

The supported conclusion is a genuine **normalised engine operating-state
signal for this engine-running, player-driven Bati on this exact stack**,
sufficient to prepare and separately validate the next handoff experiment.
Physical crankshaft RPM, engine-off/restart/stall semantics, running zero,
other vehicles/NPCs/builds, prolonged/repeated-session reliability and
cross-framework correspondence remain unqualified. The framework's internal
`VER_EN_1_0_1158_13` compatibility label does not replace the executable's actual
`1.0.1158.16` file version. The independent SHV route is supported; the earlier
RPH failures still have no proven root cause.

Normal exit used the observed GTA quit dialog. Return was issued to its Yes
action; the input helper's post-action foreground-PID error occurred as the game
closed, and is recorded rather than presented as helper-confirmed completion.
OS process absence and loader unregistration independently establish exit. The
exact receipt-owned ASI was removed only afterward. All 11 protected files,
four settings fingerprints, 140 historical pins, 24 foundation pins and three
compiled inputs match. Original/copied captures and logs are hash-matched;
probe/pending paths and relevant owned processes are absent. Stock fallback and
disabled feature requests remain unchanged. No automatic retry or audio test
occurred under either approval.

## First authorised attempt: incomplete, unchanged diagnostic

The [sanitised live evidence](../evidence/playable-08-live.json) and
[independent rollback evidence](../evidence/playable-08-rollback.json) preserve
this attempt. Original captures, a hash-matched immutable copy, framework logs,
the operator statement and independent review remain private. The unchanged
primary analyser (`c246ea676c54b8298503cadfcc8603eac4c7f1fbfca012bf7e5a726e48937799`)
was applied without changing its criteria; an independent review reproduced the
result. No requested markers were invented from later recollection.

| Recorded fact | Actual result |
| --- | --- |
| Native route | Real SHV loaded, registered and ran the approved ASI on the protected Enhanced `1.0.1158.16` executable |
| Outcomes | 2,131 matching declaration/raw-return/context triplets; no missing outcome or recorded data-quality failure |
| Raw signal | 1,308 distinct float bit patterns, `0.20000000298023224` through `1.0`; retained without transformation |
| First advance | Read-only observer confirmed ADVANCE to IDLE with a valid stationary, engine-running Bati bracket before the driving sequence |
| Initial IDLE | 282 observations over 15.8312288 seconds, constant raw `0.2`, independent speed zero; primary criterion passes |
| STATIONARY_REV label | 420 observations over 23.6059863 seconds, raw `0.2..1.0` while independently observed speed stayed at or below 0.0127893 m/s; actual throttle remains unavailable |
| Requested chronology | OFF → IDLE → STATIONARY_REV → ACCELERATION → GEAR_TRANSITIONS; no DECELERATION or RETURN_IDLE marker |
| Capture end | 120-second active deadline during GEAR_TRANSITIONS; all target dispatches started before that deadline; cooperative completion at 120.0127306 seconds |
| End context | Same valid player/Bati/driver; independent speed 39.404747 m/s, engine-running query true; no final idle observed |

The operator reported acceleration and natural deceleration inside the ACCEL
phase, then going up and down gears until capture ended. This explains why a
dedicated deceleration/return-idle comparison is missing. The ACCEL label spans
speed increases and decreases: its last-versus-first quarter speed difference is
−8.24736 m/s and ratio difference is −0.197217. It does not satisfy the frozen
ordered acceleration/ratio-rise criteria. Changing raw data, marked idle and the
reported actions remain useful evidence; they do not substitute for that
comparison. Actual gear and throttle values remain unavailable.

The signal is still a credible independently measured **normalised engine
operating-state candidate**, not physical crankshaft RPM. No complete provider
contract, SHV-to-RichAudio handoff or audible vehicle playback was qualified at
that first attempt's boundary.
There was no automatic retry or additional launch under that first approval.
The guided attempt above required separate approval. Neither authorised an audio
test or endpoint capture.

After normal exit, only the receipt-owned, exact-hash ASI was removed. Independent
inspection confirmed all 11 protected installation files, four saved settings
fingerprints, prior evidence and private capture/log copies. Stock fallback is
still selected; the probe and pending file are absent, with no relevant owned
process left running. The first rollback receipt's mode field was null because it
queried a nonexistent field in the package pointer; the independent receipt
explicitly verifies the saved settings' top-level `integrationMode`. The saved
bytes were unchanged throughout.

## Preserve the measured route and first candidate

[PLAYABLE-07](PLAYABLE_07.md) and its
[actual live evidence](../evidence/playable-07-live.json) retain 1,869 complete
same-Bati observations and 1,351 distinct raw values between 0.2 and 1.0. The
independent route changes under real operation and includes stationary baseline
and return regions. The phase chronology is missing because the operator started
and stopped capture without advancing labels. No keyboard defect is established.
The original captures and their analysis are not changed or retrospectively
labelled. The earlier PLAYABLE-05 zero remains inconclusive.

The 378,880-byte native ASI used by this first attempt has SHA-256
`21302b4c5c5fb99f63b7b25dce2fa973117bfb0246f16745d0782f062fe1a69e`.
Its HUD already names the current requested phase and says `Backslash NEXT`.
At preflight no rebuild or new native ID was justified by the earlier marker
omission. Reuse required
matching its original build, complete binary fixtures, analysis tests, frozen
source and current installation fingerprints. PLAYABLE-08 proposals must identify
the reused PLAYABLE-07 build truthfully and preserve all earlier artifacts.
This completed run establishes a further usability need: the HUD needs short
phase-specific action guidance and visible phase/remaining time so the operator
can finish all requested regions inside the unchanged 120-second budget. The
small guided HUD revision is prepared offline; it does not change the native,
capture limits, raw values, manual phase controls or frozen analysis.

## Operator procedure used for the separately approved guided run

This procedure was used once; it does not propose another diagnostic session.

**Plain Backslash advances the phase. The start/stop chord does not advance it.**

1. Stay stationary in the Bati. When READY, press/release
   **Ctrl+Shift+Backslash** once. Release Ctrl and Shift, then tap **Backslash**.
   **Do not start the driving sequence until the HUD reads IDLE.** The read-only
   observer must also record the first ADVANCE and a valid stationary IDLE sample.
2. Hold idle about 8 seconds after confirmation. Tap **Backslash before each
   next phase**: stationary rev (~8 s), acceleration (~8 s), optional observable
   shifts (~6 s), deceleration (~8 s), return idle (~8 s). During ACCEL, speed up
   smoothly and advance before slowing; use DECEL for slowing down. Follow the
   phase timer and remaining time. These durations are guidance, not automatic
   phase advances or proof that an action occurred. Skip unavailable/unsafe phases
   by advancing their label and report them unobserved. All driving is manual.
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

## Guided diagnostic build and offline validation

The [new build receipt](../evidence/playable-08-build.json) identifies the
380,416-byte `build/playable-08-shv-probe/RichAudio.OperatingState.Shv.asi`, SHA-256
`41361aa281493e1cc54fe196161aafc4a93ce002bfe0bb9da2effbc742465484`.
It was compiled once from the reviewed HUD revision, then used unchanged in the
separately approved guided session above, using the existing signed
Microsoft MSVC `14.44.35207` and Windows SDK `10.0.26100.0`, with warnings treated
as errors. No additional system software, runtime or SDK was installed.

The coach displays current requested phase, phase elapsed seconds, remaining
active-capture seconds, a short action cue and plain-Backslash NEXT/FINISH. Its
phase timer resets only after an accepted manual advance. Target durations are
advice: there is no automatic advance, vehicle actuation, inferred gear or
invented phase achievement. A running-zero warning appears separately. Fixed
stack text storage and a compile-time component-length bound avoid unbounded HUD
formatting. An explicit formatting failure stops rather than forging an
invocation exception. The operator successfully advanced and finished the actual
guided protocol. Exact font/layout fidelity is not independently certified by
the fake-framework text checks or a screenshot of the active coach.

The reviewed change preserves native/API headers byte-for-byte, the same 25
published identifiers, eight SHV imports and two read-only USER32 imports. Static
inspection confirms a hardened native AMD64 PE32+ DLL with a backed entry point,
no CLR metadata, no exports and no delay imports. The builder verifies 140
preserved artifact/evidence files and the protected installation/settings before
and after compilation. Original07 binaries/receipts, original source snapshots,
the consumed08 manifests and all live08 captures remain unchanged.

`tools/Build-ShvTelemetryProbe.ps1 -ProbeProfile playable-08` selects the separate
profile. `tools/Test-ShvTelemetryProbe.ps1 -ProbeProfile playable-08 -BuildReceipt
build/playable-08-shv-probe/build-receipt.json`
executes the actual ASI against an explicitly identified device-free ABI fixture.
It does not load real SHV or start GTA. The unchanged primary analyser and its
negative controls remain distinct from fixture-generated signals.

The [genuine-binary fixture receipt](../evidence/playable-08-fixtures.json)
records **48/48 cases and 53,747 assertions passed**. Actual emitted HUD strings
cover all seven manually advanced phases, timer resets, action/footer cues and
the native text-component bound. The full-duration case retained 1,928 complete
fixture outcomes until the active deadline: the HUD displayed OFF elapsed
0..119 seconds and remaining 120..1 seconds, with one start marker and no
automatic advance. The unchanged primary analyser's **30/30 controls** pass;
constant, wrong-trend and marker-only fixtures cannot be promoted. Updated
first-advance/proposal checks pass **50/50**, including refusal of a different
reviewed build digest. These are device-free controls, not a second GTA test.

Windows refused foreground setup in earlier partial fixture attempts before
loading the ASI for those failed setup cases. The completed run uses a bounded
10-second owned-window wait before the same actual foreground guard. Normal
computer-use activation was directed only at the unique pending window of the
exact owned fixture executable, 47 times; no keyboard or mouse input was
requested. Pending titles disappear before callbacks. The intentional
wrong-foreground and foreground-loss cases were left untouched and pass. No
foreground reader was replaced, and no input, hook or native-resolution bypass
was added. Earlier partial receipts are preserved rather than reported as full
passes. The fixture's window setup is separate from the probe's unchanged
300-second waiting and 120-second capture limits. Reproduction requires actual
foreground ownership of each labelled pending fixture window within ten seconds
if Windows denies its ordinary activation; callbacks remain blocked until then.

Preparation requires matching build, complete fixture and analysis receipts,
current compiled-source hashes and
`-ReviewedBuildEvidenceSha256
08ec7ecf481af2d318f016a37486473e6d3129ea2895a96de26d8141abff1ea9`.
This binds the reviewed build evidence; it grants no deployment or launch
permission. The new manifests use `.local/playable-08/candidate-guided`, preserving
the consumed first proposal. Installation remains create-new, single-owned-ASI
only; rollback requires normal game exit and the exact new ownership/hash match.

The [final guided-candidate receipt](../evidence/playable-08-guided.json) binds
the build, fixture, analysis, 50-check readiness, narrow review and independent
preflight receipts. It confirms all 140 preserved files, 24 production-foundation
source pins, 11 protected files and four saved settings fingerprints still match.
No relevant process, destination/pending probe or timeout override remains.
The canonical installation manifest SHA-256 is
`8301f6296af197d96beb8b63c6cde068711345ae44aadaaceeb09c65d9643b20`;
rollback is
`8c79d8f3f56e61d902ca27b6861dfa5f2bad7273a2c18f5d76df28da096f346d`.
These historical preparation records preceded the separately granted and now
consumed guided approval. They grant no additional live run.

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

The restricted [telemetry acceptance](../evidence/playable-08-engine-state-acceptance.json)
clears only the reviewed signal-evidence stage for the exact scoped artifact.
It does not authenticate arbitrary JSON or grant consent, and a future trusted
composition must enforce its engine-running/player/model/build restrictions.
The [focused acceptance-gate controls](../evidence/playable-08-acceptance-gates.json)
use the actual accepted record to verify that all downstream features remain
blocked. No actual provider handoff or product activation is claimed.
No synthetic RPM, alternate hashes, memory scans or NFSgauge integration is used.

## Minimal handoff preparation and next independent milestone

See [the isolated handoff preparation](PLAYABLE_08_HANDOFF_PREPARATION.md).
The existing host already consumes a normalised operating point; no RPM
conversion or second scripting runtime is required. The next producer can reuse
the supported SHV call route while the RPH-side consumer keeps independent
vehicle observations. A changed provider artifact must be reviewed and tested
under its own digest rather than inheriting acceptance merely by its name.

The preparation validates candidate observations separately from transport,
rendering and deployment. It requires source/session/generation scope, exact raw
float bits, sequence, complete same-domain driver brackets, explicit bounded
source-to-host clock mapping/freshness and an independent vehicle-binding
witness. It never equates SHV and RPH native handles. Model and scalar speed
alone do not prove physical identity. Independently observed single-player
current-player-driver relationships with overlapping stable brackets may be a
correlation strategy, but actual authenticated composition and failure handling
must establish that witness in a separately approved live test.

The current diagnostic lacks that live channel and binding. An isolated
candidate validator cannot establish them, produce a gameplay frame or activate
audio. Handoff readiness remains false. The next independently verifiable
milestone is a separately reviewed, exact-artifact passive handoff test proving
identity correlation, clock alignment, stale/out-of-order rejection and
fail-closed behaviour. Playback remains disabled during that test; its producer
and runtime composition have not yet been built or approved.

The isolated C# implementation compiles with the existing x64 .NET Framework
C# 5 compiler and passes **68 cases / 250 assertions**, including full-interval
uncertainty/expiry, sequence/continuity, identity changes, exact float32 promotion
and permanent rejection retirement. Independent critical review passes. The
[preparation receipt](../evidence/playable-08-handoff-preparation.json) pins its
actual source, fixture, compiler and test binary. It is deliberately excluded
from the current host build and has no live capability issuer. Arrival validation
does not implement a missing-stream watchdog; a future consumer must enforce
candidate expiry on every use and separately prove bounded silence handling.

The practical primary path is the supported SHV native route for the restricted
observed engine-running scope. Unknown, invalid, stale or out-of-scope state must
retain stock fallback, without the broken RPH ratio, speed-derived RPM or
last-good substitution. Retain the
[upstream RPH report draft](UPSTREAM_RPH_ENGINE_TELEMETRY_REPORT.md) and recommend
authorised submission through the official maintainer channel with the new SHV
comparison evidence. No maintainer report has been submitted externally.

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

The historical [pre-authorisation offline feature receipt](../evidence/playable-08-offline.json),
[first diagnostic preflight](../evidence/playable-08-preflight.json) and
[recording evidence](../evidence/playable-08-recording.json) pin the actual
sources, artifacts, receipts and reviewed manifests.

| Component | Implemented/offline-tested | Live-qualified or production-ready? |
| --- | --- | --- |
| Unchanged SHV diagnostic | Original build and complete 48-case/51,703-assertion binary evidence reused; frozen analyser retained | Real PLAYABLE-07 and first PLAYABLE-08 data preserved; marked initial idle passes, full phase qualification incomplete |
| Guided HUD diagnostic | Separate 380,416-byte ASI; 48 genuine-binary fixture cases/53,747 assertions and 30 analysis controls pass | One authorised real capture: 1,633 observations and all seven primary criteria pass; restricted engine-running Bati signal accepted, then owned probe removed |
| First-advance observer/proposal | Updated 50 checks using actual ABI fixture records and labelled negative controls; terminal captures, stale/invalid input and wrong reviewed-build digest fail closed | First ADVANCE/IDLE independently confirmed in both actual08 attempts; readiness remains neither a driving interlock nor provider acceptance |
| Isolated handoff validator | Actual C# module compiles; 68 cases / 250 assertions and independent source review pass | Explicit offline composition only, outside product build; live source authentication, identity/clock mapping and silence watchdog remain unimplemented/unqualified |
| Loudness policy | 18 tests: 13 new policy cases plus five original pressure/source cases | Disabled, not wired to gameplay, modification reads and acoustic defaults unvalidated live |
| Recording/session/tap | Actual complete host compiles; 105 C# tests execute the real PCM fill path with fake renderer/loopback interfaces | Actual endpoint backend compiled only; no Windows endpoint, host or microphone started |
| Recording analysis | 17 known-signal/format/negative controls; bounded spectrum/envelope/correlation/index/event diagnostics | No real GTA recordings or audible-output acceptance; aligned stems and real clock mapping still required for conditional measurements |
| Production activation | 18 cross-stage/scope/session/fixture checks plus 11 focused controls using actual restricted acceptance | Telemetry evidence passes for its scope; handoff/playback/listening absent, requests false and every audio feature remains blocked; structural checks do not grant consent or authenticate arbitrary records |
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

The first attempt's independent preflight and rollback rechecked 11 protected runtime files, four saved
shortcut/settings fingerprints, 37 prior pins, 59 preserved PLAYABLE-07 files,
three frozen native-probe inputs and original/copied capture files. All match.
Stock fallback remains selected; probe/staging paths, timeout overrides and
relevant game/host/fixture/launcher processes are absent. No system software,
runtime, playback package or original recording was installed/replaced.

The consumed first attempt's private manifests remain under
`.local/playable-08/candidate`: installation, rollback, multi-state proposal and
preparation receipt. Its temporary target was only the reused ASI, staged with create-new semantics as
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

**GO for offline handoff preparation. BLOCKED for actual handoff activation and
playable/audio development until that separate live gate passes.** No further
telemetry diagnostic launch is proposed by this increment. Both approvals are
consumed. A future handoff deployment needs a concrete new artifact, offline
checks, installation/rollback plan and fresh explicit approval. Live production
PCM and human listening follow only after that handoff is independently
validated; loudness calibration and opt-in recording follow afterward.
