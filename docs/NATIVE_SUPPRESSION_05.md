# Make the private preserve path interpretable

Candidate-04 produced a reversible change in native audio, but its preserve control failed. I heard stock A normally, could no longer hear it after the private preserve request, and heard normal sound return after BATI on the same surviving vehicle. Both engine-running readbacks remained true. The fixed mixed recordings measured -46.50, -52.70 and -46.46 dBFS RMS respectively. Those observations justify investigating the private resource path; they do not establish intentional suppression of one idle contribution.

This work prepares one offline-qualified discriminator. It does not install anything, launch GTA, apply silence or claim runtime resolution. Candidate-04's scope, probe, packed resources, recording, extractor rejection and historical verdict remain unchanged.

Codex checked the retained recording without moving the original cuts. Every one-second preserve bin was quieter than every A-stock bin: -53.32 to -51.86 dBFS versus -46.80 to -46.22 dBFS. Retrospective one-second bins around the requests also show a sustained change and return, rather than a single brief transition dip. They are mixed recordings, not an A-only attenuation measurement or a latency measurement. The stock/preserve camera geometry closely matches; release has a modest yaw difference, the B views are less closely matched, and traffic remains a confound.

OBS reported an audio-buffer limit and desktop-audio restart about 78 seconds before recording began, with no further such warning during the recording. The complete encoded timestamps are continuous; that does not prove physical endpoint alignment. The retained loader and framework logs show initialization, not private REL/AWC resolution. Neither those logs nor the horn readback supplies the missing engine-graph evidence.

## Competing explanations

| Explanation | What the retained evidence says | What the new comparison can add |
| --- | --- | --- |
| Private vehicle profile did not register/resolve as intended | A returning native call does not identify the effective profile. Loaded OpenRPF is not proof that the private DLC or REL mounted. | D tests a private root with stock powertrain and a disjoint stock horn reference. A matching readback plus an attributable changed horn corroborates that root reference. S1 then uses entirely stock body references. |
| A private configuration or sound reference failed | The existing binary graph is internally consistent. Runtime reference resolution remains unproved. | S2 adds the necessary private graph while retaining the original bank/stream references. Failure at this point cannot require the private idle AWC. |
| The relocated bank/stream was unusable | Preserve PCM is nonzero and byte-identical to the retained native idle PCM. That alone does not establish bank loading, grain playback or cross-bank semantics. | Unchanged S3 follows S2. A new failure at S3 is consistent with the relocation boundary, subject to per-name selection/fallback and switching alternatives. |
| Profile switching or sound-object lifetime differs from the assumption | The recording shows a change after one setter and a return after BATI. It does not expose creation, retirement or persistence of native audio objects. | Keep the same pair, operating state and manual order. A name-specific or ordering-dependent result remains possible; do not invent waits, toggles, respawns or repeated setters to fix it. |
| Operating/capture context contributes | Road traffic and camera differences limit amplitude claims. Engine readbacks do not supply RPM or voice state. | Fixed windows, the same A viewpoint, a recorded empty-B baseline/post comparison and explicit context rejection preserve the useful comparison. No mixed recording yields precise A-only attenuation. |

No single root, child-graph or bank hypothesis is established as the cause. The strongest supported working category is an unresolved private-selection/resource/switching boundary: the change appeared after the private request and reversed through the stock name, while the recorded engines stayed running. This prioritizes a reference ladder over another setup correction or silent phase. The evidence does not justify ranking every mechanism within that category or excluding all operating/context effects.

## What the installed-byte comparison established

Codex followed candidate-04's installation ledger back to the exact packed DLC and update shadow. The original stock REL members were read from that retained shadow, checked against its sealed raw-member hashes and decoded with the existing disk codec. The retained XML reproduces the selected original binary record bodies exactly. This closes the distinction between examining an intermediate builder output and examining the installed chain; it does not add runtime resolution evidence.

The preserve root `7669511e` links to configuration `34b05488`, which links to player sound `926de8a9`. Against stock, the 292-byte Vehicle and 244-byte VehicleEngineGranular bodies change only their name-table bookkeeping and the intended child link. The 154-byte GranularSound body changes only the selected Channel4 container/file pair: stock `8b2bacbc` / `engine_idle` becomes `48fd2698` / `54b93e1a`. Other sound channels remain stock. Record identities, index entries, hash/pack offsets and container tables are recorded separately in the private control manifest, so equal typed fields are not presented as equal whole REL files.

The original bank has eight streams; the private preserve bank retains one renamed stream. Its five payload chunks—PCM data, format, peak, granular grains and granular loops—match the original selected idle stream byte for byte. It retains 40,350 samples at 48 kHz. The bank's stream count, identifiers, offsets and layout differ, and flags change from `0xff09` to `0xff01` by clearing the codec's `MultiChannelEncryptFlag` (`0x8`). Both decode with `MultiChannelFlag` false. The complete original bank context and private layout are retained; no guessed semantics are assigned to unknown fields. Equal payloads do not prove that GTA can use the relocated bank in this graph.

