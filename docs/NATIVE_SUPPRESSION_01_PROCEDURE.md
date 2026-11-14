# NATIVE-SUPPRESSION-01 — proposed single live experiment

**This is a new approval scope. It has not been executed or approved.** I am being asked to approve one native-only experiment on two disposable Batis in offline Story Mode, using the finalized candidate under `.local/native-suppression-01/candidate-01`. The candidate's `scope.json` binds the committed source, installed destinations, original loader inventory, compiled DLL, private DLC and complete private update shadow. Its SHA-256 is supplied with the approval request. No PRIVATE03 approval carries forward.

## Actual intervention and bounds

The sole intervention is `FORCE_USE_AUDIO_GAME_OBJECT(ownedA, fixedName)` for the fixed sequence:

1. Observe stock A and unassigned same-model B, each running and driveable.
2. Request `ra_ns01_bati_a`: preserved PCM through the private idle branch.
3. Request `ra_ns01_bati_b`: original two-tone marker through that same branch (B1).
4. Only after positive activation evidence, request `ra_ns01_bati_c`: zero PCM through that same branch (C).
5. Request `ra_ns01_bati_b` again (B2).
6. Request `ra_ns01_bati_a` again, then `BATI` on the same surviving A. Record normal sound before deleting anything.

There are at most six normally sequenced assignments. F9, timeout or a fault can replace the remaining sequence with one known-baseline `BATI` release attempt. A setter that throws consumes its attempt; no same-phase retry is allowed. A phase refused before its last admission check may still use the separately scoped release path. The script cannot select arbitrary profiles, adopt existing vehicles or assign to B. No engine-state setter, replacement renderer, process/device mute, memory patch or custom native hook is included.

The experiment permits a partial silence interval on the selected idle wave. Other engine/exhaust/synthesis and environmental sounds are expected to remain. This scope grants no general engine-family suppression or future coverage test.

The script checks a fixed ten-minute active deadline from the spawn request. There is no extension or second pair in this run. Ten minutes is a callback-enforced experiment bound, not a promise through a stalled scheduler. I remain present and use normal game exit if callbacks, visibility or restoration fail. No deliberate crash or forced process termination is approved. The old horn procedure's notice deadlines and 80/100/140-second gates are explicitly replaced for this independent experiment; they are not silently relaxed during execution.

## Installation and rollback

Before installation, Codex must verify the exact finalized scope, clean committed source, game identity and required-absent destinations, and confirm that GTA is closed. Current preparation found `mods/update` and `scripts` absent and SHVDNE absent from the game root. A later difference requires review rather than overwriting it. Validate the root DLL/ASI inventory recorded in `scope.json`; any changed or extra loader/script requires review. Preserve the existing ASI-loader configuration, security settings, base archives, caches, acoustic engine and original RPH worktree.

The temporary installation is limited to:

| Destination relative to the game root | Source |
| --- | --- |
| `ScriptHookVDotNet.asi`, `ScriptHookVDotNet2.dll`, `ScriptHookVDotNet3.dll`, `MinHook.x64.dll`, `ScriptHookVDotNet.ini` | Retained reviewed SHVDNE v1.1.0.6 files, exact hashes in the scope |
| `scripts/RichAudio.NativeSuppression01.dll` | Final compiled idle experiment |
| `scripts/RichAudio.NativeSuppression01.ini` | Exact reviewed `Enabled=true` sidecar, staged separately from the disabled build default |
| `mods/update/x64/dlcpacks/ra_ns01_8b7e24c1/dlc.rpf` | New small private DLC |
| `mods/update/update.rpf` | Complete private shadow; only OPEN table representation and one appended private DLC-list declaration differ; all untouched members verified |

Temporarily park only the exact recorded `TrainerV.asi` outside the game root, then restore those same bytes after normal exit. Leave the reviewed OpenRPF 0.3, Script Hook V, XInput/DInput files, DirectStorageFix and Story startup helper unchanged. Do not launch RPH. No existing user vehicle or shared stock resource is modified. The original `update/update.rpf` is read-only throughout.

Snapshot the existing loader logs that this launch may update and preserve their originals for rollback. The candidate journal, video/audio and resulting loader logs are retained privately as new evidence, then the previous root logs are restored. Install with exclusive-create/absent-destination checks. Record copied hashes and created directories, and perform normal file rollback after GTA exits. Remove only verified candidate bytes and now-empty directories created by this attempt; if any path has changed unexpectedly, preserve it and report the conflict. Recheck the original Trainer/loader/base archive identities and required-absent destinations afterward. Rollback is disk cleanup, not native-audio restoration.

Launch through the normal reviewed offline Story Mode route once. Confirm fresh intended loader/SHVDNE startup and the visible `RA idle research` status. A contradictory loader result or absent script status ends the attempt without assignment. The private DLL remains `Enabled=false` outside the approved staged sidecar. SHVDNE's retained default reload key is Insert and console key is F4; neither is part of this test. Do not reload or abort the script during the experiment.

## Listening and recording

Use one quiet flat exterior, fixed game/audio settings, a steady camera/listening viewpoint and a continuous video plus game-audio recording. The existing OBS capture path may be used with reviewed settings; do not change the device mix or add RichAudio playback. Preserve the finalized raw recording. Narration/microphone, radio, music, traffic contamination, clipping, recorder automatic gain or changing output gain invalidate a quantitative segment. Record operating context and any remaining audible tails.

