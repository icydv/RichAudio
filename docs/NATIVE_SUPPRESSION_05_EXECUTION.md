# D changed the recorded mix but failed the selection witness

I approved one candidate-05 run on 14 November 2026, with scope SHA-256 `f9d05b4ed18c7c9d8bb531ea5fb4c00e05542700d8bff27b027a18040544cbba`. The run installed the existing candidate, launched GTA once through Steam into Story Mode, and stopped experimental progression after D. S1, S2 and S3 were not assigned. The one permitted BATI release returned normal engine sound and horn on the same surviving A. Both disposable bikes were then retired, GTA and OBS closed normally, and the installation was restored and independently verified.

The earliest observed change was associated with **D, the private vehicle root that retains stock powertrain references**. Its horn readback stayed in the stock Bati set rather than the disjoint donor set. I described a change in engine balance, without identifying a clearly changed donor horn. This failed the prepared D gate. It does not identify the effective private profile, prove that a private REL mounted, or establish deliberate native suppression.

The relocated preserve bank was never requested. This run therefore cannot diagnose S3's bank, qualify S1 or S2, or reproduce the earlier S3 result. It does show that a similar category of audible change can occur at the first private-root request without requiring a reference to that bank. Root lookup, mounting/registration, the assignment's switching behavior, the changed horn child and the sensitivity of the proposed horn witness remain unresolved alternatives.

## Exact candidate and admission

The source remained at `41be6326ca84db2ab07ff542fa6dae1551761389` during installation and the run. The probe SHA-256 was `0e2460d87bd519f2ee5305d5ab879b5d3945446c42bec95e5d97ea7aa8ee45da`; the DLC SHA-256 was `762ea39028579a9412aa995db275112bd536f0728645ae75018695037027490c`. Neither artifact was rebuilt or changed.

The fresh preflight checked 100 unique file identities, a clean source tree, the exact root DLL/ASI inventory, closed game/recorder processes and 19 required-absent paths. The sealed installer repeated its admission checks, exclusively created the nine game and two OBS files, backed up the enumerated originals and metadata, and parked Trainer last.

The current launch logged `NativeMemory took 6416 milliseconds`, followed by probe startup, with no intervening initialization failure or reload. F5 registered the integer decorator and recorded `priorLocked=True lockRestored=True` before spawning. A and B had distinct handles and tokens:

| Role | Handle | Token | Appearance |
| --- | --- | --- | --- |
| A | 1794 | 711195963 | Light bike, originally left |
| B | 2050 | 556526704 | Orange bike, originally right |

B received one manually requested engine start, with no profile assignment. Both engines reported running at the stability endpoints 17.865 seconds apart. Subsequent baseline snapshots recorded B running and A off while I stood behind B. I then entered A, started it normally, sounded the stock horn and recorded the fixed stock idle window. No A engine setter, second B start, extra pair, reload or second GTA launch occurred.

OBS initially opened hidden. The operator dismissed a duplicate-instance prompt without launching a second recorder instance, and I showed the existing window from its tray icon. This happened before recording and F5. After GTA's normal exit, the run stopped recording. The OBS menu did not accept automation reliably, so I completed File → Exit normally. Neither application was forcibly terminated.

## What ran

All times below are UTC, also local London time on this date. Active time begins at the single F5 spawn request at `21:49:41.1754340`.

| Event | UTC | Active seconds |
| --- | --- | ---: |
| D armed | 21:54:40.1597262 | 298.984 |
| D request returned | 21:54:49.5210366 | 308.346 |
| F9 BATI release returned | 21:56:15.7861396 | 394.611 |
| Both vehicles retired; ENDED | 21:58:09.5142318 | 508.339 |

D was admitted with more than 100 active seconds remaining. F7 followed F6 within the ten-second arm interval. Terminal release began well before second 525. Retirement completed before the 600-second active ceiling. The actual assignment sequence was **stock → D → terminal BATI release**.

