# PLAYABLE-02: operating-state investigation and measured PCM stages

Follow-up: [PLAYABLE-03](PLAYABLE_03.md) compares the newer authentic SDK,
Enhanced-specific native provenance and maintained alternatives. The historical
measurements below are unchanged; provider qualification remains blocked.

31 October 2026. **Live vehicle-audio acceptance remains blocked.** Offline
validation was followed by one freshly authorised Story Mode session with two
separately authorised read-only captures. Both stopped on their first candidate
native invocation. RPH reported: `No natives with hash "F9DDA40BC293A61E" were found.`
No RichAudio host or audio endpoint started. GTA has exited, both temporary probes
are removed, and the installed configuration remains in stock fallback. There is
no corrected live provider or human-listening claim.

Work continues from `cb08f1df242cc2131db4b02031b2faa837e8de5e`, preserving
PLAYABLE-01. GitHub draft PR #76 actually uses `feature/playable-01`; the named
`feature/world-vehicle-integration-01` branch is its earlier source ancestor.
This update follows the actual PR head instead of moving that earlier checkout.

## What explains the value of 50?

The cause is still **unestablished**. The authentic pinned SDK declares
`float Vehicle.EngineRevolutionsRatio`, but its getter has RVA zero and no
executable instructions. It is a reference declaration, not the installed
implementation. Installed RPH matches the reviewed `1.132.1428.17748` fingerprint.
Normal reflection rejects its compressed metadata, and its bundled Cecil reader
returns an unusable zero-type result. Neither result exposes the getter body.
The installed RichAudio DLL calls the real float getter and widens it to double.
No scaling instruction explains the raw value. An outdated offset remains a
hypothesis, not a diagnosis. See [assembly evidence](../evidence/playable-02-provider-assembly.json)
and reproduce with `tools/Inspect-PlayableTelemetry.ps1`.

## Direct replacement candidate and its resolution failure

The sourced base-game `_GET_VEHICLE_CURRENT_REV_RATIO` native is
`0xF9DDA40BC293A61E`, returning `float(Vehicle)`. NativeDB and a published
game-script native table corroborate its provenance; script use of fractional
thresholds supports a normalized-ratio interpretation **as an inference**.
It is distinct from FiveM's CFX-only `GET_VEHICLE_CURRENT_RPM` extension.

This was a concrete alternative to measure, not a validated replacement.
The installed RPH native resolver could not find this hash on the actual target
build. No native ratio value was returned. This establishes failure through the
current framework interface; it does **not** prove the native is absent from GTA.
Its engine-off/idle semantics and response during throttle/gear transitions
therefore remain unverified.
Full immutable links and the alternatives comparison are in
[provider research](PLAYABLE_02_PROVIDER_RESEARCH.md).
The product capture still rejects invalid ratios without clamping, percentage
conversion, speed substitution or fabricated RPM. No alternate provider has
been enabled in gameplay before the required live evidence exists.

## Actual device-free component evidence

The actual `GameplayRuntime` supervisor, secured transport, verified decoded stock
registry, independent engine/exhaust playback, causal renderer, RA07 transport and
host native PCM ring passed **71 checks**. Only the GTA observations and final
device sink are substituted. Injected observations are not live engine evidence.

| Stage | Measured result in the reported active host |
| --- | --- |
| Contract-valid injected vehicle observations | 126 |
| Source instances successfully created | 4 across retirements |
| Engine source PCM | 635 nonzero vehicle blocks; peak 0.4479313 |
| Exhaust source PCM | 635 nonzero vehicle blocks; peak 0.8351120 |
| Acoustic path selection | 543 renderer blocks with selected paths |
| Post-propagation stereo | 549 nonzero renderer blocks; peak 0.1344739 |
| Actual host ring consumption | 730,560 frames; sum of squared samples 311.231819 |
| Underflows / clipping / limiting / missing history | 0 / 0 / 0 / 0 |
| Processing deadline misses / maximum | 2 / 22.6076 ms against a 10.6667 ms block budget |

These cumulative stage counters distinguish input validation, eligibility,
successful source creation, source playback, acoustic paths and final PCM.
Engine/exhaust block counts aggregate vehicle blocks; stereo counts renderer
blocks. They do not by themselves prove per-vehicle simultaneous output.
The focused one-Bati fixture separately requires both genuine source roles and
post-propagation stereo to be nonzero. The host reports actual consumed energy.
No WASAPI endpoint was opened, and these timings are CPU fixture measurements.
They do not establish live loaded/GPU deadlines or eliminate the two misses.

The same test verifies a 7.2-second observation gap becomes exact silence after
existing tails, does not restart the healthy host and resumes genuine PCM on
valid injected observations. Disable/re-enable, forced-host recovery, safe
shutdown and owned-process cleanup pass. No terminal failure was reported during
healthy operation; the host failure used by the recovery test is deliberate.

