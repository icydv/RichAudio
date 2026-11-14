# Native idle test: preserve changed the sound

I ran candidate-04 once in offline Story Mode on 14 November 2026. Both Batis spawned. The single manual engine-start request established empty, running B, and B stayed running at every later readback. The test reached A's first private preserve assignment. I could then hear orange B but could no longer hear grey A. Codex stopped progression before B1 or C and directed the permitted BATI release. I heard normal native sound return on that same surviving A. Both bikes subsequently retired, and normal game/OBS exit and independently verified installation restoration completed.

This is an unexpected preserve result, not a successful test of the silent contribution. B1, C and B2 were never requested. No marker calibration or marker-based suppression verdict exists for this run.

## Audio and vehicle findings

| Observation | Result |
| --- | --- |
| Empty B idle | Passed the designated ten-second stability interval after the one F11 request. The two endpoint readbacks were 19.138 seconds apart, with B running and stationary at both. I heard B remain idling. |
| Private preserve | Failed the expected behavior check. My report was: “i hear the orange one, but the grey one i cant hear anymore”. Both engine-running readbacks remained true. |
| B1 activation | Not attempted after preserve failed. |
| Silent C | Not authorized separately or attempted. The selected contribution's suppression remains untested. |
| B2 return | Not attempted. |
| Same-A native return | I reported “Grey bike’s normal sound returned” after the permitted BATI release. The fixed recording interval and later running/stationary readback precede dismount and deletion. A retained handle 1794 and ownership token 949190434. This is an observed audible return, not proof of exact prior-profile restoration. |
| B comparison | I reported “Orange bike sounds unchanged”. B retained handle 2050, token 1573397770 and running/stationary readbacks, and received no profile assignment. Traffic and viewpoint differences prevent a quantitative claim that B's isolated output was unchanged. |
| Retirement | The corrected F10 path reached `ENDED` after existence checks. I saw both bikes disappear, and Codex's subsequent view confirmed their absence. |

The fixed mixed-signal stereo levels were:

| Window | RMS dBFS |
| --- | ---: |
| A stock | -46.50315 |
| Preserve | -52.69781 |
| BATI release | -46.45986 |
| Empty B stock | -44.46991 |
| Empty B after release | -46.78068 |

Preserve was 6.19466 dB below A stock in the recorded mix. BATI release was 6.23794 dB above preserve and 0.04329 dB above A stock. These are descriptive levels of mixed game audio, not the selected contribution's attenuation or a native voice measurement. Codex retained the full spectrum, seven broad frequency ranges, channel levels and one-second summaries; no clipping rails occurred in the selected WAVs. No fixed marker bands were used to infer suppression or exclude pitch migration.

## What happened

All times below are UTC. The journal is retained unchanged under the execution directory.

| Time | Event |
| --- | --- |
| 02:38:20.926 | Continuous OBS recording started. |
| 02:38:50.6585824 | One F5 spawn request; the 600-second active window began. |
| 02:38:50.7049767 | Private integer decorator registered; prior lock true, restored true, before spawning. |
| 02:40:12.2920635 | The single B engine-start request returned. This was followed by separate state/stability observations. |
| 02:40:20.8052775 | Designated stability start. B remained running at 02:40:39.9430767. |
| 02:42:37.5328711 | Fresh on-foot empty-B baseline anchor. A was off and B was on at both baseline endpoints. |
| 02:43:38.5541815 | A stock anchor. Both engines were on at both endpoints. |
| 02:44:54.0795026 | Preserve request returned on A. The later F8 still reported both engines on. |
| 02:45:50.5543628 | Manual F9 stopped progression and made the one permitted BATI release on the same A. |
| 02:46:13.1543701 | Both engines still on, with unchanged identities, after the audible-return recording. |
| 02:47:08.2925289 | B post-release anchor. A was off and empty B was on at both endpoints. |
| 02:47:46.4875462 | `ENDED`: both disposable vehicles removed. |
| 02:48:46.022 | Recording stopped after my normal game exit. |
| 02:50:20.0012831 | Enumerated disk rollback completed. |
| 02:52:33.9981384 | Independent restoration audit passed. |

There was one launch, one pair, one B-start request, one preserve assignment to A and one terminal BATI release to A. B received no profile assignment. No assignment retry, alternate profile, script reload, candidate patch, extra launch or forced termination occurred. Replacement playback stayed disabled. Fresh successful SHVDNE NativeMemory initialization and probe startup were checked before F5. The original decorator-lock value was restored before model creation; restoring the lock does not unregister the session-wide private name.

My first B-baseline completion reply arrived before the two expected F8 events. Codex observed that I was still at A and clarified the bike identities. I then moved behind orange B and completed the first actual anchored take. No existing cut was replaced or moved after hearing its result.

## Capture and interpretation limits

Each audio interval used the declared anchor plus five seconds, for ten seconds; stability used its designated B snapshot directly, with no offset. The six retained intervals end before 543 seconds from recording origin. Immutable live prefixes passed the unchanged extraction/timestamp checks. After finalization, all six WAVs/PCM and their retained audio/video timestamp prefixes reproduced exactly.