| Stage | Observation and verdict |
| --- | --- |
| Stock A | I confirmed normal engine sound and horn. A's horn readback was `35963676`, in the stock Bati set. Both engines were running and both bikes stationary at the endpoint snapshots. |
| D: `ra_ns05_bati_select` | One A-only request returned. A's immediate and post-hold horn readbacks remained `35963676`; neither was in the bus donor set. Both engines still reported running. I said: “I heard a change, it sounded like a bike turned off or one got quieter and one got louder?” No clear donor-horn selection was established. **D failed; progression stopped.** |
| S1 | Not assigned. Stock preservation through this private name remains untested. |
| S2 | Not assigned. Private granular graph behavior with stock banks remains untested. |
| S3 | Not assigned. The earlier unexpected preserve quieting was not tested in this run. |
| BATI release | F9 dispatched the one allowed BATI release to the same validated A. I confirmed “A engine and horn sound normal again.” The later A horn readback was `6ABC5E91`, also in the stock Bati set. Both engines reported running. No assignment retry occurred. |
| B comparison | I confirmed B still sounded normal. B remained unassigned and running at the comparison endpoints; A was off as in the first B baseline. The visual match was imperfect, so this is a qualitative listening observation, not precise B amplitude preservation. |

## Fixed recording evidence

The raw recording is retained under `C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-05\capture\2026-11-14 21-49-30.mkv`. It is 585.266 seconds and 148,855,491 bytes, SHA-256 `0cf70fff098dc4d11829e85d3631dd2a653f104093ceb0f453fa8f7938cd1844`.

OBS recording origin was `21:49:30.814`; the fixed F5 offset was 10.361434 seconds. The anchors were declared before F5 and retained before analysis. No cut was moved and no replacement take was recorded.

| Window | Start from recording origin, seconds | Duration | Mixed stereo RMS, dBFS |
| --- | ---: | ---: | ---: |
| B stability | 129.5777109 | 10 | -47.55 |
| B baseline | 202.5700375 | 10 | -47.06 |
| Stock A | 265.6137393 | 10 | -46.71 |
| D | 323.7070366 | 10 | -49.23 |
| BATI release | 409.9721396 | 10 | -47.62 |
| B post-comparison | 477.8164846 | 10 | -46.92 |

The D mix is 2.52 dB below the stock-A mix; BATI is 1.61 dB above D and 0.91 dB below stock A. Those are descriptive mixed-signal differences, not A-only attenuation or an acoustic sound-pressure measurement. Every D one-second bin was below every stock-A bin, and every release bin was above every D bin. Traffic and the unisolated B contribution remain confounds. No marker detector, calibration, suppression threshold, filtering, gain change, pitch fit or deliberate-silence material was used.

The retained measurement includes each channel, every one-second bin and the full 0–24 kHz spectrum. Stock A, D and release had closely aligned camera/vehicle geometry, and sampled frames covering the two seconds before each fixed window show a stable seated view. The raw capture and context images remain available for review; journal timing locates events without proving sample-accurate physical AV alignment.

Two limitations became clear during offline review:

- The stability interval contains a brief near-silent dip: its seventh one-second bin is -115.27 dBFS. The engine-running readbacks at both ends and my report do not explain that dip. Its cause is undetermined. Continuous audible B stability is therefore not cleanly established by that recording. This was detected after the live run, not used to invent another setup take or extend progression.
- B's baseline and post-comparison views differ in camera framing and wheel visibility, with adjacent road traffic. My report that B sounded normal is retained, but precise B isolation or unchanged amplitude is not established.

The pinned extractor passed all six live-prefix windows and the complete finalized source. Full finalized decoding checked 27,430 audio frames and 17,557 video frames. Every fixed window reproduced exactly as PCM and WAV bytes. All audio timestamp prefixes and all video timestamps through the end of each used window matched the immutable live prefixes.