All commands use Ctrl+Shift. F5 creates A on my left and B on my right. Start and idle each by entering/driving normally; the script does not turn engines on or off. Record stock control B while seated in B, then leave it idling and enter A. At every profile change, A must be stationary with my ped driving and its engine running; B must also be alive, idling, empty and stationary. F6 arms the named next phase and F7 applies it within ten seconds. F8 logs speed, engine-running state, handle/token and horn readback; effective profile remains explicitly unknown.

At each phase, allow at least two seconds after the setter for previously emitted tails, then record a preselected ten-second steady-idle interval. Preserve all transition audio too. Do not change cuts after seeing the silence result. Remain stationary at the same A position and camera for the measured sequence. A brief normal low-speed operation check can be recorded outside the measured intervals after restoration; it is not an audio-identical comparison.

The preserve phase must remain compatible with stock behavior. During B1, I must hear/observe the new identifiable contribution on A. Finalize and extract the preserve/B1 intervals, run the fixed calibration below and retain its digest before applying C. If activation is missing, unstable, too quiet or out of range, stop with F9 and classify the observation as inconclusive; do not run a silent phase or retune the algorithm in this attempt. This is one engine-branch activation test, not a requirement for a separate horn experiment.

After successful B1 admission, record C and B2 in the same operating context, then preserve and stock restoration. For collateral evidence, keep B audibly active where practicable and separately re-enter/record B after A's release using the same control listening geometry as baseline. Record one unrelated native sound consistently before/after. If B was inactive, masked or differently situated, withhold an isolation conclusion. Do not claim that NPC control evidence alone qualifies every player path.

F9 stops/release-requests without deleting A. Listen to and record that same A while its handle/token remain valid. F10 is separate cleanup after dismount and stopping both vehicles. If restoration is unresolved or throws, preserve that failure and exit Story Mode normally; deleting A or ending the session is containment only. The experiment does not qualify crash recovery.

## Predeclared measurement and interpretation

The narrow analyser accepts finalized 48 kHz PCM16 mono/stereo WAV segments, two to thirty seconds; use the predetermined ten-second intervals here. It averages channel energy, uses nonoverlapping 8,192-sample Hann windows and searches only the predeclared 0.75–1.25 common pitch range of the 997/1499 Hz pair. B1 must contain both tones for at least 80% of complete windows, each at least 12 dB over its local spectral floor and 26 dB over the preserve baseline. The selected bin centers and ±2-bin bands are then frozen. No thresholds are adjusted after C.

From the repository, with the retained interpreter and finalized phase WAVs in the new evidence directory:

```powershell
& '.local/toolchains/private03f-01/python/python.exe' -I -S -B `
  tools/native-control/native-suppression01/Measure-IdleMarker01.py calibrate `
  --baseline <preserve.wav> --marker <B1.wav> --out <calibration.json>
```

Preserve the printed calibration SHA-256 independently before applying/analyzing C. After C/B2:

```powershell
& '.local/toolchains/private03f-01/python/python.exe' -I -S -B `
  tools/native-control/native-suppression01/Measure-IdleMarker01.py evaluate `
  --calibration <calibration.json> --sha256 <preserved-digest> `
  --suppressed <C.wav> --restored <B2.wav> --out <measurement.json>
```

For each frozen band, the measured C bound is the greater of C's mean band energy and twice baseline energy; no ambient subtraction is used. Both must be at least 20 dB below B1. Both B2 bands must return within 6 dB of B1 and satisfy sustained presence. The result is only `FIXED_BAND_SEQUENCE_MATCH`, with `native_suppression_proved:false`. This is a bound on recorded mean energy in these bands, not a statistical confidence interval, complete silence or direct voice measurement.

Native pitch migration could move the contribution outside those bands. The authored tests deliberately demonstrate this limitation. Video/context, listening and a full-spectrum review must exclude a shifted continuing marker, changed geometry/gain/operating state and unrelated sources before interpreting the fixed-band loss as suppression. If those alternatives cannot be excluded, retain an ambiguous result. B2 return strengthens causality but does not by itself exclude a temporary pitch change. Never infer total engine silence from this mixed recording.

M1/M2 require attributable activation and causal output change; M3 additionally requires the stated contribution bound, intact controls and excluded alternative explanations. M4 requires audible normal return on the same surviving vehicle. Neither native-call logs nor deletion establish M4. M5 controller/renderer failure recovery, M6 replacement integration and M7 coverage/mod compatibility/performance/release reliability are outside this run.

## What would falsify the mechanism

- A correctly observed marker remains through C at the same stable idle pitch and geometry: the proposed narrow suppression effect failed.
- B or unrelated audio changes with A's assignment: claimed isolation failed.
- Preserve/stock audio does not return on the same surviving A: normal restoration failed.
- No marker is detected after B1: private lookup or activation remains unresolved; silence is not interpretable and C is not admitted.
- A stops operating, a lifetime changes, or resources fail to mount: stop and retain the specific failure; no retry or different mechanism is authorized by this scope.

The fallback exhaust-pop experiment would require a new concrete scope. It is not silently substituted into this run.
