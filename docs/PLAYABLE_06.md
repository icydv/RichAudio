# PLAYABLE-06: operator-armed stable-idle qualification candidate

31 October 2026. Continues draft PR #76 on `feature/playable-01` from
`63b76557c27a4f40f0670af413ae896576b62097`.

**Live result: a separately approved operator-armed call returned raw
`0x3E4CCCCD`, float `0.200000003`, after the running/stationary gate passed.**
This establishes a credible nonzero provider candidate at one idle point.
**GO to propose separate multi-state qualification; RPM semantics, product
integration and playable development remain BLOCKED.** The one-launch approval
has been consumed and the temporary ASI removed.

## Preserved evidence and corrected trigger

[PLAYABLE-05](PLAYABLE_05.md) established real ASI loading, script execution and
one completed SHV invocation returning non-null storage containing zero. Both
captured engine-running queries were false. The later human idle confirmation
was not simultaneous. That zero remains inconclusive; it is not validated
engine-off telemetry, proof of a missing handler or a working RPM provider.
Its original compiled ASI, build receipts, captures and public evidence remain
preserved. No old RPH investigation or audio/PCM test was repeated.

The new probe removes automatic invocation on entering a Bati. It first shows
diagnostic readiness, waits for a deliberate operator action, then requires a
fresh bounded sequence of consistent idle-context observations. Human intent
cannot override a false game-context gate.

## Operator control and diagnostic status