The stricter initial reproduction attempts are retained as failures. OBS finalization changed 174 bytes at file offsets 45–741. Several growing prefixes also decoded a different last video frame at their incomplete tail, after the used observation window. Whole-prefix raw-byte equality and whole-prefix video-timestamp equality were therefore false and are not claimed. The final review records these exact differences separately, validates the complete finalized timeline, and verifies the unchanged used intervals without retiming. The approved extractor and its policy were not modified.

## Offline source work

The implementation added [`Audit-SelectionPath05.ps1`](../tools/native-control/native-suppression05/Audit-SelectionPath05.ps1) and ran it against the installed-source ledger after independent restoration. It reads the exact retained DLC and update shadow using the pinned disk codec; it makes no game calls and creates no replacement candidate.

The audit establishes the following on disk:

- The shadow contains one exact `dlcpacks:/ra_ns01_8b7e24c1/` entry.
- `setup2.xml` connects `GROUP_STARTUP` to the content change set. That change set enables the declared `AUDIO_GAMEDATA` path, whose packed DAT151 contains D root `60279d09`.
- D and S1's 292-byte vehicle bodies differ only at offsets 16–19, the horn reference. D retains stock `Engine=A46D1B50` and `EngineGranular=61F3BD06`; its horn reference is the intended stock bus list `98A97784`.
- D does not introduce a private granular configuration, private player sound or relocated bank dependency. The journal contains one private D assignment and one terminal BATI release, with no S1/S2/S3 assignment.

This closes additional declaration and installed-source questions, but finds no demonstrated construction defect to repair. It does not establish that GTA opened the shadow's DLC list, mounted the pack, registered the REL, selected D's root, or resolved its stock children. An ASI-loader entry for OpenRPF does not establish those events. No per-pack resource-resolution log was produced.

The current [CitizenFX declaration for the setter](https://github.com/citizenfx/natives/blob/master/AUDIO/ForceUseAudioGameObject.md) describes a named vehicle-audio request. Its [horn getter declaration](https://github.com/citizenfx/natives/blob/master/AUDIO/GetVehicleDefaultHorn.md) promises a horn sound hash, without documenting that every forced audio-object switch must replace that hash from the requested root. These primary declarations do not independently qualify the proposed horn witness on this exact Enhanced build. The failed witness is a valid reason to stop the prepared experiment, but unchanged readback alone is not proof that D never resolved.

The next justified source focus is the unresolved **mount/registration/name-selection/switching boundary and the witness's sensitivity**, before attributing the behavior to granular-bank relocation or editing silent PCM. I have not approved a successor experiment here. No second launch, new candidate, loader change, hook, memory scan, silent phase, marker phase or unrelated experiment was introduced.

## Closure and retained results

Normal audible return, vehicle retirement, normal process closure and disk restoration were checked separately. The pointer-backed deletion reported both entities absent and ENDED; I confirmed both disappeared, and the run observed the cleared scene. The loader recorded normal script unregistration. I exited GTA and OBS normally.

The sealed rollback retained the journal, loader/framework logs, OBS log and temporary OBS serialization. Independent restoration verified 22 temporary paths absent, five original files' bytes and metadata restored, 52 original-file identities and the exact root DLL/ASI inventory. The original base and granular archives matched their approved hashes. The approved scope, probe and DLC remain unchanged.

The execution directory contains `approval.json`, `preflight.json`, `startup-gate.json`, `declared-window-rules.json`, `transaction.json`, `cleanup-verification.json`, `RESULT.json`, the raw capture and `retained-runtime/`. Its `analysis/` directory contains timing, fixed anchors, immutable live prefixes, extractor receipts, exact reproduced WAVs, full timestamps, spectra, context frames and the separate limitations. The installed-byte source audit is retained at `.local/native-suppression-05/selection-path-audit-01/result.json` in this worktree.

**Native audio suppression remains unqualified.** Candidate-05 supplied an earlier stopping point: the first private-root request already failed the intended behavior/selection gate, before S1, S2 or S3 could isolate later resource-chain stages.