No concrete construction defect was demonstrated. The existing registration paths and packed members are consistent with their declarations, but actual mounting and cross-bank granular playback remain unproved. The correction is therefore a discriminating resource ladder, not an unsupported repair to the prior preserve bank.

## The smallest useful ladder

| Phase | New records and exact intended differences | Dependency deliberately excluded |
| --- | --- | --- |
| D, `ra_ns05_bati_select` | One private Bati Vehicle record. Its Horns reference changes from stock `F0760D26` to stock bus `98A97784`; its powertrain references remain stock. | No private granular configuration, player sound or wavebank. |
| S1, `ra_ns05_bati_s1` | One private Bati Vehicle record. Apart from identity/serialization bookkeeping, its entire body remains stock. | No additional private sound/configuration records or relocated bank. |
| S2, `ra_ns05_bati_s2` | A private Vehicle -> VehicleEngineGranular -> GranularSound chain. The player sound's original stock bank and stream references remain intact. | No private AWC dependency. |
| S3, `ra_ns01_bati_a` | The exact prior preserve graph and AWC, reused unchanged. | No new waveform or resource repair is claimed. |
| `BATI` | Existing known-stock baseline release on the same validated A. | No arbitrary-prior-profile recovery claim. |

S2 is necessary because S1 versus S3 alone would leave graph cloning and bank relocation combined. D is one small selection witness needed because stock-like S1/S2 output alone can be a no-op or fallback. It uses an existing stock resource, not another private marker bank. No larger variant family is constructed.

The Bati horn list contains both `35963676` and `6ABC5E91`, explaining why candidate-04's readback change is not independent evidence of a different root profile. The bus list contains six different members: `694D5709`, `1192FC24`, `C41CA5D0`, `F2127E37`, `5966E97F`, `4CE0745B`. D requires its post-request readback in that disjoint set and one brief audible A horn change, with normal Bati powertrain behavior. S1 requires the Bati set and normal horn to return. These observations corroborate the root-level changed reference; they do not create an effective-profile getter or prove the full engine graph resolved.

## How to interpret the next result

| Observation | Justified interpretation |
| --- | --- |
| D makes A quiet or its horn witness is absent/ambiguous | Stop and release. The relocated idle bank is not necessary for this failure because D never references it. Root selection, switching, and the altered stock horn child remain possible explanations. A normal-sounding no-op is not a selection pass. |
| D passes, then S1 fails | Stop and release. A name-specific root or switching problem remains; private granular/bank relocation is not needed to explain this point. |
| S1 passes, then S2 fails | Stop and release. The additional private graph/name resolution step is implicated relative to S1, with switching and per-name fallback alternatives retained. This is not evidence against silent PCM. |
| S2 passes, then S3 becomes quiet | Record the final diagnostic interval and release BATI. The relocation boundary becomes the leading comparison, but S2 could have fallen back and S3's separate root/name could fail; do not call this proven AWC failure or deliberate suppression. |
| All controls sound normal | The prior failure was not reproduced in this run. Stock-like behavior alone does not prove every private child resolved. No silent phase follows automatically. |
| BATI fails to return normal sound on the surviving A | Preserve the release failure separately. No repeated assignment or deletion-as-restoration claim. |

Normal D/S1/S2 behavior is a prerequisite for progressing, not a success label for production suppression. S3's possible quiet result is expressly admitted as the last diagnostic observation. B stays profile-unassigned and must remain empty, stationary and running. Its one deliberate engine-start setup remains recorded.

## Changes kept narrow

The controller changes only its fixed profile list. The observed on-foot check, decorator registration with original-lock restoration, pair identities, one-shot F11, final native admission checks, BATI release and pointer-backed deletion remain unchanged. Targeted tests cover the new order, A-only dispatch, rejection of historical B/C names, and a terminal one-time release after every diagnostic phase. The existing exact-SDK deletion result is reused only for its unchanged argument path.

The new resources add three vehicle records, one granular configuration and one player sound in two REL files. A new small DLC adds their registration entries while retaining the original five resource files. The existing pack/device/list entry and large shadow archive are reused. No stock archive or PCM is changed. Proprietary resources, packed archives, binaries and private evidence remain outside Git.

The capture correction separates three quantities: a 600-second active experiment, at most 60 seconds of pre-roll, and at most 120 seconds for normal closure. The total-container limit is 780 seconds/512 MiB, while every selected window must remain inside the unchanged active interval. Finalized mode checks the complete file; live-prefix mode retains the identity, timestamp and completed-window safeguards. Historical rejection remains a rejection. The current proposal uses no marker calibration, band-based suppression threshold or retuned spectral acceptance.

The exact phase gates, fixed anchors, normal exit and independently verified rollback are specified in `NATIVE_SUPPRESSION_05_PROCEDURE.md`. Another diagnostic requires at least 100 active seconds remaining, and terminal release must begin by active second 525 to preserve 75 seconds for release and the B comparison. Only the final bound scope may be submitted for one fresh live approval. No live authority is inferred from this offline preparation.