The arming chord is **Ctrl+Shift+Backslash (`\`)**, after releasing the chord's
keys. Both documented backslash virtual-key variants, `VK_OEM_5` and
`VK_OEM_102`, are accepted. Repeats, held startup keys, missing modifiers,
unrelated keys and input outside the probe process's foreground context cannot
substitute for a fresh operator action. Keyboard-layout positions can differ.

The [shortcut review](../evidence/playable-06-keyboard-review.json) records the
inspected RPH, TrainerV, saved GTA controls and RichAudio settings fingerprints.
RPH uses F4; TrainerV uses F3/F4/F10; the current RichAudio shortcut is F10 and
the saved GTA character-wheel override is F11. Rockstar's
[PC controls guidance](https://www.rockstargames.com/newswire/article/51974aa3a724o2/rockstar-game-tips-tailoring-your-settings-and-controls-in)
reserves F5–F8 for character switching. The maintained
[default-control reference](https://docs.fivem.net/docs/game-references/controls/)
assigns F9/F10 to weapon/ammo controls and lists no backslash assignment. No
backslash assignment was found in the inspected local bindings. This is a
scoped conflict review, not a guarantee about every global hotkey or keyboard
layout. Live preflight must recheck the saved fingerprints.

Input uses the SDK's documented keyboard register/unregister callback, verified
against the [pinned author-credited header](https://github.com/scripthookvdotnet/scripthookvdotnet/blob/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/source/loader/sdk/inc/main.h#L63)
and exact installed exports. The callback only records atomic input state and
monotonic timing. It never invokes a native, writes a file, consumes a key,
installs a hook or changes a game control. All native calls remain in SHV's
registered script context. No RPH handle crosses this boundary.

Small diagnostic HUD text reports waiting/ready, checking the stable-state gate
and terminal outcome without the RichAudio host. It is separate from the product
menu. Before measurement, a detectable HUD fault fails closed. After result
capture, only the bounded diagnostic HUD may continue; there are no further
vehicle/context queries or target calls. A presentation failure cannot replace
an already captured value or promote it to valid RPM. Actual in-game readability
of the new HUD is unverified until a separately authorised live test.

## Stable-state gate and retained evidence

After a fresh arming action, the probe associates its monotonic timestamp with
the observed local-player/driver/Bati identity. The post-arm sequence requires:

- Offline Story Mode, no loading/player switch/pause, valid living player/ped
  and Bati, correct driver, same identity and foreground ownership.
- A true engine-running native observation on every accepted sample.
- Finite `GET_ENTITY_SPEED` in **0..0.10 m/s**, solely as a
  near-stationary tolerance. Negative finite speed magnitudes fail closed;
  speed is never converted into an engine value.
- At least **2,000 ms** of sampled stable context, nominal **100 ms** sample
  spacing, no observed gap above **250 ms**, and at most **25** gate samples.
- A **3,000 ms** post-arm limit, durable journal acknowledgement and immediate
  fresh revalidation before the target invocation.

A failed running, identity, stationary, offline, pause or foreground gate after
arming ends the attempt with **zero target calls**. It does not reset and try
again. A false engine-running signal despite operator arming is reported as a
context discrepancy, not a revolution-native failure. Human confirmation cannot
override it. Sampling cannot prove continuous state between observations;
the exact observation times and maximum gap remain part of the evidence.

The unchanged target identifier is `0xF9DDA40BC293A61E`, with at most one target
invocation per process. The first four result bytes are copied immediately
before any other native or yield. Null, raw zero, nonfinite values, suspicious
range, detectable SEH, timeout and unobserved outcomes retain explicit statuses.
No alternate hash, offset reader, memory scan, handler-address bypass, rescaling,
clamping, speed-derived RPM or throttle replacement is included.

The capture retains arming timing/identity, the actual bounded gate observations,
engine-running and raw speed context, final acquisition timing, target timing,
raw float bits and detectable faults. `measuredRPM` and `providerValid` remain
false for every outcome. A finite plausible nonzero value is candidate evidence
only; range, units and response across operating states still need qualification.

The acquisition deadline remains **300,000 ms from the first script callback**,
including loading and operator wait. A deadline-shortening environment override
is used by fixtures; production also reads it. Live preparation/preflight requires
it absent in the launcher's process/user/machine environments. It cannot shorten
the two-second gate or extend the session. A separate no-native/no-I/O watchdog
cancels future work. Terminal
HUD-only presentation is bounded to a further **5,000 ms**; it does not extend
the target/context deadline. Result publication precedes terminal presentation.
The combined private journal/capture byte budget remains **16,383 bytes**.

The watchdog cannot preempt a blocked native, contain every framework fatal
path, force a filesystem operation to finish or guarantee a HUD message. The
module stays process-pinned; rollback requires game exit. These are the same
fault/lifetime boundaries as the earlier probe, with new input/UI paths requiring
their own live qualification.

## Offline build, binary fixtures and ownership proposal

The existing signed Microsoft x64 toolchain and Windows SDK are used. No new
system software, runtime or SDK binary is installed. The new output directory
is `build/playable-06-shv-probe`; the previous `build/playable-04-shv-probe`
artifact/receipts and original public evidence are protected from overwriting.

Compiled file: `build/playable-06-shv-probe/RichAudio.OperatingState.Shv.asi`,
**323,584 bytes**, SHA-256
**`af860dc42540a94c2176ee0dce09c77d9c16c9eeea46a1572d5011aaa8863be4`**.
The [build receipt](../evidence/playable-06-build.json) records signed Microsoft
compiler/linker identities, SDK/toolset versions, source/header/library hashes,
the generated import library and static inspection. `/W4 /WX` compilation
passed. It is an AMD64 PE32+ native DLL with a backed executable entry point,
zero exports, no CLR metadata or delay imports, and the requested CFG/ASLR/NX
hardening. This is a compiled diagnostic, not a playable update.

The native DLL imports the six existing SHV script/native exports plus the two
published keyboard callback exports. Its only observational User32 calls are
the foreground-window/process readers. The updated static inspector retains an
explicit six-import PLAYABLE-04 profile and checks the new eight-import profile.
[Header provenance](../evidence/playable-06-header-provenance.json) and
[native contracts](../evidence/playable-06-native-contracts.json) record the
supported additions, including ordinary HUD text commands and speed's documented
metres-per-second quantity. No proprietary SDK import library is copied.

The fixture runs the actual production ASI against a clearly identified fake
SHV DLL. It invokes the published keyboard callback with synthetic events inside
the owned child process. It sends no global keystrokes and substitutes no system
DLL or production test hook. Foreground checks use an ordinary temporary fixture
window; denied activation or user focus changes fail the fixture rather than
being bypassed. The full two-second gate uses real monotonic time. Fake native
responses and HUD calls cannot establish actual game signal or visual behaviour.

[Fixture evidence](../evidence/playable-06-fixtures.json) records **1,280 passing
assertions across 37 cases** on the exact compiled ASI. Coverage includes both
backslash variants, missing/wrong/stale/held/repeated input, false/flapping
running state, changed vehicle identity, pause/focus loss, moving/negative/
nonfinite speed, final revalidation failure, timeouts, raw zero/nonfinite/null
results, detectable native/HUD faults, delayed calls and callback reentry.
Qualified fixture windows lasted at least **2,068.2504 ms** without shortening
the two-second gate. The largest combined capture/journal was **7,936 bytes**.
The durable pre-call journal retains the full compact gate sequence even when
the target outcome is subsequently unobserved. These are synthetic values from
the fake framework, not new live observations.

The [offline readiness record](../evidence/playable-06-offline.json) pins the
manifest hashes and unchanged installation/settings/shortcut evidence. Proposal
preparation also rejects partial fixture suites, pre-existing output, output in
the game folder and a shortened-deadline environment. No production audio source,
renderer, menu, gain, recording subsystem or installed game file was changed.

Reproduce from PowerShell 7:

```powershell
pwsh -NoProfile -File tools/Build-ShvTelemetryProbe.ps1
pwsh -NoProfile -File tools/Test-ShvTelemetryProbe.ps1
pwsh -NoProfile -File tools/Prepare-ShvProbe.ps1 -FixtureReceipt <printed-fixture-result.json>
```

Preparation requires the local reviewed shortcut fingerprints. It only creates
new installation/rollback/one-call proposal JSON; it does not deploy or launch.
The payload is still one uniquely owned `RichAudio.OperatingState.Shv.asi` in
the game root. Stage through the exact absent
`RichAudio.OperatingState.Shv.asi.playable06.pending` path using `CREATE_NEW`,
flush, verify length/hash, move
without overwrite, verify again and record ownership before any approved launch.
After normal exit, remove only the exact owned/hash-matched ASI/pending paths.
Refuse changed/unowned files. Never recursively delete, replace a runtime,
touch existing ASIs or remove captures. Recheck the 11 protected hashes, saved
stock-fallback settings and reviewed shortcut fingerprints.

## Approved one-launch procedure and actual result

After reviewing the exact candidate, manifests and offline checks, the user
separately authorised **one operator-armed live qualification**. Only the pinned
ASI was installed through the new pending path and ownership receipt, and the
existing RPH launch route was invoked once. In offline Story Mode the operator
reported arming once at stationary idle. Readiness text was visibly drawn in
GTA; its final chord word was truncated, so the full shortcut instruction in the
approved procedure remained necessary. No live code correction or retry was made.

[Sanitised live evidence](../evidence/playable-06-live.json) records:

| Observation | Actual result |
| --- | --- |
| ASI loading, script registration/callback | One each in the actual loader/SHV logs |
| Operator action | Accepted fresh callback action, associated with own player-driven Bati |
| Stable gate | 20 observations over **2.084065 s**, all engine-running raw `1` and same identity |
| Near-stationary speed | **0..0.00927900895 m/s**, below the 0.10 m/s gate tolerance |
| Maximum observed sample gap | **113.1492 ms**, below 250 ms |
| Durable pre-call evidence | All 20 actual samples flushed before permission; journal and final capture agree |
| Immediate final check | Running `1`, speed `0`, same Bati/driver; context ended **0.0009 ms** before target |
| Target | One invocation of `F9DDA40BC293A61E`, returned non-null readable storage |
| Raw result | **`0x3E4CCCCD`**, stored round-trip float **`0.200000003`** |
| Invocation window | **0.4274 ms**, at session **+61.9928881..+61.9933155 s** |
| Failure/deadline | No recorded exception or deadline; producer completed |
| Data volume | **8,103 bytes combined**, four journal stages, no unbounded per-frame output |

The operator callback was timestamped at session **+59.8851949 s**. That is the
SDK callback observation time, not hardware key-contact time. Human confirmation
was received after the call; the recorded arming event and contemporaneous game
observations establish the measured context rather than retrospectively changing
it. This is near-stationarity within the stated tolerance, not proof of exactly
zero physical motion throughout. No value was rescaled, clamped or inferred.

The normal-close action was requested through computer-use. A later input helper
reported a foreground-process-ID error at the closing-window boundary; no quit
dialog or completed confirmation is claimed. OS checks found game/RPH/host
processes and game windows gone, and SHV logged script unregistration. No forced
termination occurred. The exact owned/hash-matched ASI was removed after exit;
its pending path was absent. [Rollback verification](../evidence/playable-06-rollback.json)
records unchanged protected files, settings, shortcut files and preserved earlier
captures. No second launch, retry, further operating phase or audio test occurred.

This observation is materially stronger than PLAYABLE-05's zero with false
running context. It still does not establish a revolution-ratio range, units,
correct response over states, absolute crankshaft RPM or a product handoff. The
generic SHV API has no separate handler-resolution receipt; a plausible nonzero
point is candidate evidence, not a complete resolution/semantic proof. The
earlier zero is not retrospectively validated as engine-off telemetry. Prior RPH
failures and their unknown causes remain unchanged.

## Next separately authorised qualification

The nonzero idle candidate justifies proposing a separate, reviewed multi-state
probe. First design/build/fixture that candidate and its data/identity/deadline
controls, then obtain fresh approval for its exact artifact. A proposed initial
recording should remain read-only and telemetry-only, bounded to at most 120 s
and 2,400 observations, covering engine off, settled idle, stationary revving
where safely supported, acceleration and deceleration. Phase prompts must be
separate from achieved-state evidence; retain raw bits, running context, actual
timing, identity and missing/fault status. Do not map any value into physical RPM
without an established contract. No such candidate was implemented or authorised
here, and the one-call ASI must not be repurposed by repeated launches.

Zero despite corroborated running context would remain inconclusive and should
lead to framework/native-resolution clarification. A failed running gate is a
context failure. Repeated inconclusive results should be escalated to the
relevant maintainers rather than followed by indefinite retries, guessed hashes
or fabricated RPM. The existing upstream RPH draft remains unsubmitted.

The later recording requirement is preserved: once genuine live RichAudio
playback exists, synchronise RichAudio stereo PCM, Windows **WASAPI loopback**
mix and vehicle/audio-processing timestamps for automated discontinuity,
clipping, phase, dropout, spatial-movement and latency analysis, with optional
human listening. No part of that subsystem is implemented here.

## Supplied NFSgauge comparison

The user-supplied NFSgauge 2.7.0 archive was inspected statically, not installed
or executed. It contains a native SHV ASI, not a ScriptHookVDotNet script. The
author-linked reconstructed source uses executable signatures and vehicle memory
to obtain a normalized fraction, then scales it for a needle. Exact source-to-ASI
equivalence and Enhanced 1.0.1158.16 support remain unproved. The
[focused review](NSFGAUGE_TELEMETRY_REVIEW.md) records those boundaries and primary
sources. It supplies no verified replacement contract that warrants abandoning
the direct SHV candidate or introducing unsupported memory access. No code,
assets or runtime from the package were integrated.