The focused Node suite passed **19 tests without skips**, covering genuine source
PCM stages, invalid `50`/nonfinite rejection, exact nine-player and Bati-NPC
mappings, continuous grain/chronology, distance behaviour and a separate causal
Doppler oracle. The genuine host fixture uses stationary observations; moving
GTA/camera behaviour remains unverified. The Doppler oracle uses an original
diagnostic signal, not a listening result or replacement product tone.
The authentic SDK product build also passes the compiled single-entry check.

No recordings, source control law, continuous read rates, original PCM histories,
engine/exhaust separation, GPU implementation, menu shortcuts/overlay, SoundMap,
installer or gain settings changed. The approved 10x exhaust balance and common
0.25 trim remain intact. A new ignored component-fixture package reuses all
verified private sources; its payload integrity is recorded in
[offline evidence](../evidence/playable-02-offline.json). It is not a revised
playable installer recommendation: the provider gate has not passed, so no
PLAYABLE-02 product installer/ZIP is presented as ready for installation.

## Authorised live measurements and exact blocker

`tools/Build-OperatingStateProbe.ps1` builds an isolated measurement plugin against
the authentic SDK. It is separate from the playable plugin and starts no audio
host. The concrete compiled artifact and its receipt stay in ignored
`build/operating-state-probe`. The read-only probe compares raw RPH ratio with
the sourced native revolution ratio, throttle and drive gear, plus independent
public engine/motion observations. It does not convert their units or send them
to the renderer. The initial tested probe and the diagnostic revision have separate
preparation receipts in [initial plan](../evidence/playable-02-probe-plan.json)
and [diagnostic plan](../evidence/playable-02-probe-plan-diagnostic.json).

One fixed 120-second capture requests six 20-second phases: engine off,
stationary idle, stationary throttle where supported, acceleration, visible gear
changes and deceleration. Phase labels describe requested actions; only observed
behaviour can establish what actually occurred. It samples only the current
player's Bati, at most 2,400 records, with monotonic acquisition bounds, lateness
and failure reporting. Private capture writing occurs outside the game fiber.
An independent watchdog requests stop by 150 seconds including readiness;
it cannot forcibly interrupt a stalled native/game thread. No vehicle setter,
spawn, control injection, raw memory reader or audio endpoint is part of it.

I explicitly authorised temporary probe deployment and one Story Mode
session, then separately authorised a diagnostic capture after the first probe's
exception message was found to be missing. The first RPH launch inherited the
desktop app's working directory and stopped at an installation dialog without
starting GTA. The existing launcher command then set the proper working directory
and started one actual game process. RPH freshly identified Enhanced 1158.16 and
automatically loaded the existing RichAudio plugin. Stock fallback and saved
settings stayed unchanged throughout. I prepared and operated the Bati;
the observer did not spawn, drive or change its engine state.

Both captures recorded one running player Bati observation, with RPH ratio
`50.000003814697266`, and stopped immediately at the native ratio call. The first
reported speed was zero; the diagnostic reported raw RPH speed 3.574620962.
These are individual readings, not a completed driving-state comparison. The
initial batch took 3.3293 ms. Its logger retained only the generic exception name.
The reviewed diagnostic revision added bounded private exception details and
proper JSON escaping, then obtained separate approval before execution. Its
4.4975 ms batch retained `System.Exception` with the exact resolver message above.
Neither attempt dropped a captured record. Throttle/drive-gear candidates were
skipped after the failure, and the six requested phases were not measured.
No further native call was attempted after the diagnostic result. The RPH ratio
remains out of contract, regardless of whether it correlates with engine state.

The diagnostic DLL is 19,968 bytes, SHA-256
`a34bdc8b05d870eef3f2a3f214a5a7b2774dd45346859bbfa8b5d67bc8c57f3e`.
It is an isolated diagnostic artifact, **not** an installable playable fix.
Raw local exception stacks/captures stay private; reviewed portable outcomes are
in [live evidence](../evidence/playable-02-live.json).

GTA exited normally within the independent 600-second session cap, without forced
termination. Both temporary DLLs were removed only after their ownership hashes
matched. All eleven recorded baseline files, including the existing plugin,
startup command and DirectStorage dependencies, still match; saved settings bytes
also match. No game/RPH/RichAudio host/GPU process remains. Normal game log/save
activity is outside this bounded installation-integrity claim.

The exact remaining blocker is an authentic, current-build-supported operating
state interface: the RPH property is invalid and the sourced native cannot be
resolved by this installed RPH interface. A maintained framework/native-resolution
fix or another authentic supported interface must establish the contract and
actual Bati behaviour before product integration. No guessed hash remapping,
offset reader, percentage conversion or plausible substitute is supplied.
There is no justification for a RichAudio listening attempt or a new playable
installer yet. Further deployment/measurement requires fresh authorisation.
After a trustworthy provider passes that gate, integrate it, rebuild and verify
the private playable installer, then request separate listening-test approval.
Native GTA engine audio remains independently active in additive mode. Citywide
geometry/reflections and all-vehicle support remain unfinished.