The finalized recording is 624.100 seconds because it includes retirement, normal exit and recorder finalization. The unchanged helper rejects a finalized container longer than 600 seconds, even when the requested interval is earlier. Codex retained that rejection and used a separately labeled, read-only forensic comparison of the already declared windows. This does not turn the rejected helper result into an admission pass, change a capture bound or extend the controller deadline. The active experiment had already stopped at F9 and both bikes retired before its 600-second deadline.

Adjacent-road traffic is visible in the recordings. The A-stock and preserve sampled framing matches closely, but release has a modest camera yaw change. The B baseline/post views differ in elevation, angle and apparent player placement. Sparse reviewed frames do not establish continuous scene cleanliness. My listening reports and endpoint engine checks are retained alongside these limitations; no isolated B amplitude or exact acoustic equivalence is claimed.

A's horn readback changed from `35963676` before release to `6ABC5E91` afterward, matching B's existing readback. This is not an effective audio-profile getter. The brief horn observations do not establish exact preservation of every native sound or recovery of an unknown earlier override.

The run tests the audible effect of requesting the private preserve name and subsequent BATI release. It rules out a setup refusal as the stopping point and provides no evidence that silent PCM failed: silent PCM was never selected. It does not distinguish a correctly resolved private graph with unexpected behavior from incomplete registration, unresolved references or another profile-selection failure. Wider coverage remains unjustified until private preserve behavior is understood.

## Provenance and restoration

The approved scope was `64efcd039abaf99250445489e69173186cbc6d8154c17524a480c379a6bbf4bb`, source `e112b892640f131ce8e658068389084e1ebc9dac` on `fix/native-idle-setup`, and probe DLL `270e7bc9541961cce88b264f0637108e97b1ccdcfe2f408ec8012abfc5e1d81f`. Codex verified the current clean source, the candidate's own build receipt, exact framework/resources and fresh installation prerequisites after my approval. Earlier probe binaries and consumed approvals were not substituted.

Evidence is retained at `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-04`. The finalized capture SHA-256 is `5af08092c7de40b7b82108dd02d8fe527b809301e818092854ef67e916c0771c`. The independent cleanup receipt is `cleanup-verification.json`, SHA-256 `68e5f3de7dd80f544def95f971929e2ea90f38df119493aaaaf57e375e141e04`.

The independent audit verified the original root binary inventory, base archives, Trainer and original settings/log bytes and metadata; all enumerated temporary paths were absent and game/recorder processes were closed. Raw logs, capture and temporary OBS serialization were retained before rollback. Disk restoration, audible return on A and vehicle retirement are three separate results, each recorded above. Candidates 01–04 and earlier executions remain preserved.

## Focused offline follow-up

After restoration, Codex checked the preserved graph and actual packed payloads. The existing resource readback passed 71 checks; all seven packed DLC files matched their retained counterparts. The preserve profile's private granular and player-sound hashes lead consistently to Channel4's private container/file and the AWC's masked stream ID. Preserve contains exactly the retained native idle PCM: 40,350 samples at 48 kHz, SHA-256 `7b0e711658549ac86ae3c25ccfe36c16d04e3192b62acea2acba7f0adadc0bee`. Its peak is 26,027 and 40,345 samples are nonzero. The review found no accidental zeroing, undeclared record change, broken reference name or contradictory record type. The codec checks do not establish GTA's runtime semantics for a granular sound that combines stock and private bank references.

An independent packed-manifest review found one appended private DLC-list entry, matching device/startup/enable paths and matching REL/wavepack members. The retained stock `mpbiker` manifests use the same startup registration pattern. OpenRPF appears in this launch's ASI-loader log, but no evidence directly establishes runtime mounting or complete resolution of this private chain. No specific resource or mount-metadata correction was demonstrated, so Codex made no speculative implementation change and rebuilt no audio resources.

The resource review is retained at `C:\Users\Libby\Documents\RichAudio-NativeSuppressionFixes\.local\native-suppression-fixes\preserve-resource-review-01\FINDINGS.md`, SHA-256 `97e0dbc6e6ec10a2971dc03626f500463d84ac6622053133f481bec9a5da0ca4`. Its binary, packed-chain and typed-flag receipts are alongside it. The independent mount review is `execution-04/analysis/mount-registration-review.json`, SHA-256 `03d5cbfe98e2f7dbb2871bdc5a0aa8e4d1e050863cb4ff63559a5292e77f5140`.

The single next suppression step is to distinguish private profile/REL resolution from relocated wavebank playback with an attributable preserve control. A private profile retaining stock references would be a narrower positive control than proceeding to silent C through this unresolved chain. That is a proposed diagnostic boundary, not a proven fix or an implemented replacement experiment. Wider engine/exhaust coverage is premature. This run's approval is consumed; no second live attempt, new scope, push, merge or release was performed.
