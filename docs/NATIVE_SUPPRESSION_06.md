# Check stock switching before private audio selection

Candidate-05 failed its predefined selection gate. That historical verdict remains unchanged. I heard a reversible change in engine balance, but the bus-horn signature was not established and the default-horn readback stayed in the Bati set. This does not prove that private loading failed. Candidate-04 and candidate-05 remain observations of reversible native-audio changes, with their original capture and attribution limits; neither is a qualified selective engine mute.

The [upstream setter declaration](https://github.com/citizenfx/natives/blob/master/AUDIO/ForceUseAudioGameObject.md) documents `void FORCE_USE_AUDIO_GAME_OBJECT(Vehicle, char*)` and a vehicle audio-name selection. It supplies no effective-object return value. The [horn getter declaration](https://github.com/citizenfx/natives/blob/master/AUDIO/GetVehicleDefaultHorn.md) documents a horn sound hash. It does not promise that a forced audio object must replace that hash. Candidate-06 therefore makes the horn getter auxiliary telemetry. An unchanged getter cannot reject independently attributable selection evidence, and stock-like output cannot establish a private lookup.

## The smallest useful comparison

The fixed setter sequence on the same disposable A is:

`BATI self-control → ADDER → BATI return → ra_ns06_adder_select → BATI final return`

The normal stock baseline precedes these five calls. B receives no profile assignment. Its existing one-shot manual engine-start setup, exact identity checks and separate empty-B comparison remain. There is no unknown-name assignment, S1/S2/S3, historical marker, silent C, engine toggle on A, replacement playback, respawn or extra vehicle model.

The first BATI call is deliberately included: it requests the already established baseline name once, to expose a generic reassignment transient or sustained disruption. It is not a tight loop. A sustained disruption or ambiguous steady result ends progression and uses the one permitted terminal BATI release. The first five seconds around a request are retained separately from the fixed steady observation. A successful self-control establishes only that this one reassignment preserved the admitted behavior in this context.

ADDER is the strongest available stock positive control here because there is relevant historical vehicle-specific evidence, an actual stock audio root, distinct engine/granular references and a different horn list. Codex read the actual retained installed shadow: the `adder` and `bati` model records both have an empty `audioNameHash` override. I am not describing a nonempty override that does not exist. The audio DAT151 itself contains the ADDER root at JOAAT `B779A091`, with `Engine=EF1B6A52`, `EngineGranular=FE2C005B`, player sound `F57247B7` and idle container `EC965264`. These differ from the Bati graph. `ADDER` is the existing audio-object name verified by that root, not a guessed display label. Its predicted engine/exhaust signature must become clearly attributable on A during the run; prior RPH evidence and offline references do not qualify current SHVDNE behavior.

The intermediate BATI return matters. It requires normal baseline behavior on the same A before the private request. The private discriminator is then compared from a re-established Bati state, rather than an ADDER state that an ignored request could leave unchanged.

## A private discriminator with two stock references

The original candidate-05 D and its assets stay unchanged. The new `ra_ns06_adder_select` root uses the **stock ADDER Vehicle body**, with only its private name/serialization bookkeeping and Horns reference changed. Its engine, exhaust and granular children remain the same original stock references as the ADDER positive control. Its horn child is the existing bus list `98A97784`.

This targeted resource change removes sole reliance on undocumented horn-switching behavior. After a clear ADDER positive and a clear BATI reset, either of the following can corroborate selection of a requested private root reference:

- A clearly attributable return of the previously observed ADDER engine/exhaust signature, beyond a level-only change, while the operating context remains valid.
- A clearly attributable physical bus-horn signature, with B empty and no masking horn source. If this witness activates but powertrain behavior is disrupted, the result is recorded separately as a private-reference witness plus unexpected powertrain behavior.

Neither route establishes every child graph or bank, an effective-profile getter, or selected-contribution suppression. A generic audible change, quietness, a small mixed-RMS difference, or stock-like output cannot attest the private result. If the predicted signature is absent or ambiguous, progression stops and BATI release is recorded.

The new root adds one small DAT151 member and one registration/enable entry in a separately built DLC. The old members, setup/device, large update shadow and waveforms are preserved. Unused historical resources still exist inside the inherited pack; the new controller cannot assign their names. No private wavebank or player-sound clone is introduced.

## Horn evidence and its limits

Bati's horn list is `F0760D26`, ADDER's is `F7725613`, and the private donor is the bus root's `98A97784`. The donor's six sound identities are disjoint from the Bati and ADDER list identities. Its reachable SimpleSound leaves point to the existing `RESIDENT/VEHICLES` bank, container `F205B596`. Codex checked their actual stock `vehicles.awc` streams and nonzero decoded PCM. The bus leaves also differ from the Bati horn wave references.

The bus list includes simple loud-category horns and composite/wrapper children, with original pitch, volume and repeat settings. Those settings are retained in the private evidence. Ordinary physical horn input is the proposed external stimulus. The runtime result still depends on player/bike routing, horn modifications, object lifetime and whether forcing an audio object affects the physical horn path. Manual activation and the default-horn getter are not assumed to consult identical state. A bus-like description by itself is insufficient when traffic could be responsible.

For that reason, each admitted A state has a separate horn cue and fixed event recording, while the engine-based ADDER comparison provides another private-reference discriminator. No horn is automatically triggered and no native horn-state reader is added.

## Controller changes and offline verification

`tools/native-control/native-suppression06/` contains a separate controller, probe and minimally changed native adapter. The original namespace is retained to reuse the existing decorator implementation; the new DLL is `RichAudio.NativeSuppression06.dll`, assembly version `0.6.0.0`, with its own INI and evidence basename.

The controller adds manual observation acknowledgements, a physical-horn cue, explicit request/dispatch-intent/return logging, the 100-second diagnostic admission gate, the 525-second terminal-release reserve and a release-outcome gate before deletion. A controller acknowledgement is a manual attestation of reviewed evidence, not automatic acoustic measurement. Rejected or missing evidence cannot silently advance the fixed phase list. The native adapter retains exact A ownership, B setup and pointer-backed deletion; the last callback still checks admission after native prerequisites and immediately before the setter. Aborts make no recovery native calls.

Targeted tests cover exact order, allowed and excluded names, A-only dispatch, lost lifetimes, one B start, missing/weak evidence, unchanged auxiliary getter behavior, operating-state failures, clock/journal changes at final admission, normal and uncertain releases and cleanup. The original decorator and native-adapter fixtures are reused in the new test executable. Real retained SDK tests execute the caller-owned pointer conversion without loading the game core or dispatching natives. A metadata-only inspector checks the actual new DLL, its version, order, compiled pins, single setter, typed SDK integer/string conversions and manual gates. Packed-resource tests compare the private body directly with the actual stock ADDER record and verify preservation of old payloads.

The build and final scope bind the committed source and actual artifacts. Offline checks establish these contracts only. They do not establish GTA compatibility, audibility, horn routing, pack mounting, native source lifetime or suppression.

## What the result can distinguish

| Observation | Supported direction |
| --- | --- |
| BATI self-assignment disrupts output | Generic switching/context effects can explain part of the earlier behavior. Stop before the alternate. |
| Self-control is steady, ADDER lacks its predicted attributable signature | Current native/name/operating behavior or an inadequate positive discriminator remains unresolved. Stop before private assignment. |
| ADDER works, same-A BATI reset works, private expected signatures fail | The private mount/registration/name/root/selection path becomes the narrower unresolved category; no particular missing file is proved. |
| Private expected signature appears while horn getter stays unchanged | The getter does not track that independently observed reference in this context. |
| Private bus horn appears with unexpected powertrain disruption | A root-associated stock reference was witnessed while other audio behaved unexpectedly. Investigate switching/lifetime/default/reference behavior next. |
| Context, audibility or capture is ambiguous | Retain the missing evidence and release; do not choose a convenient mechanism. |

These outcomes can overlap. There is no negative-name control and no runtime mount instrumentation, so a failed private signature cannot isolate a rejected lookup from a fallback, root-selection problem or switching behavior. Existing ASI/framework initialization logs are retained; they do not attest per-pack or per-REL registration. Any explicit resource error will be retained without treating a quiet log as mounting success.

Same-A normal BATI engine sound and horn are observed before retirement, with no release retry. A wrong or uncertain return is recorded as such; deletion and normal exit then provide containment. The exact live procedure is [NATIVE_SUPPRESSION_06_PROCEDURE.md](NATIVE_SUPPRESSION_06_PROCEDURE.md). This offline work authorizes no installation or GTA launch.
